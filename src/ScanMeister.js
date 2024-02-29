// Import modules
import fs from "fs-extra";
import osc from "osc";
import {Scanner} from './Scanner.js';
import {logInfo, logError, logWarn} from "./Logger.js"
import {Spawner} from "./Spawner.js";
import {config} from "../config/config.js";
import {hubs} from "../config/hubs.js";
import {scanners} from "../config/scanners.js";
import process from "node:process";
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

    logInfo(`Starting ${pkg.title} v${pkg.version} in '${config.get("operation.mode")}' mode...`);

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
    const shd = await this.#getScannerHardwareDescriptors();

    // Report number of scanners found
    if (shd.length === 0) {
      this.#scanners = [];
      logWarn("No scanners found.");
    } else if (shd.length === 1) {
      logInfo(`${shd.length} scanner has been detected. Retrieving details:`);
    } else {
      logInfo(`${shd.length} scanners have been detected. Retrieving details:`);
    }

    // Use the scanner hardware descriptors to build list of Scanner objects
    await this.#updateScannerList(shd);

    // Log scanner details to console
    this.scanners.forEach(device => {
      logInfo(`    Channel ${device.channel}. ${device.description}`, true);
    });

    this.#callbacks.onUsbAttach = this.#onUsbAttach.bind(this);
    usb.on("attach", this.#callbacks.onUsbAttach);

    this.#callbacks.onUsbDetach = this.#onUsbDetach.bind(this);
    usb.on("detach", this.#callbacks.onUsbDetach);

    // Report OSC status (we only report it after the scanners are ready because scanners use OSC)
    logInfo(
      `OSC ready. Listening on ` +
      config.get("osc.local.address") + ":" + config.get("osc.local.port")
    );

    // Send ready status via OSC
    this.sendOscMessage("/system/status", [{type: "i", value: 1}]);

  }

  #onUsbAttach(e) {
    logInfo(`Device attached to bus ${e.busNumber}, port ${e.portNumbers}`);
  }

  #onUsbDetach(e) {
    logInfo(`Device detached from bus ${e.busNumber}, port ${e.portNumbers}`);
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

  async #getScannerHardwareDescriptors() {

    // Call the "usb-devices" command to retrieve informationa about all USB-connected devices. To
    // see the tree of devices, do: lsusb -t
    const usbDevicesSpawner = new Spawner();
    let data;

    try {

      data = await new Promise((resolve, reject) => {
        usbDevicesSpawner.execute(
          "usb-devices", [], {sucessCallback: resolve, errorCallback: reject}
        );
      });

    } catch (e) {
      throw new Error("The usb-devices command did not return any data.");
    }

    return this.#parseUsbDevicesData(data);

  }

  #parseUsbDevicesData(data) {

    // Get device descriptors
    this.descriptors = this.getDescriptorsFromDataString(data);

    // Build a flat list of valid device identifiers
    const validScannerIDs = scanners.map(model => `${model.vendor}:${model.productId}`);

    // Only keep scanners listed in the device list (/config/scanners.js)
    const scannerDescriptors = this.descriptors.filter(d => {
      return validScannerIDs.includes(`${d.manufacturerId}:${d.modelId}`);
    });

    // Add additional information in the scanners array
    scannerDescriptors.forEach(scanner => {

      // System name (e.g. genesys:libusb:001:034)
      const model = this.getScannerModel(scanner.manufacturerId, scanner.modelId);
      const bus = scanner.bus.toString().padStart(3, '0');
      const number = scanner.number.toString().padStart(3, '0');
      scanner.systemName = `${model.driverPrefix}${bus}:${number}`;

      //
      scanner.bus = parseInt(bus);
      scanner.hub = this.getDescriptor(scanner.parent);
      scanner.ports = this.getUsbPortHierarchy(scanner);

      // If the manufacturer is not specified, fetch it from our own database
      if (!scanner.hub.manufacturer) {
        const h = hubs.find(hub => hub.vendorId === scanner.hub.manufacturerId);
        if (h) {
          scanner.hub.manufacturer = h.manufacturer;
        } else {
          scanner.hub.manufacturer = `Unknown manufacturer (${scanner.hub.manufacturerId})`;
        }
      }

      // If the model is not specified, fetch it from our own database
      if (!scanner.hub.model) {
        const h = hubs.find(hub => hub.productId === scanner.hub.modelId);
        if (h) {
          scanner.hub.model = h.model;
        } else {
          scanner.hub.model = `Unknown model (${scanner.hub.modelId})`;
        }
      }

    });

    return scannerDescriptors;

  }

  getUsbPortHierarchy(descriptor) {

    const hierarchy = [];

    // Device port
    hierarchy.unshift(descriptor.port);

    // Parent
    let parent = this.getDescriptor(descriptor.parent);
    hierarchy.unshift(parent.port);


    // Grand-parent (if present)
    if (parent.parent !== 0) {
      const grandParent = this.getDescriptor(parent.parent);
      hierarchy.unshift(grandParent.port)
    }

    return hierarchy;

  }

  getDescriptorsFromDataString(data) {

    // Split the long string received from usb-devices into discrete blocks for each device.
    // Doing so, we also replace the newlines by a token (NNNNN) for easier processing with
    // regex.
    const blocks = data.split('\n\n').map(item => item.replaceAll("\n", "NNNNN"));

    // Extract relevant data from each block and create description objects
    let re = /.*Bus=\s*(\d*).*Lev=\s*(\d*).*Prnt=\s*(\d*).*Port=\s*(\d*).*Cnt=\s*(\d*).*Dev#=\s*(\d*).*Vendor=(\S*).*ProdID=(\S*).*/
    let descriptors = blocks.map(b => {
      const match = b.match(re);
      const all = match[0];
      const bus = parseInt(match[1]);
      const level = parseInt(match[2]);
      const parent = parseInt(match[3]);
      const port = parseInt(match[4]);
      const container = parseInt(match[5]);
      const number = parseInt(match[6]);
      const manufacturerId = match[7];
      const modelId = match[8];
      return {all, bus, level, parent, port, container, number, manufacturerId, modelId};
    });

    // Check if manufacturer and product ID can be found for each device (not always the case)
    re = /.*Manufacturer=(.*?)NNN.*Product=(.*?)NNNNN/
    return descriptors.map(d => {
      const match = d.all.match(re);
      delete d.all;
      if (match) {
        d.manufacturer = match[1];
        d.model = match[2];
      }
      return d;
    });

  }

  getScannerModel(vendor, productId) {
    return scanners.find(model => model.vendor === vendor && model.productId === productId);
  }

  getHubModel(vendor, productId) {
    return hubs.find(model => model.vendor === vendor && model.productId === productId);
  }

  getDescriptor(number) {
    return this.descriptors.find(d => d.number === number);
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
