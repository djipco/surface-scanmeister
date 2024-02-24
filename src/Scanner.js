// Node.js modules
import net from "net";
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";

// Project classes
import {logInfo, logError, logWarn} from "./Logger.js"
import {Spawner} from "./Spawner.js";
import {config} from "../config/config.js";

export class Scanner extends EventEmitter {

  #args; /////////////// <-
  #callbacks = {};
  #channel;
  #hardwarePort;
  #hubName;
  #hubPort;
  #manufacturer;
  #model;
  #osc;
  #scanning = false;
  #systemName;

  constructor(osc, options = {}) {

    super();


    console.log(options);

    // OSC port object for communication
    this.#osc = osc;

    // Physical USB port as printed on the USB hub
    this.#hardwarePort = parseInt(options.hardwarePort);

    // Name and model of the USB hub the device is connected to
    this.#hubName = options.hub;

    // Port number of the hub
    this.#hubPort = parseInt(options.hubPort);

    // Manufacturer name of the device
    this.#manufacturer = options.manufacturer;

    // Model name of the device
    this.#model = options.model;

    // System name (e.g. genesys:libusb:001:071)
    this.#systemName = options.systemName;

  }

  get systemName() { return this.#systemName; }

  get manufacturer() { return this.#manufacturer; }

  get model() { return this.#model; }

  get description() {
    return `"${this.manufacturer} ${this.model}" connected to port #${this.hardwarePort} ` +
      `(${this.systemName}) of "${this.hubName}" via port ${this.#hubPort} of host.`;
  }

  get hardwarePort() { return this.#hardwarePort; }

  get hub() { return this.#hubName; }
  get hubPort() { return this.#hubPort; }

  get scanning() { return this.#scanning; }

  get channel() { return this.#channel; }
  set channel(value) {
    this.#channel = parseInt(value);
    this.sendOscMessage(
      `/device/${this.channel}/scanning`,
      [{type: "i", value: this.scanning ? 1 : 0}]
    );
  }

  async scan(options = {}) {

    // Ignore if already scanning
    if (this.scanning) {
      logWarn(`Already scanning with device ${this.description}. Ignoring.`)
      return;
    }

    // Start scan
    this.#scanning = true;
    logInfo(`Initiating scan on ${this.description}...`);
    this.sendOscMessage(`/device/${this.channel}/scanning`, [{type: "i", value: 1}]);
    this.emit("scanstarted", {target: this});

    // Prepare args array
    this.#args = [];

    // The device name is optional. If not specified, the first found scanner will be used.
    if (this.systemName) {
      this.#args.push(`--device-name=${this.systemName}`);
    }

    // File format and output
    if (config.get("operation.mode") === "file") {
      this.#args.push('--format=png');
      if (options.outputFile) {
        this.#args.push('--output-file=' + options.outputFile)
      }
    } else if (config.get("operation.mode") === "tcp") {
      this.#args.push('--format=pnm');
    } else {
      throw new Error(`Invalid operation mode: ${config.get("operation.mode")}`)
    }

    // Color mode
    this.#args.push('--mode=Color');

    // Scanning bit depth
    this.#args.push('--depth=8'); // 8-bit per channel (RGB)

    // Scanning resolution
    this.#args.push('--resolution=' + config.get("devices.resolution"));

    // Brightness (-100...100)
    this.#args.push('--brightness=' + config.get("devices.brightness"));

    // Contrast (-100...100)
    this.#args.push('--contrast=' + config.get("devices.contrast"));

    // Lamp off time

    // Lamp off scan
    if (config.get("devices.lampOffScan")) {
      this.#args.push('--lamp-off-scan=yes');
    } else {
      this.#args.push('--lamp-off-scan=no');
    }

    // Prevent cached calibration from expiring (not sure what it does!)
    this.#args.push('--expiration-time=-1');

    // Go for smaller buffer (default is 32kB) to make the display of the scan more responsive
    this.#args.push('--buffer-size=16');


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

    }

    // Send the device's hardware port so TD knows which scanners it's receiving from
    this.tcpSocket.write("# Channel = " + this.channel + "\n");

    // Initiate scanning
    this.scanImageSpawner = new Spawner();

    this.scanImageSpawner.execute(
      "scanimage",
      this.#args,
      {
        // detached: true,
        detached: false,
        shell: false,
        sucessCallback: this.#onScanImageEnd.bind(this),
        errorCallback: this.#onScanImageError.bind(this),
        stderrCallback: this.#onScanImageStderr.bind(this)
      }
    );

    this.scanImageSpawner.pipe(this.tcpSocket, "stdout");

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
    logError(`STDERR with ${this.description}: ${data}. Arguments: ${this.#args}`);
  }

  #onScanImageError(error) {
    this.#scanning = false;
    this.emit("warning", error);
    logWarn(error);
  }

  #onScanImageEnd() {
    this.#scanning = false;
    this.sendOscMessage(`/device/${this.channel}/scanning`, [{type: "i", value: 0}]);
    this.emit("scancompleted", {target: this});
    logInfo(`Scan completed on ${this.description}`);
  }

  sendOscMessage(address, args = []) {
    if (!this.#osc || !this.#osc.socket) {
      logWarn("Impossible to send OSC, no socket available.")
      return;
    }
    this.#osc.send({address: address, args: args});
  }

  async destroy() {
    this.sendOscMessage(`/device/${this.channel}/scanning`, [{type: "i", value: 0}]);
    this.removeListener();
    await new Promise(resolve => setTimeout(resolve, 25));
  }

}
