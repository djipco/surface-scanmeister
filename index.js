import { ScanMeister } from "./src/ScanMeister.js";
import fs from "fs"

ScanMeister.init().then(() => {

    console.log(ScanMeister.devices);

    // scanner.scan().pipe(fs.createWriteStream('./output.png'));

    const opts = {deviceName:ScanMeister.devices[0].name};
    ScanMeister.scan(opts).pipe(fs.createWriteStream('./output.png'));

});