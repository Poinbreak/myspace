/* ==========================================================================
   SANDBOX CANVAS MODULE (Draggable & Resizable Widgets + Freehand Drawing)
   ========================================================================== */

import { Storage } from './storage.js';

const charts = new Map(); // Store active Chart.js instances by widget ID
let activeDragWidget = null;
let activeResizeWidget = null;
let dragOffset = { x: 0, y: 0 };
let initialResizeSize = { w: 0, h: 0 };
let initialMousePos = { x: 0, y: 0 };

// --- Pan State ---
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let scale = 1;

// --- Drawing State ---
let isDrawingMode = false;
let isErasing = false;
let isCurrentlyDrawing = false;
let currentStroke = null;
let drawCtx = null;
let drawCanvas = null;
let currentColor = '#e3e3e3';
let currentSize = 3;
let allStrokes = [];

// Find where line from rect center to targetPoint intersects rect borders
function getIntersectionPoint(rect, targetPoint) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = targetPoint.x - cx;
  const dy = targetPoint.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const m = dy / dx;
  if (dx > 0) {
    const x = rect.x + rect.w;
    const y = cy + m * (x - cx);
    if (y >= rect.y && y <= rect.y + rect.h) return { x, y };
  } else if (dx < 0) {
    const x = rect.x;
    const y = cy + m * (x - cx);
    if (y >= rect.y && y <= rect.y + rect.h) return { x, y };
  }
  if (dy > 0) {
    const y = rect.y + rect.h;
    const x = cx + (y - cy) / m;
    if (x >= rect.x && x <= rect.x + rect.w) return { x, y };
  } else if (dy < 0) {
    const y = rect.y;
    const x = cx + (y - cy) / m;
    if (x >= rect.x && x <= rect.x + rect.w) return { x, y };
  }
  return { x: cx, y: cy };
}

function applyCanvasTransform() {
  const canvasGrid = document.getElementById('sandbox-canvas');
  if (canvasGrid) {
    canvasGrid.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`;
    canvasGrid.style.transformOrigin = '0 0';
  }
}

export const Canvas = {
  isConnecting: false,
  connectionSourceId: null,

  init() {
    const addTextBtn = document.getElementById('add-text-block-btn');
    const addGraphBtn = document.getElementById('add-graph-block-btn');
    const clearCanvasBtn = document.getElementById('clear-canvas-btn');
    const penBtn = document.getElementById('draw-pen-btn');
    const eraserBtn = document.getElementById('draw-eraser-btn');
    const clearDrawingBtn = document.getElementById('clear-drawing-btn');
    const colorPicker = document.getElementById('draw-color-picker');
    const sizeSlider = document.getElementById('draw-size-slider');
    const closeGraphModalBtn = document.getElementById('close-graph-modal-btn');
    const saveGraphBtn = document.getElementById('save-graph-config-btn');
    const addPointBtn = document.getElementById('add-data-point-btn');

    if (addTextBtn) addTextBtn.addEventListener('click', () => this.addNewWidget('text'));
    if (addGraphBtn) addGraphBtn.addEventListener('click', () => this.addNewWidget('graph'));
    if (clearCanvasBtn) clearCanvasBtn.addEventListener('click', () => this.clearCanvas());
    if (closeGraphModalBtn) closeGraphModalBtn.addEventListener('click', () => this.closeGraphModal());
    if (saveGraphBtn) saveGraphBtn.addEventListener('click', () => this.saveGraphFromModal());
    if (addPointBtn) addPointBtn.addEventListener('click', () => this.addDataPointInputRow('', 0));

    // Drawing tool buttons
    if (penBtn) {
      penBtn.addEventListener('click', () => {
        isDrawingMode = true;
        isErasing = false;
        this.updateDrawingToolbar();
      });
    }
    if (eraserBtn) {
      eraserBtn.addEventListener('click', () => {
        isDrawingMode = true;
        isErasing = true;
        this.updateDrawingToolbar();
      });
    }
    if (clearDrawingBtn) {
      clearDrawingBtn.addEventListener('click', () => {
        if (confirm('Clear all freehand drawings?')) {
          allStrokes = [];
          Storage.saveCanvasStrokes([]);
          this.redrawCanvas();
        }
      });
    }
    if (colorPicker) {
      colorPicker.addEventListener('input', (e) => {
        currentColor = e.target.value;
      });
    }
    if (sizeSlider) {
      sizeSlider.addEventListener('input', (e) => {
        currentSize = parseInt(e.target.value, 10);
      });
    }

    // Add a "Select" (pointer) mode toggle button
    const selectBtn = document.getElementById('draw-select-btn');
    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        isDrawingMode = false;
        isErasing = false;
        this.updateDrawingToolbar();
      });
    }

    // Modal click outside close
    const modalOverlay = document.getElementById('graph-config-modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.closeGraphModal();
      });
    }

    // Escape key to cancel connecting or drawing mode
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isConnecting) this.cancelConnecting();
        if (isDrawingMode) {
          isDrawingMode = false;
          this.updateDrawingToolbar();
        }
      }
    });

    // Resize handler: keep draw canvas in sync with container
    window.addEventListener('resize', () => {
      this.syncDrawCanvas();
    });

    // Canvas click outside listener for connection mode
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.addEventListener('click', (e) => {
        const canvasGrid = document.getElementById('sandbox-canvas');
        if (e.target === canvasGrid || e.target.classList.contains('canvas-connections-svg')) {
          if (this.isConnecting) this.cancelConnecting();
        }
      });

      // Wheel zoom
      canvasContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Zoom
          const rect = canvasContainer.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          const newScale = Math.max(0.3, Math.min(3, scale * delta));
          // Adjust pan to zoom towards cursor
          panOffset.x = mouseX - (mouseX - panOffset.x) * (newScale / scale);
          panOffset.y = mouseY - (mouseY - panOffset.y) * (newScale / scale);
          scale = newScale;
          applyCanvasTransform();
          this.syncDrawCanvas();
        } else {
          // Pan
          panOffset.x -= e.deltaX;
          panOffset.y -= e.deltaY;
          applyCanvasTransform();
          this.syncDrawCanvas();
        }
      }, { passive: false });

      // Middle-mouse pan
      canvasContainer.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          isPanning = true;
          panStart = { x: e.clientX, y: e.clientY };
          panOrigin = { x: panOffset.x, y: panOffset.y };
          canvasContainer.style.cursor = 'grabbing';
        }
      });
    }

    this.setupGlobalWindowListeners();
    this.setupDrawingCanvas();

    // Load strokes from storage
    allStrokes = Storage.getCanvasStrokes() || [];

    window.addEventListener('myspace-data-changed', (e) => {
      const { type } = e.detail;
      const currentSettings = Storage.getSettings();
      if (currentSettings.activeView === 'canvas' && type === 'canvas') {
        this.render();
      }
    });
  },

  setupDrawingCanvas() {
    const container = document.querySelector('.canvas-container');
    if (!container) return;

    drawCanvas = document.getElementById('draw-canvas');
    if (!drawCanvas) return;

    drawCtx = drawCanvas.getContext('2d');
    this.syncDrawCanvas();

    // Mouse drawing events
    drawCanvas.addEventListener('mousedown', (e) => {
      if (!isDrawingMode) return;
      e.stopPropagation();
      isCurrentlyDrawing = true;

      const pos = this.getCanvasPos(e);
      currentStroke = {
        color: isErasing ? null : currentColor,
        size: isErasing ? currentSize * 4 : currentSize,
        points: [pos],
        eraser: isErasing
      };
    });

    drawCanvas.addEventListener('mousemove', (e) => {
      if (!isDrawingMode || !isCurrentlyDrawing) return;
      const pos = this.getCanvasPos(e);
      if (currentStroke) {
        currentStroke.points.push(pos);
        this.redrawCanvas();
        // Draw the live stroke on top
        this.drawStroke(currentStroke, true);
      }
    });

    drawCanvas.addEventListener('mouseup', () => {
      if (!isCurrentlyDrawing) return;
      isCurrentlyDrawing = false;
      if (currentStroke && currentStroke.points.length > 1) {
        if (currentStroke.eraser) {
          // Erase overlapping strokes
          this.eraseNearStrokes(currentStroke);
        } else {
          allStrokes.push(currentStroke);
          Storage.saveCanvasStrokes(allStrokes);
        }
        this.redrawCanvas();
      }
      currentStroke = null;
    });

    drawCanvas.addEventListener('mouseleave', () => {
      if (isCurrentlyDrawing && currentStroke) {
        if (currentStroke.points.length > 1) {
          if (!currentStroke.eraser) {
            allStrokes.push(currentStroke);
            Storage.saveCanvasStrokes(allStrokes);
          } else {
            this.eraseNearStrokes(currentStroke);
          }
          this.redrawCanvas();
        }
        currentStroke = null;
        isCurrentlyDrawing = false;
      }
    });

    // Touch support
    drawCanvas.addEventListener('touchstart', (e) => {
      if (!isDrawingMode) return;
      e.preventDefault();
      const touch = e.touches[0];
      const pos = this.getCanvasPosFromTouch(touch);
      isCurrentlyDrawing = true;
      currentStroke = { color: isErasing ? null : currentColor, size: isErasing ? currentSize * 4 : currentSize, points: [pos], eraser: isErasing };
    }, { passive: false });

    drawCanvas.addEventListener('touchmove', (e) => {
      if (!isDrawingMode || !isCurrentlyDrawing) return;
      e.preventDefault();
      const touch = e.touches[0];
      const pos = this.getCanvasPosFromTouch(touch);
      if (currentStroke) {
        currentStroke.points.push(pos);
        this.redrawCanvas();
        this.drawStroke(currentStroke, true);
      }
    }, { passive: false });

    drawCanvas.addEventListener('touchend', () => {
      if (!isCurrentlyDrawing) return;
      isCurrentlyDrawing = false;
      if (currentStroke && currentStroke.points.length > 1) {
        if (currentStroke.eraser) {
          this.eraseNearStrokes(currentStroke);
        } else {
          allStrokes.push(currentStroke);
          Storage.saveCanvasStrokes(allStrokes);
        }
        this.redrawCanvas();
      }
      currentStroke = null;
    });
  },

  getCanvasPos(e) {
    if (!drawCanvas) return { x: 0, y: 0 };
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale - panOffset.x / scale,
      y: (e.clientY - rect.top) / scale - panOffset.y / scale
    };
  },

  getCanvasPosFromTouch(touch) {
    if (!drawCanvas) return { x: 0, y: 0 };
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) / scale - panOffset.x / scale,
      y: (touch.clientY - rect.top) / scale - panOffset.y / scale
    };
  },

  syncDrawCanvas() {
    if (!drawCanvas) return;
    const container = document.querySelector('.canvas-container');
    if (!container) return;
    drawCanvas.width = container.clientWidth;
    drawCanvas.height = container.clientHeight;
    this.redrawCanvas();
  },

  redrawCanvas() {
    if (!drawCtx || !drawCanvas) return;
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    allStrokes.forEach(stroke => this.drawStroke(stroke, false));
  },

  drawStroke(stroke, isLive) {
    if (!drawCtx || !stroke || stroke.points.length < 2) return;
    drawCtx.save();
    drawCtx.translate(panOffset.x, panOffset.y);
    drawCtx.scale(scale, scale);

    if (stroke.eraser) {
      drawCtx.globalCompositeOperation = 'destination-out';
      drawCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      drawCtx.globalCompositeOperation = 'source-over';
      drawCtx.strokeStyle = stroke.color;
    }

    drawCtx.lineWidth = stroke.size;
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';

    drawCtx.beginPath();
    drawCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length - 1; i++) {
      const mx = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
      const my = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
      drawCtx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, mx, my);
    }
    const last = stroke.points[stroke.points.length - 1];
    drawCtx.lineTo(last.x, last.y);
    drawCtx.stroke();
    drawCtx.restore();
  },

  eraseNearStrokes(eraserStroke) {
    const eraserPoints = eraserStroke.points;
    const radius = eraserStroke.size;
    allStrokes = allStrokes.filter(stroke => {
      // Check if any eraser point is close to any stroke point
      return !stroke.points.some(sp =>
        eraserPoints.some(ep => Math.hypot(ep.x - sp.x, ep.y - sp.y) < radius)
      );
    });
    Storage.saveCanvasStrokes(allStrokes);
  },

  updateDrawingToolbar() {
    const penBtn = document.getElementById('draw-pen-btn');
    const eraserBtn = document.getElementById('draw-eraser-btn');
    const selectBtn = document.getElementById('draw-select-btn');
    const drawingTools = document.getElementById('drawing-tools-group');
    const container = document.querySelector('.canvas-container');

    if (penBtn) penBtn.classList.toggle('active', isDrawingMode && !isErasing);
    if (eraserBtn) eraserBtn.classList.toggle('active', isDrawingMode && isErasing);
    if (selectBtn) selectBtn.classList.toggle('active', !isDrawingMode);

    if (drawCanvas) {
      drawCanvas.style.pointerEvents = isDrawingMode ? 'all' : 'none';
      drawCanvas.style.cursor = isDrawingMode ? (isErasing ? 'cell' : 'crosshair') : 'default';
    }
    if (container) {
      container.style.cursor = !isDrawingMode ? 'default' : (isErasing ? 'cell' : 'crosshair');
    }
  },

  setupGlobalWindowListeners() {
    const canvasContainer = document.querySelector('.canvas-container');

    window.addEventListener('mousemove', (e) => {
      // Pan with middle mouse
      if (isPanning) {
        panOffset.x = panOrigin.x + (e.clientX - panStart.x);
        panOffset.y = panOrigin.y + (e.clientY - panStart.y);
        applyCanvasTransform();
        this.syncDrawCanvas();
        return;
      }

      if (activeDragWidget) {
        const canvas = document.getElementById('sandbox-canvas');
        const containerEl = document.querySelector('.canvas-container');
        if (!canvas || !containerEl) return;
        const containerRect = containerEl.getBoundingClientRect();

        let newX = (e.clientX - containerRect.left - panOffset.x) / scale - dragOffset.x;
        let newY = (e.clientY - containerRect.top - panOffset.y) / scale - dragOffset.y;

        newX = Math.max(0, Math.min(2700, newX));
        newY = Math.max(0, Math.min(2700, newY));

        activeDragWidget.style.left = `${newX}px`;
        activeDragWidget.style.top = `${newY}px`;
        this.drawConnections();
      }

      if (activeResizeWidget) {
        const deltaX = e.clientX - initialMousePos.x;
        const deltaY = e.clientY - initialMousePos.y;
        let newW = Math.max(180, Math.min(800, initialResizeSize.w + deltaX));
        let newH = Math.max(120, Math.min(600, initialResizeSize.h + deltaY));
        activeResizeWidget.style.width = `${newW}px`;
        activeResizeWidget.style.height = `${newH}px`;
        this.drawConnections();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (isPanning) {
        isPanning = false;
        if (canvasContainer) canvasContainer.style.cursor = '';
      }

      if (activeDragWidget) {
        const widgetId = activeDragWidget.getAttribute('data-id');
        this.updateWidgetProperties(widgetId, {
          x: parseInt(activeDragWidget.style.left, 10),
          y: parseInt(activeDragWidget.style.top, 10)
        });
        activeDragWidget.classList.remove('dragging');
        activeDragWidget = null;
      }

      if (activeResizeWidget) {
        const widgetId = activeResizeWidget.getAttribute('data-id');
        this.updateWidgetProperties(widgetId, {
          w: parseInt(activeResizeWidget.style.width, 10),
          h: parseInt(activeResizeWidget.style.height, 10)
        });
        const canvasItems = Storage.getCanvasItems();
        const widget = canvasItems.find(item => item.id === widgetId);
        if (widget && widget.type === 'graph') this.renderChartWidget(widget);
        activeResizeWidget = null;
      }
    });

    // Touch pan support (two-finger pan when not drawing)
    let lastTouches = null;
    window.addEventListener('touchstart', (e) => {
      if (isDrawingMode) return;
      if (e.touches.length === 2) {
        lastTouches = [...e.touches];
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (isDrawingMode) return;
      if (e.touches.length === 2 && lastTouches && lastTouches.length === 2) {
        const dx = e.touches[0].clientX - lastTouches[0].clientX;
        const dy = e.touches[0].clientY - lastTouches[0].clientY;
        panOffset.x += dx;
        panOffset.y += dy;
        applyCanvasTransform();
        this.syncDrawCanvas();
        lastTouches = [...e.touches];
      }
    }, { passive: true });
  },

  updateWidgetProperties(widgetId, updatedProps) {
    const items = Storage.getCanvasItems();
    const index = items.findIndex(item => item.id === widgetId);
    if (index !== -1) {
      items[index] = { ...items[index], ...updatedProps };
      Storage.saveCanvasItems(items);
    }
  },

  addNewWidget(type) {
    const items = Storage.getCanvasItems();
    const container = document.querySelector('.canvas-container');
    const scrollLeft = container ? container.scrollLeft : 0;
    const scrollTop = container ? container.scrollTop : 0;

    const newWidget = {
      id: `widget-${Date.now()}`,
      type,
      x: (scrollLeft + 150) / scale - panOffset.x / scale,
      y: (scrollTop + 100) / scale - panOffset.y / scale,
      w: type === 'graph' ? 350 : 200,
      h: type === 'graph' ? 250 : 110
    };

    if (type === 'text') {
      newWidget.text = 'New sticky note. Double-click to write.';
      newWidget.color = 'purple';
    } else {
      newWidget.title = 'Graph Title';
      newWidget.graphType = 'bar';
      newWidget.colorPalette = 'neon';
      newWidget.dataPoints = [
        { label: 'A', value: 10 },
        { label: 'B', value: 15 },
        { label: 'C', value: 7 }
      ];
    }

    items.push(newWidget);
    Storage.saveCanvasItems(items);
    this.render();
  },

  deleteWidget(widgetId) {
    if (charts.has(widgetId)) {
      charts.get(widgetId).destroy();
      charts.delete(widgetId);
    }
    const items = Storage.getCanvasItems().filter(item => {
      if (item.id === widgetId) return false;
      if (item.type === 'connection' && (item.from === widgetId || item.to === widgetId)) return false;
      return true;
    });
    Storage.saveCanvasItems(items);
    this.render();
  },

  clearCanvas() {
    if (confirm('Clear all sandbox widgets and arrows from the canvas?')) {
      charts.forEach(chart => chart.destroy());
      charts.clear();
      Storage.saveCanvasItems([]);
      this.render();
    }
  },

  startConnecting(sourceId) {
    this.isConnecting = true;
    this.connectionSourceId = sourceId;
    const canvas = document.getElementById('sandbox-canvas');
    const sourceEl = canvas.querySelector(`[data-id="${sourceId}"]`);
    if (sourceEl) sourceEl.classList.add('connection-source');

    const toolbar = document.querySelector('.canvas-toolbar');
    let statusBanner = document.getElementById('connection-status-banner');
    if (!statusBanner) {
      statusBanner = document.createElement('div');
      statusBanner.id = 'connection-status-banner';
      statusBanner.className = 'connection-status-banner';
      toolbar.appendChild(statusBanner);
    }
    statusBanner.innerHTML = `
      <span>Connecting... Click target note to join, or Esc to cancel</span>
      <button class="btn-cancel-connection" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;margin-left:10px;">
        <i data-lucide="x" style="width:14px;height:14px;"></i>
      </button>
    `;
    statusBanner.querySelector('.btn-cancel-connection').addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelConnecting();
    });
    lucide.createIcons();
    canvas.classList.add('connecting-mode');
  },

  cancelConnecting() {
    this.isConnecting = false;
    const canvas = document.getElementById('sandbox-canvas');
    if (canvas) {
      canvas.classList.remove('connecting-mode');
      canvas.querySelectorAll('.canvas-widget').forEach(w => w.classList.remove('connection-source'));
    }
    document.getElementById('connection-status-banner')?.remove();
    this.connectionSourceId = null;
  },

  createConnection(fromId, toId) {
    const items = Storage.getCanvasItems();
    const exists = items.some(item => item.type === 'connection' && item.from === fromId && item.to === toId);
    if (!exists && fromId !== toId) {
      items.push({ id: `connection-${Date.now()}`, type: 'connection', from: fromId, to: toId });
      Storage.saveCanvasItems(items);
    }
    this.cancelConnecting();
    this.render();
  },

  drawConnections() {
    const canvas = document.getElementById('sandbox-canvas');
    if (!canvas) return;
    let svg = canvas.querySelector('.canvas-connections-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'canvas-connections-svg');
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;';
      svg.innerHTML = `
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#787774" />
          </marker>
          <marker id="arrow-hover" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#eb5757" />
          </marker>
        </defs>
      `;
      canvas.insertBefore(svg, canvas.firstChild);
    }

    svg.querySelectorAll('path, g').forEach(p => p.remove());
    const items = Storage.getCanvasItems();
    items.filter(item => item.type === 'connection').forEach(conn => {
      const fromEl = canvas.querySelector(`[data-id="${conn.from}"]`);
      const toEl = canvas.querySelector(`[data-id="${conn.to}"]`);
      if (!fromEl || !toEl) return;

      const r1 = { x: parseInt(fromEl.style.left, 10), y: parseInt(fromEl.style.top, 10), w: fromEl.offsetWidth, h: fromEl.offsetHeight };
      const r2 = { x: parseInt(toEl.style.left, 10), y: parseInt(toEl.style.top, 10), w: toEl.offsetWidth, h: toEl.offsetHeight };
      const c1 = { x: r1.x + r1.w / 2, y: r1.y + r1.h / 2 };
      const c2 = { x: r2.x + r2.w / 2, y: r2.y + r2.h / 2 };
      const p1 = getIntersectionPoint(r1, c2);
      const p2 = getIntersectionPoint(r2, c1);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 15) return;

      const off1 = { x: p1.x + (dx / dist) * 2, y: p1.y + (dy / dist) * 2 };
      const off2 = { x: p2.x - (dx / dist) * 8, y: p2.y - (dy / dist) * 8 };

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${off1.x} ${off1.y} L ${off2.x} ${off2.y}`);
      path.setAttribute('class', 'connection-line');
      path.setAttribute('marker-end', 'url(#arrow)');
      path.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('Delete this connection?')) this.deleteWidget(conn.id); });
      svg.appendChild(path);

      const midX = (off1.x + off2.x) / 2;
      const midY = (off1.y + off2.y) / 2;
      const deleteGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      deleteGroup.setAttribute('class', 'connection-delete-btn');
      deleteGroup.setAttribute('transform', `translate(${midX}, ${midY})`);
      deleteGroup.innerHTML = `
        <circle r="7" fill="#ffffff" stroke="#edece9" stroke-width="1.5" />
        <line x1="-2.5" y1="-2.5" x2="2.5" y2="2.5" stroke="#787774" stroke-width="1.2" />
        <line x1="2.5" y1="-2.5" x2="-2.5" y2="2.5" stroke="#787774" stroke-width="1.2" />
      `;
      deleteGroup.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('Delete this connection?')) this.deleteWidget(conn.id); });
      svg.appendChild(deleteGroup);
    });
  },

  openGraphModal(widget) {
    document.getElementById('graph-widget-id-input').value = widget.id;
    document.getElementById('graph-title-input').value = widget.title || '';
    document.getElementById('graph-type-input').value = widget.graphType || 'bar';
    document.getElementById('graph-color-input').value = widget.colorPalette || 'neon';
    const container = document.getElementById('data-points-container');
    container.innerHTML = '';
    if (widget.dataPoints && widget.dataPoints.length > 0) {
      widget.dataPoints.forEach(pt => this.addDataPointInputRow(pt.label, pt.value));
    } else {
      this.addDataPointInputRow('', 0);
    }
    document.getElementById('graph-config-modal')?.classList.remove('hide');
  },

  closeGraphModal() {
    document.getElementById('graph-config-modal')?.classList.add('hide');
  },

  addDataPointInputRow(label = '', value = 0) {
    const container = document.getElementById('data-points-container');
    const row = document.createElement('div');
    row.className = 'data-point-row';
    row.innerHTML = `
      <input type="text" class="data-label-input flex-1" placeholder="Label" value="${label}" required>
      <input type="number" class="data-value-input" style="width:80px;" placeholder="Value" value="${value}" required>
      <button class="widget-btn text-danger remove-point-btn" style="padding:6px;" title="Remove">
        <i data-lucide="minus"></i>
      </button>
    `;
    row.querySelector('.remove-point-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
    lucide.createIcons();
  },

  saveGraphFromModal() {
    const widgetId = document.getElementById('graph-widget-id-input').value;
    const title = document.getElementById('graph-title-input').value.trim() || 'Graph';
    const type = document.getElementById('graph-type-input').value;
    const color = document.getElementById('graph-color-input').value;
    const dataPoints = [];
    document.querySelectorAll('.data-point-row').forEach(row => {
      const label = row.querySelector('.data-label-input').value.trim();
      const val = parseFloat(row.querySelector('.data-value-input').value);
      if (label) dataPoints.push({ label, value: isNaN(val) ? 0 : val });
    });
    const items = Storage.getCanvasItems();
    const index = items.findIndex(item => item.id === widgetId);
    if (index !== -1) {
      items[index] = { ...items[index], title, graphType: type, colorPalette: color, dataPoints };
      Storage.saveCanvasItems(items);
      this.renderChartWidget(items[index]);
    }
    this.closeGraphModal();
    this.render();
  },

  changeStickyColor(widgetId, colorName) {
    const items = Storage.getCanvasItems();
    const index = items.findIndex(item => item.id === widgetId);
    if (index !== -1) {
      items[index].color = colorName;
      Storage.saveCanvasItems(items);
      this.render();
    }
  },

  render() {
    const items = Storage.getCanvasItems();
    const canvas = document.getElementById('sandbox-canvas');
    if (!canvas) return;

    const widgets = items.filter(item => item.type === 'text' || item.type === 'graph');
    const activeWidgetNodes = new Set();

    widgets.forEach(widget => {
      activeWidgetNodes.add(widget.id);
      let el = canvas.querySelector(`[data-id="${widget.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.setAttribute('data-id', widget.id);
        canvas.appendChild(el);
      }

      el.style.left = `${widget.x}px`;
      el.style.top = `${widget.y}px`;
      el.style.width = `${widget.w}px`;
      el.style.height = `${widget.h}px`;

      if (widget.type === 'text') {
        el.className = `canvas-widget widget-sticky widget-sticky-${widget.color || 'purple'}`;
        el.innerHTML = `
          <div class="widget-header">
            <span class="widget-title">Note</span>
            <div class="widget-actions">
              <button class="widget-btn connect-widget-btn" title="Connect to note"><i data-lucide="arrow-up-right"></i></button>
              <div class="color-picker-trigger">
                <button class="widget-btn color-dropdown-btn" title="Choose color"><i data-lucide="palette"></i></button>
                <div class="color-dropdown hide">
                  <span class="color-dot dot-purple" data-color="purple"></span>
                  <span class="color-dot dot-emerald" data-color="emerald"></span>
                  <span class="color-dot dot-sunset" data-color="sunset"></span>
                </div>
              </div>
              <button class="widget-btn delete-widget-btn" title="Delete Note"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="widget-content" contenteditable="false" spellcheck="false">${widget.text}</div>
          <div class="widget-resize-handle"></div>
        `;

        const textContent = el.querySelector('.widget-content');
        textContent.addEventListener('dblclick', () => {
          textContent.setAttribute('contenteditable', 'true');
          textContent.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(textContent);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        });
        textContent.addEventListener('blur', () => {
          textContent.setAttribute('contenteditable', 'false');
          this.updateWidgetProperties(widget.id, { text: textContent.textContent });
        });

        const paletteBtn = el.querySelector('.color-dropdown-btn');
        const colorMenu = el.querySelector('.color-dropdown');
        if (paletteBtn && colorMenu) {
          paletteBtn.addEventListener('click', (e) => { e.stopPropagation(); colorMenu.classList.toggle('hide'); });
          colorMenu.querySelectorAll('.color-dot').forEach(dot => {
            dot.addEventListener('click', (e) => {
              e.stopPropagation();
              this.changeStickyColor(widget.id, dot.getAttribute('data-color'));
            });
          });
        }

        const connectBtn = el.querySelector('.connect-widget-btn');
        if (connectBtn) {
          connectBtn.addEventListener('click', (e) => { e.stopPropagation(); this.startConnecting(widget.id); });
        }
      } else {
        el.className = 'canvas-widget widget-graph';
        el.innerHTML = `
          <div class="widget-header">
            <span class="widget-title">${widget.title || 'Graph'}</span>
            <div class="widget-actions">
              <button class="widget-btn configure-graph-btn" title="Configure Graph"><i data-lucide="settings"></i></button>
              <button class="widget-btn delete-widget-btn" title="Delete Graph"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="widget-content"><canvas id="chart-canvas-${widget.id}"></canvas></div>
          <div class="widget-resize-handle"></div>
        `;
        el.querySelector('.configure-graph-btn').addEventListener('click', () => this.openGraphModal(widget));
        this.renderChartWidget(widget);
      }

      // Click in connection mode
      el.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.color-dropdown')) return;
        if (this.isConnecting) {
          e.stopPropagation();
          const targetId = el.getAttribute('data-id');
          if (targetId !== this.connectionSourceId) {
            this.createConnection(this.connectionSourceId, targetId);
          } else {
            this.cancelConnecting();
          }
        }
      });

      // Drag via header
      const dragHeader = el.querySelector('.widget-header');
      dragHeader.addEventListener('mousedown', (e) => {
        if (isDrawingMode) return;
        if (e.target.closest('button') || e.target.closest('.color-dropdown')) return;
        activeDragWidget = el;
        el.classList.add('dragging');
        const containerEl = document.querySelector('.canvas-container');
        const containerRect = containerEl.getBoundingClientRect();
        dragOffset.x = (e.clientX - containerRect.left - panOffset.x) / scale - parseInt(el.style.left, 10);
        dragOffset.y = (e.clientY - containerRect.top - panOffset.y) / scale - parseInt(el.style.top, 10);
      });

      // Touch drag via header
      dragHeader.addEventListener('touchstart', (e) => {
        if (isDrawingMode) return;
        if (e.target.closest('button')) return;
        const touch = e.touches[0];
        activeDragWidget = el;
        el.classList.add('dragging');
        const containerEl = document.querySelector('.canvas-container');
        const containerRect = containerEl.getBoundingClientRect();
        dragOffset.x = (touch.clientX - containerRect.left - panOffset.x) / scale - parseInt(el.style.left, 10);
        dragOffset.y = (touch.clientY - containerRect.top - panOffset.y) / scale - parseInt(el.style.top, 10);
      }, { passive: true });

      // Resize handle
      const resizeHandle = el.querySelector('.widget-resize-handle');
      resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        activeResizeWidget = el;
        initialResizeSize = { w: el.offsetWidth, h: el.offsetHeight };
        initialMousePos = { x: e.clientX, y: e.clientY };
      });

      // Delete button
      el.querySelector('.delete-widget-btn').addEventListener('click', () => {
        if (confirm('Delete this canvas widget?')) this.deleteWidget(widget.id);
      });
    });

    // Remove deleted widgets from DOM
    canvas.querySelectorAll('.canvas-widget').forEach(node => {
      if (!activeWidgetNodes.has(node.getAttribute('data-id'))) node.remove();
    });

    this.drawConnections();
    this.syncDrawCanvas();
    lucide.createIcons();
  },

  renderChartWidget(widget) {
    setTimeout(() => {
      const chartCtx = document.getElementById(`chart-canvas-${widget.id}`);
      if (!chartCtx) return;
      if (charts.has(widget.id)) charts.get(widget.id).destroy();

      let chartColor = '#2383e2', bgColor = 'rgba(35,131,226,0.2)', borderCol = '#2383e2';
      if (widget.colorPalette === 'emerald') { chartColor = '#448361'; bgColor = 'rgba(68,131,97,0.2)'; borderCol = '#448361'; }
      else if (widget.colorPalette === 'sunset') { chartColor = '#cb932a'; bgColor = 'rgba(203,147,42,0.2)'; borderCol = '#cb932a'; }
      else if (widget.colorPalette === 'neon') { chartColor = '#37352f'; bgColor = 'rgba(55,53,47,0.2)'; borderCol = '#37352f'; }

      const labels = widget.dataPoints.map(p => p.label);
      const data = widget.dataPoints.map(p => p.value);
      const chart = new Chart(chartCtx, {
        type: widget.graphType || 'bar',
        data: {
          labels,
          datasets: [{
            label: widget.title || 'Data',
            data,
            backgroundColor: widget.graphType === 'pie' ? ['rgba(35,131,226,0.6)','rgba(235,87,87,0.6)','rgba(203,147,42,0.6)','rgba(68,131,97,0.6)','rgba(120,119,116,0.6)'] : bgColor,
            borderColor: widget.graphType === 'pie' ? ['#2383e2','#eb5757','#cb932a','#448361','#787774'] : borderCol,
            borderWidth: 1.5,
            fill: widget.graphType === 'line'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: widget.graphType === 'pie', position: 'bottom', labels: { color: '#787774', font: { size: 9 } } }
          },
          scales: widget.graphType === 'pie' ? {} : {
            y: { grid: { color: 'rgba(55,53,47,0.08)' }, ticks: { color: '#787774', font: { size: 9 } } },
            x: { grid: { display: false }, ticks: { color: '#787774', font: { size: 9 } } }
          }
        }
      });
      charts.set(widget.id, chart);
    }, 0);
  }
};
