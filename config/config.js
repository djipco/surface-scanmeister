import convict from "convict"
import convict_format_with_validator from 'convict-format-with-validator';
convict.addFormats(convict_format_with_validator);


/************************************* START CONFIGURATION ****************************************/
const config = convict({

  paths: {
    scansDir: {
      doc: 'Path to directory where scans should be saved',
      format: String,
      default: '/home/surface/scans'
    }
  },

  operation: {
    mode: {
      doc: 'How the image should be sent to peer',
      format: ["tcp", "smb"],
      default: 'tcp'
    }
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
        default: '10.0.0.132'
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
      doc: 'Whether open lamp while scanning (-100...100)',
      format: 'Boolean',
      default: false
    },
    hub: {
      manufacturerId: {
        doc: 'A hex string that identifier the vendor of the hub',
        format: String,
        default: "045b"
      },
      modelId: {
        doc: "A hex string that identifier the hub's product ID",
        format: String,
        default: "0209"
      }
    },
  },

  smb: {
    address: {
      doc: 'Path to remote SMB-shared directory where scans should be saved',
      format: String,
      default: "//10.0.0.200/select"
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
  }

});
/************************************** END CONFIGURATION *****************************************/


config.validate({allowed: 'strict'});
export {config};
