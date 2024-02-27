// Import modules
import ScanMeister from "./src/ScanMeister.js";
import {logError} from "./src/Logger.js";

const scanmeister = new ScanMeister();
scanmeister.start()
  .catch(async error => {
    logError(error);
    await scanmeister.quit(1);
  });


// import { existsSync } from 'fs';
//
// if (!existsSync('./node_modules')) {
//   console.error(`Error: node_modules directory missing`);
// } else {
//
// }
//
// const value = (
//   await import(`${condtion ? `./file1.js` : `./file2.js`}`)
// ).default
