(function () {
  "use strict";

  const Geom = window.PlanpointedGeometry;
  const Codec = window.PlanpointedCodec;
  const Sample = window.PlanpointedSample;

  const CLOSE_RADIUS_PX = 14;
  const SNAP_RADIUS_PX = 12;
  const VERTEX_HIT_PX = 11;
  const EDGE_HIT_PX = 9;
  const MIN_SCALE = 0.08;
  const MAX_SCALE = 16;

  // ---------------------------------------------------------------------------
  // DOM References
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById("planCanvas");
  const ctx = canvas.getContext("2d");
  const canvasContainer = document.getElementById("canvasContainer");

  const emptyState = document.getElementById("emptyState");
  const missingImageBanner = document.getElementById("missingImageBanner");
  const dropOverlay = document.getElementById("dropOverlay");
  const hudCoords = document.getElementById("hudCoords");
  const hudHint = document.getElementById("hudHint");
  const coordReadout = document.getElementById("coordReadout");
  const zoomReadout = document.getElementById("zoomReadout");
  const planFileName = document.getElementById("planFileName");
  const imageMetaFooter = document.getElementById("imageMetaFooter");

  const imageFileInput = document.getElementById("imageFileInput");
  const jsFileInput = document.getElementById("jsFileInput");

  const btnUploadImage = document.getElementById("btnUploadImage");
  const btnLoadJs = document.getElementById("btnLoadJs");
  const btnLoadSample = document.getElementById("btnLoadSample");
  const emptyUploadBtn = document.getElementById("emptyUploadBtn");
  const emptyLoadJsBtn = document.getElementById("emptyLoadJsBtn");
  const emptySampleBtn = document.getElementById("emptySampleBtn");
  const bannerUploadBtn = document.getElementById("bannerUploadBtn");

  const toolDrawBtn = document.getElementById("toolDraw");
  const toolSelectBtn = document.getElementById("toolSelect");
  const toolPanBtn = document.getElementById("toolPan");
  const btnSnapToggle = document.getElementById("btnSnapToggle");
  const btnUndo = document.getElementById("btnUndo");
  const btnRedo = document.getElementById("btnRedo");
  const btnZoomOut = document.getElementById("btnZoomOut");
  const btnZoomFit = document.getElementById("btnZoomFit");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnExportJs = document.getElementById("btnExportJs");

  const roomListEl = document.getElementById("roomList");
  const roomCountBadge = document.getElementById("roomCountBadge");
  const btnClearRooms = document.getElementById("btnClearRooms");

  const roomInspector = document.getElementById("roomInspector");
  const inspectorNameInput = document.getElementById("inspectorNameInput");
  const btnApplyRename = document.getElementById("btnApplyRename");
  const inspectorNameError = document.getElementById("inspectorNameError");
  const inspectorColors = document.getElementById("inspectorColors");
  const inspectorMetaStats = document.getElementById("inspectorMetaStats");
  const inspectorPoints = document.getElementById("inspectorPoints");
  const btnDeleteSelected = document.getElementById("btnDeleteSelected");

  // Modals
  const nameModal = document.getElementById("nameModal");
  const nameModalForm = document.getElementById("nameModalForm");
  const nameModalVertexCount = document.getElementById("nameModalVertexCount");
  const roomNameInput = document.getElementById("roomNameInput");
  const nameModalError = document.getElementById("nameModalError");
  const nameModalColors = document.getElementById("nameModalColors");
  const btnDiscardRoom = document.getElementById("btnDiscardRoom");

  const exportModal = document.getElementById("exportModal");
  const btnCloseExport = document.getElementById("btnCloseExport");
  const chkEmbedImage = document.getElementById("chkEmbedImage");
  const chkCommonJs = document.getElementById("chkCommonJs");
  const exportPreview = document.getElementById("exportPreview");
  const btnCopyExport = document.getElementById("btnCopyExport");
  const btnDownloadExport = document.getElementById("btnDownloadExport");

  const replaceImageModal = document.getElementById("replaceImageModal");
  const replaceRoomCount = document.getElementById("replaceRoomCount");
  const btnReplaceCancel = document.getElementById("btnReplaceCancel");
  const btnReplaceKeep = document.getElementById("btnReplaceKeep");
  const btnReplaceClear = document.getElementById("btnReplaceClear");

  const toastEl = document.getElementById("toast");

  // ---------------------------------------------------------------------------
  // Application State
  // ---------------------------------------------------------------------------
  const state = {
    hasWorkspace: false,
    image: {
      element: null,
      dataUrl: null,
      name: "",
      width: 0,
      height: 0,
      isMissingImage: false,
    },
    view: {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
    tool: "draw", // "draw" | "select" | "pan"
    snapCorners: true,
    rooms: [],
    selectedRoomId: null,
    hoveredRoomId: null,
    hoveredVertex: null, // { roomId, vertexIndex }
    hoveredEdge: null, // { roomId, edgeIndex, insertIndex, x, y }
    activePoints: [],
    pendingPolygonPoints: null,
    pendingColor: Codec.DEFAULT_COLORS[0],
    pendingImagePayload: null,
    cursorScreen: null,
    cursorImg: null,
    isHoveringFirstDot: false,
    snappedVertex: null,
    shiftHeld: false,
    spaceHeld: false,
    dragState: null,
    history: {
      past: [],
      future: [],
    },
    nextRoomCounter: 1,
  };

  let toastTimer = null;

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function showToast(message, variant = "info") {
    toastEl.textContent = message;
    toastEl.className = "toast";
    if (variant === "error") toastEl.classList.add("toast-error");
    if (variant === "success") toastEl.classList.add("toast-success");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 3400);
  }

  function hexToRgba(hex, alpha) {
    const clean = (hex || "#3b82f6").replace("#", "");
    let r = 59,
      g = 130,
      b = 246;
    if (clean.length === 3) {
      r = parseInt(clean[0] + clean[0], 16);
      g = parseInt(clean[1] + clean[1], 16);
      b = parseInt(clean[2] + clean[2], 16);
    } else if (clean.length >= 6) {
      r = parseInt(clean.slice(0, 2), 16) || 0;
      g = parseInt(clean.slice(2, 4), 16) || 0;
      b = parseInt(clean.slice(4, 6), 16) || 0;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function cloneRooms(rooms) {
    return rooms.map((r) => ({
      ...r,
      points: r.points.map((p) => ({ x: p.x, y: p.y })),
      edges: Geom.buildEdges(r.points.length),
    }));
  }

  function pushHistory() {
    state.history.past.push({
      rooms: cloneRooms(state.rooms),
      selectedRoomId: state.selectedRoomId,
    });
    if (state.history.past.length > 60) {
      state.history.past.shift();
    }
    state.history.future = [];
    updateHistoryButtons();
  }

  function undo() {
    if (state.activePoints.length > 0) {
      state.activePoints.pop();
      updateCursorComputation();
      render();
      return;
    }
    if (state.history.past.length === 0) return;
    state.history.future.push({
      rooms: cloneRooms(state.rooms),
      selectedRoomId: state.selectedRoomId,
    });
    const prev = state.history.past.pop();
    state.rooms = prev.rooms;
    state.selectedRoomId = prev.selectedRoomId;
    syncAllUI();
  }

  function redo() {
    if (state.history.future.length === 0) return;
    state.history.past.push({
      rooms: cloneRooms(state.rooms),
      selectedRoomId: state.selectedRoomId,
    });
    const next = state.history.future.pop();
    state.rooms = next.rooms;
    state.selectedRoomId = next.selectedRoomId;
    syncAllUI();
  }

  function updateHistoryButtons() {
    btnUndo.disabled = state.history.past.length === 0 && state.activePoints.length === 0;
    btnRedo.disabled = state.history.future.length === 0;
  }

  function generateRoomId() {
    const existing = new Set(state.rooms.map((r) => r.id));
    while (existing.has(`room_${state.nextRoomCounter}`)) {
      state.nextRoomCounter++;
    }
    return `room_${state.nextRoomCounter++}`;
  }

  function isDuplicateRoomName(name, excludeRoomId = null) {
    const target = name.trim().toLowerCase();
    return state.rooms.some(
      (r) => r.id !== excludeRoomId && r.name.trim().toLowerCase() === target
    );
  }

  function suggestDefaultRoomName() {
    let n = state.rooms.length + 1;
    while (isDuplicateRoomName(`Room ${n}`)) n++;
    return `Room ${n}`;
  }

  // ---------------------------------------------------------------------------
  // Canvas Sizing & Viewport Control
  // ---------------------------------------------------------------------------
  function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function fitPlanToScreen() {
    if (!state.hasWorkspace || state.image.width <= 0 || state.image.height <= 0) return;
    const rect = canvasContainer.getBoundingClientRect();
    const pad = 44;
    const availW = Math.max(80, rect.width - pad * 2);
    const availH = Math.max(80, rect.height - pad * 2);
    const scale = Math.min(availW / state.image.width, availH / state.image.height, 2);
    state.view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    state.view.offsetX = (rect.width - state.image.width * state.view.scale) / 2;
    state.view.offsetY = (rect.height - state.image.height * state.view.scale) / 2;
    updateTelemetry();
    render();
  }

  function zoomAt(factor, screenCenter = null) {
    if (!state.hasWorkspace) return;
    const rect = canvasContainer.getBoundingClientRect();
    const cx = screenCenter ? screenCenter.x : rect.width / 2;
    const cy = screenCenter ? screenCenter.y : rect.height / 2;

    const prevScale = state.view.scale;
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prevScale * factor));
    if (Math.abs(nextScale - prevScale) < 1e-6) return;

    const imgX = (cx - state.view.offsetX) / prevScale;
    const imgY = (cy - state.view.offsetY) / prevScale;

    state.view.scale = nextScale;
    state.view.offsetX = cx - imgX * nextScale;
    state.view.offsetY = cy - imgY * nextScale;

    updateCursorComputation();
    updateTelemetry();
    render();
  }

  function focusRoom(room) {
    if (!room || room.points.length === 0) return;
    const rect = canvasContainer.getBoundingClientRect();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of room.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const w = Math.max(40, maxX - minX);
    const h = Math.max(40, maxY - minY);
    const scale = Math.min((rect.width * 0.6) / w, (rect.height * 0.6) / h, 3);
    state.view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    state.view.offsetX = rect.width / 2 - cx * state.view.scale;
    state.view.offsetY = rect.height / 2 - cy * state.view.scale;
    updateTelemetry();
    render();
  }

  // ---------------------------------------------------------------------------
  // Image & .js Loading
  // ---------------------------------------------------------------------------
  function applyImageToWorkspace(imgElement, dataUrl, name, width, height, clearRooms) {
    if (clearRooms) {
      state.rooms = [];
      state.selectedRoomId = null;
      state.history.past = [];
      state.history.future = [];
    }
    state.activePoints = [];
    state.hasWorkspace = true;
    state.image = {
      element: imgElement,
      dataUrl,
      name,
      width,
      height,
      isMissingImage: false,
    };

    emptyState.classList.add("hidden");
    missingImageBanner.classList.add("hidden");
    hudCoords.classList.remove("hidden");
    hudHint.classList.remove("hidden");

    if (clearRooms || state.view.scale === 1) {
      fitPlanToScreen();
    }
    syncAllUI();
  }

  function loadImageFromDataUrl(dataUrl, fileName, forceReplaceChoice = true) {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      // If we previously loaded a .js file without an embedded image, attach directly!
      if (state.hasWorkspace && state.image.isMissingImage) {
        applyImageToWorkspace(img, dataUrl, fileName, w, h, false);
        showToast(`Attached "${fileName}" (${w}×${h}) behind loaded rooms.`, "success");
        return;
      }

      // If rooms already exist, ask whether to keep or clear
      if (forceReplaceChoice && state.hasWorkspace && state.rooms.length > 0) {
        state.pendingImagePayload = { img, dataUrl, fileName, w, h };
        replaceRoomCount.textContent = String(state.rooms.length);
        replaceImageModal.classList.remove("hidden");
        return;
      }

      applyImageToWorkspace(img, dataUrl, fileName, w, h, true);
      fitPlanToScreen();
      showToast(`Loaded "${fileName}" (${w}×${h} px). Click room corners to trace.`, "success");
    };
    img.onerror = () => {
      showToast("Failed to decode image file. Try PNG, JPG, WebP, or SVG.", "error");
    };
    img.src = dataUrl;
  }

  function handleImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file (PNG, JPG, WebP, SVG).", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      loadImageFromDataUrl(reader.result, file.name, true);
    };
    reader.readAsDataURL(file);
  }

  function handleJsFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = Codec.parseRoomsJs(String(reader.result || ""));
        state.activePoints = [];
        state.history.past = [];
        state.history.future = [];
        state.rooms = parsed.rooms;
        state.selectedRoomId = parsed.rooms[0] ? parsed.rooms[0].id : null;
        state.hasWorkspace = true;

        if (parsed.planMeta.imageDataUrl) {
          const img = new Image();
          img.onload = () => {
            applyImageToWorkspace(
              img,
              parsed.planMeta.imageDataUrl,
              parsed.planMeta.imageName || file.name,
              img.naturalWidth || parsed.planMeta.imageWidth,
              img.naturalHeight || parsed.planMeta.imageHeight,
              false
            );
            fitPlanToScreen();
            showToast(
              `Loaded ${parsed.rooms.length} room(s) and floor plan from "${file.name}".`,
              "success"
            );
          };
          img.onerror = () => {
            loadRoomsWithoutImage(parsed, file.name);
          };
          img.src = parsed.planMeta.imageDataUrl;
        } else {
          loadRoomsWithoutImage(parsed, file.name);
        }
      } catch (err) {
        showToast(err.message || "Could not parse .js file.", "error");
      }
    };
    reader.readAsText(file);
  }

  function loadRoomsWithoutImage(parsed, sourceFileName) {
    state.image = {
      element: null,
      dataUrl: null,
      name: parsed.planMeta.imageName || sourceFileName.replace(/\.js$/i, ""),
      width: parsed.planMeta.imageWidth,
      height: parsed.planMeta.imageHeight,
      isMissingImage: true,
    };
    emptyState.classList.add("hidden");
    missingImageBanner.classList.remove("hidden");
    hudCoords.classList.remove("hidden");
    hudHint.classList.remove("hidden");
    fitPlanToScreen();
    syncAllUI();
    showToast(
      `Loaded ${parsed.rooms.length} room(s) from "${sourceFileName}".`,
      parsed.warnings.length ? "info" : "success"
    );
  }

  function loadSamplePlan() {
    const sample = Sample.createSampleFloorPlan();
    loadImageFromDataUrl(sample.imageDataUrl, sample.imageName, true);
  }

  // ---------------------------------------------------------------------------
  // Tool & Mode Management
  // ---------------------------------------------------------------------------
  function setTool(tool) {
    state.tool = tool;
    if (tool !== "draw" && state.activePoints.length > 0) {
      // Preserve active points if temporarily panning? Better: keep activePoints if panning via Space,
      // cancel or keep if explicitly switching tools. Keeping activePoints only in draw mode avoids confusion.
      state.activePoints = [];
    }
    toolDrawBtn.classList.toggle("active", tool === "draw");
    toolSelectBtn.classList.toggle("active", tool === "select");
    toolPanBtn.classList.toggle("active", tool === "pan");

    updateHintText();
    updateCursorStyle();
    render();
  }

  function updateHintText() {
    if (!state.hasWorkspace) return;
    if (state.tool === "draw") {
      if (state.activePoints.length === 0) {
        hudHint.innerHTML =
          "Click a room corner to place the 1st dot • Hold <kbd>Shift</kbd> for 45°/90° • <kbd>Space+Drag</kbd> or wheel to pan/zoom";
      } else if (state.activePoints.length < 3) {
        hudHint.innerHTML =
          "Click next corners • Need at least 3 corners before closing • <kbd>Backspace</kbd> undo dot • <kbd>Esc</kbd> cancel";
      } else {
        hudHint.innerHTML =
          "Click more corners or click the <strong>1st dot</strong> to close &amp; name room • <kbd>Backspace</kbd> undo dot";
      }
    } else if (state.tool === "select") {
      hudHint.innerHTML =
        "Click a room to select • Drag corner dots to adjust • Click edge midpoint to add corner • Right-click corner to remove";
    } else {
      hudHint.innerHTML =
        "Drag to pan • Scroll wheel to zoom • Press <kbd>D</kbd> to draw rooms or <kbd>V</kbd> to edit";
    }
  }

  function updateCursorStyle() {
    if (!state.hasWorkspace) {
      canvas.style.cursor = "default";
      return;
    }
    if (state.dragState && state.dragState.type === "pan") {
      canvas.style.cursor = "grabbing";
      return;
    }
    if (state.spaceHeld || state.tool === "pan") {
      canvas.style.cursor = "grab";
      return;
    }
    if (state.tool === "draw") {
      canvas.style.cursor = state.isHoveringFirstDot ? "pointer" : "crosshair";
      return;
    }
    if (state.tool === "select") {
      if (state.hoveredVertex) {
        canvas.style.cursor = "move";
      } else if (state.hoveredEdge) {
        canvas.style.cursor = "copy";
      } else if (state.hoveredRoomId) {
        canvas.style.cursor = "pointer";
      } else {
        canvas.style.cursor = "default";
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Coordinate & Hit Testing Logic
  // ---------------------------------------------------------------------------
  function getCanvasLocalPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function updateCursorComputation() {
    if (!state.cursorScreen || !state.hasWorkspace) return;
    let imgPt = Geom.screenToImage(state.cursorScreen, state.view);
    imgPt = Geom.clampPointToImage(imgPt, state.image.width, state.image.height);

    state.isHoveringFirstDot = false;
    state.snappedVertex = null;
    state.hoveredVertex = null;
    state.hoveredEdge = null;
    state.hoveredRoomId = null;

    if (state.tool === "draw" && !state.spaceHeld) {
      // Check close-polygon snap onto first dot
      if (state.activePoints.length >= 3) {
        const firstScreen = Geom.imageToScreen(state.activePoints[0], state.view);
        if (Geom.distance(state.cursorScreen, firstScreen) <= CLOSE_RADIUS_PX) {
          state.isHoveringFirstDot = true;
          state.cursorImg = { x: state.activePoints[0].x, y: state.activePoints[0].y };
          updateCursorStyle();
          updateTelemetry();
          return;
        }
      }

      // Shift orthogonal / 45-deg constraint relative to previous dot
      if (state.shiftHeld && state.activePoints.length > 0) {
        const prev = state.activePoints[state.activePoints.length - 1];
        imgPt = Geom.clampPointToImage(
          Geom.snapAngle(prev, imgPt, 45),
          state.image.width,
          state.image.height
        );
      }

      // Snap to existing room corner
      if (state.snapCorners) {
        const snapDistImg = SNAP_RADIUS_PX / state.view.scale;
        const nearest = Geom.findNearestVertex(imgPt, state.rooms, snapDistImg);
        if (nearest) {
          imgPt = { x: nearest.x, y: nearest.y };
          state.snappedVertex = nearest;
        }
      }

      state.cursorImg = {
        x: Geom.roundCoord(imgPt.x, 2),
        y: Geom.roundCoord(imgPt.y, 2),
      };
    } else if (state.tool === "select" && !state.spaceHeld) {
      state.cursorImg = {
        x: Geom.roundCoord(imgPt.x, 2),
        y: Geom.roundCoord(imgPt.y, 2),
      };

      const vHitImg = VERTEX_HIT_PX / state.view.scale;
      const eHitImg = EDGE_HIT_PX / state.view.scale;

      // Prioritize selected room's vertices and edges
      const orderedRooms = [...state.rooms].sort((a, b) => {
        if (a.id === state.selectedRoomId) return -1;
        if (b.id === state.selectedRoomId) return 1;
        return 0;
      });

      for (const room of orderedRooms) {
        if (room.visible === false) continue;
        for (let i = 0; i < room.points.length; i++) {
          if (Geom.distance(imgPt, room.points[i]) <= vHitImg) {
            state.hoveredVertex = { roomId: room.id, vertexIndex: i };
            state.hoveredRoomId = room.id;
            updateCursorStyle();
            updateTelemetry();
            return;
          }
        }
      }

      // Check edge insertion handle on selected room
      if (state.selectedRoomId) {
        const sel = state.rooms.find((r) => r.id === state.selectedRoomId);
        if (sel && sel.visible !== false) {
          const edgeHit = Geom.findClosestEdge(imgPt, sel.points, eHitImg);
          if (edgeHit) {
            state.hoveredEdge = { roomId: sel.id, ...edgeHit };
            state.hoveredRoomId = sel.id;
            updateCursorStyle();
            updateTelemetry();
            return;
          }
        }
      }

      // Check polygon interior (pick smallest containing room)
      let bestRoom = null;
      let bestArea = Infinity;
      for (const room of state.rooms) {
        if (room.visible === false) continue;
        if (Geom.pointInPolygon(imgPt, room.points)) {
          const area = Geom.polygonArea(room.points);
          if (area < bestArea) {
            bestArea = area;
            bestRoom = room;
          }
        }
      }
      if (bestRoom) {
        state.hoveredRoomId = bestRoom.id;
      }
    } else {
      state.cursorImg = {
        x: Geom.roundCoord(imgPt.x, 2),
        y: Geom.roundCoord(imgPt.y, 2),
      };
    }

    updateCursorStyle();
    updateTelemetry();
  }

  function updateTelemetry() {
    if (!state.hasWorkspace) return;
    if (state.cursorImg) {
      coordReadout.textContent = `X: ${Math.round(state.cursorImg.x)}, Y: ${Math.round(state.cursorImg.y)} px`;
    }
    zoomReadout.textContent = `${Math.round(state.view.scale * 100)}%`;
  }

  // ---------------------------------------------------------------------------
  // Canvas Rendering
  // ---------------------------------------------------------------------------
  function render() {
    const rect = canvasContainer.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!state.hasWorkspace) return;

    const imgW = state.image.width;
    const imgH = state.image.height;

    // 1. Draw Floor Plan Image (or placeholder blueprint canvas if missing image)
    ctx.save();
    ctx.translate(state.view.offsetX, state.view.offsetY);
    ctx.scale(state.view.scale, state.view.scale);

    // Shadow behind plan sheet
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 24 / state.view.scale;
    ctx.fillStyle = state.image.isMissingImage ? "#131c2e" : "#ffffff";
    ctx.fillRect(0, 0, imgW, imgH);
    ctx.shadowBlur = 0;

    if (state.image.element) {
      ctx.drawImage(state.image.element, 0, 0, imgW, imgH);
    } else {
      // Blueprint grid fallback when .js had no embedded image
      ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
      ctx.lineWidth = 1 / state.view.scale;
      const step = 50;
      ctx.beginPath();
      for (let x = 0; x <= imgW; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, imgH);
      }
      for (let y = 0; y <= imgH; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(imgW, y);
      }
      ctx.stroke();
    }

    // Crisp outer border around plan sheet
    ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
    ctx.lineWidth = 1.5 / state.view.scale;
    ctx.strokeRect(0, 0, imgW, imgH);
    ctx.restore();

    // 2. Draw Saved Room Polygons in Screen Space for Razor-Sharp Lines & Labels
    for (const room of state.rooms) {
      if (room.visible === false || room.points.length < 3) continue;
      const isSelected = room.id === state.selectedRoomId;
      const isHovered = room.id === state.hoveredRoomId;

      const screenPts = room.points.map((p) => Geom.imageToScreen(p, state.view));

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.closePath();

      ctx.fillStyle = hexToRgba(room.color, isSelected ? 0.34 : isHovered ? 0.26 : 0.18);
      ctx.fill();

      ctx.lineWidth = isSelected ? 2.6 : isHovered ? 2.2 : 1.75;
      ctx.strokeStyle = isSelected ? "#ffffff" : room.color;
      ctx.stroke();

      if (isSelected) {
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = room.color;
        ctx.stroke();
      }

      // Draw corner dots
      const dotRadius = isSelected ? 5 : 3.2;
      for (let i = 0; i < screenPts.length; i++) {
        const sp = screenPts[i];
        const isVHover =
          state.hoveredVertex &&
          state.hoveredVertex.roomId === room.id &&
          state.hoveredVertex.vertexIndex === i;

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, isVHover ? 7 : dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = isVHover ? "#facc15" : isSelected ? "#ffffff" : room.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#0f172a";
        ctx.stroke();
      }

      // Edge midpoint insert hint when hovering edge in Edit mode
      if (isSelected && state.hoveredEdge && state.hoveredEdge.roomId === room.id) {
        const ep = Geom.imageToScreen(state.hoveredEdge, state.view);
        ctx.beginPath();
        ctx.arc(ep.x, ep.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#0f172a";
        ctx.stroke();
      }

      // Room Label Pill at visual centroid
      const centroidImg = Geom.polygonCentroid(room.points);
      const centroidScreen = Geom.imageToScreen(centroidImg, state.view);
      drawLabelPill(room.name, centroidScreen.x, centroidScreen.y, room.color, isSelected);
      ctx.restore();
    }

    // 3. Draw Active Polygon Being Traced
    if (state.activePoints.length > 0) {
      const screenPts = state.activePoints.map((p) => Geom.imageToScreen(p, state.view));

      ctx.save();
      // Semi-transparent preview fill if >= 3 points
      if (screenPts.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(screenPts[0].x, screenPts[0].y);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].x, screenPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(56, 189, 248, 0.14)";
        ctx.fill();
      }

      // Solid placed edges
      if (screenPts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(screenPts[0].x, screenPts[0].y);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].x, screenPts[i].y);
        }
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = "#38bdf8";
        ctx.stroke();
      }

      // Dashed rubber-band line from last vertex to cursor
      if (state.cursorImg && state.tool === "draw" && !state.spaceHeld) {
        const last = screenPts[screenPts.length - 1];
        const cur = Geom.imageToScreen(state.cursorImg, state.view);
        ctx.beginPath();
        ctx.setLineDash([6, 5]);
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.lineWidth = 2;
        ctx.strokeStyle = state.isHoveringFirstDot ? "#10b981" : "#facc15";
        ctx.stroke();
        ctx.setLineDash([]);

        // Segment length readout next to cursor
        const segLen = Geom.distance(
          state.activePoints[state.activePoints.length - 1],
          state.cursorImg
        );
        if (segLen > 4) {
          drawFloatingBadge(
            state.isHoveringFirstDot ? "Click to close room" : `${Math.round(segLen)} px`,
            cur.x + 14,
            cur.y - 14,
            state.isHoveringFirstDot ? "#065f46" : "rgba(15, 23, 42, 0.9)",
            state.isHoveringFirstDot ? "#a7f3d0" : "#fde68a"
          );
        }
      }

      // Placed vertex dots
      for (let i = 0; i < screenPts.length; i++) {
        const sp = screenPts[i];
        const isFirst = i === 0;
        const canClose = isFirst && state.activePoints.length >= 3;

        if (canClose && state.isHoveringFirstDot) {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 13, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(16, 185, 129, 0.28)";
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#10b981";
          ctx.stroke();
        } else if (canClose) {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(16, 185, 129, 0.7)";
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, isFirst ? 6 : 5, 0, Math.PI * 2);
        ctx.fillStyle = isFirst ? "#10b981" : "#38bdf8";
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = "#0f172a";
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. Snap-to-Corner Ring Indicator
    if (state.snappedVertex && state.tool === "draw" && !state.isHoveringFirstDot) {
      const sp = Geom.imageToScreen(state.snappedVertex, state.view);
      ctx.save();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#facc15";
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawLabelPill(text, x, y, accentColor, isSelected) {
    ctx.font = "600 12px Inter, system-ui, sans-serif";
    const metrics = ctx.measureText(text);
    const padX = 9;
    const w = metrics.width + padX * 2;
    const h = 22;
    const rx = x - w / 2;
    const ry = y - h / 2;

    ctx.beginPath();
    roundRectPath(ctx, rx, ry, w, h, 6);
    ctx.fillStyle = isSelected ? "rgba(15, 23, 42, 0.94)" : "rgba(15, 23, 42, 0.82)";
    ctx.fill();
    ctx.lineWidth = isSelected ? 1.6 : 1;
    ctx.strokeStyle = isSelected ? "#ffffff" : accentColor;
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
  }

  function drawFloatingBadge(text, x, y, bg, fg) {
    ctx.font = "600 11px JetBrains Mono, Consolas, monospace";
    const metrics = ctx.measureText(text);
    const padX = 7;
    const w = metrics.width + padX * 2;
    const h = 20;
    ctx.beginPath();
    roundRectPath(ctx, x, y - h / 2, w, h, 5);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + padX, y + 0.5);
  }

  function roundRectPath(c, x, y, w, h, r) {
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
  }

  // ---------------------------------------------------------------------------
  // Sidebar & Inspector Sync
  // ---------------------------------------------------------------------------
  function syncAllUI() {
    planFileName.textContent = state.hasWorkspace
      ? state.image.name || "Untitled Plan"
      : "No plan loaded";
    imageMetaFooter.textContent = state.hasWorkspace
      ? `${state.image.width} × ${state.image.height} px • Origin: top-left (0,0)`
      : "No image loaded";

    roomCountBadge.textContent = String(state.rooms.length);
    btnClearRooms.disabled = state.rooms.length === 0;
    btnExportJs.disabled = !state.hasWorkspace;

    renderRoomList();
    renderInspector();
    updateHistoryButtons();
    updateHintText();
    updateTelemetry();
    render();
  }

  function renderRoomList() {
    roomListEl.innerHTML = "";
    if (state.rooms.length === 0) {
      const empty = document.createElement("div");
      empty.className = "room-list-empty";
      empty.innerHTML =
        'No rooms mapped yet. Select <strong>Draw</strong> and click room corners on the plan.';
      roomListEl.appendChild(empty);
      return;
    }

    for (const room of state.rooms) {
      const item = document.createElement("div");
      item.className = "room-item";
      if (room.id === state.selectedRoomId) item.classList.add("selected");
      if (room.visible === false) item.classList.add("is-hidden");

      const swatch = document.createElement("span");
      swatch.className = "room-swatch";
      swatch.style.backgroundColor = room.color;

      const info = document.createElement("div");
      info.className = "room-item-info";
      const nameEl = document.createElement("div");
      nameEl.className = "room-item-name";
      nameEl.textContent = room.name;
      const subEl = document.createElement("div");
      subEl.className = "room-item-sub";
      const area = Math.round(Geom.polygonArea(room.points));
      subEl.textContent = `${room.points.length} pts • ${area.toLocaleString()} px²`;
      info.append(nameEl, subEl);

      const actions = document.createElement("div");
      actions.className = "room-item-actions";

      const eyeBtn = document.createElement("button");
      eyeBtn.className = "icon-mini-btn";
      eyeBtn.title = room.visible === false ? "Show room" : "Hide room";
      eyeBtn.textContent = room.visible === false ? "○" : "●";
      eyeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        room.visible = room.visible === false ? true : false;
        syncAllUI();
      });

      const focusBtn = document.createElement("button");
      focusBtn.className = "icon-mini-btn";
      focusBtn.title = "Zoom to room";
      focusBtn.textContent = "⌖";
      focusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.selectedRoomId = room.id;
        focusRoom(room);
        syncAllUI();
      });

      const delBtn = document.createElement("button");
      delBtn.className = "icon-mini-btn danger-text";
      delBtn.title = "Delete room";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteRoomById(room.id);
      });

      actions.append(eyeBtn, focusBtn, delBtn);
      item.append(swatch, info, actions);

      item.addEventListener("click", () => {
        state.selectedRoomId = room.id;
        syncAllUI();
      });

      roomListEl.appendChild(item);
    }
  }

  function renderInspector() {
    const room = state.rooms.find((r) => r.id === state.selectedRoomId);
    if (!room) {
      roomInspector.classList.add("hidden");
      return;
    }
    roomInspector.classList.remove("hidden");
    inspectorNameInput.value = room.name;
    inspectorNameError.classList.add("hidden");

    inspectorColors.innerHTML = "";
    for (const hex of Codec.DEFAULT_COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-btn" + (room.color === hex ? " active" : "");
      btn.style.backgroundColor = hex;
      btn.title = hex;
      btn.addEventListener("click", () => {
        pushHistory();
        room.color = hex;
        syncAllUI();
      });
      inspectorColors.appendChild(btn);
    }

    const area = Math.round(Geom.polygonArea(room.points));
    inspectorMetaStats.textContent = `${room.points.length} corners • ${area.toLocaleString()} px²`;

    inspectorPoints.innerHTML = "";
    room.points.forEach((pt, idx) => {
      const span = document.createElement("span");
      span.textContent = `#${idx}: (${Math.round(pt.x)}, ${Math.round(pt.y)})`;
      inspectorPoints.appendChild(span);
    });
  }

  function deleteRoomById(roomId) {
    const idx = state.rooms.findIndex((r) => r.id === roomId);
    if (idx === -1) return;
    pushHistory();
    state.rooms.splice(idx, 1);
    if (state.selectedRoomId === roomId) {
      state.selectedRoomId = state.rooms[0] ? state.rooms[0].id : null;
    }
    syncAllUI();
  }

  // ---------------------------------------------------------------------------
  // Modals: Name Room & Export .js
  // ---------------------------------------------------------------------------
  function openNameRoomModal(points) {
    state.pendingPolygonPoints = points;
    const nextColor = Codec.DEFAULT_COLORS[state.rooms.length % Codec.DEFAULT_COLORS.length];
    state.pendingColor = nextColor;

    nameModalVertexCount.textContent = String(points.length);
    roomNameInput.value = "";
    roomNameInput.placeholder = suggestDefaultRoomName();
    nameModalError.classList.add("hidden");

    nameModalColors.innerHTML = "";
    for (const hex of Codec.DEFAULT_COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-btn" + (hex === state.pendingColor ? " active" : "");
      btn.style.backgroundColor = hex;
      btn.addEventListener("click", () => {
        state.pendingColor = hex;
        Array.from(nameModalColors.children).forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
      });
      nameModalColors.appendChild(btn);
    }

    nameModal.classList.remove("hidden");
    requestAnimationFrame(() => roomNameInput.focus());
  }

  function closeNameRoomModal() {
    nameModal.classList.add("hidden");
    state.pendingPolygonPoints = null;
  }

  nameModalForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.pendingPolygonPoints) return;

    const name = roomNameInput.value.trim();
    if (!name) {
      nameModalError.textContent = "Please enter a name for this room.";
      nameModalError.classList.remove("hidden");
      roomNameInput.focus();
      return;
    }
    if (isDuplicateRoomName(name)) {
      nameModalError.textContent = `A room named "${name}" already exists. Choose a unique name.`;
      nameModalError.classList.remove("hidden");
      roomNameInput.select();
      return;
    }

    pushHistory();
    const pts = state.pendingPolygonPoints.map((p) => ({
      x: Geom.roundCoord(p.x, 2),
      y: Geom.roundCoord(p.y, 2),
    }));
    const newRoom = {
      id: generateRoomId(),
      name,
      color: state.pendingColor,
      closed: true,
      visible: true,
      points: pts,
      edges: Geom.buildEdges(pts.length),
    };
    state.rooms.push(newRoom);
    state.selectedRoomId = newRoom.id;
    closeNameRoomModal();
    syncAllUI();
    showToast(`Saved room "${name}".`, "success");
  });

  btnDiscardRoom.addEventListener("click", () => {
    closeNameRoomModal();
    render();
  });

  function buildExportCode(previewTruncateImage) {
    return Codec.generateRoomsJs({
      rooms: state.rooms,
      planMeta: {
        imageName: state.image.name || "floor-plan",
        imageWidth: state.image.width,
        imageHeight: state.image.height,
        imageDataUrl: state.image.dataUrl,
      },
      embedImage: chkEmbedImage.checked,
      includeCommonJsExport: chkCommonJs.checked,
      previewTruncateImage,
    });
  }

  function openExportModal() {
    if (!state.hasWorkspace) return;
    chkEmbedImage.disabled = !state.image.dataUrl;
    if (!state.image.dataUrl) {
      chkEmbedImage.checked = false;
    }
    exportPreview.textContent = buildExportCode(true);
    exportModal.classList.remove("hidden");
  }

  chkEmbedImage.addEventListener("change", () => {
    exportPreview.textContent = buildExportCode(true);
  });
  chkCommonJs.addEventListener("change", () => {
    exportPreview.textContent = buildExportCode(true);
  });
  btnCloseExport.addEventListener("click", () => exportModal.classList.add("hidden"));

  btnCopyExport.addEventListener("click", async () => {
    const code = buildExportCode(false);
    try {
      await navigator.clipboard.writeText(code);
      showToast("Copied .js export to clipboard.", "success");
    } catch {
      showToast("Clipboard permission denied — use Download .js instead.", "error");
    }
  });

  btnDownloadExport.addEventListener("click", () => {
    const code = buildExportCode(false);
    const baseName = (state.image.name || "building-plan")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const filename = `${baseName || "building-plan"}-rooms.js`;

    const blob = new Blob([code], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Downloaded "${filename}".`, "success");
  });

  // Replace Image Modal
  btnReplaceCancel.addEventListener("click", () => {
    state.pendingImagePayload = null;
    replaceImageModal.classList.add("hidden");
  });
  btnReplaceKeep.addEventListener("click", () => {
    if (!state.pendingImagePayload) return;
    const { img, dataUrl, fileName, w, h } = state.pendingImagePayload;
    state.pendingImagePayload = null;
    replaceImageModal.classList.add("hidden");
    applyImageToWorkspace(img, dataUrl, fileName, w, h, false);
    fitPlanToScreen();
  });
  btnReplaceClear.addEventListener("click", () => {
    if (!state.pendingImagePayload) return;
    const { img, dataUrl, fileName, w, h } = state.pendingImagePayload;
    state.pendingImagePayload = null;
    replaceImageModal.classList.add("hidden");
    applyImageToWorkspace(img, dataUrl, fileName, w, h, true);
    fitPlanToScreen();
  });

  // ---------------------------------------------------------------------------
  // Canvas Pointer & Wheel Events
  // ---------------------------------------------------------------------------
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (!state.hasWorkspace) return;
    canvas.setPointerCapture(e.pointerId);
    const pt = getCanvasLocalPoint(e.clientX, e.clientY);
    state.cursorScreen = pt;
    updateCursorComputation();

    // Middle-click, Right-click drag (when not deleting vertex), Space+click, or Pan tool => Pan
    const isPanGesture =
      e.button === 1 || state.spaceHeld || state.tool === "pan";

    if (isPanGesture) {
      state.dragState = {
        type: "pan",
        startScreenX: pt.x,
        startScreenY: pt.y,
        startOffsetX: state.view.offsetX,
        startOffsetY: state.view.offsetY,
      };
      updateCursorStyle();
      return;
    }

    // Right-click in Select mode on a vertex removes that vertex (if > 3 vertices)
    if (e.button === 2 && state.tool === "select" && state.hoveredVertex) {
      const room = state.rooms.find((r) => r.id === state.hoveredVertex.roomId);
      if (room) {
        if (room.points.length <= 3) {
          showToast("A room polygon needs at least 3 corners.", "error");
        } else {
          pushHistory();
          room.points.splice(state.hoveredVertex.vertexIndex, 1);
          room.edges = Geom.buildEdges(room.points.length);
          updateCursorComputation();
          syncAllUI();
        }
      }
      return;
    }

    if (e.button !== 0) return;

    if (state.tool === "draw") {
      // Clicking the 1st dot closes the polygon and opens the Name prompt
      if (state.isHoveringFirstDot && state.activePoints.length >= 3) {
        const closedPoints = [...state.activePoints];
        state.activePoints = [];
        state.isHoveringFirstDot = false;
        updateHistoryButtons();
        updateHintText();
        render();
        openNameRoomModal(closedPoints);
        return;
      }

      if (!state.cursorImg) return;
      // Avoid accidental double-dot at exact same location
      if (state.activePoints.length > 0) {
        const last = state.activePoints[state.activePoints.length - 1];
        if (Geom.distance(last, state.cursorImg) < 2) {
          return;
        }
      }

      state.activePoints.push({ x: state.cursorImg.x, y: state.cursorImg.y });
      updateHistoryButtons();
      updateHintText();
      render();
      return;
    }

    if (state.tool === "select") {
      // Start dragging a vertex
      if (state.hoveredVertex) {
        const room = state.rooms.find((r) => r.id === state.hoveredVertex.roomId);
        if (room) {
          state.selectedRoomId = room.id;
          state.dragState = {
            type: "vertex",
            roomId: room.id,
            vertexIndex: state.hoveredVertex.vertexIndex,
            initialPoints: room.points.map((p) => ({ x: p.x, y: p.y })),
            moved: false,
          };
          syncAllUI();
        }
        return;
      }

      // Click edge midpoint handle -> insert new vertex & begin dragging it
      if (state.hoveredEdge) {
        const room = state.rooms.find((r) => r.id === state.hoveredEdge.roomId);
        if (room) {
          pushHistory();
          const newPt = {
            x: Geom.roundCoord(state.hoveredEdge.x, 2),
            y: Geom.roundCoord(state.hoveredEdge.y, 2),
          };
          const insertIdx = state.hoveredEdge.insertIndex;
          room.points.splice(insertIdx, 0, newPt);
          room.edges = Geom.buildEdges(room.points.length);
          state.dragState = {
            type: "vertex",
            roomId: room.id,
            vertexIndex: insertIdx,
            initialPoints: null, // already pushed history above
            moved: true,
          };
          syncAllUI();
        }
        return;
      }

      // Select clicked room (or clear selection)
      state.selectedRoomId = state.hoveredRoomId || null;
      syncAllUI();
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    const pt = getCanvasLocalPoint(e.clientX, e.clientY);
    state.cursorScreen = pt;

    if (state.dragState) {
      if (state.dragState.type === "pan") {
        state.view.offsetX = state.dragState.startOffsetX + (pt.x - state.dragState.startScreenX);
        state.view.offsetY = state.dragState.startOffsetY + (pt.y - state.dragState.startScreenY);
        render();
        return;
      }

      if (state.dragState.type === "vertex") {
        const room = state.rooms.find((r) => r.id === state.dragState.roomId);
        if (room) {
          let imgPt = Geom.clampPointToImage(
            Geom.screenToImage(pt, state.view),
            state.image.width,
            state.image.height
          );
          if (state.snapCorners) {
            const nearest = Geom.findNearestVertex(
              imgPt,
              state.rooms,
              SNAP_RADIUS_PX / state.view.scale,
              room.id
            );
            if (nearest) {
              imgPt = { x: nearest.x, y: nearest.y };
              state.snappedVertex = nearest;
            } else {
              state.snappedVertex = null;
            }
          }
          room.points[state.dragState.vertexIndex] = {
            x: Geom.roundCoord(imgPt.x, 2),
            y: Geom.roundCoord(imgPt.y, 2),
          };
          state.dragState.moved = true;
          state.cursorImg = room.points[state.dragState.vertexIndex];
          updateTelemetry();
          renderInspector();
          render();
        }
        return;
      }
    }

    updateCursorComputation();
    render();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    if (state.dragState) {
      if (
        state.dragState.type === "vertex" &&
        state.dragState.moved &&
        state.dragState.initialPoints
      ) {
        // Record the pre-drag snapshot into undo history
        const room = state.rooms.find((r) => r.id === state.dragState.roomId);
        if (room) {
          const currentPoints = room.points.map((p) => ({ x: p.x, y: p.y }));
          room.points = state.dragState.initialPoints;
          pushHistory();
          room.points = currentPoints;
          room.edges = Geom.buildEdges(room.points.length);
        }
      }
      state.dragState = null;
      state.snappedVertex = null;
      syncAllUI();
      updateCursorStyle();
    }
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!state.hasWorkspace) return;
      e.preventDefault();
      const pt = getCanvasLocalPoint(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      zoomAt(factor, pt);
    },
    { passive: false }
  );

  // ---------------------------------------------------------------------------
  // Inspector & Toolbar Button Handlers
  // ---------------------------------------------------------------------------
  btnApplyRename.addEventListener("click", applyInspectorRename);
  inspectorNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyInspectorRename();
    }
  });

  function applyInspectorRename() {
    const room = state.rooms.find((r) => r.id === state.selectedRoomId);
    if (!room) return;
    const newName = inspectorNameInput.value.trim();
    if (!newName) {
      inspectorNameError.textContent = "Room name cannot be empty.";
      inspectorNameError.classList.remove("hidden");
      return;
    }
    if (isDuplicateRoomName(newName, room.id)) {
      inspectorNameError.textContent = `Room "${newName}" already exists.`;
      inspectorNameError.classList.remove("hidden");
      return;
    }
    if (newName === room.name) return;
    pushHistory();
    room.name = newName;
    syncAllUI();
    showToast(`Renamed room to "${newName}".`, "success");
  }

  btnDeleteSelected.addEventListener("click", () => {
    if (state.selectedRoomId) deleteRoomById(state.selectedRoomId);
  });

  btnClearRooms.addEventListener("click", () => {
    if (state.rooms.length === 0) return;
    pushHistory();
    state.rooms = [];
    state.selectedRoomId = null;
    syncAllUI();
    showToast("Cleared all rooms (Ctrl+Z to undo).");
  });

  toolDrawBtn.addEventListener("click", () => setTool("draw"));
  toolSelectBtn.addEventListener("click", () => setTool("select"));
  toolPanBtn.addEventListener("click", () => setTool("pan"));

  btnSnapToggle.addEventListener("click", () => {
    state.snapCorners = !state.snapCorners;
    btnSnapToggle.classList.toggle("active", state.snapCorners);
    updateCursorComputation();
    render();
  });

  btnUndo.addEventListener("click", undo);
  btnRedo.addEventListener("click", redo);
  btnZoomIn.addEventListener("click", () => zoomAt(1.25));
  btnZoomOut.addEventListener("click", () => zoomAt(1 / 1.25));
  btnZoomFit.addEventListener("click", fitPlanToScreen);
  btnExportJs.addEventListener("click", openExportModal);

  // File trigger buttons
  [btnUploadImage, emptyUploadBtn, bannerUploadBtn].forEach((btn) => {
    btn.addEventListener("click", () => {
      imageFileInput.value = "";
      imageFileInput.click();
    });
  });
  [btnLoadJs, emptyLoadJsBtn].forEach((btn) => {
    btn.addEventListener("click", () => {
      jsFileInput.value = "";
      jsFileInput.click();
    });
  });
  [btnLoadSample, emptySampleBtn].forEach((btn) => {
    btn.addEventListener("click", loadSamplePlan);
  });

  imageFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });
  jsFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleJsFile(e.target.files[0]);
    }
  });

  // ---------------------------------------------------------------------------
  // Drag & Drop + Clipboard Paste
  // ---------------------------------------------------------------------------
  let dragEnterDepth = 0;

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragEnterDepth++;
    dropOverlay.classList.remove("hidden");
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragEnterDepth = Math.max(0, dragEnterDepth - 1);
    if (dragEnterDepth === 0) {
      dropOverlay.classList.add("hidden");
    }
  });

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragEnterDepth = 0;
    dropOverlay.classList.add("hidden");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".js") || file.type.includes("javascript")) {
      handleJsFile(file);
    } else {
      handleImageFile(file);
    }
  });

  window.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          handleImageFile(new File([file], "pasted-plan.png", { type: file.type }));
          break;
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Keyboard Shortcuts
  // ---------------------------------------------------------------------------
  function isTypingInInput(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift") {
      state.shiftHeld = true;
      updateCursorComputation();
      render();
    }

    if (e.key === "Escape") {
      if (!nameModal.classList.contains("hidden")) {
        closeNameRoomModal();
        render();
        return;
      }
      if (!exportModal.classList.contains("hidden")) {
        exportModal.classList.add("hidden");
        return;
      }
      if (!replaceImageModal.classList.contains("hidden")) {
        replaceImageModal.classList.add("hidden");
        state.pendingImagePayload = null;
        return;
      }
      if (state.activePoints.length > 0) {
        state.activePoints = [];
        updateHistoryButtons();
        updateHintText();
        render();
        return;
      }
    }

    if (isTypingInInput(e.target)) return;

    if (e.code === "Space") {
      e.preventDefault();
      if (!state.spaceHeld) {
        state.spaceHeld = true;
        updateCursorStyle();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }

    if (e.key === "Backspace" && state.activePoints.length > 0) {
      e.preventDefault();
      state.activePoints.pop();
      updateHistoryButtons();
      updateHintText();
      render();
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && state.tool === "select" && state.selectedRoomId) {
      e.preventDefault();
      deleteRoomById(state.selectedRoomId);
      return;
    }

    switch (e.key.toLowerCase()) {
      case "d":
        setTool("draw");
        break;
      case "v":
        setTool("select");
        break;
      case "h":
        setTool("pan");
        break;
      case "0":
        fitPlanToScreen();
        break;
      case "+":
      case "=":
        zoomAt(1.25);
        break;
      case "-":
        zoomAt(1 / 1.25);
        break;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") {
      state.shiftHeld = false;
      updateCursorComputation();
      render();
    }
    if (e.code === "Space") {
      state.spaceHeld = false;
      updateCursorStyle();
    }
  });

  window.addEventListener("blur", () => {
    state.shiftHeld = false;
    state.spaceHeld = false;
    updateCursorStyle();
  });

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(canvasContainer);
  resizeCanvas();
  syncAllUI();
})();
