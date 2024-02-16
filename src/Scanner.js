import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import {logInfo, logError, logWarn} from "./Logger.js"
import {Spawner} from "./Spawner.js";
import {config} from "../config/config.js";

import net from "net";

export class Scanner extends EventEmitter {

  #systemName;
  #manufacturer;
  #model;
  #bus;
  #hardwarePort;
  #softwarePort;
  #oscPort;
  #scanning = false;

  #socket;

  #options = {
    // formats: ["png"],
    // modes: ["Color", "Gray"],
    resolutions: [75, 100, 150, 300, 600, 1200, 2400, 4800],
    // depths: [8, 16]
  }

  constructor(oscPort, options = {}) {

    super();

    this.#oscPort = oscPort;

    this.#softwarePort = options.port;
    this.#hardwarePort = options.hardwarePort;
    this.#systemName = options.systemName;
    this.#manufacturer = options.manufacturer;
    this.#model = options.model;

    this.sendOscMessage(`/device/${this.hardwarePort}/scanning`, [{type: "i", value: 0}]);
    this.sendOscMessage(`/device/${this.hardwarePort}/progress`, [{type: "f", value: 0}]);

  }

  get systemName() { return this.#systemName; }
  get manufacturer() { return this.#manufacturer; }
  get model() { return this.#model; }
  get description() {
    return `${this.manufacturer} ${this.model} on hardware port #${this.hardwarePort} (${this.systemName})`;
  }

  get bus() { return this.#bus; }
  get hardwarePort() { return this.#hardwarePort; }
  get softwarePort() { return this.#softwarePort; }

  get scanning() { return this.#scanning; }
  get options() { return this.#options; }

  async scan(options = {}) {

    // Ignore if already scanning
    if (this.scanning) {
      logWarn(`Already scanning with device ${this.description}. Ignoring.`)
      return;
    }

    // Start scan
    this.#scanning = true;
    logInfo(`Initiating scan on ${this.description}...`);
    this.sendOscMessage(`/device/${this.hardwarePort}/scanning`, [{type: "i", value: 1}]);
    this.emit("scanstarted", {target: this});

    // Prepare args array
    const args = [];

    // The device name is optional. If not specified, the first found scanner will be used.
    if (this.systemName) {
      args.push(`--device-name=${this.systemName}`);
    }

    // File format and output
    if (config.get("operation.mode") === "smb") {
      args.push('--format=png');
      if (options.outputFile) {
        args.push('--output-file=' + options.outputFile)
      }
    } else if (config.get("operation.mode") === "tcp") {
      args.push('--format=pnm');
    } else {
      throw new Error(`Invalid operation mode: ${config.get("operation.mode")}`)
    }

    // Color mode
    // if (this.options.modes.includes(options.mode)) {
    //   args.push('--mode=' + options.mode);
    // } else {
      args.push('--mode=Color');
    // }

    // Scanning bit depth
    // if (this.options.depths.includes(options.mode)) {
    //   args.push('--depth=' + options.depth);
    // } else {
      args.push('--depth=8');
    // }

    // Scanning resolution
    if (this.options.resolutions.includes(options.resolution)) {
      args.push('--resolution=' + options.resolution);
    } else {
      args.push('--resolution=' + config.get("devices.resolution"));
    }

    // Brightness (-100...100)
    this.options.brightness = parseInt(this.options.brightness);
    if (this.options.brightness) {
      args.push('--brightness=' + options.brightness);
    } else {
      args.push('--brightness=0');
    }

    // Contrast (-100...100)
    this.options.contrast = parseInt(this.options.contrast);
    if (this.options.contrast) {
      args.push('--contrast=' + options.contrast);
    } else {
      args.push('--contrast=0');
    }

    // Lamp off time

    // Lamp off scan
    if (options.lampOffScan) {
      args.push('--lamp-off-scan=yes');
    } else {
      args.push('--lamp-off-scan=no');
    }

    // Ask to report progress on stderr
    args.push('--progress');
    // args.push('--preview');
    args.push('--buffer-size=8'); // default is 32KB


    // If we are using the "tcp" mode, we create a TCP client and connect to server
    if (config.get("operation.mode") === "tcp") {

      await new Promise(resolve => {

        this.socket = net.createConnection(
          { port: config.get("tcp.port"), host: config.get("tcp.address") },
          resolve
        );

      });

    }

    // Initiate scanning
    const scanImageSpawner = new Spawner();

    scanImageSpawner.execute(
      "scanimage",
      args,
      {
        detached: true,
        sucessCallback: this.#onScanImageEnd.bind(this),
        errorCallback: this.#onScanImageError.bind(this),
        stderrCallback: this.#onScanImageStderr.bind(this)
      }
    );

    scanImageSpawner.pipe(this.socket, "stdout");

  }

  #onScanImageStderr(data) {

    let [prefix, percentage] = data.split(": ");

    // When called with the --progress switch, scanimage reports progress on stderr
    if (prefix !== "Progress") {
      this.emit("error", data);
      logError("Error: " + data);
    } else {
      percentage = parseFloat(percentage.slice(0, -1)) / 100;
      this.sendOscMessage(`/device/${this.hardwarePort}/progress`, [{type: "f", value: percentage}]);
    }

  }

  #onScanImageError(error) {
    this.#scanning = false;
    this.emit("warning", error);
    logWarn(error);
  }

  #onScanImageEnd() {
    this.#scanning = false;
    this.sendOscMessage(`/device/${this.hardwarePort}/scanning`, [{type: "i", value: 0}]);
    this.sendOscMessage(`/device/${this.hardwarePort}/progress`, [{type: "f", value: 0}]);
    this.emit("scancompleted", {target: this});
    logInfo(`Scan completed on ${this.description}`);
  }

  sendOscMessage(address, args = []) {
    if (!this.#oscPort.socket) {
      logWarn("Impossible to send OSC, no socket available.")
      return;
    }
    this.#oscPort.send({address: address, args: args});
  }

  destroy() {
    this.sendOscMessage(`/device/${this.hardwarePort}/scanning`, [{type: "i", value: 0}]);
    this.sendOscMessage(`/device/${this.hardwarePort}/progress`, [{type: "f", value: 0}]);
    this.removeListener();
  }

}
