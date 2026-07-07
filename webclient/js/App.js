export class App {

  static STATE_STANDBY = 0;
  static STATE_REQUEST_SENT = 1;
  static STATE_HEADER_PARSED = 2;
  static STATE_DATA_PARSED = 3;

  static URL = "http://127.0.0.1:5678";
  static STORAGE_CHANNEL = "scanmeister.channel";
  static STORAGE_RESOLUTION = "scanmeister.resolution";
  static STORAGE_BRIGHTNESS = "scanmeister.brightness";
  static STORAGE_CONTRAST = "scanmeister.contrast";
  static STORAGE_SCAN_WIDTH = "scanmeister.scanWidth";
  static STORAGE_SCAN_HEIGHT = "scanmeister.scanHeight";
  static STORAGE_CLEAR_CANVAS = "scanmeister.clearCanvas";
  static STORAGE_DRAW_MODE = "scanmeister.drawMode";
  static STORAGE_FORCE_CALIBRATION = "scanmeister.forceCalibration";
  static STORAGE_UI_OVERLAY_VISIBLE = "scanmeister.uiOverlayVisible";
  static STORAGE_PARAMETERS_POSITION = "scanmeister.parametersPosition";
  static DEFAULT_SCAN_WIDTH = "5000";
  static DEFAULT_SCAN_HEIGHT = "215";

  constructor() {
    this.canvas = document.getElementById('canvas');
    this.context = this.canvas.getContext('2d');
    this.ui = {};
    this.channelOutOfBounds = false;
    this.displayPixelWidth = this.canvas.width;
    this.displayPixelHeight = this.canvas.height;

    this.reset();
    this.setUpUi();
    window.addEventListener("resize", () => this.updateCanvasDisplaySize());
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

  get isChannelValid() {
    const ch = parseInt(this.ui.channelInput.value);
    return ch >= 1 && ch <= 16;
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

  get forceCalibration() {
    return Boolean(this.ui.forceCalibration.checked);
  }

  get clearCanvasBeforeScan() {
    return this.ui.drawMode.value === "clear";
  }

  setUpUi() {

    this.ui.controlsPanel = document.getElementById("controls-panel");
    this.ui.controlsPanelHeader = document.getElementById("controls-panel-header");
    this.ui.controlsPanelClose = document.getElementById("controls-panel-close");
    this.restorePanelPosition(this.ui.controlsPanel);
    this.setUpPanelDrag(this.ui.controlsPanel, this.ui.controlsPanelHeader);
    this.ui.controlsPanelClose.addEventListener("click", event => {
      event.stopPropagation();
      this.setUiOverlayVisible(false);
    });
    document.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      this.toggleUiOverlay();
    });
    this.ui.commandPanel = document.getElementById("command-panel");

    this.ui.scanButton = document.getElementById("scan");
    this.ui.scanButton.addEventListener('click', () => this.getImage());

    this.ui.channelInput = document.getElementById('channel');

    this.ui.resolution = document.getElementById("resolution");
    this.ui.brightness = document.getElementById("brightness");
    this.ui.contrast = document.getElementById("contrast");
    this.ui.width = document.getElementById("width");
    this.ui.height = document.getElementById("height");
    this.ui.drawMode = document.getElementById("draw-mode");
    this.ui.forceCalibration = document.getElementById("force-calibration");
    this.ui.fullscreenButton = document.getElementById("fullscreen");
    this.ui.command = document.getElementById("command");
    this.ui.size = document.getElementById("size");

    this.restoreSelectValue(this.ui.channelInput, App.STORAGE_CHANNEL);
    this.restoreSelectValue(this.ui.resolution, App.STORAGE_RESOLUTION);
    this.restoreNumericValue(this.ui.brightness, App.STORAGE_BRIGHTNESS);
    this.restoreNumericValue(this.ui.contrast, App.STORAGE_CONTRAST);
    this.restoreScanWidth();
    this.restoreScanHeight();
    this.restoreDrawMode();
    this.restoreCheckboxValue(this.ui.forceCalibration, App.STORAGE_FORCE_CALIBRATION);
    this.restoreUiOverlayVisibility();

    this.ui.channelInput.addEventListener("change", () => {
      this.saveControlValue(this.ui.channelInput, App.STORAGE_CHANNEL);
      this.updateExpectedImageSize();
      this.updateCommandPreview();
      this.updateScanButtonState();
    });
    this.ui.resolution.addEventListener("change", () => {
      this.saveControlValue(this.ui.resolution, App.STORAGE_RESOLUTION);
      this.updateExpectedImageSize();
      this.updateCommandPreview();
    });
    this.ui.forceCalibration.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.forceCalibration, App.STORAGE_FORCE_CALIBRATION);
      this.updateCommandPreview();
    });
    this.ui.drawMode.addEventListener("change", () => {
      this.saveControlValue(this.ui.drawMode, App.STORAGE_DRAW_MODE);
    });
    this.ui.fullscreenButton.addEventListener("click", () => {
      this.setFullScreen(!document.fullscreenElement);
    });
    document.addEventListener("fullscreenchange", () => {
      this.updateFullscreenButtonLabel();
      this.updateCanvasDisplaySize();
    });
    this.updateFullscreenButtonLabel();

    this.setUpDragInput(this.ui.brightness, () => {
      this.saveNumericValue(this.ui.brightness, App.STORAGE_BRIGHTNESS);
      this.updateCommandPreview();
    }, {pixelsPerStep: 20});
    this.setUpDragInput(this.ui.contrast, () => {
      this.saveNumericValue(this.ui.contrast, App.STORAGE_CONTRAST);
      this.updateCommandPreview();
    }, {pixelsPerStep: 20});
    this.setUpDragInput(this.ui.width, () => {
      this.saveScanWidth();
      this.updateExpectedImageSize();
      this.updateCommandPreview();
    }, {lockPointer: true, pixelsPerStep: 20});
    this.setUpDragInput(this.ui.height, () => {
      this.saveScanHeight();
      this.updateExpectedImageSize();
      this.updateCommandPreview();
    }, {lockPointer: true, pixelsPerStep: 20});

    this.ui.width.addEventListener("input", () => {
      this.saveScanWidth();
      this.updateExpectedImageSize();
      this.updateCommandPreview();
    });
    this.ui.height.addEventListener("input", () => {
      this.saveScanHeight();
      this.updateExpectedImageSize();
      this.updateCommandPreview();
    });
    this.ui.brightness.addEventListener("input", () => {
      this.saveNumericValue(this.ui.brightness, App.STORAGE_BRIGHTNESS);
      this.updateCommandPreview();
    });
    this.ui.contrast.addEventListener("input", () => {
      this.saveNumericValue(this.ui.contrast, App.STORAGE_CONTRAST);
      this.updateCommandPreview();
    });
    this.ui.width.addEventListener("change", () => {
      this.ui.width.value = this.roundInputValue(this.ui.width, this.scanWidth || 0);
      this.saveScanWidth();
      this.updateExpectedImageSize();
      this.updateCommandPreview();
    });
    this.ui.height.addEventListener("change", () => {
      this.ui.height.value = this.roundInputValue(this.ui.height, this.scanHeight || 0);
      this.saveScanHeight();
      this.updateExpectedImageSize();
      this.updateCommandPreview();
    });
    this.ui.brightness.addEventListener("change", () => {
      this.ui.brightness.value = this.clampInputValue(this.ui.brightness, this.brightness);
      this.saveNumericValue(this.ui.brightness, App.STORAGE_BRIGHTNESS, {normalize: true});
      this.updateCommandPreview();
    });
    this.ui.contrast.addEventListener("change", () => {
      this.ui.contrast.value = this.clampInputValue(this.ui.contrast, this.contrast);
      this.saveNumericValue(this.ui.contrast, App.STORAGE_CONTRAST, {normalize: true});
      this.updateCommandPreview();
    });

    this.updateExpectedImageSize();
    this.updateCommandPreview();
    this.updateScanButtonState();

  }

  toggleUiOverlay() {
    this.setUiOverlayVisible(this.ui.controlsPanel.classList.contains("hidden"));
  }

  setUiOverlayVisible(isVisible) {
    this.ui.controlsPanel.classList.toggle("hidden", !isVisible);
    this.ui.commandPanel.classList.toggle("hidden", !isVisible);
    try {
      localStorage.setItem(App.STORAGE_UI_OVERLAY_VISIBLE, isVisible ? "true" : "false");
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  updateScanButtonState() {
    this.ui.scanButton.disabled =
      !this.isChannelValid ||
      this.channelOutOfBounds ||
      this.state === App.STATE_REQUEST_SENT;
  }

  updateExpectedImageSize() {
    const resolution = this.resolution;
    const width = this.scanWidth;
    const height = this.scanHeight;
    if (!resolution || width === undefined || height === undefined) {
      this.ui.size.innerText = "unknown";
      return;
    }

    const pixelWidth = Math.round(height / 25.4 * resolution);
    const pixelHeight = Math.round(width / 25.4 * resolution);
    this.setImageSizeOverlay(pixelWidth, pixelHeight);
  }

  setImageSizeOverlay(pixelWidth, pixelHeight) {
    const nextWidth = Math.max(1, Math.round(pixelWidth));
    const nextHeight = Math.max(1, Math.round(pixelHeight));

    this.displayPixelWidth = nextWidth;
    this.displayPixelHeight = nextHeight;
    if (this.canvas.width !== nextWidth) this.canvas.width = nextWidth;
    if (this.canvas.height !== nextHeight) this.canvas.height = nextHeight;
    this.ui.size.innerText = `${nextWidth} × ${nextHeight} px`;
    this.updateCanvasDisplaySize();
  }

  updateCanvasDisplaySize() {
    if (!this.displayPixelWidth || !this.displayPixelHeight) return;

    const margin = document.fullscreenElement ? 0 : 32;
    const availableWidth = Math.max(1, window.innerWidth - margin);
    const availableHeight = Math.max(1, window.innerHeight - margin);
    const canvasRatio = this.displayPixelWidth / this.displayPixelHeight;
    const isCanvasLandscape = canvasRatio >= 1;
    const isViewportLandscape = availableWidth >= availableHeight;
    const shouldRotate = isCanvasLandscape !== isViewportLandscape;

    const cssHeight = shouldRotate
      ? Math.min(availableWidth, availableHeight / canvasRatio)
      : Math.min(availableHeight, availableWidth / canvasRatio);
    const cssWidth = cssHeight * canvasRatio;
    const displayWidth = shouldRotate ? cssHeight : cssWidth;
    const displayHeight = shouldRotate ? cssWidth : cssHeight;
    const overlayInset = 12;
    const displayLeft = (window.innerWidth - displayWidth) / 2 + overlayInset;
    const displayTop = (window.innerHeight - displayHeight) / 2 + overlayInset;

    this.canvas.style.height = Math.max(1, cssHeight) + "px";
    this.canvas.style.transform = shouldRotate
      ? "translate(-50%, -50%) rotate(270deg)"
      : "translate(-50%, -50%) rotate(180deg)";
    this.ui.size.style.left = displayLeft + "px";
    this.ui.size.style.top = displayTop + "px";
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
    input.addEventListener("dblclick", event => {
      event.preventDefault();
      input.focus();
      input.select();
    });

    input.addEventListener("pointerdown", event => {
      if (event.detail > 1) return;
      const step = this.inputStep(input);
      const pixelsPerStep = Math.max(1, options.pixelsPerStep ?? 20);
      let currentValue = this.clampInputValue(input, parseFloat(input.value) || 0);
      let anchorValue = currentValue;
      let dragOffset = 0;
      let isDragging = false;
      let pointerLocked = false;
      let isStopped = false;
      const startX = event.clientX;
      let lastX = startX;

      input.setPointerCapture(event.pointerId);

      const applyMovement = pixels => {
        dragOffset += pixels;
        const steps = dragOffset >= 0
          ? Math.floor(dragOffset / pixelsPerStep)
          : Math.ceil(dragOffset / pixelsPerStep);
        if (steps === 0) return;

        const nextValue = this.clampInputValue(input, anchorValue + steps * step);
        if (nextValue !== currentValue) {
          currentValue = nextValue;
          input.value = currentValue;
          onChange();
        }

        anchorValue = currentValue;
        dragOffset = 0;
      };

      const onLockedMouseMove = moveEvent => {
        applyMovement(moveEvent.movementX);
      };

      const onDocumentMouseUp = event => {
        if (event.button === 0) {
          stopDragging();
        }
      };

      const onPointerLockChange = () => {
        pointerLocked = document.pointerLockElement === input;
        if (!pointerLocked && isDragging) {
          stopDragging();
        }
      };

      const onPointerLockError = () => {
        pointerLocked = false;
        stopDragging();
      };

      const onPointerMove = moveEvent => {
        if (!isDragging) {
          if (Math.abs(moveEvent.clientX - startX) < 4) return;
          startDragging();
        }

        if (pointerLocked) return;

        const movement = moveEvent.clientX - lastX;
        lastX = moveEvent.clientX;
        applyMovement(movement);
      };

      const startDragging = () => {
        if (isDragging) return;
        isDragging = true;
        input.classList.add("dragging");
        input.blur();
        lastX = startX;

        if (options.lockPointer && input.requestPointerLock) {
          input.requestPointerLock();
          document.addEventListener("mousemove", onLockedMouseMove);
          document.addEventListener("mouseup", onDocumentMouseUp);
          document.addEventListener("pointerlockchange", onPointerLockChange);
          document.addEventListener("pointerlockerror", onPointerLockError);
        }
      };

      const stopDragging = () => {
        if (isStopped) return;
        isStopped = true;
        input.classList.remove("dragging");
        if (input.hasPointerCapture(event.pointerId)) {
          input.releasePointerCapture(event.pointerId);
        }
        input.removeEventListener("pointermove", onPointerMove);
        input.removeEventListener("pointerup", onPointerUp);
        input.removeEventListener("pointercancel", onPointerUp);
        document.removeEventListener("mousemove", onLockedMouseMove);
        document.removeEventListener("mouseup", onDocumentMouseUp);
        document.removeEventListener("pointerlockchange", onPointerLockChange);
        document.removeEventListener("pointerlockerror", onPointerLockError);
        if (document.pointerLockElement === input) document.exitPointerLock();
      };

      const onPointerUp = () => {
        stopDragging();
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

  restoreSelectValue(select, storageKey) {
    try {
      const value = localStorage.getItem(storageKey);
      if (!value) return;

      const hasOption = Array.from(select.options).some(option => option.value === value);
      if (hasOption) select.value = value;
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreNumericValue(input, storageKey) {
    try {
      const value = localStorage.getItem(storageKey);
      if (value === null) return;

      const parsedValue = parseFloat(value);
      if (isNaN(parsedValue)) return;

      input.value = this.clampInputValue(input, parsedValue);
      localStorage.setItem(storageKey, input.value);
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveControlValue(input, storageKey) {
    try {
      localStorage.setItem(storageKey, input.value);
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveNumericValue(input, storageKey, options = {}) {
    try {
      const value = parseFloat(input.value);
      if (isNaN(value)) return;

      const storedValue = options.normalize
        ? this.clampInputValue(input, value)
        : this.roundInputValue(input, value);
      if (options.normalize) input.value = storedValue;
      localStorage.setItem(storageKey, storedValue);
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreCheckboxValue(input, storageKey, defaultValue = false) {
    try {
      const value = localStorage.getItem(storageKey);
      input.checked = value === null ? defaultValue : value === "true";
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreDrawMode() {
    try {
      const value = localStorage.getItem(App.STORAGE_DRAW_MODE);
      if (value === "clear" || value === "overlay") {
        this.ui.drawMode.value = value;
        return;
      }

      const oldValue = localStorage.getItem(App.STORAGE_CLEAR_CANVAS);
      this.ui.drawMode.value = oldValue === "false" ? "overlay" : "clear";
      localStorage.setItem(App.STORAGE_DRAW_MODE, this.ui.drawMode.value);
    } catch (err) {
      this.ui.drawMode.value = "clear";
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveCheckboxValue(input, storageKey) {
    try {
      localStorage.setItem(storageKey, input.checked ? "true" : "false");
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreUiOverlayVisibility() {
    try {
      const storedValue = localStorage.getItem(App.STORAGE_UI_OVERLAY_VISIBLE);
      if (storedValue !== null) this.setUiOverlayVisible(storedValue === "true");
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
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
    if (this.forceCalibration) params.set("forceCalibration", "true");
    return params;
  }

  async updateCommandPreview() {
    if (!this.isChannelValid) {
      this.channelOutOfBounds = true;
      this.setCommandPreviewText("Channel out of bounds", true);
      this.updateScanButtonState();
      return;
    }

    this.channelOutOfBounds = false;
    this.setCommandPreviewText("", false);
    try {
      const response = await fetch(
        App.URL + "/command/" + this.channel + "?" + this.getScanParams()
      );
      const commandPreview = await response.text();
      const isChannelOutOfBounds = commandPreview.toLowerCase().includes("channel out of bounds");
      this.channelOutOfBounds = isChannelOutOfBounds;
      this.setCommandPreviewText(
        isChannelOutOfBounds ? "Channel out of bounds" : commandPreview,
        isChannelOutOfBounds
      );
    } catch (err) {
      this.channelOutOfBounds = false;
      this.setCommandPreviewText("unavailable", true);
    } finally {
      this.updateScanButtonState();
    }
  }

  setCommandPreviewText(text, isError) {
    this.ui.command.innerText = text;
    this.ui.command.classList.toggle("error", isError);
    this.ui.command.style.color = isError ? "#ff6b6b" : "";
  }

  async getImage() {
    if (!this.isChannelValid || this.channelOutOfBounds) {
      this.updateCommandPreview();
      this.updateScanButtonState();
      return;
    }

    this.reset();
    this.state = App.STATE_REQUEST_SENT;
    this.updateScanButtonState();
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

          this.setImageSizeOverlay(this.width, this.height);

          if (this.format !== 'P6') {
            console.error('Unsupported PNM format:', this.format);
            return;
          }

          // Change state
          this.state = App.STATE_HEADER_PARSED;

          if (this.clearCanvasBeforeScan) {
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.imageData = this.context.createImageData(this.canvas.width, this.canvas.height);
          } else {
            this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
          }

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
      this.ui.channelInput.disabled = false;
      this.updateScanButtonState();
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
        this.updateFullscreenButtonLabel();
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else if (!enabled && document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    }

  }

  updateFullscreenButtonLabel() {
    this.ui.fullscreenButton.innerText = document.fullscreenElement
      ? "Exit Fullscreen"
      : "Enter Fullscreen";
  }

}
