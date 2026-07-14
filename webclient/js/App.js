export class App {

  static STATE_STANDBY = 0;
  static STATE_REQUEST_SENT = 1;
  static STATE_HEADER_PARSED = 2;
  static STATE_DATA_PARSED = 3;

  static STORAGE_CHANNEL = "scanmeister.channel";
  static STORAGE_RESOLUTION = "scanmeister.resolution";
  static STORAGE_BRIGHTNESS = "scanmeister.brightness";
  static STORAGE_CONTRAST = "scanmeister.contrast";
  static STORAGE_SCAN_WIDTH = "scanmeister.scanWidth";
  static STORAGE_SCAN_HEIGHT = "scanmeister.scanHeight";
  static STORAGE_CLEAR_CANVAS = "scanmeister.clearCanvas";
  static STORAGE_DRAW_MODE = "scanmeister.drawMode";
  static STORAGE_RENDER_MODE = "scanmeister.renderMode";
  static STORAGE_DISPLAY_LAYOUT = "scanmeister.displayLayout";
  static STORAGE_WALL_GAP = "scanmeister.wallGap";
  static STORAGE_DIRECTION_MODE = "scanmeister.directionMode";
  static STORAGE_REVEAL_MODE = "scanmeister.revealMode";
  static STORAGE_RENDER_SPEED = "scanmeister.renderSpeed";
  static STORAGE_FORCE_CALIBRATION = "scanmeister.forceCalibration";
  static STORAGE_SAVE_IMAGES = "scanmeister.saveImages";
  static STORAGE_DEBUG_VISIBLE = "scanmeister.debugVisible";
  static STORAGE_SMOOTH_GRAPHS = "scanmeister.smoothGraphs";
  static STORAGE_GRAPH_SAMPLING = "scanmeister.graphSampling";
  static STORAGE_INPUT_GRAPH_VISIBLE = "scanmeister.inputGraphVisible";
  static STORAGE_SPEED_GRAPH_VISIBLE = "scanmeister.speedGraphVisible";
  static STORAGE_FRAME_RATE_GRAPH_VISIBLE = "scanmeister.frameRateGraphVisible";
  static STORAGE_BUFFER_GRAPH_VISIBLE = "scanmeister.bufferGraphVisible";
  static STORAGE_AUTO_HIDE_ENABLED = "scanmeister.autoHideEnabled";
  static STORAGE_AUTO_HIDE_SECONDS = "scanmeister.autoHideSeconds";
  static STORAGE_AUTO_SCAN_ENABLED = "scanmeister.autoScanEnabled";
  static STORAGE_AUTO_SCAN_SECONDS = "scanmeister.autoScanSeconds";
  static STORAGE_OVERLAY_GRID_ENABLED = "scanmeister.overlayGridEnabled";
  static STORAGE_OVERLAY_GRID_SPACING = "scanmeister.overlayGridSpacing";
  static STORAGE_UI_OVERLAY_VISIBLE = "scanmeister.uiOverlayVisible";
  static STORAGE_PARAMETERS_POSITION = "scanmeister.parametersPosition";
  static STORAGE_STATS_POSITION = "scanmeister.statsPosition";
  static STORAGE_GUERILLA_POSITION = "scanmeister.guerillaPosition";
  static STORAGE_GUERILLA_ROTATION = "scanmeister.guerillaRotation";
  static DEFAULT_SCAN_WIDTH = "300";
  static DEFAULT_SCAN_HEIGHT = "216";
  static DEFAULT_RENDER_SPEED = "100";
  static DEFAULT_WALL_GAP = "0";
  static DEFAULT_AUTO_HIDE_SECONDS = "10";
  static DEFAULT_AUTO_SCAN_SECONDS = "30";
  static DEFAULT_OVERLAY_GRID_SPACING = "100";
  static DEFAULT_GRAPH_SAMPLING = "15";
  static PIXEL_REVEAL_DURATION_MS = 200;
  static CLEAR_CANVAS_FADE_MS = 750;
  static BUFFER_GRAPH_DURATION = 10000;
  static STATS_GRAPH_THROTTLE_MS = 67;
  static PARSE_FRAME_BUDGET_MS = 2;
  static TOP_INFO_LOG_LIMIT = 50;
  static SENSOR_TOUCH_ADDRESS_PATTERN = /^\/sensor\/touch\/\d+$/;
  static SKIP_MAIN_CANVAS_IN_WALL_MODE = true;
  static STORAGE_NAMESPACE_NORMAL = "normal";
  static STORAGE_NAMESPACE_GUERILLA = "guerilla";

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
    this.displayFpsSamples = [];
    this.currentDisplayFps = 0;
    this.displayFrameRequest = undefined;
    this.previousDisplayFrameTime = undefined;
    this.lastStatsGraphDrawTime = 0;
    this.parseRequest = undefined;
    this.autoHideTimer = undefined;
    this.autoScanTimer = undefined;
    this.autoScanCountdownTimer = undefined;
    this.autoScanTargetTime = undefined;
    this.eventSource = undefined;
    this.lastSystemStatus = undefined;
    this.topInfoLog = [];
    this.topInfoLogVisible = false;
    this.guerillaModeActive = false;
    this.scanHistory = [];
    this.scanHistoryIndex = undefined;
    this.clearCanvasFadePromise = undefined;
    this.clearCanvasFadeTimer = undefined;
    this.panelResizeObservers = [];
    this.revealBands = [];
    this.revealSourceCanvas = document.createElement("canvas");
    this.revealSourceContext = this.revealSourceCanvas.getContext("2d");
    this.revealPixelCanvas = document.createElement("canvas");
    this.revealPixelContext = this.revealPixelCanvas.getContext("2d");
    this.wallRowBandCanvas = document.createElement("canvas");
    this.wallRowBandContext = this.wallRowBandCanvas.getContext("2d");
    this.wallRowBandImageData = undefined;
    this.wallOutputs = [];
    this.storageNamespace = this.getLaunchBooleanOverride("guerilla") === true
      ? App.STORAGE_NAMESPACE_GUERILLA
      : App.STORAGE_NAMESPACE_NORMAL;

    this.reset();
    this.setUpUi();
    window.scanmeister = this;
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
    this.scanAbortController = undefined;
    this.scanCancelled = false;
    this.cancelInProgress = false;
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
    this.displayFpsSamples = [];
    this.currentDisplayFps = 0;
    this.previousDisplayFrameTime = undefined;
    this.lastStatsGraphDrawTime = 0;
    this.inputGraphFrozenAt = undefined;
    this.statsGraphFrozenAt = undefined;
    this.displayFpsGraphFrozenAt = undefined;
    this.width = undefined;
    this.height = undefined;
    this.rgbRemainder = new Uint8Array();
    this.parseQueue = [];
    this.revealBands = [];
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
    return this.paintedRows < this.getAvailablePaintRows({includePartialRow: this.streamComplete}) ||
      this.hasActivePixelReveal();
  }

  paintCanvasRows(options = {}) {
    if (!this.imageData || !this.imageData.data) return;
    if (!this.canvas.width || !this.canvas.height) return;

    const availableRows = this.getAvailablePaintRows(options);
    const nextPaintedRows = this.renderMode === "speed" && !options.includePartialRow
      ? this.getSpeedPaintRows(availableRows)
      : availableRows;
    this.updateRenderStats({availableRows});
    if (nextPaintedRows <= this.paintedRows) {
      this.drawPixelRevealBands();
      return;
    }

    const rowCount = nextPaintedRows - this.paintedRows;
    const firstPaintedRow = this.paintedRows;
    const shouldPaintMainCanvas = this.shouldPaintMainCanvasLive();
    const revealBase = shouldPaintMainCanvas
      ? this.capturePixelRevealBase(firstPaintedRow, rowCount)
      : undefined;
    if (shouldPaintMainCanvas) {
      this.context.putImageData(
        this.imageData,
        0,
        0,
        0,
        this.paintedRows,
        this.canvas.width,
        rowCount
      );
    }
    const paintEnded = performance.now();
    const now = paintEnded;
    this.addPixelRevealBand(firstPaintedRow, rowCount, now, revealBase);
    if (shouldPaintMainCanvas) this.drawPixelRevealBands(now);
    if (!this.isPixelRevealMode()) this.refreshWallDisplaysForRows(firstPaintedRow, rowCount);
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

  shouldPaintMainCanvasLive() {
    return !(
      App.SKIP_MAIN_CANVAS_IN_WALL_MODE &&
      this.isWallDisplayLayout &&
      !this.isPixelRevealMode()
    );
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

  capturePixelRevealBase(startRow, rowCount) {
    if (this.revealMode !== "glitchy-pixelate" || rowCount <= 0) return undefined;
    return this.context.getImageData(0, startRow, this.canvas.width, rowCount);
  }

  addPixelRevealBand(startRow, rowCount, now = performance.now(), baseImageData = undefined) {
    if (!this.isPixelRevealMode() || rowCount <= 0) return;

    this.revealBands.push({
      startRow,
      rowCount,
      startedAt: now,
      baseImageData
    });
  }

  hasActivePixelReveal(now = performance.now()) {
    return this.revealBands.some(band => now - band.startedAt < App.PIXEL_REVEAL_DURATION_MS);
  }

  drawPixelRevealBands(now = performance.now()) {
    if (!this.isPixelRevealMode() || this.revealBands.length === 0) {
      this.restorePixelRevealBands();
      this.revealBands = [];
      return;
    }

    this.context.imageSmoothingEnabled = false;
    const refreshedBands = [];
    this.revealBands = this.revealBands.filter(band => {
      const age = now - band.startedAt;
      const blockSize = this.getPixelRevealBlockSize(age);

      if (blockSize <= 1) {
        this.restorePixelRevealBand(band);
        refreshedBands.push(band);
        return false;
      }

      if (this.revealMode === "glitchy-pixelate") {
        this.restorePixelRevealBase(band);
        this.drawPixelatedBand(band, blockSize, age, {clumpy: true});
      } else {
        this.restorePixelRevealBand(band);
        this.drawPixelatedBand(band, blockSize, age);
      }
      refreshedBands.push(band);
      return age < App.PIXEL_REVEAL_DURATION_MS;
    });
    this.context.imageSmoothingEnabled = true;
    refreshedBands.forEach(band => this.refreshWallDisplaysForRows(band.startRow, band.rowCount));
  }

  isPixelRevealMode() {
    return this.revealMode === "pixelate" || this.revealMode === "glitchy-pixelate";
  }

  restorePixelRevealBands() {
    if (!this.imageData || !this.imageData.data) return;
    this.revealBands.forEach(band => this.restorePixelRevealBand(band));
  }

  restorePixelRevealBand(band) {
    if (!this.imageData || !this.imageData.data) return;
    this.context.putImageData(
      this.imageData,
      0,
      0,
      0,
      band.startRow,
      this.canvas.width,
      band.rowCount
    );
  }

  restorePixelRevealBase(band) {
    if (band.baseImageData) {
      this.context.putImageData(band.baseImageData, 0, band.startRow);
      return;
    }

    this.context.clearRect(0, band.startRow, this.canvas.width, band.rowCount);
  }

  getPixelRevealBlockSize(age) {
    const progress = this.clamp(age / App.PIXEL_REVEAL_DURATION_MS, 0, 1);
    if (progress < 0.2) return 24;
    if (progress < 0.4) return 16;
    if (progress < 0.6) return 8;
    if (progress < 0.8) return 4;
    if (progress < 0.95) return 2;
    return 1;
  }

  drawPixelatedBand(band, blockSize, age, options = {}) {
    const width = this.canvas.width;
    const startRow = band.startRow;
    const rowCount = band.rowCount;
    const sourceHeight = rowCount;
    const smallWidth = Math.max(1, Math.ceil(width / blockSize));
    const smallHeight = Math.max(1, Math.ceil(sourceHeight / blockSize));

    if (this.revealSourceCanvas.width !== width) this.revealSourceCanvas.width = width;
    if (this.revealSourceCanvas.height !== sourceHeight) this.revealSourceCanvas.height = sourceHeight;
    if (this.revealPixelCanvas.width !== smallWidth) this.revealPixelCanvas.width = smallWidth;
    if (this.revealPixelCanvas.height !== smallHeight) this.revealPixelCanvas.height = smallHeight;

    this.revealSourceContext.putImageData(
      this.imageData,
      0,
      -startRow,
      0,
      startRow,
      width,
      sourceHeight
    );
    this.revealPixelContext.imageSmoothingEnabled = false;
    this.revealPixelContext.clearRect(0, 0, smallWidth, smallHeight);
    this.revealPixelContext.drawImage(this.revealSourceCanvas, 0, 0, smallWidth, smallHeight);
    if (options.clumpy) {
      this.drawClumpyPixelBlocks(band, blockSize, smallWidth, smallHeight, age);
    } else {
      this.drawPixelBlocks(band, blockSize, smallWidth, smallHeight);
    }
  }

  drawPixelBlocks(band, blockSize, smallWidth, smallHeight) {
    for (let smallY = 0; smallY < smallHeight; smallY++) {
      for (let smallX = 0; smallX < smallWidth; smallX++) {
        const destX = smallX * blockSize;
        const destY = band.startRow + smallY * blockSize;
        const destWidth = Math.min(blockSize, this.canvas.width - destX);
        const destHeight = Math.min(blockSize, band.startRow + band.rowCount - destY);
        if (destWidth <= 0 || destHeight <= 0) continue;

        this.context.drawImage(
          this.revealPixelCanvas,
          smallX,
          smallY,
          1,
          1,
          destX,
          destY,
          destWidth,
          destHeight
        );
      }
    }
  }

  drawClumpyPixelBlocks(band, blockSize, smallWidth, smallHeight, age) {
    const progress = this.clamp(age / App.PIXEL_REVEAL_DURATION_MS, 0, 1);
    const blockProgress = this.clamp((progress - 0.015) / 0.68, 0, 1);
    const revealTravel = smallHeight + 2;
    const frontier = blockProgress * revealTravel - 1;

    for (let smallY = 0; smallY < smallHeight; smallY++) {
      for (let smallX = 0; smallX < smallWidth; smallX++) {
        const edgeDistance = frontier - smallY;
        const clump = this.getPixelRevealClump(band, smallX, smallY);
        const grain = this.getPixelRevealRandom(band, smallX, smallY);
        const threshold = -1.4 + clump * 2.1 + grain * 0.7;
        if (edgeDistance < threshold) continue;

        const destX = smallX * blockSize;
        const destY = band.startRow + smallY * blockSize;
        const destWidth = Math.min(blockSize, this.canvas.width - destX);
        const destHeight = Math.min(blockSize, band.startRow + band.rowCount - destY);
        if (destWidth <= 0 || destHeight <= 0) continue;

        this.context.drawImage(
          this.revealPixelCanvas,
          smallX,
          smallY,
          1,
          1,
          destX,
          destY,
          destWidth,
          destHeight
        );
      }
    }
  }

  getPixelRevealRandom(band, x, y) {
    const seed = ((x + 1) * 73856093) ^
      ((y + 1) * 19349663) ^
      ((band.startRow + 1) * 83492791);
    return Math.abs(Math.sin(seed) * 43758.5453) % 1;
  }

  getPixelRevealClump(band, x, y) {
    const coarseX = Math.floor(x / 3);
    const coarseY = Math.floor(y / 3);
    const center = this.getPixelRevealRandom(band, coarseX, coarseY);
    const right = this.getPixelRevealRandom(band, coarseX + 1, coarseY);
    const below = this.getPixelRevealRandom(band, coarseX, coarseY + 1);
    return ((center * 0.6 + right * 0.2 + below * 0.2) * 2) - 1;
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

    if (this.isGraphEnabled("input") && this.inputGraphFrozenAt === undefined) {
      this.updateArrivalHistory(arrivalRowsPerSecond, graphTime);
      if (hasFullInput) this.inputGraphFrozenAt = graphTime;
    }

    if (this.statsGraphFrozenAt === undefined) {
      if (this.isGraphEnabled("buffer")) this.updateBufferHistory(bufferedRows, graphTime);
      if (this.isGraphEnabled("speed")) this.updateSpeedHistory(paintedRowsPerSecond, graphTime);
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
    if (!this.isGraphEnabled("frameRate")) return;
    this.updateHistory(this.displayFpsHistory, framesPerSecond, now);
    this.displayFpsGraphFrozenAt = undefined;
  }

  updateHistory(history, value, now = performance.now()) {
    const startTime = now - App.BUFFER_GRAPH_DURATION;
    history.push({time: now, value});
    const firstCurrentPoint = history.findIndex(point => point.time >= startTime);
    if (firstCurrentPoint > 0) history.splice(0, firstCurrentPoint);
  }

  drawArrivalGraph() {
    if (!this.isGraphEnabled("input")) return;
    this.drawHistoryGraph(this.ui.arriveGraph, this.ui.arriveGraphContext, this.arrivalHistory, this.statsGraphFrozenAt);
  }

  drawSpeedGraph() {
    if (!this.isGraphEnabled("speed")) return;
    this.drawHistoryGraph(this.ui.speedGraph, this.ui.speedGraphContext, this.speedHistory, this.statsGraphFrozenAt, {maxValue: 500});
  }

  drawDisplayFpsGraph() {
    if (!this.isGraphEnabled("frameRate")) return;
    this.drawHistoryGraph(
      this.ui.displayFpsGraph,
      this.ui.displayFpsGraphContext,
      this.displayFpsHistory,
      this.displayFpsGraphFrozenAt ?? this.statsGraphFrozenAt,
      {maxValue: 60}
    );
  }

  drawBufferGraph() {
    if (!this.isGraphEnabled("buffer")) return;
    this.drawHistoryGraph(this.ui.bufferGraph, this.ui.bufferGraphContext, this.bufferHistory, this.statsGraphFrozenAt);
  }

  redrawStatsGraphs() {
    this.drawStatsGraphs({force: true});
  }

  setUpGraphToggle(toggle, storageKey) {
    toggle.addEventListener("change", () => {
      this.saveCheckboxValue(toggle, storageKey);
      this.updateStatsGraphVisibility();
      this.redrawStatsGraphs();
    });
  }

  updateStatsGraphVisibility() {
    Object.entries(this.ui.graphCanvases).forEach(([name, canvas]) => {
      canvas.classList.toggle("hidden", !this.isGraphEnabled(name));
    });

    Object.entries(this.ui.graphAverageLabels).forEach(([name, label]) => {
      if (!this.isGraphEnabled(name)) label.innerText = "avg --";
    });
  }

  drawStatsGraphs(options = {}) {
    if (!this.isStatsDisplayed()) return;

    const now = performance.now();
    if (!options.force && now - this.lastStatsGraphDrawTime < this.graphThrottleMs) {
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
    if (!this.isScanActive() || this.statsGraphFrozenAt !== undefined) {
      if (this.isStatsDisplayed() && this.isGraphEnabled("frameRate")) this.freezeDisplayFpsGraph();
      this.previousDisplayFrameTime = undefined;
      return;
    }

    if (this.previousDisplayFrameTime !== undefined) {
      const elapsed = now - this.previousDisplayFrameTime;
      if (elapsed > 0) {
        const framesPerSecond = 1000 / elapsed;
        this.currentDisplayFps = framesPerSecond;
        this.displayFpsSamples.push(framesPerSecond);
        if (this.isStatsDisplayed() && this.isGraphEnabled("frameRate")) {
          this.updateDisplayFpsHistory(framesPerSecond, now);
        }
      }
    }
    this.previousDisplayFrameTime = now;
  }

  getFrameRateStats() {
    const samples = this.displayFpsSamples.filter(value => value > 0);
    if (samples.length === 0) {
      return {
        current: 0,
        average: 0,
        minimum: 0,
        maximum: 0,
        samples: 0
      };
    }

    const total = samples.reduce((sum, value) => sum + value, 0);
    return {
      current: Number(this.currentDisplayFps.toFixed(1)),
      average: Number((total / samples.length).toFixed(1)),
      minimum: Number(Math.min(...samples).toFixed(1)),
      maximum: Number(Math.max(...samples).toFixed(1)),
      samples: samples.length
    };
  }

  isScanActive() {
    return this.state === App.STATE_REQUEST_SENT || this.state === App.STATE_HEADER_PARSED;
  }

  freezeDisplayFpsGraph() {
    if (this.displayFpsGraphFrozenAt !== undefined || this.displayFpsHistory.length === 0) return;
    this.displayFpsGraphFrozenAt = this.displayFpsHistory[this.displayFpsHistory.length - 1].time;
  }

  updateStatsAverageDisplays() {
    if (this.isGraphEnabled("speed")) {
      this.updateAverageDisplay(this.ui.speedAverage, this.speedHistory);
    } else {
      this.ui.speedAverage.innerText = "avg --";
    }

    if (this.isGraphEnabled("frameRate")) {
      this.updateAverageDisplay(this.ui.displayFpsAverage, this.displayFpsHistory);
    } else {
      this.ui.displayFpsAverage.innerText = "avg --";
    }
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

  get serverUrl() {
    return "/api";
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
      return this.clampScanDimensionValue(this.ui.width, width);
    }
  }

  get scanHeight() {
    const height = parseFloat(this.ui.height.value);
    if (isNaN(height)) {
      return undefined;
    } else {
      return this.clampScanDimensionValue(this.ui.height, height);
    }
  }

  get forceCalibration() {
    return Boolean(this.ui.forceCalibration.checked);
  }

  get saveImages() {
    return Boolean(this.ui.saveImages.checked);
  }

  get renderMode() {
    return this.ui.renderMode.value === "speed" ? "speed" : "live";
  }

  get displayLayout() {
    if (this.guerillaModeActive) return "guerilla";
    if (this.ui.displayLayout.value === "wall-4-horizontal") return "wall-4-horizontal";
    if (this.ui.displayLayout.value === "wall-8-horizontal") return "wall-8-horizontal";
    return "single";
  }

  get isGuerillaDisplayLayout() {
    return this.displayLayout === "guerilla";
  }

  get isWallDisplayLayout() {
    return this.displayLayout === "wall-4-horizontal" || this.displayLayout === "wall-8-horizontal";
  }

  get wallOutputCount() {
    if (this.displayLayout === "wall-8-horizontal") return 8;
    if (this.displayLayout === "wall-4-horizontal") return 4;
    return 0;
  }

  get wallGapMillimeters() {
    const gap = parseFloat(this.ui.wallGap.value);
    if (isNaN(gap)) return parseFloat(App.DEFAULT_WALL_GAP);
    return this.clampWallGapValue(gap);
  }

  get wallGapPixels() {
    return this.wallGapMillimeters / 25.4 * this.resolution;
  }

  get wallDisplayAspectRatio() {
    if (this.displayLayout === "wall-8-horizontal") return 32 / 9;
    if (this.displayLayout === "wall-4-horizontal") return 16 / 9;
    return 1;
  }

  get activeWallOutputs() {
    return this.wallOutputs.slice(0, this.wallOutputCount);
  }

  get directionMode() {
    return this.ui.directionMode.value === "rotated" ? "rotated" : "normal";
  }

  get revealMode() {
    if (this.ui.revealMode.value === "pixelate") return "pixelate";
    if (this.ui.revealMode.value === "glitchy-pixelate") return "glitchy-pixelate";
    return "immediate";
  }

  get renderSpeed() {
    const speed = parseFloat(this.ui.renderSpeed.value);
    if (isNaN(speed)) return parseFloat(App.DEFAULT_RENDER_SPEED);
    return this.roundInputValue(this.ui.renderSpeed, speed);
  }

  get autoHideSeconds() {
    const seconds = parseFloat(this.ui.autoHideSeconds.value);
    if (isNaN(seconds)) return parseFloat(App.DEFAULT_AUTO_HIDE_SECONDS);
    return this.roundInputValue(this.ui.autoHideSeconds, seconds);
  }

  get autoHideEnabled() {
    return Boolean(this.ui.autoHideToggle.checked);
  }

  get autoScanSeconds() {
    const seconds = parseFloat(this.ui.autoScanSeconds.value);
    if (isNaN(seconds)) return parseFloat(App.DEFAULT_AUTO_SCAN_SECONDS);
    return this.roundInputValue(this.ui.autoScanSeconds, seconds);
  }

  get autoScanEnabled() {
    return Boolean(this.ui.autoScanToggle.checked);
  }

  get overlayGridEnabled() {
    return Boolean(this.ui.overlayGridToggle.checked);
  }

  get overlayGridSpacing() {
    const spacing = parseFloat(this.ui.overlayGridSpacing.value);
    if (isNaN(spacing)) return parseFloat(App.DEFAULT_OVERLAY_GRID_SPACING);
    return this.roundInputValue(this.ui.overlayGridSpacing, spacing);
  }

  get graphSampling() {
    const sampling = parseFloat(this.ui.graphSampling.value);
    if (isNaN(sampling)) return parseFloat(App.DEFAULT_GRAPH_SAMPLING);
    return this.roundInputValue(this.ui.graphSampling, sampling);
  }

  get graphThrottleMs() {
    return 1000 / Math.max(1, this.graphSampling);
  }

  isGraphEnabled(name) {
    const toggle = this.ui.graphToggles?.[name];
    return !toggle || toggle.checked;
  }

  get clearCanvasBeforeScan() {
    return this.ui.drawMode.value === "clear";
  }

  get smoothGraphs() {
    return Boolean(this.ui.smoothGraphs.checked);
  }

  setUpUi() {

    this.updateVersionLabels();

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
      if (this.isTypingInField(event.target)) return;
      if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        this.toggleRenderStats();
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.activateScanButton();
        return;
      }
      if (event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      this.toggleUiOverlay();
    });
    document.addEventListener("mousemove", () => this.handleMouseActivity());
    this.ui.topInfoPanel = document.getElementById("top-info-panel");
    this.ui.topInfoMessage = document.getElementById("top-info-message");
    this.ui.topInfoMessageZone = this.ui.topInfoMessage.closest(".top-info-message-zone");
    this.ui.topInfoLogToggle = document.getElementById("top-info-log-toggle");
    this.ui.topInfoLog = document.getElementById("top-info-log");
    this.ui.commandPanel = document.getElementById("command-panel");
    this.ui.guerillaPanel = document.getElementById("guerilla-panel");
    this.ui.guerillaPanelHeader = document.getElementById("guerilla-panel-header");
    this.ui.guerillaRotateButton = document.getElementById("guerilla-rotate");
    this.ui.guerillaBrightness = document.getElementById("guerilla-brightness");
    this.ui.guerillaForceCalibration = document.getElementById("guerilla-force-calibration");
    this.ui.guerillaContrast = document.getElementById("guerilla-contrast");
    this.ui.firstScanButton = document.getElementById("guerilla-first-scan");
    this.ui.previousScanButton = document.getElementById("guerilla-previous-scan");
    this.ui.nextScanButton = document.getElementById("guerilla-next-scan");
    this.ui.lastScanButton = document.getElementById("guerilla-last-scan");
    this.ui.scanHistoryFilename = document.getElementById("guerilla-image-browser-filename");
    this.ui.scanHistoryImage = document.getElementById("scan-history-image");
    this.restorePanelPosition(this.ui.guerillaPanel, App.STORAGE_GUERILLA_POSITION);
    this.setUpPanelDrag(this.ui.guerillaPanel, this.ui.guerillaPanelHeader, App.STORAGE_GUERILLA_POSITION);
    this.setUpPanelResize(this.ui.guerillaPanel, App.STORAGE_GUERILLA_POSITION);
    this.restoreGuerillaRotation();
    this.ui.guerillaRotateButton.addEventListener("click", () => this.rotateGuerillaPanel());
    this.ui.firstScanButton.addEventListener("click", () => this.showFirstSavedScan());
    this.ui.previousScanButton.addEventListener("click", () => this.showPreviousSavedScan());
    this.ui.nextScanButton.addEventListener("click", () => this.showNextSavedScan());
    this.ui.lastScanButton.addEventListener("click", () => this.showLastSavedScan());
    this.ui.topInfoLogToggle.addEventListener("click", () => this.toggleTopInfoLog());
    document.addEventListener("pointerdown", event => this.handleTopInfoOutsidePointerDown(event));

    this.ui.scanButton = document.getElementById("scan");
    this.ui.scanButton.addEventListener('click', () => this.activateScanButton());

    this.ui.channelInput = document.getElementById('channel');

    this.ui.resolution = document.getElementById("resolution");
    this.ui.brightness = document.getElementById("brightness");
    this.ui.contrast = document.getElementById("contrast");
    this.ui.width = document.getElementById("width");
    this.ui.height = document.getElementById("height");
    this.ui.drawMode = document.getElementById("draw-mode");
    this.ui.renderMode = document.getElementById("render-mode");
    this.ui.displayLayout = document.getElementById("display-layout");
    this.ui.wallGapRow = document.getElementById("wall-gap-row");
    this.ui.wallGap = document.getElementById("wall-gap");
    this.ui.wallGapPixels = document.getElementById("wall-gap-pixels");
    this.ui.directionMode = document.getElementById("direction-mode");
    this.ui.revealMode = document.getElementById("reveal-mode");
    this.ui.renderSpeedRow = document.getElementById("render-speed-row");
    this.ui.renderSpeed = document.getElementById("render-speed");
    this.ui.forceCalibration = document.getElementById("force-calibration");
    this.ui.saveImages = document.getElementById("save-images");
    this.ui.debugToggle = document.getElementById("show-debug");
    this.ui.autoHideToggle = document.getElementById("auto-hide-ui");
    this.ui.autoHideSecondsRow = document.getElementById("auto-hide-seconds-row");
    this.ui.autoHideSeconds = document.getElementById("auto-hide-seconds");
    this.ui.autoScanToggle = document.getElementById("auto-scan");
    this.ui.autoScanSecondsRow = document.getElementById("auto-scan-seconds-row");
    this.ui.autoScanSeconds = document.getElementById("auto-scan-seconds");
    this.ui.overlayGrid = document.getElementById("overlay-grid-display");
    this.ui.wallGrid = document.getElementById("wall-grid-display");
    this.ui.wallDisplay = document.getElementById("wall-display");
    this.wallOutputs = Array.from(document.querySelectorAll(".wall-output")).map(canvas => ({
      canvas,
      context: canvas.getContext("2d")
    }));
    this.ui.overlayGridRow = document.getElementById("overlay-grid-row");
    this.ui.overlayGridToggle = document.getElementById("overlay-grid");
    this.ui.overlayGridSpacing = document.getElementById("overlay-grid-spacing");
    this.ui.smoothGraphs = document.getElementById("smooth-graphs");
    this.ui.graphSampling = document.getElementById("graph-sampling");
    this.ui.fullscreenButton = document.getElementById("fullscreen");
    this.ui.quitKioskButton = document.getElementById("quit-kiosk");
    this.ui.command = document.getElementById("command");
    this.ui.size = document.getElementById("size");
    this.ui.renderStats = document.getElementById("render-stats");
    this.ui.renderStatsHeader = document.getElementById("render-stats-header");
    this.ui.renderStatsText = document.getElementById("render-stats-text");
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
    this.ui.graphToggles = {
      input: document.getElementById("show-input-graph"),
      speed: document.getElementById("show-speed-graph"),
      frameRate: document.getElementById("show-frame-rate-graph"),
      buffer: document.getElementById("show-buffer-graph")
    };
    this.ui.graphCanvases = {
      input: this.ui.arriveGraph,
      speed: this.ui.speedGraph,
      frameRate: this.ui.displayFpsGraph,
      buffer: this.ui.bufferGraph
    };
    this.ui.graphAverageLabels = {
      speed: this.ui.speedAverage,
      frameRate: this.ui.displayFpsAverage
    };
    this.restorePanelPosition(this.ui.renderStats, App.STORAGE_STATS_POSITION);
    this.setUpPanelDrag(this.ui.renderStats, this.ui.renderStatsHeader, App.STORAGE_STATS_POSITION);
    this.setUpPanelResize(this.ui.renderStats, App.STORAGE_STATS_POSITION, () => this.redrawStatsGraphs());

    this.restoreSelectValue(this.ui.channelInput, App.STORAGE_CHANNEL);
    this.restoreSelectValue(this.ui.resolution, App.STORAGE_RESOLUTION);
    this.restoreNumericValue(this.ui.brightness, App.STORAGE_BRIGHTNESS);
    this.restoreNumericValue(this.ui.contrast, App.STORAGE_CONTRAST);
    this.syncGuerillaControl(this.ui.guerillaBrightness, this.ui.brightness);
    this.syncGuerillaControl(this.ui.guerillaContrast, this.ui.contrast);
    this.restoreScanWidth();
    this.restoreScanHeight();
    this.restoreDrawMode();
    this.restoreRenderMode();
    this.restoreDisplayLayout();
    this.restoreWallGap();
    this.restoreDirectionMode();
    this.restoreRevealMode();
    this.restoreNumericValue(this.ui.renderSpeed, App.STORAGE_RENDER_SPEED);
    this.restoreCheckboxValue(this.ui.forceCalibration, App.STORAGE_FORCE_CALIBRATION);
    this.syncGuerillaCheckbox(this.ui.guerillaForceCalibration, this.ui.forceCalibration);
    this.restoreCheckboxValue(this.ui.saveImages, App.STORAGE_SAVE_IMAGES, true);
    this.restoreCheckboxValue(this.ui.debugToggle, App.STORAGE_DEBUG_VISIBLE, false);
    this.restoreCheckboxValue(this.ui.autoHideToggle, App.STORAGE_AUTO_HIDE_ENABLED, false);
    this.restoreNumericValue(this.ui.autoHideSeconds, App.STORAGE_AUTO_HIDE_SECONDS);
    if (!this.ui.autoHideSeconds.value) this.ui.autoHideSeconds.value = App.DEFAULT_AUTO_HIDE_SECONDS;
    this.restoreCheckboxValue(this.ui.autoScanToggle, App.STORAGE_AUTO_SCAN_ENABLED, false);
    this.restoreNumericValue(this.ui.autoScanSeconds, App.STORAGE_AUTO_SCAN_SECONDS);
    if (!this.ui.autoScanSeconds.value) this.ui.autoScanSeconds.value = App.DEFAULT_AUTO_SCAN_SECONDS;
    this.restoreCheckboxValue(this.ui.overlayGridToggle, App.STORAGE_OVERLAY_GRID_ENABLED, false);
    this.restoreNumericValue(this.ui.overlayGridSpacing, App.STORAGE_OVERLAY_GRID_SPACING);
    if (!this.ui.overlayGridSpacing.value) this.ui.overlayGridSpacing.value = App.DEFAULT_OVERLAY_GRID_SPACING;
    this.restoreCheckboxValue(this.ui.smoothGraphs, App.STORAGE_SMOOTH_GRAPHS, false);
    this.restoreNumericValue(this.ui.graphSampling, App.STORAGE_GRAPH_SAMPLING);
    if (!this.ui.graphSampling.value) this.ui.graphSampling.value = App.DEFAULT_GRAPH_SAMPLING;
    this.restoreCheckboxValue(this.ui.graphToggles.input, App.STORAGE_INPUT_GRAPH_VISIBLE, true);
    this.restoreCheckboxValue(this.ui.graphToggles.speed, App.STORAGE_SPEED_GRAPH_VISIBLE, true);
    this.restoreCheckboxValue(this.ui.graphToggles.frameRate, App.STORAGE_FRAME_RATE_GRAPH_VISIBLE, true);
    this.restoreCheckboxValue(this.ui.graphToggles.buffer, App.STORAGE_BUFFER_GRAPH_VISIBLE, true);
    this.updateStatsGraphVisibility();
    this.restoreUiOverlayVisibility();
    this.restoreGuerillaUiVisibility();

    this.ui.channelInput.addEventListener("change", () => {
      this.saveControlValue(this.ui.channelInput, App.STORAGE_CHANNEL);
      this.updateExpectedImageSize();
      this.updateCommandPreview();
      this.updateScanButtonState();
    });
    this.ui.resolution.addEventListener("change", () => {
      this.saveControlValue(this.ui.resolution, App.STORAGE_RESOLUTION);
      this.updateExpectedImageSize();
      this.updateWallGapState();
      this.refreshWallDisplays();
      this.updateCommandPreview();
    });
    this.ui.forceCalibration.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.forceCalibration, App.STORAGE_FORCE_CALIBRATION);
      this.syncGuerillaCheckbox(this.ui.guerillaForceCalibration, this.ui.forceCalibration);
      this.updateCommandPreview();
    });
    this.ui.guerillaForceCalibration.addEventListener("change", () => {
      this.ui.forceCalibration.checked = this.ui.guerillaForceCalibration.checked;
      this.saveCheckboxValue(this.ui.forceCalibration, App.STORAGE_FORCE_CALIBRATION);
      this.updateCommandPreview();
    });
    this.ui.saveImages.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.saveImages, App.STORAGE_SAVE_IMAGES);
    });
    this.ui.debugToggle.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.debugToggle, App.STORAGE_DEBUG_VISIBLE);
      this.updateAuxiliaryOverlayVisibility();
    });
    this.ui.autoHideToggle.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.autoHideToggle, App.STORAGE_AUTO_HIDE_ENABLED);
      this.updateAutoHideState();
    });
    this.ui.autoHideSeconds.addEventListener("input", () => {
      this.saveNumericValue(this.ui.autoHideSeconds, App.STORAGE_AUTO_HIDE_SECONDS);
      this.scheduleUiAutoHide();
    });
    this.ui.autoHideSeconds.addEventListener("change", () => {
      this.ui.autoHideSeconds.value = this.clampInputValue(this.ui.autoHideSeconds, this.autoHideSeconds);
      this.saveNumericValue(this.ui.autoHideSeconds, App.STORAGE_AUTO_HIDE_SECONDS, {normalize: true});
      this.scheduleUiAutoHide();
    });
    this.ui.autoScanToggle.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.autoScanToggle, App.STORAGE_AUTO_SCAN_ENABLED);
      this.updateAutoScanState();
    });
    this.ui.autoScanSeconds.addEventListener("input", () => {
      this.saveNumericValue(this.ui.autoScanSeconds, App.STORAGE_AUTO_SCAN_SECONDS);
      this.scheduleAutoScan();
    });
    this.ui.autoScanSeconds.addEventListener("change", () => {
      this.ui.autoScanSeconds.value = this.clampInputValue(this.ui.autoScanSeconds, this.autoScanSeconds);
      this.saveNumericValue(this.ui.autoScanSeconds, App.STORAGE_AUTO_SCAN_SECONDS, {normalize: true});
      this.scheduleAutoScan();
    });
    this.ui.overlayGridToggle.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.overlayGridToggle, App.STORAGE_OVERLAY_GRID_ENABLED);
      this.updateOverlayGridState();
    });
    this.ui.overlayGridSpacing.addEventListener("input", () => {
      this.saveNumericValue(this.ui.overlayGridSpacing, App.STORAGE_OVERLAY_GRID_SPACING);
      this.updateOverlayGridState();
    });
    this.ui.overlayGridSpacing.addEventListener("change", () => {
      this.ui.overlayGridSpacing.value = this.clampInputValue(this.ui.overlayGridSpacing, this.overlayGridSpacing);
      this.saveNumericValue(this.ui.overlayGridSpacing, App.STORAGE_OVERLAY_GRID_SPACING, {normalize: true});
      this.updateOverlayGridState();
    });
    this.ui.smoothGraphs.addEventListener("change", () => {
      this.saveCheckboxValue(this.ui.smoothGraphs, App.STORAGE_SMOOTH_GRAPHS);
      this.redrawStatsGraphs();
    });
    this.ui.graphSampling.addEventListener("input", () => {
      this.saveNumericValue(this.ui.graphSampling, App.STORAGE_GRAPH_SAMPLING);
    });
    this.ui.graphSampling.addEventListener("change", () => {
      this.ui.graphSampling.value = this.clampInputValue(this.ui.graphSampling, this.graphSampling);
      this.saveNumericValue(this.ui.graphSampling, App.STORAGE_GRAPH_SAMPLING, {normalize: true});
      this.redrawStatsGraphs();
    });
    this.setUpGraphToggle(this.ui.graphToggles.input, App.STORAGE_INPUT_GRAPH_VISIBLE);
    this.setUpGraphToggle(this.ui.graphToggles.speed, App.STORAGE_SPEED_GRAPH_VISIBLE);
    this.setUpGraphToggle(this.ui.graphToggles.frameRate, App.STORAGE_FRAME_RATE_GRAPH_VISIBLE);
    this.setUpGraphToggle(this.ui.graphToggles.buffer, App.STORAGE_BUFFER_GRAPH_VISIBLE);
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
    this.ui.displayLayout.addEventListener("change", () => {
      if (this.guerillaModeActive) {
        this.forceGuerillaDisplayLayout();
        return;
      }
      this.saveControlValue(this.ui.displayLayout, App.STORAGE_DISPLAY_LAYOUT);
      this.updateDisplayLayoutState();
      this.updateCanvasDisplaySize();
      this.refreshWallDisplays();
    });
    this.ui.wallGap.addEventListener("input", () => {
      this.saveWallGap();
      this.updateWallGapState();
      this.refreshWallDisplays();
    });
    this.ui.wallGap.addEventListener("change", () => {
      this.ui.wallGap.value = this.clampWallGapValue(this.wallGapMillimeters);
      this.saveWallGap();
      this.updateWallGapState();
      this.refreshWallDisplays();
    });
    this.ui.directionMode.addEventListener("change", () => {
      this.saveControlValue(this.ui.directionMode, App.STORAGE_DIRECTION_MODE);
      this.updateCanvasDisplaySize();
      this.refreshWallDisplays();
    });
    this.ui.revealMode.addEventListener("change", () => {
      this.saveControlValue(this.ui.revealMode, App.STORAGE_REVEAL_MODE);
      if (this.revealMode === "immediate") this.drawPixelRevealBands();
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
    this.ui.quitKioskButton.addEventListener("click", () => this.quitKiosk());
    document.addEventListener("fullscreenchange", () => {
      this.updateFullscreenButtonLabel();
      this.updateKioskControls();
      this.updateCanvasDisplaySize();
    });
    window.addEventListener("resize", () => this.updateKioskControls());
    this.updateFullscreenButtonLabel();
    this.updateKioskControls();

    this.setUpDragInput(this.ui.brightness, () => {
      this.saveNumericValue(this.ui.brightness, App.STORAGE_BRIGHTNESS);
      this.syncGuerillaControl(this.ui.guerillaBrightness, this.ui.brightness);
      this.updateCommandPreview();
    }, {pixelsPerStep: 20});
    this.setUpDragInput(this.ui.contrast, () => {
      this.saveNumericValue(this.ui.contrast, App.STORAGE_CONTRAST);
      this.syncGuerillaControl(this.ui.guerillaContrast, this.ui.contrast);
      this.updateCommandPreview();
    }, {pixelsPerStep: 20});
    this.setUpGuerillaNumberControl(this.ui.guerillaBrightness, this.ui.brightness, App.STORAGE_BRIGHTNESS);
    this.setUpGuerillaNumberControl(this.ui.guerillaContrast, this.ui.contrast, App.STORAGE_CONTRAST);

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
      this.syncGuerillaControl(this.ui.guerillaBrightness, this.ui.brightness);
      this.updateCommandPreview();
    });
    this.ui.contrast.addEventListener("input", () => {
      this.saveNumericValue(this.ui.contrast, App.STORAGE_CONTRAST);
      this.syncGuerillaControl(this.ui.guerillaContrast, this.ui.contrast);
      this.updateCommandPreview();
    });
    this.ui.width.addEventListener("change", () => {
      this.ui.width.value = this.clampScanDimensionValue(this.ui.width, this.scanWidth || 0);
      this.saveScanWidth();
      this.updateExpectedImageSize();
      this.updateCommandPreview();
    });
    this.ui.height.addEventListener("change", () => {
      this.ui.height.value = this.clampScanDimensionValue(this.ui.height, this.scanHeight || 0);
      this.saveScanHeight();
      this.updateExpectedImageSize();
      this.updateCommandPreview();
    });
    this.ui.brightness.addEventListener("change", () => {
      this.ui.brightness.value = this.clampInputValue(this.ui.brightness, this.brightness);
      this.saveNumericValue(this.ui.brightness, App.STORAGE_BRIGHTNESS, {normalize: true});
      this.syncGuerillaControl(this.ui.guerillaBrightness, this.ui.brightness);
      this.updateCommandPreview();
    });
    this.ui.contrast.addEventListener("change", () => {
      this.ui.contrast.value = this.clampInputValue(this.ui.contrast, this.contrast);
      this.saveNumericValue(this.ui.contrast, App.STORAGE_CONTRAST, {normalize: true});
      this.syncGuerillaControl(this.ui.guerillaContrast, this.ui.contrast);
      this.updateCommandPreview();
    });
    this.setUpEnterToValidateParameters();

    this.updateExpectedImageSize();
    this.updateCommandPreview();
    this.updateScanButtonState();
    this.updateRenderSpeedState();
    this.updateWallGapState();
    this.updateAutoHideState();
    this.updateAutoScanState();
    this.updateOverlayGridState();
    this.updateAuxiliaryOverlayVisibility();
    this.updateScannerAvailability();
    this.refreshScanHistory();
    this.connectEventStream();
    setInterval(() => this.updateScannerAvailability(), 5000);
    this.scheduleDisplayFrameMonitor();
    this.scheduleUiAutoHide();

  }

  updateVersionLabels() {
    fetch(`${this.serverUrl}/about`)
      .then(response => response.ok ? response.json() : undefined)
      .then(data => {
        if (!data?.version) return;
        document.querySelectorAll("[data-app-version]").forEach(element => {
          element.innerText = `v${data.version}`;
        });
      })
      .catch(() => {
        // Keep the interface usable if the version endpoint is temporarily unavailable.
      });
  }

  connectEventStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    if (!window.EventSource) {
      this.addTopInfoMessage("Client", "Server events unavailable");
      return;
    }

    this.lastSystemStatus = undefined;
    this.eventSource = new EventSource(this.serverUrl + "/events");

    this.eventSource.addEventListener("osc", event => {
      try {
        this.handleSseOscMessage(JSON.parse(event.data));
      } catch (err) {
        this.addTopInfoMessage("Client", "Invalid server event", "error");
      }
    });
  }

  handleSseOscMessage(message) {
    if (!message || typeof message.address !== "string") return;

    if (message.address === "/system/status") {
      const status = this.getOscArgValue(message.args, 0);
      if (status === this.lastSystemStatus) return;
      this.lastSystemStatus = status;
      const statusKind = Number(status) === 1
        ? "success"
        : Number(status) === 0
          ? "error"
          : "";
      this.addTopInfoMessage("Server sent", this.formatSseOscMessage(message), statusKind);
      return;
    }

    if (this.isSensorTouchActiveMessage(message)) {
      this.startScanIfAvailable();
    }

    this.addTopInfoMessage("Server sent", this.formatSseOscMessage(message));
  }

  isSensorTouchActiveMessage(message) {
    if (!App.SENSOR_TOUCH_ADDRESS_PATTERN.test(message.address)) return false;

    const value = this.getOscArgValue(message.args, 0);
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return ["1", "true", "yes", "on"].includes(normalized);
    }

    return false;
  }

  getOscArgValue(args, index) {
    if (!Array.isArray(args) || !args[index]) return undefined;
    return args[index].value;
  }

  formatSseOscMessage(message) {
    const values = Array.isArray(message.args)
      ? message.args.map(arg => arg?.value).filter(value => value !== undefined)
      : [];

    return values.length > 0
      ? `${message.address} ${values.join(" ")}`
      : message.address;
  }

  addTopInfoMessage(source, message, kind = "") {
    const text = source ? `${source}: ${message}` : message;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    this.topInfoLog.push({timestamp, text, kind});
    if (this.topInfoLog.length > App.TOP_INFO_LOG_LIMIT) this.topInfoLog.shift();

    this.setTopInfoMessage(text, kind);
    this.renderTopInfoLog();
  }

  setTopInfoMessage(message, kind = "") {
    if (!this.ui.topInfoMessage) return;
    this.ui.topInfoMessage.innerText = message;
    this.ui.topInfoMessage.classList.toggle("success", kind === "success");
    this.ui.topInfoMessage.classList.toggle("error", kind === "error");
  }

  toggleTopInfoLog() {
    this.setTopInfoLogVisible(!this.topInfoLogVisible);
    this.renderTopInfoLog();
  }

  setTopInfoLogVisible(isVisible) {
    this.topInfoLogVisible = isVisible;
    this.ui.topInfoLog.classList.toggle("hidden", !this.topInfoLogVisible);
    this.ui.topInfoMessageZone.classList.toggle("open", this.topInfoLogVisible);
    this.ui.topInfoLogToggle.classList.toggle("open", this.topInfoLogVisible);
    this.ui.topInfoLogToggle.setAttribute(
      "aria-label",
      this.topInfoLogVisible ? "Hide message log" : "Show message log"
    );
  }

  handleTopInfoOutsidePointerDown(event) {
    if (!this.topInfoLogVisible) return;
    if (this.ui.topInfoMessageZone.contains(event.target)) return;
    this.setTopInfoLogVisible(false);
  }

  renderTopInfoLog() {
    if (!this.ui.topInfoLog) return;
    this.ui.topInfoLog.innerHTML = "";

    if (this.topInfoLog.length === 0) {
      const empty = document.createElement("span");
      empty.className = "top-info-log-empty";
      empty.innerText = "No messages";
      this.ui.topInfoLog.appendChild(empty);
      return;
    }

    this.topInfoLog.slice().reverse().forEach(entry => {
      const row = document.createElement("span");
      row.className = "top-info-log-row";
      row.classList.toggle("success", entry.kind === "success");
      row.classList.toggle("error", entry.kind === "error");

      const time = document.createElement("span");
      time.className = "top-info-log-time";
      time.innerText = entry.timestamp;

      const message = document.createElement("span");
      message.className = "top-info-log-message";
      message.innerText = entry.text;

      row.append(time, message);
      this.ui.topInfoLog.appendChild(row);
    });
  }

  async refreshScanHistory({currentFilename = undefined} = {}) {
    try {
      const response = await fetch(this.serverUrl + "/scans");
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      this.scanHistory = Array.isArray(data.scans) ? data.scans : [];

      if (currentFilename) {
        const currentIndex = this.scanHistory.findIndex(scan => scan.filename === currentFilename);
        this.scanHistoryIndex = currentIndex >= 0 ? currentIndex : this.scanHistory.length;
        this.setScanHistoryFilename(currentFilename);
      } else if (this.scanHistoryIndex === undefined) {
        this.scanHistoryIndex = this.scanHistory.length;
      } else {
        this.scanHistoryIndex = this.clamp(this.scanHistoryIndex, 0, this.scanHistory.length);
      }
      this.updateScanHistoryFilename();
    } catch (err) {
      this.scanHistory = [];
      this.scanHistoryIndex = undefined;
      this.setScanHistoryFilename("");
    }

    this.updateScanHistoryButtons();
  }

  async showPreviousSavedScan() {
    await this.ensureScanHistoryLoaded();
    if (this.scanHistory.length === 0) return;

    const index = this.scanHistoryIndex === undefined
      ? this.scanHistory.length - 1
      : this.scanHistoryIndex - 1;
    this.showSavedScanAt(index);
  }

  async showFirstSavedScan() {
    await this.ensureScanHistoryLoaded();
    if (this.scanHistory.length === 0) return;

    this.showSavedScanAt(0);
  }

  async showLastSavedScan() {
    await this.ensureScanHistoryLoaded();
    if (this.scanHistory.length === 0) return;

    this.showSavedScanAt(this.scanHistory.length - 1);
  }

  async showNextSavedScan() {
    await this.ensureScanHistoryLoaded();
    if (this.scanHistory.length === 0 || this.scanHistoryIndex === undefined) return;

    this.showSavedScanAt(this.scanHistoryIndex + 1);
  }

  async ensureScanHistoryLoaded() {
    if (this.scanHistory.length === 0) await this.refreshScanHistory();
  }

  showSavedScanAt(index) {
    if (index < 0 || index >= this.scanHistory.length) {
      this.hideScanHistoryImage();
      this.scanHistoryIndex = this.clamp(index, 0, this.scanHistory.length);
      this.updateScanHistoryButtons();
      return;
    }

    const scan = this.scanHistory[index];
    this.scanHistoryIndex = index;
    this.ui.scanHistoryImage.src = this.serverUrl + "/scans/" + encodeURIComponent(scan.filename);
    this.ui.scanHistoryImage.classList.remove("hidden");
    this.setScanHistoryFilename(scan.filename);
    document.documentElement.classList.add("scan-history-visible");
    this.updateScanHistoryButtons();
  }

  hideScanHistoryImage() {
    if (!this.ui.scanHistoryImage) return;
    this.ui.scanHistoryImage.classList.add("hidden");
    this.ui.scanHistoryImage.removeAttribute("src");
    this.setScanHistoryFilename("");
    document.documentElement.classList.remove("scan-history-visible");
  }

  setScanHistoryFilename(filename) {
    if (!this.ui.scanHistoryFilename) return;
    this.ui.scanHistoryFilename.innerText = filename || "No Image";
  }

  updateScanHistoryFilename() {
    if (
      this.scanHistory.length === 0 ||
      this.scanHistoryIndex === undefined ||
      this.scanHistoryIndex < 0 ||
      this.scanHistoryIndex >= this.scanHistory.length
    ) {
      this.setScanHistoryFilename("");
      return;
    }

    this.setScanHistoryFilename(this.scanHistory[this.scanHistoryIndex]?.filename || "");
  }

  updateScanHistoryButtons() {
    if (!this.ui.firstScanButton || !this.ui.previousScanButton || !this.ui.nextScanButton || !this.ui.lastScanButton) return;

    const index = this.scanHistoryIndex ?? this.scanHistory.length;
    const cannotMoveBack = this.scanHistory.length === 0 || index <= 0;
    const cannotMoveForward = this.scanHistory.length === 0 || index >= this.scanHistory.length - 1;
    this.ui.firstScanButton.disabled = cannotMoveBack;
    this.ui.previousScanButton.disabled = cannotMoveBack;
    this.ui.nextScanButton.disabled = cannotMoveForward;
    this.ui.lastScanButton.disabled = cannotMoveForward;
  }

  setUpEnterToValidateParameters() {
    const fields = [
      ...this.ui.controlsPanel.querySelectorAll("input:not([type='checkbox']), select"),
      ...this.ui.renderStats.querySelectorAll("input:not([type='checkbox']), select")
    ];
    fields.forEach(field => {
      field.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        field.dispatchEvent(new Event("change", {bubbles: true}));
        field.blur();
      });
    });
  }

  isTypingInField(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    return target.isContentEditable ||
      tagName === "input" ||
      tagName === "select" ||
      tagName === "textarea";
  }

  startScanIfAvailable() {
    if (!this.canStartScan()) return;
    this.getImage();
  }

  activateScanButton() {
    if (this.isScanActive()) {
      this.cancelScan();
      return;
    }

    this.startScanIfAvailable();
  }

  canStartScan() {
    return this.isChannelValid &&
      !this.channelOutOfBounds &&
      this.state !== App.STATE_REQUEST_SENT &&
      this.state !== App.STATE_HEADER_PARSED;
  }

  toggleUiOverlay() {
    this.setUiOverlayVisible(!this.isUiOverlayVisible());
  }

  setUiOverlayVisible(isVisible, {persist = true} = {}) {
    document.documentElement.classList.toggle("ui-overlay-hidden", !isVisible);
    this.ui.controlsPanel.classList.toggle("hidden", !isVisible);
    this.ui.topInfoPanel.classList.toggle("hidden", !isVisible);
    if (isVisible) {
      this.scheduleUiAutoHide();
    } else {
      this.cancelUiAutoHide();
    }
    if (persist) {
      try {
        this.writeStorageValue(App.STORAGE_UI_OVERLAY_VISIBLE, isVisible ? "true" : "false");
      } catch (err) {
        // Keep the interface usable if localStorage is unavailable.
      }
    }
    this.updateAuxiliaryOverlayVisibility();
  }

  handleMouseActivity() {
    if (this.guerillaModeActive) return;

    if (!this.isUiOverlayVisible()) {
      this.setUiOverlayVisible(true);
      return;
    }

    this.scheduleUiAutoHide();
  }

  scheduleUiAutoHide() {
    this.cancelUiAutoHide();
    if (!this.ui.controlsPanel || !this.isUiOverlayVisible()) return;
    if (!this.autoHideEnabled) return;
    if (!this.ui.autoHideSeconds) return;

    const delay = this.autoHideSeconds * 1000;
    if (delay <= 0) return;

    this.autoHideTimer = setTimeout(() => {
      this.setUiOverlayVisible(false);
    }, delay);
  }

  cancelUiAutoHide() {
    if (this.autoHideTimer === undefined) return;
    clearTimeout(this.autoHideTimer);
    this.autoHideTimer = undefined;
  }

  updateAutoHideState() {
    const isDisabled = !this.autoHideEnabled;
    this.ui.autoHideSeconds.disabled = isDisabled;
    this.ui.autoHideSecondsRow.classList.toggle("disabled", isDisabled);
    if (isDisabled) {
      this.cancelUiAutoHide();
    } else {
      this.scheduleUiAutoHide();
    }
  }

  scheduleAutoScan() {
    this.cancelAutoScan();
    if (!this.autoScanEnabled) return;

    const delay = this.autoScanSeconds * 1000;
    if (delay <= 0) return;

    this.autoScanTargetTime = Date.now() + delay;
    this.updateAutoScanCountdownDisplay();
    this.autoScanCountdownTimer = setInterval(
      () => this.updateAutoScanCountdownDisplay(),
      250
    );
    this.autoScanTimer = setTimeout(() => {
      this.startScanIfAvailable();
      this.scheduleAutoScan();
    }, delay);
  }

  cancelAutoScan() {
    if (this.autoScanTimer !== undefined) clearTimeout(this.autoScanTimer);
    if (this.autoScanCountdownTimer !== undefined) clearInterval(this.autoScanCountdownTimer);
    this.autoScanTimer = undefined;
    this.autoScanCountdownTimer = undefined;
    this.autoScanTargetTime = undefined;
  }

  updateAutoScanState() {
    const isDisabled = !this.autoScanEnabled;
    this.ui.autoScanSeconds.disabled = isDisabled;
    this.ui.autoScanSecondsRow.classList.toggle("disabled", isDisabled);
    if (isDisabled) {
      this.cancelAutoScan();
    } else {
      this.scheduleAutoScan();
    }
    this.updateScanButtonState();
  }

  updateAutoScanCountdownDisplay() {
    if (!this.autoScanEnabled || this.autoScanTargetTime === undefined) return;

    const secondsRemaining = Math.max(
      0,
      Math.ceil((this.autoScanTargetTime - Date.now()) / 1000)
    );
    this.ui.scanButton.innerText = `Next scan: ${secondsRemaining}s`;
  }

  updateAuxiliaryOverlayVisibility() {
    const isUiOverlayVisible = this.isUiOverlayVisible();
    const areParametersVisible = isUiOverlayVisible && !this.ui.controlsPanel.classList.contains("hidden");
    const isStatsVisible = isUiOverlayVisible && this.ui.debugToggle.checked;

    this.renderStatsVisible = isStatsVisible;
    this.ui.commandPanel.classList.toggle("hidden", !areParametersVisible);
    this.ui.renderStats.classList.toggle("hidden", !isStatsVisible);
    if (isStatsVisible) this.updateRenderStats();
  }

  updateScanButtonState() {
    if (this.isScanActive()) {
      this.ui.scanButton.disabled = false;
      this.setScanButtonLabel("Cancel");
      return;
    }

    if (this.cancelInProgress) {
      this.ui.scanButton.disabled = true;
      this.ui.scanButton.innerText = "Cancelling...";
      return;
    }

    this.ui.scanButton.disabled = this.autoScanEnabled || !this.canStartScan();
    if (this.autoScanEnabled) {
      this.updateAutoScanCountdownDisplay();
    } else {
      this.setScanButtonLabel("Scan");
    }
  }

  setScanButtonLabel(label) {
    this.ui.scanButton.replaceChildren(
      document.createTextNode(`${label} `),
      Object.assign(document.createElement("span"), {
        className: "button-shortcut",
        innerText: "(S)"
      })
    );
  }

  async updateScannerAvailability() {
    try {
      const response = await fetch(this.serverUrl + "/scanners");
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

  updateWallGapState() {
    const isWall = this.isWallDisplayLayout;
    const gapPixels = Math.max(0, this.wallGapPixels);

    this.ui.wallGapRow.classList.toggle("hidden", !isWall);
    this.ui.wallGapPixels.innerText = `${Math.round(gapPixels)} px`;
  }

  updateOverlayGridState() {
    const isDisabled = !this.overlayGridEnabled;
    const spacing = this.clampInputValue(this.ui.overlayGridSpacing, this.overlayGridSpacing);
    const useWallGrid = !isDisabled && this.isWallDisplayLayout;

    this.ui.overlayGridSpacing.disabled = isDisabled;
    this.ui.overlayGridRow.classList.toggle("disabled", isDisabled);
    this.ui.overlayGrid.classList.toggle("hidden", isDisabled || useWallGrid);
    this.ui.wallGrid.classList.toggle("hidden", isDisabled || !useWallGrid);
    this.ui.overlayGrid.style.setProperty("--grid-spacing", `${spacing}px`);
    this.ui.wallGrid.style.setProperty("--grid-spacing", `${spacing}px`);
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
    this.refreshWallDisplays();
  }

  updateCanvasDisplaySize() {
    if (!this.displayPixelWidth || !this.displayPixelHeight) return;

    if (this.isWallDisplayLayout) {
      this.canvas.style.left = "";
      this.canvas.style.right = "";
      this.canvas.style.height = "";
      this.canvas.style.transform = "";
      this.updateWallDisplaySize();
      return;
    }

    this.updateWallDisplaySize();

    const availableWidth = Math.max(1, window.innerWidth);
    const availableHeight = Math.max(1, window.innerHeight);
    const canvasRatio = this.displayPixelWidth / this.displayPixelHeight;
    const isCanvasLandscape = canvasRatio >= 1;
    const isViewportLandscape = availableWidth >= availableHeight;
    const shouldRotate = isCanvasLandscape !== isViewportLandscape;

    const cssHeight = shouldRotate
      ? Math.min(availableWidth, availableHeight / canvasRatio)
      : Math.min(availableHeight, availableWidth / canvasRatio);
    const baseAngle = shouldRotate ? 270 : 180;
    const directionOffset = this.directionMode === "rotated" ? 180 : 0;
    const angle = (baseAngle + directionOffset) % 360;

    if (this.isGuerillaDisplayLayout) {
      const cssWidth = cssHeight * canvasRatio;
      const visualWidth = angle % 180 === 0 ? cssWidth : cssHeight;
      const centerX = availableWidth - visualWidth / 2;
      this.canvas.style.left = `${centerX}px`;
      this.canvas.style.right = "";
      this.canvas.style.height = Math.max(1, cssHeight) + "px";
      this.canvas.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
      return;
    }

    this.canvas.style.left = "50%";
    this.canvas.style.right = "";
    this.canvas.style.height = Math.max(1, cssHeight) + "px";
    this.canvas.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
  }

  updateWallDisplaySize() {
    if (!this.ui.wallDisplay || !this.ui.wallGrid) return;

    const displays = [this.ui.wallDisplay, this.ui.wallGrid];
    if (!this.isWallDisplayLayout) {
      displays.forEach(display => {
        display.style.width = "";
        display.style.height = "";
      });
      return;
    }

    const availableWidth = Math.max(1, window.innerWidth);
    const availableHeight = Math.max(1, window.innerHeight);
    const wallRatio = this.wallDisplayAspectRatio;
    const viewportRatio = availableWidth / availableHeight;
    const width = viewportRatio > wallRatio
      ? availableHeight * wallRatio
      : availableWidth;
    const height = viewportRatio > wallRatio
      ? availableHeight
      : availableWidth / wallRatio;

    displays.forEach(display => {
      display.style.width = `${Math.round(width)}px`;
      display.style.height = `${Math.round(height)}px`;
    });
  }

  updateDisplayLayoutState() {
    const isWall = this.isWallDisplayLayout;
    document.documentElement.classList.toggle("display-layout-wall", isWall);
    document.documentElement.classList.toggle("display-layout-wall-4", this.displayLayout === "wall-4-horizontal");
    document.documentElement.classList.toggle("display-layout-wall-8", this.displayLayout === "wall-8-horizontal");
    document.documentElement.classList.toggle("display-layout-guerilla", this.isGuerillaDisplayLayout);
    if (this.ui.wallDisplay) {
      this.ui.wallDisplay.classList.toggle("hidden", !isWall);
      this.ui.wallDisplay.setAttribute("aria-hidden", isWall ? "false" : "true");
    }
    this.updateWallGapState();
    this.updateOverlayGridState();
  }

  refreshWallDisplaysForRows(startRow = 0, rowCount = this.canvas.height) {
    if (!this.isWallDisplayLayout || rowCount <= 0 || this.canvas.height <= 0) return;

    const sourcePaddingRows = 2;
    const sourceStartRow = this.clamp(startRow - sourcePaddingRows, 0, this.canvas.height);
    const sourceEndRow = this.clamp(startRow + rowCount + sourcePaddingRows, 0, this.canvas.height);
    const sourceRowCount = sourceEndRow - sourceStartRow;
    if (sourceRowCount <= 0) return;

    const dirtyRect = this.getWallDirtyRectForSourceRows(sourceStartRow, sourceRowCount);
    if (!dirtyRect) return;

    const sourceCanvas = this.getWallRowBandCanvas(sourceStartRow, sourceRowCount);
    if (!sourceCanvas) return;

    const geometry = this.getWallGeometry();
    if (!geometry) return;

    this.activeWallOutputs.forEach((output, index) => {
      const outputRect = this.getWallOutputRect(index, geometry);
      if (!outputRect) return;

      const localRect = this.intersectRects(
        dirtyRect,
        outputRect
      );
      if (!localRect) return;

      this.refreshWallDisplayRect(index, {
        x: localRect.x - outputRect.x,
        y: localRect.y - outputRect.y,
        width: localRect.width,
        height: localRect.height,
        sourceStartRow,
        sourceRowCount,
        sourceCanvas
      });
    });
  }

  getWallRowBandCanvas(startRow, rowCount) {
    const sourceWidth = this.canvas.width;
    if (!this.imageData?.data || !sourceWidth || rowCount <= 0) return undefined;

    if (this.wallRowBandCanvas.width !== sourceWidth) this.wallRowBandCanvas.width = sourceWidth;
    if (this.wallRowBandCanvas.height !== rowCount) {
      this.wallRowBandCanvas.height = rowCount;
      this.wallRowBandImageData = undefined;
    }
    if (!this.wallRowBandImageData ||
      this.wallRowBandImageData.width !== sourceWidth ||
      this.wallRowBandImageData.height !== rowCount) {
      this.wallRowBandImageData = this.wallRowBandContext.createImageData(sourceWidth, rowCount);
    }

    const rowBytes = sourceWidth * 4;
    const sourceOffset = startRow * rowBytes;
    const byteCount = rowCount * rowBytes;
    this.wallRowBandImageData.data.set(this.imageData.data.subarray(sourceOffset, sourceOffset + byteCount));
    this.wallRowBandContext.putImageData(this.wallRowBandImageData, 0, 0);
    return this.wallRowBandCanvas;
  }

  getWallGeometry(sourceWidth = this.canvas.width, sourceHeight = this.canvas.height) {
    if (!sourceWidth || !sourceHeight || !this.isWallDisplayLayout) return undefined;

    const outputWidth = 1920;
    const outputHeight = 1080;
    const outputCount = this.wallOutputCount;
    const monitorWidth = outputWidth * outputCount;
    const monitorHeight = outputHeight;
    const canvasRatio = sourceWidth / sourceHeight;
    const wallRatio = monitorWidth / monitorHeight;
    const shouldRotate = (canvasRatio >= 1) !== (wallRatio >= 1);
    const orientedWidth = shouldRotate ? sourceHeight : sourceWidth;
    const orientedHeight = shouldRotate ? sourceWidth : sourceHeight;
    const requestedGapPixels = Math.max(0, this.wallGapPixels);
    const gapX = outputCount > 1
      ? Math.min(requestedGapPixels, Math.max(0, (orientedWidth - outputCount) / (outputCount - 1)))
      : 0;
    const gapY = 0;
    const visibleOrientedWidth = Math.max(1, orientedWidth - gapX * (outputCount - 1));
    const visibleOrientedHeight = orientedHeight;
    const scale = Math.max(monitorWidth / visibleOrientedWidth, monitorHeight / visibleOrientedHeight);
    const virtualWidth = monitorWidth + gapX * (outputCount - 1) * scale;
    const virtualHeight = monitorHeight;
    const drawnWidth = orientedWidth * scale;
    const drawnHeight = orientedHeight * scale;

    return {
      outputWidth,
      outputHeight,
      outputCount,
      monitorWidth,
      monitorHeight,
      virtualWidth,
      virtualHeight,
      canvasRatio,
      wallRatio,
      shouldRotate,
      orientedWidth,
      orientedHeight,
      scale,
      gapX,
      gapY,
      gapDestinationX: gapX * scale,
      gapDestinationY: gapY * scale,
      drawnWidth,
      drawnHeight,
      left: (virtualWidth - drawnWidth) / 2,
      top: (virtualHeight - drawnHeight) / 2
    };
  }

  getWallOutputRect(index, geometry = this.getWallGeometry()) {
    if (!geometry) return undefined;

    return {
      x: index * (geometry.outputWidth + geometry.gapDestinationX),
      y: 0,
      width: geometry.outputWidth,
      height: geometry.outputHeight
    };
  }

  getWallDirtyRectForSourceRows(startRow, rowCount) {
    const sourceWidth = this.canvas.width;
    const sourceHeight = this.canvas.height;
    if (!sourceWidth || !sourceHeight) return undefined;

    const geometry = this.getWallGeometry(sourceWidth, sourceHeight);
    if (!geometry) return undefined;

    const endRow = startRow + rowCount;

    if (!geometry.shouldRotate) {
      return this.expandRectToPixels({
        x: geometry.left,
        y: geometry.top + startRow * geometry.scale,
        width: geometry.drawnWidth,
        height: rowCount * geometry.scale
      }, geometry.virtualWidth, geometry.virtualHeight);
    }

    const normalDirection = this.directionMode !== "rotated";
    const xStart = normalDirection
      ? geometry.left + startRow * geometry.scale
      : geometry.left + (sourceHeight - endRow) * geometry.scale;

    return this.expandRectToPixels({
      x: xStart,
      y: geometry.top,
      width: rowCount * geometry.scale,
      height: geometry.drawnHeight
    }, geometry.virtualWidth, geometry.virtualHeight);
  }

  expandRectToPixels(rect, maxWidth, maxHeight) {
    const x = this.clamp(Math.floor(rect.x) - 1, 0, maxWidth);
    const y = this.clamp(Math.floor(rect.y) - 1, 0, maxHeight);
    const right = this.clamp(Math.ceil(rect.x + rect.width) + 1, 0, maxWidth);
    const bottom = this.clamp(Math.ceil(rect.y + rect.height) + 1, 0, maxHeight);
    if (right <= x || bottom <= y) return undefined;
    return {x, y, width: right - x, height: bottom - y};
  }

  intersectRects(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    if (right <= x || bottom <= y) return undefined;
    return {x, y, width: right - x, height: bottom - y};
  }

  refreshWallDisplays() {
    if (!this.isWallDisplayLayout) return;
    this.ensureMainCanvasFromImageData();
    this.activeWallOutputs.forEach((output, index) => this.refreshWallDisplay(index));
  }

  clearWallDisplays() {
    this.wallOutputs.forEach(output => {
      output.context.clearRect(0, 0, output.canvas.width, output.canvas.height);
    });
  }

  refreshWallDisplay(index) {
    const output = this.wallOutputs[index];
    if (!output || !this.canvas.width || !this.canvas.height) return;

    const {canvas, context} = output;
    const geometry = this.getWallGeometry();
    const outputRect = this.getWallOutputRect(index, geometry);
    if (!geometry || !outputRect) return;

    const width = geometry.outputWidth;
    const height = geometry.outputHeight;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(-outputRect.x, -outputRect.y);
    this.drawSourceCanvasInVirtualWall(context, geometry);
    context.restore();
  }

  refreshWallDisplayRect(index, rect) {
    const output = this.wallOutputs[index];
    if (!output || !this.canvas.width || !this.canvas.height) return;

    const {canvas, context} = output;
    const geometry = this.getWallGeometry();
    const outputRect = this.getWallOutputRect(index, geometry);
    if (!geometry || !outputRect) return;

    const width = geometry.outputWidth;
    const height = geometry.outputHeight;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();
    context.translate(-outputRect.x, -outputRect.y);
    this.drawSourceBandInVirtualWall(
      context,
      geometry,
      rect.sourceCanvas,
      rect.sourceStartRow,
      rect.sourceRowCount
    );
    context.restore();
  }

  drawSourceBandInVirtualWall(context, geometry, sourceCanvas, startRow, rowCount) {
    const sourceWidth = this.canvas.width;
    const sourceHeight = this.canvas.height;
    if (!sourceWidth || !sourceHeight || !geometry || !sourceCanvas || rowCount <= 0) return;

    const baseAngle = geometry.shouldRotate ? 270 : 180;
    const directionOffset = this.directionMode === "rotated" ? 180 : 0;
    const angle = (baseAngle + directionOffset) % 360;

    context.imageSmoothingEnabled = true;
    context.translate(geometry.virtualWidth / 2, geometry.virtualHeight / 2);
    context.rotate(angle * Math.PI / 180);
    context.scale(geometry.scale, geometry.scale);
    context.drawImage(
      sourceCanvas,
      0,
      0,
      sourceWidth,
      rowCount,
      -sourceWidth / 2,
      startRow - sourceHeight / 2,
      sourceWidth,
      rowCount
    );
  }

  drawSourceCanvasInVirtualWall(context, geometry) {
    const sourceWidth = this.canvas.width;
    const sourceHeight = this.canvas.height;
    if (!sourceWidth || !sourceHeight || !geometry) return;

    const baseAngle = geometry.shouldRotate ? 270 : 180;
    const directionOffset = this.directionMode === "rotated" ? 180 : 0;
    const angle = (baseAngle + directionOffset) % 360;

    context.imageSmoothingEnabled = true;
    context.translate(geometry.virtualWidth / 2, geometry.virtualHeight / 2);
    context.rotate(angle * Math.PI / 180);
    context.scale(geometry.scale, geometry.scale);
    context.drawImage(this.canvas, -sourceWidth / 2, -sourceHeight / 2);
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
        const visualLeft = this.clamp(moveEvent.clientX - offsetX, 0, Math.max(0, window.innerWidth - rect.width));
        const visualTop = this.clamp(moveEvent.clientY - offsetY, 0, Math.max(0, window.innerHeight - rect.height));
        this.setPanelVisualPosition(panel, visualLeft, visualTop);
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
    this.setUpPanelBottomResize(panel, storageKey, onResize);
    this.setUpPanelCornerResize(panel, storageKey, onResize);
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

  setUpPanelBottomResize(panel, storageKey = App.STORAGE_PARAMETERS_POSITION, onResize = undefined) {
    const handle = document.createElement("div");
    handle.className = "panel-bottom-resize-handle";
    handle.setAttribute("aria-hidden", "true");
    panel.appendChild(handle);

    handle.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();

      const startRect = panel.getBoundingClientRect();
      const startY = event.clientY;
      handle.setPointerCapture(event.pointerId);

      const onPointerMove = moveEvent => {
        this.resizePanelToVisualSize(
          panel,
          startRect.left,
          startRect.top,
          startRect.width,
          startRect.height + moveEvent.clientY - startY,
          onResize
        );
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

  setUpPanelCornerResize(panel, storageKey = App.STORAGE_PARAMETERS_POSITION, onResize = undefined) {
    const handle = document.createElement("div");
    handle.className = "panel-corner-resize-handle";
    handle.setAttribute("aria-hidden", "true");
    panel.appendChild(handle);

    handle.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();

      const startRect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      handle.setPointerCapture(event.pointerId);

      const onPointerMove = moveEvent => {
        this.resizePanelToVisualSize(
          panel,
          startRect.left,
          startRect.top,
          startRect.width + moveEvent.clientX - startX,
          startRect.height + moveEvent.clientY - startY,
          onResize
        );
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

  resizePanelToVisualSize(panel, visualLeft, visualTop, visualWidth, visualHeight, onResize = undefined) {
    const rotation = this.getPanelRotation(panel);
    const minCssWidth = 280;
    const minCssHeight = 220;
    const minVisualWidth = rotation === 90 || rotation === 270 ? minCssHeight : minCssWidth;
    const minVisualHeight = rotation === 90 || rotation === 270 ? minCssWidth : minCssHeight;
    const width = this.clamp(visualWidth, minVisualWidth, Math.max(minVisualWidth, window.innerWidth - visualLeft));
    const height = this.clamp(visualHeight, minVisualHeight, Math.max(minVisualHeight, window.innerHeight - visualTop));

    if (rotation === 90 || rotation === 270) {
      panel.style.width = `${height}px`;
      panel.style.height = `${width}px`;
    } else {
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
    }

    this.setPanelVisualPosition(panel, visualLeft, visualTop);
    if (onResize) onResize();
  }

  restorePanelPosition(panel, storageKey = App.STORAGE_PARAMETERS_POSITION) {
    try {
      const position = JSON.parse(this.readStorageValue(storageKey)) || {};

      requestAnimationFrame(() => {
        const rect = panel.getBoundingClientRect();
        const usableBounds = this.getPanelUsableVerticalBounds();
        const width = this.clamp(position.width || rect.width, 280, Math.max(280, window.innerWidth - 16));
        const minHeight = Math.min(220, usableBounds.height);
        const height = this.clamp(position.height || rect.height, minHeight, usableBounds.height);
        panel.style.width = width + "px";
        panel.style.height = height + "px";
        const visualSize = this.getPanelVisualSize(panel);
        const left = this.clamp(position.left ?? rect.left, 0, Math.max(0, window.innerWidth - visualSize.width));
        const top = this.clamp(
          position.top ?? rect.top,
          panel === this.ui.guerillaPanel ? 0 : usableBounds.top,
          panel === this.ui.guerillaPanel
            ? Math.max(0, window.innerHeight - visualSize.height)
            : Math.max(usableBounds.top, usableBounds.bottom - visualSize.height)
        );
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        this.setPanelVisualPosition(panel, left, top);
        this.keepPanelFullyVisible(panel);
      });
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  getPanelRotation(panel) {
    if (panel.classList.contains("rotation-90")) return 90;
    if (panel.classList.contains("rotation-180")) return 180;
    if (panel.classList.contains("rotation-270")) return 270;
    return 0;
  }

  getPanelVisualOffset(panel) {
    const rotation = this.getPanelRotation(panel);
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;

    if (rotation === 90 || rotation === 270) {
      return {
        x: (width - height) / 2,
        y: (height - width) / 2
      };
    }

    return {x: 0, y: 0};
  }

  getPanelVisualSize(panel) {
    const rotation = this.getPanelRotation(panel);
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;

    return rotation === 90 || rotation === 270
      ? {width: height, height: width}
      : {width, height};
  }

  setPanelVisualPosition(panel, visualLeft, visualTop) {
    const offset = this.getPanelVisualOffset(panel);
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = `${visualLeft - offset.x}px`;
    panel.style.top = `${visualTop - offset.y}px`;
  }

  keepPanelFullyVisible(panel) {
    const rect = panel.getBoundingClientRect();
    const left = this.clamp(rect.left, 0, Math.max(0, window.innerWidth - rect.width));
    const top = this.clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height));
    this.setPanelVisualPosition(panel, left, top);
  }

  fitPanelFullyInsideViewport(panel) {
    const rect = panel.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth);
    const height = Math.min(rect.height, window.innerHeight);
    const left = this.clamp(rect.left, 0, Math.max(0, window.innerWidth - width));
    const top = this.clamp(rect.top, 0, Math.max(0, window.innerHeight - height));

    if (width !== rect.width || height !== rect.height) {
      this.resizePanelToVisualSize(panel, left, top, width, height);
      return;
    }

    this.setPanelVisualPosition(panel, left, top);
  }

  getPanelUsableVerticalBounds() {
    const margin = 8;
    let top = margin;
    let bottom = window.innerHeight - margin;
    const topInfoPanel = document.getElementById("top-info-panel");
    const commandPanel = document.getElementById("command-panel");

    if (topInfoPanel && !topInfoPanel.classList.contains("hidden")) {
      const rect = topInfoPanel.getBoundingClientRect();
      if (rect.height > 0) top = Math.max(top, Math.ceil(rect.bottom) + margin);
    }

    if (commandPanel && !commandPanel.classList.contains("hidden")) {
      const rect = commandPanel.getBoundingClientRect();
      if (rect.height > 0) bottom = Math.min(bottom, Math.floor(rect.top) - margin);
    }

    if (bottom - top < 120) {
      top = margin;
      bottom = window.innerHeight - margin;
    }

    return {
      top,
      bottom,
      height: Math.max(120, bottom - top)
    };
  }

  savePanelPosition(panel, storageKey = App.STORAGE_PARAMETERS_POSITION) {
    try {
      const rect = panel.getBoundingClientRect();
      this.writeStorageValue(storageKey, JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(panel.offsetWidth),
        height: Math.round(panel.offsetHeight)
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

  setUpGuerillaNumberControl(guerillaInput, sourceInput, storageKey) {
    const applyValue = value => {
      sourceInput.value = this.clampInputValue(sourceInput, value);
      this.saveNumericValue(sourceInput, storageKey, {normalize: true});
      this.syncGuerillaControl(guerillaInput, sourceInput);
      this.updateCommandPreview();
    };

    guerillaInput.addEventListener("input", () => applyValue(parseFloat(guerillaInput.value) || 0));
    guerillaInput.addEventListener("change", () => applyValue(parseFloat(guerillaInput.value) || 0));

    this.ui.guerillaPanel.querySelectorAll(`[data-guerilla-target="${sourceInput.id}"]`).forEach(button => {
      const step = parseFloat(button.dataset.step) || 0;
      let repeatDelay;
      let repeatInterval;

      const stepOnce = () => applyValue((parseFloat(sourceInput.value) || 0) + step);
      const stopRepeating = () => {
        clearTimeout(repeatDelay);
        clearInterval(repeatInterval);
      };

      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        stepOnce();
        repeatDelay = setTimeout(() => {
          repeatInterval = setInterval(stepOnce, 90);
        }, 350);
      });
      button.addEventListener("pointerup", stopRepeating);
      button.addEventListener("pointercancel", stopRepeating);
      button.addEventListener("lostpointercapture", stopRepeating);
    });
  }

  syncGuerillaControl(guerillaInput, sourceInput) {
    if (!guerillaInput || !sourceInput) return;
    guerillaInput.value = sourceInput.value;
  }

  syncGuerillaCheckbox(guerillaInput, sourceInput) {
    if (!guerillaInput || !sourceInput) return;
    guerillaInput.checked = sourceInput.checked;
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

  clampScanDimensionValue(input, value) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    return this.clamp(value, min, max);
  }

  clampWallGapValue(value) {
    const min = parseFloat(this.ui.wallGap.min);
    const max = parseFloat(this.ui.wallGap.max);
    return this.clamp(value, min, max);
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

  storageKey(storageKey) {
    return storageKey.replace(/^scanmeister\./, `scanmeister.${this.storageNamespace}.`);
  }

  readStorageValue(storageKey) {
    const value = localStorage.getItem(this.storageKey(storageKey));
    if (value !== null || this.storageNamespace !== App.STORAGE_NAMESPACE_NORMAL) return value;

    return localStorage.getItem(storageKey);
  }

  writeStorageValue(storageKey, value) {
    localStorage.setItem(this.storageKey(storageKey), value);
  }

  restoreSelectValue(select, storageKey) {
    try {
      const value = this.readStorageValue(storageKey);
      if (!value) return;

      const hasOption = Array.from(select.options).some(option => option.value === value);
      if (hasOption) select.value = value;
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreNumericValue(input, storageKey) {
    try {
      const value = this.readStorageValue(storageKey);
      if (value === null) return;

      const parsedValue = parseFloat(value);
      if (isNaN(parsedValue)) return;

      input.value = this.clampInputValue(input, parsedValue);
      this.writeStorageValue(storageKey, input.value);
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreWallGap() {
    try {
      const value = this.readStorageValue(App.STORAGE_WALL_GAP);
      const parsedValue = value === null ? parseFloat(App.DEFAULT_WALL_GAP) : parseFloat(value);
      this.ui.wallGap.value = this.clampWallGapValue(isNaN(parsedValue) ? 0 : parsedValue);
      this.writeStorageValue(App.STORAGE_WALL_GAP, this.ui.wallGap.value);
    } catch (err) {
      this.ui.wallGap.value = App.DEFAULT_WALL_GAP;
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreTextValue(input, storageKey, defaultValue = "") {
    try {
      const value = this.readStorageValue(storageKey);
      input.value = value || defaultValue;
      this.writeStorageValue(storageKey, input.value);
    } catch (err) {
      if (!input.value) input.value = defaultValue;
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveControlValue(input, storageKey) {
    try {
      this.writeStorageValue(storageKey, input.value);
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveTextValue(input, storageKey, defaultValue = "") {
    try {
      this.writeStorageValue(storageKey, input.value.trim() || defaultValue);
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
      this.writeStorageValue(storageKey, storedValue);
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveWallGap() {
    try {
      const value = parseFloat(this.ui.wallGap.value);
      if (isNaN(value)) return;

      this.writeStorageValue(App.STORAGE_WALL_GAP, String(this.clampWallGapValue(value)));
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreCheckboxValue(input, storageKey, defaultValue = false) {
    try {
      const value = this.readStorageValue(storageKey);
      input.checked = value === null ? defaultValue : value === "true";
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreDrawMode() {
    try {
      const value = this.readStorageValue(App.STORAGE_DRAW_MODE);
      if (value === "clear" || value === "overlay") {
        this.ui.drawMode.value = value;
        return;
      }

      const oldValue = this.readStorageValue(App.STORAGE_CLEAR_CANVAS);
      this.ui.drawMode.value = oldValue === "false" ? "overlay" : "clear";
      this.writeStorageValue(App.STORAGE_DRAW_MODE, this.ui.drawMode.value);
    } catch (err) {
      this.ui.drawMode.value = "clear";
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreRenderMode() {
    try {
      const value = this.readStorageValue(App.STORAGE_RENDER_MODE);
      this.ui.renderMode.value = value === "speed" || value === "smooth" ? "speed" : "live";
      this.writeStorageValue(App.STORAGE_RENDER_MODE, this.ui.renderMode.value);
    } catch (err) {
      this.ui.renderMode.value = "live";
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreDisplayLayout() {
    try {
      const value = this.readStorageValue(App.STORAGE_DISPLAY_LAYOUT);
      if (value === "wall-4-horizontal" || value === "wall-8-horizontal") {
        this.ui.displayLayout.value = value;
      } else {
        this.ui.displayLayout.value = "single";
      }
      this.writeStorageValue(App.STORAGE_DISPLAY_LAYOUT, this.ui.displayLayout.value);
    } catch (err) {
      this.ui.displayLayout.value = "single";
      // Keep the interface usable if localStorage is unavailable.
    }
    this.updateDisplayLayoutState();
  }

  restoreDirectionMode() {
    try {
      const value = this.readStorageValue(App.STORAGE_DIRECTION_MODE);
      this.ui.directionMode.value = value === "rotated" ? "rotated" : "normal";
      this.writeStorageValue(App.STORAGE_DIRECTION_MODE, this.ui.directionMode.value);
    } catch (err) {
      this.ui.directionMode.value = "normal";
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreRevealMode() {
    try {
      const value = this.readStorageValue(App.STORAGE_REVEAL_MODE);
      this.ui.revealMode.value = this.isValidRevealMode(value) ? value : "immediate";
      this.writeStorageValue(App.STORAGE_REVEAL_MODE, this.ui.revealMode.value);
    } catch (err) {
      this.ui.revealMode.value = "immediate";
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  isValidRevealMode(value) {
    return value === "immediate" || value === "pixelate" || value === "glitchy-pixelate";
  }

  saveCheckboxValue(input, storageKey) {
    try {
      this.writeStorageValue(storageKey, input.checked ? "true" : "false");
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreUiOverlayVisibility() {
    const launchVisibility = this.getLaunchBooleanOverride("ui");
    if (launchVisibility !== undefined) {
      this.setUiOverlayVisible(launchVisibility, {persist: false});
      return;
    }

    try {
      const storedValue = this.readStorageValue(App.STORAGE_UI_OVERLAY_VISIBLE);
      if (storedValue !== null) this.setUiOverlayVisible(storedValue === "true");
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreGuerillaUiVisibility() {
    const launchVisibility = this.getLaunchBooleanOverride("guerilla");
    this.guerillaModeActive = launchVisibility === true;
    document.documentElement.classList.toggle("guerilla-mode", this.guerillaModeActive);
    this.ui.guerillaPanel.classList.toggle("hidden", !this.guerillaModeActive);
    if (this.guerillaModeActive) this.forceGuerillaDisplayLayout();
  }

  forceGuerillaDisplayLayout() {
    this.ui.displayLayout.value = "guerilla";
    this.ui.displayLayout.disabled = true;
    this.updateDisplayLayoutState();
    this.updateCanvasDisplaySize();
    this.refreshWallDisplays();
  }

  rotateGuerillaPanel() {
    const currentRotation = this.guerillaRotation;
    const rotation = (currentRotation + 90) % 360;
    this.setGuerillaRotation(rotation);

    try {
      this.writeStorageValue(App.STORAGE_GUERILLA_ROTATION, String(rotation));
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreGuerillaRotation() {
    try {
      this.setGuerillaRotation(parseInt(this.readStorageValue(App.STORAGE_GUERILLA_ROTATION), 10) || 0);
    } catch (err) {
      this.setGuerillaRotation(0);
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  setGuerillaRotation(rotation) {
    const normalizedRotation = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
    this.guerillaRotation = normalizedRotation;
    [0, 90, 180, 270].forEach(angle => {
      this.ui.guerillaPanel.classList.toggle(`rotation-${angle}`, normalizedRotation === angle);
    });
    requestAnimationFrame(() => this.fitPanelFullyInsideViewport(this.ui.guerillaPanel));
  }

  getLaunchBooleanOverride(name) {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(name)) return undefined;
    const value = params.get(name)?.toLowerCase();
    return value === "" || value === "1" || value === "true";
  }

  isUiOverlayVisible() {
    return !document.documentElement.classList.contains("ui-overlay-hidden");
  }

  restoreScanWidth() {
    try {
      const width = this.readStorageValue(App.STORAGE_SCAN_WIDTH) ||
        this.ui.width.value ||
        App.DEFAULT_SCAN_WIDTH;
      this.ui.width.value = this.clampScanDimensionValue(this.ui.width, parseFloat(width));
      this.writeStorageValue(App.STORAGE_SCAN_WIDTH, this.ui.width.value);
    } catch (err) {
      if (!this.ui.width.value) this.ui.width.value = App.DEFAULT_SCAN_WIDTH;
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveScanWidth() {
    try {
      this.writeStorageValue(App.STORAGE_SCAN_WIDTH, this.scanWidth ?? App.DEFAULT_SCAN_WIDTH);
    } catch (err) {
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  restoreScanHeight() {
    try {
      const height = this.readStorageValue(App.STORAGE_SCAN_HEIGHT) ||
        this.ui.height.value ||
        App.DEFAULT_SCAN_HEIGHT;
      this.ui.height.value = this.clampScanDimensionValue(this.ui.height, parseFloat(height));
      this.writeStorageValue(App.STORAGE_SCAN_HEIGHT, this.ui.height.value);
    } catch (err) {
      if (!this.ui.height.value) this.ui.height.value = App.DEFAULT_SCAN_HEIGHT;
      // Keep the interface usable if localStorage is unavailable.
    }
  }

  saveScanHeight() {
    try {
      this.writeStorageValue(App.STORAGE_SCAN_HEIGHT, this.scanHeight ?? App.DEFAULT_SCAN_HEIGHT);
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
        this.serverUrl + "/scanners/" + this.channel + "/command?" + this.getScanParams()
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

  async cancelScan() {
    if (!this.isScanActive()) return;

    this.scanCancelled = true;
    const reader = this.reader;
    this.reader = undefined;

    if (this.scanAbortController) this.scanAbortController.abort();
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // The reader can already be closed by the aborted fetch.
      }
    }

    this.cancelInProgress = true;
    this.finishCancelledScan();
    fetch(this.serverUrl + "/scanners/" + this.channel + "/cancel", {method: "POST"})
      .catch(() => {
        this.setCommandPreviewText("Cancel request failed", true);
      })
      .finally(() => {
        this.cancelInProgress = false;
        this.updateScanButtonState();
        this.updateCommandPreview();
      });
  }

  finishCancelledScan() {
    if (this.parseRequest !== undefined) {
      cancelAnimationFrame(this.parseRequest);
      this.parseRequest = undefined;
    }

    this.parseQueue = [];
    this.rgbRemainder = new Uint8Array();
    this.response = undefined;
    this.reader = undefined;
    this.scanAbortController = undefined;
    this.streamComplete = true;
    this.scanFinalized = true;
    this.state = App.STATE_STANDBY;
    this.ui.channelInput.disabled = false;
    this.cancelCanvasClearFade();
    this.freezeDisplayFpsGraph();
    this.drawStatsGraphs({force: true});
    this.updateScanButtonState();
  }

  async failActiveScan(message) {
    const reader = this.reader;
    this.reader = undefined;

    if (this.scanAbortController) this.scanAbortController.abort();
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // The reader can already be closed by the aborted fetch.
      }
    }

    if (this.parseRequest !== undefined) {
      cancelAnimationFrame(this.parseRequest);
      this.parseRequest = undefined;
    }

    this.parseQueue = [];
    this.rgbRemainder = new Uint8Array();
    this.response = undefined;
    this.scanAbortController = undefined;
    this.streamComplete = true;
    this.scanFinalized = true;
    this.state = App.STATE_STANDBY;
    this.ui.channelInput.disabled = false;
    this.cancelCanvasClearFade();
    this.setCommandPreviewText(message, true);
    this.updateScanButtonState();
  }

  async getImage() {
    if (!this.isChannelValid || this.channelOutOfBounds) {
      this.updateCommandPreview();
      this.updateScanButtonState();
      return;
    }

    this.reset();
    this.hideScanHistoryImage();
    if (this.clearCanvasBeforeScan) this.startCanvasClearFade();
    this.state = App.STATE_REQUEST_SENT;
    this.updateScanButtonState();
    this.ui.channelInput.disabled = true;
    this.scanAbortController = new AbortController();
    try {
      this.response = await fetch(
        this.serverUrl + "/scanners/" + this.channel + "/scan?" + this.getScanParams(),
        {
          method: "POST",
          signal: this.scanAbortController.signal
        }
      );
    } catch (err) {
      if (this.scanCancelled || err.name === "AbortError") {
        return;
      }
      this.state = App.STATE_STANDBY;
      this.ui.channelInput.disabled = false;
      this.cancelCanvasClearFade();
      this.setCommandPreviewText("Scan request failed", true);
      this.updateScanButtonState();
      return;
    }
    if (!this.response.ok) {
      const errorText = await this.response.text();
      this.state = App.STATE_STANDBY;
      this.ui.channelInput.disabled = false;
      this.scanAbortController = undefined;
      this.cancelCanvasClearFade();
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
    let done;
    let value;
    try {
      ({done, value} = await this.reader.read());
    } catch (err) {
      if (this.scanCancelled || err.name === "AbortError") return;
      this.state = App.STATE_STANDBY;
      this.ui.channelInput.disabled = false;
      this.reader = undefined;
      this.scanAbortController = undefined;
      this.cancelCanvasClearFade();
      this.setCommandPreviewText("Scan stream failed", true);
      this.updateScanButtonState();
      return;
    }

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

          if (this.format !== 'P6') {
            await this.failActiveScan(`Unsupported PNM format: ${this.format || "unknown"}`);
            return;
          }

          // Change state
          this.state = App.STATE_HEADER_PARSED;

          if (this.clearCanvasBeforeScan) {
            await this.finishCanvasClearFade(this.width, this.height);
            this.imageData = this.context.createImageData(this.canvas.width, this.canvas.height);
          } else {
            this.setImageSizeOverlay(this.width, this.height);
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

  startCanvasClearFade() {
    if (this.clearCanvasFadeTimer !== undefined) {
      clearTimeout(this.clearCanvasFadeTimer);
      this.clearCanvasFadeTimer = undefined;
    }

    this.canvas.classList.add("canvas-clearing");
    if (this.ui.wallDisplay) this.ui.wallDisplay.classList.add("canvas-clearing");
    this.clearCanvasFadePromise = new Promise(resolve => {
      this.clearCanvasFadeTimer = setTimeout(() => {
        this.clearCanvasFadeTimer = undefined;
        resolve();
      }, App.CLEAR_CANVAS_FADE_MS);
    });
  }

  async finishCanvasClearFade(pixelWidth, pixelHeight) {
    if (!this.clearCanvasFadePromise) this.startCanvasClearFade();
    await this.clearCanvasFadePromise;
    this.clearCanvasFadePromise = undefined;
    this.setImageSizeOverlay(pixelWidth, pixelHeight);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.clearWallDisplays();
    requestAnimationFrame(() => {
      this.canvas.classList.remove("canvas-clearing");
      if (this.ui.wallDisplay) this.ui.wallDisplay.classList.remove("canvas-clearing");
    });
  }

  cancelCanvasClearFade() {
    if (this.clearCanvasFadeTimer !== undefined) clearTimeout(this.clearCanvasFadeTimer);
    this.clearCanvasFadeTimer = undefined;
    this.clearCanvasFadePromise = undefined;
    this.canvas.classList.remove("canvas-clearing");
    if (this.ui.wallDisplay) this.ui.wallDisplay.classList.remove("canvas-clearing");
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
    this.scanAbortController = undefined;
    this.ensureMainCanvasFromImageData();
    this.position = 0;
    this.freezeDisplayFpsGraph();
    this.state = App.STATE_DATA_PARSED;
    this.ui.channelInput.disabled = false;
    this.updateScanButtonState();
    this.drawStatsGraphs({force: true});
    if (this.saveImages) {
      const date = this.getFormattedDate(new Date());
      const ch = this.channel.toString().padStart(2, "0");
      this.saveCanvasToFile(`CH-${ch} ${date}.png`);
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
    this.ensureMainCanvasFromImageData();
    const exportCanvas = this.getOrientedExportCanvas();

    const blob = await new Promise(resolve => {
      exportCanvas.toBlob(resolve, "image/png");
    });
    if (!blob) return;

    try {
      const params = new URLSearchParams({
        filename
      });
      const response = await fetch(
        this.serverUrl + "/scans?" + params,
        {
          method: "POST",
          headers: {"Content-Type": "image/png"},
          body: blob
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Could not save scan:", errorText);
        this.setCommandPreviewText("Could not save scan", true);
      } else {
        const result = await response.json();
        await this.refreshScanHistory({currentFilename: result.filename});
      }
    } catch (err) {
      console.error("Could not save scan:", err);
      this.setCommandPreviewText("Could not save scan", true);
    }

  }

  getOrientedExportCanvas() {
    const exportCanvas = document.createElement("canvas");
    const exportContext = exportCanvas.getContext("2d");
    const sourceWidth = this.canvas.width;
    const sourceHeight = this.canvas.height;
    const angle = this.directionMode === "rotated" ? 90 : 270;

    exportCanvas.width = sourceHeight;
    exportCanvas.height = sourceWidth;
    exportContext.imageSmoothingEnabled = true;
    exportContext.translate(exportCanvas.width / 2, exportCanvas.height / 2);
    exportContext.rotate(angle * Math.PI / 180);
    exportContext.drawImage(this.canvas, -sourceWidth / 2, -sourceHeight / 2);
    return exportCanvas;
  }

  ensureMainCanvasFromImageData() {
    if (this.shouldPaintMainCanvasLive()) return;
    if (!this.imageData?.data || !this.canvas.width || !this.canvas.height) return;
    if (this.imageData.width !== this.canvas.width || this.imageData.height !== this.canvas.height) return;

    this.context.putImageData(this.imageData, 0, 0);
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
    const isFullscreen = Boolean(document.fullscreenElement);
    const label = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
    this.ui.fullscreenButton.classList.toggle("is-fullscreen", isFullscreen);
    this.ui.fullscreenButton.setAttribute("aria-label", label);
    this.ui.fullscreenButton.title = label;
  }

  updateKioskControls() {
    const isKiosk = this.isKioskMode();
    document.documentElement.classList.toggle("kiosk-mode", isKiosk);
    this.ui.fullscreenButton.classList.toggle("hidden", isKiosk);
    this.ui.quitKioskButton.classList.toggle("hidden", !isKiosk);
  }

  isFullscreenPresentation() {
    return Boolean(document.fullscreenElement || this.isKioskMode());
  }

  isKioskMode() {
    if (document.fullscreenElement) return false;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;

    const params = new URLSearchParams(window.location.search);
    return params.get("kiosk") === "1" ||
      params.get("kiosk") === "true" ||
      params.get("mode") === "kiosk";
  }

  quitKiosk() {
    window.close();
    setTimeout(() => {
      if (!window.closed) alert("Close the kiosk window with Alt+F4 or Ctrl+Q.");
    }, 250);
  }

}
