// Node.js standard imports
import {Configuration as config} from "../config/Configuration.js";
import http from 'node:http';
import https from 'node:https';
import {readFile} from 'node:fs/promises';
import express from 'express';

// Application imports
import {Logger} from "./Logger.js";
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import {ApiRequest} from "./ApiRequest.js";
import {Client} from "./Client.js";
import {RemoteAuth} from "./RemoteAuth.js";
import {ScanStorage} from "./ScanStorage.js";
import {ShellCommand} from "./ShellCommand.js";

export class Server extends EventEmitter {

  // Private members
  #callbacks = {};                  // callback functions used in this class
  #clients = new Map();             // List of clients that requested a scan
  #eventClients = new Map();        // Long-lived SSE clients
  #express = undefined;             // Express app, for API and static files
  #httpsServer = undefined;
  #redirectServer = undefined;
  #remoteAuth = new RemoteAuth();
  #scanStorage = new ScanStorage();
  #scanners = undefined;            // List of available scanners

  constructor() {
    super();
  }

  async #onHttpRequest(request, response)  {

    // Set headers for CORS
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Request-Method', '*');
    response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
    response.setHeader('Access-Control-Allow-Headers', '*');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    let parsed;
    try {
      parsed = ApiRequest.parse(request);
    } catch (err) {
      Logger.info(
        `Invalid request from ${request.socket.remoteAddress}:${request.socket.remotePort}: ` +
        err +
        ` Closing connection.`
      );
      response.writeHead(400, {'Content-Type': 'text/plain'});
      response.end('Invalid request');
      return;
    }

    if (parsed.command === "events") {
      this.#startEventStream(request, response);
      return;
    }

    if (parsed.command === "list-scanners") {
      this.#handleListScanners(response);
      return;
    }

    if (parsed.command === "list-scans") {
      await this.#handleListScans(response);
      return;
    }

    if (parsed.command === "read-scan") {
      await this.#handleReadScan(parsed, response);
      return;
    }

    if (parsed.command === "save-scan") {
      await this.#handleSaveScan(parsed, request, response);
      return;
    }

    const scanner = this.getScannerByChannel(parsed.channel);
    if (!scanner) {
      this.#handleMissingScanner(parsed, request, response);
      return;
    }

    if (parsed.command === "cancel-scan") {
      await this.#handleCancelScan(parsed, scanner, request, response);
      return;
    }

    if (parsed.command === "preview-command") {
      this.#handlePreviewCommand(parsed, scanner, response);
      return;
    }

    if (scanner.scanning) {
      this.#handleBusyScanner(parsed, request, response);
      return;
    }

    if (parsed.command === "start-scan") {
      this.#handleStartScan(parsed, scanner, request, response);
      return;
    }

    response.writeHead(404, {'Content-Type': 'text/plain'});
    response.end('Not found');
  }

  #handleListScanners(response) {
    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({
      scanners: this.#scanners.map(scanner => ({
        channel: scanner.channel,
        name: scanner.name,
        systemName: scanner.systemName,
        scanning: scanner.scanning
      }))
    }));
  }

  async #handleListScans(response) {
    try {
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({scans: await this.#scanStorage.list()}));
    } catch (err) {
      Logger.warn(`Could not list scans. Error: ${err}`);
      response.writeHead(500, {'Content-Type': 'text/plain'});
      response.end('Could not list scans');
    }
  }

  async #handleReadScan(parsed, response) {
    try {
      const image = await this.#scanStorage.read(parsed.filename);
      response.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache'
      });
      response.end(image);
    } catch (err) {
      Logger.warn(`Could not read scan ${parsed.filename}. Error: ${err}`);
      response.writeHead(404, {'Content-Type': 'text/plain'});
      response.end('Scan not found');
    }
  }

  async #handleSaveScan(parsed, request, response) {
    try {
      const body = await this.#scanStorage.readRequestBody(request);
      Logger.info(`Saving scan (${body.length} bytes) as ${parsed.filename}.`);
      const savedScan = await this.#scanStorage.save(parsed.filename, body);
      Logger.info(`Saved scan to ${savedScan.path}.`);
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify(savedScan));
    } catch (err) {
      Logger.warn(`Could not save scan as ${parsed.filename}. Error: ${err}`);
      response.writeHead(500, {'Content-Type': 'text/plain'});
      response.end('Could not save scan');
    }
  }

  #handleMissingScanner(parsed, request, response) {
    Logger.warn(
      `The scanning request from ${request.socket.remoteAddress}:${request.socket.remotePort} `+
      `was canceled because channel ${parsed.channel} is out of bounds.`
    );
    response.writeHead(400, {'Content-Type': 'text/plain'});
    response.end('Channel out of bounds.');
  }

  async #handleCancelScan(parsed, scanner, request, response) {
    const wasScanning = scanner.scanning;
    Logger.info(
      `Cancel request received for channel ${parsed.channel} from ` +
      `${request.socket.remoteAddress}:${request.socket.remotePort}. Scanning: ${wasScanning}.`
    );
    if (wasScanning) await scanner.abort();
    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({cancelled: wasScanning}));
  }

  #handlePreviewCommand(parsed, scanner, response) {
    const args = scanner.getScanCommandArgs(parsed);
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end(ShellCommand.format(config.scan.command, args));
  }

  #handleBusyScanner(parsed, request, response) {
    Logger.warn(
      `The scanning request from ${request.socket.remoteAddress}:${request.socket.remotePort} `+
      `was canceled because channel ${parsed.channel} is already in use.`
    );
    response.writeHead(400, {'Content-Type': 'text/plain'});
    response.end('Channel already in use.');
  }

  #handleStartScan(parsed, scanner, request, response) {
    Logger.info(
      `Scan request from ${request.socket.remoteAddress}:${request.socket.remotePort} ` +
      `for channel ${parsed.channel}.`
    );

    const client = new Client(request.socket, {channel: parsed.channel});
    this.#clients.set(client.id, client);

    let scanFinished = false;
    const removeScanListeners = () => {
      scanner.removeListener("scancompleted");
      scanner.removeListener("error");
      request.off('close', onRequestClose);
    };

    const onScanCompleted = () => {
      scanFinished = true;
      removeScanListeners();
      response.end();
      this.destroyClient(client.id);
    };

    const onScanError = err => {
      scanFinished = true;
      removeScanListeners();
      response.end();
      this.destroyClient(client.id);
      Logger.warn("Could not complete the scan. Error: " + err);
    };

    const onRequestClose = () => {
      if (scanFinished) return;
      removeScanListeners();
      response.end();
      this.destroyClient(client.id);
      Logger.info(`Client unexpectedly closed the request. Terminating.`);
      scanner.abort("client disconnected");
    };

    response.writeHead(200, {'Content-Type': 'application/octet-stream'});
    scanner.addOneTimeListener("scancompleted", onScanCompleted);
    scanner.addOneTimeListener("error", onScanError);
    request.once('close', onRequestClose);

    scanner.scan({
      pipe: response,
      resolution: parsed.resolution,
      brightness: parsed.brightness,
      contrast: parsed.contrast,
      width: parsed.width,
      height: parsed.height,
      forceCalibration: parsed.forceCalibration,
    });
  }

  #onRedirectRequest(request, response) {
    const host = (request.headers.host || "").replace(/:\d+$/, "");
    const targetHost = host || "localhost";
    response.writeHead(308, {
      Location: `https://${targetHost}${request.url}`,
      'Content-Type': 'text/plain'
    });
    response.end('Redirecting to HTTPS');
  }

  #startEventStream(request, response) {
    const id = `${request.socket.remoteAddress}:${request.socket.remotePort}`;

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.write(': connected\n\n');

    this.#eventClients.set(id, response);
    Logger.info(`Event stream connected: ${id}.`);

    request.once('close', () => {
      this.#eventClients.delete(id);
      Logger.info(`Event stream disconnected: ${id}.`);
    });
  }

  #sendEvent(response, event, data) {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  broadcastOscMessage(address, args = []) {
    const data = {address, args};

    this.#eventClients.forEach((response, id) => {
      try {
        this.#sendEvent(response, 'osc', data);
      } catch (err) {
        Logger.warn(`Could not send event stream update to ${id}. Error: ${err}`);
        this.#eventClients.delete(id);
      }
    });
  }

  async #loadTlsOptions() {
    try {
      const tlsOptions = {
        key: await readFile(config.paths.httpsKey),
        cert: await readFile(config.paths.httpsCert)
      };
      Logger.info("HTTPS certificate loaded.");
      return tlsOptions;
    } catch (err) {
      throw new Error(
        `Could not read HTTPS certificate files. ` +
        `Key: ${config.paths.httpsKey}. ` +
        `Certificate: ${config.paths.httpsCert}. ` +
        `Error: ${err.message || err}`
      );
    }
  }

  destroyClient(id) {
    const client = this.#clients.get(id);
    if (!client) return;
    client.destroy();
    this.#clients.delete(id);
  }

  getScannerByChannel(channel) {
    return this.#scanners.find(scanner => scanner.channel === channel);
  }

  async quit() {

    // Remove all listeners from the Server class
    this.removeListener();
    // Destroy all clients
    await Promise.all([...this.#clients.values()].map(client => client.destroy()));
    this.#clients.clear();

    // Close all event streams
    this.#eventClients.forEach(response => response.end());
    this.#eventClients.clear();

    // Stop all scanning processes
    await Promise.all(this.#scanners.map(scanner => scanner.abort("server stopped")));

    // Stop HTTP redirect server
    if (this.#redirectServer) {
      await new Promise(resolve => this.#redirectServer.close(resolve));
      this.#redirectServer = undefined;
    }

    // Stop HTTPS server
    if (this.#httpsServer) {
      await new Promise(resolve => this.#httpsServer.close(resolve));
      this.#httpsServer = undefined;
    }

  }

  async #startRedirectServer() {
    return new Promise((resolve, reject) => {
      this.#redirectServer = http.createServer(this.#onRedirectRequest.bind(this));
      this.#redirectServer.once("error", reject);
      this.#redirectServer.listen(
        config.network.http_server.port,
        config.network.http_server.address,
        () => {
          Logger.info(
            `HTTP redirect server is ready. Listening on ` +
            `${config.network.http_server.address}:${config.network.http_server.port}.`
          );
          resolve();
        }
      );
    });
  }

  async #startHttpsServer() {
    return new Promise((resolve, reject) => {
      this.#loadTlsOptions()
        .then(tlsOptions => {
          this.#httpsServer = https.createServer(tlsOptions, this.#express);
          this.#httpsServer.once("error", reject);

          this.#httpsServer.listen(
            config.network.https_server.port,
            config.network.https_server.address,
            () => {
              Logger.info(
                `HTTPS server is ready. Listening on ` +
                `${config.network.https_server.address}:${config.network.https_server.port}.`
              );

              resolve();
            }
          );
        })
        .catch(reject);
    });
  }

  async start(scanners) {

    if (!Array.isArray(scanners)) {
      Logger.error("An array of Scanner objects must be specified to start the Server.");
      return;
    }

    this.#scanners = scanners;

    // Set up server for API routes and static web client files.
    await this.#remoteAuth.refresh();
    this.#express = express();
    this.#callbacks.onHttpRequest = this.#onHttpRequest.bind(this);
    this.#express.use(this.#remoteAuth.authenticate.bind(this.#remoteAuth));
    this.#express.use("/api", this.#callbacks.onHttpRequest);
    this.#express.use(express.static('webclient'));

    if (this.#remoteAuth.configured) {
      Logger.info(
        `Remote HTTPS auth enabled: ${this.#remoteAuth.usersPath} ` +
        `(${this.#remoteAuth.userCount} user(s)).`
      );
    } else {
      Logger.warn(
        `Remote HTTPS access is disabled until ${this.#remoteAuth.usersPath} contains at least ` +
        "one valid user."
      );
    }

    await this.#startHttpsServer();
    await this.#startRedirectServer();
  }

}
