// Node.js modules
import net from "net";

// Project classes
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import {logInfo, logError, logWarn} from "./Logger.js"
import {Spawner} from "./Spawner.js";
import {config} from "../config/config.js";


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
  #args;
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
    return `${this.manufacturer} ${this.model} on ${this.description} port #${this.hardwarePort} (${this.systemName})`;
  }

  get bus() { return this.#bus; }

  get hardwarePort() { return this.#hardwarePort; }

  get softwarePort() { return this.#softwarePort; }

  get scanning() { return this.#scanning; }

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

    // Ask to report progress on stderr
    // this.#args.push('--progress');

    // Go for smaller buffer (default is 32kB) to make the display of the scan more responsive
    this.#args.push('--buffer-size=8'); // default is 32KB


    // If we are using the "tcp" mode, we create a TCP client and connect to server
    if (config.get("operation.mode") === "tcp") {

      await new Promise(resolve => {

        this.socket = net.createConnection(
          { port: config.get("tcp.port"), host: config.get("tcp.address") },
          resolve
        );

      });

    }

    // Send the device's hardware port so TD knows which scanners it's receiving from
    this.socket.write("# Channel = " + this.hardwarePort + "\n");

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

    this.scanImageSpawner.pipe(this.socket, "stdout");

  }

  #onScanImageStderr(data) {

    // let [prefix, percentage] = data.split(": ");
    //
    // // When called with the --progress switch, scanimage reports progress on stderr
    // if (prefix !== "Progress") {
      this.emit("error", data);
      logError(`STDERR with ${this.description}: ${data}. Arguments: ${this.#args}`);
    // } else {
    //   percentage = parseFloat(percentage.slice(0, -1)) / 100;
    //   this.sendOscMessage(`/device/${this.hardwarePort}/progress`, [{type: "f", value: percentage}]);
    // }

  }

  #onScanImageError(error) {
    this.#scanning = false;
    this.emit("warning", error);
    logWarn(error);
  }

  #onScanImageEnd() {
    this.#scanning = false;
    this.sendOscMessage(`/device/${this.hardwarePort}/scanning`, [{type: "i", value: 0}]);
    // this.sendOscMessage(`/device/${this.hardwarePort}/progress`, [{type: "f", value: 0}]);
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

  async destroy() {
    this.sendOscMessage(`/device/${this.hardwarePort}/scanning`, [{type: "i", value: 0}]);
    // this.sendOscMessage(`/device/${this.hardwarePort}/progress`, [{type: "f", value: 0}]);
    this.removeListener();
    await new Promise(resolve => setTimeout(resolve, 25));
  }

}
