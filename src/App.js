// Import Node.js modules
import osc from "osc";
import process from "node:process";
import { readFile } from 'fs/promises';
import { usb } from 'usb';

// Import project classes
import {Configuration as config} from "../config/Configuration.js";
import {logInfo, logError, logWarn} from "./Logger.js"
import {Scanner} from './Scanner.js';
import {Server} from "./Server.js";
import {Spawner} from "./Spawner.js";
import {
  checkScannerAccessGroups,
  checkScanImageCommand,
  checkScanImageVersion,
  checkWritableDirectory,
  formatScannerAccessGroupWarning,
  formatUserInfo,
  formatWritableDirectoryError
} from "./Permissions.js";
import {
  getScannerDescriptors,
  isSupportedScannerDescriptor
} from "./ScannerDiscovery.js";

export default class App {

  // Valid OSC commands to respond to
  static OSC_COMMANDS = ["reboot"];

  // Termination signals to respond to
  static EXIT_SIGNALS = [
    "SIGINT",     // CTRL+C
    "SIGQUIT",    // Keyboard quit
    "SIGTERM",    // `kill` command
    "SIGHUP"      // Terminal window closed
  ];

  // Private variables
  #callbacks = {};
  #intervals = {};
  #oscPort;
  #scanners = [];
  #server = undefined;

  constructor() {}

  async start() {

    // Watch for quit signals
    this.#callbacks.onExitRequest = this.#onExitRequest.bind(this);
    App.EXIT_SIGNALS.forEach(s => process.on(s, this.#callbacks.onExitRequest));

    // Grab info from package.json
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

    // Log start details
    logInfo(
      `Starting ${pkg.title} v${pkg.version} ` +
      `(runtime: Node ${process.version} on ${process.platform}/${process.arch})...`
    );
    this.#logRuntimeContext();

    // Check platform
    if (process.platform !== "linux") {
      logError(`This platform (${process.platform}) is not supported.`);
      await this.quit(1);
      return;
    }

    this.#checkPathPermissions();
    await this.#checkScannerAccessPermissions();

    // Set up OSC. This must be done before updating the scanner list because scanners need a
    // reference to the OSC object to send status.
    try {
      await this.setupOsc()
    } catch (e) {
      logError(e.message);
      await this.quit(1);
      return;
    }

    // Report OSC status (we only report it after the scanners are ready because scanners use OSC)
    logInfo(
      `OSC ready. Listening on ` +
      config.network.osc_server.address + ":" + config.network.osc_server.port + ", sending to " +
      config.network.osc_client.address  + ":" + config.network.osc_client.port  + "."
    );

    // Update scanner list
    await this.#updateScanners();

    // Start HTTPS server and call its start() method passing a reference to the list of available
    // scanners.
    await this.#startHtttpServer();

    // Start sending OSC status messages (on a regular interval)
    this.#callbacks.onStatusInterval = this.#onStatusInterval.bind(this);
    this.#intervals.status = setInterval(this.#callbacks.onStatusInterval, 1000);

    // Add callbacks for USB hotplug events
    this.#callbacks.onUsbAttach = this.#onUsbAttach.bind(this);
    usb.on("attach", this.#callbacks.onUsbAttach);
    this.#callbacks.onUsbDetach = this.#onUsbDetach.bind(this);
    usb.on("detach", this.#callbacks.onUsbDetach);

    // Quitting by closing the window is not a problem, but it leaves little time for logging
    // information to be written. In that sense, CTRL-C is better.
    logInfo("Press CTRL-C to properly exit.")

  }

  async #startHtttpServer() {

    this.#server = new Server();

    this.#callbacks.onHttpServerError = this.#onHttpServerError.bind(this);
    this.#server.addListener("error", this.#callbacks.onHttpServerError);

    await this.#server.start(this.scanners);

  }

  async #onHttpServerError(err) {
    logError(err);
    await this.quit(1);
  }

  #logRuntimeContext() {
    logInfo(`Working directory: ${process.cwd()}`);
    logInfo(`PATH: ${process.env.PATH || "not set"}`);
  }

  #checkPathPermissions() {
    [
      ["Logs", config.paths.logs],
      ["Scans", config.paths.scans]
    ].forEach(([label, directory]) => {
      const result = checkWritableDirectory(label, directory);

      if (result.ok) {
        logInfo(`${label} directory is writable: ${result.absolutePath}`);
      } else {
        logWarn(formatWritableDirectoryError(result));
      }
    });
  }

  async #checkScannerAccessPermissions() {
    const result = checkScannerAccessGroups();

    logInfo(`Service user: ${formatUserInfo(result.user)}`);

    if (!result.ok) {
      logWarn(formatScannerAccessGroupWarning(result));
    }

    const scanImageCommand = checkScanImageCommand();
    if (!scanImageCommand.ok) {
      logWarn(`scanimage was not found in PATH for service user ${formatUserInfo(result.user)}.`);
      return;
    }

    try {
      const scanImage = await checkScanImageVersion();

      if (scanImage.ok) {
        logInfo(`scanimage version: ${scanImage.version}`);
      } else {
        logWarn(`Could not read scanimage version. Error: ${scanImage.error || "none"}.`);
      }
    } catch (error) {
      logWarn(`scanimage version check failed unexpectedly: ${error.message}`);
    }
  }

  #onStatusInterval() {
    this.sendOscMessage("/system/status", [{type: "i", value: 1}]);
  }

  async #updateScanners() {

    // Stop in progress scans and destroy any previous scanner objects
    this.#scanners.forEach(async scanner => await scanner.destroy());
    this.#scanners.length = 0; // me must not destroy the reference

    // Retrieve list of objects describing scanner ports and device numbers
    const {scanners: scannerDescriptors, mapping} = getScannerDescriptors();

    if (mapping) {
      logInfo(`Assigning channels according to map '${mapping}'.`);
    } else {
      logInfo("Assigning channels according to port hierarchy (no mapping used)");
    }

    // Create new scanner objects
    scannerDescriptors.forEach(descriptor => {
      const scanner = new Scanner(this.#oscPort, descriptor);
      scanner.addListener("oscmessage", this.#onScannerOscMessage.bind(this));
      this.#scanners.push(scanner);
    });

    // Report number of scanners found
    if (this.scanners.length === 0) {
      logWarn("Updating scanners list... No scanners found.");
    } else if (this.scanners.length === 1) {
      logInfo(`Updating scanners list... One scanner detected:`);
    } else {
      logInfo(`Updating scanners list... ${this.scanners.length} scanners detected:`);
    }

    // Log scanner details to console
    this.scanners.forEach(scanner => {
      logInfo(
        `\tChannel ${scanner.channel.toString().padStart(2, " ")}. ${scanner.description}`,
        true
      );
    });

  }

  async #onUsbAttach(descriptor) {

    // Check if it is a supported scanner. If it is, rebuild the scanner list of objects and report
    if (isSupportedScannerDescriptor(descriptor)) {
      logInfo(
        `Scanner attached to bus ${descriptor.busNumber}, ` +
        `port ${descriptor.portNumbers.join("-")}.`
      );
      await this.#updateScanners();
    }

  }

  async #onUsbDetach(descriptor) {

    // Check if it is a supported scanner. If it is, rebuild the scanner list of objects and report
    if (isSupportedScannerDescriptor(descriptor)) {
      logInfo(
        `Scanner detached from bus ${descriptor.busNumber}, ` +
        `port ${descriptor.portNumbers.join("-")}.`
      );
      await this.#updateScanners();
    }

  }

  async quit(status = 0, exit = true) {

    logInfo("Exiting...");

    // Remove USB listeners
    usb.unrefHotplugEvents();
    this.#callbacks.onUsbAttach = undefined;
    this.#callbacks.onUsbDetach = undefined;

    // Remove termination listeners
    App.EXIT_SIGNALS.forEach(s => process.off(s, this.#callbacks.onExitRequest));

    // Destroy scanners and remove callbacks
    this.scanners.forEach(async device => await device.destroy());
    this.#removeOscCallbacks();

    // Send final notification and close OSC
    if (this.#oscPort && this.#oscPort.socket) {

      clearInterval(this.#intervals.status);
      this.#intervals.status = undefined;
      this.#callbacks.onStatusInterval = undefined;

      this.sendOscMessage("/system/status", [{type: "i", value: 0}]);
      await new Promise(resolve => setTimeout(resolve, 25));
      this.#oscPort.close();
      this.#oscPort = undefined;

    }

    // Quit HTTPS server
    if (this.#server) {
      await this.#server.quit();
      this.#server = undefined;
    }

    logInfo(`ScanMeister stopped with status ${status}.`);

    // Exit
    if (exit) {

      // Wait a little for log files to be properly written
      setTimeout(() => process.exit(status), 100);

      setTimeout(() => {
        logError("Application did not terminate properly, forcefully quitting.");
        // Wait a little for log files to be properly written
        setTimeout(() => process.exit(1), 100);
      }, 10000);

    }

  }

  get scanners() {
    return this.#scanners;
  }

  async setupOsc() {

    // Instantiate OSC UDP port
    this.#oscPort = new osc.UDPPort({
      localAddress: config.network.osc_server.address,
      localPort: config.network.osc_server.port,
      remoteAddress: config.network.osc_client.address,
      remotePort: config.network.osc_client.port,
      metadata: true
    });

    // If we get an error before OSC is "ready", there's no point in continuing. If we get the ready
    // event, we're good to go.
    this.#callbacks.onInitialOscError = async err => {

      if (err.code === "EADDRINUSE") {
        logError(
          `Unable to start OSC server. Network address already in use (${err.address}:${err.port})`
        );
      } else {
        logError(`Unable to start OSC server (${err})`);
      }

      await this.quit(1);
      return;

    };

    this.#oscPort.once("error", this.#callbacks.onInitialOscError);
    this.#oscPort.open();
    await new Promise(resolve => this.#oscPort.once("ready", resolve));
    this.#oscPort.off("error", this.#callbacks.onInitialOscError);
    this.#callbacks.onInitialOscError = undefined;

    // Now that OSC is ready, add callbacks for inbound messages (must be done before creating
    // scanner objects)
    this.#callbacks.onOscError = this.#onOscError.bind(this);
    this.#oscPort.on("error", this.#callbacks.onOscError);
    this.#callbacks.onOscMessage = this.#onOscMessage.bind(this);
    this.#oscPort.on("message", this.#callbacks.onOscMessage);

  }

  sendOscMessage(address, args = []) {
    if (!this.#oscPort || !this.#oscPort.socket) {
      logWarn("Impossible to send OSC, no socket available.")
      return;
    }
    this.#oscPort.send({address: address, args: args});
    this.#server?.broadcastOscMessage(address, args);
  }

  #onScannerOscMessage({address, args}) {
    this.#server?.broadcastOscMessage(address, args);
  }

  async #onExitRequest(signal) {
    logInfo(`Termination signal received: ${signal}`);
    await this.quit();
  }

  async #onOscError(error) {
    logWarn(error);
  }

  #removeOscCallbacks() {

    if (this.#oscPort) {

      if (this.#callbacks.onOscError) {
        this.#oscPort.off("error", this.#callbacks.onOscError);
      }
      this.#callbacks.onOscError = null;

      if (this.#callbacks.onOscMessage) {
        this.#oscPort.off("message", this.#callbacks.onOscMessage);
      }
      this.#callbacks.onOscMessage = null;

      if (this.#callbacks.onOscBundle) {
        this.#oscPort.off("bundle", this.#callbacks.onOscBundle);
      }
      this.#callbacks.onOscBundle = null;

    }

  }

  getScannerByChannel(channel) {
    return this.#scanners.find(scanner => scanner.channel === channel);
  }

  async #onOscMessage(message) {

    const segments = message.address.split("/").slice(1);

    // Filter out invalid commands
    const command = segments[0].toLowerCase()
    if (!App.OSC_COMMANDS.includes(command)) {
      logWarn(`Invalid OSC command received (${command}).`)
      return;
    }

    // Execute command
    if (command === "reboot") {

      logInfo("Reboot requested by remote...");

      // Call quit without actually exiting the Node.js process (reboot will force this)
      await this.quit(0, false);
      const spawner = new Spawner();
      spawner.execute("reboot");

    }

  }

}
