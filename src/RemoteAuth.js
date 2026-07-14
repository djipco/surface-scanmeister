import {scryptSync, timingSafeEqual} from 'node:crypto';
import {stat} from 'node:fs/promises';

import {Configuration as config} from "../config/Configuration.js";
import {AuthUsers} from "./AuthUsers.js";
import {Logger} from "./Logger.js";

export class RemoteAuth {

  #configurationWarningShown = false;
  #users = new Map();
  #usersMtimeMs = undefined;

  get userCount() {
    return this.#users.size;
  }

  get usersPath() {
    return process.env.SCANMEISTER_AUTH_USERS_FILE || config.paths.authUsers;
  }

  get configured() {
    return this.#users.size > 0;
  }

  async refresh() {
    const authUsersPath = this.usersPath;
    let authUsersStat;

    try {
      authUsersStat = await stat(authUsersPath);
    } catch (err) {
      if (this.#users.size > 0 || this.#usersMtimeMs !== undefined) {
        Logger.warn(`Remote HTTPS access is disabled because ${authUsersPath} could not be read.`);
      }
      this.#users.clear();
      this.#usersMtimeMs = undefined;
      return;
    }

    if (authUsersStat.mtimeMs === this.#usersMtimeMs) return;
    await this.#load(authUsersPath, authUsersStat.mtimeMs);
  }

  async authenticate(request, response, next) {
    if (RemoteAuth.#isLocalRequest(request)) {
      next();
      return;
    }

    try {
      await this.refresh();
    } catch (err) {
      Logger.warn(`Could not refresh remote HTTPS users. Error: ${err}`);
      response.status(403).send("Remote access is not configured");
      return;
    }

    if (!this.configured) {
      if (!this.#configurationWarningShown) {
        Logger.warn(
          "Remote HTTPS access is disabled because ScanMeister authentication is not configured."
        );
        this.#configurationWarningShown = true;
      }
      response.status(403).send("Remote access is not configured");
      return;
    }

    const credentials = RemoteAuth.#getBasicAuthCredentials(request);
    if (credentials && this.#verifyPassword(credentials.username, credentials.password)) {
      next();
      return;
    }

    RemoteAuth.#sendAuthenticationChallenge(response);
  }

  async #load(authUsersPath, mtimeMs) {
    let entries;
    try {
      entries = await new AuthUsers(authUsersPath).readEntries();
    } catch (err) {
      Logger.warn(`Remote HTTPS access is disabled because ${authUsersPath} could not be read.`);
      this.#users.clear();
      this.#usersMtimeMs = undefined;
      return;
    }

    entries.invalidEntries.forEach(entry => {
      Logger.warn(`Ignoring invalid remote auth entry at ${authUsersPath}:${entry.lineNumber}.`);
    });

    const users = new Map();
    entries.users.forEach(({username, algorithm, salt, hash}) => {
      users.set(username, {algorithm, salt, hash});
    });

    this.#users = users;
    this.#usersMtimeMs = mtimeMs;
    this.#configurationWarningShown = false;
    Logger.info(`Loaded ${users.size} remote HTTPS user(s) from ${authUsersPath}.`);
  }

  #verifyPassword(username, password) {
    const user = this.#users.get(username);
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

  static #getBasicAuthCredentials(request) {
    const authHeader = request.headers.authorization || "";
    const [scheme, encodedCredentials] = authHeader.split(" ");
    if (scheme !== "Basic" || !encodedCredentials) return null;

    let decodedCredentials;
    try {
      decodedCredentials = Buffer.from(encodedCredentials, "base64").toString("utf8");
    } catch (err) {
      return null;
    }

    const separatorIndex = decodedCredentials.indexOf(":");
    return {
      username: separatorIndex >= 0 ? decodedCredentials.slice(0, separatorIndex) : "",
      password: separatorIndex >= 0 ? decodedCredentials.slice(separatorIndex + 1) : ""
    };
  }

  static #sendAuthenticationChallenge(response) {
    response.setHeader("WWW-Authenticate", 'Basic realm="ScanMeister"');
    response.status(401).send("Authentication required");
  }

  static #isLocalRequest(request) {
    return RemoteAuth.#isLocalAddress(request.ip) ||
      RemoteAuth.#isLocalAddress(request.socket?.remoteAddress);
  }

  static #isLocalAddress(address = "") {
    const normalized = address
      .replace(/^::ffff:/, '')
      .replace(/^\[/, '')
      .replace(/]$/, '')
      .toLowerCase();

    return normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "localhost";
  }

}
