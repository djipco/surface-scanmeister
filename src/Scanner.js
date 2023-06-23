import {spawn} from 'child_process'
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js"

export class Scanner extends EventEmitter {

  constructor(options) {
    super();
    this.name = options.name || "";
    this.vendor = options.vendor || "";
    this.model = options.model || "";
    this.type = options.type || "";
    this.index = options.index || "";
    this.scanning = false;
  }

  scan(options = {}) {

    console.log("scan");

    // Ignore if already scanning
    if (this.scanning) {
      console.warn("Already scanning. Ignoring.");
      return;
    };
    this.scanning = true;

    // Prepare args array
    const args = [];

    // Device name (optional)
    if (this.name) {
      args.push(`--device-name=${this.name}`);
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

    // Initiate scanning
    const scanimage = spawn(
      'scanimage', 
      args,
      { detached: true }
    );
    this.emit("scanstarted", {target: this});
    
    // Report errors if any
    scanimage.stderr.on('data', data => {
      this.emit("error", data);
    });

    scanimage.stdout.on('end', () => {
      this.scanning = false;
      this.emit("scancompleted", {target: this});
    });
    
    return scanimage.stdout;
    
  }
  
}