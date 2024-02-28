// Node.js modules
import net from "net";
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";

// Project classes
import {logInfo, logError, logWarn} from "./Logger.js"
import {Spawner} from "./Spawner.js";
import {config} from "../config/config.js";

export class Scanner extends EventEmitter {

  #callbacks = {};      // Object to store callbacks defined internally
  #channel;             // Channel number (identifies the device in OSC and over TCP)
  #hardwarePort;        // Physical USB port as printed on the USB hub
  #hub;                 // A descriptor object for the hub
  #manufacturer;        // Manufacturer name of the device
  #model;               // Model name of the device
  #osc;                 // OSC port object for communication
  #scanArgs;            // Arguments passed to 'scanimage' (kept for error reporting)
  #scanning = false;    // Whether the device is currently scanning
  #systemName;          // System name (e.g. genesys:libusb:001:071)

  constructor(osc, options = {}) {

    super();

    this.#osc = osc;
    this.#hardwarePort = parseInt(options.port);
    this.#hub = options.hub;
    this.#manufacturer = options.manufacturer;
    this.#model = options.model;
    this.#systemName = options.systemName;

  }

  get channel() { return this.#channel; }
  set channel(value) {
    this.#channel = parseInt(value);
    this.#sendOscMessage(
      `/device/${this.channel}/scanning`,
      [{type: "i", value: this.scanning ? 1 : 0}]
    );
  }

  get description() {
    return `${this.nameAndPort} (${this.systemName}). ` +
      `Connected via ${this.hubName} on bus ${this.#hub.bus}, port ${this.hubPort}.`;
  }

  get nameAndPort() {
    return `${this.name} on port #${this.hardwarePort}`;
  }

  get name() {
    return `${this.manufacturer} ${this.model}`
  }

  get hardwarePort() { return this.#hardwarePort; }

  get hubName() {
    return `${this.#hub.manufacturer} ${this.#hub.model}`
  }

  get hubPort() { return this.#hub.port; }

  get manufacturer() { return this.#manufacturer; }

  get model() { return this.#model; }

  get scanning() { return this.#scanning; }

  get systemName() { return this.#systemName; }

  async scan(options = {}) {

    // Ignore if already scanning
    if (this.scanning) {
      logWarn(`Already scanning with device ${this.nameAndPort}. Ignoring.`)
      return;
    }

    // Start scan
    this.#scanning = true;
    logInfo(`Initiating scan on channel ${this.channel} with ${this.nameAndPort}...`);
    this.#sendOscMessage(`/device/${this.channel}/scanning`, [{type: "i", value: 1}]);

    // Prepare 'scanimage' args array
    this.#scanArgs = [];

    // The device name is optional. If not specified, the first found scanner will be used.
    if (this.systemName) {
      this.#scanArgs.push(`--device-name=${this.systemName}`);
    }

    // File format and output
    if (config.get("operation.mode") === "file") {
      this.#scanArgs.push('--format=png');
      if (options.outputFile) this.#scanArgs.push('--output-file=' + options.outputFile);
    } else if (config.get("operation.mode") === "tcp") {
      this.#scanArgs.push('--format=pnm');
    } else {
      throw new Error(`Invalid operation mode: ${config.get("operation.mode")}`)
    }

    // Color mode
    this.#scanArgs.push('--mode=Color');

    // Scanning bit depth (8-bit per channel, RGB)
    this.#scanArgs.push('--depth=8');

    // Scanning resolution
    this.#scanArgs.push('--resolution=' + config.get("devices.resolution"));

    // Brightness (-100...100)
    this.#scanArgs.push('--brightness=' + config.get("devices.brightness"));

    // Contrast (-100...100)
    this.#scanArgs.push('--contrast=' + config.get("devices.contrast"));

    // Lamp off scan
    if (config.get("devices.lampOffScan")) {
      this.#scanArgs.push('--lamp-off-scan=yes');
    } else {
      this.#scanArgs.push('--lamp-off-scan=no');
    }

    // Lamp off time
    this.#scanArgs.push('--lamp-off-time=' + config.get("devices.lampOffTime"));

    // Prevent cached calibration from expiring (not sure what it does!)
    this.#scanArgs.push('--expiration-time=-1');

    // Go for smaller buffer (default is 32kB) to make the display of the scan more responsive
    this.#scanArgs.push('--buffer-size=16');

    // Geometry
    this.#scanArgs.push('-l ' + config.get("devices.x"));
    this.#scanArgs.push('-t ' + config.get("devices.y"));
    this.#scanArgs.push('-x ' + config.get("devices.width"));
    this.#scanArgs.push('-y ' + config.get("devices.height"));

    // If we are using the "tcp" mode, we create a TCP client and connect to server
    if (config.get("operation.mode") === "tcp") {

      await new Promise(resolve => {

        this.tcpSocket = net.createConnection(
          { port: config.get("tcp.port"), host: config.get("tcp.address") },
          resolve
        );

        this.#callbacks.onTcpSocketError = this.#onTcpSocketError.bind(this);
        this.tcpSocket.on("error", this.#callbacks.onTcpSocketError);

      });

      // Send the device's hardware port so TD knows which scanners it's receiving from
      this.tcpSocket.write("# Channel = " + this.channel + "\n");

    }

    // Initiate scanning
    this.scanImageSpawner = new Spawner();

    this.scanImageSpawner.execute(
      "scanimage",
      this.#scanArgs,
      {
        // detached: true,
        detached: false,
        shell: true,
        sucessCallback: this.#onScanImageEnd.bind(this),
        errorCallback: this.#onScanImageError.bind(this),
        stderrCallback: this.#onScanImageStderr.bind(this)
      }
    );





    // this.scanImageSpawner.execute(
    //   "bash",
    //   `-c 'scanimage ${this.#scanArgs.join(" ")}'`,
    //   {
    //     // detached: true,
    //     detached: false,
    //     shell: false,
    //     sucessCallback: this.#onScanImageEnd.bind(this),
    //     errorCallback: this.#onScanImageError.bind(this),
    //     stderrCallback: this.#onScanImageStderr.bind(this)
    //   }
    // );



    if (config.get("operation.mode") === "tcp") {
      this.scanImageSpawner.pipe(this.tcpSocket, "stdout");
    }

  }

  async destroy() {
    this.#sendOscMessage(`/device/${this.channel}/scanning`, [{type: "i", value: 0}]);
    this.removeListener();
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  #onTcpSocketError(error) {
    if (error.code === "EHOSTUNREACH") {
      logWarn(`Unable to open TCP connection to ${error.address}:${error.port}.`)
    } else {
      logWarn(error);
    }
  }

  #onScanImageStderr(data) {
    this.#scanning = false;
    this.emit("error", data);
    logError(`STDERR with ${this.description}: ${data}. Arguments: ${this.#scanArgs}`);
  }

  #onScanImageError(error) {
    this.#scanning = false;
    this.emit("warning", error);
    logWarn(error);
  }

  #onScanImageEnd() {
    this.#scanning = false;
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
