import { ScanMeister } from "./src/ScanMeister.js";
import fs from "fs"

ScanMeister.init().then(() => {

    console.log(ScanMeister.devices);

    // const opts = {deviceName: ScanMeister.devices[0].name};
    // ScanMeister.scan(opts).pipe(fs.createWriteStream('./output.png'));

    // ScanMeister.devices.forEach(dev => {
    //     const opts = {deviceName: dev.name};
    //     ScanMeister.scan(opts).pipe(fs.createWriteStream(`image${dev.index}.png`));
    //     console.log("called " + dev.index);
    // });

});