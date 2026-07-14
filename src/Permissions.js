import {accessSync, constants, mkdirSync, statSync} from "node:fs";
import {execFile, execFileSync} from "node:child_process";
import os from "node:os";
import path from "node:path";

import {Configuration as config} from "../config/Configuration.js";

export class Permissions {

  static ensureWritableDirectory(label, directory) {
    const absolutePath = Permissions.#getAbsolutePath(directory);

    try {
      mkdirSync(absolutePath, {recursive: true});

      const stats = statSync(absolutePath);
      if (!stats.isDirectory()) {
        return {
          ok: false,
          label,
          directory,
          absolutePath,
          error: "Path exists but is not a directory"
        };
      }

      accessSync(absolutePath, constants.W_OK);

      return {
        ok: true,
        label,
        directory,
        absolutePath,
        error: null
      };
    } catch (error) {
      return {
        ok: false,
        label,
        directory,
        absolutePath,
        error: Permissions.#normalizeError(error)
      };
    }
  }

  static formatWritableDirectoryError(result) {
    return `${result.label} directory is not writable: ${result.absolutePath} (${result.error})`;
  }

  static getCurrentUserInfo() {
    const userInfo = os.userInfo();

    return {
      username: userInfo.username,
      uid: Permissions.#getProcessId("getuid") ?? userInfo.uid,
      gid: Permissions.#getProcessId("getgid") ?? userInfo.gid,
      groups: Permissions.#getCurrentGroups()
    };
  }

  static checkScannerAccessGroups() {
    const user = Permissions.getCurrentUserInfo();
    const scannerGroups = ["scanner", "lp"];
    const usbGroups = ["plugdev"];
    const hasScannerGroup = scannerGroups.some(group => user.groups.includes(group));
    const hasUsbGroup = usbGroups.some(group => user.groups.includes(group));

    return {
      ok: hasScannerGroup && hasUsbGroup,
      user,
      missing: {
        scanner: hasScannerGroup ? [] : scannerGroups,
        usb: hasUsbGroup ? [] : usbGroups
      }
    };
  }

  static formatUserInfo(user) {
    const groups = user.groups.length > 0 ? user.groups.join(", ") : "unknown";
    return `${user.username} (uid=${user.uid}, gid=${user.gid}, groups=${groups})`;
  }

  static formatScannerAccessGroupWarning(result) {
    const missingGroups = [
      ...result.missing.scanner,
      ...result.missing.usb
    ].join(", ");

    return (
      `Scanner access may be missing for service user ${Permissions.formatUserInfo(result.user)}. ` +
      `Expected membership in groups: ${missingGroups}.`
    );
  }

  static checkScanImageCommand() {
    const executable = Permissions.#findExecutable(config.scan.command);

    return {
      ok: executable !== null,
      executable
    };
  }

  static checkScanImageVersion() {
    return new Promise(resolve => {
      execFile(
        config.scan.command,
        ["-V"],
        {
          encoding: "utf8",
          timeout: config.diagnostics.scanImageVersionTimeout,
          windowsHide: true
        },
        (error, stdout, stderr) => {
          const output = (stdout || stderr).trim();

          if (!error) {
            resolve({
              ok: true,
              version: Permissions.#normalizeScanImageVersion(output),
              error: null
            });
            return;
          }

          resolve({
            ok: false,
            version: output,
            error: output || Permissions.#normalizeError(error)
          });
        }
      );
    });
  }

  static #getAbsolutePath(directory) {
    return path.resolve(process.cwd(), directory);
  }

  static #findExecutable(command) {
    const paths = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);

    for (const directory of paths) {
      const candidate = path.join(directory, command);

      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep looking through PATH.
      }
    }

    return null;
  }

  static #normalizeError(error) {
    if (!error) {
      return "Unknown error";
    }

    return error.code ? `${error.code}: ${error.message}` : error.message;
  }

  static #getProcessId(method) {
    return typeof process[method] === "function" ? process[method]() : null;
  }

  static #getCurrentGroups() {
    try {
      const output = execFileSync("id", ["-Gn"], {encoding: "utf8"});
      return output.trim().split(/\s+/).filter(Boolean);
    } catch {
      return [];
    }
  }

  static #normalizeScanImageVersion(output) {
    return output.replace(/^scanimage\s+\(sane-backends\)\s+/i, "").trim();
  }

}
