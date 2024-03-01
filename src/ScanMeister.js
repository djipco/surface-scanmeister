// Import modules
import fs from "fs-extra";
import osc from "osc";
import {Scanner} from './Scanner.js';
import {logInfo, logError, logWarn} from "./Logger.js"
import {config} from "../config/config.js";
import process from "node:process";
import {ScannerMappings} from "../config/ScannerMappings.js";
import {SupportedScanners} from "../config/SupportedScanners.js";
import { usb } from 'usb';
import { readFile } from 'fs/promises';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

export default class ScanMeister {

  #callbacks = {}
  #oscCommands = ["scan"];
  #oscPort;
  #scanners = [];

  constructor() {}

  async start() {

    // Watch for quit signals
    this.#callbacks.onExitRequest = this.#onExitRequest.bind(this);
    process.on("SIGINT", this.#callbacks.onExitRequest);               // CTRL+C
    process.on("SIGQUIT", this.#callbacks.onExitRequest);              // Keyboard quit
    process.on("SIGTERM", this.#callbacks.onExitRequest);              // `kill` command

    // Log start details
    logInfo(`Starting ${pkg.title} v${pkg.version} in '${config.get("operation.mode")}' mode...`);
    if (config.get("operation.mode") === "tcp"){
      logInfo(`Sendind images to ${config.get("tcp.address")}:${config.get("tcp.port")}.`);
    } else if (config.get("operation.mode") === "file") {
      logInfo(`Saving images to '${config.get("paths.scanDir")}'.`);
    }

    // Check platform
    if (process.platform !== "linux") {
      logError(`This platform (${process.platform}) is not supported.`);
      logInfo("Exiting...");
      setTimeout(() => process.exit(1), 500); // wait for log files to be written
      return;
    }

    // Check if the directory to save images in can be found (in "file" mode)
    try {
      await fs.ensureDir(config.get("paths.scansDir"))
    } catch (err) {
      logError(
        `The directory to save images in cannot be created (${config.get("paths.scansDir")})`
      );
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

    // Retrieve list of objects describing scanner ports and device numbers
    const scannerDescriptors = this.getScannerDescriptors();

    // Create all scanner objects
    scannerDescriptors.forEach(descriptor => {
      this.#scanners.push(new Scanner(this.#oscPort, descriptor));
    });

    // Report number of scanners found
    if (this.scanners.length === 0) {
      logWarn("No scanners found.");
    } else if (this.scanners.length === 1) {
      logInfo(`One scanner detected:`);
    } else {
      logInfo(`${this.scanners.length} scanners detected:`);
    }

    // Log scanner details to console
    this.scanners.forEach(scanner => {
      logInfo(`    Channel ${scanner.channel.padStart(2, " ")}. ${scanner.description}`, true);
    });

    // Add callbacks for USB hotplug events
    this.#callbacks.onUsbAttach = this.#onUsbAttach.bind(this);
    usb.on("attach", this.#callbacks.onUsbAttach);

    this.#callbacks.onUsbDetach = this.#onUsbDetach.bind(this);
    usb.on("detach", this.#callbacks.onUsbDetach);

    // Report OSC status (we only report it after the scanners are ready because scanners use OSC)
    logInfo(
      `OSC ready. Listening on ` +
      config.get("osc.local.address") + ":" + config.get("osc.local.port") + ", sending to " +
      config.get("osc.remote.address") + ":" + config.get("osc.remote.port") + "."
    );

    // Send ready status via OSC
    this.sendOscMessage("/system/status", [{type: "i", value: 1}]);

  }

  #onUsbAttach(e) {
    logInfo(`Device attached to bus ${e.busNumber}, port ${e.portNumbers.join("-")}.`);
  }

  #onUsbDetach(e) {
    logInfo(`Device detached from bus ${e.busNumber}, port ${e.portNumbers.join("-")}.`);
  }

  getScannerDescriptors() {

    // Get all USB devices
    const descriptors = usb.getDeviceList();

    // Add top-level identifier for vendor and product id
    descriptors.forEach(device => {
      device.idVendor = device.deviceDescriptor.idVendor.toString(16).padStart(4, '0');
      device.idProduct = device.deviceDescriptor.idProduct.toString(16).padStart(4, '0');
      device.identifier = `${device.idVendor}:${device.idProduct}`;
    });

    // Filter the devices to retain only supported scanners
    const identifiers = SupportedScanners.map(model => `${model.idVendor}:${model.idProduct}`);
    let scannerDescriptors = descriptors.filter(dev => identifiers.includes(dev.identifier));

    // Assign additional information to scanner descriptors
    scannerDescriptors.forEach((scanner, index) => {

      // Channel the scanner will be tied to
      scanner.channel = index + 1

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

      // Prepend hub number to the port hierarchy
      let arrayA = [a.busNumber].concat(a.portNumbers);
      let arrayB = [b.busNumber].concat(b.portNumbers);

      // Multiply the values of each level so they can be flattened and compared. By using 32, we
      // guarantee support for at least 32 end-level ports.
      arrayA = arrayA.map((val, i, arr) => val * (32 ** (arr.length - i)));
      arrayB = arrayB.map((val, i, arr) => val * (32 ** (arr.length - i)));

      // We add the multiplied levels and compare the two values
      const totalA = arrayA.reduce((t, v) => t + v);
      const totalB = arrayB.reduce((t, v) => t + v);
      return totalA - totalB;

    });

    // If a mapping has been defined, override the default channel assignments and use the mapping
    // instead.
    if (config.get("devices.scannerMapping")) {

      const newList = [];
      const mapping = ScannerMappings[config.get("devices.scannerMapping")];

      Object.entries(mapping).forEach(([key, value]) => {
        const found = scannerDescriptors.find(s => s.hierarchy === key);
        if (found) {
          found.channel = value;
          newList.push(found);
        }
      });

      newList.sort((a, b) => a.channel - b.channel);
      scannerDescriptors = newList;

    }

    return scannerDescriptors;

  }

  async #updateScannerList(deviceDescriptors) {

    this.#scanners = [];

    deviceDescriptors.forEach(descriptor => {
      this.#scanners.push(new Scanner(this.#oscPort, descriptor));
    });

    // Sort by bus and then by port hierarchy
    this.#scanners.sort((a, b) => {

      const arrayA = [a.bus].concat(a.ports);
      arrayA.map((p, i, arr) => p = 32 ** (arr.length - i) * p);
      const totalA = a.ports.reduce((t, v) => t + v);

      const arrayB = [b.bus].concat(b.ports);
      arrayB.map((p, i, arr) => p = 32 ** (arr.length - i) * p);
      const totalB = b.ports.reduce((t, v) => t + v);

      return totalA - totalB;

    });

    // Assign desired channels to scanners
    this.scanners.forEach((scanner, index) => scanner.channel = index + 1);

  }

  async quit(status = 0) {

    logInfo("Exiting...");

    // Remove USB listeners
    usb.unrefHotplugEvents();
    this.#callbacks.onUsbAttach = undefined;
    this.#callbacks.onUsbDetach = undefined;

    // usb.off("attach", this.#callbacks.onUsbAttach);
    // usb.off("detach", this.#callbacks.onUsbDetach);

    // Remove quit listeners
    process.off("SIGINT", this.#callbacks.onExitRequest);       // CTRL+C
    process.off("SIGQUIT", this.#callbacks.onExitRequest);      // Keyboard quit
    process.off("SIGTERM", this.#callbacks.onExitRequest);      // `kill` command

    // Destroy scanners and remove callbacks
    this.scanners.forEach(async device => await device.destroy());
    this.#removeOscCallbacks();

    // Send notification and close OSC
    if (this.#oscPort && this.#oscPort.socket) {
      this.sendOscMessage("/system/status", [{type: "i", value: 0}]);
      await new Promise(resolve => setTimeout(resolve, 25));
      this.#oscPort.close();
      this.#oscPort = null;
    }

    // Exit
    process.exit(status);

  }

  get scanners() {
    return this.#scanners;
  }

  get oscCommands() {
    return this.#oscCommands;
  }

  async setupOsc() {

    // Instantiate OSC UDP port
    this.#oscPort = new osc.UDPPort({
      localAddress: config.get("osc.local.address"),
      localPort: config.get("osc.local.port"),
      remoteAddress: config.get("osc.remote.address"),
      remotePort: config.get("osc.remote.port"),
      metadata: true
    });

    // If we get an error before OSC is "ready", there's no point in continuing. If we get the ready
    // event, we're good to go.
    this.#callbacks.onInitialOscError = err => {

      if (err.code === "EADDRINUSE") {
        throw new Error(
          `Unable to start OSC server. Network address already in use (${err.address}:${err.port})`
        )
      } else {
        throw new Error(`Unable to start OSC server (${err})`)
      }

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
    if (!this.#oscPort.socket) {
      logWarn("Impossible to send OSC, no socket available.")
      return;
    }
    this.#oscPort.send({address: address, args: args});
  }

  async #onExitRequest() {
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

  #onOscMessage(message) {

    const segments = message.address.split("/").slice(1);

    // Filter out invalid commands
    const command = segments[0].toLowerCase()
    if (!this.oscCommands.includes(command)) return;

    // Fetch device index
    const channel = parseInt(segments[1]);

    // Execute command
    if (command === "scan") {

      // Find scanner by port
      const scanner = this.getScannerByChannel(channel);
      if (!scanner) {
        logWarn(
          "Unable to execute OSC command: no device tied to requested channel (" +
          message.address + ")."
        );
        return;
      }

      const options = {
        outputFile: config.get("paths.scansDir") + `/scanner${channel}.png`
      }
      scanner.scan(options);

    }

  }

}
