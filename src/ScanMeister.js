import {spawn} from 'child_process'

class ScanMeister {

  constructor() {
    this.devices = [];
  }

  async init() {
    this.devices = await this.getDevices();
  }

  async getDevices() {

    return new Promise((resolve, reject) => {

        // Resulting string buffer
        let buffer = '';

        // Format for device list
        const format = '{"name":"%d", "vendor":"%v", "model":"%m", "type":"%t", "index":"%i"} %n'

        // Spawn scanimage process to retrieve list
        let scanimage = spawn(
            'scanimage',
            ['--formatted-device-list=' + format]
        );

        // Error handler
        scanimage.stdout.once('error', reject);

        // Data handler
        scanimage.stdout.on('data', chunk => buffer += chunk.toString());

        // End handler
        scanimage.stdout.once('end', () => {
            if (buffer) {
                return resolve(buffer.split('\n').filter(Boolean).map(line => JSON.parse(line)));
            } else {
                return resolve([]);
            }
        });

    });

  }

  scan(options = {}) {

    // Prepare args array
    const args = [];

    // Device name
    const devices = this.devices.map(dev => dev.name);
    if (devices.includes(options.deviceName)) {
      args.push(`--device-name='${options.deviceName}'`);
    }

    // File format
    if (["png"].includes(options.format)) {
      args.push('--format=' + options.format);
    } else {
      args.push('--format=png');
    }

    // Scanning mode
    if (["Color"].includes(options.mode)) {
      args.push('--mode=' + options.mode);
    } else {
      args.push('--mode=Color');
    }

    // Scanning bit depth
    if ([8, 16].includes(options.mode)) {
      args.push('--depth=' + options.depth);
    } else {
      args.push('--depth=8');
    }

    // Scanning resolution
    if ([4800,2400,1200,600,300,150,100,75].includes(options.resolution)) {
      args.push('--resolution=' + options.resolution);
    } else {
      args.push('--resolution=100');
    }

    // Brightness (-100...100)
    // Contrast (-100...100)
    // Lamp off time

    // Lamp off scan
    if (!!options.lampOffScan) {
      args.push('--lamp-off-scan=yes');
    } else {
      args.push('--lamp-off-scan=no');
    }

    const scanimage = spawn('scanimage', args);
    
    scanimage.stderr.on( 'data', ( data ) => {
      console.error( `stderr: ${ data }` );
  } );
    
    console.log("spawned")
    return scanimage.stdout;
    
  }

}

// Export singleton instance class. The 'constructor' is nulled so that it cannot be used to 
// instantiate a new object or extend it. However, it is not freezed so it remains extensible 
// (properties can be added at will).
const sm = new ScanMeister();
sm.constructor = null;
export {sm as ScanMeister};


// const options = {
//   format: 'png',
//   resolution: '150dpi'
// };


// const device = {
// name: 'genesys:libusb:001:016',
// //index: '2'
// }