export class App {

  static STATE_STANDBY = 0;
  static STATE_REQUEST_SENT = 1;
  static STATE_HEADER_PARSED = 2;
  static STATE_DATA_PARSED = 3;

  static URL = "http://127.0.0.1:5678";
  static STORAGE_SCAN_WIDTH = "scanmeister.scanWidth";
  static STORAGE_SCAN_HEIGHT = "scanmeister.scanHeight";
  static STORAGE_PARAMETERS_POSITION = "scanmeister.parametersPosition";
  static DEFAULT_SCAN_WIDTH = "5000";
  static DEFAULT_SCAN_HEIGHT = "215";

  constructor() {
    this.canvas = document.getElementById('canvas');
    this.context = this.canvas.getContext('2d');
    this.ui = {};

    this.reset();
    this.setUpUi();
  }

  reset() {
    this.response = undefined;
    this.reader = undefined;
    this.imageData = new Uint8Array();
    this.state = App.STATE_STANDBY;
    this.header = '';
    this.buffer = new Uint8Array();
    this.position = 0;
    this.width = undefined;
    this.height = undefined;
  }

  get channel() {
    const ch = parseInt(this.ui.channelInput.value);
    if (isNaN(ch)) {
      return 1;
    } else {
      return ch;
    }
  }

  get resolution() {
    const resolution = parseInt(this.ui.resolution.value);
    if (isNaN(resolution)) {
      return undefined;
    } else {
      return resolution;
    }
  }

  get brightness() {
    const brightness = parseInt(this.ui.brightness.value);
    if (isNaN(brightness)) {
      return 0;
    } else {
      return brightness;
    }
  }

  get contrast() {
    const contrast = parseInt(this.ui.contrast.value);
    if (isNaN(contrast)) {
      return 0;
    } else {
      return contrast;
    }
  }

  get scanWidth() {
    const width = parseFloat(this.ui.width.value);
    if (isNaN(width)) {
      return undefined;
    } else {
      return this.roundInputValue(this.ui.width, width);
    }
  }

  get scanHeight() {
    const height = parseFloat(this.ui.height.value);
    if (isNaN(height)) {
      return undefined;
    } else {
      return this.roundInputValue(this.ui.height, height);
    }
  }

  setUpUi() {

    this.ui.controlsPanel = document.getElementById("controls-panel");
    this.ui.controlsPanelHeader = document.getElementById("controls-panel-header");
    this.ui.controlsPanelClose = document.getElementById("controls-panel-close");
    this.restorePanelPosition(this.ui.controlsPanel);
    this.setUpPanelDrag(this.ui.controlsPanel, this.ui.controlsPanelHeader);
    this.ui.controlsPanelClose.addEventListener("click", event => {
      event.stopPropagation();
      this.setParametersVisible(false);
    });
    document.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      this.toggleParametersPanel();
    });
    this.ui.commandPanel = document.getElementById("command-panel");
    this.ui.commandToggle = document.getElementById("command-toggle");
    this.ui.commandToggle.addEventListener("change", () => this.updateCommandPanelVisibility());

    this.ui.scanButton = document.getElementById("scan");
    this.ui.scanButton.addEventListener('click', () => this.getImage());

    this.ui.channelInput = document.getElementById('channel');

    this.ui.fullscreenButton = document.getElementById('fs-toggle')
    this.ui.fullscreenButton.addEventListener('change', () => this.setFullScreen(
      this.ui.fullscreenButton.checked
    ));
    document.addEventListener('fullscreenchange', () => {
      this.ui.fullscreenButton.checked = Boolean(document.fullscreenElement);
    });

    this.ui.resolution = document.getElementById("resolution");
    this.ui.brightness = document.getElementById("brightness");
    this.ui.contrast = document.getElementById("contrast");
    this.ui.width = document.getElementById("width");
    this.ui.height = document.getElementById("height");
    this.ui.command = document.getElementById("command");

    this.restoreScanWidth();
    this.restoreScanHeight();

    [
      this.ui.channelInput,
      this.ui.resolution,
    ].forEach(input => input.addEventListener("input", () => this.updateCommandPreview()));

    this.setUpDragInput(this.ui.brightness, () => this.updateCommandPreview());
    this.setUpDragInput(this.ui.contrast, () => this.updateCommandPreview());
    this.setUpDragInput(this.ui.width, () => {
      this.saveScanWidth();
      this.updateCommandPreview();
    }, {lockPointer: true, dragScale: 0.2});
    this.setUpDragInput(this.ui.height, () => {
      this.saveScanHeight();
      this.updateCommandPreview();
    }, {lockPointer: true, dragScale: 0.2});

    this.ui.width.addEventListener("input", () => {
      this.saveScanWidth();
      this.updateCommandPreview();
    });
    this.ui.height.addEventListener("input", () => {
      this.saveScanHeight();
      this.updateCommandPreview();
    });
    this.ui.width.addEventListener("change", () => {
      this.ui.width.value = this.roundInputValue(this.ui.width, this.scanWidth || 0);
      this.saveScanWidth();
      this.updateCommandPreview();
    });
    this.ui.height.addEventListener("change", () => {
      this.ui.height.value = this.roundInputValue(this.ui.height, this.scanHeight || 0);
      this.saveScanHeight();
      this.updateCommandPreview();
    });

    this.updateCommandPreview();
    this.updateCommandPanelVisibility();

  }

  updateCommandPanelVisibility() {
    this.ui.commandPanel.classList.toggle("hidden", !this.ui.commandToggle.checked);
  }

  toggleParametersPanel() {
    this.setParametersVisible(this.ui.controlsPanel.classList.contains("hidden"));
  }

  setParametersVisible(isVisible) {
    this.ui.controlsPanel.classList.toggle("hidden", !isVisible);
  }

  setUpPanelDrag(panel, handle) {
    handle.addEventListener("pointerdown", event => {
      if (event.target.closest("button")) return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;

      panel.style.right = "auto";
      panel.style.bottom = "auto";
      handle.setPointerCapture(event.pointerId);

      const onPointerMove = moveEvent => {
        const left = this.clamp(moveEvent.clientX - offsetX, 0, Math.max(0, window.innerWidth - rect.width));
        const top = this.clamp(moveEvent.clientY - offsetY, 0, Math.max(0, window.innerHeight - rect.height));
        panel.style.left = left + "px";
        panel.style.top = top + "px";
      };

      const onPointerUp = upEvent => {
        handle.releasePointerCapture(upEvent.pointerId);
        this.savePanelPosition(panel);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerUp);
      };

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerUp);
    });
  }

  restorePanelPosition(panel) {
    try {
      const position = JSON.parse(localStorage.getItem(App.STORAGE_PARAMETERS_POSITION));
      if (!position) return;

      requestAnimationFrame(() => {
        const rect = panel.getBoundingClientRect();
        const left = this.clamp(position.left, 0, Math.max(0, window.innerWidth - rect.width));
        const top = this.clamp(position.top, 0, Math.max(0, window.innerHeight - rect.height));
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel.style.left = left + "px";
        panel.style.top = top + "px";
      });
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  savePanelPosition(panel) {
    try {
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(App.STORAGE_PARAMETERS_POSITION, JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      }));
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  setUpDragInput(input, onChange, options = {}) {
    input.addEventListener("pointerdown", event => {
      event.preventDefault();
      const startX = event.clientX;
      const startValue = parseFloat(input.value) || 0;
      const dragScale = options.dragScale ?? 1;
      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      const step = this.inputStep(input);
      let currentValue = this.clampInputValue(input, startValue);
      let dragCarry = 0;
      input.classList.add("dragging");

      const applyDragMovement = movement => {
        const scaledMovement = movement * step * dragScale + dragCarry;
        const steps = scaledMovement >= 0
          ? Math.floor(scaledMovement / step)
          : Math.ceil(scaledMovement / step);

        dragCarry = scaledMovement - steps * step;
        if (steps === 0) return currentValue;

        const candidate = currentValue + steps * step;
        const nextValue = this.clampInputValue(input, candidate);
        if ((nextValue === min && steps < 0) || (nextValue === max && steps > 0)) {
          dragCarry = 0;
        }
        currentValue = nextValue;
        return currentValue;
      };

      if (options.lockPointer && input.requestPointerLock) {
        const onMouseMove = moveEvent => {
          const nextValue = applyDragMovement(moveEvent.movementX);
          if (parseFloat(input.value) === nextValue) return;
          input.value = nextValue;
          onChange();
        };

        const onMouseUp = () => {
          input.classList.remove("dragging");
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          document.removeEventListener("pointerlockchange", onPointerLockChange);
          if (document.pointerLockElement === input) document.exitPointerLock();
        };

        const onPointerLockChange = () => {
          if (document.pointerLockElement !== input) onMouseUp();
        };

        input.requestPointerLock();
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("pointerlockchange", onPointerLockChange);
        return;
      }

      input.setPointerCapture(event.pointerId);
      let lastX = startX;

      const onPointerMove = moveEvent => {
        const delta = moveEvent.clientX - lastX;
        lastX = moveEvent.clientX;
        const nextValue = applyDragMovement(delta);
        if (parseFloat(input.value) === nextValue) return;
        input.value = nextValue;
        onChange();
      };

      const onPointerUp = upEvent => {
        input.classList.remove("dragging");
        input.releasePointerCapture(upEvent.pointerId);
        input.removeEventListener("pointermove", onPointerMove);
        input.removeEventListener("pointerup", onPointerUp);
        input.removeEventListener("pointercancel", onPointerUp);
      };

      input.addEventListener("pointermove", onPointerMove);
      input.addEventListener("pointerup", onPointerUp);
      input.addEventListener("pointercancel", onPointerUp);
    });
  }

  inputStep(input) {
    return parseFloat(input.step) || 1;
  }

  clampInputValue(input, value) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const step = this.inputStep(input);
    const steppedValue = Math.round(value / step) * step;
    return parseFloat(this.clamp(steppedValue, min, max).toFixed(this.inputPrecision(input)));
  }

  roundInputValue(input, value) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    return parseFloat(this.clamp(value, min, max).toFixed(this.inputPrecision(input)));
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  inputPrecision(input) {
    const step = input.step || "1";
    const decimalIndex = step.indexOf(".");
    if (decimalIndex === -1) return 0;
    return Math.min(step.length - decimalIndex - 1, 1);
  }

  restoreScanWidth() {
    try {
      const width = localStorage.getItem(App.STORAGE_SCAN_WIDTH) ||
        this.ui.width.value ||
        App.DEFAULT_SCAN_WIDTH;
      this.ui.width.value = this.clampInputValue(this.ui.width, parseFloat(width));
      localStorage.setItem(App.STORAGE_SCAN_WIDTH, this.ui.width.value);
    } catch (err) {
      if (!this.ui.width.value) this.ui.width.value = App.DEFAULT_SCAN_WIDTH;
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveScanWidth() {
    try {
      localStorage.setItem(App.STORAGE_SCAN_WIDTH, this.scanWidth ?? App.DEFAULT_SCAN_WIDTH);
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreScanHeight() {
    try {
      const height = localStorage.getItem(App.STORAGE_SCAN_HEIGHT) ||
        this.ui.height.value ||
        App.DEFAULT_SCAN_HEIGHT;
      this.ui.height.value = this.clampInputValue(this.ui.height, parseFloat(height));
      localStorage.setItem(App.STORAGE_SCAN_HEIGHT, this.ui.height.value);
    } catch (err) {
      if (!this.ui.height.value) this.ui.height.value = App.DEFAULT_SCAN_HEIGHT;
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveScanHeight() {
    try {
      localStorage.setItem(App.STORAGE_SCAN_HEIGHT, this.scanHeight ?? App.DEFAULT_SCAN_HEIGHT);
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  getScanParams() {
    const params = new URLSearchParams({
      resolution: this.resolution,
      brightness: this.brightness,
      contrast: this.contrast
    });
    if (this.scanWidth !== undefined) params.set("width", this.scanWidth);
    if (this.scanHeight !== undefined) params.set("height", this.scanHeight);
    return params;
  }

  async updateCommandPreview() {
    try {
      const response = await fetch(
        App.URL + "/command/" + this.channel + "?" + this.getScanParams()
      );
      this.ui.command.innerText = await response.text();
    } catch (err) {
      this.ui.command.innerText = "unavailable";
    }
  }

  async getImage() {
    this.reset();
    this.state = App.STATE_REQUEST_SENT;
    this.ui.scanButton.disabled = true;
    this.ui.channelInput.disabled = true;
    this.response = await fetch(
      App.URL + "/scan/" + this.channel + "?" + this.getScanParams()
    );
    this.reader = this.response.body.getReader();
    this.#processChunk();
  }

  async #processChunk() {

    // Check if the reader is ready
    if (!this.reader) return;

    // Read from reader
    let {done, value} = await this.reader.read();

    // Parse header (if not done already)
    if (this.state == App.STATE_REQUEST_SENT) {

      // Add one character at a time and check if the header is complete.
      for (let i = 0; i < value.length; i++) {

        // Get a single character and add it to header. Remove all comment lines and count the
        // number of remaining lines. As soon as we have 4 lines (format, width + height, color
        // depth, empty string), the header is complete.
        this.header += String.fromCharCode(value[i]);
        const lines = this.header.split("\n").filter(line => !line.startsWith("#"));

        if (lines.length >= 4) {

          // Retrieve all tokens
          const tokens = lines.join(" ").split(/\s+/g);
          this.format = tokens[0];
          this.width = parseInt(tokens[1]);
          this.height = parseInt(tokens[2]);
          console.log(this.width, this.height);

          document.getElementById("size").innerText = `${this.width} × ${this.height}`;

          if (this.format !== 'P6') {
            console.error('Unsupported PNM format:', this.format);
            return;
          }

          // Change state
          this.state = App.STATE_HEADER_PARSED;

          // Resize canvas
          this.canvas.width = this.width;
          this.canvas.height = this.height;
          this.imageData = this.context.createImageData(this.canvas.width, this.canvas.height);

          // Keep unparsed binary data for later parsing
          value = value.slice(i + 1);

          // Make sure to break so no further data is added to the header
          break;

        }

      }

    }

    if (this.state == App.STATE_HEADER_PARSED && !done) {

      // Merge buffer content with new data
      const newArray = new Uint8Array(this.buffer.length + value.length);
      newArray.set(this.buffer);
      newArray.set(value, this.buffer.length);
      this.buffer = newArray;

      // Process buffer as image data
      for (let i = 0; i < this.buffer.length - 2; i += 3) {
        if (i + 2 >= this.buffer.length) break;  // Ensure we have a full pixel (3 bytes)
        this.imageData.data[this.position]     = this.buffer[i];    // R
        this.imageData.data[this.position + 1] = this.buffer[i+1];  // G
        this.imageData.data[this.position + 2] = this.buffer[i+2];  // B
        this.imageData.data[this.position + 3] = 255;               // Alpha channel
        this.position += 4;
      }

      //
      this.context.putImageData(this.imageData, 0, 0);

      this.buffer = this.buffer.slice(Math.floor(this.buffer.length / 3) * 3);

    }

    if (done) {
      this.position = 0;
      this.state = App.STATE_DATA_PARSED;
      this.ui.scanButton.disabled = false;
      this.ui.channelInput.disabled = false;
      const date = this.getFormattedDate(new Date());
      const ch = this.channel.toString().padStart(2, "0");
      this.saveCanvasToFile(`CH-${ch} ${date}.png`);
    } else {
      setTimeout(this.#processChunk.bind(this), 2);
    }

  }

  getFormattedDate(date) {
    const pad = (number, length = 2) => number.toString().padStart(length, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1); // getMonth() returns month from 0-11
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());
    const millisecond = pad(date.getMilliseconds(), 3);

    return `${year}-${month}-${day} ${hour}-${minute}-${second}.${millisecond}`;
  }

  async saveCanvasToFile(filename) {

    // Create temporary download link
    const link = document.createElement('a');

    link.setAttribute('download', filename);

    await new Promise(resolve => {

      this.canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.click();
        resolve();
      });

    });

    // Remove temporary link
    link.remove();

  }

  setFullScreen(enabled) {

    if (enabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        this.ui.fullscreenButton.checked = false;
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else if (!enabled && document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    }

  }

}
