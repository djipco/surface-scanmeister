// Node.js standard imports
import http from 'http';

// Application imports
import {Spawner} from "./Spawner.js";
import {Configuration as config} from "../config/Configuration.js";
import {logError, logInfo, logWarn} from "./Logger.js";
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import Client from "./Client.js";

export class Server extends EventEmitter {

  static COMMANDS = ["scan"];

  #callbacks = {};
  #clients = [];
  #httpServer = undefined;
  #scanners = undefined;
  #spawners = [];

  constructor() {
    super();
  }

  #onClientConnection(socket) {
    logInfo(`New connection from ${socket.remoteAddress}:${socket.remotePort}.`);
  }

  #onClientRequest(request, response)  {

    // Parse the path of the URL and split it into segments
    const url = new URL(request.url, `http://${request.headers.host}`);
    const segments = url.pathname.split('/').slice(1);

    const command = segments[0];
    const channel = parseInt(segments[1]) || 0;

    // Check validity of request (expecting /scan or /scan/x where x is the channel number expressed
    // as an int). When the channel is not specified, channel 0 is used.
    if (
      segments.length < 1 ||
      ! Server.COMMANDS.includes(command)
    ) {
      logInfo(
        `Invalid request from ${request.socket.remoteAddress}:${request.socket.remotePort}. ` +
        `Closing connection.`
      );
      response.writeHead(400, {'Content-Type': 'text/plain'});
      response.end('Invalid request', 'utf-8', request.socket.destroy());
      return;
    }

    // Check if channel is already in use
    if (this.#clients.find(client => client.channel === channel)) {
      logWarn(
        `The scanning request from ${request.socket.remoteAddress}:${request.socket.remotePort} ` +
        `was canceled because channel ${channel} is already in use.`
      );
      response.end('Channel already in use.', 'utf-8', request.socket.destroy());
      return;
    }

    // If we make it here, the request is valid and so we create a new Client. A client corresponds
    // to a single, valid, remote connection.
    const client = new Client(request.socket, {channel});
    this.#clients[client.id] = client;

    // // // Add callback
    // // this.#callbacks.onClientDestroy = event => this.#onClientDestroy(event, client);
    // // client.addListener("destroy", this.#callbacks.onClientDestroy);

    // Quickly send answer in the form of a proper HTTP header (there's no official MIME type for
    // PNM format).
    response.writeHead(200, { 'Content-Type': 'application/octet-stream' });


    response.end("done")



    // // Create the Spawner object
    // this.#spawners[channel] = new Spawner();
    // logInfo(`Initiating scan on channel ${channel} for client ${clientId}...`);
    //
    // // Define error callback
    // const onScanError = async err => {
    //   response.end('Failed to scan');
    //   await this.#spawners[channel].destroy();
    //   client.channel = undefined;
    //   logWarn(`Could not execute scan command: ${err}`);
    // }
    //
    // // Define success callback
    // const onScanSuccess = () => {
    //   client.channel = undefined;
    //   logInfo(`Scan on channel ${channel} successfully completed.`);
    // }
    //
    // client.scanSpawner.execute(
    //   "scanimage",
    //   this.#getScanimageArgs(channel),
    //   {
    //     detached: false,
    //     shell: false,
    //     sucessCallback: client.callbacks.onScanSuccess,
    //     errorCallback: client.callbacks.onScanError,
    //     stderrCallback: client.callbacks.onScanError
    //   }
    // );
    //
    // // Pipe the output to the response
    // client.scanSpawner.pipe(response, "stdout");

  }

  // async #onClientDestroy(event, client) {
  //   delete this.#clients[client.id];
  // }
  //
  // #onServerError(err) {
  //   this.emit("error", `Cannot start HTTP server. ${err}.`);
  // }

  destroyClient(id) {

  }

  async start(scanners, options = {port: 5678}) {

    if (!Array.isArray(scanners)) {
      logError("An array of Scanner objects must be specified to start the Server.");
      return;
    }

    this.#scanners = scanners;

    // Create HTTP server
    this.#httpServer = http.createServer();

    // Add callbacks
    this.#callbacks.onClientConnection = this.#onClientConnection.bind(this);
    this.#httpServer.on('connection', this.#callbacks.onClientConnection);
    this.#callbacks.onClientRequest = this.#onClientRequest.bind(this);
    this.#httpServer.on("request", this.#callbacks.onClientRequest);
    // this.#callbacks.onServerError = this.#onServerError.bind(this);
    // this.#httpServer.on("error", this.#callbacks.onServerError);

    // Start server
    await new Promise((resolve, reject) => {
      this.#httpServer.listen(options.port, err => {
        if (err) reject("Could not start HTTP server");
        resolve();
      });
    });

  }

  // getScannerSystemName(channel) {
  //   const scanner = this.#scanners.find(scanner => scanner.channel === channel);
  //   if (scanner) return scanner.systemName;
  // }
  //
  // #getScanimageArgs(channel) {
  //
  //   // Prepare 'scanimage' args array
  //   const args = [];
  //
  //   // The device name is optional. If not specified, the first found scanner will be used.
  //   const scannerSystemName = this.getScannerSystemName(channel);
  //   if (scannerSystemName) args.push(`--device-name=${scannerSystemName}`);
  //
  //   // File format and output
  //   args.push('--format=pnm');
  //
  //   // Color mode
  //   args.push('--mode=Color');
  //
  //   // Scanning bit depth (8-bit per channel, RGB)
  //   args.push('--depth=8');
  //
  //   // Scanning resolution
  //   args.push('--resolution=' + config.devices.resolution);
  //
  //   // Brightness (-100...100)
  //   args.push('--brightness=' + config.devices.brightness);
  //
  //   // Contrast (-100...100)
  //   args.push('--contrast=' + config.devices.contrast);
  //
  //   // Lamp off scan
  //   if (config.devices.lampOffScan) {
  //     args.push('--lamp-off-scan=yes');
  //   } else {
  //     args.push('--lamp-off-scan=no');
  //   }
  //
  //   // Lamp off time
  //   args.push('--lamp-off-time=' + config.devices.lampOffTime);
  //
  //   // Prevent cached calibration from expiring (not sure what it does!)
  //   args.push('--expiration-time=-1');
  //
  //   // Buffer size (default is 32kB)
  //   args.push('--buffer-size=32');
  //
  //   // Geometry
  //   args.push('-l ' + config.devices.x);
  //   args.push('-t ' + config.devices.y);
  //   args.push('-x ' + config.devices.width);
  //   args.push('-y ' + config.devices.height);
  //
  //   return args;
  //
  // }
  //
  // quit() {
  //
  //   // Object.values(this.#scanProcesses).forEach(value => {
  //   //   console.log(value);
  //   // });
  //
  //   if (this.#httpServer) {
  //     this.#httpServer.removeAllListeners();
  //     this.#httpServer.close();
  //     this.#httpServer.closeAllConnections();
  //     this.#httpServer.unref();
  //   }
  //
  //   this.#callbacks.onClientRequest = undefined;
  //   this.#callbacks.onServerError = undefined;
  //
  // }

}




