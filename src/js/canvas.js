/* ==========================================================================
   SANDBOX CANVAS MODULE (Draggable & Resizable Sticky Notes & Graphs)
   ========================================================================== */

import { Storage } from './storage.js';

const charts = new Map(); // Store active Chart.js instances by widget ID
let activeDragWidget = null;
let activeResizeWidget = null;
let dragOffset = { x: 0, y: 0 };
let initialResizeSize = { w: 0, h: 0 };
let initialMousePos = { x: 0, y: 0 };

// Find where line from rect center to targetPoint intersects rect borders
function getIntersectionPoint(rect, targetPoint) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  
  const dx = targetPoint.x - cx;
  const dy = targetPoint.y - cy;
  
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  
  const m = dy / dx;
  
  // Test vertical boundaries (left/right)
  if (dx > 0) {
    const x = rect.x + rect.w;
    const y = cy + m * (x - cx);
    if (y >= rect.y && y <= rect.y + rect.h) {
      return { x, y };
    }
  } else if (dx < 0) {
    const x = rect.x;
    const y = cy + m * (x - cx);
    if (y >= rect.y && y <= rect.y + rect.h) {
      return { x, y };
    }
  }
  
  // Test horizontal boundaries (top/bottom)
  if (dy > 0) {
    const y = rect.y + rect.h;
    const x = cx + (y - cy) / m;
    if (x >= rect.x && x <= rect.x + rect.w) {
      return { x, y };
    }
  } else if (dy < 0) {
    const y = rect.y;
    const x = cx + (y - cy) / m;
    if (x >= rect.x && x <= rect.x + rect.w) {
      return { x, y };
    }
  }
  
  return { x: cx, y: cy }; // Fallback
}

export const Canvas = {
  isConnecting: false,
  connectionSourceId: null,

  init() {
    // 1. Hook up toolbar actions
    const addTextBtn = document.getElementById('add-text-block-btn');
    const addGraphBtn = document.getElementById('add-graph-block-btn');
    const clearCanvasBtn = document.getElementById('clear-canvas-btn');
    
    // Graph Config Modal buttons
    const closeGraphModalBtn = document.getElementById('close-graph-modal-btn');
    const saveGraphBtn = document.getElementById('save-graph-config-btn');
    const addPointBtn = document.getElementById('add-data-point-btn');

    if (addTextBtn) {
      addTextBtn.addEventListener('click', () => this.addNewWidget('text'));
    }
    if (addGraphBtn) {
      addGraphBtn.addEventListener('click', () => this.addNewWidget('graph'));
    }
    if (clearCanvasBtn) {
      clearCanvasBtn.addEventListener('click', () => this.clearCanvas());
    }
    if (closeGraphModalBtn) {
      closeGraphModalBtn.addEventListener('click', () => this.closeGraphModal());
    }
    if (saveGraphBtn) {
      saveGraphBtn.addEventListener('click', () => this.saveGraphFromModal());
    }
    if (addPointBtn) {
      addPointBtn.addEventListener('click', () => this.addDataPointInputRow('', 0));
    }

    // Modal click outside close
    const modalOverlay = document.getElementById('graph-config-modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          this.closeGraphModal();
        }
      });
    }

    // Escape key listener for connection mode
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isConnecting) {
        this.cancelConnecting();
      }
    });

    // Canvas click outside listener for connection mode
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.addEventListener('click', (e) => {
        const canvasGrid = document.getElementById('sandbox-canvas');
        if (e.target === canvasGrid || e.target.classList.contains('canvas-connections-svg')) {
          if (this.isConnecting) {
            this.cancelConnecting();
          }
        }
      });
    }

    // 2. Window-level mouse listeners for dragging/resizing widgets
    this.setupGlobalWindowListeners();

    // 3. React to state changes
    window.addEventListener('myspace-data-changed', (e) => {
      const { type } = e.detail;
      const currentSettings = Storage.getSettings();
      if (currentSettings.activeView === 'canvas' && type === 'canvas') {
        this.render();
      }
    });
  },

  setupGlobalWindowListeners() {
    window.addEventListener('mousemove', (e) => {
      // 1. Handle widget drag movement
      if (activeDragWidget) {
        const canvas = document.getElementById('sandbox-canvas');
        const rect = canvas.getBoundingClientRect();
        
        // Compute relative drag position
        let newX = e.clientX - rect.left - dragOffset.x;
        let newY = e.clientY - rect.top - dragOffset.y;
        
        // Clip to canvas dimensions (3000px)
        newX = Math.max(0, Math.min(2700, newX));
        newY = Math.max(0, Math.min(2700, newY));
        
        activeDragWidget.style.left = `${newX}px`;
        activeDragWidget.style.top = `${newY}px`;

        // Redraw connections dynamically
        this.drawConnections();
      }
      
      // 2. Handle widget resize movement
      if (activeResizeWidget) {
        const deltaX = e.clientX - initialMousePos.x;
        const deltaY = e.clientY - initialMousePos.y;
        
        let newW = initialResizeSize.w + deltaX;
        let newH = initialResizeSize.h + deltaY;
        
        // Minimum widget size constraints
        newW = Math.max(180, Math.min(800, newW));
        newH = Math.max(120, Math.min(600, newH));
        
        activeResizeWidget.style.width = `${newW}px`;
        activeResizeWidget.style.height = `${newH}px`;

        // Redraw connections dynamically
        this.drawConnections();
      }
    });

    window.addEventListener('mouseup', () => {
      // Save state on drag end
      if (activeDragWidget) {
        const widgetId = activeDragWidget.getAttribute('data-id');
        const newX = parseInt(activeDragWidget.style.left, 10);
        const newY = parseInt(activeDragWidget.style.top, 10);
        
        this.updateWidgetProperties(widgetId, { x: newX, y: newY });
        activeDragWidget.classList.remove('dragging');
        activeDragWidget = null;
      }
      
      // Save state on resize end
      if (activeResizeWidget) {
        const widgetId = activeResizeWidget.getAttribute('data-id');
        const newW = parseInt(activeResizeWidget.style.width, 10);
        const newH = parseInt(activeResizeWidget.style.height, 10);
        
        this.updateWidgetProperties(widgetId, { w: newW, h: newH });
        activeResizeWidget = null;
        
        // Re-draw chart on resize to scale correctly
        const canvasItems = Storage.getCanvasItems();
        const widget = canvasItems.find(item => item.id === widgetId);
        if (widget && widget.type === 'graph') {
          this.renderChartWidget(widget);
        }
      }
    });
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
    
    // Find centered position based on canvas container viewport scroll coordinates
    const container = document.querySelector('.canvas-container');
    const scrollLeft = container ? container.scrollLeft : 0;
    const scrollTop = container ? container.scrollTop : 0;
    
    const newWidget = {
      id: `widget-${Date.now()}`,
      type: type,
      x: scrollLeft + 150,
      y: scrollTop + 100,
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
    // Destroy chart instances if any exist
    if (charts.has(widgetId)) {
      charts.get(widgetId).destroy();
      charts.delete(widgetId);
    }

    // Filter out both the widget itself AND any connection lines connected to it
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
    if (sourceEl) {
      sourceEl.classList.add('connection-source');
    }

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
      <button class="btn-cancel-connection" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: 10px;">
        <i data-lucide="x" style="width: 14px; height: 14px;"></i>
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

    const statusBanner = document.getElementById('connection-status-banner');
    if (statusBanner) {
      statusBanner.remove();
    }

    this.connectionSourceId = null;
  },

  createConnection(fromId, toId) {
    const items = Storage.getCanvasItems();

    // Prevent duplicate connections or self connections
    const exists = items.some(item => item.type === 'connection' && item.from === fromId && item.to === toId);
    if (!exists && fromId !== toId) {
      const newConnection = {
        id: `connection-${Date.now()}`,
        type: 'connection',
        from: fromId,
        to: toId
      };
      items.push(newConnection);
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
      svg.style.position = 'absolute';
      svg.style.top = '0';
      svg.style.left = '0';
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.pointerEvents = 'none';
      svg.style.zIndex = '1';

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

    // Remove old lines and buttons
    const paths = svg.querySelectorAll('path, g');
    paths.forEach(p => p.remove());

    const items = Storage.getCanvasItems();
    const connections = items.filter(item => item.type === 'connection');

    connections.forEach(conn => {
      const fromEl = canvas.querySelector(`[data-id="${conn.from}"]`);
      const toEl = canvas.querySelector(`[data-id="${conn.to}"]`);
      if (!fromEl || !toEl) return;

      const r1 = {
        x: parseInt(fromEl.style.left, 10),
        y: parseInt(fromEl.style.top, 10),
        w: fromEl.offsetWidth,
        h: fromEl.offsetHeight
      };

      const r2 = {
        x: parseInt(toEl.style.left, 10),
        y: parseInt(toEl.style.top, 10),
        w: toEl.offsetWidth,
        h: toEl.offsetHeight
      };

      const c1 = { x: r1.x + r1.w / 2, y: r1.y + r1.h / 2 };
      const c2 = { x: r2.x + r2.w / 2, y: r2.y + r2.h / 2 };

      const p1 = getIntersectionPoint(r1, c2);
      const p2 = getIntersectionPoint(r2, c1);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 15) return;

      const offsetStart = 2;
      const offsetEnd = 8;
      const p1_opt = {
        x: p1.x + (dx / dist) * offsetStart,
        y: p1.y + (dy / dist) * offsetStart
      };
      const p2_opt = {
        x: p2.x - (dx / dist) * offsetEnd,
        y: p2.y - (dy / dist) * offsetEnd
      };

      // Draw path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${p1_opt.x} ${p1_opt.y} L ${p2_opt.x} ${p2_opt.y}`);
      path.setAttribute('class', 'connection-line');
      path.setAttribute('marker-end', 'url(#arrow)');

      path.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this connection?')) {
          this.deleteWidget(conn.id);
        }
      });

      svg.appendChild(path);

      // Draw delete button
      const midX = (p1_opt.x + p2_opt.x) / 2;
      const midY = (p1_opt.y + p2_opt.y) / 2;

      const deleteGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      deleteGroup.setAttribute('class', 'connection-delete-btn');
      deleteGroup.setAttribute('transform', `translate(${midX}, ${midY})`);

      deleteGroup.innerHTML = `
        <circle r="7" fill="#ffffff" stroke="#edece9" stroke-width="1.5" />
        <line x1="-2.5" y1="-2.5" x2="2.5" y2="2.5" stroke="#787774" stroke-width="1.2" />
        <line x1="2.5" y1="-2.5" x2="-2.5" y2="2.5" stroke="#787774" stroke-width="1.2" />
      `;

      deleteGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this connection?')) {
          this.deleteWidget(conn.id);
        }
      });

      svg.appendChild(deleteGroup);
    });
  },

  openGraphModal(widget) {
    const modal = document.getElementById('graph-config-modal');
    
    document.getElementById('graph-widget-id-input').value = widget.id;
    document.getElementById('graph-title-input').value = widget.title || '';
    document.getElementById('graph-type-input').value = widget.graphType || 'bar';
    document.getElementById('graph-color-input').value = widget.colorPalette || 'neon';
    
    // Clear data points rows
    const container = document.getElementById('data-points-container');
    container.innerHTML = '';

    // Load data point values
    if (widget.dataPoints && widget.dataPoints.length > 0) {
      widget.dataPoints.forEach(pt => {
        this.addDataPointInputRow(pt.label, pt.value);
      });
    } else {
      // Load default row
      this.addDataPointInputRow('', 0);
    }

    modal.classList.remove('hide');
  },

  closeGraphModal() {
    const modal = document.getElementById('graph-config-modal');
    if (modal) modal.classList.add('hide');
  },

  addDataPointInputRow(label = '', value = 0) {
    const container = document.getElementById('data-points-container');
    const row = document.createElement('div');
    row.className = 'data-point-row';
    
    row.innerHTML = `
      <input type="text" class="data-label-input flex-1" placeholder="Label" value="${label}" required>
      <input type="number" class="data-value-input" style="width: 80px;" placeholder="Value" value="${value}" required>
      <button class="widget-btn text-danger remove-point-btn" style="padding: 6px;" title="Remove point">
        <i data-lucide="minus"></i>
      </button>
    `;

    row.querySelector('.remove-point-btn').addEventListener('click', () => {
      row.remove();
    });

    container.appendChild(row);
    lucide.createIcons();
  },

  saveGraphFromModal() {
    const widgetId = document.getElementById('graph-widget-id-input').value;
    const title = document.getElementById('graph-title-input').value.trim() || 'Graph';
    const type = document.getElementById('graph-type-input').value;
    const color = document.getElementById('graph-color-input').value;

    const dataPoints = [];
    const rows = document.querySelectorAll('.data-point-row');
    
    rows.forEach(row => {
      const label = row.querySelector('.data-label-input').value.trim();
      const val = parseFloat(row.querySelector('.data-value-input').value);
      if (label) {
        dataPoints.push({ label, value: isNaN(val) ? 0 : val });
      }
    });

    const items = Storage.getCanvasItems();
    const index = items.findIndex(item => item.id === widgetId);
    if (index !== -1) {
      items[index] = {
        ...items[index],
        title,
        graphType: type,
        colorPalette: color,
        dataPoints
      };
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

    // Filter widgets and connections
    const widgets = items.filter(item => item.type === 'text' || item.type === 'graph');
    
    // Clear existing nodes but keep track of chart instances we don't want to break
    const activeWidgetNodes = new Set();
    
    widgets.forEach(widget => {
      activeWidgetNodes.add(widget.id);
      let el = canvas.querySelector(`[data-id="${widget.id}"]`);

      if (!el) {
        // Create widget element if it doesn't exist yet
        el = document.createElement('div');
        el.setAttribute('data-id', widget.id);
        canvas.appendChild(el);
      }

      // Configure coordinates and dimensions
      el.style.left = `${widget.x}px`;
      el.style.top = `${widget.y}px`;
      el.style.width = `${widget.w}px`;
      el.style.height = `${widget.h}px`;

      if (widget.type === 'text') {
        // Render STICKY NOTE widget
        el.className = `canvas-widget widget-sticky widget-sticky-${widget.color || 'purple'}`;
        
        el.innerHTML = `
          <div class="widget-header">
            <span class="widget-title">Note</span>
            <div class="widget-actions">
              <button class="widget-btn connect-widget-btn" title="Connect to note">
                <i data-lucide="arrow-up-right"></i>
              </button>
              <div class="color-picker-trigger">
                <button class="widget-btn color-dropdown-btn" title="Choose color">
                  <i data-lucide="palette"></i>
                </button>
                <div class="color-dropdown hide">
                  <span class="color-dot dot-purple" data-color="purple"></span>
                  <span class="color-dot dot-emerald" data-color="emerald"></span>
                  <span class="color-dot dot-sunset" data-color="sunset"></span>
                </div>
              </div>
              <button class="widget-btn delete-widget-btn" title="Delete Note">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
          <div class="widget-content" contenteditable="false" spellcheck="false">${widget.text}</div>
          <div class="widget-resize-handle"></div>
        `;

        // Double click to write/edit inline
        const textContent = el.querySelector('.widget-content');
        
        textContent.addEventListener('dblclick', () => {
          textContent.setAttribute('contenteditable', 'true');
          textContent.focus();
          // Position cursor at end of text
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

        // Color Picker toggle dropdown
        const paletteBtn = el.querySelector('.color-dropdown-btn');
        const colorMenu = el.querySelector('.color-dropdown');
        if (paletteBtn && colorMenu) {
          paletteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            colorMenu.classList.toggle('hide');
          });
          
          colorMenu.querySelectorAll('.color-dot').forEach(dot => {
            dot.addEventListener('click', (e) => {
              e.stopPropagation();
              const colorName = dot.getAttribute('data-color');
              this.changeStickyColor(widget.id, colorName);
            });
          });
        }

        // Connect Button setup
        const connectBtn = el.querySelector('.connect-widget-btn');
        if (connectBtn) {
          connectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startConnecting(widget.id);
          });
        }

      } else {
        // Render GRAPH CARD widget
        el.className = 'canvas-widget widget-graph';
        
        el.innerHTML = `
          <div class="widget-header">
            <span class="widget-title">${widget.title || 'Graph'}</span>
            <div class="widget-actions">
              <button class="widget-btn configure-graph-btn" title="Configure Graph">
                <i data-lucide="settings"></i>
              </button>
              <button class="widget-btn delete-widget-btn" title="Delete Graph">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
          <div class="widget-content">
            <canvas id="chart-canvas-${widget.id}"></canvas>
          </div>
          <div class="widget-resize-handle"></div>
        `;

        // Configure button event
        el.querySelector('.configure-graph-btn').addEventListener('click', () => {
          this.openGraphModal(widget);
        });

        // Draw the Chart.js graphic
        this.renderChartWidget(widget);
      }

      // Handle clicking widgets during connection mode
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

      // Drag handles setup
      const dragHeader = el.querySelector('.widget-header');
      dragHeader.addEventListener('mousedown', (e) => {
        // Don't drag if clicking buttons
        if (e.target.closest('button') || e.target.closest('.color-dropdown')) return;
        
        activeDragWidget = el;
        el.classList.add('dragging');
        
        const rect = el.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
      });

      // Resize handle setup
      const resizeHandle = el.querySelector('.widget-resize-handle');
      resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        activeResizeWidget = el;
        initialResizeSize.w = el.offsetWidth;
        initialResizeSize.h = el.offsetHeight;
        initialMousePos.x = e.clientX;
        initialMousePos.y = e.clientY;
      });

      // Delete Button setup
      el.querySelector('.delete-widget-btn').addEventListener('click', () => {
        if (confirm('Delete this canvas widget?')) {
          this.deleteWidget(widget.id);
        }
      });
    });

    // Remove deleted widgets from the DOM
    canvas.querySelectorAll('.canvas-widget').forEach(node => {
      const id = node.getAttribute('data-id');
      if (!activeWidgetNodes.has(id)) {
        node.remove();
      }
    });

    // Draw connection lines overlay
    this.drawConnections();

    lucide.createIcons();
  },

  renderChartWidget(widget) {
    // Wait a brief tick for elements to mount correctly
    setTimeout(() => {
      const chartCtx = document.getElementById(`chart-canvas-${widget.id}`);
      if (!chartCtx) return;

      // Clean existing Chart.js instances to avoid collisions
      if (charts.has(widget.id)) {
        charts.get(widget.id).destroy();
      }

      // Set palette colors based on choice
      let chartColor = '#2383e2';
      let bgColor = 'rgba(35, 131, 226, 0.2)';
      let borderCol = '#2383e2';
      
      if (widget.colorPalette === 'emerald') {
        chartColor = '#448361';
        bgColor = 'rgba(68, 131, 97, 0.2)';
        borderCol = '#448361';
      } else if (widget.colorPalette === 'sunset') {
        chartColor = '#cb932a';
        bgColor = 'rgba(203, 147, 42, 0.2)';
        borderCol = '#cb932a';
      } else if (widget.colorPalette === 'neon') {
        chartColor = '#37352f';
        bgColor = 'rgba(55, 53, 47, 0.2)';
        borderCol = '#37352f';
      }

      const labels = widget.dataPoints.map(p => p.label);
      const data = widget.dataPoints.map(p => p.value);

      const chart = new Chart(chartCtx, {
        type: widget.graphType || 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: widget.title || 'Data',
            data: data,
            backgroundColor: widget.graphType === 'pie' ? [
              'rgba(35, 131, 226, 0.6)',
              'rgba(235, 87, 87, 0.6)',
              'rgba(203, 147, 42, 0.6)',
              'rgba(68, 131, 97, 0.6)',
              'rgba(120, 119, 116, 0.6)'
            ] : bgColor,
            borderColor: widget.graphType === 'pie' ? [
              '#2383e2',
              '#eb5757',
              '#cb932a',
              '#448361',
              '#787774'
            ] : borderCol,
            borderWidth: 1.5,
            fill: widget.graphType === 'line'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: widget.graphType === 'pie',
              position: 'bottom',
              labels: {
                color: '#787774',
                font: { size: 9, family: 'sans-serif' }
              }
            }
          },
          scales: widget.graphType === 'pie' ? {} : {
            y: {
              grid: { color: 'rgba(55, 53, 47, 0.08)' },
              ticks: { color: '#787774', font: { size: 9, family: 'sans-serif' } }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#787774', font: { size: 9, family: 'sans-serif' } }
            }
          }
        }
      });

      charts.set(widget.id, chart);
    }, 0);
  }
};
