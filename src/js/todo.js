/* ==========================================================================
   TO-DO BOARD MODULE (Notion-style Kanban Database)
   ========================================================================== */

import { Storage } from './storage.js';

let activeDragCardId = null;

export const Todo = {
  init() {
    // 1. Hook up core action buttons
    const newTaskBtn = document.getElementById('new-task-btn');
    const closeTaskModalBtn = document.getElementById('close-task-modal-btn');
    const saveTaskBtn = document.getElementById('save-task-btn');
    const deleteTaskBtn = document.getElementById('delete-task-btn');
    const modalOverlay = document.getElementById('task-modal');

    if (newTaskBtn) {
      newTaskBtn.addEventListener('click', () => this.openTaskModal());
    }
    if (closeTaskModalBtn) {
      closeTaskModalBtn.addEventListener('click', () => this.closeTaskModal());
    }
    if (saveTaskBtn) {
      saveTaskBtn.addEventListener('click', () => this.saveTaskFromModal());
    }
    if (deleteTaskBtn) {
      deleteTaskBtn.addEventListener('click', () => this.deleteActiveTask());
    }

    // Hide modal if clicking outside container
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          this.closeTaskModal();
        }
      });
    }

    // 2. Setup Kanban Column Drop listeners
    this.setupDragAndDrop();

    // 3. React to background data updates
    window.addEventListener('myspace-data-changed', (e) => {
      const { type } = e.detail;
      const currentSettings = Storage.getSettings();
      if (currentSettings.activeView === 'todo' && type === 'todo') {
        this.render();
      }
    });
  },

  setupDragAndDrop() {
    const columns = document.querySelectorAll('.kanban-column');
    
    columns.forEach(column => {
      column.addEventListener('dragover', (e) => {
        e.preventDefault();
        column.classList.add('dragover');
      });

      column.addEventListener('dragenter', (e) => {
        e.preventDefault();
        column.classList.add('dragover');
      });

      column.addEventListener('dragleave', () => {
        column.classList.remove('dragover');
      });

      column.addEventListener('drop', (e) => {
        e.preventDefault();
        column.classList.remove('dragover');
        
        const cardId = e.dataTransfer.getData('text/plain') || activeDragCardId;
        if (!cardId) return;

        const targetStatus = column.getAttribute('data-status');
        this.updateTaskStatus(cardId, targetStatus);
      });
    });
  },

  updateTaskStatus(taskId, newStatus) {
    const tasks = Storage.getTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1 && tasks[taskIndex].status !== newStatus) {
      tasks[taskIndex].status = newStatus;
      Storage.saveTasks(tasks);
      this.render();
    }
  },

  openTaskModal(task = null) {
    const modal = document.getElementById('task-modal');
    const modalTitle = document.getElementById('modal-title-text');
    const deleteBtn = document.getElementById('delete-task-btn');
    
    // Form Inputs
    const idInput = document.getElementById('task-id-input');
    const titleInput = document.getElementById('task-title-input');
    const descInput = document.getElementById('task-desc-input');
    const statusInput = document.getElementById('task-status-input');
    const priorityInput = document.getElementById('task-priority-input');
    const tagsInput = document.getElementById('task-tags-input');
    const dateInput = document.getElementById('task-date-input');

    if (task) {
      // Edit Mode
      modalTitle.textContent = 'Edit Task';
      idInput.value = task.id;
      titleInput.value = task.title;
      descInput.value = task.description || '';
      statusInput.value = task.status;
      priorityInput.value = task.priority;
      tagsInput.value = task.tags ? task.tags.join(', ') : '';
      dateInput.value = task.date || '';
      deleteBtn.classList.remove('hide');
    } else {
      // Create Mode
      modalTitle.textContent = 'Create Task';
      idInput.value = '';
      titleInput.value = '';
      descInput.value = '';
      statusInput.value = 'waiting';
      priorityInput.value = 'medium';
      tagsInput.value = '';
      
      // Default to today
      const today = new Date().toISOString().split('T')[0];
      dateInput.value = today;
      
      deleteBtn.classList.add('hide');
    }

    modal.classList.remove('hide');
    titleInput.focus();
  },

  closeTaskModal() {
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.add('hide');
  },

  saveTaskFromModal() {
    const titleInput = document.getElementById('task-title-input');
    if (!titleInput.value.trim()) {
      alert('Task title is required.');
      return;
    }

    const idInput = document.getElementById('task-id-input');
    const descInput = document.getElementById('task-desc-input');
    const statusInput = document.getElementById('task-status-input');
    const priorityInput = document.getElementById('task-priority-input');
    const tagsInput = document.getElementById('task-tags-input');
    const dateInput = document.getElementById('task-date-input');

    const tasks = Storage.getTasks();
    const taskId = idInput.value;

    const parsedTags = tagsInput.value
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag !== '');

    const taskData = {
      id: taskId || `task-${Date.now()}`,
      title: titleInput.value.trim(),
      description: descInput.value.trim(),
      status: statusInput.value,
      priority: priorityInput.value,
      tags: parsedTags,
      date: dateInput.value
    };

    if (taskId) {
      // Update existing
      const index = tasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        tasks[index] = taskData;
      }
    } else {
      // Add new
      tasks.push(taskData);
    }

    Storage.saveTasks(tasks);
    this.closeTaskModal();
    this.render();
  },

  deleteActiveTask() {
    const idInput = document.getElementById('task-id-input');
    const taskId = idInput.value;
    if (!taskId) return;

    if (confirm('Are you sure you want to delete this task?')) {
      const tasks = Storage.getTasks().filter(t => t.id !== taskId);
      Storage.saveTasks(tasks);
      this.closeTaskModal();
      this.render();
    }
  },

  render() {
    const tasks = Storage.getTasks();
    const columns = {
      waiting: document.getElementById('cards-waiting'),
      doing: document.getElementById('cards-doing'),
      partial: document.getElementById('cards-partial'),
      completed: document.getElementById('cards-completed')
    };

    // Clear all column containers
    Object.keys(columns).forEach(key => {
      if (columns[key]) columns[key].innerHTML = '';
    });

    // Track card count per column
    const counts = { waiting: 0, doing: 0, partial: 0, completed: 0 };

    tasks.forEach(task => {
      const colContainer = columns[task.status];
      if (!colContainer) return;

      counts[task.status]++;

      // Create card element
      const card = document.createElement('div');
      card.className = 'todo-card';
      card.draggable = true;
      card.setAttribute('data-id', task.id);
      
      // Render tags HTML
      const tagsHtml = task.tags && task.tags.length > 0
        ? `<div class="todo-card-tags">${task.tags.map(tag => `<span class="todo-tag">${tag}</span>`).join('')}</div>`
        : '';

      // Format Date
      let dateHtml = '';
      if (task.date) {
        const formattedDate = new Date(task.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dateHtml = `
          <div class="todo-card-date">
            <i data-lucide="calendar"></i>
            <span>${formattedDate}</span>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="todo-card-title">${task.title}</div>
        ${task.description ? `<p class="todo-card-desc">${task.description}</p>` : ''}
        ${tagsHtml}
        <div class="todo-card-footer">
          <div class="todo-card-priority priority-${task.priority}">
            <span class="priority-indicator"></span>
            <span>${task.priority}</span>
          </div>
          ${dateHtml}
        </div>
      `;

      // 1. Drag Events
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        activeDragCardId = task.id;
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        activeDragCardId = null;
      });

      // 2. Click to Edit Event
      card.addEventListener('click', () => {
        this.openTaskModal(task);
      });

      colContainer.appendChild(card);
    });

    // Update Lucide icons inside newly rendered cards
    lucide.createIcons();

    // Update column counters
    Object.keys(counts).forEach(status => {
      const pill = document.querySelector(`.count-${status}`);
      if (pill) pill.textContent = counts[status];
    });
  }
};
