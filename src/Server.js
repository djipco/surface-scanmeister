// Node.js standard imports
import {Configuration as config} from "../config/Configuration.js";
import http from 'node:http';
import express from 'express';
import qs from 'qs';

// Application imports
import {logError, logInfo, logWarn} from "./Logger.js";
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import Client from "./Client.js";

export class Server extends EventEmitter {

  // Valid API commands (first part of the URL)
  static COMMANDS = ["scan"];
  static RESOLUTIONS = [75, 100, 150, 300, 600, 1200, 2400, 4800];

  // Acceptable static files to be served
  static ALLOWED_STATIC_FILE_EXTENSIONS = [".html", ".css", ".js", ".png", ".jpg"]

  // Private members
  #callbacks = {};                  // callback functions used in this class
  #clients = [];                    // List of clients that requested a scan
  #apiServer = undefined;   // HTTP Server (5678)
  #express = undefined;             // Express server, for static files (8080)
  #filesServer = undefined;
  #scanners = undefined;            // List of available scanners

  constructor() {
    super();
  }

  #parseHttpRequest(request) {

    // Result object
    const parsed = {};

    // Construct a URL object for easier parsing of the command, channel and other parameters.
    const url = new URL(request.url, `http://${request.headers.host}`);
    const segments = url.pathname.split('/').slice(1);

    // Check validity of request (expecting at least one valid command)
    if (segments.length < 1 || ! Server.COMMANDS.includes(segments[0]) ) {
      throw new Error(`Invalid command received: ${url.href}`);
    }

    // If we make it here, command is valid. Channel defaults to 1 if not specified.
    parsed.command = segments[0];
    parsed.channel = parseInt(segments[1]) || 1;

    // Parse query string for parameters
    const queryString = qs.parse(url.search);

    // Valdiate resolution
    if (Server.RESOLUTIONS.includes(parseInt(queryString.resolution))) {
      parsed.resolution = parseInt(queryString.resolution);
    }

    return parsed;

  }

  async #onHttpRequest(request, response)  {

    // Set headers for CORS
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Request-Method', '*');
    response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    response.setHeader('Access-Control-Allow-Headers', '*');

    // Try to parse the request
    let parsed;
    try {
      parsed = this.#parseHttpRequest(request);
      console.log(parsed);
    } catch (err) {
      logInfo(
        `Invalid request from ${request.socket.remoteAddress}:${request.socket.remotePort}: ` +
        err +
        ` Closing connection.`
      );
      response.writeHead(400, {'Content-Type': 'text/plain'});
      response.end('Invalid request');
      return;
    }

    // Retrieve scanner matching channel and check if it'is already in use.
    const scanner = this.getScannerByChannel(parsed.channel);
    if (!scanner) {
      logWarn(
        `The scanning request from ${request.socket.remoteAddress}:${request.socket.remotePort} `+
        `was canceled because channel ${parsed.channel} is out of bounds.`
      );
      response.writeHead(400, {'Content-Type': 'text/plain'});
      response.end('Channel out of bounds.');
      return;
    } else if (scanner.scanning) {
      logWarn(
        `The scanning request from ${request.socket.remoteAddress}:${request.socket.remotePort} `+
        `was canceled because channel ${parsed.channel} is already in use.`
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
    const client = new Client(request.socket, {channel: parsed.channel});
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
    scanner.scan({pipe: response, resolution: parsed.resolution});

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
    if (this.#apiServer) {
      this.#apiServer.removeAllListeners();
      this.#apiServer.close();
      this.#apiServer.closeAllConnections();
      this.#apiServer.unref();
    }

    // Stop Express server
    if (this.#filesServer) {
      return new Promise(resolve => this.#filesServer.close(resolve));
    }

  }

  async start(scanners, options = {address: "0.0.0.0", port: 5678}) {

    if (!Array.isArray(scanners)) {
      logError("An array of Scanner objects must be specified to start the Server.");
      return;
    }

    this.#scanners = scanners;

    // Create HTTP server and add callbacks
    this.#apiServer = http.createServer();
    this.#callbacks.onHttpRequest = this.#onHttpRequest.bind(this);
    this.#apiServer.on("request", this.#callbacks.onHttpRequest);
    this.#callbacks.onServerError = this.#onServerError.bind(this);
    this.#apiServer.on("error", this.#callbacks.onServerError);

    // Start scanner API server
    await new Promise((resolve, reject) => {

      this.#apiServer.listen(options, err => {
        if (err) {
          reject("Could not start HTTP server. " + err);
          this.quit();
        } else {
          resolve();
        }
      });

    });

    // Set up server for static web client files (using Express) and specify the directory to serve
    // files from.
    this.#express = express();
    this.#express.use(express.static('webclient'));

    // Start the static files server
    return new Promise((resolve, reject) => {

      this.#filesServer = this.#express.listen(
        config.network.files_server.port,
        config.network.files_server.address,
        err => {

          if (err) reject(err);

          logInfo(
            `Static file server is ready. Listening on ` +
            `${config.network.files_server.address}:${config.network.files_server.port}.`
          );

          resolve();

      });

    });

  }

}
