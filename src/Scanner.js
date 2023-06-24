import {spawn} from 'child_process'
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js"
import {logError, logInfo, logWarn} from "./Utils.js";
import fs from "fs";

export class Scanner extends EventEmitter {

  #callbacks = {};
  #name;
  #vendor;
  #model;
  #type;
  #index;
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
    this.#index = options.index;
  }

  get name() { return this.#name; }
  get vendor() { return this.#vendor; }
  get model() { return this.#model; }
  get type() { return this.#type; }
  get index() { return this.#index; }
  get scanning() { return this.#scanning; }
  get options() { return this.#options; }

  scan(options = {}) {

    // Ignore if already scanning
    if (this.scanning) {
      logWarn(`Already scanning on device ${this.name}. Ignoring.`)
      return;
    }

    // Make sure target dir exists
    if (fs.existsSync(path)) {
      // Do something
    }

    // Start scan
    this.#scanning = true;
    logInfo(`Initiating scan on ${this.name}...`);
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
    if (options.path) {
      args.push('--output-file=' + options.path)
    }

    // Initiate scanning
    this.#scanimage = spawn(
      'scanimage',
      args,
      {detached: true}
    );

    this.#addScanImageCallbacks();

    // If not scanning to file, return stdout for further handling
    // e.g.: this.devices[index].scan().pipe(fs.createWriteStream(`image${index}.png`));
    if (!options.path) return this.#scanimage.stdout;

  }

  #addScanImageCallbacks() {
    this.#callbacks.onScanImageError = this.#onScanImageError.bind(this);
    this.#callbacks.onScanImageEnd = this.#onScanImageEnd.bind(this);
    this.#scanimage.once('error', this.#callbacks.onScanImageError);
    this.#scanimage.stderr.once('data', this.#callbacks.onScanImageError);
    this.#scanimage.stdout.once('end', this.#callbacks.onScanImageEnd);
  }

  #removeScanImageCallbacks() {

    if (this.#callbacks.onScanImageError) {
      this.#scanimage.off('error', this.#callbacks.onScanImageError);
      this.#scanimage.stderr.off('data', this.#callbacks.onScanImageError);
    }

    if (this.#callbacks.onScanImageEnd) {
      this.#scanimage.stdout.off('end', this.#callbacks.onScanImageEnd);
    }

    this.#callbacks.onScanImageError = null;
    this.#callbacks.onScanImageEnd = null;

  }

  #onScanImageError(error) {
    this.#removeScanImageCallbacks();
    this.#scanimage = null;
    this.#scanning = false;
    this.emit("error", error);
    logError(error);
  }

  #onScanImageEnd() {
    this.#removeScanImageCallbacks();
    this.#scanimage = null;
    this.#scanning = false;
    this.emit("scancompleted", {target: this});
    logInfo(`Scan completed on ${this.name}`);
  }

  scanToFile(path, options = {}) {
    options.outputFile = path;
    return this.scan(options);
  }

  destroy() {
    this.#removeScanImageCallbacks();
  }

}
