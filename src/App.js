// Import Node.js modules
import osc from "osc";
import process from "node:process";
import { readFile } from 'fs/promises';
import { usb } from 'usb';

// Import project classes
import {Configuration as config} from "../config/Configuration.js";
import {Logger} from "./Logger.js";
import {ProcessRunner} from "./ProcessRunner.js";
import {Scanner} from './Scanner.js';
import {Server} from "./Server.js";
import {Permissions} from "./Permissions.js";
import {ScannerDiscovery} from "./ScannerDiscovery.js";

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
    Logger.info(
      `Starting ${pkg.title} v${pkg.version} ` +
      `(runtime: Node ${process.version} on ${process.platform}/${process.arch})...`
    );
    this.#logRuntimeContext();
    this.#logNetworkConfiguration();

    // Check platform
    if (process.platform !== "linux") {
      Logger.error(`This platform (${process.platform}) is not supported.`);
      await this.quit(1);
      return;
    }

    this.#checkPathPermissions();
    await this.#checkScannerAccessPermissions();

    // Set up OSC. This must be done before updating the scanner list because scanners need a
    // reference to the OSC object to send status.
    try {
      await this.#setupOsc()
    } catch (e) {
      Logger.error(e.message);
      await this.quit(1);
      return;
    }

    // Report OSC status (we only report it after the scanners are ready because scanners use OSC)
    Logger.info(
      `OSC ready. Listening on ` +
      config.network.osc_server.address + ":" + config.network.osc_server.port + ", sending to " +
      config.network.osc_client.address  + ":" + config.network.osc_client.port  + "."
    );

    // Update scanner list
    await this.#updateScanners();

    // Start HTTPS server and call its start() method passing a reference to the list of available
    // scanners.
    await this.#startHttpServer();

    // Start sending OSC status messages (on a regular interval)
    this.#callbacks.onStatusInterval = this.#onStatusInterval.bind(this);
    this.#intervals.status = setInterval(
      this.#callbacks.onStatusInterval,
      config.diagnostics.systemStatusInterval
    );

    // Add callbacks for USB hotplug events
    this.#callbacks.onUsbAttach = this.#onUsbAttach.bind(this);
    usb.on("attach", this.#callbacks.onUsbAttach);
    this.#callbacks.onUsbDetach = this.#onUsbDetach.bind(this);
    usb.on("detach", this.#callbacks.onUsbDetach);

    // Quitting by closing the window is not a problem, but it leaves little time for logging
    // information to be written. In that sense, CTRL-C is better.
    Logger.info("Press CTRL-C to properly exit.")

  }

  async #startHttpServer() {

    this.#server = new Server();

    this.#callbacks.onHttpServerError = this.#onHttpServerError.bind(this);
    this.#server.addListener("error", this.#callbacks.onHttpServerError);

    await this.#server.start(this.scanners);

  }

  async #onHttpServerError(err) {
    Logger.error(err);
    await this.quit(1);
  }

  #logRuntimeContext() {
    Logger.info(`Working directory: ${process.cwd()}`);
    Logger.info(`PATH: ${process.env.PATH || "not set"}`);
  }

  #logNetworkConfiguration() {
    Logger.info(
      `Network: HTTPS ${config.network.https_server.address}:${config.network.https_server.port}, ` +
      `HTTP redirect ${config.network.http_server.address}:${config.network.http_server.port}, ` +
      `OSC ${config.network.osc_server.address}:${config.network.osc_server.port} -> ` +
      `${config.network.osc_client.address}:${config.network.osc_client.port}.`
    );
  }

  #checkPathPermissions() {
    [
      ["Logs", config.paths.logs],
      ["Scans", config.paths.scans]
    ].forEach(([label, directory]) => {
      const result = Permissions.ensureWritableDirectory(label, directory);

      if (result.ok) {
        Logger.info(`${label} directory is writable: ${result.absolutePath}`);
      } else {
        Logger.warn(Permissions.formatWritableDirectoryError(result));
      }
    });
  }

  async #checkScannerAccessPermissions() {
    const result = Permissions.checkScannerAccessGroups();

    Logger.info(`Service user: ${Permissions.formatUserInfo(result.user)}`);

    if (!result.ok) {
      Logger.warn(Permissions.formatScannerAccessGroupWarning(result));
    }

    const scanImageCommand = Permissions.checkScanImageCommand();
    if (!scanImageCommand.ok) {
      Logger.warn(
        `${config.scan.command} was not found in PATH for service user ` +
        `${Permissions.formatUserInfo(result.user)}.`
      );
      return;
    }

    try {
      const scanImage = await Permissions.checkScanImageVersion();

      if (scanImage.ok) {
        Logger.info(`${config.scan.command} version: ${scanImage.version}`);
      } else {
        Logger.warn(`Could not read ${config.scan.command} version. Error: ${scanImage.error || "none"}.`);
      }
    } catch (error) {
      Logger.warn(`${config.scan.command} version check failed unexpectedly: ${error.message}`);
    }
  }

  #onStatusInterval() {
    this.#sendOscMessage("/system/status", [{type: "i", value: 1}]);
  }

  async #updateScanners() {
    await this.#destroyScanners();
    const scannerDescriptors = this.#getScannerDescriptors();
    this.#createScannersFromDescriptors(scannerDescriptors);
    this.#logScanners();
  }

  async #destroyScanners() {
    await Promise.all(this.#scanners.map(scanner => scanner.destroy()));
    this.#scanners.length = 0; // we must not destroy the reference
  }

  #getScannerDescriptors() {
    const {scanners: scannerDescriptors, mapping, warnings} = ScannerDiscovery.getScannerDescriptors();

    if (mapping) {
      Logger.info(`Assigning channels according to map '${mapping}'.`);
    } else {
      Logger.info("Assigning channels according to port hierarchy (no mapping used)");
    }

    warnings.forEach(warning => Logger.warn(warning));

    return scannerDescriptors;
  }

  #createScannersFromDescriptors(scannerDescriptors) {
    scannerDescriptors.forEach(descriptor => {
      const scanner = new Scanner(this.#oscPort, descriptor);
      scanner.addListener("oscmessage", this.#onScannerOscMessage.bind(this));
      this.#scanners.push(scanner);
    });
  }

  #logScanners() {
    if (this.scanners.length === 0) {
      Logger.warn("Updating scanners list... No scanners found.");
    } else if (this.scanners.length === 1) {
      Logger.info(`Updating scanners list... One scanner detected:`);
    } else {
      Logger.info(`Updating scanners list... ${this.scanners.length} scanners detected:`);
    }

    // Log scanner details to console
    this.scanners.forEach(scanner => {
      Logger.info(
        `\tChannel ${scanner.channel.toString().padStart(2, " ")}. ${scanner.description}`,
        true
      );
    });

  }

  async #onUsbAttach(descriptor) {

    // Check if it is a supported scanner. If it is, rebuild the scanner list of objects and report
    if (ScannerDiscovery.isSupportedScannerDescriptor(descriptor)) {
      Logger.info(
        `Scanner attached to bus ${descriptor.busNumber}, ` +
        `port ${descriptor.portNumbers.join("-")}.`
      );
      await this.#updateScanners();
    }

  }

  async #onUsbDetach(descriptor) {

    // Check if it is a supported scanner. If it is, rebuild the scanner list of objects and report
    if (ScannerDiscovery.isSupportedScannerDescriptor(descriptor)) {
      Logger.info(
        `Scanner detached from bus ${descriptor.busNumber}, ` +
        `port ${descriptor.portNumbers.join("-")}.`
      );
      await this.#updateScanners();
    }

  }

  async quit(status = 0, exit = true) {

    Logger.info("Exiting...");

    // Remove USB listeners
    usb.unrefHotplugEvents();
    this.#callbacks.onUsbAttach = undefined;
    this.#callbacks.onUsbDetach = undefined;

    // Remove termination listeners
    App.EXIT_SIGNALS.forEach(s => process.off(s, this.#callbacks.onExitRequest));

    // Destroy scanners and remove callbacks
    await this.#destroyScanners();
    this.#removeOscCallbacks();

    // Send final notification and close OSC
    if (this.#oscPort && this.#oscPort.socket) {

      clearInterval(this.#intervals.status);
      this.#intervals.status = undefined;
      this.#callbacks.onStatusInterval = undefined;

      this.#sendOscMessage("/system/status", [{type: "i", value: 0}]);
      await new Promise(resolve => setTimeout(resolve, 25));
      this.#oscPort.close();
      this.#oscPort = undefined;

    }

    // Quit HTTPS server
    if (this.#server) {
      await this.#server.quit();
      this.#server = undefined;
    }

    Logger.info(`ScanMeister stopped with status ${status}.`);

    // Exit
    if (exit) {

      // Wait a little for log files to be properly written
      setTimeout(() => process.exit(status), 100);

      setTimeout(() => {
        Logger.error("Application did not terminate properly, forcefully quitting.");
        // Wait a little for log files to be properly written
        setTimeout(() => process.exit(1), 100);
      }, 10000);

    }

  }

  get scanners() {
    return this.#scanners;
  }

  async #setupOsc() {

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
        Logger.error(
          `Unable to start OSC server. Network address already in use (${err.address}:${err.port})`
        );
      } else {
        Logger.error(`Unable to start OSC server (${err})`);
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

  #sendOscMessage(address, args = []) {
    if (!this.#oscPort || !this.#oscPort.socket) {
      Logger.warn("Impossible to send OSC, no socket available.")
      return;
    }
    this.#oscPort.send({address: address, args: args});
    this.#server?.broadcastOscMessage(address, args);
  }

  #onScannerOscMessage({address, args}) {
    this.#server?.broadcastOscMessage(address, args);
  }

  async #onExitRequest(signal) {
    Logger.info(`Termination signal received: ${signal}`);
    await this.quit();
  }

  async #onOscError(error) {
    Logger.warn(error);
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
      Logger.warn(`Invalid OSC command received (${command}).`)
      return;
    }

    // Execute command
    if (command === "reboot") {

      Logger.info("Reboot requested by remote...");

      // Call quit without actually exiting the Node.js process (reboot will force this)
      await this.quit(0, false);
      const processRunner = new ProcessRunner();
      processRunner.execute("reboot");

    }

  }

}
