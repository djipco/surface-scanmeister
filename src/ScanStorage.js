import path from 'node:path';
import {mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';

import {Configuration as config} from "../config/Configuration.js";

export class ScanStorage {

  static MAX_REQUEST_BODY_LENGTH = 1024 * 1024 * 1024;

  constructor(directory = config.paths.scans) {
    this.directory = directory;
  }

  async list() {
    let entries;
    try {
      entries = await readdir(this.directory, {withFileTypes: true});
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }

    const scans = await Promise.all(entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
      .map(async entry => {
        const filename = ScanStorage.sanitizeFilename(entry.name);
        const info = await stat(path.join(this.directory, filename));
        return {
          filename,
          size: info.size,
          modifiedAt: info.mtime.toISOString()
        };
      }));

    return scans.sort((a, b) => new Date(a.modifiedAt) - new Date(b.modifiedAt));
  }

  async read(filename) {
    const safeFilename = ScanStorage.sanitizeFilename(filename);
    if (!safeFilename.toLowerCase().endsWith('.png')) throw new Error('Only PNG scans are allowed.');
    return readFile(path.join(this.directory, safeFilename));
  }

  async save(filename, body) {
    await mkdir(this.directory, {recursive: true});
    const safeFilename = ScanStorage.sanitizeFilename(filename);
    const pngFilename = safeFilename.endsWith('.png') ? safeFilename : safeFilename + '.png';
    const filePath = path.join(this.directory, pngFilename);

    await writeFile(filePath, body);
    return {filename: pngFilename, path: filePath};
  }

  async readRequestBody(request) {
    const chunks = [];
    let byteLength = 0;

    for await (const chunk of request) {
      byteLength += chunk.length;
      if (byteLength > ScanStorage.MAX_REQUEST_BODY_LENGTH) {
        throw new Error('Request body is too large.');
      }
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  static sanitizeFilename(filename) {
    const reservedCharacters = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
    return path.basename(filename)
      .split('')
      .map(character => {
        if (reservedCharacters.has(character)) return '_';
        return character.charCodeAt(0) < 32 ? '_' : character;
      })
      .join('');
  }

}
