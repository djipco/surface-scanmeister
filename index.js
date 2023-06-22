import { ScanMeister } from "./src/ScanMeister.js";

ScanMeister.init().then(() => {

    console.log(ScanMeister.devices);

    // scanner.scan().pipe(fs.createWriteStream('./output.png'));

});