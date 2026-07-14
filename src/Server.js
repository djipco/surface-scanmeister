// Node.js standard imports
import {Configuration as config} from "../config/Configuration.js";
import http from 'node:http';
import https from 'node:https';
import {scryptSync, timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import express from 'express';

// Application imports
import {logError, logInfo, logWarn} from "./Logger.js";
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import Client from "./Client.js";

export class Server extends EventEmitter {

  // Acceptable static files to be served
  static ALLOWED_STATIC_FILE_EXTENSIONS = [".html", ".css", ".js", ".png", ".jpg"]

  // Private members
  #callbacks = {};                  // callback functions used in this class
  #clients = [];                    // List of clients that requested a scan
  #eventClients = new Map();         // Long-lived SSE clients
  #express = undefined;             // Express app, for API and static files
  #filesServer = undefined;
  #redirectServer = undefined;
  #remoteAuthUsers = new Map();
  #remoteAuthUsersMtimeMs = undefined;
  #remoteAuthConfigurationWarningShown = false;
  #scanners = undefined;            // List of available scanners

  constructor() {
    super();
  }

  #parseApiRequest(request) {

    // Result object
    const parsed = {};

    // Construct a URL object for easier parsing of the route and query parameters.
    const url = new URL(request.url, `http://${request.headers.host}`);
    const segments = url.pathname.split('/').slice(1);

    if (segments[0] === "events" && segments.length === 1) {
      if (request.method !== "GET") throw new Error("Method not allowed");
      parsed.command = "events";
    } else if (segments[0] === "scanners" && segments.length === 1) {
      if (request.method !== "GET") throw new Error("Method not allowed");
      parsed.command = "list-scanners";
    } else if (segments[0] === "scanners" && segments.length === 3) {
      parsed.channel = parseInt(segments[1]) || 1;

      if (segments[2] === "command" && request.method === "GET") {
        parsed.command = "preview-command";
      } else if (segments[2] === "scan" && request.method === "POST") {
        parsed.command = "start-scan";
      } else if (segments[2] === "cancel" && request.method === "POST") {
        parsed.command = "cancel-scan";
      } else {
        throw new Error("Invalid scanner route");
      }
    } else if (segments[0] === "scans" && segments.length === 1) {
      if (request.method === "GET") {
        parsed.command = "list-scans";
      } else if (request.method === "POST") {
        parsed.command = "save-scan";
      } else {
        throw new Error("Method not allowed");
      }
    } else if (segments[0] === "scans" && segments.length === 2) {
      if (request.method !== "GET") throw new Error("Method not allowed");
      parsed.command = "read-scan";
      parsed.filename = this.#sanitizeFilename(decodeURIComponent(segments[1]));
    } else {
      throw new Error(`Invalid API request received: ${url.href}`);
    }

    if (!parsed.filename) {
      parsed.filename = this.#sanitizeFilename(url.searchParams.get('filename') || 'scan.png');
    }

    // Parse query string for valid resolution
    const resolution = parseInt(url.searchParams.get('resolution'));
    if (config.scan.resolutions.includes(resolution)) parsed.resolution = resolution;

    const brightness = parseInt(url.searchParams.get('brightness'));
    if (brightness >= config.scan.brightness.min && brightness <= config.scan.brightness.max) {
      parsed.brightness = brightness;
    }

    const contrast = parseInt(url.searchParams.get('contrast'));
    if (contrast >= config.scan.contrast.min && contrast <= config.scan.contrast.max) {
      parsed.contrast = contrast;
    }

    const width = parseFloat(url.searchParams.get('width'));
    if (width >= 0 && width <= config.scan.maxWidth) parsed.width = width;

    const height = parseFloat(url.searchParams.get('height'));
    if (height >= 0 && height <= config.scan.maxHeight) parsed.height = height;

    parsed.forceCalibration = url.searchParams.get('forceCalibration') === 'true';

    return parsed;

  }

  #formatShellCommand(command, args) {
    return [command, ...args].map(arg => {
      if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) return arg;
      return "'" + arg.replaceAll("'", "'\\''") + "'";
    }).join(" ");
  }

  #isLocalAddress(address = "") {
    const normalized = address
      .replace(/^::ffff:/, '')
      .replace(/^\[/, '')
      .replace(/]$/, '')
      .toLowerCase();

    return normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "localhost";
  }

  #isLocalRequest(request) {
    return this.#isLocalAddress(request.ip) ||
      this.#isLocalAddress(request.socket?.remoteAddress);
  }

  #authUsersPath() {
    return process.env.SCANMEISTER_AUTH_USERS_FILE || config.paths.authUsers;
  }

  #hasRemoteAuthConfiguration() {
    return this.#remoteAuthUsers.size > 0;
  }

  async #refreshRemoteAuthUsers() {
    const authUsersPath = this.#authUsersPath();
    let authUsersStat;

    try {
      authUsersStat = await stat(authUsersPath);
    } catch (err) {
      if (this.#remoteAuthUsers.size > 0 || this.#remoteAuthUsersMtimeMs !== undefined) {
        logWarn(`Remote HTTPS access is disabled because ${authUsersPath} could not be read.`);
      }
      this.#remoteAuthUsers.clear();
      this.#remoteAuthUsersMtimeMs = undefined;
      return;
    }

    if (authUsersStat.mtimeMs === this.#remoteAuthUsersMtimeMs) return;
    await this.#loadRemoteAuthUsers(authUsersPath, authUsersStat.mtimeMs);
  }

  async #loadRemoteAuthUsers(authUsersPath = this.#authUsersPath(), mtimeMs = undefined) {
    let content;
    try {
      content = await readFile(authUsersPath, "utf8");
    } catch (err) {
      logWarn(`Remote HTTPS access is disabled because ${authUsersPath} could not be read.`);
      this.#remoteAuthUsers.clear();
      this.#remoteAuthUsersMtimeMs = undefined;
      return;
    }

    const users = new Map();
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const [username, algorithm, salt, hash] = trimmed.split(":");
      if (!username || algorithm !== "scrypt" || !salt || !hash) {
        logWarn(`Ignoring invalid remote auth entry at ${authUsersPath}:${index + 1}.`);
        return;
      }

      users.set(username, {algorithm, salt, hash});
    });

    this.#remoteAuthUsers = users;
    this.#remoteAuthUsersMtimeMs = mtimeMs;
    this.#remoteAuthConfigurationWarningShown = false;
    logInfo(`Loaded ${users.size} remote HTTPS user(s) from ${authUsersPath}.`);
  }

  #verifyPassword(username, password) {
    const user = this.#remoteAuthUsers.get(username);
    if (!user || user.algorithm !== "scrypt") return false;

    try {
      const expectedBuffer = Buffer.from(user.hash, "hex");
      const actualBuffer = scryptSync(password, user.salt, expectedBuffer.length);
      return actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer);
    } catch (err) {
      return false;
    }
  }

  #sendAuthenticationChallenge(response) {
    response.setHeader("WWW-Authenticate", 'Basic realm="ScanMeister"');
    response.status(401).send("Authentication required");
  }

  async #authenticateRemoteFileRequest(request, response, next) {
    if (this.#isLocalRequest(request)) {
      next();
      return;
    }

    try {
      await this.#refreshRemoteAuthUsers();
    } catch (err) {
      logWarn(`Could not refresh remote HTTPS users. Error: ${err}`);
      response.status(403).send("Remote access is not configured");
      return;
    }

    if (!this.#hasRemoteAuthConfiguration()) {
      if (!this.#remoteAuthConfigurationWarningShown) {
        logWarn(
          "Remote HTTPS access is disabled because ScanMeister authentication is not configured."
        );
        this.#remoteAuthConfigurationWarningShown = true;
      }
      response.status(403).send("Remote access is not configured");
      return;
    }

    const authHeader = request.headers.authorization || "";
    const [scheme, encodedCredentials] = authHeader.split(" ");
    if (scheme !== "Basic" || !encodedCredentials) {
      this.#sendAuthenticationChallenge(response);
      return;
    }

    let decodedCredentials;
    try {
      decodedCredentials = Buffer.from(encodedCredentials, "base64").toString("utf8");
    } catch (err) {
      this.#sendAuthenticationChallenge(response);
      return;
    }

    const separatorIndex = decodedCredentials.indexOf(":");
    const username = separatorIndex >= 0 ? decodedCredentials.slice(0, separatorIndex) : "";
    const password = separatorIndex >= 0 ? decodedCredentials.slice(separatorIndex + 1) : "";

    if (this.#verifyPassword(username, password)) {
      next();
      return;
    }

    this.#sendAuthenticationChallenge(response);
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

    // Try to parse the request
    let parsed;
    try {
      parsed = this.#parseApiRequest(request);
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

    // Retrieve scanner matching channel and check if it's already in use.
    if (parsed.command === "events") {
      this.#startEventStream(request, response);
      return;
    }

    if (parsed.command === "list-scanners") {
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({
        scanners: this.#scanners.map(scanner => ({
          channel: scanner.channel,
          name: scanner.name,
          systemName: scanner.systemName,
          scanning: scanner.scanning
        }))
      }));
      return;
    }

    if (parsed.command === "list-scans") {
      try {
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({scans: await this.#listSavedScans()}));
      } catch (err) {
        logWarn(`Could not list scans. Error: ${err}`);
        response.writeHead(500, {'Content-Type': 'text/plain'});
        response.end('Could not list scans');
      }
      return;
    }

    if (parsed.command === "read-scan") {
      try {
        const image = await this.#readSavedScan(parsed.filename);
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache'
        });
        response.end(image);
      } catch (err) {
        logWarn(`Could not read scan ${parsed.filename}. Error: ${err}`);
        response.writeHead(404, {'Content-Type': 'text/plain'});
        response.end('Scan not found');
      }
      return;
    }

    if (parsed.command === "save-scan") {
      try {
        const body = await this.#readRequestBody(request);
        await mkdir(config.paths.scans, {recursive: true});
        const filename = parsed.filename.endsWith('.png') ? parsed.filename : parsed.filename + '.png';
        const filePath = path.join(config.paths.scans, filename);
        logInfo(`Saving scan (${body.length} bytes) to ${filePath}.`);
        await writeFile(filePath, body);
        logInfo(`Saved scan to ${filePath}.`);
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({filename, path: filePath}));
      } catch (err) {
        logWarn(`Could not save scan as ${parsed.filename}. Error: ${err}`);
        response.writeHead(500, {'Content-Type': 'text/plain'});
        response.end('Could not save scan');
      }
      return;
    }

    const scanner = this.getScannerByChannel(parsed.channel);
    if (!scanner) {
      logWarn(
        `The scanning request from ${request.socket.remoteAddress}:${request.socket.remotePort} `+
        `was canceled because channel ${parsed.channel} is out of bounds.`
      );
      response.writeHead(400, {'Content-Type': 'text/plain'});
      response.end('Channel out of bounds.');
      return;
    } else if (parsed.command === "cancel-scan") {
      const wasScanning = scanner.scanning;
      logInfo(
        `Cancel request received for channel ${parsed.channel} from ` +
        `${request.socket.remoteAddress}:${request.socket.remotePort}. Scanning: ${wasScanning}.`
      );
      if (wasScanning) await scanner.abort();
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({cancelled: wasScanning}));
      return;
    } else if (parsed.command === "preview-command") {
      const args = scanner.getScanCommandArgs(config, parsed);
      response.writeHead(200, {'Content-Type': 'text/plain'});
      response.end(this.#formatShellCommand("scanimage", args));
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

    if (parsed.command !== "start-scan") {
      response.writeHead(404, {'Content-Type': 'text/plain'});
      response.end('Not found');
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
    scanner.scan({
      pipe: response,
      resolution: parsed.resolution,
      brightness: parsed.brightness,
      contrast: parsed.contrast,
      width: parsed.width,
      height: parsed.height,
      forceCalibration: parsed.forceCalibration,
    });

    // Watch if the client unexpectedly closes the request, in which case we must clean up.
    request.once('close', () => {
      response.end();
      logInfo(`Client unexpectedly closed the request. Terminating.`);
      scanner.abort();
    });

  }

  #onServerError(err) {
    this.emit("error", `HTTPS server error. ${err}.`);
    this.quit();
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
    logInfo(`Event stream connected: ${id}.`);

    request.once('close', () => {
      this.#eventClients.delete(id);
      logInfo(`Event stream disconnected: ${id}.`);
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
        logWarn(`Could not send event stream update to ${id}. Error: ${err}`);
        this.#eventClients.delete(id);
      }
    });
  }

  async #readRequestBody(request) {
    const chunks = [];
    let byteLength = 0;
    const maxByteLength = 1024 * 1024 * 1024;

    for await (const chunk of request) {
      byteLength += chunk.length;
      if (byteLength > maxByteLength) throw new Error('Request body is too large.');
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  async #listSavedScans() {
    let entries;
    try {
      entries = await readdir(config.paths.scans, {withFileTypes: true});
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }

    const scans = await Promise.all(entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
      .map(async entry => {
        const filename = this.#sanitizeFilename(entry.name);
        const info = await stat(path.join(config.paths.scans, filename));
        return {
          filename,
          size: info.size,
          modifiedAt: info.mtime.toISOString()
        };
      }));

    return scans.sort((a, b) => new Date(a.modifiedAt) - new Date(b.modifiedAt));
  }

  async #readSavedScan(filename) {
    const safeFilename = this.#sanitizeFilename(filename);
    if (!safeFilename.toLowerCase().endsWith('.png')) throw new Error('Only PNG scans are allowed.');
    return readFile(path.join(config.paths.scans, safeFilename));
  }

  async #loadTlsOptions() {
    try {
      return {
        key: await readFile(config.paths.httpsKey),
        cert: await readFile(config.paths.httpsCert)
      };
    } catch (err) {
      throw new Error(
        `Could not read HTTPS certificate files. ` +
        `Key: ${config.paths.httpsKey}. ` +
        `Certificate: ${config.paths.httpsCert}. ` +
        `Error: ${err.message || err}`
      );
    }
  }

  #sanitizeFilename(filename) {
    const reservedCharacters = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
    return path.basename(filename)
      .split('')
      .map(character => {
        if (reservedCharacters.has(character)) return '_';
        return character.charCodeAt(0) < 32 ? '_' : character;
      })
      .join('');
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

    // Close all event streams
    this.#eventClients.forEach(response => response.end());
    this.#eventClients.clear();

    // Stop all scanning processes
    this.#scanners.forEach(async scanner => await scanner.abort());

    // Stop HTTP redirect server
    if (this.#redirectServer) {
      await new Promise(resolve => this.#redirectServer.close(resolve));
      this.#redirectServer = undefined;
    }

    // Stop HTTPS server
    if (this.#filesServer) {
      await new Promise(resolve => this.#filesServer.close(resolve));
      this.#filesServer = undefined;
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
          logInfo(
            `HTTP redirect server is ready. Listening on ` +
            `${config.network.http_server.address}:${config.network.http_server.port}.`
          );
          resolve();
        }
      );
    });
  }

  async start(scanners) {

    if (!Array.isArray(scanners)) {
      logError("An array of Scanner objects must be specified to start the Server.");
      return;
    }

    this.#scanners = scanners;

    // Set up server for API routes and static web client files.
    await this.#refreshRemoteAuthUsers();
    this.#express = express();
    this.#callbacks.onHttpRequest = this.#onHttpRequest.bind(this);
    this.#callbacks.onServerError = this.#onServerError.bind(this);
    this.#express.use(this.#authenticateRemoteFileRequest.bind(this));
    this.#express.use("/api", this.#callbacks.onHttpRequest);
    this.#express.use(express.static('webclient'));

    if (this.#hasRemoteAuthConfiguration()) {
      logInfo(`Remote HTTPS access requires authentication (${this.#remoteAuthUsers.size} user(s)).`);
    } else {
      logWarn(
        `Remote HTTPS access is disabled until ${this.#authUsersPath()} contains at least ` +
        "one valid user."
      );
    }

    // Start the HTTPS server
    await new Promise((resolve, reject) => {
      this.#loadTlsOptions()
        .then(tlsOptions => {
          this.#filesServer = https.createServer(tlsOptions, this.#express);
          this.#filesServer.once("error", reject);

          this.#filesServer.listen(
            config.network.https_server.port,
            config.network.https_server.address,
            () => {
              logInfo(
                `HTTPS server is ready. Listening on ` +
                `${config.network.https_server.address}:${config.network.https_server.port}.`
              );

              resolve();
            }
          );
        })
        .catch(reject);

    });

    await this.#startRedirectServer();

  }

}
