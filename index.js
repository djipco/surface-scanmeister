// Import modules
import ScanMeister from "./src/ScanMeister.js";
import {logInfo, logError} from "./src/Logger.js";

const scanmeister = new ScanMeister();
scanmeister.start()
  .catch(async error => {
    logError(error);
    logInfo("Exiting...")
    await scanmeister.destroy();
    process.exit(1);
  });
