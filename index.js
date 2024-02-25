// Import modules
import ScanMeister from "./src/ScanMeister.js";
import {logError, logInfo} from "./src/Logger.js";
import {access, constants} from "fs/promises";
import process from "node:process";

// Check if modules have been properly installed
try {
  await access("node_modules", constants.F_OK);
} catch (error) {
  logError(`The modules have not been installed. Install them with: npm install`);
  logInfo("Exiting...");
  setTimeout(() => process.exit(1), 500); // wait for log files to be written
}

const scanmeister = new ScanMeister();
scanmeister.start()
  .catch(async error => {
    logError(error);
    await scanmeister.quit(1);
  });
