import { ScanMeister } from "./src/ScanMeister.js";
import fs from "fs"

ScanMeister.init().then(() => {

    console.log(ScanMeister.devices);

    ScanMeister.devices.forEach(scanner => {
        
        // ScanMeister.scan(opts).pipe(fs.createWriteStream(`image${dev.index}.png`));
        // console.log("called " + dev.index);

        scanner.scan().pipe(fs.createWriteStream(`image${scanner.index}.png`));
        scanner.addListener("scancomplete", data => console.log("Complete: " + data))

    });

});