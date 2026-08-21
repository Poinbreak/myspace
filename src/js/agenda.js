/* ==========================================================================
   AGENDA MODULE (Weekly Planner)
   ========================================================================== */

import { Storage } from './storage.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toISODate(d) {
  return d.toISOString().split('T')[0];
}

// Get Monday of the week containing a given date
function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Get 7 dates (Mon–Sun) starting from a given Monday
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
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}, ${sunday.getFullYear()}`;
}

const EVENT_COLORS = ['#2eaadc', '#378357', '#c69026', '#e25555', '#9b59b6', '#e67e22'];

export const Agenda = {
  currentMonday: null,
  editingEventId: null,
  editingEventDate: null,

  init() {
    this.currentMonday = getMondayOf(new Date());

    const prevWeekBtn = document.getElementById('agenda-prev-week');
    const nextWeekBtn = document.getElementById('agenda-next-week');
    const todayBtn = document.getElementById('agenda-today-btn');
    const closeModalBtn = document.getElementById('close-agenda-modal-btn');
    const saveEventBtn = document.getElementById('save-agenda-event-btn');
    const deleteEventBtn = document.getElementById('delete-agenda-event-btn');
    const modalOverlay = document.getElementById('agenda-event-modal');

    if (prevWeekBtn) prevWeekBtn.addEventListener('click', () => this.changeWeek(-1));
    if (nextWeekBtn) nextWeekBtn.addEventListener('click', () => this.changeWeek(1));
    if (todayBtn) todayBtn.addEventListener('click', () => {
      this.currentMonday = getMondayOf(new Date());
      this.render();
    });
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => this.closeModal());
    if (saveEventBtn) saveEventBtn.addEventListener('click', () => this.saveEvent());
    if (deleteEventBtn) deleteEventBtn.addEventListener('click', () => this.deleteEvent());
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.closeModal();
      });
    }

    window.addEventListener('myspace-data-changed', (e) => {
      const { type } = e.detail;
      const settings = Storage.getSettings();
      if (settings.activeView === 'agenda' && type === 'agenda') {
        this.render();
      }
    });
  },

  changeWeek(delta) {
    const newMonday = new Date(this.currentMonday);
    newMonday.setDate(newMonday.getDate() + delta * 7);
    this.currentMonday = newMonday;
    this.render();
  },

  openModal(dateStr, event = null) {
    this.editingEventId = event ? event.id : null;
    this.editingEventDate = dateStr;

    const titleEl = document.getElementById('agenda-modal-title');
    const titleInput = document.getElementById('agenda-event-title');
    const timeInput = document.getElementById('agenda-event-time');
    const noteInput = document.getElementById('agenda-event-note');
    const deleteBtn = document.getElementById('delete-agenda-event-btn');
    const colorPicker = document.getElementById('agenda-event-color-picker');

    if (titleEl) titleEl.textContent = event ? 'Edit Event' : `Add Event — ${dateStr}`;
    if (titleInput) titleInput.value = event ? event.title : '';
    if (timeInput) timeInput.value = event ? (event.time || '') : '';
    if (noteInput) noteInput.value = event ? (event.note || '') : '';
    if (deleteBtn) deleteBtn.classList.toggle('hide', !event);

    // Render color swatches
    if (colorPicker) {
      colorPicker.innerHTML = EVENT_COLORS.map(c => `
        <span class="agenda-color-dot ${event && event.color === c ? 'selected' : ''}"
          data-color="${c}" style="background:${c};" title="${c}"></span>
      `).join('');

      colorPicker.querySelectorAll('.agenda-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          colorPicker.querySelectorAll('.agenda-color-dot').forEach(d => d.classList.remove('selected'));
          dot.classList.add('selected');
        });
      });
    }

    document.getElementById('agenda-event-modal')?.classList.remove('hide');
    document.getElementById('agenda-event-title')?.focus();
  },

  closeModal() {
    document.getElementById('agenda-event-modal')?.classList.add('hide');
    this.editingEventId = null;
    this.editingEventDate = null;
  },

  saveEvent() {
    const title = document.getElementById('agenda-event-title')?.value.trim();
    if (!title) return;
    const time = document.getElementById('agenda-event-time')?.value || '';
    const note = document.getElementById('agenda-event-note')?.value.trim() || '';
    const selectedColorDot = document.querySelector('#agenda-event-color-picker .agenda-color-dot.selected');
    const color = selectedColorDot ? selectedColorDot.getAttribute('data-color') : EVENT_COLORS[0];

    const events = Storage.getAgendaEvents();
    const dateStr = this.editingEventDate;
    if (!events[dateStr]) events[dateStr] = [];

    if (this.editingEventId) {
      const idx = events[dateStr].findIndex(e => e.id === this.editingEventId);
      if (idx !== -1) {
        events[dateStr][idx] = { ...events[dateStr][idx], title, time, note, color };
      }
    } else {
      events[dateStr].push({
        id: `event-${Date.now()}`,
        title, time, note, color
      });
    }

    Storage.saveAgendaEvents(events);
    this.closeModal();
    this.render();
  },

  deleteEvent() {
    if (!this.editingEventId || !this.editingEventDate) return;
    if (!confirm('Delete this event?')) return;

    const events = Storage.getAgendaEvents();
    const dateStr = this.editingEventDate;
    if (events[dateStr]) {
      events[dateStr] = events[dateStr].filter(e => e.id !== this.editingEventId);
      if (events[dateStr].length === 0) delete events[dateStr];
    }
    Storage.saveAgendaEvents(events);
    this.closeModal();
    this.render();
  },

  render() {
    const weekRangeEl = document.getElementById('agenda-week-range');
    if (weekRangeEl) weekRangeEl.textContent = formatWeekRange(this.currentMonday);

    const weekDates = getWeekDates(this.currentMonday);
    const allEvents = Storage.getAgendaEvents();
    const today = toISODate(new Date());

    const grid = document.getElementById('agenda-grid');
    if (!grid) return;

    grid.innerHTML = weekDates.map((date, idx) => {
      const dateStr = toISODate(date);
      const isToday = dateStr === today;
      const dayEvents = allEvents[dateStr] || [];
      const dayNum = date.getDate();
      const monthStr = date.toLocaleString('default', { month: 'short' });

      const eventsHtml = dayEvents
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
        .map(ev => `
          <div class="agenda-event-pill" style="border-left:3px solid ${ev.color};"
            data-event-id="${ev.id}" data-date="${dateStr}">
            ${ev.time ? `<span class="agenda-event-time">${ev.time}</span>` : ''}
            <span class="agenda-event-title">${ev.title}</span>
          </div>
        `).join('');

      return `
        <div class="agenda-day-col ${isToday ? 'agenda-today' : ''}">
          <div class="agenda-day-header">
            <span class="agenda-day-name">${SHORT_DAYS[idx]}</span>
            <span class="agenda-day-num ${isToday ? 'today-badge' : ''}">${dayNum}</span>
            <span class="agenda-month-label">${monthStr}</span>
          </div>
          <div class="agenda-events-list" data-date="${dateStr}">
            ${eventsHtml}
            <button class="agenda-add-event-btn" data-date="${dateStr}" title="Add event">
              <i data-lucide="plus"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach add-event button events
    grid.querySelectorAll('.agenda-add-event-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dateStr = btn.getAttribute('data-date');
        this.openModal(dateStr);
      });
    });

    // Attach edit-event events
    grid.querySelectorAll('.agenda-event-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = pill.getAttribute('data-event-id');
        const dateStr = pill.getAttribute('data-date');
        const events = Storage.getAgendaEvents();
        const event = (events[dateStr] || []).find(ev => ev.id === eventId);
        if (event) this.openModal(dateStr, event);
      });
    });

    lucide.createIcons();
  }
};
