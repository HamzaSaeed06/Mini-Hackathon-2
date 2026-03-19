/**
 * CareSync — Shared Utilities
 * Imported by all four role dashboards to avoid code duplication.
 */

// ── Toast Notifications ───────────────────────────────────────
export function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const iconMap = {
        success: 'check-circle-2',
        error:   'alert-circle',
        warning: 'alert-triangle',
        info:    'info',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i data-lucide="${iconMap[type] || 'info'}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });

    // Premium Animation in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    // Auto-remove with transition
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// ── Custom Confirm Dialog ─────────────────────────────────────
export function customConfirm(message, onConfirm, options = {}) {
    const MODAL_ID = 'custom-confirm-modal';
    let overlay = document.getElementById(MODAL_ID);
    const { 
        title       = 'Are you sure?', 
        icon        = 'alert-octagon', 
        confirmText = 'Delete', 
        cancelText  = 'Cancel',
        type        = 'danger' 
    } = options;

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = MODAL_ID;
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <button class="modal-close-btn" id="confirm-close-btn">
                    <i data-lucide="x"></i>
                </button>
                <div class="confirm-icon-circle">
                    <i id="confirm-icon-el" data-lucide="${icon}"></i>
                </div>
                <h3 id="confirm-title-text">${title}</h3>
                <p id="confirm-msg-text"></p>
                <div class="confirm-actions">
                    <button class="btn btn-secondary" id="confirm-cancel-btn">${cancelText}</button>
                    <button class="btn btn-primary"   id="confirm-ok-btn">
                        <span class="btn-text">${confirmText}</span>
                        <span class="btn-loader"></span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeBtn = document.getElementById('confirm-close-btn');
        closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
    }

    // Update dynamic content
    const iconEl   = document.getElementById('confirm-icon-el');
    const titleEl  = document.getElementById('confirm-title-text');
    const msgEl    = document.getElementById('confirm-msg-text');
    const okBtn    = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    msgEl.textContent   = message;
    titleEl.textContent = title;
    okBtn.querySelector('.btn-text').textContent = confirmText;
    cancelBtn.textContent = cancelText;
    
    // Update icon
    iconEl.setAttribute('data-lucide', icon);
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: overlay });

    overlay.className = `modal-overlay active type-${type}`;

    // Clean up old listeners (using cloneNode to avoid memory leaks/double triggers)
    const newOk     = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newCancel.addEventListener('click', () => overlay.classList.remove('active'));
    newOk.addEventListener('click', async () => {
        const btnText = newOk.querySelector('.btn-text');
        const originalText = btnText.textContent;
        
        try {
            newOk.classList.add('loading');
            newOk.disabled = true;
            // Update text to "Verb-ing..." if possible, else just keep original with loader
            if (confirmText.toLowerCase().includes('delete')) btnText.textContent = 'Deleting...';
            else if (confirmText.toLowerCase().includes('save')) btnText.textContent = 'Saving...';
            else if (confirmText.toLowerCase().includes('cancel')) btnText.textContent = 'Cancelling...';
            else if (confirmText.toLowerCase().includes('assign')) btnText.textContent = 'Assigning...';
            
            if (onConfirm) await onConfirm();
        } finally {
            newOk.classList.remove('loading');
            newOk.disabled = false;
            btnText.textContent = originalText;
            overlay.classList.remove('active');
        }
    });
}

// ── Navigation (section switching) ───────────────────────────
export function initNavigation() {
    const navItems  = document.querySelectorAll('.nav-item[data-target]');
    const sections  = document.querySelectorAll('.content-section');
    const pageTitle = document.getElementById('page-title');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            sections.forEach(s => {
                s.classList.remove('active');
                if (s.id === targetId) s.classList.add('active');
            });

            const title = item.getAttribute('data-title') || item.querySelector('span')?.textContent || '';
            if (pageTitle) pageTitle.textContent = title;

            if (window.innerWidth < 1024) closeSidebar();
        });
    });
}

// ── Sidebar ───────────────────────────────────────────────────
export function openSidebar() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('active');
}

export function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
}

export function initSidebar() {
    document.getElementById('hamburger-btn')?.addEventListener('click', openSidebar);
    document.getElementById('sidebar-close-btn')?.addEventListener('click', closeSidebar);
    document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

    window.openSidebar  = openSidebar;
    window.closeSidebar = closeSidebar;
}

// ── Logout ────────────────────────────────────────────────────
export function initLogout(auth, signOut, redirectPath = '../index.html') {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            signOut(auth)
                .then(() => {
                    localStorage.removeItem('userRole');
                    localStorage.removeItem('userName');
                    window.location.href = redirectPath;
                })
                .catch(() => showToast('Logout failed. Please try again.', 'error'));
        });
    }
}

// ── Avatar Initials ───────────────────────────────────────────
export function setAvatarInitials(name, avatarEl) {
    if (!avatarEl) return;
    const initials = (name || '?')
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    avatarEl.textContent = initials;
}

// ── Format Date ───────────────────────────────────────────────
export function formatDate(timestamp, locale = 'en-PK') {
    if (!timestamp) return '—';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Escape HTML (prevent XSS in dynamic innerHTML) ───────────
// ── Avatar Color Palettes ─────────────────────────────────────
export const AVATAR_PALETTES = [
    { text: '#2563eb', bg: '#dbeafe', border: '#2563eb' }, // Blue
    { text: '#16a34a', bg: '#dcfce7', border: '#16a34a' }, // Green
    { text: '#9333ea', bg: '#f3e8ff', border: '#9333ea' }, // Purple
    { text: '#ea580c', bg: '#ffedd5', border: '#ea580c' }, // Orange
    { text: '#db2777', bg: '#fce7f3', border: '#db2777' }, // Pink
    { text: '#0d9488', bg: '#ccfbf1', border: '#0d9488' }  // Teal
];

/**
 * Deterministically get a color palette index from a User ID string.
 */
export function getAvatarPalette(userId) {
    if (!userId || typeof userId !== 'string') return AVATAR_PALETTES[0];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_PALETTES.length;
    return AVATAR_PALETTES[index];
}

/**
 * Applies background and text color to a text-based avatar.
 */
export function applyAvatarStyle(userDocOrId, avatarEl) {
    if (!avatarEl || !userDocOrId) return;
    let uid = typeof userDocOrId === 'string' ? userDocOrId : (userDocOrId.uid || userDocOrId.id);
    let photo = typeof userDocOrId === 'object' ? userDocOrId.photoURL : null;
    if (photo) {
        avatarEl.style.backgroundColor = '';
        avatarEl.style.color = '';
        avatarEl.style.borderColor = '';
        avatarEl.style.borderWidth = '';
        avatarEl.style.borderStyle = '';
        return;
    }
    const palette = getAvatarPalette(uid);
    avatarEl.style.backgroundColor = palette.bg;
    avatarEl.style.color = palette.text;
    avatarEl.style.borderColor = palette.border;
    avatarEl.style.borderWidth = '1.5px';
    avatarEl.style.borderStyle = 'solid';
}

/**
 * Centralized logic for avatar HTML and styles.
 */
export function getAvatarConfig(user) {
    if (!user) return { html: '?', style: 'background:#f1f5f9; color:#64748b;', classes: '' };
    const uid = user.uid || user.id || '';
    const name = user.name || 'User';
    const photo = user.photoURL || '';
    const initial = (name || 'U')[0].toUpperCase();
    if (photo) {
        return {
            html: `<img src="${photo}" alt="${name}">`,
            style: 'background:transparent; border:none; padding:0;',
            classes: 'has-image'
        };
    } else {
        const pal = getAvatarPalette(uid);
        return {
            html: initial,
            style: `background:${pal.bg}; color:${pal.text}; border:1.5px solid ${pal.border};`,
            classes: 'has-initials'
        };
    }
}

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

