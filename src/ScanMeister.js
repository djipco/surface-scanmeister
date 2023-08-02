import {spawn} from 'child_process';
import osc from "osc";
import {Scanner} from './Scanner.js';
import {config} from "../config/config.js";
import {logError, logInfo, logWarn} from "./Utils.js";
import {Spawner} from "./Spawner.js";
import {hubs} from "../config/hubs.js"

class ScanMeister {

  #version = "0.1.1";
  #scanners = [];
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

  get scanners() {
    return this.#scanners;
  }

  get oscCommands() {
    return this.#oscCommands;
  }

  async init() {

    // Add OSC callbacks and start listening for inbound OSC messages (must be done before creating
    // scanner objects)
    this.#addOscCallbacks();
    this.#oscPort.open();
    await new Promise(resolve => this.#oscPort.once("ready", resolve));

    // Retrieve list of objects describing scanner ports and device numbers
    const shd = await this.#getScannerHardwareDescriptors();

    if (shd.length === 0) {
      this.#scanners = [];
      logInfo("No scanner found.");
      return;
    } else {
      logInfo(`${shd.length} scanners have been detected. Retrieving details:`);
    }

    // Use `scanimage` and the scanner hardware descriptors to build list of Scanner objects
    await this.#updateScannerList(shd);

    // Log scanners to console
    this.scanners.forEach(device => logInfo(`\t${device.description}`, true));

    // Send status via OSC
    this.sendOscMessage("/system/status", [{type: "i", value: 1}]);

    logInfo(
      `Listening for OSC on ` +
      config.get("osc.local.address") + ":" + config.get("osc.local.port")
    );

  }

  async #getScannerHardwareDescriptors() {

    // return new Promise((resolve, reject) => {
    //
    //   const callback = data => {
    //
    //       let descriptors = [];
    //
    //       // Discard unrelated devices and only keep first line (the only one relevant to us)
    //       if (data) {
    //         descriptors = data
    //           .split('\n\n')
    //           .filter(text => text.includes(config.get('devices.filter')))
    //           .map(text => text.split('\n')[0]);
    //       }
    //
    //       // Regex to extract bus, port and device number
    //       // const re = /Bus=\s*(\d*).*Port=\s*(\d*).*Dev#=\s*(\d*)/
    //       const re = /Bus=\s*(\d*).*Lev=\s*(\d*).*Prnt=\s*(\d*).*Port=\s*(\d*).*Cnt=\s*(\d*).*Dev#=\s*(\d*)/
    //
    //       // Return list with bus, port and device number
    //       descriptors = descriptors.map(descriptor => {
    //
    //         // Perform match
    //         const match = descriptor.match(re);
    //
    //         // Extract data
    //         // const bus = match[1].padStart(3, '0')
    //         const bus = parseInt(match[1]);
    //         const level = parseInt(match[2]);
    //         const parent = parseInt(match[3]);
    //         const port = parseInt(match[4]);
    //         const container = parseInt(match[5]);
    //         // const device = match[6].padStart(3, '0');
    //         const device = parseInt(match[6]);
    //         return {bus, level, parent, port, container, device};
    //
    //       });
    //       resolve(descriptors);
    //
    //   };
    //
    //   const usbDevicesSpawner = new Spawner();
    //
    //   usbDevicesSpawner.execute(
    //     "usb-devices",
    //     [],
    //     {sucessCallback: callback, errorCallback: reject}
    //   );
    //
    // });

    return new Promise((resolve, reject) => {

      const callback = data => {

          let descriptors = [];
          let items = [];

          if (data) {
            items = data.split('\n\n')
              // .map(item => item.replaceAll("T:  ", ""))
              // .map(item => item.replaceAll("D:  ", ""))
              // .map(item => item.replaceAll("P:  ", ""))
              // .map(item => item.replaceAll("C:  ", ""))
              // .map(item => item.replaceAll("I:  ", ""))
              // .map(item => item.replaceAll("S:  ", ""))
              .map(item => item.replaceAll("\n", "NNNNN"))
          }

          console.log(items);


          // Perform match for common data
          let re = /.*Bus=\s*(\d*).*Lev=\s*(\d*).*Prnt=\s*(\d*).*Port=\s*(\d*).*Cnt=\s*(\d*).*Dev#=\s*(\d*).*Vendor=(\S*).*ProdID=(\S*).*/
          descriptors = items.map(item => {
            const match = item.match(re);
            const all = match[0];
            const bus = parseInt(match[1]);
            const level = parseInt(match[2]);
            const parent = parseInt(match[3]);
            const port = parseInt(match[4]);
            const container = parseInt(match[5]);
            const number = parseInt(match[6]);
            const vendor = match[7];
            const productId = match[8];
            return {all, bus, level, parent, port, container, number, vendor, productId};
          });


        re = /.*Manufacturer=(.*?)NNN.*Product=(.*?)NNNNN/
        descriptors = descriptors.map(d => {
          const match = d.all.match(re);
          delete d.all;
          if (match) {
            d.manufacturer = match[1];
            d.product = match[2];
            // d.serial = match[3];
          }
          return d;
        });



          console.log(descriptors);

          // resolve(descriptors);

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

    // Identify the hub we are currently using
    const hub = hubs.find(hub => hub.model === config.get("devices.hub"));

    // Get scanners list through Linux `scanimage` command
    this.#scanners = await new Promise((resolve, reject) => {

      const successCallback = data => {

        let results = [];
        let scanners = [];

        if (data) {
          results = data.split('\n').filter(Boolean).map(line => JSON.parse(line));
        }

        results.forEach(r => {
          const dd = deviceDescriptors.find(
            // desc => r.name.endsWith(`${desc.bus}:${desc.device}`)
            desc => {
              const id = desc.bus.toString().padStart(3, '0') + ":" + desc.device.toString().padStart(3, '0');
              return r.name.endsWith(id)
            }
          );
          r.bus = dd.bus;
          r.parent = dd.parent;
          r.device = dd.device;
          r.port = dd.port;

          const foundPort = hub.ports.find(
            port => port.parent === dd.parent && port.number === dd.port
          );

          if (foundPort) {
            r.physicalPort = foundPort.physical;
            scanners.push(new Scanner(this.#oscPort, r));
          } else {
            logWarn(`Cannot find matching port for parent ${dd.parent} and number ${dd.port}`);
          }


        });

        scanners.sort((a, b) => a.physicalPort - b.physicalPort);
        resolve(scanners);
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

  async #onOscError(error) {
    logWarn(error);
    // await this.destroy();
    // logError("Exiting");
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
    if (command === "scan" && message.args[0].value === 1) {

      // Find scanner by port
      const scanner = this.getDeviceByPhysicalPort(port);
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

  getDeviceByPhysicalPort(port) {
    return this.scanners.find(device => device.physicalPort === port);
  }

  async destroy() {

    // Destroy scanners and remove callbacks
    this.scanners.forEach(device => device.destroy());
    this.#removeOscCallbacks();

    if (this.#oscPort) {

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
