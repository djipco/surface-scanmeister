// Import Node.js modules
// import fs from "fs-extra";
import osc from "osc";
import process from "node:process";
import { readFile } from 'fs/promises';
import { usb } from 'usb';

// Import project classes
import {Configuration as config} from "../config/Configuration.js";
import {LightSensors} from "./LightSensors.js";
import {logInfo, logError, logWarn} from "./Logger.js"
import {Scanner} from './Scanner.js';
import {ScannerMappings} from "../config/ScannerMappings.js";
import {Server} from "./Server.js";
import {SupportedScanners} from "../config/SupportedScanners.js";
import {Spawner} from "./Spawner.js";

export default class App {

  // Valid OSC commands to respond to
  static OSC_COMMANDS = ["reboot"];

  // Termination signals to respond to
  static EXIT_SIGNALS = [
    "SIGINT",     // CTRL+C
    "SIGQUIT",    // Keyboard quit
    "SIGTERM",    // `kill` command
    "SIGHUP"      // Terminal window closed
  ];

  // Private variables
  #callbacks = {};
  #intervals = {};
  #oscPort;
  #scanners = [];
  #distanceSensorSpawner;
  #server = undefined;

  constructor() {}

  async start() {

    // Watch for quit signals
    this.#callbacks.onExitRequest = this.#onExitRequest.bind(this);
    App.EXIT_SIGNALS.forEach(s => process.on(s, this.#callbacks.onExitRequest));

    // Grab info from package.json
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

    // Log start details
    logInfo(`Starting ${pkg.title} v${pkg.version}...`);

    // Check platform
    if (process.platform !== "linux") {
      logError(`This platform (${process.platform}) is not supported.`);
      await this.quit(1);
      return;
    }

    // Set up OSC. This must be done before updating the scanners list because scanners need a
    // reference to the OSC object to send status.
    try {
      await this.setupOsc()
    } catch (e) {
      logError(e.message);
      await this.quit(1);
      return;
    }

    // Report OSC status (we only report it after the scanners are ready because scanners use OSC)
    logInfo(
      `OSC ready. Listening on ` +
      config.osc.localAddress + ":" + config.osc.localPort + ", sending to " +
      config.osc.remoteAddress + ":" + config.osc.remotePort + "."
    );

    // Update scanners list
    await this.#updateScanners();

    // Start HTTP server and call its start() method passing a reference to the list of available
    // scanners
    this.#server = new Server();
    this.#callbacks.onHttpServerError = this.#onHttpServerError.bind(this);
    this.#server.addListener("error", this.#callbacks.onHttpServerError);
    await this.#server.start(
      this.scanners,
      {address: config.httpServers.scannerApi.address, port: config.httpServers.scannerApi.port}
    );
    logInfo(
      `HTTP server ready. Listening on ` +
      `${config.httpServers.scannerApi.address}:${config.httpServers.scannerApi.port}.`
    );

    // Start sending OSC status messages (on a regular interval)
    this.#callbacks.onStatusInterval = this.#onStatusInterval.bind(this);
    this.#intervals.status = setInterval(this.#callbacks.onStatusInterval, 1000);

    // Add callbacks for USB hotplug events
    this.#callbacks.onUsbAttach = this.#onUsbAttach.bind(this);
    usb.on("attach", this.#callbacks.onUsbAttach);
    this.#callbacks.onUsbDetach = this.#onUsbDetach.bind(this);
    usb.on("detach", this.#callbacks.onUsbDetach);

    // Start background Python distance transmitter process
    // this.#activateDistanceSensors();
    await this.#activateLightSensors();

    // Quitting by closing the window is not a problem but it doesn't leave much time for logging
    // information to be written. In that sense, CTRL-C is better.
    logInfo("Press CTRL-C to properly exit.")

  }

  async #onHttpServerError(err) {
    logError(err);
    await this.quit(1);
  }

  #activateDistanceSensors() {

    const pins = config.sensors.pins.join(",")
    const gain = config.sensors.luminosityGain;

    logInfo(`Activating distance sensors on pin(s): ${pins}. Luminosity gain is set to: ${gain}`);

    this.#distanceSensorSpawner = new Spawner();

    this.#distanceSensorSpawner.execute(
      ". env/bin/activate; python externals/get_sensor_readings.py", // the "." replaces "source"
      [`--pins ${pins}`, `--gain ${gain}`],
      {
        detached: false,
        shell: true,
        errorCallback: this.#onDistanceSensorError.bind(this),
        stderrCallback: this.#onDistanceSensorError.bind(this),
        dataCallback: this.#onDistanceSensorData.bind(this)
      }
    );

  }

  async #activateLightSensors() {

    // Create object and start
    this.lightSensors = new LightSensors();
    await this.lightSensors.start();

    // Add callback
    this.#callbacks.onLightSensorsData = this.#onLightSensorsData.bind(this);
    this.lightSensors.addListener("data", this.#callbacks.onLightSensorsData);

  }

  #onLightSensorsData(data) {

    data.forEach((value, index) => {
      this.sendOscMessage(`/sensor/${index+1}/luminosity`, [{type: "f", value: value}]);
    });

  }

  #onDistanceSensorError(err) {

    // This error happens when two processes are trying to control the same GPIO pin. This may be
    // because a ghost process is still running. A reboot usaully fixes the problem.
    if (err.toString() === "'GPIO not allocated'") {
      logWarn("Distance sensors could not be activated " +
        "(a reboot of the Raspberry Pi should fix the issue).")
    } else {
      logError(err.toString());
    }

  }

  #onDistanceSensorData(data) {

    let [index, distance, luminosity] = data.toString().split(",", 3);
    index = parseInt(index);
    distance = parseInt(distance);
    luminosity = parseFloat(luminosity);

    // We check 'index' because the first time it is NaN
    if (!isNaN(index))
      this.sendOscMessage(`/sensor/${index}/distance`, [{type: "i", value: distance}]);

    if (! isNaN(index))
      this.sendOscMessage(`/sensor/${index}/luminosity`, [{type: "f", value: luminosity}]);

  }

  #onStatusInterval() {
    this.sendOscMessage("/system/status", [{type: "i", value: 1}]);
  }

  async #updateScanners() {

    // Stop in progress scans and destroy any previous scanner objects
    this.#scanners.forEach(async scanner => await scanner.destroy());
    this.#scanners.length = 0; // me must not destroy the reference

    // Retrieve list of objects describing scanner ports and device numbers
    const scannerDescriptors = this.getScannerDescriptors();

    // Create new scanner objects
    scannerDescriptors.forEach(descriptor => {
      this.#scanners.push(new Scanner(this.#oscPort, descriptor));
    });

    // Report number of scanners found
    if (this.scanners.length === 0) {
      logWarn("Updating scanners list... No scanners found.");
    } else if (this.scanners.length === 1) {
      logInfo(`Updating scanners list... One scanner detected:`);
    } else {
      logInfo(`Updating scanners list... ${this.scanners.length} scanners detected:`);
    }

    // Log scanner details to console
    this.scanners.forEach(scanner => {
      logInfo(
        `\tChannel ${scanner.channel.toString().padStart(2, " ")}. ${scanner.description}`,
        true
      );
    });

  }

  async #onUsbAttach(descriptor) {

    // Check if it is a supported scanner. If it is, rebuild scanner list of objects and report
    if (this.isSupportedScannerDescriptor(descriptor)) {
      logInfo(
        `Scanner attached to bus ${descriptor.busNumber}, ` +
        `port ${descriptor.portNumbers.join("-")}.`
      );
      await this.#updateScanners();
    }

  }

  async #onUsbDetach(descriptor) {

    // Check if it is a supported scanner. If it is, rebuild scanner list of objects and report
    if (this.isSupportedScannerDescriptor(descriptor)) {
      logInfo(
        `Scanner detached from bus ${descriptor.busNumber}, ` +
        `port ${descriptor.portNumbers.join("-")}.`
      );
      await this.#updateScanners();
    }

  }

  isSupportedScannerDescriptor(descriptor) {

    // Get flat list of supported scanners
    const identifiers = SupportedScanners.map(model => `${model.idVendor}:${model.idProduct}`);

    // Build id for current descriptor
    const idVendor = descriptor.deviceDescriptor.idVendor.toString(16).padStart(4, '0');
    const idProduct = descriptor.deviceDescriptor.idProduct.toString(16).padStart(4, '0');
    const id = `${idVendor}:${idProduct}`;

    // Check result
    return identifiers.includes(id);

  }

  getScannerDescriptors() {

    // Get all USB devices
    const descriptors = usb.getDeviceList();

    // Add top-level identifier using idVendor and idProduct (e.g. '04a9:2213')
    descriptors.forEach(device => {
      device.idVendor = device.deviceDescriptor.idVendor.toString(16).padStart(4, '0');
      device.idProduct = device.deviceDescriptor.idProduct.toString(16).padStart(4, '0');
      device.identifier = `${device.idVendor}:${device.idProduct}`;
    });

    // Filter the descriptors to retain only the ones for supported scanners
    // const identifiers = SupportedScanners.map(model => `${model.idVendor}:${model.idProduct}`);
    // let scannerDescriptors = descriptors.filter(dev => identifiers.includes(dev.identifier));
    let scannerDescriptors = descriptors.filter(dev => this.isSupportedScannerDescriptor(dev));

    // Assign additional useful information to scanner descriptors
    scannerDescriptors.forEach(scanner => {

      // Get scanner details from our own database
      const details = this.getScannerDetails(scanner.idVendor, scanner.idProduct);

      // System name (e.g. genesys:libusb:001:034)
      scanner.systemName = details.driverPrefix + scanner.busNumber.toString().padStart(3, '0') +
        ":" + scanner.deviceAddress.toString().padStart(3, '0');

      // Add vendor and product names
      scanner.vendor = details.vendor;
      scanner.product = details.product;

      // Hierarchy (prepended with bus number)
      scanner.hierarchy = [scanner.busNumber].concat(scanner.portNumbers).join("-");

    });

    // Sort scanner descriptors by bus and then by port hierarchy
    scannerDescriptors.sort((a, b) => {

      // If number of elements in portNumbers is smaller than 5, we left-pad the array with zeroes.
      // This allows comparing devices on hubs with both subgroups and without (up to 5 levels).
      const paddedA = Array(5 - a.portNumbers.length).fill(0).concat(a.portNumbers);
      const paddedB = Array(5 - b.portNumbers.length).fill(0).concat(b.portNumbers);

      // Prepend bus number to port hierarchy
      let hierarchyA = [a.busNumber].concat(paddedA);
      let hierarchyB = [b.busNumber].concat(paddedB);

      // Multiply the values of each level so they can be flattened and directly compared. By using
      // 32 as a base, we guarantee support for at least 32 end-level ports.
      hierarchyA = hierarchyA.map((val, i, arr) => val * (32 ** (arr.length - i)));
      hierarchyB = hierarchyB.map((val, i, arr) => val * (32 ** (arr.length - i)));

      // We add the multiplied levels and compare the two values
      const totalA = hierarchyA.reduce((t, v) => t + v);
      const totalB = hierarchyB.reduce((t, v) => t + v);

      return totalA - totalB;

    });

    // If a channel mapping has been defined, use it to assign channels. Otherwise, base the channel
    // number on the previous sort.
    if (config.devices.mapping) {

      logInfo(`Assigning channels according to map '${config.devices.mapping}'.`);

      const newList = [];
      const mapping = ScannerMappings[config.devices.mapping];

      Object.entries(mapping).forEach(([key, value]) => {
        const found = scannerDescriptors.find(s => s.hierarchy === key);
        if (found) {
          found.channel = value;
          newList.push(found);
        }
      });

      newList.sort((a, b) => a.channel - b.channel);
      scannerDescriptors = newList;

    } else {

      logInfo(`Assigning channels according to port hierarchy (no mapping used)`);
      scannerDescriptors.forEach((descriptor, index) => descriptor.channel = index + 1)

    }

    return scannerDescriptors;

  }

  async quit(status = 0, exit = true) {

    logInfo("Exiting...");

    if (this.lightSensors) {
      this.lightSensors.quit();
      this.lightSensors.removeListener("data", this.#callbacks.onLightSensorsData);
      this.#callbacks.onLightSensorsData = undefined;
    }
    logInfo("Exiting222...");

    // Kill distance sensor process
    if (this.#distanceSensorSpawner) await this.#distanceSensorSpawner.destroy();
    this.#distanceSensorSpawner = undefined;
    logInfo("Exiting333...");

    // Quit HTTP server
    if (this.#server) {
      await this.#server.quit();
      this.#server = undefined;
    }
    logInfo("Exiting444...");

    // Remove USB listeners
    usb.unrefHotplugEvents();
    this.#callbacks.onUsbAttach = undefined;
    this.#callbacks.onUsbDetach = undefined;

    logInfo("Exiting555...");
    // Remove termination listeners
    App.EXIT_SIGNALS.forEach(s => process.off(s, this.#callbacks.onExitRequest));

    // Destroy scanners and remove callbacks
    this.scanners.forEach(async device => await device.destroy());
    this.#removeOscCallbacks();
    logInfo("Exiting666...");

    // Send final notification and close OSC
    if (this.#oscPort && this.#oscPort.socket) {

      clearInterval(this.#intervals.status);
      this.#intervals.status = undefined;
      this.#callbacks.onStatusInterval = undefined;

      this.sendOscMessage("/system/status", [{type: "i", value: 0}]);
      await new Promise(resolve => setTimeout(resolve, 25));
      this.#oscPort.close();
      this.#oscPort = undefined;

    }
    logInfo("Exiting777...");

    // Exit
    if (exit) {
      setTimeout(() => process.exit(status), 100); // wait for log files to be written
    }

  }

  get scanners() {
    return this.#scanners;
  }

  async setupOsc() {

    // Instantiate OSC UDP port
    this.#oscPort = new osc.UDPPort({
      localAddress: config.osc.localAddress,
      localPort: config.osc.localPort,
      remoteAddress: config.osc.remoteAddress,
      remotePort: config.osc.remotePort,
      metadata: true
    });

    // If we get an error before OSC is "ready", there's no point in continuing. If we get the ready
    // event, we're good to go.
    this.#callbacks.onInitialOscError = async err => {

      if (err.code === "EADDRINUSE") {
        logError(
          `Unable to start OSC server. Network address already in use (${err.address}:${err.port})`
        );
      } else {
        logError(`Unable to start OSC server (${err})`);
      }

      await this.quit(1);
      return;

    };

    this.#oscPort.once("error", this.#callbacks.onInitialOscError);
    this.#oscPort.open();
    await new Promise(resolve => this.#oscPort.once("ready", resolve));
    this.#oscPort.off("error", this.#callbacks.onInitialOscError);
    this.#callbacks.onInitialOscError = undefined;

    // Now that OSC is ready, add callbacks for inbound messages (must be done before creating
    // scanner objects)
    this.#callbacks.onOscError = this.#onOscError.bind(this);
    this.#oscPort.on("error", this.#callbacks.onOscError);
    this.#callbacks.onOscMessage = this.#onOscMessage.bind(this);
    this.#oscPort.on("message", this.#callbacks.onOscMessage);

  }

  sendOscMessage(address, args = []) {
    if (!this.#oscPort || !this.#oscPort.socket) {
      logWarn("Impossible to send OSC, no socket available.")
      return;
    }
    this.#oscPort.send({address: address, args: args});
  }

  async #onExitRequest(signal) {
    logInfo(`Termination signal received: ${signal}`);
    await this.quit();
  }

  getScannerDetails(idVendor, idProduct) {
    return SupportedScanners.find(model => model.idVendor === idVendor && model.idProduct === idProduct);
  }

  async #onOscError(error) {
    logWarn(error);
  }

  #removeOscCallbacks() {

    if (this.#oscPort) {

      if (this.#callbacks.onOscError) {
        this.#oscPort.off("error", this.#callbacks.onOscError);
      }
      this.#callbacks.onOscError = null;

      if (this.#callbacks.onOscMessage) {
        this.#oscPort.off("message", this.#callbacks.onOscMessage);
      }
      this.#callbacks.onOscMessage = null;

      if (this.#callbacks.onOscBundle) {
        this.#oscPort.off("bundle", this.#callbacks.onOscBundle);
      }
      this.#callbacks.onOscBundle = null;

    }

  }

  getScannerByChannel(channel) {
    return this.#scanners.find(scanner => scanner.channel === channel);
  }

  async #onOscMessage(message) {

    const segments = message.address.split("/").slice(1);

    // Filter out invalid commands
    const command = segments[0].toLowerCase()
    if (!App.OSC_COMMANDS.includes(command)) {
      logWarn(`Invalid OSC command received (${command}).`)
      return;
    }

    // Execute command
    if (command === "reboot") {

      logInfo("Reboot requested by remote...");

      // Call quit without actually exiting the Node.js process (this will be forced by reboot)
      await this.quit(0, false);
      const spawner = new Spawner();
      spawner.execute("reboot");

    }

  }

}
