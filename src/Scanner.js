import {spawn} from 'child_process';
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import {logError, logInfo, logWarn} from "./Utils.js";
import {Spawner} from "./Spawner.js";
import {config} from "../config/config.js";

export class Scanner extends EventEmitter {

  #callbacks = {};
  #systemName;
  #manufacturer;
  #model;

  #bus;
  #hardwarePort;
  #softwarePort;
  #oscPort;

  #scanning = false;
  #scanimage;

  #options = {
    formats: ["png"],
    modes: ["Color", "Gray"],
    resolutions: [75, 100, 150, 300, 600, 1200, 2400, 4800],
    depths: [8, 16]
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
    return `${this.manufacturer} ${this.model} (${this.systemName}) on physical port #${this.hardwarePort}`
  }

  get bus() { return this.#bus; }
  get hardwarePort() { return this.#hardwarePort; }
  get softwarePort() { return this.#softwarePort; }

  get scanning() { return this.#scanning; }
  get options() { return this.#options; }

  scan(options = {}) {

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
    if (!!options.lampOffScan) {
      args.push('--lamp-off-scan=yes');
    } else {
      args.push('--lamp-off-scan=no');
    }

    // Ask to report progress on stderr
    args.push('--progress');
    // args.push('--preview');
    args.push('--buffer-size=32'); // default is 32KB

    // Scan to file (instead of stdout)
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
        errorCallback: this.#onScanImageError.bind(this),
        stderrCallback: this.#onScanImageStderr.bind(this)
      }
    );

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
    this.#scanimage = null;
    this.#scanning = false;
    this.emit("warning", error);
    logWarn("Warning: " + error);
  }

  #onScanImageEnd() {
    this.#scanimage = null;
    this.#scanning = false;
    this.sendOscMessage(`/device/${this.hardwarePort}/scanning`, [{type: "i", value: 0}]);
    this.sendOscMessage(`/device/${this.hardwarePort}/progress`, [{type: "f", value: 0}]);
    this.emit("scancompleted", {target: this});
    logInfo(`Scan completed on ${this.description}`);
  }

  sendOscMessage(address, args = []) {
    if (!this.#oscPort.socket) {
      logWarn("Warning: impossible to send OSC, no socket available.")
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
