/* ==========================================================================
   STORAGE MODULE (State Management & LocalStorage Wrapper)
   ========================================================================== */

const STORAGE_KEYS = {
  TASKS: 'myspace_tasks',
  CANVAS_ITEMS: 'myspace_canvas_items',
  CHAT_LOGS: 'myspace_chat_logs',
  SETTINGS: 'myspace_settings'
};

// Beautiful Sample Datasets to initialize the app
const DEFAULT_TASKS = [
  {
    id: 'task-1',
    title: 'Initialize Space Core System',
    description: 'Ensure the main warp drive and lifesupport functions are configured.',
    status: 'completed',
    priority: 'high',
    tags: ['system', 'core'],
    date: '2026-05-25'
  },
  {
    id: 'task-2',
    title: 'Design Sandbox Navigation Grid',
    description: 'Map out the canvas grid with coordinate locking systems.',
    status: 'doing',
    priority: 'medium',
    tags: ['design', 'canvas'],
    date: '2026-05-30'
  },
  {
    id: 'task-3',
    title: 'Create Dashboard Completion Widget',
    description: 'Develop dynamic SVG or Chart.js metrics for task progression.',
    status: 'partial',
    priority: 'medium',
    tags: ['dashboard', 'dev'],
    date: '2026-06-01'
  },
  {
    id: 'task-4',
    title: 'Refactor Infinite Panning Logic',
    description: 'Investigate CSS transformations vs relative offset positions for smooth scrolling.',
    status: 'waiting',
    priority: 'low',
    tags: ['research', 'canvas'],
    date: '2026-06-05'
  }
];

const DEFAULT_CANVAS_ITEMS = [
  {
    id: 'widget-sticky-1',
    type: 'text',
    x: 80,
    y: 80,
    w: 200,
    h: 110,
    text: 'Welcome to your Sandbox Canvas! Use the toolbar to create notes.',
    color: 'purple'
  },
  {
    id: 'widget-sticky-2',
    type: 'text',
    x: 360,
    y: 80,
    w: 200,
    h: 110,
    text: 'Click the arrow icon on a note to draw a connection to another note.',
    color: 'sunset'
  },
  {
    id: 'widget-sticky-3',
    type: 'text',
    x: 360,
    y: 260,
    w: 200,
    h: 110,
    text: 'Click on a connection line or its middle "x" button to delete it.',
    color: 'emerald'
  },
  {
    id: 'conn-1',
    type: 'connection',
    from: 'widget-sticky-1',
    to: 'widget-sticky-2'
  },
  {
    id: 'conn-2',
    type: 'connection',
    from: 'widget-sticky-2',
    to: 'widget-sticky-3'
  }
];

const DEFAULT_CHAT_LOGS = [
  {
    id: 'chat-1',
    text: 'Launched the MySpace workspace portal today! Persistent storage is online. #release #milestone',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString() // 24 hours ago
  },
  {
    id: 'chat-2',
    text: 'Added support for draggable nodes. Currently exploring Chart.js responsiveness inside resizable boxes. #dev #canvas',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString() // 4 hours ago
  },
  {
    id: 'chat-3',
    text: 'Need to structure Kanban columns. Decided on Waiting, Doing, Partial, and Completed. #todo',
    timestamp: new Date(Date.now() - 600000).toISOString() // 10 mins ago
  }
];

const DEFAULT_SETTINGS = {
  coverImage: 'https://images.unsplash.com/photo-1486873249359-2731bd6dafc7?q=80&w=1600&auto=format&fit=crop',
  emojiIcon: '📓',
  pageTitles: {
    dashboard: 'Dashboard',
    todo: 'To-Do Board',
    canvas: 'Sandbox Canvas',
    journal: 'Project Log'
  },
  pageSubtitles: {
    dashboard: 'Your personal control center. Only you exist here.',
    todo: 'Manage tasks and track completion status across columns.',
    canvas: 'Draw, place notes, and visualize details on an interactive board.',
    journal: 'A timeline stream of your daily logs, thoughts, and updates.'
  },
  activeView: 'dashboard',
  sidebarCollapsed: false
};

// LocalStorage helpers
function loadFromStorage(key, defaultValue) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    console.error(`Error loading state for key "${key}":`, e);
    return defaultValue;
  }
}

function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving state for key "${key}":`, e);
  }
}

// Broadcasts modifications to sync components reactively
function broadcastChange(type, data) {
  const event = new CustomEvent('myspace-data-changed', {
    detail: { type, data }
  });
  window.dispatchEvent(event);
}

// State Stores
let tasks = loadFromStorage(STORAGE_KEYS.TASKS, null);
if (!tasks) {
  tasks = DEFAULT_TASKS;
  saveToStorage(STORAGE_KEYS.TASKS, tasks);
}

let canvasItems = loadFromStorage(STORAGE_KEYS.CANVAS_ITEMS, null);
if (!canvasItems) {
  canvasItems = DEFAULT_CANVAS_ITEMS;
  saveToStorage(STORAGE_KEYS.CANVAS_ITEMS, canvasItems);
}

let chatLogs = loadFromStorage(STORAGE_KEYS.CHAT_LOGS, null);
if (!chatLogs) {
  chatLogs = DEFAULT_CHAT_LOGS;
  saveToStorage(STORAGE_KEYS.CHAT_LOGS, chatLogs);
}

let settings = loadFromStorage(STORAGE_KEYS.SETTINGS, null);
if (!settings) {
  settings = DEFAULT_SETTINGS;
  saveToStorage(STORAGE_KEYS.SETTINGS, settings);
}

export const Storage = {
  // Tasks Store
  getTasks() {
    return tasks;
  },
  saveTasks(newTasks) {
    tasks = newTasks;
    saveToStorage(STORAGE_KEYS.TASKS, tasks);
    broadcastChange('todo', tasks);
  },

  // Canvas Store
  getCanvasItems() {
    return canvasItems;
  },
  saveCanvasItems(newItems) {
    canvasItems = newItems;
    saveToStorage(STORAGE_KEYS.CANVAS_ITEMS, canvasItems);
    broadcastChange('canvas', canvasItems);
  },

  // Chat/Journal Store
  getChatLogs() {
    return chatLogs;
  },
  saveChatLogs(newLogs) {
    chatLogs = newLogs;
    saveToStorage(STORAGE_KEYS.CHAT_LOGS, chatLogs);
    broadcastChange('chat', chatLogs);
  },

  // Settings Store
  getSettings() {
    return settings;
  },
  saveSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    saveToStorage(STORAGE_KEYS.SETTINGS, settings);
    broadcastChange('settings', settings);
  }
};
