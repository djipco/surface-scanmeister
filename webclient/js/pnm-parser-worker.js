let currentScanId = undefined;
let leftover = new Uint8Array();

self.addEventListener("message", event => {
  try {
    const message = event.data;

    if (message.type === "reset") {
      currentScanId = message.scanId;
      leftover = new Uint8Array();
      return;
    }

    if (message.scanId !== currentScanId) return;

    if (message.type === "chunk") {
      const chunk = new Uint8Array(message.buffer);
      const input = new Uint8Array(leftover.length + chunk.length);
      input.set(leftover);
      input.set(chunk, leftover.length);

      const byteCount = Math.floor(input.length / 3) * 3;
      const pixelCount = byteCount / 3;
      if (pixelCount > 0) {
        const rgba = new Uint8ClampedArray(pixelCount * 4);
        for (let source = 0, target = 0; source < byteCount; source += 3, target += 4) {
          rgba[target] = input[source];
          rgba[target + 1] = input[source + 1];
          rgba[target + 2] = input[source + 2];
          rgba[target + 3] = 255;
        }

        self.postMessage(
          {type: "pixels", scanId: currentScanId, buffer: rgba.buffer},
          [rgba.buffer]
        );
      }

      leftover = input.slice(byteCount);
      return;
    }

    if (message.type === "complete") {
      leftover = new Uint8Array();
      self.postMessage({type: "complete", scanId: currentScanId});
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      scanId: currentScanId,
      message: err instanceof Error ? err.message : String(err)
    });
  }
});
