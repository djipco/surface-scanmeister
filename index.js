import {ScanMeister} from "./src/ScanMeister.js";
import {logError, logInfo} from "./src/Utils.js";
import process from 'node:process';

// Start ScanMeister
logInfo(`Starting ScanMeister v${ScanMeister.version}...`)

ScanMeister.init()
  .then(() => {
    logInfo(`ScanMeister v${ScanMeister.version} successfully started`);
    process.on('SIGINT', onExit);  // CTRL+C
    process.on('SIGQUIT', onExit); // Keyboard quit
    process.on('SIGTERM', onExit); // `kill` command
  })
  .catch(error => {
    logError(error);
    logError("Exiting...")
    ScanMeister.destroy();
    process.exit(1);
  });

async function onExit() {
  logInfo("Exiting...");
  await ScanMeister.destroy();
  process.exit();
}
