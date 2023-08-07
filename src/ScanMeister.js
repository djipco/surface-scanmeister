import osc from "osc";
import {Scanner} from './Scanner.js';
import {logInfo, logError, logWarn} from "./Logger.js"
import {Spawner} from "./Spawner.js";
import {config} from "../config/config.js";
import {hubs} from "../config/hubs.js";
import {models} from "../config/models.js";
import {credentials} from "../config/credentials.js";


import fs from 'node:fs/promises'
import SambaClient from "samba-client";

class ScanMeister {

  #scanners = [];
  #callbacks = {}
  #oscCommands = ["scan"];
  #oscPort;
  #smbClient;

  constructor() {

    // Instantiate OSC UDP port
    this.#oscPort = new osc.UDPPort({
      localAddress: config.get("osc.local.address"),
      localPort: config.get("osc.local.port"),
      remoteAddress: config.get("osc.remote.address"),
      remotePort: config.get("osc.remote.port"),
      metadata: true
    });

    // Prepare SMB client
    this.#smbClient = new SambaClient({
      address: config.get("smb.address"),
      username: credentials.smb.username,
      password: credentials.smb.password
    });

  }

  get scanners() {
    return this.#scanners;
  }

  get oscCommands() {
    return this.#oscCommands;
  }

  async init() {





    // this.address = options.address;
    // this.username = options.username || "guest";
    // this.password = options.password;
    // this.domain = options.domain;
    // this.port = options.port;
    // this.directory = options.directory;
    // this.timeout = options.timeout;
    // // Possible values for protocol version are listed in the Samba man pages:
    // // https://www.samba.org/samba/docs/current/man-html/smb.conf.5.html#CLIENTMAXPROTOCOL
    // this.maxProtocol = options.maxProtocol;
    // this.maskCmd = Boolean(options.maskCmd);

    // const testFile = "test.txt";



    const list = await this.#smbClient.listFiles();
    console.log(`found these files: ${list}`);




    // If we get an error before OSC is "ready", there's no point in continuing. If we get the ready
    // event, we're good to go.
    const onInitialOscError = async err => {
      logError(err);
      await this.destroy();
      logInfo("Exiting...");
    }
    this.#oscPort.once("error", onInitialOscError);
    this.#oscPort.open();
    await new Promise(resolve => this.#oscPort.once("ready", resolve));
    this.#oscPort.off("error", onInitialOscError);

    // Now that OSC is ready, add callbacks for inbound messages (must be done before creating
    // scanner objects)
    this.#addOscCallbacks();

    // Retrieve list of objects describing scanner ports and device numbers
    const shd = await this.#getScannerHardwareDescriptors();

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

    // Log scanners to console
    this.scanners.forEach((device, index) => {
      logInfo(`    ${index+1}. ${device.description}`, true)
    });

    // Send status via OSC
    this.sendOscMessage("/system/status", [{type: "i", value: 1}]);

    logInfo(
      `Listening for OSC on ` +
      config.get("osc.local.address") + ":" + config.get("osc.local.port")
    );

  }

  /**
   *
   * @returns {Promise<object>}
   */
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

  #addOscCallbacks() {
    this.#callbacks.onOscError = this.#onOscError.bind(this);
    this.#oscPort.on("error", this.#callbacks.onOscError);
    this.#callbacks.onOscMessage = this.#onOscMessage.bind(this);
    this.#oscPort.on("message", this.#callbacks.onOscMessage);
    // this.#callbacks.onOscBundle = this.#onOscBundle.bind(this);
    // this.#oscPort.on("bundle", this.#callbacks.onOscBundle);
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

  /**
   *
   * @param {object} message
   * @param {string} message.address
   * @param {[]} message.address.args
   */
  #onOscMessage(message) {
  // #onOscMessage(message, timetag, info) {

    const segments = message.address.split("/").slice(1);

    // Filter out invalid commands
    const command = segments[0].toLowerCase()
    if (!this.oscCommands.includes(command)) return;

    // Fetch device index
    const port = parseInt(segments[1]);

    // Execute command
    if (command === "scan" && message.args[0].value === 1) {

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
      // scanner.scan().pipe(fs.createWriteStream(`image${port}.png`));
    }

  }

  // #onOscBundle(bundle, timetag, info) {
  //
  //   // console.log("tag", timetag);
  //
  //   // const segments = message.address.split("/").slice(1);
  //   // if (segments[0] !== "midi") return;
  //   //
  //   // // Check if command is supported (case-insensitive) and trigger it if it is.
  //   // const index = this.oscCommands.findIndex(command => {
  //   //   return command.toLowerCase() === segments[2].toLowerCase();
  //   // });
  //   //
  //   // if (index >= 0) {
  //   //   const command = this.oscCommands[index];
  //   //   const channel = segments[1];
  //   //
  //   //   const time = osc.ntpToJSTime(timetag.raw[0], timetag.raw[1]);
  //   //
  //   //   this[`on${command}`](channel, segments[2], message.args, time);
  //   //   this.emit("data", {command: command, channel: channel, args: message.args, time: time});
  //   // }
  //
  // }

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

  async destroy() {

    // Destroy scanners and remove callbacks
    this.scanners.forEach(device => device.destroy());
    this.#removeOscCallbacks();

    if (this.#oscPort.socket) {

      // Broadcast system status (and leave enough time for the message to be sent)
      this.sendOscMessage("/system/status", [{type: "i", value: 0}]);
      await new Promise(resolve => setTimeout(resolve, 25));

      this.#oscPort.close();
      this.#oscPort = null;

    }

  }

}

// Export singleton instance class. The 'constructor' is nulled so that it cannot be used to
// instantiate a new object or extend it. However, it is not freezed so it remains extensible
// (properties can be added at will).
const sm = new ScanMeister();
sm.constructor = null;
export {sm as ScanMeister};
