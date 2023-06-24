import {spawn} from 'child_process';
import osc from "osc";
import {Scanner} from './Scanner.js';
import fs from "fs"

class ScanMeister {

  #commands = [
    "scan"
  ];
  #version = "0.0.1";
  #devices = []

  constructor() {
    this.callbacks = {};
  }

  get version() {
    return this.#version;
  }

  get devices() {
    return this.#devices;
  }

  get commands() {
    return this.#commands;
  }

  async init() {

    // Retrieve device list (scanners)
    await this.updateDevices();

    // Instantiate osc.js UDPPort
    this.port = new osc.UDPPort({
      localAddress: "0.0.0.0",
      localPort: 8000,
      metadata: true,
      // remoteAddress: prefs.device.address,
      // remotePort: prefs.device.port
    });

    // OSC callback
    this.callbacks.onOscError = error => { console.warn(error) };
    this.port.on("error", this.callbacks.onOscError);

    this.callbacks.onOscMessage = this.onOscMessage.bind(this);
    this.port.on("message", this.callbacks.onOscMessage);

    this.callbacks.onOscBundle = this.onOscBundle.bind(this);
    this.port.on("bundle", this.callbacks.onOscBundle);

    // Start listening for inbound OSC messages
    this.port.open();
    await new Promise(resolve => this.port.once("ready", resolve));

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

      scanimage.on('error', error => {
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
          devices.push(new Scanner(r))
        });

        resolve(devices);

      });

    });

  }

  onOscMessage(message, timetag, info) {

    const segments = message.address.split("/").slice(1);

    // Check
    // if (segments[0] === "system") {
    //   this.onOscSystemMessage(message, timetag, info)
    //   return;
    // } else if (segments[0] !== "midi") {
    //   return;
    // }

    // Filter out invalid commands
    const command = segments[0].toLowerCase()
    if (!this.commands.includes(command)) return;

    // Fetch device index
    const index = segments[1];

    // Execute command
    if (command === "scan") {
      this.devices[index].scan().pipe(fs.createWriteStream(`image${index}.png`));
    }

  }

  onOscBundle(bundle, timetag, info) {

    // console.log("tag", timetag);

    // const segments = message.address.split("/").slice(1);
    // if (segments[0] !== "midi") return;
    //
    // // Check if command is supported (case-insensitive) and trigger it if it is.
    // const index = this.commands.findIndex(command => {
    //   return command.toLowerCase() === segments[2].toLowerCase();
    // });
    //
    // if (index >= 0) {
    //   const command = this.commands[index];
    //   const channel = segments[1];
    //
    //   const time = osc.ntpToJSTime(timetag.raw[0], timetag.raw[1]);
    //
    //   this[`on${command}`](channel, segments[2], message.args, time);
    //   this.emit("data", {command: command, channel: channel, args: message.args, time: time});
    // }

  }

  sendOscMessage(address, args) {
    // if (!this.port.socket) return;
    // this.port.send({address: address, args: args});
  }

  destroy() {

    if (this.port) {
      this.port.off("error", this.callbacks.onOscError);
      this.callbacks.onOscError = null;

      this.port.off("message", this.callbacks.onOscMessage);
      this.callbacks.onOscMessage = null;

      this.port.off("bundle", this.callbacks.onOscBundle);
      this.callbacks.onOscBundle = null;

      this.port = null;
    }

    this.devices.forEach(device => device.destroy());

  }

}

// Export singleton instance class. The 'constructor' is nulled so that it cannot be used to
// instantiate a new object or extend it. However, it is not freezed so it remains extensible
// (properties can be added at will).
const sm = new ScanMeister();
sm.constructor = null;
export {sm as ScanMeister};
