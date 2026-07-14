import {randomBytes, scryptSync} from 'node:crypto';
import {chmod, chown, mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const DEFAULT_USERS_FILE = "/etc/scanmeister/users";

export function parseCommonArguments(args) {
  const options = {
    file: process.env.SCANMEISTER_AUTH_USERS_FILE || DEFAULT_USERS_FILE,
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

export function validateUsername(username) {
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
    throw new Error("Username must contain only letters, numbers, dots, dashes, and underscores");
  }
}

export function hashPassword(username, password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${username}:scrypt:${salt}:${hash}`;
}

export async function readUsersFile(file) {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}

export function parseUsers(content) {
  const users = [];
  const lines = content.split(/\r?\n/);

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const [username, algorithm, salt, hash] = trimmed.split(":");
    if (username && algorithm === "scrypt" && salt && hash) {
      users.push({username, algorithm, salt, hash, line});
    }
  });

  return users;
}

export async function writeUsersFile(file, lines) {
  const directory = path.dirname(file);
  const temporaryFile = path.join(directory, `.users.${process.pid}.tmp`);
  const content = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  let existingFile;

  try {
    existingFile = await stat(file);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  await mkdir(directory, {recursive: true});
  await writeFile(temporaryFile, content, {mode: 0o640});
  if (existingFile) {
    await chown(temporaryFile, existingFile.uid, existingFile.gid);
    await chmod(temporaryFile, existingFile.mode & 0o777);
  }
  await rename(temporaryFile, file);
}

export async function readHidden(prompt) {
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

export function fail(error) {
  console.error(`Error: ${error.message || error}`);
  process.exit(1);
}
