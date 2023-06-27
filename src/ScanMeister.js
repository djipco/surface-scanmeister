import {spawn} from 'child_process';
import osc from "osc";
import {Scanner} from './Scanner.js';
import {config} from "../config.js";
import {logInfo, logWarn} from "./Utils.js";
import {Spawner} from "./Spawner.js";

class ScanMeister {

  #version = "0.0.2";
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

    // Retrieve list of ports with physically connected scanners and log it to console
    const deviceDescriptors = await this.getUsbDeviceDescriptors();

    if (deviceDescriptors.length === 0) {
      this.#devices = [];
      logInfo("No scanner found.");
      return;
    } else {
      logInfo(`${deviceDescriptors.length} scanners have been detected:`);
    }

    // Fetch info and create actual Scanner objects
    await this.updateDevices(deviceDescriptors);

    // Log scanners to console
    this.devices.forEach(device => {
      logInfo(`\tPort ${device.port}: ${device.vendor} ${device.model} (${device.name})`, true)
    });

    // Add OSC callback and start listening for inbound OSC messages
    this.#addOscCallbacks();
    this.#oscPort.open();
    await new Promise(resolve => this.#oscPort.once("ready", resolve));

    logInfo(
      `Listening for OSC on ` +
      config.get("osc.local.address") + ":" + config.get("osc.local.port")
    );

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

  #onOscMessage(message, timetag, info) {

    const segments = message.address.split("/").slice(1);

    // Filter out invalid commands
    const command = segments[0].toLowerCase()
    if (!this.oscCommands.includes(command)) return;

    // Fetch device index
    const index = segments[1];

    // Execute command
    if (command === "scan") {
      // this.devices[index].scan().pipe(fs.createWriteStream(`image${index}.png`));
      const options = {
        outputFile: config.get("paths.scansDir") + `/scanner${index}.png`
        // outputFile: `scanner${index}.png`
      }
      if (this.devices[index]) {
        this.devices[index].scan(options);
      } else {
        logWarn("Warning: no device matches the index requested via OSC: " + message.address);
      }
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

  sendOscMessage(address, args) {
    // if (!this.#oscPort.socket) return;
    // this.#oscPort.send({address: address, args: args});
  }

  async updateDevices(deviceDescriptors) {

    // Get scanners list through Linux `scanimage` command
    this.#devices = await new Promise((resolve, reject) => {

      // Resulting string buffer
      let buffer = '';

      // Format for device list
      const format = '{"name":"%d", "vendor":"%v", "model":"%m", "type":"%t", "index":"%i"} %n'

      // Spawn scanimage process to retrieve list
      let scanimage = spawn(
        'scanimage',
        ['--formatted-device-list=' + format]
      );

      scanimage.once('error', error => {
        reject(`Error: '${error.syscall}' yielded error code '${error.code}' (${error.errno})`)
      });

      // Error handler
      scanimage.stdout.once('error', reject);

      // Data handler
      scanimage.stdout.on('data', chunk => buffer += chunk.toString());

      // End handler
      scanimage.stdout.once('end', () => {

        let results = [];
        let devices = [];

        if (buffer) {
          results = buffer.split('\n').filter(Boolean).map(line => JSON.parse(line));
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

      });

    });

  }

  async getUsbDeviceDescriptors() {

    return new Promise((resolve, reject) => {

      const callback = data => {

          let descriptors = [];

          // Discard unrelated devices and only keep first line (the only one relevant to us)
          if (data) {
            descriptors = data
              .split('\n\n')
              .filter(text => text.includes(config.get('devices.filterString')))
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

  destroy() {
    this.devices.forEach(device => device.destroy());
    this.#removeOscCallbacks();
    this.#oscPort = null;
  }

}

// Export singleton instance class. The 'constructor' is nulled so that it cannot be used to
// instantiate a new object or extend it. However, it is not freezed so it remains extensible
// (properties can be added at will).
const sm = new ScanMeister();
sm.constructor = null;
export {sm as ScanMeister};
