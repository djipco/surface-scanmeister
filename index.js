import { ScanMeister } from "./ScanMeister";

// scanner.scan().pipe(fs.createWriteStream('./output.png'));

ScanMeister.init().then(() => {

    console.log(ScanMeister.devices);

});