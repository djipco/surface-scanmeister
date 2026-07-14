import {usb} from "usb";

import {Configuration as config} from "../config/Configuration.js";
import {ScannerMappings} from "../config/ScannerMappings.js";
import {SupportedScanners} from "../config/SupportedScanners.js";

export class ScannerDiscovery {

  static #supportedScannerIdentifiers = new Set(
    SupportedScanners.map(model => `${model.idVendor}:${model.idProduct}`)
  );

  static getScannerDetails(idVendor, idProduct) {
    return SupportedScanners.find(model => model.idVendor === idVendor && model.idProduct === idProduct);
  }

  static isSupportedScannerDescriptor(descriptor) {
    return ScannerDiscovery.#supportedScannerIdentifiers.has(
      ScannerDiscovery.#getDeviceIdentifier(descriptor)
    );
  }

  static getScannerDescriptors() {
    const scannerDescriptors = usb.getDeviceList()
      .filter(descriptor => ScannerDiscovery.isSupportedScannerDescriptor(descriptor))
      .map(descriptor => ScannerDiscovery.#createScannerDescriptor(descriptor))
      .filter(descriptor => descriptor !== null);

    ScannerDiscovery.#sortScannerDescriptors(scannerDescriptors);
    return ScannerDiscovery.#applyChannelMapping(scannerDescriptors);
  }

  static #createScannerDescriptor(descriptor) {
    const idVendor = ScannerDiscovery.#formatUsbId(descriptor.deviceDescriptor.idVendor);
    const idProduct = ScannerDiscovery.#formatUsbId(descriptor.deviceDescriptor.idProduct);
    const details = ScannerDiscovery.getScannerDetails(idVendor, idProduct);

    if (!details) return null;

    const portNumbers = [...(descriptor.portNumbers ?? [])];

    return {
      busNumber: descriptor.busNumber,
      channel: undefined,
      deviceAddress: descriptor.deviceAddress,
      hierarchy: [descriptor.busNumber, ...portNumbers].join("-"),
      identifier: `${idVendor}:${idProduct}`,
      idProduct,
      idVendor,
      portNumbers,
      product: details.product,
      systemName: details.driverPrefix +
        descriptor.busNumber.toString().padStart(3, "0") +
        ":" +
        descriptor.deviceAddress.toString().padStart(3, "0"),
      vendor: details.vendor
    };
  }

  static #applyChannelMapping(scannerDescriptors) {
    if (!config.devices.mapping) {
      scannerDescriptors.forEach((descriptor, index) => {
        descriptor.channel = index + 1;
      });
      return {
        scanners: scannerDescriptors,
        mapping: null,
        warnings: []
      };
    }

    const mapping = ScannerMappings[config.devices.mapping];
    if (!mapping) {
      return {
        scanners: [],
        mapping: config.devices.mapping,
        warnings: [`Scanner mapping '${config.devices.mapping}' does not exist.`]
      };
    }

    const mappedScanners = [];
    const warnings = [];

    Object.entries(mapping).forEach(([hierarchy, channel]) => {
      const found = scannerDescriptors.find(scanner => scanner.hierarchy === hierarchy);
      if (found) {
        mappedScanners.push({...found, channel});
      }
    });

    scannerDescriptors
      .filter(scanner => !mappedScanners.some(mapped => mapped.hierarchy === scanner.hierarchy))
      .forEach(scanner => {
        warnings.push(
          `${scanner.vendor} ${scanner.product} at hierarchy ${scanner.hierarchy} ` +
          `is not included in scanner mapping '${config.devices.mapping}'.`
        );
      });

    mappedScanners.sort((a, b) => a.channel - b.channel);
    return {
      scanners: mappedScanners,
      mapping: config.devices.mapping,
      warnings
    };
  }

  static #sortScannerDescriptors(scannerDescriptors) {
    scannerDescriptors.sort((a, b) => {
      const hierarchyA = ScannerDiscovery.#getSortableHierarchy(a);
      const hierarchyB = ScannerDiscovery.#getSortableHierarchy(b);

      for (let index = 0; index < hierarchyA.length; index += 1) {
        if (hierarchyA[index] !== hierarchyB[index]) {
          return hierarchyA[index] - hierarchyB[index];
        }
      }

      return 0;
    });
  }

  static #getSortableHierarchy(descriptor) {
    const ports = descriptor.portNumbers.slice(0, 5);
    while (ports.length < 5) ports.unshift(0);
    return [descriptor.busNumber, ...ports];
  }

  static #getDeviceIdentifier(descriptor) {
    return [
      ScannerDiscovery.#formatUsbId(descriptor.deviceDescriptor.idVendor),
      ScannerDiscovery.#formatUsbId(descriptor.deviceDescriptor.idProduct)
    ].join(":");
  }

  static #formatUsbId(value) {
    return value.toString(16).padStart(4, "0");
  }

}
