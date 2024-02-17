// Import modules
import osc from "osc";
import SambaClient from "samba-client";
import {Scanner} from './Scanner.js';
import {logInfo, logError, logWarn} from "./Logger.js"
import {Spawner} from "./Spawner.js";
import {config} from "../config/config.js";
import {hubs} from "../config/hubs.js";
import {models} from "../config/models.js";
import {credentials} from "../config/credentials.js";
import process from "node:process";
import { readFile } from 'fs/promises';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

export default class ScanMeister {

  #callbacks = {}
  #oscCommands = ["scan"];
  #oscPort;
  #scanners = [];
  #smbClient;

  constructor() {}

  async start() {

    // Watch for quit signals
    this.#callbacks.onExitRequest = this.#onExitRequest.bind(this);
    process.on("SIGINT", this.#callbacks.onExitRequest);               // CTRL+C
    process.on("SIGQUIT", this.#callbacks.onExitRequest);              // Keyboard quit
    process.on("SIGTERM", this.#callbacks.onExitRequest);              // `kill` command

    logInfo(`Starting ${pkg.title} v${pkg.version}...`);

    // Check platform
    if (process.platform !== "linux") {
      logError(`This platform (${process.platform}) is not supported.`);
      logInfo("Exiting...");
      setTimeout(() => process.exit(1), 500); // wait for log files to be written
    }

    // Set up OSC (mandatory)
    try {
      this.setupOsc()
    } catch (e) {
      logError(e.message);
      await this.quit(1);
      return;
    }

    // Set up SMB (if necessary)
    if (config.get("operation.mode") == "smb") {
      try {
        await this.setupSmb();
      } catch (e) {
        logWarn(e.message);
      }
    }

    // Retrieve list of objects describing scanner ports and device numbers
    const shd = await this.#getScannerHardwareDescriptors();

    // Report number of scanners found
    if (Object.entries(shd).length === 0) {
      this.#scanners = [];
      logWarn("No scanners found.");
    } else if (Object.entries(shd).length === 1) {
      logInfo(`${Object.entries(shd).length} scanner has been detected. Retrieving details:`);
    } else {
      logInfo(`${Object.entries(shd).length} scanners have been detected. Retrieving details:`);
    }

    // Use the scanner hardware descriptors to build list of Scanner objects
    await this.#updateScannerList(shd);

    // Log scanner details to console
    this.scanners.forEach((device, index) => {
      logInfo(`    ${index+1}. ${device.description}`, true)
    });

    // Report OSC status
    logInfo(
      `Listening for OSC on ` +
      config.get("osc.local.address") + ":" + config.get("osc.local.port")
    );

    // Send ready status via OSC
    this.sendOscMessage("/system/status", [{type: "i", value: 1}]);

  }

  async quit(status = 0) {

    logInfo("Exiting...");

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
      throw new Error(`Unable to start OSC server: ${err}`)
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

  async setupSmb() {

    // Prepare SMB client
    this.#smbClient = new SambaClient({
      address: config.get("smb.address"),
      username: credentials.smb.username,
      password: credentials.smb.password
    });

    try {
      const name = (Math.random() + 1).toString(36).substring(2);
      await this.#smbClient.mkdir(name);
      await this.#smbClient.execute('rmdir', name);
    } catch(err) {
      throw new Error("Cannot gain write access to SMB share (" + config.get("smb.address") + ")");
    }

  }

  sendOscMessage(address, args = []) {
    if (!this.#oscPort.socket) {
      logWarn("Impossible to send OSC, no socket available.")
      return;
    }
    this.#oscPort.send({address: address, args: args});
  }

  getDeviceByHardwarePort(port) {
    return this.scanners.find(device => device.hardwarePort === port);
  }

  async #onExitRequest() {
    await this.quit();
  }

  async #getScannerHardwareDescriptors() {

    return new Promise((resolve, reject) => {

      // Pour voir l'arbre des appareils USB: lsusb -t

      // Callback function that parses the data generated by the "usb-devices" command
      const callback = data => {

        // If no data is received, reject promise.
        if (!data) {
          reject("The usb-devices command did not return any data.");
          return;
        }

        // Split the long string received from usb-devices into discrete blocks for each device.
        // Doing so, we also replace the newlines by a token (NNNNN) for easier processing with
        // regex.
        const blocks = data.split('\n\n').map(item => item.replaceAll("\n", "NNNNN"))

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
        descriptors = descriptors.map(d => {
          const match = d.all.match(re);
          delete d.all;
          if (match) {
            d.manufacturer = match[1];
            d.model = match[2];
          }
          return d;
        });

        // From all the identified devices, only keep the ones related to the USB hub where the
        // scanners are connected. For this, we use the hub's manufacturer and product IDs.
        const hubItems = descriptors.filter(d => {
          return d.manufacturerId === config.get("devices.hub.manufacturerId") &&
            d.modelId === config.get("devices.hub.modelId");
        });

        // The item with the lowest level (higher up in hierarchy) is the parent (the hub itself),
        // the others are subgroups of ports created by the hub. Since the scanners appear within
        // subgroups those are the only ones we keep. So we delete the hub's entry (the one with the
        // lowest level).
        hubItems.sort((a, b) => a.level - b.level);
        hubItems.shift();

        // We now go through all subgroups and look for connected devices for which the subgroup is
        // the parent. When we find one, it means it's a scanner connected to the subgroup of the
        // hub.
        const scanners = {};
        hubItems.forEach(item => {
          descriptors
            .filter(d => d.parent === item.number)
            .forEach(child => scanners[`${item.port}-${child.port}`] = child);
        })

        // Add hardwarePort property to the descriptors by looking up our mapping chart
        const hubId = `${config.get("devices.hub.manufacturerId")}:${config.get("devices.hub.modelId")}`;
        const hub = hubs.find(hub => hub.identifier === hubId);
        for (const key of Object.keys(scanners)) {
          scanners[key].hardwarePort = hub.ports.find(p => p.portId === key).physical
        }

        // Add correct model and system name (from the models.js file)
        for (const [key, value] of Object.entries(scanners)) {

          const model = models.find(m => {
            return m.identifier === `${value.manufacturerId}:${value.modelId}`;
          });

          if (model) {
            scanners[key].model = model.name;
            const formattedBus = value.bus.toString().padStart(3, '0');
            const formattedNumber = value.number.toString().padStart(3, '0');
            scanners[key].systemName = model.driverPrefix + `${formattedBus}:${formattedNumber}`;
          } else {
            reject(
              `No match for manufacturer ${value.manufacturerId} and model ${value.modelId} ` +
              "in models.js file."
            );
            return;
          }

        }

        resolve(scanners);

      };

      // Call the "usb-devices" command to retrieve informationa about all USB-connected devices
      const usbDevicesSpawner = new Spawner();
      usbDevicesSpawner.execute(
        "usb-devices", [], {sucessCallback: callback, errorCallback: reject}
      );

    });

  }

  async #updateScannerList(deviceDescriptors) {

    this.#scanners = [];

    for (const descriptor of Object.values(deviceDescriptors)) {
      this.#scanners.push(new Scanner(this.#oscPort, descriptor));
    }

    // Sort by hardware port
    this.#scanners.sort((a, b) => a.hardwarePort - b.hardwarePort);

  }

  async #onOscError(error) {
    logError(error);
    await this.destroy();
    logInfo("Exiting...");
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

  #onOscMessage(message) {
  // #onOscMessage(message, timetag, info) {

    const segments = message.address.split("/").slice(1);

    // Filter out invalid commands
    const command = segments[0].toLowerCase()
    if (!this.oscCommands.includes(command)) return;

    // Fetch device index
    const port = parseInt(segments[1]);

    // Execute command
    // if (command === "scan" && message.args[0].value === 1) {
    if (command === "scan") {

      // Find scanner by port
      const scanner = this.getDeviceByHardwarePort(port);
      if (!scanner) {
        logWarn(
          "Unable to execute OSC command. No device connected to specified port (" +
          message.address + ")."
        );
        return;
      }

      const options = {
        outputFile: config.get("paths.scansDir") + `/scanner${port}.png`
      }
      scanner.scan(options);

    }

  }

}
