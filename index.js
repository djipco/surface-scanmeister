import {ScanMeister} from "./src/ScanMeister.js";
import {logInfo, logError} from "./src/Logger.js"
import process from 'node:process';

import { readFile } from 'fs/promises';
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));

// Check platform
if (process.platform !== "linux") {
  logError(`This platform (${process.platform}) is not supported.`);
  logInfo("Exiting...");
  process.exit(1);
}

// Start ScanMeister
logInfo(`Starting ScanMeister v${pkg.version}...`);

ScanMeister.init()
  .then(() => {
    logInfo(`ScanMeister successfully started`);
    process.on('SIGINT', onExit);  // CTRL+C
    process.on('SIGQUIT', onExit); // Keyboard quit
    process.on('SIGTERM', onExit); // `kill` command
  })
  .catch(async error => {
    logError(error);
    logError("Exiting...")
    await ScanMeister.destroy();
    process.exit(1);
  });

async function onExit() {
  logInfo("Exiting...");
  await ScanMeister.destroy();
  process.exit();
}
