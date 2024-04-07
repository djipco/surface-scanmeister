import http from 'http';
import {Spawner} from "./Spawner.js";
import {Configuration as config} from "../config/Configuration.js";
import {logInfo, logWarn} from "./Logger.js";

export class Server {

  #callbacks = {};
  #httpServer = undefined;
  #scanners = undefined;

  constructor(scanners) {
    this.#scanners = scanners || [];
  }

  async start(options = {port: 80}) {

    // Create a server and set a callback for client requests
    this.#callbacks.onClientRequest = this.#onClientRequest.bind(this);
    this.#httpServer = http.createServer(this.#callbacks.onClientRequest);

    // Start server
    await new Promise((resolve, reject) => {

      try {
        this.#httpServer.listen(options.port, err => {
          if (err) reject("Could not start HTTP server");
          resolve();
        });
      } catch (err) {
        reject(err);
      }

    });

  }

  #onClientRequest(req, res)  {

    // Parse the URL and split it into segments
    const url = new URL(req.url, `http://${req.headers.host}`);
    const segments = url.pathname.split('/');

    // Check validity of request (expecting /channel/x where x is an int). Not specifying a channel
    // is also acceptable. In this case, the default scanner will be used.
    if (
      segments.length < 2 ||
      segments[0] !== 'scan'
    ) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid request');
      return;
    }

    // If the client closes the connection, kill the scanning process (if any)
    this.#callbacks.onClientClose = this.#onClientClose.bind(this);
    req.on('close', this.#callbacks.onClientClose);

    // Send proper HTTP header (there's no official MIME type for PNM format)
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });

    // Channel
    const channel = segments[1] || 0;

    // Spawn the scanning process
    this.scanImageSpawner = new Spawner();

    this.#callbacks.onScanimageError = err => this.#onScanimageError(err, res);
    this.#callbacks.onScanSuccess = () => this.#onScanSuccess(channel);


    logInfo(`Initiating scan on channel ${channel}...`);

    this.scanImageSpawner.execute(
      "scanimage",
      this.#getScanimageArgs(channel),
      {
        detached: false,
        shell: false,
        sucessCallback: this.#callbacks.onScanSuccess,
        errorCallback: this.#callbacks.onScanimageError,
        stderrCallback: this.#callbacks.onScanimageError
      }
    );

    // Pipe the output to the response
    this.scanImageSpawner.pipe(res, "stdout");

  }

  #onScanSuccess(channel) {
    logInfo(`Scan on channel ${channel} successfully completed.`)
  }

  #onScanimageError(err, res) {
    res.end('Failed to scan');
    logWarn(`Could not execute scan command: ${err}`);
  }

  async #onClientClose() {

    this.#callbacks.onClientClose = undefined;

    if (this.scanImageSpawner) {
      await this.scanImageSpawner.destroy();
      this.scanImageSpawner = undefined;
    }

  }

  getScannerSystemName(channel) {
    const scanner = this.#scanners.find(scanner => scanner.channel === channel);
    if (scanner) return scanner.systemName;
  }

  #getScanimageArgs(channel) {

    // Prepare 'scanimage' args array
    const args = [];

    // The device name is optional. If not specified, the first found scanner will be used.
    const scannerSystemName = this.getScannerSystemName(channel);
    if (scannerSystemName) args.push(`--device-name=${scannerSystemName}`);

    // File format and output
    args.push('--format=pnm');

    // Color mode
    args.push('--mode=Color');

    // Scanning bit depth (8-bit per channel, RGB)
    args.push('--depth=8');

    // Scanning resolution
    args.push('--resolution=' + config.devices.resolution);

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

    // Buffer size (default is 32kB)
    args.push('--buffer-size=32');

    // Geometry
    args.push('-l ' + config.devices.x);
    args.push('-t ' + config.devices.y);
    args.push('-x ' + config.devices.width);
    args.push('-y ' + config.devices.height);

    return args;

  }

  quit() {
  //   à compléter
  }

}




