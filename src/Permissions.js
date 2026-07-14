import {accessSync, constants, mkdirSync, statSync} from "node:fs";
import {execFile, execFileSync} from "node:child_process";
import os from "node:os";
import path from "node:path";

import {Configuration as config} from "../config/Configuration.js";

function getAbsolutePath(directory) {
  return path.resolve(process.cwd(), directory);
}

function findExecutable(command) {
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

function normalizeError(error) {
  if (!error) {
    return "Unknown error";
  }

  return error.code ? `${error.code}: ${error.message}` : error.message;
}

export function checkWritableDirectory(label, directory) {
  const absolutePath = getAbsolutePath(directory);

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
      error: normalizeError(error)
    };
  }
}

export function formatWritableDirectoryError(result) {
  return `${result.label} directory is not writable: ${result.absolutePath} (${result.error})`;
}

function getProcessId(method) {
  return typeof process[method] === "function" ? process[method]() : null;
}

function getCurrentGroups() {
  try {
    const output = execFileSync("id", ["-Gn"], {encoding: "utf8"});
    return output.trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

export function getCurrentUserInfo() {
  const userInfo = os.userInfo();

  return {
    username: userInfo.username,
    uid: getProcessId("getuid") ?? userInfo.uid,
    gid: getProcessId("getgid") ?? userInfo.gid,
    groups: getCurrentGroups()
  };
}

export function checkScannerAccessGroups() {
  const user = getCurrentUserInfo();
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

export function formatUserInfo(user) {
  const groups = user.groups.length > 0 ? user.groups.join(", ") : "unknown";
  return `${user.username} (uid=${user.uid}, gid=${user.gid}, groups=${groups})`;
}

export function formatScannerAccessGroupWarning(result) {
  const missingGroups = [
    ...result.missing.scanner,
    ...result.missing.usb
  ].join(", ");

  return (
    `Scanner access may be missing for service user ${formatUserInfo(result.user)}. ` +
    `Expected membership in groups: ${missingGroups}.`
  );
}

export function checkScanImageCommand() {
  const executable = findExecutable("scanimage");

  return {
    ok: executable !== null,
    executable
  };
}

function normalizeScanImageVersion(output) {
  return output.replace(/^scanimage\s+\(sane-backends\)\s+/i, "").trim();
}

export function checkScanImageVersion() {
  return new Promise(resolve => {
    execFile(
      "scanimage",
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
            version: normalizeScanImageVersion(output),
            error: null
          });
          return;
        }

        resolve({
          ok: false,
          version: output,
          error: output || normalizeError(error)
        });
      }
    );
  });
}
