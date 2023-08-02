import convict from "convict"
import {ipaddress} from 'convict-format-with-validator';
convict.addFormat(ipaddress);


/************************************* START CONFIGURATION ****************************************/
const config = convict({

  paths: {
    scansDir: {
      doc: 'Path to directory where scans should be saved',
      format: String,
      default: '/home/surface/scans'
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
    // filter: {
    //   doc: 'String used to find appropriate devices inside the `usb-devices` command output',
    //   format: String,
    //   default: 'Product=CanoScan'
    // },
    resolution: {
      doc: 'The default scanning resolution to use in DPI',
      format: 'int',
      default: 75
    },
    hub: {
      vendor: {
        doc: 'A hex string that identifier the vendor of the hub',
        format: String,
        default: "045b"
      },
      productId: {
        doc: "A hex string that identifier the hub's product ID",
        format: String,
        default: "0209"
      }
    },
  }

});
/************************************** END CONFIGURATION *****************************************/


config.validate({allowed: 'strict'});
export {config};
