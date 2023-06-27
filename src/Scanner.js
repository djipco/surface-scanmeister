import {spawn} from 'child_process';
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import {logError, logInfo, logWarn} from "./Utils.js";
import fs from "fs";
import {Spawner} from "./Spawner.js";

export class Scanner extends EventEmitter {

  #callbacks = {};
  #name;
  #vendor;
  #model;
  #type;

  #bus;
  #device;
  #port;

  #scanning = false;
  #scanimage;

  #options = {
    formats: ["png"],
    modes: ["Color", "Gray"],
    resolutions: [75, 100, 150, 300, 600, 1200, 2400, 4800],
    depths: [8, 16]
  }

  constructor(options = {}) {
    super();
    this.#name = options.name;
    this.#vendor = options.vendor;
    this.#model = options.model;
    this.#type = options.type;
    this.#bus = options.bus;
    this.#device = options.device;
    this.#port = options.port;
  }

  get name() { return this.#name; }
  get vendor() { return this.#vendor; }
  get model() { return this.#model; }
  get type() { return this.#type; }
  get description() {
    return `${this.vendor} ${this.model}, ${this.name}, port ${this.port}`
  }

  get bus() { return this.#bus; }
  get device() { return this.#device; }
  get port() { return this.#port; }

  get scanning() { return this.#scanning; }
  get options() { return this.#options; }

  scan(options = {}) {

    // Ignore if already scanning
    if (this.scanning) {
      logWarn(`Already scanning on device ${this.name}. Ignoring.`)
      return;
    }

    // Start scan
    this.#scanning = true;
    logInfo(`Initiating scan on ${this.description}...`);
    this.emit("scanstarted", {target: this});

    // Prepare args array
    const args = [];

    // The device name is optional. If not specified, the first found scanner will be used.
    if (this.name) {
      args.push(`--device-name=${this.name}`);
    }

    // File format
    if (this.options.formats.includes(options.format)) {
      args.push('--format=' + options.format);
    } else {
      args.push('--format=png');
    }

    // Scanning mode
    if (this.options.modes.includes(options.mode)) {
      args.push('--mode=' + options.mode);
    } else {
      args.push('--mode=Color');
    }

    // Scanning bit depth
    if (this.options.depths.includes(options.mode)) {
      args.push('--depth=' + options.depth);
    } else {
      args.push('--depth=8');
    }

    // Scanning resolution
    if (this.options.resolutions.includes(options.resolution)) {
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

    // Scan to file (instead of stdout)
    // if (options.path) {
    //   args.push('--output-file=' + options.path)
    // }
    if (options.outputFile) {
      args.push('--output-file=' + options.outputFile)
    }

    // Initiate scanning
    const scanImageSpawner = new Spawner();

    scanImageSpawner.execute(
      "scanimage",
      args,
      {
        detached: true,
        sucessCallback: this.#onScanImageEnd.bind(this),
        errorCallback: this.#onScanImageError.bind(this)
      }
    );

  }

  #onScanImageError(error) {
    this.#scanimage = null;
    this.#scanning = false;
    this.emit("warning", error);
    logWarn("Warning: " + error);
  }

  #onScanImageEnd() {
    this.#scanimage = null;
    this.#scanning = false;
    this.emit("scancompleted", {target: this});
    logInfo(`Scan completed on ${this.description}`);
  }

  destroy() {
  }

}
