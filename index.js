// Import modules
import ScanMeister from "./src/ScanMeister.js";
import {logError} from "./src/Logger.js";

const scanmeister = new ScanMeister();
scanmeister.start()
  .catch(async error => {
    logError(error);
    await scanmeister.quit(1);
  });
