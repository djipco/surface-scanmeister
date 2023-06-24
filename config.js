import convict from "convict"
import {ipaddress} from 'convict-format-with-validator';
convict.addFormat(ipaddress);


/************************************* START CONFIGURATION ****************************************/
const config = convict({

  paths: {
    scans_dir: {
      doc: 'Path to directory where scans should be saved',
      format: String,
      default: '../scans'
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
        default: '8000'
      }
    }
  }

});
/************************************** END CONFIGURATION *****************************************/


config.validate({allowed: 'strict'});
export {config};
