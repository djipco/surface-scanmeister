// Node.js modules
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";

// Project classes
import {Configuration as config} from "../config/Configuration.js";
import {Logger} from "./Logger.js";
import {ShellCommand} from "./ShellCommand.js";
import {Spawner} from "./Spawner.js";

export class Scanner extends EventEmitter {

  #bus;                 // USB bus the scanner is connected to
  #channel;             // Channel number (identifies the device in OSC and over TCP)
  #manufacturer;        // Manufacturer name of the device
  #model;               // Model name of the device
  #osc;                 // OSC port object for communication
  #ports = []           // Hierarchy of USB ports (as array)
  #scanning = false;    // Whether the device is currently scanning
  #systemName;          // System name (e.g. genesys:libusb:001:071)
  #abortPromise = undefined;
  #scanStartedAt = null;
  #scanImageSpawner = undefined;

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
      Logger.warn(`Already scanning with device ${this.nameAndPort}. Ignoring scan request.`)
      return;
    }

    // Start scan
    this.#setScanning(true);
    Logger.info(`Initiating scan on channel ${this.channel} with ${this.nameAndPort}...`);
    Logger.info(
      `Scan parameters for channel ${this.channel}: ` +
      `resolution=${options.resolution}, width=${options.width}, height=${options.height}, ` +
      `brightness=${options.brightness}, contrast=${options.contrast}, ` +
      `forceCalibration=${options.forceCalibration === true}`
    );
    // Initiate scanning
    this.#scanImageSpawner = new Spawner();
    const args = this.getScanCommandArgs(options);
    Logger.info(
      `${config.scan.command} command for channel ${this.channel}: ` +
      ShellCommand.format(config.scan.command, args)
    );

    this.#scanImageSpawner.execute(
      config.scan.command,
      args,
      {
        detached: false,
        shell: false,
        successCallback: this.#onScanImageEnd.bind(this),
        errorCallback: this.#onScanImageError.bind(this),
        stderrCallback: this.#onScanImageStderr.bind(this),
        closeCallback: this.#onScanImageClose.bind(this)
      }
    );
    Logger.info(
      `${config.scan.command} started for channel ${this.channel} ` +
      `with PID ${this.#scanImageSpawner.pid}.`
    );

    if (options.pipe) {
      this.#scanImageSpawner.pipe(options.pipe, "stdout");
    }

  }

  getScanCommandArgs(options = {}) {

    const args = [];

    // The device name is optional. If not specified, the first found scanner will be used.
    if (this.systemName) args.push(`--device-name=${this.systemName}`);

    // File format
    args.push(`--format=${config.scan.format}`);

    // Color mode
    args.push(`--mode=${config.scan.mode}`);

    // Scanning bit depth (8-bit per channel, RGB)
    args.push(`--depth=${config.scan.depth}`);

    // Scanning resolution
    if (config.scan.resolutions.includes(options.resolution)) {
      args.push('--resolution=' + options.resolution);
    }

    // Brightness (-100...100)
    if (options.brightness >= config.scan.brightness.min && options.brightness <= config.scan.brightness.max) {
      args.push('--brightness=' + options.brightness);
    }

    // Contrast (-100...100)
    if (options.contrast >= config.scan.contrast.min && options.contrast <= config.scan.contrast.max) {
      args.push('--contrast=' + options.contrast);
    }

    // Scan height in the physical installation maps to SANE's x-axis.
    if (options.height >= 0 && options.height <= config.scan.maxHeight) {
      args.push('-x', options.height.toString());
    }

    // Scan width in the physical installation maps to SANE's y-axis.
    if (options.width >= 0 && options.width <= config.scan.maxWidth) {
      args.push('-y', options.width.toString());
    }

    // Ignore cached calibration and recalibrate when requested.
    if (options.forceCalibration === true) {
      args.push('--force-calibration');
    }

    // Lamp off scan
    if (config.scan.lampOffScan) {
      args.push('--lamp-off-scan=yes');
    } else {
      args.push('--lamp-off-scan=no');
    }

    // Lamp off time
    args.push('--lamp-off-time=' + config.scan.lampOffTime);

    // Prevent cached calibration from expiring (not sure what it does!)
    args.push(`--expiration-time=${config.scan.expirationTime}`);

    // We make the buffer proportional to the scanning resolution so the data is sent as fast as
    // it's coming from the scanner but not faster.
    if (config.scan.resolutions.includes(options.resolution)) {
      const multiplier = parseInt(options.resolution / config.scan.bufferBaseResolution);
      const res = multiplier * multiplier * config.scan.bufferBaseSize;
      args.push(`--buffer-size=${res}`);
    } else {
      args.push(`--buffer-size=${config.scan.fallbackBufferSize}`);
    }

    return args;

  }

  async abort(reason = "cancelled") {
    if (this.#abortPromise) return this.#abortPromise;

    this.#abortPromise = this.#abort(reason);
    try {
      await this.#abortPromise;
    } finally {
      this.#abortPromise = undefined;
    }
  }

  async #abort(reason) {

    // Kill the scanner command if it is running.
    if (this.#scanImageSpawner) {

      const durationMs = this.#getScanDurationMs();
      Logger.info(`Stopping scanner on channel ${this.channel}...`);

      await this.#scanImageSpawner.destroy();
      this.#scanImageSpawner = undefined;
      Logger.info(
        `Scan ${reason} on channel ${this.channel}` +
        (durationMs === null ? "" : ` after ${this.#formatDuration(durationMs)}`) +
        "."
      );

      // Leave some time for the scanner to go back to 'ready' position before marking it as
      // available.
      await new Promise(resolve => setTimeout(resolve, config.scan.recoveryDelay));

    }

    // Send OSC update (wait a little so the messages can be properly sent)
    this.#setScanning(false);
    await new Promise(resolve => setTimeout(resolve, 50));

  }

  async destroy() {
    await this.abort("destroyed");
    this.removeListener();
  }

  async #onScanImageStderr(data) {

    if (data.includes("Device busy")) {
      Logger.warn(`Device busy, cannot open: ${this.description}`);
    } else {
      Logger.warn(`${config.scan.command} stderr with ${this.description}: ${data}.`);
    }

  }

  #onScanImageError(error) {
    const message = error.message || error;
    Logger.warn(message);
    this.emit("error", message);
    this.abort("failed");
  }

  #onScanImageEnd() {
    const durationMs = this.#getScanDurationMs();
    this.#scanImageSpawner = undefined;
    this.#setScanning(false);
    this.emit("scancompleted", {target: this});
    Logger.info(
      `Scan completed with ${this.nameAndPort}` +
      (durationMs === null ? "" : ` in ${this.#formatDuration(durationMs)}`) +
      "."
    );
  }

  #formatDuration(durationMs) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  #getScanDurationMs() {
    return this.#scanStartedAt ? Date.now() - this.#scanStartedAt : null;
  }

  #setScanning(scanning) {
    this.#scanning = scanning;
    this.#scanStartedAt = scanning ? Date.now() : null;
    this.#sendOscMessage(
      `/device/${this.channel}/scanning`,
      [{type: "i", value: scanning ? 1 : 0}]
    );
  }

  #onScanImageClose({code, signal}) {
    Logger.info(
      `${config.scan.command} process for channel ${this.channel} closed ` +
      `with code ${code ?? "none"} and signal ${signal ?? "none"}.`
    );
  }

  #sendOscMessage(address, args = []) {
    if (!this.#osc || !this.#osc.socket) {
      Logger.warn("Impossible to send OSC, no socket available.")
      return;
    }
    this.#osc.send({address: address, args: args});
    this.emit("oscmessage", {address, args});
  }

}
