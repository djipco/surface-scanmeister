import {spawn} from 'child_process';
import osc from "osc";
import {Scanner} from './Scanner.js';
import {config} from "../config.js";
import {logInfo, logWarn} from "./Utils.js";
import {Spawner} from "./Spawner.js";

class ScanMeister {

  #version = "0.1.0";
  #devices = [];
  #callbacks = {}
  #oscCommands = ["scan"];
  #oscPort;

  constructor() {

    // Instantiate OSC UDP port
    this.#oscPort = new osc.UDPPort({
      localAddress: config.get("osc.local.address"),
      localPort: config.get("osc.local.port"),
      remoteAddress: config.get("osc.remote.address"),
      remotePort: config.get("osc.remote.port"),
      metadata: true
    });

  }

  get version() {
    return this.#version;
  }

  get devices() {
    return this.#devices;
  }

  get oscCommands() {
    return this.#oscCommands;
  }

  async init() {

    // Retrieve list of objects describing scanner ports and device numbers
    const shd = await this.#getScannerHardwareDescriptors();

    if (shd.length === 0) {
      this.#devices = [];
      logInfo("No scanner found.");
      return;
    } else {
      logInfo(`${shd.length} scanners have been detected. Retrieving details:`);
    }

    // Use `scanimage` and the scanner hardware descriptors to build list of Scanner objects
    await this.#updateScannerList(shd);

    // Log scanners to console
    this.devices.forEach(device => logInfo(`\t${device.description}`, true));

    // Add OSC callbacks and start listening for inbound OSC messages
    this.#addOscCallbacks();
    this.#oscPort.open();
    await new Promise(resolve => this.#oscPort.once("ready", resolve));

    logInfo(
      `Listening for OSC on ` +
      config.get("osc.local.address") + ":" + config.get("osc.local.port")
    );

    this.sendOscMessage("/system/ready", [{type: "i", value: 1}]);

  }

  async #getScannerHardwareDescriptors() {

    return new Promise((resolve, reject) => {

      const callback = data => {

          let descriptors = [];

          // Discard unrelated devices and only keep first line (the only one relevant to us)
          if (data) {
            descriptors = data
              .split('\n\n')
              .filter(text => text.includes(config.get('devices.filter')))
              .map(text => text.split('\n')[0]);
          }

          // Regex to extract bus, port and device number
          const re = /Bus=\s*(\d*).*Port=\s*(\d*).*Dev#=\s*(\d*)/

          // Return list with bus, port and device number
          descriptors = descriptors.map(descriptor => {
            const match = descriptor.match(re);
            const bus = match[1].padStart(3, '0')
            const port = parseInt(match[2]);
            const device = match[3].padStart(3, '0')
            return {bus, device, port};
          });
          resolve(descriptors);

      };

      const usbDevicesSpawner = new Spawner();

      usbDevicesSpawner.execute(
        "usb-devices",
        [],
        {sucessCallback: callback, errorCallback: reject}
      );

    });

  }

  async #updateScannerList(deviceDescriptors) {

    // Get scanners list through Linux `scanimage` command
    this.#devices = await new Promise((resolve, reject) => {

      const successCallback = data => {

        let results = [];
        let devices = [];

        if (data) {
          results = data.split('\n').filter(Boolean).map(line => JSON.parse(line));
        }

        results.forEach(r => {
          const dd = deviceDescriptors.find(desc => r.name.endsWith(`${desc.bus}:${desc.device}`));
          r.port = dd.port;
          r.device = dd.device;
          r.bus = dd.bus;
          devices.push(new Scanner(r))
        });

        devices.sort((a, b) => a.port - b.port);
        resolve(devices);
      }

      const errorCallback = error => {
        reject(error);
      }

      // Initiate scanning
      const scanImageSpawner = new Spawner();
      const format = '{"name":"%d","vendor":"%v","model":"%m","type":"%t","index":"%i"}%n'
      scanImageSpawner.execute(
        "scanimage",
        ['--formatted-device-list=' + format],
        {
          sucessCallback: successCallback,
          errorCallback: errorCallback
        }
      );

    });

  }

  #addOscCallbacks() {
    this.#callbacks.onOscError = this.#onOscError.bind(this);
    this.#oscPort.on("error", this.#callbacks.onOscError);
    this.#callbacks.onOscMessage = this.#onOscMessage.bind(this);
    this.#oscPort.on("message", this.#callbacks.onOscMessage);
    this.#callbacks.onOscBundle = this.#onOscBundle.bind(this);
    this.#oscPort.on("bundle", this.#callbacks.onOscBundle);
  }

  #onOscError(error) {
    logWarn("Warning: " + error);
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

  #onOscMessage(message, timetag, info) {

    const segments = message.address.split("/").slice(1);

    // Filter out invalid commands
    const command = segments[0].toLowerCase()
    if (!this.oscCommands.includes(command)) return;

    // Fetch device index
    const port = parseInt(segments[1]);

    // Execute command
    if (command === "scan") {

      // Find scanner by port
      const scanner = this.getDeviceByPort(port);
      if (!scanner) {
        logWarn(
          "Warning: unable to execute OSC command. No device connected to specified port (" +
          message.address + ")"
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

  #onOscBundle(bundle, timetag, info) {

    // console.log("tag", timetag);

    // const segments = message.address.split("/").slice(1);
    // if (segments[0] !== "midi") return;
    //
    // // Check if command is supported (case-insensitive) and trigger it if it is.
    // const index = this.oscCommands.findIndex(command => {
    //   return command.toLowerCase() === segments[2].toLowerCase();
    // });
    //
    // if (index >= 0) {
    //   const command = this.oscCommands[index];
    //   const channel = segments[1];
    //
    //   const time = osc.ntpToJSTime(timetag.raw[0], timetag.raw[1]);
    //
    //   this[`on${command}`](channel, segments[2], message.args, time);
    //   this.emit("data", {command: command, channel: channel, args: message.args, time: time});
    // }

  }

  sendOscMessage(address, args = []) {
    if (!this.#oscPort.socket) {
      logWarn("Warning: impossible to send OSC, no socket available.")
      return;
    }
    this.#oscPort.send({address: address, args: args});
  }

  // oscPort.send({
  //    address: "/carrier/frequency",
  //    args: [
  //      {
  //        type: "f",
  //        value: 440
  //      }
  //    ]
  //  });

  getDeviceByPort(port) {
    return this.devices.find(device => device.port === port);
  }

  async destroy() {

    // Destroy devices and remove callbacks
    this.devices.forEach(device => device.destroy());
    this.#removeOscCallbacks();

    // Broadcast system status (and leave enough time for the message to be sent)
    this.sendOscMessage("/system/ready", [{type: "i", value: 0}]);
    await new Promise(resolve => setTimeout(resolve, 50));

    this.#oscPort.close();
    this.#oscPort = null;

  }

}

// Export singleton instance class. The 'constructor' is nulled so that it cannot be used to
// instantiate a new object or extend it. However, it is not freezed so it remains extensible
// (properties can be added at will).
const sm = new ScanMeister();
sm.constructor = null;
export {sm as ScanMeister};
