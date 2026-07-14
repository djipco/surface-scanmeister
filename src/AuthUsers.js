import {randomBytes, scryptSync} from 'node:crypto';
import {chmod, chown, mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {Configuration as config} from "../config/Configuration.js";

export class AuthUsers {

  static DEFAULT_USERS_FILE = config.paths.authUsers;

  constructor(file = process.env.SCANMEISTER_AUTH_USERS_FILE || AuthUsers.DEFAULT_USERS_FILE) {
    this.file = file;
  }

  static validateUsername(username) {
    if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
      throw new Error("Username must contain only letters, numbers, dots, dashes, and underscores");
    }
  }

  static validatePassword(password) {
    if (password.length < config.auth.minimumPasswordLength) {
      throw new Error(`Password must be at least ${config.auth.minimumPasswordLength} characters`);
    }
  }

  static formatPasswordEntry(username, password) {
    const salt = randomBytes(config.auth.saltBytes).toString("hex");
    const hash = scryptSync(password, salt, config.auth.hashBytes).toString("hex");
    return `${username}:scrypt:${salt}:${hash}`;
  }

  static parseUsers(content) {
    return AuthUsers.parseEntries(content).users;
  }

  static parseEntries(content) {
    const users = [];
    const invalidEntries = [];
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const parts = trimmed.split(":");
      const [username, algorithm, salt, hash] = parts;
      const valid =
        parts.length === 4 &&
        username &&
        AuthUsers.#isValidUsername(username) &&
        algorithm === "scrypt" &&
        AuthUsers.#isHex(salt) &&
        salt.length === config.auth.saltBytes * 2 &&
        AuthUsers.#isHex(hash) &&
        hash.length === config.auth.hashBytes * 2;

      if (valid && users.some(user => user.username === username)) {
        invalidEntries.push({lineNumber: index + 1, line, reason: "Duplicate username"});
      } else if (valid) {
        users.push({username, algorithm, salt, hash, line});
      } else {
        invalidEntries.push({lineNumber: index + 1, line, reason: "Invalid entry"});
      }
    });

    return {users, invalidEntries};
  }

  async readFile() {
    try {
      return await readFile(this.file, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") return "";
      throw err;
    }
  }

  async writeFile(lines) {
    const directory = path.dirname(this.file);
    const temporaryFile = path.join(directory, `.users.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
    const content = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    let existingFile;

    try {
      existingFile = await stat(this.file);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    await mkdir(directory, {recursive: true});
    await writeFile(temporaryFile, content, {mode: 0o640});
    if (existingFile) {
      await chown(temporaryFile, existingFile.uid, existingFile.gid);
      await chmod(temporaryFile, existingFile.mode & 0o777);
    }
    await rename(temporaryFile, this.file);
  }

  async list() {
    return AuthUsers.parseUsers(await this.readFile());
  }

  async readEntries() {
    return AuthUsers.parseEntries(await this.readFile());
  }

  async add(username, password, options = {}) {
    AuthUsers.validateUsername(username);
    AuthUsers.validatePassword(password);

    const content = await this.readFile();
    const users = AuthUsers.parseUsers(content);
    const exists = users.some(user => user.username === username);
    if (exists && !options.replace) {
      throw new Error(`User '${username}' already exists. Use --replace to update it.`);
    }

    const keptLines = this.#withoutUser(content, username);
    keptLines.push(AuthUsers.formatPasswordEntry(username, password));
    await this.writeFile(keptLines);

    return {created: !exists, updated: exists};
  }

  async remove(username) {
    AuthUsers.validateUsername(username);

    const content = await this.readFile();
    const keptLines = this.#withoutUser(content, username);

    if (keptLines.length === this.#trimTrailingEmptyLines(content.split(/\r?\n/)).length) {
      throw new Error(`User '${username}' does not exist.`);
    }

    await this.writeFile(keptLines);
  }

  #withoutUser(content, username) {
    return this.#trimTrailingEmptyLines(content
      .split(/\r?\n/)
      .filter(line => !AuthUsers.#isPasswordEntryForUser(line, username)));
  }

  #trimTrailingEmptyLines(lines) {
    const trimmedLines = [...lines];
    while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1].trim() === "") {
      trimmedLines.pop();
    }
    return trimmedLines;
  }

  static #isValidUsername(username) {
    return /^[A-Za-z0-9_.-]+$/.test(username);
  }

  static #isHex(value) {
    return typeof value === "string" && value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
  }

  static #isPasswordEntryForUser(line, username) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return false;

    const parts = trimmed.split(":");
    return parts.length === 4 && parts[0] === username && parts[1] === "scrypt";
  }

}
