/**
 * E-CHUNAB - Global Utilities & UI Helpers (utils.js)
 * Clean, modular vanilla JavaScript helpers
 */

// DOM Selector Shortcuts
const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));

/**
 * Toast Notification System (Replaces browser alert)
 * @param {'success'|'error'|'warning'|'info'} type 
 * @param {string} title 
 * @param {string} message 
 * @param {number} duration ms
 */
function showToast(type = 'info', title = '', message = '', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');

  // Icons based on type
  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <div style="font-weight:bold; font-size:1.1rem;">${iconMap[type] || 'ℹ'}</div>
    <div style="flex:1;">
      <div class="toast-title">${escapeHTML(title)}</div>
      ${message ? `<div class="toast-message">${escapeHTML(message)}</div>` : ''}
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 250ms ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, duration);
}

/**
 * Escape HTML to prevent XSS in dynamic rendering
 */
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Modal Management
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/**
 * Format ISO date string into readable human format
 */
function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Responsive Mobile Sidebar Drawer Toggle
 */
function initMobileSidebar() {
  const toggleBtn = document.querySelector('.sidebar-toggle-btn');
  const sidebar = document.querySelector('.app-sidebar');
  let overlay = document.querySelector('.sidebar-overlay');

  if (!overlay && sidebar) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active');
    });
  }

  if (overlay && sidebar) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }
}

// Automatically init responsive sidebar on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initMobileSidebar();
});

// Expose utilities globally
window.showToast = showToast;
window.escapeHTML = escapeHTML;
window.openModal = openModal;
window.closeModal = closeModal;
window.formatDateTime = formatDateTime;
window.formatDate = formatDate;
window.initMobileSidebar = initMobileSidebar;
window.$ = $;
window.$$ = $$;
