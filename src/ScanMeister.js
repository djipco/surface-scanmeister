import {spawn} from 'child_process'

class ScanMeister {

  constructor() {
    this.devices = [];
  }

  async init() {
    await this.updateDevices();
  }

  async updateDevices() {

    this.devices = await new Promise((resolve, reject) => {

        // Resulting string buffer
        let buffer = '';

        // Format for device list
        const format = '{"name":"%d", "vendor":"%v", "model":"%m", "type":"%t", "index":"%i"} %n'

        // Spawn scanimage process to retrieve list
        let scanimage = spawn(
            'scanimage',
            ['--formatted-device-list=' + format]
        );

        // Error handler
        scanimage.stdout.once('error', reject); 

        // Data handler
        scanimage.stdout.on('data', chunk => buffer += chunk.toString());

        // End handler
        scanimage.stdout.once('end', () => {
            if (buffer) {
                return resolve(buffer.split('\n').filter(Boolean).map(line => JSON.parse(line)));
            } else {
                return resolve([]);
            }
        });

    });

  }

  scan(options = {}) {

    // Prepare args array
    const args = [];

    // Device name
    const devices = this.devices.map(dev => dev.name);
    if (devices.includes(options.deviceName)) {
      args.push(`--device-name=${options.deviceName}`);
    }

    // File format
    if (["png"].includes(options.format)) {
      args.push('--format=' + options.format);
    } else {
      args.push('--format=png');
    }

    // Scanning mode
    if (["Color"].includes(options.mode)) {
      args.push('--mode=' + options.mode);
    } else {
      args.push('--mode=Color');
    }

    // Scanning bit depth
    if ([8, 16].includes(options.mode)) {
      args.push('--depth=' + options.depth);
    } else {
      args.push('--depth=8');
    }

    // Scanning resolution
    if ([4800,2400,1200,600,300,150,100,75].includes(options.resolution)) {
      args.push('--resolution=' + options.resolution);
    } else {
      args.push('--resolution=100');
    }

    // Brightness (-100...100)
    // Contrast (-100...100)
    // Lamp off time

    // Lamp off scan
    if (!!options.lampOffScan) {
      args.push('--lamp-off-scan=yes');
    } else {
      args.push('--lamp-off-scan=no');
    }

    // Initiate scanning
    const scanimage = spawn(
      'scanimage', 
      args,
      { detached: true }
    );
    
    // Report errors if any
    scanimage.stderr.on('data', data => {
      console.error( `stderr: ${ data }` );
    });

    scanimage.stdout.on('end', () => {
      console.log( `Done: ${options.deviceName}` );
    });
    
    return scanimage.stdout;
    
  }

}

// Export singleton instance class. The 'constructor' is nulled so that it cannot be used to 
// instantiate a new object or extend it. However, it is not freezed so it remains extensible 
// (properties can be added at will).
const sm = new ScanMeister();
sm.constructor = null;
export {sm as ScanMeister};







// import {Preferences} from "./Preferences.js";

// const osc = require("osc");

// import {EventEmitter} from "./node_modules/djipevents/dist/esm/djipevents.esm.min.js";
// import {WebMidi} from "./node_modules/webmidi/dist/esm/webmidi.esm.js";
// import {Preferences as prefs} from "./Preferences.js";

// export class Oscamidi extends EventEmitter {

//   constructor() {

//     super();

//     this.timeReference = performance.now();

//     // setInterval(() => {
//     //   console.log(performance.now());
//     // }, 1000);

//     this.callbacks = {};

//     this.output = null;

//     // Currently supported commands
//     this.commands = [
//       "NoteOn",
//       "NoteOff",
//       "ControlChange",
//       "Notification",
//       "Ui"
//     ];

//     // Instantiate osc.js UDPPort
//     this.port = new osc.UDPPort({
//       localAddress: "0.0.0.0",
//       localPort: 8000,
//       metadata: true,
//       remoteAddress: prefs.device.address,
//       remotePort: prefs.device.port
//     });

//     // OSC callback
//     this.callbacks.onOscError = error => { console.warn(error) };
//     this.port.on("error", this.callbacks.onOscError);

//     this.callbacks.onOscMessage = this.onOscMessage.bind(this);
//     this.port.on("message", this.callbacks.onOscMessage);

//     this.callbacks.onOscBundle = this.onOscBundle.bind(this);
//     this.port.on("bundle", this.callbacks.onOscBundle);

//   }

//   async start() {

//     // Enable WebMidi and listen for I/O changes
//     WebMidi.addListener("portschanged", this.onPortsChanged.bind(this));
//     this.outputs = WebMidi.outputs;
//     await WebMidi.enable({sysex: true});

//     // Start listening for inbound OSC messages
//     this.port.open();
//     await new Promise(resolve => this.port.once("ready", resolve));

//   }

//   onPortsChanged(e) {
//     this.emit(e.type, e)
//   }

//   onOscMessage(message, timetag, info) {

//     const segments = message.address.split("/").slice(1);
//     if (segments[0] === "system") {
//       this.onOscSystemMessage(message, timetag, info)
//       return;
//     } else if (segments[0] !== "midi") {
//       return;
//     }

//     // Check if command is supported (case-insensitive) and trigger it if it is.
//     const index = this.commands.findIndex(command => {
//       return command.toLowerCase() === segments[2].toLowerCase();
//     });

//     const time = timetag ? timetag.native : 0

//     if (index >= 0) {
//       const command = this.commands[index];
//       const channel = segments[1];
//       this[`on${command}`](channel, segments[2], message.args, time);
//       this.emit("data", {command: command, channel: channel, args: message.args, time: time});
//     }

//   }

//   onOscSystemMessage(message, timetag, info) {

//     const segments = message.address.split("/").slice(1);

//     // Check if command is supported (case-insensitive) and trigger it if it is.
//     const index = this.commands.findIndex(command => {
//       return command.toLowerCase() === segments[1].toLowerCase();
//     });

//     if (index >= 0) {
//       const command = this.commands[index];
//       this[`on${command}`](segments[2], message.args);
//       this.emit("data", {command: command, args: message.args});
//     }

//   }

//   onOscBundle(bundle, timetag, info) {

//     // console.log("tag", timetag);

//     // const segments = message.address.split("/").slice(1);
//     // if (segments[0] !== "midi") return;
//     //
//     // // Check if command is supported (case-insensitive) and trigger it if it is.
//     // const index = this.commands.findIndex(command => {
//     //   return command.toLowerCase() === segments[2].toLowerCase();
//     // });
//     //
//     // if (index >= 0) {
//     //   const command = this.commands[index];
//     //   const channel = segments[1];
//     //
//     //   const time = osc.ntpToJSTime(timetag.raw[0], timetag.raw[1]);
//     //
//     //   this[`on${command}`](channel, segments[2], message.args, time);
//     //   this.emit("data", {command: command, channel: channel, args: message.args, time: time});
//     // }

//   }

//   setOutputByName(name) {
//     this.output = WebMidi.getOutputByName(name);
//   }

//   onNoteOn(channel, command, parameters) {

//     if (!this.output) return;

//     const note = parameters[0].value;
//     const velocity = parameters[1].value;
//     const duration = parameters[2].value;
//     const time = parameters[3].value;

//     const delay = performance.now() - time;
//     if (delay > 0) console.warn(`Message arrived ${delay}ms late`);

//     this.output.channels[channel].playNote(
//       note,
//       {rawAttack: velocity, duration: duration, time: time}
//     );

//   }

//   onControlChange(channel, command, parameters) {
//     if (!this.output) return;
//     // console.log(channel, command);
//     this.output.channels[channel].sendControlChange(parameters[0].value, parameters[1].value);
//   }

//   onNotification(channel, command, parameters) {
//     this.emit("notification", {type: parameters[0].value});
//   }

//   onUi(command, args) {
//     // console.log(command, args[0].value);
//     this.emit("ui", {setting: command, value: args[0].value});
//   }

//   stop() {
//     this.port.close();
//   }

//   sendOscMessage(address, args) {

//     if (!this.port.socket) return;

//     this.port.send({address: address, args: args});
//     // console.log(address, args);
//   }

//   destroy() {

//     this.stop();

//     this.port.off("error", this.callbacks.onOscError);
//     this.callbacks.onOscError = null;

//     this.port.off("message", this.callbacks.onOscMessage);
//     this.callbacks.onOscMessage = null;

//     this.port.off("bundle", this.callbacks.onOscBundle);
//     this.callbacks.onOscBundle = null;

//   }

// }
