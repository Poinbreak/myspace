/* ==========================================================================
   HABIT TRACKER MODULE (Weekly Table View)
   ========================================================================== */

import { Storage } from './storage.js';

function toISODate(d) {
  return d.toISOString().split('T')[0];
}

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const Habit = {
  currentMonday: null,
  editingHabitId: null,

  init() {
    this.currentMonday = getMondayOf(new Date());

    const addBtn     = document.getElementById('add-habit-btn');
    const prevBtn    = document.getElementById('habit-prev-week');
    const nextBtn    = document.getElementById('habit-next-week');
    const todayBtn   = document.getElementById('habit-today-btn');
    const closeBtn   = document.getElementById('close-habit-modal-btn');
    const saveBtn    = document.getElementById('save-habit-btn');
    const deleteBtn  = document.getElementById('delete-habit-btn');
    const overlay    = document.getElementById('habit-modal');

    if (addBtn)    addBtn.addEventListener('click', () => this.openModal());
    if (prevBtn)   prevBtn.addEventListener('click', () => this.changeWeek(-1));
    if (nextBtn)   nextBtn.addEventListener('click', () => this.changeWeek(1));
    if (todayBtn)  todayBtn.addEventListener('click', () => { this.currentMonday = getMondayOf(new Date()); this.render(); });
    if (closeBtn)  closeBtn.addEventListener('click', () => this.closeModal());
    if (saveBtn)   saveBtn.addEventListener('click', () => this.saveHabit());
    if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteHabit());
    if (overlay)   overlay.addEventListener('click', e => { if (e.target === overlay) this.closeModal(); });

    window.addEventListener('myspace-data-changed', e => {
      if (Storage.getSettings().activeView === 'habits' && e.detail.type === 'habits') {
        this.render();
      }
    });
  },

  changeWeek(delta) {
    const d = new Date(this.currentMonday);
    d.setDate(d.getDate() + delta * 7);
    this.currentMonday = d;
    this.render();
  },

  openModal(habit = null) {
    this.editingHabitId = habit ? habit.id : null;
    document.getElementById('habit-modal-title').textContent = habit ? 'Edit Habit' : 'New Habit';
    document.getElementById('habit-name-input').value  = habit ? habit.name  : '';
    document.getElementById('habit-color-input').value = habit ? habit.color : '#2eaadc';
    document.getElementById('habit-emoji-input').value = habit ? (habit.emoji || '') : '';
    const deleteBtn = document.getElementById('delete-habit-btn');
    if (deleteBtn) deleteBtn.classList.toggle('hide', !habit);
    document.getElementById('habit-modal').classList.remove('hide');
    document.getElementById('habit-name-input').focus();
  },

  closeModal() {
    document.getElementById('habit-modal').classList.add('hide');
    this.editingHabitId = null;
  },

  saveHabit() {
    const name  = document.getElementById('habit-name-input').value.trim();
    const color = document.getElementById('habit-color-input').value || '#2eaadc';
    const emoji = document.getElementById('habit-emoji-input').value.trim();
    if (!name) return;

    const habits = Storage.getHabits();
    if (this.editingHabitId) {
      const idx = habits.findIndex(h => h.id === this.editingHabitId);
      if (idx !== -1) Object.assign(habits[idx], { name, color, emoji });
    } else {
      habits.push({ id: `habit-${Date.now()}`, name, color, emoji, completions: {} });
    }
    Storage.saveHabits(habits);
    this.closeModal();
    this.render();
  },

  deleteHabit() {
    if (!this.editingHabitId || !confirm('Delete this habit and all its data?')) return;
    Storage.saveHabits(Storage.getHabits().filter(h => h.id !== this.editingHabitId));
    this.closeModal();
    this.render();
  },

  toggleCell(habitId, dateStr) {
    const habits = Storage.getHabits();
    const habit  = habits.find(h => h.id === habitId);
    if (!habit) return;
    habit.completions[dateStr] = habit.completions[dateStr] ? 0 : 1;
    Storage.saveHabits(habits);
    this.render();
  },

  render() {
    // Update week label
    const rangeEl = document.getElementById('habit-week-range');
    if (rangeEl) rangeEl.textContent = formatWeekRange(this.currentMonday);

    const weekDates = getWeekDates(this.currentMonday);
    const today     = toISODate(new Date());
    const habits    = Storage.getHabits();
    const container = document.getElementById('habit-grid-container');
    if (!container) return;

    if (habits.length === 0) {
      container.innerHTML = `
        <div class="habit-empty-wrap">
          <div class="habit-empty-icon">📋</div>
          <p class="habit-empty-title">No habits yet</p>
          <p class="habit-empty-sub">Click "Add Habit" to start tracking your week.</p>
        </div>`;
      return;
    }

    // Build table
    let html = `<div class="habit-table-wrap"><table class="habit-weekly-table">`;

    // Header row
    html += `<thead><tr>
      <th class="hw-label-col">Habit</th>`;

    weekDates.forEach((date, i) => {
      const dateStr  = toISODate(date);
      const isToday  = dateStr === today;
      const dayName  = DAY_LABELS[i];
      const dayNum   = date.getDate();
      const monthStr = date.toLocaleString('default', { month: 'short' });
      html += `<th class="hw-day-col ${isToday ? 'hw-today-col' : ''}">
        <div class="hw-day-header">
          <span class="hw-day-name">${dayName}</span>
          <span class="hw-day-num ${isToday ? 'hw-today-badge' : ''}">${dayNum}</span>
          <span class="hw-month">${monthStr}</span>
        </div>
      </th>`;
    });

    html += `<th class="hw-stats-col">Week</th></tr></thead>`;

    // Body rows – one per habit
    html += `<tbody>`;
    habits.forEach(habit => {
      const weekTotal  = weekDates.filter(d => habit.completions[toISODate(d)] === 1).length;
      const pct        = Math.round((weekTotal / 7) * 100);
      const allTotal   = Object.values(habit.completions).filter(v => v === 1).length;

      html += `<tr class="hw-habit-row" data-habit-id="${habit.id}">
        <td class="hw-label-col">
          <div class="hw-habit-label" style="border-left:3px solid ${habit.color};">
            ${habit.emoji ? `<span class="hw-habit-emoji">${habit.emoji}</span>` : ''}
            <div class="hw-habit-meta">
              <span class="hw-habit-name">${habit.name}</span>
              <span class="hw-habit-alltime">${allTotal} total ✓</span>
            </div>
            <button class="hw-edit-btn" data-habit-id="${habit.id}" title="Edit habit">
              <i data-lucide="pencil"></i>
            </button>
          </div>
        </td>`;

      weekDates.forEach(date => {
        const dateStr  = toISODate(date);
        const done     = habit.completions[dateStr] === 1;
        const isToday  = dateStr === today;
        const isFuture = dateStr > today;

        html += `<td class="hw-cell-col ${isToday ? 'hw-today-col' : ''}">
          <button
            class="hw-cell-btn ${done ? 'done' : ''} ${isFuture ? 'future' : ''}"
            data-habit-id="${habit.id}"
            data-date="${dateStr}"
            ${isFuture ? 'disabled' : ''}
            title="${dateStr}"
            style="${done ? `--cell-color:${habit.color};` : ''}"
          >
            ${done ? `<i data-lucide="check"></i>` : ''}
          </button>
        </td>`;
      });

      // Stats cell
      const barColor = pct === 100 ? habit.color : pct >= 70 ? habit.color : pct >= 40 ? habit.color : habit.color;
      html += `<td class="hw-stats-col">
        <div class="hw-week-stats">
          <span class="hw-week-count" style="color:${habit.color};">${weekTotal}/7</span>
          <div class="hw-week-bar">
            <div class="hw-week-bar-fill" style="width:${pct}%;background:${habit.color};"></div>
          </div>
        </div>
      </td>`;

      html += `</tr>`;
    });

    html += `</tbody></table></div>`;

    container.innerHTML = html;

    // Cell toggle events
    container.querySelectorAll('.hw-cell-btn:not(.future)').forEach(btn => {
      btn.addEventListener('click', () => {
        this.toggleCell(btn.dataset.habitId, btn.dataset.date);
      });
    });

    // Edit button events
    container.querySelectorAll('.hw-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const habit = Storage.getHabits().find(h => h.id === btn.dataset.habitId);
        if (habit) this.openModal(habit);
      });
    });

    lucide.createIcons();
  }
};
