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
  })


// ScanMeister.init().then(() => {
//
//     console.log(ScanMeister.devices);
//
//     ScanMeister.devices.forEach(scanner => {
//         // scanner.scan().pipe(fs.createWriteStream(`image${scanner.index}.png`));
//         scanner.addListener("scancompleted", data => console.log("Complete: " + data.target.index))
//     });
//
// });
