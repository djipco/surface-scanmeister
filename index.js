// Import modules
import {access, constants} from "fs/promises";
import process from "node:process";

// Check if modules have been properly installed
try {
  await access("node_modules", constants.F_OK);
} catch (error) {
  console.error(`The modules have not been installed. Install them with: npm install`);
  console.log("Exiting...");
  setTimeout(() => process.exit(1), 500); // wait for log files to be written
}

import ScanMeister from "./src/ScanMeister.js";
import {logError} from "./src/Logger.js";

const scanmeister = new ScanMeister();
scanmeister.start()
  .catch(async error => {
    logError(error);
    await scanmeister.quit(1);
  });
