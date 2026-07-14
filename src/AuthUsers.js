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

  static parseCommonArguments(args) {
    const options = {
      file: process.env.SCANMEISTER_AUTH_USERS_FILE || AuthUsers.DEFAULT_USERS_FILE,
      replace: false
    };
    const positional = [];

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--file") {
        index += 1;
        if (!args[index]) throw new Error("--file requires a path");
        options.file = args[index];
      } else if (arg.startsWith("--file=")) {
        options.file = arg.slice("--file=".length);
      } else if (arg === "--replace") {
        options.replace = true;
      } else if (arg === "--help" || arg === "-h") {
        options.help = true;
      } else {
        positional.push(arg);
      }
    }

    return {options, positional};
  }

  static async readHidden(prompt) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("Password prompt requires an interactive terminal");
    }

    return new Promise((resolve, reject) => {
      const stdin = process.stdin;
      const stdout = process.stdout;
      let value = "";

      const cleanup = () => {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
      };

      const onData = data => {
        const text = data.toString("utf8");

        for (const character of text) {
          if (character === "\u0003") {
            cleanup();
            stdout.write("\n");
            reject(new Error("Cancelled"));
            return;
          }

          if (character === "\r" || character === "\n") {
            cleanup();
            stdout.write("\n");
            resolve(value);
            return;
          }

          if (character === "\b" || character === "\u007f") {
            value = value.slice(0, -1);
            continue;
          }

          value += character;
        }
      };

      stdout.write(prompt);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
    });
  }

  static fail(error) {
    console.error(`Error: ${error.message || error}`);
    process.exit(1);
  }

  static validateUsername(username) {
    if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
      throw new Error("Username must contain only letters, numbers, dots, dashes, and underscores");
    }
  }

  static hashPassword(username, password) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
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

      const [username, algorithm, salt, hash] = trimmed.split(":");
      if (username && algorithm === "scrypt" && salt && hash) {
        users.push({username, algorithm, salt, hash, line});
      } else {
        invalidEntries.push({lineNumber: index + 1, line});
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
    const temporaryFile = path.join(directory, `.users.${process.pid}.tmp`);
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

    const content = await this.readFile();
    const users = AuthUsers.parseUsers(content);
    const exists = users.some(user => user.username === username);
    if (exists && !options.replace) {
      throw new Error(`User '${username}' already exists. Use --replace to update it.`);
    }

    const keptLines = this.#withoutUser(content, username);
    keptLines.push(AuthUsers.hashPassword(username, password));
    await this.writeFile(keptLines);

    return {created: !exists, updated: exists};
  }

  async delete(username) {
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
      .filter(line => {
        const [lineUsername] = line.trim().split(":");
        return lineUsername !== username;
      }));
  }

  #trimTrailingEmptyLines(lines) {
    return lines.filter((line, index) => line.trim() !== "" || index < lines.length - 1);
  }

}
