// Node.js standard imports
import http from 'node:http';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Application imports
import {logError, logInfo, logWarn} from "./Logger.js";
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import Client from "./Client.js";

export class Server extends EventEmitter {

  // Static members
  static COMMANDS = ["scan"];       // Valid commands (first part of the URL)
  static ALLOWED_STATIC_FILE_EXTENSIONS = [".html", ".css", ".js", ".png", ".jpg"]

  // Private members
  #callbacks = {};                  // callback functions used in this class
  #clients = [];                    // List of clients that requested a scan
  #httpServer = undefined;          // HTTP Server
  #scanners = undefined;            // List of available scanners

  constructor() {
    super();
  }

  #onHttpRequest(request, response)  {

    // Set headers for CORS
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Request-Method', '*');
    response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    response.setHeader('Access-Control-Allow-Headers', '*');

    const result = this.handleStaticFileRequests(request, response);
    console.log(result);
    if (result) return;

    // Parse the path of the URL and split it into segments
    const url = new URL(request.url, `http://${request.headers.host}`);
    const segments = url.pathname.split('/').slice(1);

    const command = segments[0];
    const channel = parseInt(segments[1]) || 1;

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
      response.end('Invalid request');
      return;
    }

    // Retrieve scanner matching channel and check if it'is already in use.
    const scanner = this.getScannerByChannel(channel);
    if (!scanner) {
      logWarn(
        `The scanning request from ${request.socket.remoteAddress}:${request.socket.remotePort} `+
        `was canceled because channel ${channel} is out of bounds.`
      );
      response.writeHead(400, {'Content-Type': 'text/plain'});
      response.end('Channel out of bounds.');
      return;
    } else if (scanner.scanning) {
      logWarn(
        `The scanning request from ${request.socket.remoteAddress}:${request.socket.remotePort} `+
        `was canceled because channel ${channel} is already in use.`
      );
      response.writeHead(400, {'Content-Type': 'text/plain'});
      response.end('Channel already in use.');
      return;
    }

    // If we make it here, the request is valid and so we create a new Client. A client corresponds
    // to a single, valid, remote connection which will be closed as soon as download is complete.
    logInfo(
      `Valid request received from ${request.socket.remoteAddress}:${request.socket.remotePort}.`
    );
    const client = new Client(request.socket, {channel});
    this.#clients[client.id] = client;

    // Quickly send answer in the form of a proper HTTP header (there's no official MIME type for
    // PNM format).
    // response.setHeader('Connection', 'close');
    response.writeHead(200, {'Content-Type': 'application/octet-stream'});

    // Retrieve scanner and set up callbacks

    scanner.addOneTimeListener("scancompleted", () => {
      response.end();
      request.removeAllListeners();
      scanner.removeListener("scancompleted");
      scanner.removeListener("error");
      this.destroyClient(client.id);
    });
    scanner.addOneTimeListener("error", err => {
      response.end();
      logWarn("Could not complete the scan. Error: " + err);
      request.removeAllListeners();
      scanner.removeListener("scancompleted");
      scanner.removeListener("error");
      this.destroyClient(client.id);
    });

    // Scan!
    scanner.scan({pipe: response});

    // Watch if the client unexpectedly closes the request, in which case we must clean up.
    request.once('close', () => {
      response.end();
      logInfo(`Client unexpectedly closed the request. Terminating.`);
      scanner.abort();
    });

  }

  #onServerError(err) {
    this.emit("error", `HTTP server error. ${err}.`);
    this.quit();
  }

  destroyClient(id) {
    if (!this.#clients[id]) return;
    this.#clients[id].destroy();
    delete this.#clients[id];
  }

  getScannerByChannel(channel) {
    return this.#scanners.find(scanner => scanner.channel === channel);
  }

  async quit() {

    // Remove all listeners from the Server class
    this.removeListener();

    // Destroy all clients
    this.#clients.forEach(async client => await client.destroy());

    // Stop all scanning processes
    this.#scanners.forEach(async scanner => await scanner.abort());

    // Remove events and stop the HTTP Server
    if (this.#httpServer) {
      this.#httpServer.removeAllListeners();
      this.#httpServer.close();
      this.#httpServer.closeAllConnections();
      this.#httpServer.unref();
    }

  }

  async start(scanners, options = {address: "0.0.0.0", port: 5678}) {

    if (!Array.isArray(scanners)) {
      logError("An array of Scanner objects must be specified to start the Server.");
      return;
    }

    this.#scanners = scanners;

    // Create HTTP server and add callbacks
    this.#httpServer = http.createServer();
    this.#callbacks.onHttpRequest = this.#onHttpRequest.bind(this);
    this.#httpServer.on("request", this.#callbacks.onHttpRequest);
    this.#callbacks.onServerError = this.#onServerError.bind(this);
    this.#httpServer.on("error", this.#callbacks.onServerError);

    // Start server
    await new Promise((resolve, reject) => {

      this.#httpServer.listen(options, err => {
        if (err) {
          reject("Could not start HTTP server. " + err);
          this.quit();
        } else {
          resolve();
        }
      });

    });

  }

  async handleStaticFileRequests(req, res) {

    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };

    console.log(filePath);

    // If it's not the GET method, let the default process handle it
    if (req.method !== 'GET') return false;

    let fileUrl = req.url;
    if (fileUrl === '/') fileUrl = '/index.html';
    const filePath = path.resolve(__dirname, "../webclient/" + fileUrl);
    const fileExt = path.extname(filePath);
    const mimeType = mimeTypes[fileExt];


    // If it's not the right file extension, let the default process handle it
    // if (!Server.ALLOWED_STATIC_FILE_EXTENSIONS.includes(fileExt)) return false;
    if (!mimeType) return false;


    await new Promise(resolve => {

      fs.access(filePath, fs.constants.F_OK, err => {

        // If it's not an existing file, let the default process handle it
        if (err) {
          resolve(false);
        } else {
          res.statusCode = 200;
          res.setHeader('Content-Type', mimeType);
          fs.createReadStream(filePath).pipe(res);
          resolve(true);
        }

      });

    })

  }


}
