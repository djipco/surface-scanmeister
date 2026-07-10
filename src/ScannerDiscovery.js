import {usb} from "usb";

import {Configuration as config} from "../config/Configuration.js";
import {ScannerMappings} from "../config/ScannerMappings.js";
import {SupportedScanners} from "../config/SupportedScanners.js";

export function getScannerDetails(idVendor, idProduct) {
  return SupportedScanners.find(model => model.idVendor === idVendor && model.idProduct === idProduct);
}

export function isSupportedScannerDescriptor(descriptor) {
  const identifiers = SupportedScanners.map(model => `${model.idVendor}:${model.idProduct}`);
  const idVendor = descriptor.deviceDescriptor.idVendor.toString(16).padStart(4, "0");
  const idProduct = descriptor.deviceDescriptor.idProduct.toString(16).padStart(4, "0");

  return identifiers.includes(`${idVendor}:${idProduct}`);
}

function sortScannerDescriptors(scannerDescriptors) {
  scannerDescriptors.sort((a, b) => {
    const paddedA = Array(5 - a.portNumbers.length).fill(0).concat(a.portNumbers);
    const paddedB = Array(5 - b.portNumbers.length).fill(0).concat(b.portNumbers);
    let hierarchyA = [a.busNumber].concat(paddedA);
    let hierarchyB = [b.busNumber].concat(paddedB);

    hierarchyA = hierarchyA.map((val, i, arr) => val * (32 ** (arr.length - i)));
    hierarchyB = hierarchyB.map((val, i, arr) => val * (32 ** (arr.length - i)));

    return hierarchyA.reduce((t, v) => t + v) - hierarchyB.reduce((t, v) => t + v);
  });
}

function applyChannelMapping(scannerDescriptors) {
  if (!config.devices.mapping) {
    scannerDescriptors.forEach((descriptor, index) => {
      descriptor.channel = index + 1;
    });
    return {
      scanners: scannerDescriptors,
      mapping: null
    };
  }

  const mapping = ScannerMappings[config.devices.mapping];
  const mappedScanners = [];

  Object.entries(mapping).forEach(([key, value]) => {
    const found = scannerDescriptors.find(scanner => scanner.hierarchy === key);
    if (found) {
      found.channel = value;
      mappedScanners.push(found);
    }
  });

  mappedScanners.sort((a, b) => a.channel - b.channel);
  return {
    scanners: mappedScanners,
    mapping: config.devices.mapping
  };
}

export function getScannerDescriptors() {
  const descriptors = usb.getDeviceList();

  descriptors.forEach(device => {
    device.idVendor = device.deviceDescriptor.idVendor.toString(16).padStart(4, "0");
    device.idProduct = device.deviceDescriptor.idProduct.toString(16).padStart(4, "0");
    device.identifier = `${device.idVendor}:${device.idProduct}`;
  });

  const scannerDescriptors = descriptors.filter(device => isSupportedScannerDescriptor(device));

  scannerDescriptors.forEach(scanner => {
    const details = getScannerDetails(scanner.idVendor, scanner.idProduct);

    scanner.systemName = details.driverPrefix + scanner.busNumber.toString().padStart(3, "0") +
      ":" + scanner.deviceAddress.toString().padStart(3, "0");
    scanner.vendor = details.vendor;
    scanner.product = details.product;
    scanner.hierarchy = [scanner.busNumber].concat(scanner.portNumbers).join("-");
  });

  sortScannerDescriptors(scannerDescriptors);
  return applyChannelMapping(scannerDescriptors);
}
