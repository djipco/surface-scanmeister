import convict from "convict"
import convict_format_with_validator from 'convict-format-with-validator';
convict.addFormats(convict_format_with_validator);


/************************************* START CONFIGURATION ****************************************/
const config = convict({

  paths: {
    scansDir: {
      doc: 'Path to directory where scans should be saved in "file" mode',
      format: String,
      default: '/home/scanmeisterXXX/scans'
    }
  },

  operation: {
    mode: {
      doc: 'Whether to save the scan locally (file) of send it via network (tcp)',
      format: ["tcp", "file"],
      default: 'file'
    }
  },

  tcp: {
    address: {
      doc: 'Address of the remote server',
      format: 'ipaddress',
      default: "10.0.0.200"
    },
    port: {
      doc: 'Port of the remote server',
      format: 'port',
      default: "1234"
    },
  },

  osc: {
    local: {
      address: {
        doc: 'Local IP address to bind to for OSC',
        format: 'ipaddress',
        default: '0.0.0.0'
      },
      port: {
        doc: 'Local port to listen on for OSC',
        format: 'port',
        default: 8000
      }
    },
    remote: {
      address: {
        doc: 'Remote IP address to send OSC to',
        format: 'ipaddress',
        default: '10.0.0.200'
      },
      port: {
        doc: 'Remote port to send OSC to',
        format: 'port',
        default: 10000
      }
    }
  },

  devices: {
    resolution: {
      doc: 'The scanning resolution (in PDI) to use',
      format: [75, 100, 150, 300, 600, 1200, 2400, 4800],
      default: 75
    },
    brightness: {
      doc: 'The scanning brightness (-100...100)',
      format: 'int',
      default: 25
    },
    contrast: {
      doc: 'The scanning contrast (-100...100)',
      format: 'int',
      default: 25
    },
    lampOffScan: {
      doc: 'Whether to open the lamp while scanning',
      format: 'Boolean',
      default: false
    },
    lampOffTime: {
      doc: 'Number of minutes after which the lamp is turned off (0...60)',
      format: 'int',
      default: 15
    },
    x: {
      doc: 'The x position to start the scan at (0...216.7mm)',
      format: 'Number',
      default: 0
    },
    y: {
      doc: 'The y position to start the scan at (0...297.5mm)',
      format: 'Number',
      default: 0
    },
    width: {
      doc: 'Width of scan area (0...216.7mm)',
      format: 'Number',
      default: 216.7
    },
    height: {
      doc: 'Height of scan area (0...297.5mm)',
      format: 'Number',
      default: 297.5
    },
  }

});
/************************************** END CONFIGURATION *****************************************/


config.validate({allowed: 'strict'});
export {config};
