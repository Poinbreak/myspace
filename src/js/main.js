/* ==========================================================================
   MAIN MODULE (App Entry, Router & Layout Shell)
   ========================================================================== */

import { Storage } from './storage.js';
import { Dashboard } from './dashboard.js';
import { Todo } from './todo.js';
import { Canvas } from './canvas.js';
import { Chat } from './chat.js';
import { Habit } from './habit.js';
import { Agenda } from './agenda.js';

document.addEventListener('DOMContentLoaded', () => {
  initAppShell();
});

function initAppShell() {
  const sidebar = document.getElementById('app-sidebar');
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  const coverBannerImg = document.getElementById('cover-banner-img');
  const changeCoverBtn = document.getElementById('change-cover-btn');
  const coverDropdown = document.getElementById('cover-dropdown-menu');
  const coverFileInput = document.getElementById('cover-file-input');
  const coverUrlInput = document.getElementById('cover-url-input');
  const coverUrlApplyBtn = document.getElementById('cover-url-apply-btn');

  const pageEmojiBtn = document.getElementById('page-emoji-btn');
  const emojiPicker = document.getElementById('emoji-picker-menu');

  const pageTitle = document.getElementById('page-title-text');
  const pageSubtitle = document.getElementById('page-subtitle-text');
  const navItems = document.querySelectorAll('.nav-item');

  const validViews = ['dashboard', 'todo', 'canvas', 'journal', 'habits', 'agenda'];

  // 1. Initialize Icons
  lucide.createIcons();

  // 2. Load settings state
  const settings = Storage.getSettings();

  if (settings.coverImage) {
    coverBannerImg.style.backgroundImage = `url('${settings.coverImage}')`;
  }
  if (settings.emojiIcon) {
    pageEmojiBtn.textContent = settings.emojiIcon;
    const avatarBtn = document.getElementById('user-avatar-btn');
    if (avatarBtn) avatarBtn.textContent = settings.emojiIcon;
  }
  if (settings.sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    if (expandBtn) expandBtn.classList.remove('hide');
  }

  // 3. Navigation routing
  const navigateTo = (viewName) => {
    document.querySelectorAll('.workspace-view').forEach(view => view.classList.add('hide'));
    const activeViewElement = document.getElementById(`${viewName}-view`);
    if (activeViewElement) activeViewElement.classList.remove('hide');

    navItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === viewName);
    });

    const currentSettings = Storage.getSettings();
    pageTitle.textContent = currentSettings.pageTitles[viewName] || viewName;
    pageSubtitle.textContent = currentSettings.pageSubtitles[viewName] || '';

    Storage.saveSettings({ activeView: viewName });

    if (viewName === 'dashboard') Dashboard.render();
    else if (viewName === 'todo') Todo.render();
    else if (viewName === 'canvas') Canvas.render();
    else if (viewName === 'journal') Chat.render();
    else if (viewName === 'habits') Habit.render();
    else if (viewName === 'agenda') Agenda.render();

    // Auto-close sidebar on mobile
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }
  };

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      navigateTo(view);
      history.pushState(null, null, `#${view}`);
    });
  });

  const hash = window.location.hash.substring(1);
  if (validViews.includes(hash)) {
    navigateTo(hash);
  } else {
    navigateTo(settings.activeView || 'dashboard');
  }

  // 4. Collapsible Sidebar (Desktop)
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      sidebar.classList.add('collapsed');
      if (expandBtn) expandBtn.classList.remove('hide');
      Storage.saveSettings({ sidebarCollapsed: true });
    });
  }
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      expandBtn.classList.add('hide');
      Storage.saveSettings({ sidebarCollapsed: false });
    });
  }

  // 5. Mobile sidebar
  function openMobileSidebar() {
    sidebar.classList.add('mobile-open');
    if (sidebarOverlay) sidebarOverlay.classList.add('visible');
  }
  function closeMobileSidebar() {
    sidebar.classList.remove('mobile-open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('visible');
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('mobile-open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeMobileSidebar);
  }

  // 6. Cover dropdown logic
  if (changeCoverBtn) {
    changeCoverBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      coverDropdown.classList.toggle('hide');
    });
  }

  // Preset covers
  document.querySelectorAll('.cover-preset').forEach(preset => {
    preset.addEventListener('click', () => {
      const imgUrl = preset.getAttribute('data-img');
      applyCover(imgUrl);
      coverDropdown.classList.add('hide');
    });
  });

  // File upload
  if (coverFileInput) {
    coverFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        applyCover(ev.target.result);
        coverDropdown.classList.add('hide');
      };
      reader.readAsDataURL(file);
      coverFileInput.value = ''; // reset
    });
  }

  // URL input
  if (coverUrlApplyBtn && coverUrlInput) {
    coverUrlApplyBtn.addEventListener('click', () => {
      const url = coverUrlInput.value.trim();
      if (url) {
        applyCover(url);
        coverUrlInput.value = '';
        coverDropdown.classList.add('hide');
      }
    });
    coverUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') coverUrlApplyBtn.click();
    });
  }

  function applyCover(url) {
    coverBannerImg.style.backgroundImage = `url('${url}')`;
    Storage.saveSettings({ coverImage: url });
  }

  // 7. Page Emoji Picker
  if (pageEmojiBtn) {
    pageEmojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('hide');
    });
  }
  if (emojiPicker) {
    emojiPicker.addEventListener('click', (e) => {
      if (e.target.tagName === 'SPAN') {
        const selectedEmoji = e.target.textContent;
        pageEmojiBtn.textContent = selectedEmoji;
        const avatarBtn = document.getElementById('user-avatar-btn');
        if (avatarBtn) avatarBtn.textContent = selectedEmoji;
        Storage.saveSettings({ emojiIcon: selectedEmoji });
        emojiPicker.classList.add('hide');
      }
    });
  }

  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    coverDropdown?.classList.add('hide');
    emojiPicker?.classList.add('hide');
  });

  // 8. Page Title Inline Editing
  if (pageTitle) {
    pageTitle.addEventListener('blur', () => {
      const currentSettings = Storage.getSettings();
      const activeView = currentSettings.activeView;
      const cleanTitle = pageTitle.textContent.trim() || activeView.toUpperCase();
      pageTitle.textContent = cleanTitle;
      const pageTitles = { ...currentSettings.pageTitles, [activeView]: cleanTitle };
      Storage.saveSettings({ pageTitles });
      const targetLink = Array.from(navItems).find(item => item.getAttribute('data-view') === activeView);
      if (targetLink) targetLink.querySelector('span').textContent = cleanTitle;
    });
    pageTitle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); pageTitle.blur(); }
    });
  }

  // 9. Initialize all view modules
  Dashboard.init();
  Todo.init();
  Canvas.init();
  Chat.init();
  Habit.init();
  Agenda.init();
}
