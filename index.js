import { ScanMeister } from "./ScanMeister";

ScanMeister.init().then(() => {

    console.log(ScanMeister.devices);

    // scanner.scan().pipe(fs.createWriteStream('./output.png'));

});