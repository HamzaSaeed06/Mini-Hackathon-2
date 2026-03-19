import { auth, db } from '../../js/firebase-config.js';
import {
    onAuthStateChanged, signOut,
    createUserWithEmailAndPassword, getAuth
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, getDoc, setDoc, updateDoc,
    deleteDoc, collection, query, where,
    serverTimestamp, onSnapshot, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { renderPagination } from '../../js/pagination.js';
import { 
    applyAvatarStyle, 
    AVATAR_PALETTES,
    getAvatarPalette,
    getAvatarConfig,
    customConfirm,
    showToast
} from '../../js/utils.js';

// ── DOM refs ──────────────────────────────────────────────────
const displayName = document.getElementById('display-name');
const userAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');
const navItems = document.querySelectorAll('.nav-item[data-target]');
const sections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('page-title');

// Metric card elements
const statPatients = document.getElementById('stat-patients');
const statDoctors = document.getElementById('stat-doctors');
const statAppointments = document.getElementById('stat-appointments');
const statRevenue = document.getElementById('stat-revenue');
const trendPatients = document.getElementById('trend-patients');
const trendDoctors = document.getElementById('trend-doctors');
const trendAppts = document.getElementById('trend-appts');

const ADMIN_PER_PAGE = 6;
const adminPages = { doctors: 1, receptionists: 1, patients: 1 };
const staffDataCache = { doctors: [], receptionists: [], patients: [] };

// Instant initialization
if (window.lucide) lucide.createIcons();
const diagList = document.getElementById('diagnosis-list');

let userData = null;
let patientChartInstance = null;
let appointmentStatusChart = null;

// Auth Guard is handled at the bottom of the file for full initialization.

// â”€â”€ Photo Upload UX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let pendingPhotoFile = null;

async function handlePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    pendingPhotoFile = file;
    const avatarEl = document.getElementById('profile-avatar-display');
    const btn = document.querySelector('.btn-edit-avatar');

    // Show Preview
    const reader = new FileReader();
    reader.onload = (e) => {
        avatarEl.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        avatarEl.classList.remove('avatar-placeholder-circle');
    };
    reader.readAsDataURL(file);

    // Change Button to "Upload" mode
    btn.innerHTML = `<i data-lucide="check" style="width: 18px;"></i>`;
    btn.title = "Confirm Upload";
    btn.onclick = handleActualUpload;
    btn.style.background = "#22c55e"; // Success green
    btn.style.color = "white";
    
    if (window.lucide) lucide.createIcons();
}

async function handleActualUpload() {
    if (!pendingPhotoFile) return;

    const btn = document.querySelector('.btn-edit-avatar');
    
    const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/ds05q0lls/image/upload';
    const UPLOAD_PRESET = 'Ai Clinic';

    const formData = new FormData();
    formData.append('file', pendingPhotoFile);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
        btn.classList.add('loading-photo');
        btn.disabled = true;

        const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
        const data = await response.json();
        
        if (data.secure_url) {
            const photoURL = data.secure_url;
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { photoURL });
            
            // Sync Global State
            if (userData) userData.photoURL = photoURL;

            // Global Sync: Update all instances of the avatar on the page
            const avatarDisplays = [
                document.getElementById('profile-avatar-display'),
                document.getElementById('user-avatar')
            ];

            avatarDisplays.forEach(el => {
                if (el) {
                    el.innerHTML = `<img src="${photoURL}" alt="Profile">`;
                    el.classList.remove('avatar-placeholder-circle');
                    if (el.id === 'profile-avatar-display') el.style.background = 'transparent';
                }
            });

            showToast('Profile photo updated!', 'success');
            
            // Enable download button immediately
            const downloadBtn = document.getElementById('profile-download-id-btn');
            const warningMsg = document.getElementById('photo-required-msg');
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.onclick = () => window.downloadIDCardDirectly(auth.currentUser.uid, 'admin');
            }
            if (warningMsg) warningMsg.style.display = 'none';
        } else {
            throw new Error('Upload failed');
        }
    } catch (err) {
        console.error(err);
        showToast('Photo upload failed.', 'error');
    } finally {
        btn.classList.remove('loading-photo');
        btn.disabled = false;
        resetUploadButton();
    }
}

// ── Profile Updates ──
const profileForm = document.getElementById('profile-form');
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showToast('Profile updated successfully!', 'success');
    });
}

function resetUploadButton() {
    const btn = document.querySelector('.btn-edit-avatar');
    btn.innerHTML = `<i data-lucide="camera" style="width: 18px;"></i>`;
    btn.title = "Upload Photo";
    btn.onclick = () => document.getElementById('photo-upload-input').click();
    btn.style.background = "white";
    btn.style.color = "var(--profile-text)";
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
}

window.handlePhotoSelect = handlePhotoSelect;
window.handleActualUpload = handleActualUpload;

function populateProfile(uid, data) {
    const nameEl = document.getElementById('profile-name-display');
    const emailEl = document.getElementById('profile-email-display');
    const idEl = document.getElementById('profile-id-display');
    const avatarEl = document.getElementById('profile-avatar-display');
    const joinedEl = document.getElementById('profile-joined-display');

    if (nameEl) nameEl.textContent = data.name || 'Admin';
    if (emailEl) emailEl.textContent = data.email || 'admin@caresync.com';
    if (idEl) idEl.textContent = `#ADM-${uid.substring(0, 5).toUpperCase()}`;
    
    if (avatarEl) {
        const { html, style, classes } = getAvatarConfig(data);
        avatarEl.innerHTML = html;
        avatarEl.className = `avatar-placeholder-circle ${classes}`;
        avatarEl.style.cssText = style;
        if (data.photoURL) avatarEl.style.background = 'transparent';
    }
    
    if (joinedEl && data.createdAt) {
        const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        joinedEl.textContent = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
}

// â”€â”€ Logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
logoutBtn?.addEventListener('click', async () => {
    await signOut(auth);
    localStorage.clear();
    window.location.href = '../index.html';
});

// â”€â”€ Sidebar Toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.openSidebar = () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('active');
};
window.closeSidebar = () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
};

// â”€â”€ Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetId = item.getAttribute('data-target');
        if (!targetId) return;

        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        sections.forEach(sec => {
            sec.classList.remove('active');
            if (sec.id === targetId) sec.classList.add('active');
        });

        const newTitle = item.getAttribute('data-title') || item.querySelector('span').textContent;
        if (pageTitle) pageTitle.textContent = newTitle;
        
        // --- Navigation Logic without perception delays ---
        if (targetId === 'dashboard-section' || targetId === 'overview-section') {
            if (!item.dataset.loaded) {
                item.dataset.loaded = 'true';
                fetchDashboardStats();
            }
        } else if (targetId === 'appointments-section') {
            if (!item.dataset.loaded) {
                item.dataset.loaded = 'true';
            }
            displayAppts();
        } else {
            const tableType = targetId.split('-')[0]; // 'doctors', 'patients', 'receptionists'
            if (['doctors', 'receptionists', 'patients'].includes(tableType)) {
                if (!item.dataset.loaded) {
                    item.dataset.loaded = 'true';
                }
                displayFilteredData(tableType, staffDataCache[tableType] || []);
            }
        }

        // Special handling for smart scheduling section
        if (targetId === 'smart-scheduling-section') {
            if (!item.dataset.loaded) {
                // Initialize smart scheduling functionality
                if (window.smartScheduling) {
                    window.smartScheduling.renderSchedulingInterface();
                }
                item.dataset.loaded = 'true';
            }
        }

        // Special handling for profile
        if (targetId === 'profile-section') {
            if (userData) {
                populateProfile(auth.currentUser.uid, userData);
            }
        }

        if (window.innerWidth < 1024) window.closeSidebar();
    });
});

// â”€â”€ Modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.openModal = (modalId, roleType = null) => {
    document.getElementById(modalId)?.classList.add('active');
    if (roleType && modalId === 'add-staff-modal') {
        document.getElementById('modal-staff-title').textContent =
            'Add New ' + roleType.charAt(0).toUpperCase() + roleType.slice(1);
        document.getElementById('staff-role-input').value = roleType;
        
        // Show/hide doctor specific fields
        const doctorFields = document.getElementById('doctor-fields');
        if (doctorFields) {
            if (roleType === 'doctor') {
                doctorFields.classList.remove('hidden');
            } else {
                doctorFields.classList.add('hidden');
            }
        }
        if (window.lucide) lucide.createIcons();
    }
};
window.closeModal = (modalId) => {
    const m = document.getElementById(modalId);
    m?.classList.remove('active');
    m?.querySelector('form')?.reset();
};
document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); })
);

// ── Functional Components (Re-render actual UI) ────────────────
function updateMetricCard(id, title, value, iconClass, trendData = null) {
    const card = document.getElementById(id);
    if (!card) return;

    let trendHTML = '';
    if (trendData) {
        const trendClass = trendData.isUp ? 'text-success' : 'text-danger';
        const trendIcon = trendData.isUp ? 'trending-up' : 'trending-down';
        trendHTML = `
            <div class="metric-trend ${trendClass}">
                <i data-lucide="${trendIcon}"></i>
                <span>${trendData.value}</span> vs last month
            </div>
        `;
    }

    card.innerHTML = `
        <div class="metric-header">
            <span class="metric-title">${title}</span>
            <div class="metric-icon ${id.includes('doctors') ? 'success' : (id.includes('appointments') ? 'warning' : (id.includes('revenue') ? 'revenue' : ''))}">
                <i data-lucide="${iconClass}"></i>
            </div>
        </div>
        <div class="metric-value">${value}</div>
        ${trendHTML}
    `;
    if (window.lucide) lucide.createIcons();
}

async function fetchDashboardStats() {
    // Real-time listener for users (Patients & Doctors)
    onSnapshot(collection(db, 'users'), (snap) => {
        let doctors = 0, patients = 0;
        const monthlyData = [0, 0, 0, 0, 0, 0, 0];
        const now = new Date();
        
        snap.forEach(d => {
            const data = d.data();
            const r = data.role;
            if (r === 'doctor') doctors++;
            if (r === 'patient') {
                patients++;
                if (data.createdAt?.toDate) {
                    const cDate = data.createdAt.toDate();
                    const diffMonths = (now.getFullYear() - cDate.getFullYear()) * 12 + (now.getMonth() - cDate.getMonth());
                    if (diffMonths >= 0 && diffMonths < 7) {
                        monthlyData[6 - diffMonths]++;
                    }
                }
            }
        });

        updateMetricCard('metric-patients-card', 'Total Patients', patients, 'users', { isUp: true, value: '+5%' });
        updateMetricCard('metric-doctors-card', 'Total Doctors', doctors, 'stethoscope', { isUp: true, value: 'Active' });
        
        const revenue = (doctors * 200 + patients * 50);
        updateMetricCard('metric-revenue-card', 'Simulated Revenue', `$${revenue.toLocaleString()}`, 'dollar-sign', { isUp: true, value: 'Steady' });

        if (patientChartInstance) {
            patientChartInstance.data.datasets[0].data = monthlyData;
            patientChartInstance.update();
        }
    }, (err) => {
        console.warn('Users stats listener error (may be offline):', err.code);
    });

    onSnapshot(collection(db, 'appointments'), (snap) => {
        const total = snap.size;
        updateMetricCard('metric-appointments-card', 'Appointments (Month)', total, 'calendar-check', { isUp: true, value: '+12%' });

        const counts = { completed: 0, pending: 0, cancelled: 0 };
        snap.forEach(d => {
            const s = d.data().status;
            if (s === 'completed') counts.completed++;
            else if (s === 'cancelled') counts.cancelled++;
            else counts.pending++;
        });
        updateAppointmentChart(counts);
    }, (err) => {
        console.warn('Appointments stats listener error (may be offline):', err.code);
    });
}

// ── Diagnosis & Status Listeners ──────────────────────────────
function initRealtimeListeners() {
    onSnapshot(collection(db, 'diagnosisLogs'), (snap) => {
        const diagList = document.getElementById('diagnosis-list');
        if (!diagList) return;

        if (snap.empty) {
            diagList.innerHTML = '<li class="empty-state">No diagnosis data yet.</li>';
            return;
        }

        const counts = {};
        snap.forEach(doc => {
            const symptoms = doc.data().symptoms || 'Unknown';
            counts[symptoms] = (counts[symptoms] || 0) + 1;
        });

        const topDiag = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        diagList.innerHTML = topDiag.map(([name, count], index) => `
            <li class="diagnosis-item">
                <span class="diag-rank">${index + 1}.</span>
                <span class="diag-name" style="flex: 1;">${name}</span>
                <span class="diag-count" style="font-weight: 600; font-size: 0.85rem; color: var(--text-muted);">${count} Cases</span>
            </li>
        `).join('');
    }, (err) => {
        console.warn('Diagnosis logs listener error (may be offline):', err.code);
    });
}

// ── Real-time Staff Tables ──────────────────────────────────
function renderStaffTable(type) {
    const role = type === 'doctors' ? 'doctor' : (type === 'receptionists' ? 'receptionist' : 'patient');
    fetchData(type, role);
}

function fetchData(type, role) {
    const tbody = document.getElementById(`${type}-table-body`);
    
    if (window.lucide) lucide.createIcons();

    const q = query(collection(db, 'users'), where('role', '==', role));

    onSnapshot(q, (snap) => {
        const members = [];
        snap.forEach(d => members.push({ uid: d.id, ...d.data() }));
        staffDataCache[type] = members; // Cache for searching
        adminPages[type] = 1; // Reset to page 1 on fresh data
        displayFilteredData(type, members);
    }, (e) => {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Error loading data.</td></tr>`;
        console.error('Snapshot error:', e);
    });
}

// ── Shared UI Utilities ──────────────────────────────────
const getAvatarHTML = (m) => {
    const { html, style, classes } = getAvatarConfig(m);
    return `<div class="user-avatar-sm ${classes}" style="display:inline-flex; align-items:center; justify-content:center; ${style}">${html}</div>`;
};

function displayFilteredData(type, members) {
    const tbody = document.getElementById(`${type}-table-body`);
    const cardGrid = document.getElementById(`${type}-card-grid`);
    const pagination = document.getElementById(`${type}-pagination`);
    const infoSpan = document.getElementById(`${type}-page-info`);

    if (!members.length) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No matching ${type} found.</td></tr>`;
        if (cardGrid) cardGrid.innerHTML = `<p class="empty-state" style="padding:2rem;text-align:center;">No ${type} found.</p>`;
        if (pagination) pagination.style.display = 'none';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(members.length / ADMIN_PER_PAGE));
    if (adminPages[type] > totalPages) adminPages[type] = totalPages;
    const startIndex = (adminPages[type] - 1) * ADMIN_PER_PAGE;
    const paginatedMembers = members.slice(startIndex, startIndex + ADMIN_PER_PAGE);

    const tableContent = paginatedMembers.map(m => {
        const joinedDate = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const isInactive = m.status === 'inactive';
        const statusLabel = isInactive ? 'Inactive' : 'Active';
        
        if (type === 'patients') {
            const healthStatus = m.healthStatus || 'Normal';
            const healthClass = healthStatus.toLowerCase().replace(' ', '-');
            return `
                <tr class="admin-table-row">
                    <td>
                        <div class="user-info-cell">
                            ${getAvatarHTML(m)}
                            <div class="user-details">
                                <span class="user-name-text">${m.name || '—'}</span>
                                <span class="user-email-subtext">${m.email || '—'}</span>
                            </div>
                        </div>
                    </td>
                    <td class="table-cell-muted">${m.email || '—'}</td>
                    <td class="table-cell-muted">${joinedDate}</td>
                    <td><span class="health-badge ${healthClass}"><span class="status-dot-indicator"></span>${healthStatus}</span></td>
                    <td class="table-actions-cell">
                        <button class="icon-btn-subtle" title="View Records" onclick="viewPatientDetails('${m.uid}')">
                            <i data-lucide="external-link"></i>
                        </button>
                    </td>
                </tr>
            `;
        }

        return `
            <tr class="admin-table-row ${isInactive ? 'row-inactive' : ''}">
                <td>
                    <div class="user-info-cell">
                        ${getAvatarHTML(m)}
                        <div class="user-details">
                            <span class="user-name-text">${m.name || '—'}</span>
                            <span class="user-email-subtext">${m.email || '—'}</span>
                        </div>
                    </div>
                </td>
                <td class="table-cell-muted">${m.email || '—'}</td>
                <td class="table-cell-muted">${joinedDate}</td>
                <td>
                    <div class="status-toggle-wrapper" title="Change status to ${isInactive ? 'Active' : 'Inactive'}"
                        onclick="toggleStatus('${m.uid}','${m.status || 'active'}','${type}')">
                        <span class="status-dot ${m.status || 'active'}"></span>
                        <span class="status-text-compact">${statusLabel}</span>
                    </div>
                </td>
                <td class="table-actions-cell">
                    <button class="icon-btn-subtle" title="Delete Account" onclick="deleteStaff('${m.uid}', '${type}')">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (tbody) tbody.innerHTML = tableContent;

    const cardsContent = paginatedMembers.map(m => {
        const joinedDate = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const isInactive = m.status === 'inactive';
        const statusLabel = isInactive ? 'Inactive' : 'Active';
        const roleLabel = type === 'doctors' ? 'Doctor' : type === 'receptionists' ? 'Receptionist' : 'Patient';
        
        return `
            <div class="staff-card v-excellence" style="${isInactive ? 'opacity:0.7;' : ''}">
                <div class="staff-card-header">
                    <div class="staff-header-info">
                        ${getAvatarHTML(m).replace('user-avatar-sm', 'avatar-circle')}
                        <div class="staff-title-box">
                            <span class="staff-name">${m.name || '—'}</span>
                            <span class="staff-role-tag">${roleLabel}</span>
                        </div>
                    </div>
                    ${type === 'patients' 
                        ? `<span class="health-badge ${(m.healthStatus || 'Normal').toLowerCase().replace(' ','-')}"><span class="status-dot-indicator"></span>${m.healthStatus || 'Normal'}</span>`
                        : `<span class="status-indicator-pill ${m.status || 'active'}"><span class="status-dot-indicator"></span>${statusLabel}</span>`
                    }
                </div>
                
                <div class="staff-card-body">
                    <div class="staff-detail-row">
                        <i data-lucide="mail"></i>
                        <span>${m.email || '—'}</span>
                    </div>
                    <div class="staff-detail-row">
                        <i data-lucide="calendar"></i>
                        <span>Joined: ${joinedDate}</span>
                    </div>
                </div>
                
                <div class="staff-card-footer">
                    ${type === 'patients' ? `
                        <button class="btn btn-primary btn-full" onclick="viewPatientDetails('${m.uid}')">
                            <i data-lucide="external-link"></i> View Full Records
                        </button>
                    ` : `
                        <button class="btn btn-secondary" onclick="toggleStatus('${m.uid}', '${m.status || 'active'}', '${type}')">
                            <i data-lucide="power"></i> Status
                        </button>
                        <button class="btn btn-danger" onclick="deleteStaff('${m.uid}', '${type}')">
                            <i data-lucide="trash-2"></i> Delete
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    if (cardGrid) cardGrid.innerHTML = cardsContent;

    if (infoSpan) infoSpan.textContent = `Page ${adminPages[type]} of ${totalPages}`;
    if (pagination) {
        pagination.style.display = totalPages > 1 ? 'flex' : 'none';
    }
    if (window.lucide) {
        lucide.createIcons();
        setTimeout(() => lucide.createIcons(), 10);
    }

    // Pagination Controls
    if (pagination && totalPages > 1) {
        renderPagination(
            pagination,
            adminPages[type],
            totalPages,
            (newPage) => {
                adminPages[type] = newPage;
                const queryVal = document.getElementById(`${type.slice(0, -1)}-search`)?.value.toLowerCase() || '';
                if (queryVal) {
                    const filtered = staffDataCache[type].filter(m =>
                        m.name?.toLowerCase().includes(queryVal) ||
                        m.email?.toLowerCase().includes(queryVal)
                    );
                    displayFilteredData(type, filtered);
                } else {
                    displayFilteredData(type, staffDataCache[type]);
                }
            }
        );
    } else if (pagination) {
        pagination.style.display = 'none';
        pagination.innerHTML = '';
    }
}

// ── Search Logic ────────────────────────────────────────────────────────
window.filterTable = (type) => {
    const query = document.getElementById(`${type.slice(0, -1)}-search`).value.toLowerCase();
    const allMembers = staffDataCache[type];
    const filtered = allMembers.filter(m =>
        m.name?.toLowerCase().includes(query) ||
        m.email?.toLowerCase().includes(query)
    );
    displayFilteredData(type, filtered);
};


// â”€â”€ Patient Details (Simulated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.viewPatientDetails = (uid) => {
    const patient = staffDataCache.patients.find(p => p.uid === uid);
    if (!patient) return;

    const joinedDate = patient.createdAt?.toDate
        ? patient.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
        : patient.createdAt?.seconds
            ? new Date(patient.createdAt.seconds * 1000).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';

    const healthClass = (patient.healthStatus || 'normal').toLowerCase().replace(' ', '-');
    const initial = (patient.name || 'P')[0].toUpperCase();
    const palette = getAvatarPalette(patient.uid);
    const avatarHTML = patient.photoURL
        ? `<img src="${patient.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : initial;

    // Inject content into existing patient-detail-modal
    const modal = document.getElementById('patient-detail-modal');
    if (!modal) return;

    const { html, style, classes } = getAvatarConfig(patient);
    const pdmAvatar = modal.querySelector('#pdm-avatar');
    pdmAvatar.innerHTML = html;
    pdmAvatar.className = `patient-detail-avatar ${classes}`;
    pdmAvatar.style.cssText = style;
    if (patient.photoURL) pdmAvatar.style.background = 'transparent';
    modal.querySelector('#pdm-name').textContent = patient.name || '—';
    modal.querySelector('#pdm-email').textContent = patient.email || '—';
    modal.querySelector('#pdm-joined').textContent = joinedDate;
    const healthEl = modal.querySelector('#pdm-health');
    if (healthEl) {
        healthEl.textContent = patient.healthStatus || 'Normal';
        healthEl.className = `health-badge ${healthClass}`;
    }
    const statusEl = modal.querySelector('#pdm-status');
    if (statusEl) {
        statusEl.textContent = patient.status === 'inactive' ? 'Inactive' : 'Active';
        statusEl.className = `status-indicator-pill ${patient.status || 'active'}`;
    }

    modal.classList.add('active');
};

// â”€â”€ Toggle Active / Inactive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.toggleStatus = (uid, currentStatus, tableType) => {
    const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
    const action = newStatus === 'active' ? 'activate' : 'deactivate';
    
    customConfirm(`Do you really want to ${action} this account? This will affect user access.`, async () => {
        try {
            await updateDoc(doc(db, 'users', uid), { status: newStatus });
            showToast(`Staff marked as ${newStatus}`, 'success');
            renderStaffTable(tableType);
        } catch (e) {
            showToast('Failed to update status.', 'error');
        }
    }, {
        title: 'Are you sure?',
        icon: 'power',
        confirmText: 'Proceed',
        type: 'warning'
    });
};

// â”€â”€ Delete Staff â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.deleteStaff = (uid, tableType) => {
    customConfirm('Do you really want to delete this account? This process cannot be undone.', async () => {
        try {
            await deleteDoc(doc(db, 'users', uid));
            showToast('Account deleted.', 'success');
            renderStaffTable(tableType);
            fetchDashboardStats();
        } catch (e) {
            showToast('Failed to delete account.', 'error');
        }
    }, {
        title: 'Are you sure?',
        icon: 'alert-octagon',
        confirmText: 'Delete',
        type: 'danger'
    });
};

// â”€â”€ Add Staff (Firebase Auth + Firestore) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.submitAddStaff = async () => {
    const name = document.getElementById('staff-name').value.trim();
    const email = document.getElementById('staff-email').value.trim();
    const password = document.getElementById('staff-password').value;
    const role = document.getElementById('staff-role-input').value;
    
    // New Fields
    const gender = document.getElementById('staff-gender').value;
    const age = parseInt(document.getElementById('staff-age').value);
    const experience = parseInt(document.getElementById('staff-experience').value);
    const degree = document.getElementById('staff-degree').value.trim();
    const specialization = document.getElementById('staff-specialization').value.trim();

    if (!name || !email || !password || !role || !gender || !age) return showToast('Please fill all basic fields', 'error');
    if (role === 'doctor' && (!degree || !specialization)) return showToast('Please fill doctor qualification fields', 'error');

    const btn = document.getElementById('submit-staff-btn');
    const btnText = btn.querySelector('.btn-text');
    const originalText = btnText.innerHTML;
    
    btn.classList.add('loading');
    btnText.textContent = 'Creating Account...';
    btn.disabled = true;

    // Use a temporary SECONDARY Firebase app so Admin session is NOT affected
    const primaryConfig = auth.app.options;
    let secondaryApp = null;

    try {
        secondaryApp = initializeApp(primaryConfig, `staff-create-${Date.now()}`);
        const secondaryAuth = getAuth(secondaryApp);

        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);

        // Write to Firestore via primary db — no session issue
        const randomPal = Math.floor(Math.random() * 6);
        await setDoc(doc(db, 'users', cred.user.uid), {
            id: cred.user.uid,
            name, email, role,
            gender, age, experience,
            ...(role === 'doctor' && { degree, specialization }),
            status: 'active',
            colorPalette: randomPal,
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser?.uid || 'admin'
        });

        showToast(`${role[0].toUpperCase() + role.slice(1)} account created successfully!`, 'success');
        closeModal('add-staff-modal');

        const tableType = role === 'doctor' ? 'doctors' : 'receptionists';
        renderStaffTable(tableType);
        fetchDashboardStats();

    } catch (err) {
        let msg = 'Failed to create account.';
        if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered.';
        if (err.code === 'auth/weak-password') msg = 'Password must be at least 8 characters.';
        if (err.code === 'auth/invalid-email') msg = 'Invalid email address.';
        showToast(msg, 'error');
    } finally {
        // Always clean up the temporary app
        if (secondaryApp) await deleteApp(secondaryApp).catch(() => { });
        btn.classList.remove('loading');
        btnText.innerHTML = originalText;
        btn.disabled = false;
    }
};

// â”€â”€ Subscription Simulation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.simulateUpgrade = () => {
    showToast('Pro features simulated! AI Diagnostics now enabled!', 'success');
};

// â”€â”€ Chart.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function initializeCharts() {
    const lineCtx = document.getElementById('patientChart')?.getContext('2d');
    if (lineCtx && !patientChartInstance) {
        const months = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(d.toLocaleString('default', { month: 'short' }));
        }

        patientChartInstance = new Chart(lineCtx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Patients Registered',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: '#2563EB',
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
            }
        });
    }

    const donutCtx = document.getElementById('appointmentChart')?.getContext('2d');
    if (donutCtx && !appointmentStatusChart) {
        appointmentStatusChart = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Pending', 'Cancelled'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
                    borderWidth: 3,
                }]
            },
            options: {
                cutout: '70%',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}

function updateAppointmentChart(counts) {
    if (appointmentStatusChart) {
        const total = counts.completed + counts.pending + counts.cancelled;
        if (total === 0) {
            appointmentStatusChart.data.datasets[0].data = [0, 0, 0, 1];
            appointmentStatusChart.data.datasets[0].backgroundColor = ['#10B981', '#F59E0B', '#EF4444', '#E2E8F0'];
            appointmentStatusChart.data.labels = ['Completed', 'Pending', 'Cancelled', 'No Data'];
        } else {
            appointmentStatusChart.data.datasets[0].data = [counts.completed, counts.pending, counts.cancelled];
            appointmentStatusChart.data.datasets[0].backgroundColor = ['#10B981', '#F59E0B', '#EF4444'];
            appointmentStatusChart.data.labels = ['Completed', 'Pending', 'Cancelled'];
        }
        appointmentStatusChart.update();
    }
}

function updatePatientChart(currentCount) {
    if (patientChartInstance) {
        const ds = patientChartInstance.data.datasets[0].data;
        ds[ds.length - 1] = currentCount || 0;
        patientChartInstance.update();
    }
}


// â”€â”€ Direct ID Card Download (No Preview) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.downloadIDCardDirectly = async (uid, roleType = 'staff') => {
    const btn = event?.currentTarget || document.getElementById('profile-download-id-btn');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Generating...`;
    btn.disabled = true;
    if (window.lucide) lucide.createIcons();

    try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists()) throw new Error("User not found");
        const data = snap.data();

        const renderArea = document.getElementById('id-card-render-area');
        if (!renderArea) return;

        const productionID = `${(roleType === 'admin' ? 'ADM' : (roleType === 'doctor' ? 'DOC' : (roleType === 'patient' ? 'PAT' : 'REC')))}-${new Date().getFullYear().toString().slice(-2)}-${uid.substring(0, 5).toUpperCase()}`;
        const joinedDate = data.createdAt?.toDate 
            ? data.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
            : '2024';

        renderArea.innerHTML = `
            <div class="id-card-render-wrapper" style="background: #fff; width: 210mm; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 0;">
                <!-- PAGE 1: FRONT -->
                <div style="width: 210mm; height: 297mm; display: flex; align-items: center; justify-content: center; page-break-after: always; -webkit-print-color-adjust: exact;">
                    <div class="id-card-container" style="width: 54mm; height: 86mm; flex-shrink: 0; box-shadow: none !important; border: none !important;">
                        <div class="id-front-header">
                            <h2 class="id-logo-text">CARESYNC</h2>
                            <span class="id-slogan-text">AI Healthcare Management</span>
                        </div>

                        <div class="id-profile-section">
                            <div class="id-photo-frame">
                                <img src="${data.photoURL || 'https://via.placeholder.com/150'}" alt="${data.name}">
                            </div>
                            <div class="id-user-info">
                                <h3 class="id-name-text" style="font-size: 1.1rem !important;">${data.name || 'User'}</h3>
                                <div class="id-role-tag">${roleType.toUpperCase()}</div>
                            </div>
                        </div>

                        <div class="id-number-box">
                            <span class="id-number-label">Membership Identifier</span>
                            <span class="id-number-value">${productionID}</span>
                        </div>
                    </div>
                </div>

                <!-- PAGE 2: BACK -->
                <div style="width: 210mm; height: 297mm; display: flex; align-items: center; justify-content: center; -webkit-print-color-adjust: exact;">
                    <div class="id-card-back-container" style="width: 54mm; height: 86mm; flex-shrink: 0; box-shadow: none !important; border: none !important;">
                        <div class="id-back-header">
                            <h2 class="id-logo-text">CARESYNC</h2>
                            <span class="id-slogan-text">AI Healthcare Management</span>
                        </div>

                        <div class="id-card-back-content">
                            <div class="id-back-info-list">
                                <div class="id-back-row">
                                    <span class="id-back-label">Name:</span>
                                    <span class="id-back-value">${data.name || '---'}</span>
                                </div>
                                <div class="id-back-row">
                                    <span class="id-back-label">Role:</span>
                                    <span class="id-back-value">${roleType}</span>
                                </div>
                                <div class="id-back-row">
                                    <span class="id-back-label">Ref ID:</span>
                                    <span class="id-back-value">${uid.substring(0, 14).toUpperCase()}</span>
                                </div>
                                <div class="id-back-row">
                                    <span class="id-back-label">Joined:</span>
                                    <span class="id-back-value">${joinedDate}</span>
                                </div>
                            </div>

                        <div class="id-back-bottom">
                            <div class="id-qr-box">
                                <div id="id-qrcode-canvas"></div>
                            </div>
                        </div>

                        <p class="id-terms-small">
                            Property of CareSync AI Healthcare. Verifiable via official channels.
                            If found, please return to any CareSync facility.
                        </p>
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();

        // Generate QR Code
        const qrContainer = document.getElementById('id-qrcode-canvas');
        if (qrContainer && window.QRCode) {
            qrContainer.innerHTML = '';
            const verifyUrl = `${window.location.origin}/verify.html?id=${uid}`;
            new QRCode(qrContainer, {
                text: verifyUrl,
                width: 80,
                height: 80,
                colorDark: "#1e293b",
                colorLight: "#ffffff",
                useSVG: true,
                correctLevel: QRCode.CorrectLevel.L
            });
        }

        // Wait for rendering & QR
        await new Promise(resolve => setTimeout(resolve, 800));

        // PDF Options
        const opt = {
            margin: 0,
            filename: `${roleType}-ID-${Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: { 
                scale: 4,  /* Higher scale for clarity at small physical size */
                useCORS: true, 
                letterRendering: true,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const cardElement = renderArea.querySelector('.id-card-render-wrapper');
        await html2pdf().set(opt).from(cardElement).save();

        btn.innerHTML = originalText;
        btn.disabled = false;
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error(err);
        btn.innerHTML = originalText;
        btn.disabled = false;
        showToast("Failed to generate ID Card: " + err.message, 'error');
    }
};

// ── Real-time Appointments ──────────────────────────────────
let allApptsData = [];
let apptsPage = 1;

function loadAllAppointments() {
    const tbody = document.getElementById('all-appts-table-body');
    const cardGrid = document.getElementById('all-appts-card-grid');
    if (!tbody && !cardGrid) return;

    const q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snap) => {
        allApptsData = [];
        snap.forEach(doc => allApptsData.push({ id: doc.id, ...doc.data() }));
        displayAppts();
    }, (err) => {
        console.error('Appts Snapshot Error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Error: ${err.message}</td></tr>`;
        if (cardGrid) cardGrid.innerHTML = `<p class="empty-state">Error: ${err.message}</p>`;
    });
}

function displayAppts() {
    const tbody = document.getElementById('all-appts-table-body');
    const cardGrid = document.getElementById('all-appts-card-grid');
    const pagination = document.getElementById('all-appts-pagination');
    if (!tbody && !cardGrid) return;


        const searchTerm = document.getElementById('appt-search')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('appt-status-filter')?.value || 'all';

        const filtered = allApptsData.filter(a => {
            const pName = (a.patientName || a.patientId || '').toLowerCase();
            const dName = (a.doctorName || a.doctorId || '').toLowerCase();
            const matchesSearch = pName.includes(searchTerm) || dName.includes(searchTerm);
            
            const statusClean = (a.status || 'scheduled').toLowerCase();
            const matchesStatus = statusFilter === 'all' || statusClean === statusFilter;
            return matchesSearch && matchesStatus;
        });

        if (!filtered.length) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No appointments found.</td></tr>';
            if (cardGrid) cardGrid.innerHTML = '<p class="empty-state" style="padding:2rem;text-align:center;">No appointments found.</p>';
            if (pagination) pagination.style.display = 'none';
            return;
        }

        const totalPages = Math.ceil(filtered.length / ADMIN_PER_PAGE);
        if (apptsPage > totalPages) apptsPage = Math.max(1, totalPages);
        
        const start = (apptsPage - 1) * ADMIN_PER_PAGE;
        const paginated = filtered.slice(start, start + ADMIN_PER_PAGE);

        // Desktop Table View
        if (tbody) {
            tbody.innerHTML = paginated.map(a => {
                const dateStr = a.date?.toDate ? a.date.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const timeStr = a.time || '—';
                const status = (a.status || 'scheduled').toLowerCase();
                
                const ptObj = { name: a.patientName, photoURL: a.patientPhotoURL, id: a.patientId };
                const drObj = { name: a.doctorName, photoURL: a.doctorPhotoURL, id: a.doctorId };

                return `
                    <tr class="admin-table-row">
                        <td>
                            <div class="user-info-cell">
                                ${getAvatarHTML(ptObj)}
                                <div class="user-details">
                                    <span class="user-name-text">${a.patientName || `Patient (${a.patientId?.substring(0, 5)})`}</span>
                                    <span class="user-email-subtext">${a.patientId ? `ID: ${a.patientId.substring(0, 8)}...` : '—'}</span>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="user-info-cell">
                                ${getAvatarHTML(drObj)}
                                <div class="user-details">
                                    <span class="user-name-text">Dr. ${a.doctorName || 'Doctor'}</span>
                                    <span class="user-email-subtext">${a.specialization || 'Surgeon'}</span>
                                </div>
                            </div>
                        </td>
                        <td class="table-cell-muted">
                            <div style="display: flex; flex-direction: column; line-height: 1.2;">
                                <span style="color: var(--text-main); font-weight: 600;">${dateStr}</span>
                                <span style="font-size: 0.75rem;">${timeStr}</span>
                            </div>
                        </td>
                         <td>
                            <span class="status-indicator-pill ${status}"><span class="status-dot-indicator"></span>${status}</span>
                        </td>
                        <td class="table-actions-cell">
                            <button class="icon-btn-subtle" title="Cancel Appointment" onclick="cancelAppointmentAdmin('${a.id}')">
                                <i data-lucide="x-circle"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Mobile Card View
        if (cardGrid) {
            cardGrid.innerHTML = paginated.map(a => {
                const dateStr = a.date?.toDate ? a.date.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const timeStr = a.time || '—';
                const status = (a.status || 'scheduled').toLowerCase();

                const ptObj = { name: a.patientName, photoURL: a.patientPhotoURL, id: a.patientId };
                const drObj = { name: a.doctorName, photoURL: a.doctorPhotoURL, id: a.doctorId };

                return `
                    <div class="staff-card v-excellence">
                        <div class="staff-card-header">
                            <div class="staff-header-info">
                                ${getAvatarHTML(ptObj).replace('user-avatar-sm', 'avatar-circle')}
                                <div class="staff-title-box">
                                    <span class="staff-name">${a.patientName || 'Patient'}</span>
                                    <span class="staff-role-tag">Appointment</span>
                                 </div>
                            </div>
                            <span class="status-indicator-pill ${status}"><span class="status-dot-indicator"></span>${status}</span>
                        </div>
                        <div class="staff-card-body">
                            <div class="staff-detail-row">
                                <i data-lucide="stethoscope"></i>
                                <span>Dr. ${a.doctorName || 'Doctor'}</span>
                            </div>
                            <div class="staff-detail-row">
                                <i data-lucide="calendar"></i>
                                <span>${dateStr} at ${timeStr}</span>
                            </div>
                        </div>
                        <div class="staff-card-footer">
                            <button class="btn btn-danger btn-full" onclick="cancelAppointmentAdmin('${a.id}')">
                                <i data-lucide="x-circle"></i> Cancel Appointment
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (pagination) {
            pagination.style.display = totalPages > 1 ? 'flex' : 'none';
            renderPagination(
                pagination,
                apptsPage,
                totalPages,
                (p) => {
                    apptsPage = p;
                    displayAppts();
                }
            );
        }

        if (window.lucide) lucide.createIcons();

}

window.filterAppointments = () => {
    apptsPage = 1;
    displayAppts(); // Instant update on search/filter
};

window.cancelAppointmentAdmin = async (id) => {
    customConfirm('Cancel this appointment globally?', async () => {
        try {
            await updateDoc(doc(db, 'appointments', id), { status: 'cancelled' });
            showToast('Appointment cancelled.', 'success');
        } catch (e) {
            showToast('Action failed.', 'error');
        }
    }, { type: 'warning', confirmText: 'Cancel Appt' });
};

// Load settings on start
async function loadClinicSettings() {
    try {
        const snap = await getDoc(doc(db, 'clinic', 'settings'));
        if (snap.exists()) {
            const data = snap.data();
            
            // Shift Mode
            const modeSelect = document.getElementById('shift-mode-select');
            if (modeSelect) modeSelect.value = data.shiftMode || '8';

            // Advanced Security
            const mnt = document.getElementById('sec-maintenance');
            const tfa = document.getElementById('sec-2fa');
            const reg = document.getElementById('sec-reg-guard');
            
            if (mnt) mnt.checked = data.maintenanceMode || false;
            if (tfa) tfa.checked = data.twoFactorAuth || false;
            if (reg) reg.checked = data.registrationGuard !== undefined ? data.registrationGuard : true;
        }
    } catch (e) {
        console.warn("Clinic settings could not be loaded (Offline):", e.message);
    }
}

window.saveSecuritySettings = async () => {
    const btn = document.getElementById('save-security-btn');
    const btnText = btn.querySelector('.btn-text');
    const originalText = btnText.innerHTML;

    const maintenanceMode = document.getElementById('sec-maintenance').checked;
    const twoFactorAuth = document.getElementById('sec-2fa').checked;
    const registrationGuard = document.getElementById('sec-reg-guard').checked;

    try {
        btn.classList.add('loading');
        btnText.textContent = 'Updating Security...';
        btn.disabled = true;

        await setDoc(doc(db, 'clinic', 'settings'), {
            maintenanceMode,
            twoFactorAuth,
            registrationGuard
        }, { merge: true });

        showToast('Security settings updated successfully!', 'success');
    } catch (err) {
        showToast('Failed to update security.', 'error');
    } finally {
        btn.classList.remove('loading');
        btnText.innerHTML = originalText;
        btn.disabled = false;
    }
};

// Update initialization to include new features
onAuthStateChanged(auth, async (user) => {
    if (!user) return (window.location.href = '../index.html');

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists() || snap.data().role !== 'admin') {
        return (window.location.href = '../index.html');
    }

    userData = snap.data();
    
    if (displayName) displayName.textContent = userData.name || 'Admin';
    if (userAvatar) {
        const { html, style, classes } = getAvatarConfig(userData);
        userAvatar.innerHTML = html;
        userAvatar.className = `avatar ${classes}`;
        userAvatar.style.cssText = style;
    }

    initializeCharts();
    populateProfile(user.uid, userData);

    await Promise.allSettled([
        fetchDashboardStats(),
        initRealtimeListeners(),
        renderStaffTable('doctors'),
        renderStaffTable('receptionists'),
        renderStaffTable('patients'),
        loadAllAppointments(),
        loadClinicSettings()
    ]);

    if (window.lucide) lucide.createIcons();
});

window.showIDCard = (uid, roleType) => window.downloadIDCardDirectly(uid, roleType);
