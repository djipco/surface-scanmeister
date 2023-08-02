/**
 * Array describing how the physical ports on the device map to the software-reported ports
 */
const scanners = [
  {
    identifier: "04a9:1904",
    manufacturer: "Canon",
    model: "CanoScan LiDE 100",
    driverPrefix: "genesys:libusb:"
  },
  {
    identifier: "04a9:1909",
    manufacturer: "Canon",
    model: "CanoScan LiDE 110",
    driverPrefix: "genesys:libusb:"
  },
  {
    identifier: "04a9:190a",
    manufacturer: "Canon",
    model: "CanoScan LiDE 210",
    driverPrefix: "genesys:libusb:"
  },
  {
    identifier: "04a9:190f",
    manufacturer: "Canon",
    model: "CanoScan LiDE 220",
    driverPrefix: "genesys:libusb:"
  },
]

export {scanners};
