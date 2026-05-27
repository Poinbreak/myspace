/* ==========================================================================
   DASHBOARD MODULE (Overview, Metrics & Clock Component)
   ========================================================================== */

import { Storage } from './storage.js';

let clockInterval = null;
let chartInstance = null;

export const Dashboard = {
  init() {
    // Start clock interval
    this.startClock();
    
    // Subscribe to state changes to update dashboard stats reactively
    window.addEventListener('myspace-data-changed', (e) => {
      const { type } = e.detail;
      const currentSettings = Storage.getSettings();
      if (currentSettings.activeView === 'dashboard' && (type === 'todo' || type === 'canvas' || type === 'chat')) {
        this.render();
      }
    });
  },

  startClock() {
    if (clockInterval) clearInterval(clockInterval);
    
    const timeEl = document.getElementById('dashboard-time');
    const dateEl = document.getElementById('dashboard-date');
    const greetingEl = document.getElementById('dashboard-greeting');
    
    const updateTime = () => {
      const now = new Date();
      
      // Clock format (12-hour AM/PM)
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const timeStr = `${hours}:${minutes}:${seconds} ${ampm}`;
      
      if (timeEl) timeEl.textContent = timeStr;
      
      // Date format (e.g. Wednesday, May 27)
      const options = { weekday: 'long', month: 'long', day: 'numeric' };
      if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', options);
      
      // Dynamic Greeting based on time of day
      const currentHour = now.getHours();
      let greeting = 'Welcome back.';
      if (currentHour < 12) {
        greeting = 'Good morning. 🌅';
      } else if (currentHour < 18) {
        greeting = 'Good afternoon. ☀️';
      } else {
        greeting = 'Good evening. 🌌';
      }
      if (greetingEl) greetingEl.textContent = greeting;
    };
    
    updateTime();
    clockInterval = setInterval(updateTime, 1000);
  },

  render() {
    // 1. Calculate and update Task Stats
    const tasks = Storage.getTasks();
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    const completionRateEl = document.getElementById('todo-completion-rate');
    const progressBarEl = document.getElementById('todo-progress-bar');
    const completionFractionEl = document.getElementById('todo-completion-fraction');
    
    if (completionRateEl) completionRateEl.textContent = `${rate}%`;
    if (progressBarEl) progressBarEl.style.width = `${rate}%`;
    if (completionFractionEl) {
      completionFractionEl.textContent = `${completedTasks} / ${totalTasks} tasks completed`;
    }

    // 2. Count Canvas blocks
    const canvasItems = Storage.getCanvasItems();
    const canvasBlocksCountEl = document.getElementById('canvas-blocks-count');
    if (canvasBlocksCountEl) {
      canvasBlocksCountEl.textContent = canvasItems.length;
    }

    // 3. Render recent chat logs
    const chatLogs = Storage.getChatLogs();
    const dashboardRecentLogsEl = document.getElementById('dashboard-recent-logs');
    if (dashboardRecentLogsEl) {
      if (chatLogs.length === 0) {
        dashboardRecentLogsEl.innerHTML = `<div class="empty-state">No logs added yet. Head to the Project Log to add updates.</div>`;
      } else {
        // Take latest 3 logs sorted by timestamp desc
        const sortedLogs = [...chatLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 3);
        
        dashboardRecentLogsEl.innerHTML = sortedLogs.map(log => {
          const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const date = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
          
          // Render plain content with tags highligted (basic regex highlight)
          const highlightedText = log.text.replace(/#(\w+)/g, '<span style="color:var(--accent-magenta); font-weight:600;">#$1</span>');
          
          return `
            <div class="dashboard-log-item">
              <span class="dashboard-log-meta">${date} @ ${time}</span>
              <p>${highlightedText}</p>
            </div>
          `;
        }).join('');
      }
    }

    // 4. Render Chart.js breakdown
    this.renderTaskDistributionChart(tasks);
  },

  renderTaskDistributionChart(tasks) {
    const ctx = document.getElementById('taskDistributionChart');
    if (!ctx) return;

    const counts = { waiting: 0, doing: 0, partial: 0, completed: 0 };
    tasks.forEach(t => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++;
      }
    });

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Waiting', 'Doing', 'Partial Complete', 'Completed'],
        datasets: [{
          data: [counts.waiting, counts.doing, counts.partial, counts.completed],
          backgroundColor: [
            'rgba(120, 119, 116, 0.2)', // Waiting (Gray)
            'rgba(35, 131, 226, 0.2)',  // Doing (Blue)
            'rgba(203, 147, 42, 0.2)',  // Partial (Yellow)
            'rgba(68, 131, 97, 0.2)'    // Completed (Green)
          ],
          borderColor: [
            '#787774',
            '#2383e2',
            '#cb932a',
            '#448361'
          ],
          borderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#787774',
              font: {
                family: 'sans-serif',
                size: 12,
                weight: '500'
              },
              padding: 15
            }
          }
        }
      }
    });
  }
};
