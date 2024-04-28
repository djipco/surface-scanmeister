// Node.js modules
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";

// Project classes
import {Configuration as config} from "../config/Configuration.js";
import {logInfo, logError, logWarn} from "./Logger.js"
import {Spawner} from "./Spawner.js";

export class Scanner extends EventEmitter {

  static RESOLUTIONS = [75, 100, 150, 300, 600, 1200, 2400, 4800];

  #bus;                 // USB bus the scanner is connected to
  #channel;             // Channel number (identifies the device in OSC and over TCP)
  #manufacturer;        // Manufacturer name of the device
  #model;               // Model name of the device
  #osc;                 // OSC port object for communication
  #ports = []           // Hierarchy of USB ports (as array)
  #scanning = false;    // Whether the device is currently scanning
  #systemName;          // System name (e.g. genesys:libusb:001:071)

  constructor(osc, descriptor = {}) {

    super();

    this.#bus = descriptor.busNumber;
    this.#channel = descriptor.channel;
    this.#manufacturer = descriptor.vendor;
    this.#model = descriptor.product;
    this.#osc = osc;
    this.#ports = descriptor.portNumbers;
    this.#systemName = descriptor.systemName;

  }

  get bus() { return this.#bus; }

  get ports() { return this.#ports; }

  get channel() { return this.#channel; }
  set channel(value) {
    this.#channel = parseInt(value);
    this.#sendOscMessage(
      `/device/${this.channel}/scanning`,
      [{type: "i", value: this.scanning ? 1 : 0}]
    );
  }

  get description() {
    return `${this.nameAndPort} (${this.systemName}).`;
  }

  get nameAndPort() {
    return `${this.name} connected to bus ${this.bus}, port ${this.ports.join("-").padEnd(5, " ")}`;
  }

  get name() {
    return `${this.manufacturer} ${this.model}`
  }

  get manufacturer() { return this.#manufacturer; }

  get model() { return this.#model; }

  get scanning() { return this.#scanning; }

  get systemName() { return this.#systemName; }

  async scan(options = {}) {

    // Ignore if already scanning
    if (this.scanning) {
      logWarn(`Already scanning with device ${this.nameAndPort}. Ignoring scan request.`)
      return;
    }

    // Start scan
    this.#scanning = true;
    logInfo(`Initiating scan on channel ${this.channel} with ${this.nameAndPort}...`);
    this.#sendOscMessage(`/device/${this.channel}/scanning`, [{type: "i", value: 1}]);

    // Initiate scanning
    this.scanImageSpawner = new Spawner();

    console.log(this.getScanCommandArgs(config, options));

    this.scanImageSpawner.execute(
      "scanimage",
      this.getScanCommandArgs(config, options),
      {
        detached: false,
        shell: false,
        sucessCallback: this.#onScanImageEnd.bind(this),
        errorCallback: this.#onScanImageError.bind(this),
        stderrCallback: this.#onScanImageStderr.bind(this)
      }
    );

    if (options.pipe) {
      this.scanImageSpawner.pipe(options.pipe, "stdout");
    }

  }

  getScanCommandArgs(config, options = {}) {

    const args = [];

    // The device name is optional. If not specified, the first found scanner will be used.
    if (this.systemName) args.push(`--device-name=${this.systemName}`);

    // File format
    args.push('--format=pnm');

    // Color mode
    args.push('--mode=Color');

    // Scanning bit depth (8-bit per channel, RGB)
    args.push('--depth=8');

    // Scanning resolution
    if (Scanner.RESOLUTIONS.includes(options.resolution)) {
      args.push('--resolution=' + options.resolution);
    }

    // Brightness (-100...100)
    args.push('--brightness=' + config.devices.brightness);

    // Contrast (-100...100)
    args.push('--contrast=' + config.devices.contrast);

    // Lamp off scan
    if (config.devices.lampOffScan) {
      args.push('--lamp-off-scan=yes');
    } else {
      args.push('--lamp-off-scan=no');
    }

    // Lamp off time
    args.push('--lamp-off-time=' + config.devices.lampOffTime);

    // Prevent cached calibration from expiring (not sure what it does!)
    args.push('--expiration-time=-1');

    // Go for smaller buffer (default is 32kB) to make the display of the scan more responsive
    args.push('--buffer-size=32');

    // Geometry
    args.push('-l ' + config.devices.x);
    args.push('-t ' + config.devices.y);
    args.push('-x ' + config.devices.width);
    args.push('-y ' + config.devices.height);

    return args;

  }

  async abort() {

    // Kill 'scanimage' process if running
    if (this.scanImageSpawner) {

      logInfo(`Stopping scanner on channel ${this.channel}...`);

      await this.scanImageSpawner.destroy();
      this.scanImageSpawner = undefined;

      // Leave some time for the scanner to go back to 'ready' position before marking it as
      // available.
      await new Promise(resolve => setTimeout(resolve, 4000));

    }

    // Send OSC update (wait a little so the messages can be properly sent)
    this.#scanning = false;
    this.#sendOscMessage(`/device/${this.channel}/scanning`, [{type: "i", value: 0}]);
    await new Promise(resolve => setTimeout(resolve, 50));

  }

  async destroy() {
    await this.abort();
    this.removeListener();
  }

  async #onScanImageStderr(data) {

    if (data.includes("Device busy")) {
      logWarn(`Device busy, cannot open: ${this.description}`);
    } else {
      logError(`STDERR with ${this.description}: ${data}.`);
    }

    this.emit("error", data);
    await this.abort();

  }

  #onScanImageError(error) {
    logWarn(error);
    this.emit("warning", error);
    this.abort();
  }

  #onScanImageEnd() {
    this.#scanning = false;
    this.scanImageSpawner = undefined;
    this.#sendOscMessage(`/device/${this.channel}/scanning`, [{type: "i", value: 0}]);
    this.emit("scancompleted", {target: this});
    logInfo(`Scan completed with ${this.nameAndPort}`);
  }

  #sendOscMessage(address, args = []) {
    if (!this.#osc || !this.#osc.socket) {
      logWarn("Impossible to send OSC, no socket available.")
      return;
    }
    this.#osc.send({address: address, args: args});
  }

}
