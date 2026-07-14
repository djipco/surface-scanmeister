import {Configuration as config} from "../config/Configuration.js";
import {ScanStorage} from "./ScanStorage.js";

export class ApiRequest {

  static parse(request) {
    const parsed = {};
    const url = new URL(request.url, `http://${request.headers.host}`);
    const segments = url.pathname.split('/').slice(1);

    if (segments[0] === "events" && segments.length === 1) {
      ApiRequest.#requireMethod(request, "GET");
      parsed.command = "events";
    } else if (segments[0] === "scanners" && segments.length === 1) {
      ApiRequest.#requireMethod(request, "GET");
      parsed.command = "list-scanners";
    } else if (segments[0] === "scanners" && segments.length === 3) {
      ApiRequest.#parseScannerRoute(request, segments, parsed);
    } else if (segments[0] === "scans" && segments.length === 1) {
      ApiRequest.#parseScansRoute(request, parsed);
    } else if (segments[0] === "scans" && segments.length === 2) {
      ApiRequest.#requireMethod(request, "GET");
      parsed.command = "read-scan";
      parsed.filename = ScanStorage.sanitizeFilename(decodeURIComponent(segments[1]));
    } else {
      throw new Error(`Invalid API request received: ${url.href}`);
    }

    if (!parsed.filename) {
      parsed.filename = ScanStorage.sanitizeFilename(url.searchParams.get('filename') || 'scan.png');
    }

    ApiRequest.#parseScanParameters(url, parsed);
    return parsed;
  }

  static #parseScannerRoute(request, segments, parsed) {
    parsed.channel = ApiRequest.#parseChannel(segments[1]);

    if (segments[2] === "command" && request.method === "GET") {
      parsed.command = "preview-command";
    } else if (segments[2] === "scan" && request.method === "POST") {
      parsed.command = "start-scan";
    } else if (segments[2] === "cancel" && request.method === "POST") {
      parsed.command = "cancel-scan";
    } else {
      throw new Error("Invalid scanner route");
    }
  }

  static #parseChannel(value) {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new Error("Invalid scanner channel");
    }

    return parseInt(value, 10);
  }

  static #parseScansRoute(request, parsed) {
    if (request.method === "GET") {
      parsed.command = "list-scans";
    } else if (request.method === "POST") {
      parsed.command = "save-scan";
    } else {
      throw new Error("Method not allowed");
    }
  }

  static #parseScanParameters(url, parsed) {
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
  }

  static #requireMethod(request, method) {
    if (request.method !== method) throw new Error("Method not allowed");
  }

}
