/* ==========================================================================
   MAIN MODULE (App Entry, Router & Layout Shell)
   ========================================================================== */

import { Storage } from './storage.js';
import { Dashboard } from './dashboard.js';
import { Todo } from './todo.js';
import { Canvas } from './canvas.js';
import { Chat } from './chat.js';

document.addEventListener('DOMContentLoaded', () => {
  initAppShell();
});

function initAppShell() {
  const sidebar = document.getElementById('app-sidebar');
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  
  const coverBannerImg = document.getElementById('cover-banner-img');
  const changeCoverBtn = document.getElementById('change-cover-btn');
  const coverDropdown = document.getElementById('cover-dropdown-menu');
  
  const pageEmojiBtn = document.getElementById('page-emoji-btn');
  const emojiPicker = document.getElementById('emoji-picker-menu');
  
  const pageTitle = document.getElementById('page-title-text');
  const pageSubtitle = document.getElementById('page-subtitle-text');
  const navItems = document.querySelectorAll('.nav-item');
  
  // 1. Initialize Icons
  lucide.createIcons();

  // 2. Load settings state
  const settings = Storage.getSettings();
  
  // Apply cover image
  if (settings.coverImage) {
    coverBannerImg.style.backgroundImage = `url('${settings.coverImage}')`;
  }
  
  // Apply emoji
  if (settings.emojiIcon) {
    pageEmojiBtn.textContent = settings.emojiIcon;
  }
  
  // Apply sidebar collapsed status
  if (settings.sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    expandBtn.classList.remove('hide');
  }

  // 3. Navigation routing
  const navigateTo = (viewName) => {
    // Hide all views
    document.querySelectorAll('.workspace-view').forEach(view => {
      view.classList.add('hide');
    });
    
    // Show active view
    const activeViewElement = document.getElementById(`${viewName}-view`);
    if (activeViewElement) {
      activeViewElement.classList.remove('hide');
    }

    // Highlight active nav item
    navItems.forEach(item => {
      if (item.getAttribute('data-view') === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update Header titles
    pageTitle.textContent = settings.pageTitles[viewName] || viewName;
    pageSubtitle.textContent = settings.pageSubtitles[viewName] || '';
    
    // Save active view
    Storage.saveSettings({ activeView: viewName });

    // Refresh active view dashboard modules
    if (viewName === 'dashboard') {
      Dashboard.render();
    } else if (viewName === 'todo') {
      Todo.render();
    } else if (viewName === 'canvas') {
      Canvas.render();
    } else if (viewName === 'journal') {
      Chat.render();
    }
  };

  // Nav Item click events
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      navigateTo(view);
      
      // Update browser URL hash quietly
      history.pushState(null, null, `#${view}`);
    });
  });

  // Handle URL hash on load
  const hash = window.location.hash.substring(1);
  const validViews = ['dashboard', 'todo', 'canvas', 'journal'];
  if (validViews.includes(hash)) {
    navigateTo(hash);
  } else {
    navigateTo(settings.activeView || 'dashboard');
  }

  // 4. Collapsible Sidebar logic
  collapseBtn.addEventListener('click', () => {
    sidebar.classList.add('collapsed');
    expandBtn.classList.remove('hide');
    Storage.saveSettings({ sidebarCollapsed: true });
  });

  expandBtn.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
    expandBtn.classList.add('hide');
    Storage.saveSettings({ sidebarCollapsed: false });
  });

  // 5. Change Cover dropdown logic
  changeCoverBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    coverDropdown.classList.toggle('hide');
  });

  document.querySelectorAll('.cover-preset').forEach(preset => {
    preset.addEventListener('click', () => {
      const imgUrl = preset.getAttribute('data-img');
      coverBannerImg.style.backgroundImage = `url('${imgUrl}')`;
      Storage.saveSettings({ coverImage: imgUrl });
      coverDropdown.classList.add('hide');
    });
  });

  // 6. Page Emoji Picker logic
  pageEmojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hide');
  });

  emojiPicker.addEventListener('click', (e) => {
    if (e.target.tagName === 'SPAN') {
      const selectedEmoji = e.target.textContent;
      pageEmojiBtn.textContent = selectedEmoji;
      
      // Update User profile avatar as well!
      document.getElementById('user-avatar-btn').textContent = selectedEmoji;
      
      Storage.saveSettings({ emojiIcon: selectedEmoji });
      emojiPicker.classList.add('hide');
    }
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    coverDropdown.classList.add('hide');
    emojiPicker.classList.add('hide');
  });

  // 7. Page Title Inline Editing
  pageTitle.addEventListener('blur', () => {
    const currentSettings = Storage.getSettings();
    const activeView = currentSettings.activeView;
    const cleanTitle = pageTitle.textContent.trim() || activeView.toUpperCase();
    pageTitle.textContent = cleanTitle;
    
    // Save to settings
    const pageTitles = { ...currentSettings.pageTitles };
    pageTitles[activeView] = cleanTitle;
    Storage.saveSettings({ pageTitles });
    
    // Update sidebar navigation link text!
    const targetLink = Array.from(navItems).find(item => item.getAttribute('data-view') === activeView);
    if (targetLink) {
      targetLink.querySelector('span').textContent = cleanTitle;
    }
  });

  // Keep Enter key from creating new lines in contenteditable
  pageTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      pageTitle.blur();
    }
  });

  // Initialize all view components once
  Dashboard.init();
  Todo.init();
  Canvas.init();
  Chat.init();
}
