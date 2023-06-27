import {ScanMeister} from "./src/ScanMeister.js";
import {exit} from 'node:process';
import {logError, logInfo} from "./src/Utils.js";

// Start ScanMeister
logInfo(`Starting ScanMeister v${ScanMeister.version}...`)

ScanMeister.init()
  .then(() => {
    logInfo(`ScanMeister v${ScanMeister.version} successfully started`)
  })
  .catch(error => {
    logError(error);
    logError("Exiting...")
    ScanMeister.destroy();
    exit(1);
  });
