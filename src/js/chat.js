/* ==========================================================================
   PROJECT LOG MODULE (Notion Chat-Style Update Journal)
   ========================================================================== */

import { Storage } from './storage.js';

let activeTagFilter = null; // Currently selected tag to filter logs

export const Chat = {
  init() {
    const sendBtn = document.getElementById('send-chat-btn');
    const chatInput = document.getElementById('chat-input');
    const searchInput = document.getElementById('journal-search-input');
    
    // Quick Tag Buttons
    const quickTagBtns = document.querySelectorAll('.quick-tag-btn');

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.postLogUpdate());
    }

    if (chatInput) {
      // Support Cmd/Ctrl+Enter to send updates quickly
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          this.postLogUpdate();
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        // Clear active tag filter if user starts writing in search directly, 
        // OR keep both. Let's combine them for maximum power.
        this.render();
      });
    }

    // Quick tags click behavior (appends tag to input)
    quickTagBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-tag');
        const text = chatInput.value;
        
        // Add spacing if input already has content
        const space = text.length > 0 && !text.endsWith(' ') ? ' ' : '';
        chatInput.value = `${text}${space}#${tag} `;
        chatInput.focus();
      });
    });

    // Listen to changes in logs data to update stream
    window.addEventListener('myspace-data-changed', (e) => {
      const { type } = e.detail;
      const currentSettings = Storage.getSettings();
      if (currentSettings.activeView === 'journal' && type === 'chat') {
        this.render();
      }
    });
  },

  postLogUpdate() {
    const chatInput = document.getElementById('chat-input');
    const text = chatInput.value.trim();
    if (!text) return;

    const chatLogs = Storage.getChatLogs();
    
    const newLog = {
      id: `chat-${Date.now()}`,
      text: text,
      timestamp: new Date().toISOString()
    };

    chatLogs.push(newLog);
    Storage.saveChatLogs(chatLogs);

    // Reset input
    chatInput.value = '';
    
    // Refresh view
    this.render();
    
    // Scroll chat stream to bottom
    setTimeout(() => {
      const container = document.getElementById('chat-stream-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  },

  deleteLogUpdate(logId) {
    if (confirm('Delete this project log update?')) {
      const logs = Storage.getChatLogs().filter(log => log.id !== logId);
      Storage.saveChatLogs(logs);
      this.render();
    }
  },

  setTagFilter(tag) {
    if (activeTagFilter === tag) {
      // Toggle off if clicking the active one
      activeTagFilter = null;
    } else {
      activeTagFilter = tag;
    }
    this.render();
  },

  // Helper to format timestamps nicely
  formatTimestamp(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    // If less than 1 min
    if (diffMins < 1) return 'Just now';
    
    // If less than 60 mins
    if (diffMins < 60) return `${diffMins}m ago`;
    
    // If less than 24 hours
    if (diffHours < 24) {
      if (date.getDate() === now.getDate()) {
        return `Today @ ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        return `Yesterday @ ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    }
    
    // Otherwise standard date format
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ` @ ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  },

  render() {
    const chatLogs = Storage.getChatLogs();
    const searchInput = document.getElementById('journal-search-input');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const streamContainer = document.getElementById('chat-stream-container');
    const tagsCloudContainer = document.getElementById('journal-tags-cloud');

    // 1. Parse and render Hashtag Cloud in Sidebar
    const tagCounts = {};
    chatLogs.forEach(log => {
      // Regex to extract all hashtags
      const tags = log.text.match(/#(\w+)/g);
      if (tags) {
        tags.forEach(tag => {
          const cleanTag = tag.substring(1).toLowerCase();
          tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
        });
      }
    });

    if (tagsCloudContainer) {
      if (Object.keys(tagCounts).length === 0) {
        tagsCloudContainer.innerHTML = `<div class="empty-state" style="padding: 10px 0;">No tags indexed yet.</div>`;
      } else {
        tagsCloudContainer.innerHTML = Object.keys(tagCounts)
          .map(tag => {
            const count = tagCounts[tag];
            const isActive = activeTagFilter === tag ? 'active' : '';
            return `
              <button class="trend-tag-btn ${isActive}" data-tag="${tag}">
                <span>#${tag}</span>
                <span class="trend-tag-count">${count}</span>
              </button>
            `;
          }).join('');

        // Wire up sidebar tag click filters
        tagsCloudContainer.querySelectorAll('.trend-tag-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            this.setTagFilter(tag);
          });
        });
      }
    }

    // 2. Filter logs based on search query and active tag
    let filteredLogs = [...chatLogs];
    
    if (activeTagFilter) {
      filteredLogs = filteredLogs.filter(log => {
        const tags = log.text.match(/#(\w+)/g);
        if (!tags) return false;
        return tags.some(t => t.substring(1).toLowerCase() === activeTagFilter);
      });
    }

    if (searchQuery) {
      filteredLogs = filteredLogs.filter(log => {
        return log.text.toLowerCase().includes(searchQuery);
      });
    }

    // Sort by timestamp desc (newest at bottom, wait - standard chats put newest at bottom. Let's put newest at the bottom so it flows like a chat, but auto scroll it to the bottom on render/load. Alternatively, reverse chronological works too. Let's make it standard chat layout: chronologically ascending, newest at bottom, so user can read downward.)
    filteredLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // 3. Render Stream logs
    if (streamContainer) {
      if (filteredLogs.length === 0) {
        streamContainer.innerHTML = `
          <div class="glass-card empty-state" style="margin-top: 10px;">
            <i data-lucide="inbox" style="width: 32px; height: 32px; margin: 0 auto 10px auto; display: block; color: var(--text-muted);"></i>
            No updates found matching your filter criteria.
          </div>
        `;
        lucide.createIcons();
      } else {
        streamContainer.innerHTML = filteredLogs.map(log => {
          const timeStr = this.formatTimestamp(log.timestamp);
          
          // Regex highlight hashtags inside card body and make them clickable links
          const highlightedText = log.text.replace(/#(\w+)/g, '<a class="hashtag" data-tag="$1">#$1</a>');

          return `
            <div class="glass-card chat-log-card" data-id="${log.id}">
              <div class="chat-log-header">
                <span class="chat-log-author">Captain</span>
                <span class="chat-log-date">${timeStr}</span>
              </div>
              <div class="chat-log-body">${highlightedText}</div>
              <div class="chat-log-footer">
                <button class="delete-log-btn" data-id="${log.id}">
                  <i data-lucide="trash-2"></i>
                  <span>Delete</span>
                </button>
              </div>
            </div>
          `;
        }).join('');

        // Wire up delete buttons
        streamContainer.querySelectorAll('.delete-log-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const logId = btn.getAttribute('data-id');
            this.deleteLogUpdate(logId);
          });
        });

        // Wire up clickable hashtags inside log cards
        streamContainer.querySelectorAll('a.hashtag').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const tag = link.getAttribute('data-tag').toLowerCase();
            this.setTagFilter(tag);
          });
        });

        lucide.createIcons();
      }
    }
  }
};
