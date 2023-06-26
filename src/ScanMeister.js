import {spawn} from 'child_process';
import osc from "osc";
import {Scanner} from './Scanner.js';
import {config} from "../config.js";
import {logInfo, logWarn} from "./Utils.js";

class ScanMeister {

  #version = "0.0.1";
  #devices = [];
  #callbacks = {}
  #oscCommands = ["scan"];
  #oscPort;

  constructor() {

    // Instantiate osc.js UDPPort
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

    await this.updateDevices2();

    // Retrieve device list (scanners)
    await this.updateDevices();

    //
    if (this.devices.length < 1) {
      logInfo("No devices found.")
    } else {

      let message = "The following devices have been found:";

      this.devices.forEach(device => {
        message += `\n\t${device.vendor} ${device.model} ${device.name} (#${device.index})`
      });

      logInfo(message);

    }

    // Display device in console

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

  async updateDevices() {

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

        results.forEach(r => devices.push(new Scanner(r)));
        resolve(devices);

      });

    });

  }

  async updateDevices2() {

    this.#devices = await new Promise((resolve, reject) => {

      // Resulting string buffer
      let buffer = '';

      // Spawn scanimage process to retrieve list
      let usbDev = spawn('usb-devices');

      // usbDev.once('error', error => {
      //   reject(`Error: '${error.syscall}' yielded error code '${error.code}' (${error.errno})`)
      // });

      // Error handler
      // usbDev.stdout.once('error', reject);

      // Data handler
      usbDev.stdout.on('data', chunk => buffer += chunk.toString());

      // End handler
      usbDev.stdout.once('end', () => {

        let descriptors = [];

        // Filter descriptors to only include the correct product and the first line of data (the
        // only one relevant to us)
        if (buffer) {
          descriptors = buffer
            .split('\n\n')
            .filter(text => text.includes("Product=CanoScan"))
            .map(text => text.split('\n')[0]);
        }

        console.log(descriptors);

        // const re = /Port=\s*(\d*).*Dev#=\s*(\d*)/gm;
        const re = /Port=\s*(\d*).*Dev#=\s*(\d*)/


        // descriptors.map(input => {
        //   console.log(input);
        //   const match = input.match(re);
        //   console.log(match);
        //   // console.log("port", match[1], "dev", match[2]);
        // })

        descriptors.forEach(desc => {
          const match = desc.match(re);
          console.log(match);
        });



      });

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
