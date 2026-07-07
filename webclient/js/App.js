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
  static STORAGE_RENDER_MODE = "scanmeister.renderMode";
  static STORAGE_RENDER_SPEED = "scanmeister.renderSpeed";
  static STORAGE_FORCE_CALIBRATION = "scanmeister.forceCalibration";
  static STORAGE_DEBUG_VISIBLE = "scanmeister.debugVisible";
  static STORAGE_SMOOTH_GRAPHS = "scanmeister.smoothGraphs";
  static STORAGE_THROTTLE_GRAPHS = "scanmeister.throttleGraphs";
  static STORAGE_UI_OVERLAY_VISIBLE = "scanmeister.uiOverlayVisible";
  static STORAGE_PARAMETERS_POSITION = "scanmeister.parametersPosition";
  static STORAGE_STATS_POSITION = "scanmeister.statsPosition";
  static DEFAULT_SCAN_WIDTH = "5000";
  static DEFAULT_SCAN_HEIGHT = "215";
  static DEFAULT_RENDER_SPEED = "100";
  static BUFFER_GRAPH_DURATION = 10000;
  static STATS_GRAPH_THROTTLE_MS = 50;
  static PARSE_FRAME_BUDGET_MS = 2;

  constructor() {
    this.canvas = document.getElementById('canvas');
    this.context = this.canvas.getContext('2d');
    this.ui = {};
    this.channelOutOfBounds = false;
    this.displayPixelWidth = this.canvas.width;
    this.displayPixelHeight = this.canvas.height;
    this.paintRequest = undefined;
    this.renderStatsVisible = false;
    this.renderStats = {};
    this.arrivalHistory = [];
    this.bufferHistory = [];
    this.speedHistory = [];
    this.displayFpsHistory = [];
    this.displayFrameRequest = undefined;
    this.previousDisplayFrameTime = undefined;
    this.lastStatsGraphDrawTime = 0;
    this.parseRequest = undefined;
    this.panelResizeObservers = [];

    this.reset();
    this.setUpUi();
    window.addEventListener("resize", () => this.updateCanvasDisplaySize());
  }

  reset() {
    this.flushCanvasPaint();
    if (this.parseRequest !== undefined) {
      cancelAnimationFrame(this.parseRequest);
      this.parseRequest = undefined;
    }
    this.response = undefined;
    this.reader = undefined;
    this.imageData = new Uint8Array();
    this.state = App.STATE_STANDBY;
    this.header = '';
    this.position = 0;
    this.paintedRows = 0;
    this.paintCursor = 0;
    this.previousPaintedRows = 0;
    this.lastPaintTime = undefined;
    this.lastFrameTime = undefined;
    this.lastAvailableRows = 0;
    this.lastAvailableRowsTime = undefined;
    this.streamComplete = false;
    this.scanFinalized = false;
    this.renderStats = {};
    this.arrivalHistory = [];
    this.bufferHistory = [];
    this.speedHistory = [];
    this.displayFpsHistory = [];
    this.previousDisplayFrameTime = undefined;
    this.lastStatsGraphDrawTime = 0;
    this.inputGraphFrozenAt = undefined;
    this.statsGraphFrozenAt = undefined;
    this.width = undefined;
    this.height = undefined;
    this.rgbRemainder = new Uint8Array();
    this.parseQueue = [];
  }

  scheduleScanParsing() {
    if (this.parseRequest !== undefined) return;

    this.parseRequest = requestAnimationFrame(() => {
      this.parseRequest = undefined;
      this.parseQueuedScanData();
      if (this.parseQueue.length > 0) this.scheduleScanParsing();
    });
  }

  scheduleCanvasPaint() {
    if (this.paintRequest !== undefined) return;

    this.paintRequest = requestAnimationFrame(() => {
      this.paintRequest = undefined;
      this.paintCanvasRows();
      if (this.shouldContinueCanvasPaint()) this.scheduleCanvasPaint();
    });
  }

  flushCanvasPaint() {
    if (this.paintRequest !== undefined) {
      cancelAnimationFrame(this.paintRequest);
      this.paintRequest = undefined;
    }
    this.paintCanvasRows({includePartialRow: true});
    this.resetSpeedRenderTiming();
  }

  shouldContinueCanvasPaint() {
    if (this.state !== App.STATE_HEADER_PARSED) return false;
    return this.paintedRows < this.getAvailablePaintRows({includePartialRow: this.streamComplete});
  }

  paintCanvasRows(options = {}) {
    if (!this.imageData || !this.imageData.data) return;
    if (!this.canvas.width || !this.canvas.height) return;

    const availableRows = this.getAvailablePaintRows(options);
    const nextPaintedRows = this.renderMode === "speed" && !options.includePartialRow
      ? this.getSpeedPaintRows(availableRows)
      : availableRows;
    this.updateRenderStats({availableRows});
    if (nextPaintedRows <= this.paintedRows) return;

    const rowCount = nextPaintedRows - this.paintedRows;
    this.context.putImageData(
      this.imageData,
      0,
      0,
      0,
      this.paintedRows,
      this.canvas.width,
      rowCount
    );
    const paintEnded = performance.now();
    const now = paintEnded;
    const previousPaintedRows = this.previousPaintedRows;
    const previousFrameTime = this.lastFrameTime;
    this.paintedRows = nextPaintedRows;
    this.previousPaintedRows = this.paintedRows;
    this.lastFrameTime = now;
    this.updateRenderStats({
      availableRows,
      frameMs: previousFrameTime === undefined ? 0 : now - previousFrameTime,
      paintedRowsPerSecond: previousFrameTime === undefined
        ? 0
        : (this.paintedRows - previousPaintedRows) / ((now - previousFrameTime) / 1000)
    });

    if (this.streamComplete && this.paintedRows >= this.getAvailablePaintRows({includePartialRow: true})) {
      this.finalizeScan();
    }
  }

  getAvailablePaintRows(options = {}) {
    const pixelPosition = Math.floor(this.position / 4);
    const completedRows = options.includePartialRow
      ? Math.ceil(pixelPosition / this.canvas.width)
      : Math.floor(pixelPosition / this.canvas.width);
    return this.clamp(completedRows, 0, this.canvas.height);
  }

  getSpeedPaintRows(availableRows) {
    const now = performance.now();
    if (this.lastPaintTime === undefined) {
      this.lastPaintTime = now;
      this.paintCursor = this.paintedRows;
      return this.paintedRows;
    }

    const elapsed = Math.max(0, now - this.lastPaintTime);
    this.lastPaintTime = now;
    this.paintCursor = Math.min(
      availableRows,
      this.paintCursor + this.renderSpeed * elapsed / 1000
    );
    return this.clamp(Math.floor(this.paintCursor), this.paintedRows, availableRows);
  }

  updateArrivalStats(availableRows, now = performance.now()) {
    if (this.lastAvailableRowsTime === undefined) {
      this.lastAvailableRows = availableRows;
      this.lastAvailableRowsTime = now;
      return;
    }

    const rowsDelta = availableRows - this.lastAvailableRows;
    const timeDelta = now - this.lastAvailableRowsTime;
    if (rowsDelta > 0 && timeDelta > 0) {
      this.updateRenderStats({
        availableRows,
        arrivalRowsPerSecond: rowsDelta / (timeDelta / 1000)
      });
    }
    this.lastAvailableRows = availableRows;
    this.lastAvailableRowsTime = now;
  }

  resetSpeedRenderTiming() {
    this.paintCursor = this.paintedRows;
    this.lastPaintTime = undefined;
  }

  updateRenderStats(nextStats = {}) {
    this.renderStats = {
      ...this.renderStats,
      ...nextStats
    };
    if (!this.isStatsDisplayed()) return;

    const availableRows = this.renderStats.availableRows ?? this.getAvailablePaintRows();
    const bufferedRows = Math.max(0, availableRows - this.paintedRows);
    const arrivalRowsPerSecond = this.renderStats.arrivalRowsPerSecond ?? 0;
    const paintedRowsPerSecond = this.renderStats.paintedRowsPerSecond ?? 0;
    const graphTime = performance.now();
    const hasFullInput = this.canvas.height > 0 && availableRows >= this.canvas.height;
    const hasFinishedDrawing = hasFullInput && this.paintedRows >= availableRows;

    if (this.inputGraphFrozenAt === undefined) {
      this.updateArrivalHistory(arrivalRowsPerSecond, graphTime);
      if (hasFullInput) this.inputGraphFrozenAt = graphTime;
    }

    if (this.statsGraphFrozenAt === undefined) {
      this.updateBufferHistory(bufferedRows, graphTime);
      this.updateSpeedHistory(paintedRowsPerSecond, graphTime);
      if (hasFinishedDrawing) this.statsGraphFrozenAt = graphTime;
    }

    this.drawStatsGraphs();
  }

  updateArrivalHistory(rowsPerSecond, now = performance.now()) {
    this.updateHistory(this.arrivalHistory, rowsPerSecond, now);
  }

  updateBufferHistory(bufferedRows, now = performance.now()) {
    this.updateHistory(this.bufferHistory, bufferedRows, now);
  }

  updateSpeedHistory(rowsPerSecond, now = performance.now()) {
    this.updateHistory(this.speedHistory, rowsPerSecond, now);
  }

  updateDisplayFpsHistory(framesPerSecond, now = performance.now()) {
    this.updateHistory(this.displayFpsHistory, framesPerSecond, now);
  }

  updateHistory(history, value, now = performance.now()) {
    const startTime = now - App.BUFFER_GRAPH_DURATION;
    history.push({time: now, value});
    const firstCurrentPoint = history.findIndex(point => point.time >= startTime);
    if (firstCurrentPoint > 0) history.splice(0, firstCurrentPoint);
  }

  drawArrivalGraph() {
    this.drawHistoryGraph(this.ui.arriveGraph, this.ui.arriveGraphContext, this.arrivalHistory, this.statsGraphFrozenAt);
  }

  drawSpeedGraph() {
    this.drawHistoryGraph(this.ui.speedGraph, this.ui.speedGraphContext, this.speedHistory, this.statsGraphFrozenAt, {maxValue: 200});
  }

  drawDisplayFpsGraph() {
    this.drawHistoryGraph(this.ui.displayFpsGraph, this.ui.displayFpsGraphContext, this.displayFpsHistory, undefined, {maxValue: 120});
  }

  drawBufferGraph() {
    this.drawHistoryGraph(this.ui.bufferGraph, this.ui.bufferGraphContext, this.bufferHistory, this.statsGraphFrozenAt);
  }

  redrawStatsGraphs() {
    this.drawStatsGraphs({force: true});
  }

  drawStatsGraphs(options = {}) {
    if (!this.isStatsDisplayed()) return;

    const now = performance.now();
    if (!options.force && this.throttleGraphs && now - this.lastStatsGraphDrawTime < App.STATS_GRAPH_THROTTLE_MS) {
      return;
    }

    this.lastStatsGraphDrawTime = now;
    this.ui.renderStatsText.innerText = "";
    this.drawArrivalGraph();
    this.drawSpeedGraph();
    this.drawDisplayFpsGraph();
    this.drawBufferGraph();
    this.updateStatsAverageDisplays();
  }

  scheduleDisplayFrameMonitor() {
    if (this.displayFrameRequest !== undefined) return;

    this.displayFrameRequest = requestAnimationFrame(now => {
      this.displayFrameRequest = undefined;
      this.updateDisplayFrameStats(now);
      this.scheduleDisplayFrameMonitor();
    });
  }

  updateDisplayFrameStats(now) {
    if (!this.isStatsDisplayed()) {
      this.previousDisplayFrameTime = undefined;
      return;
    }

    if (this.previousDisplayFrameTime !== undefined) {
      const elapsed = now - this.previousDisplayFrameTime;
      if (elapsed > 0) {
        this.updateDisplayFpsHistory(1000 / elapsed, now);
        this.drawStatsGraphs();
      }
    }
    this.previousDisplayFrameTime = now;
  }

  updateStatsAverageDisplays() {
    this.updateAverageDisplay(this.ui.speedAverage, this.speedHistory);
    this.updateAverageDisplay(this.ui.displayFpsAverage, this.displayFpsHistory);
  }

  updateAverageDisplay(element, history) {
    if (!element) return;

    const samples = history
      .map(point => point.value)
      .filter(value => value > 0);
    if (samples.length === 0) {
      element.innerText = "avg --";
      return;
    }

    const average = samples.reduce((total, value) => total + value, 0) / samples.length;
    element.innerText = `avg ${average.toFixed(1)}`;
  }

  isStatsDisplayed() {
    return Boolean(
      this.renderStatsVisible &&
      this.ui.renderStats &&
      !this.ui.renderStats.classList.contains("hidden") &&
      this.ui.renderStats.getClientRects().length
    );
  }

  get throttleGraphs() {
    return Boolean(this.ui.throttleGraphs && this.ui.throttleGraphs.checked);
  }

  prepareGraphCanvas(canvas, context) {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const pixelWidth = Math.round(width * scale);
    const pixelHeight = Math.round(height * scale);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    context.setTransform(scale, 0, 0, scale, 0, 0);
    return {width, height};
  }

  drawHistoryGraph(canvas, context, history, frozenAt = undefined, options = {}) {
    if (!canvas || !context) return;

    const {width, height} = this.prepareGraphCanvas(canvas, context);
    const now = frozenAt ?? performance.now();
    const startTime = now - App.BUFFER_GRAPH_DURATION;
    const maxValue = options.maxValue ?? Math.max(1, ...history.map(point => point.value));
    const plot = {
      left: 36,
      top: 18,
      right: width - 20,
      bottom: height - 28
    };
    const plotWidth = plot.right - plot.left;
    const plotHeight = plot.bottom - plot.top;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(27, 31, 35, 0.92)";
    context.fillRect(0, 0, width, height);

    context.font = "11px Cascadia Mono, Consolas, monospace";
    context.strokeStyle = "rgba(122, 162, 214, 0.18)";
    context.lineWidth = 1;
    for (let index = 0; index <= 4; index++) {
      const y = plot.top + plotHeight * index / 4;
      const value = Math.round(maxValue * (1 - index / 4));

      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();

      context.fillStyle = "#6f7982";
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(value.toString(), plot.left - 6, y);
    }

    for (let index = 0; index <= 2; index++) {
      const x = plot.left + plotWidth * index / 2;
      const seconds = -Math.round(App.BUFFER_GRAPH_DURATION / 1000) + index * Math.round(App.BUFFER_GRAPH_DURATION / 2000);

      context.beginPath();
      context.moveTo(x, plot.top);
      context.lineTo(x, plot.bottom);
      context.stroke();

      context.fillStyle = "#6f7982";
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(`${seconds}s`, x, plot.bottom + 8);
    }

    context.strokeStyle = "rgba(154, 164, 173, 0.45)";
    context.beginPath();
    context.moveTo(plot.left, plot.top);
    context.lineTo(plot.left, plot.bottom);
    context.lineTo(plot.right, plot.bottom);
    context.stroke();

    context.strokeStyle = "#7aa2d6";
    context.lineWidth = 2;
    context.beginPath();
    const displayHistory = this.smoothGraphs ? this.smoothHistory(history) : history;
    displayHistory.forEach((point, index) => {
      const x = plot.left + this.clamp(
        (point.time - startTime) / App.BUFFER_GRAPH_DURATION * plotWidth,
        0,
        plotWidth
      );
      const y = plot.bottom - point.value / maxValue * plotHeight;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();
  }

  smoothHistory(history) {
    if (history.length < 4) return history;

    const radius = 3;
    return history.map((point, index) => {
      if (index === 0 || index === history.length - 1) return point;

      const start = Math.max(0, index - radius);
      const end = Math.min(history.length - 1, index + radius);
      let total = 0;
      for (let sampleIndex = start; sampleIndex <= end; sampleIndex++) {
        total += history[sampleIndex].value;
      }

      return {
        time: point.time,
        value: total / (end - start + 1)
      };
    });
  }

  toggleRenderStats() {
    this.ui.debugToggle.checked = !this.ui.debugToggle.checked;
    this.saveCheckboxValue(this.ui.debugToggle, App.STORAGE_DEBUG_VISIBLE);
    this.updateAuxiliaryOverlayVisibility();
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

  get renderMode() {
    return this.ui.renderMode.value === "speed" ? "speed" : "live";
  }

  get renderSpeed() {
    const speed = parseFloat(this.ui.renderSpeed.value);
    if (isNaN(speed)) return parseFloat(App.DEFAULT_RENDER_SPEED);
    return this.roundInputValue(this.ui.renderSpeed, speed);
  }

  get clearCanvasBeforeScan() {
    return this.ui.drawMode.value === "clear";
  }

  get smoothGraphs() {
    return Boolean(this.ui.smoothGraphs.checked);
  }

  setUpUi() {

    this.ui.controlsPanel = document.getElementById("controls-panel");
    this.ui.controlsPanelHeader = document.getElementById("controls-panel-header");
    this.ui.controlsPanelClose = document.getElementById("controls-panel-close");
    this.restorePanelPosition(this.ui.controlsPanel);
    this.setUpPanelDrag(this.ui.controlsPanel, this.ui.controlsPanelHeader);
    this.setUpPanelResize(this.ui.controlsPanel);
    this.ui.controlsPanelClose.addEventListener("click", event => {
      event.stopPropagation();
      this.setUiOverlayVisible(false);
    });
    document.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        this.toggleRenderStats();
        return;
      }
      if (event.key.toLowerCase() !== "p") return;
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
    this.ui.renderMode = document.getElementById("render-mode");
    this.ui.renderSpeedRow = document.getElementById("render-speed-row");
    this.ui.renderSpeed = document.getElementById("render-speed");
    this.ui.forceCalibration = document.getElementById("force-calibration");
    this.ui.debugToggle = document.getElementById("show-debug");
    this.ui.smoothGraphs = document.getElementById("smooth-graphs");
    this.ui.fullscreenButton = document.getElementById("fullscreen");
    this.ui.command = document.getElementById("command");
    this.ui.size = document.getElementById("size");
    this.ui.renderStats = document.getElementById("render-stats");
    this.ui.renderStatsHeader = document.getElementById("render-stats-header");
    this.ui.renderStatsText = document.getElementById("render-stats-text");
    this.ui.throttleGraphs = document.getElementById("throttle-graphs");
    this.ui.arriveGraph = document.getElementById("arrive-graph");
    this.ui.arriveGraphContext = this.ui.arriveGraph.getContext("2d");
    this.ui.speedGraph = document.getElementById("speed-graph");
    this.ui.speedGraphContext = this.ui.speedGraph.getContext("2d");
    this.ui.speedAverage = document.getElementById("speed-average");
    this.ui.displayFpsGraph = document.getElementById("display-fps-graph");
    this.ui.displayFpsGraphContext = this.ui.displayFpsGraph.getContext("2d");
    this.ui.displayFpsAverage = document.getElementById("display-fps-average");
    this.ui.bufferGraph = document.getElementById("buffer-graph");
    this.ui.bufferGraphContext = this.ui.bufferGraph.getContext("2d");
    this.restorePanelPosition(this.ui.renderStats, App.STORAGE_STATS_POSITION);
    this.setUpPanelDrag(this.ui.renderStats, this.ui.renderStatsHeader, App.STORAGE_STATS_POSITION);
    this.setUpPanelResize(this.ui.renderStats, App.STORAGE_STATS_POSITION, () => this.redrawStatsGraphs());

    this.restoreSelectValue(this.ui.channelInput, App.STORAGE_CHANNEL);
    this.restoreSelectValue(this.ui.resolution, App.STORAGE_RESOLUTION);
    this.restoreNumericValue(this.ui.brightness, App.STORAGE_BRIGHTNESS);
    this.restoreNumericValue(this.ui.contrast, App.STORAGE_CONTRAST);
    this.restoreScanWidth();
    this.restoreScanHeight();
    this.restoreDrawMode();
    this.restoreRenderMode();
    this.restoreNumericValue(this.ui.renderSpeed, App.STORAGE_RENDER_SPEED);
    this.restoreCheckboxValue(this.ui.forceCalibration, App.STORAGE_FORCE_CALIBRATION);
    this.restoreCheckboxValue(this.ui.debugToggle, App.STORAGE_DEBUG_VISIBLE, false);
    this.restoreCheckboxValue(this.ui.smoothGraphs, App.STORAGE_SMOOTH_GRAPHS, false);
    this.restoreCheckboxValue(this.ui.throttleGraphs, App.STORAGE_THROTTLE_GRAPHS, false);
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
    this.ui.debugToggle.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.debugToggle, App.STORAGE_DEBUG_VISIBLE);
      this.updateAuxiliaryOverlayVisibility();
    });
    this.ui.smoothGraphs.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.smoothGraphs, App.STORAGE_SMOOTH_GRAPHS);
      this.redrawStatsGraphs();
    });
    this.ui.throttleGraphs.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.throttleGraphs, App.STORAGE_THROTTLE_GRAPHS);
      this.redrawStatsGraphs();
    });
    this.ui.drawMode.addEventListener("change", () => {
      this.saveControlValue(this.ui.drawMode, App.STORAGE_DRAW_MODE);
    });
    this.ui.renderMode.addEventListener("change", () => {
      this.saveControlValue(this.ui.renderMode, App.STORAGE_RENDER_MODE);
      this.updateRenderSpeedState();
      this.resetSpeedRenderTiming();
      this.scheduleCanvasPaint();
      this.updateRenderStats();
    });
    this.ui.renderSpeed.addEventListener("input", () => {
      this.saveNumericValue(this.ui.renderSpeed, App.STORAGE_RENDER_SPEED);
      this.resetSpeedRenderTiming();
      this.scheduleCanvasPaint();
      this.updateRenderStats();
    });
    this.ui.renderSpeed.addEventListener("change", () => {
      this.ui.renderSpeed.value = this.clampInputValue(this.ui.renderSpeed, this.renderSpeed);
      this.saveNumericValue(this.ui.renderSpeed, App.STORAGE_RENDER_SPEED, {normalize: true});
      this.resetSpeedRenderTiming();
      this.scheduleCanvasPaint();
      this.updateRenderStats();
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
    this.setUpEnterToValidateParameters();

    this.updateExpectedImageSize();
    this.updateCommandPreview();
    this.updateScanButtonState();
    this.updateRenderSpeedState();
    this.updateAuxiliaryOverlayVisibility();
    this.updateScannerAvailability();
    setInterval(() => this.updateScannerAvailability(), 5000);
    this.scheduleDisplayFrameMonitor();

  }

  setUpEnterToValidateParameters() {
    const fields = this.ui.controlsPanel.querySelectorAll("input:not([type='checkbox']), select");
    fields.forEach(field => {
      field.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        field.dispatchEvent(new Event("change", {bubbles: true}));
        field.blur();
      });
    });
  }

  toggleUiOverlay() {
    this.setUiOverlayVisible(this.ui.controlsPanel.classList.contains("hidden"));
  }

  setUiOverlayVisible(isVisible) {
    this.ui.controlsPanel.classList.toggle("hidden", !isVisible);
    try {
      localStorage.setItem(App.STORAGE_UI_OVERLAY_VISIBLE, isVisible ? "true" : "false");
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
    this.updateAuxiliaryOverlayVisibility();
  }

  updateAuxiliaryOverlayVisibility() {
    const isUiOverlayVisible = !this.ui.controlsPanel.classList.contains("hidden");
    const isDebugVisible = isUiOverlayVisible && this.ui.debugToggle.checked;

    this.renderStatsVisible = isDebugVisible;
    this.ui.commandPanel.classList.toggle("hidden", !isDebugVisible);
    this.ui.renderStats.classList.toggle("hidden", !isDebugVisible);
    if (isDebugVisible) this.updateRenderStats();
  }

  updateScanButtonState() {
    this.ui.scanButton.disabled =
      !this.isChannelValid ||
      this.channelOutOfBounds ||
      this.state === App.STATE_REQUEST_SENT ||
      this.state === App.STATE_HEADER_PARSED;
  }

  async updateScannerAvailability() {
    try {
      const response = await fetch(App.URL + "/scanners");
      if (!response.ok) return;

      const data = await response.json();
      const availableChannels = new Set(
        (data.scanners || []).map(scanner => parseInt(scanner.channel))
      );
      const scannersByChannel = new Map(
        (data.scanners || []).map(scanner => [parseInt(scanner.channel), scanner])
      );

      Array.from(this.ui.channelInput.options).forEach(option => {
        const channel = parseInt(option.value);
        const scanner = scannersByChannel.get(channel);
        const isAvailable = Boolean(scanner);
        option.disabled = !isAvailable;
        option.label = isAvailable
          ? `${option.value} (${scanner.systemName})`
          : `${option.value} - unavailable`;
      });

      if (!availableChannels.has(this.channel)) {
        this.channelOutOfBounds = true;
        this.setCommandPreviewText("Channel out of bounds", true);
        this.updateScanButtonState();
      } else if (this.state !== App.STATE_REQUEST_SENT && this.state !== App.STATE_HEADER_PARSED) {
        this.updateCommandPreview();
      }
    } catch (err) {
      // Keep the current channel list if scanner status is temporarily unavailable.
    }
  }

  updateRenderSpeedState() {
    const isDisabled = this.renderMode !== "speed";
    this.ui.renderSpeed.disabled = isDisabled;
    this.ui.renderSpeedRow.classList.toggle("disabled", isDisabled);
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

  setUpPanelDrag(panel, handle, storageKey = App.STORAGE_PARAMETERS_POSITION) {
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
        this.savePanelPosition(panel, storageKey);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerUp);
      };

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerUp);
    });
  }

  setUpPanelResize(panel, storageKey = App.STORAGE_PARAMETERS_POSITION, onResize = undefined) {
    if (!window.ResizeObserver) return;

    let isRestoring = true;
    let saveTimeout = undefined;
    requestAnimationFrame(() => isRestoring = false);

    const resizeObserver = new ResizeObserver(() => {
      if (onResize) onResize();
      if (isRestoring) return;
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => this.savePanelPosition(panel, storageKey), 150);
    });
    resizeObserver.observe(panel);
    this.panelResizeObservers.push(resizeObserver);
  }

  restorePanelPosition(panel, storageKey = App.STORAGE_PARAMETERS_POSITION) {
    try {
      const position = JSON.parse(localStorage.getItem(storageKey));
      if (!position) return;

      requestAnimationFrame(() => {
        const rect = panel.getBoundingClientRect();
        const width = this.clamp(position.width || rect.width, 280, Math.max(280, window.innerWidth - 16));
        const height = this.clamp(position.height || rect.height, 220, Math.max(220, window.innerHeight - 16));
        panel.style.width = width + "px";
        panel.style.height = height + "px";
        const left = this.clamp(position.left, 0, Math.max(0, window.innerWidth - width));
        const top = this.clamp(position.top, 0, Math.max(0, window.innerHeight - height));
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel.style.left = left + "px";
        panel.style.top = top + "px";
      });
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  savePanelPosition(panel, storageKey = App.STORAGE_PARAMETERS_POSITION) {
    try {
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(storageKey, JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
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

  restoreRenderMode() {
    try {
      const value = localStorage.getItem(App.STORAGE_RENDER_MODE);
      this.ui.renderMode.value = value === "speed" || value === "smooth" ? "speed" : "live";
      localStorage.setItem(App.STORAGE_RENDER_MODE, this.ui.renderMode.value);
    } catch (err) {
      this.ui.renderMode.value = "live";
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
    if (this.state === App.STATE_REQUEST_SENT || this.state === App.STATE_HEADER_PARSED) {
      return;
    }

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
    if (!this.response.ok) {
      const errorText = await this.response.text();
      this.state = App.STATE_STANDBY;
      this.ui.channelInput.disabled = false;
      this.setCommandPreviewText(errorText || "Scan request failed", true);
      this.updateScanButtonState();
      return;
    }
    this.reader = this.response.body.getReader();
    this.#processChunk();
  }

  async #processChunk() {

    // Check if the reader is ready
    if (!this.reader) return;

    // Read from reader
    let {done, value} = await this.reader.read();

    // Parse header (if not done already)
    if (this.state == App.STATE_REQUEST_SENT && !done) {

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
          this.paintedRows = 0;
          this.resetSpeedRenderTiming();

          // Keep unparsed binary data for later parsing
          value = value.slice(i + 1);

          // Make sure to break so no further data is added to the header
          break;

        }

      }

    }

    if (this.state == App.STATE_HEADER_PARSED && !done) {
      this.parseQueue.push({data: value, offset: 0});
      this.scheduleScanParsing();
    }

    if (done) {
      this.streamComplete = true;
      this.scheduleScanParsing();
    } else {
      setTimeout(this.#processChunk.bind(this), 2);
    }

  }

  parseQueuedScanData() {
    if (!this.imageData || !this.imageData.data) return;

    const deadline = performance.now() + App.PARSE_FRAME_BUDGET_MS;
    let parsedRowsChanged = false;

    while (this.parseQueue.length > 0 && performance.now() < deadline) {
      const chunk = this.parseQueue[0];
      let remainingPixels = Math.floor((this.imageData.data.length - this.position) / 4);
      if (remainingPixels <= 0) {
        this.parseQueue = [];
        this.rgbRemainder = new Uint8Array();
        break;
      }

      while (this.rgbRemainder.length > 0 && this.rgbRemainder.length < 3 && chunk.offset < chunk.data.length) {
        const nextRemainder = new Uint8Array(this.rgbRemainder.length + 1);
        nextRemainder.set(this.rgbRemainder);
        nextRemainder[this.rgbRemainder.length] = chunk.data[chunk.offset++];
        this.rgbRemainder = nextRemainder;
      }

      if (this.rgbRemainder.length > 0 && this.rgbRemainder.length < 3 && chunk.offset >= chunk.data.length) {
        this.parseQueue.shift();
        continue;
      }

      if (this.rgbRemainder.length === 3) {
        this.imageData.data[this.position++] = this.rgbRemainder[0];
        this.imageData.data[this.position++] = this.rgbRemainder[1];
        this.imageData.data[this.position++] = this.rgbRemainder[2];
        this.imageData.data[this.position++] = 255;
        this.rgbRemainder = new Uint8Array();
        remainingPixels -= 1;
        parsedRowsChanged = true;
      }

      let parsedPixels = 0;
      while (
        remainingPixels > 0 &&
        chunk.offset + 2 < chunk.data.length
      ) {
        this.imageData.data[this.position++] = chunk.data[chunk.offset++];
        this.imageData.data[this.position++] = chunk.data[chunk.offset++];
        this.imageData.data[this.position++] = chunk.data[chunk.offset++];
        this.imageData.data[this.position++] = 255;
        remainingPixels -= 1;
        parsedPixels += 1;

        if ((parsedPixels & 255) === 0 && performance.now() >= deadline) break;
      }

      parsedRowsChanged = parsedRowsChanged || parsedPixels > 0;

      if (chunk.offset + 2 >= chunk.data.length) {
        this.rgbRemainder = chunk.data.slice(chunk.offset);
        this.parseQueue.shift();
      } else if (performance.now() >= deadline) {
        break;
      }
    }

    if (parsedRowsChanged) {
      this.updateArrivalStats(this.getAvailablePaintRows());
      this.scheduleCanvasPaint();
    }

    if (this.streamComplete && this.parseQueue.length === 0) {
      this.updateArrivalStats(this.getAvailablePaintRows({includePartialRow: true}));
      if (this.renderMode === "speed") {
        this.scheduleCanvasPaint();
        if (this.paintedRows >= this.getAvailablePaintRows({includePartialRow: true})) {
          this.finalizeScan();
        }
      } else {
        this.flushCanvasPaint();
        this.finalizeScan();
      }
    }
  }

  finalizeScan() {
    if (this.scanFinalized) return;

    this.scanFinalized = true;
    this.position = 0;
    this.state = App.STATE_DATA_PARSED;
    this.ui.channelInput.disabled = false;
    this.updateScanButtonState();
    const date = this.getFormattedDate(new Date());
    const ch = this.channel.toString().padStart(2, "0");
    this.saveCanvasToFile(`CH-${ch} ${date}.png`);
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

    const blob = await new Promise(resolve => {
      this.canvas.toBlob(resolve, "image/png");
    });
    if (!blob) return;

    const response = await fetch(
      App.URL + "/save?filename=" + encodeURIComponent(filename),
      {
        method: "POST",
        headers: {"Content-Type": "image/png"},
        body: blob
      }
    );

    if (!response.ok) {
      console.error("Could not save scan:", await response.text());
    }

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
