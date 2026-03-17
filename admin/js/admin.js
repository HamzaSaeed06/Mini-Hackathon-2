import { auth, db } from '../../js/firebase-config.js';
import {
    onAuthStateChanged, signOut,
    createUserWithEmailAndPassword, getAuth
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, getDoc, setDoc, updateDoc,
    deleteDoc, collection, query, where,
    serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { renderPagination } from '../../js/pagination.js';
import { 
    applyAvatarStyle, 
    AVATAR_PALETTES,
    getAvatarPalette,
    getAvatarConfig,
    SKELETON_DELAY,
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

// Initialize icons and skeletons as soon as possible
if (window.lucide) lucide.createIcons();
renderMetricSkeletons();

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
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width: 18px;"></i>`;
    btn.disabled = true;
    if (window.lucide) lucide.createIcons();

    const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/ds05q0lls/image/upload';
    const UPLOAD_PRESET = 'Ai Clinic';

    const formData = new FormData();
    formData.append('file', pendingPhotoFile);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
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

            resetUploadButton();
        } else {
            throw new Error('Upload failed');
        }
    } catch (err) {
        console.error(err);
        showToast('Upload failed. Switching back to camera.', 'error');
        resetUploadButton();
    }
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
        
        // --- Perception Delay on Click ---
        if (targetId === 'dashboard-section' || targetId === 'overview-section') {
            if (!item.dataset.loaded) {
                renderMetricSkeletons();
                item.dataset.loaded = 'true';
                setTimeout(() => fetchDashboardStats(), SKELETON_DELAY || 600);
            }
        } else {
            const tableType = targetId.split('-')[0]; // 'doctors', 'patients', 'receptionists'
            if (['doctors', 'receptionists', 'patients'].includes(tableType)) {
                if (!item.dataset.loaded) {
                    if (typeof renderSkeletons === 'function') renderSkeletons(tableType);
                    item.dataset.loaded = 'true';
                    setTimeout(() => {
                        displayFilteredData(tableType, staffDataCache[tableType] || []);
                    }, SKELETON_DELAY || 600);
                } else {
                    // Already loaded, just display immediately
                    displayFilteredData(tableType, staffDataCache[tableType] || []);
                }
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

// â”€â”€ Real-time Dashboard Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fetchDashboardStats() {
    // Listen to all users in real-time
    onSnapshot(collection(db, 'users'), (snap) => {
        let doctors = 0, patients = 0;
        snap.forEach(d => {
            const r = d.data().role;
            if (r === 'doctor') doctors++;
            if (r === 'patient') patients++;
        });
        // Perception Delay (pta chle ke loader chalta hai)
        setTimeout(() => {
            if (statDoctors) statDoctors.textContent = doctors;
            if (statPatients) statPatients.textContent = patients;

            const patientsContainer = document.getElementById('trend-patients-container');
            if (patientsContainer) {
                const lastMonth = Math.floor(patients * 0.82) || 1;
                const growth = patients > 0 ? (((patients - lastMonth) / lastMonth) * 100).toFixed(0) : 0;
                patientsContainer.innerHTML = `<i data-lucide="trending-up"></i> <span id="trend-patients">+${growth}%</span> vs last month`;
            }
            
            const doctorsContainer = document.getElementById('trend-doctors-container');
            if (doctorsContainer) {
                const growth = doctors > 0 ? (doctors > 1 ? '+15%' : '+0%') : '+0%';
                doctorsContainer.innerHTML = `<i data-lucide="trending-up"></i> <span id="trend-doctors">${growth}</span>`;
            }
            if (typeof initializeCharts === 'function') initializeCharts();
            updatePatientChart(patients);

            if (statRevenue && statDoctors) {
                const doctorsRaw = statDoctors.textContent || '0';
                const dNum = parseInt(doctorsRaw.replace(/[^0-9]/g, '')) || 0;
                const apptsRaw = statAppointments?.textContent || '0';
                const aNum = parseInt(apptsRaw.replace(/[^0-9]/g, '')) || 0;
                statRevenue.textContent = `$${(dNum * 200 + aNum * 50).toLocaleString()}`;
            }

            if (window.lucide) lucide.createIcons();
        }, SKELETON_DELAY);
    });

    // Listen to appointments - Update counts and chart
    onSnapshot(collection(db, 'appointments'), (snap) => {
        const total = snap.size;
        if (statAppointments) statAppointments.textContent = total;

        const apptsContainer = document.getElementById('trend-appts-container');
        if (apptsContainer) {
            const growth = total > 0 ? (total > 3 ? '+24%' : '+5%') : '+0%';
            apptsContainer.innerHTML = `<i data-lucide="trending-up"></i> <span id="trend-appts">${growth}</span> vs last month`;
        }

        const counts = { completed: 0, pending: 0, cancelled: 0 };
        snap.forEach(doc => {
            const status = doc.data().status || 'pending';
            if (counts.hasOwnProperty(status)) counts[status]++;
        });

        if (typeof initializeCharts === 'function') initializeCharts();
        updateAppointmentChart(counts);

        // Add appointment revenue ($50 each)
        if (statRevenue && statDoctors) {
            const doctorsRaw = statDoctors.textContent || '0';
            const doctors = parseInt(doctorsRaw.replace(/[^0-9]/g, '')) || 0;
            statRevenue.textContent = `$${(doctors * 200 + total * 50).toLocaleString()}`;
        }
        
        const revenueContainer = document.getElementById('trend-revenue-container');
        if (revenueContainer) {
            revenueContainer.innerHTML = `<i data-lucide="trending-up"></i> Steady`;
        }

        if (window.lucide) lucide.createIcons();
    }, () => { });

    // Listen to most common diagnosis (Real Data)
    onSnapshot(collection(db, 'diagnosisLogs'), (snap) => {
        const diagList = document.getElementById('diagnosis-list');
        if (!diagList) return;

        setTimeout(() => {
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
        }, 650);
    }, () => { });
}

window.changeAdminPage = (type, dir) => {
    const data = staffDataCache[type];
    const totalPages = Math.ceil(data.length / ADMIN_PER_PAGE);
    
    adminPages[type] += dir;
    if (adminPages[type] < 1) adminPages[type] = 1;
    if (adminPages[type] > totalPages) adminPages[type] = totalPages;
    
    displayFilteredData(type, data);
};

function renderMetricSkeletons() {
    // 1. Metric Cards
    const metricValues = ['stat-patients', 'stat-doctors', 'stat-appointments', 'stat-revenue'];
    const metricTrends = ['trend-patients-container', 'trend-doctors-container', 'trend-appts-container', 'trend-revenue-container'];
    
    metricValues.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="skeleton" style="height:28px;width:70px;margin-bottom:0;"></div>';
    });

    metricTrends.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="skeleton" style="height:14px;width:110px;margin-top:6px;opacity:0.7;"></div>';
    });

    // 2. Top Bar (Avatar & Name) - Commented out to prevent erasing persistent auth data
    // const topName = document.getElementById('display-name');
    // const topAvatar = document.getElementById('user-avatar');
    // if (topName) topName.innerHTML = '<div class="skeleton" style="height:14px;width:80px;"></div>';
    // if (topAvatar) topAvatar.innerHTML = '<div class="skeleton skeleton-avatar"></div>';

    // 3. Charts (Structural Skeletons)
    const lineChartBody = document.querySelector('.chart-card:nth-child(1) .chart-body');
    const donutChartBody = document.querySelector('.chart-card:nth-child(2) .chart-body');
    const diagList = document.getElementById('diagnosis-list');
    
    // Line Chart - Simulating 10 bars
    if (lineChartBody) {
        let barsHTML = '<div class="chart-skeleton-bars">';
        [40, 70, 45, 90, 60, 85, 50, 75, 55, 95].forEach(h => {
            barsHTML += `<div class="line-bar-skeleton" style="height:${h}%;"></div>`;
        });
        barsHTML += '</div>';
        lineChartBody.innerHTML = barsHTML;
    }

    // Donut Chart - Simulating Ring + Legends
    if (donutChartBody) {
        let donutHTML = '<div class="skeleton-ring"></div>';
        donutHTML += `
            <div class="donut-legend-skeleton">
                <div class="legend-item-skeleton">
                    <div class="skeleton" style="width:12px;height:12px;border-radius:3px;"></div>
                    <div class="skeleton" style="width:50px;height:10px;"></div>
                </div>
                <div class="legend-item-skeleton">
                    <div class="skeleton" style="width:12px;height:12px;border-radius:3px;"></div>
                    <div class="skeleton" style="width:50px;height:10px;"></div>
                </div>
                <div class="legend-item-skeleton">
                    <div class="skeleton" style="width:12px;height:12px;border-radius:3px;"></div>
                    <div class="skeleton" style="width:50px;height:10px;"></div>
                </div>
            </div>
        `;
        donutChartBody.innerHTML = donutHTML;
    }

    // Diagnosis List - Simulating 3 rows
    if (diagList) {
        let listHTML = '';
        for(let i=0; i<3; i++) {
            listHTML += `
                <div class="diagnosis-skeleton-item">
                    <div class="skeleton" style="width:8px;height:8px;border-radius:50%;"></div>
                    <div class="skeleton" style="height:14px;width:${Math.random() * 40 + 40}%;"></div>
                    <div style="flex:1;"></div>
                    <div class="skeleton" style="height:14px;width:40px;border-radius:12px;"></div>
                </div>
            `;
        }
        diagList.innerHTML = listHTML;
    }
}

// ── Real-time Staff Tables ──────────────────────────────────
function renderSkeletons(type) {
    const tbody = document.getElementById(`${type}-table-body`);
    const cardGrid = document.getElementById(`${type}-card-grid`);
    
    const skeletonRow = `
        <tr class="skeleton-row">
            <td><div class="user-info-cell"><div class="skeleton skeleton-avatar"></div><div class="skeleton-text skeleton" style="width:120px;"></div></div></td>
            <td><div class="skeleton-text skeleton" style="width:150px;"></div></td>
            <td><div class="skeleton-text skeleton" style="width:100px;"></div></td>
            <td><div class="skeleton-badge skeleton"></div></td>
            <td class="table-actions-cell"><div class="skeleton-btn skeleton"></div></td>
        </tr>
    `;
    
    const skeletonCard = `
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:1rem;display:flex;flex-direction:column;gap:0.75rem;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:0.65rem;">
                    <div class="skeleton" style="width:40px;height:40px;border-radius:50%;"></div>
                    <div>
                        <div class="skeleton" style="width:100px;height:14px;border-radius:4px;margin-bottom:4px;"></div>
                        <div class="skeleton" style="width:60px;height:10px;border-radius:3px;"></div>
                    </div>
                </div>
                <div class="skeleton" style="width:50px;height:18px;border-radius:10px;"></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.6rem 0;border-top:1px solid #F1F5F9;border-bottom:1px solid #F1F5F9;">
                <div class="skeleton" style="width:80%;height:10px;border-radius:2px;"></div>
                <div class="skeleton" style="width:50%;height:10px;border-radius:2px;"></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.4rem;">
                <div class="skeleton" style="width:100%;height:36px;border-radius:6px;"></div>
                <div class="skeleton" style="width:100%;height:36px;border-radius:6px;opacity:0.6;"></div>
            </div>
        </div>
    `;

    if (tbody) tbody.innerHTML = skeletonRow.repeat(4);
    if (cardGrid) cardGrid.innerHTML = skeletonCard.repeat(3);
}

function renderStaffTable(type) {
    const role = type === 'doctors' ? 'doctor' : (type === 'receptionists' ? 'receptionist' : 'patient');
    fetchData(type, role);
}

function fetchData(type, role) {
    const tbody = document.getElementById(`${type}-table-body`);
    renderSkeletons(type);
    
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

function displayFilteredData(type, members) {
    const tbody = document.getElementById(`${type}-table-body`);
    const cardGrid = document.getElementById(`${type}-card-grid`);
    const pagination = document.getElementById(`${type}-pagination`);
    const infoSpan = document.getElementById(`${type}-page-info`);

    const getAvatarHTML = (m) => {
        const { html, style, classes } = getAvatarConfig(m);
        return `<div class="user-avatar-sm ${classes}" style="${style}">${html}</div>`;
    };

    // Perception Delay
    setTimeout(() => {
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
                                </div>
                            </div>
                        </td>
                        <td class="table-cell-muted">${m.email || '—'}</td>
                        <td class="table-cell-muted">${joinedDate}</td>
                        <td><span class="health-badge ${healthClass}">${healthStatus}</span></td>
                        <td class="table-actions-cell">
                            <button class="icon-btn-subtle" title="View Records" onclick="viewPatientDetails('${m.uid}')">
                                <i data-lucide="external-link" width='14' height='14'></i>
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
                            </div>
                        </div>
                    </td>
                    <td class="table-cell-muted">${m.email || '—'}</td>
                    <td class="table-cell-muted">${joinedDate}</td>
                    <td>
                        <div class="status-toggle-wrapper" title="Change status to ${isInactive ? 'Active' : 'Inactive'}"
                            onclick="toggleStatus('${m.uid}','${m.status || 'active'}','${type}')">
                            <span class="status-dot ${m.status || 'active'}"></span>
                            <span class="status-text-compact">${isInactive ? 'Inactive' : 'Active'}</span>
                        </div>
                    </td>
                    <td class="table-actions-cell">
                        <button class="icon-btn-subtle" title="Delete Account" onclick="deleteStaff('${m.uid}', '${type}')">
                            <i data-lucide="trash-2" width='14' height='14'></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (tbody) tbody.innerHTML = tableContent;

        const cardsContent = paginatedMembers.map(m => {
            const joinedDate = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
            const isInactive = m.status === 'inactive';
            return `
                <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:1rem;display:flex;flex-direction:column;gap:0.75rem;box-shadow:0 1px 4px rgba(0,0,0,0.05);${isInactive ? 'opacity:0.75;' : ''}">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="display:flex;align-items:center;gap:0.65rem;">
                            ${getAvatarHTML(m).replace('user-avatar-sm', 'avatar-circle')}
                            <div>
                                <div style="font-size:0.95rem;font-weight:700;color:#1E293B;">${m.name || '—'}</div>
                                <span style="font-size:0.6rem;font-weight:800;background:#1E293B;color:#fff;padding:2px 6px 3px 6px;border-radius:4px;text-transform:uppercase;">${type === 'doctors' ? 'Doctor' : type === 'receptionists' ? 'Receptionist' : 'Patient'}</span>
                            </div>
                        </div>
                        <span class="status-indicator-pill ${m.status || 'active'}">${isInactive ? 'Inactive' : 'Active'}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:0.35rem;padding:0.6rem 0;border-top:1px solid #F1F5F9;border-bottom:1px solid #F1F5F9;">
                        <span style="font-size:0.8rem;color:#64748B;"><strong style="color:#374151;">Email:</strong> ${m.email || '—'}</span>
                        <span style="font-size:0.8rem;color:#64748B;"><strong style="color:#374151;">Joined:</strong> ${joinedDate}</span>
                        ${type === 'patients' ? `<span style="font-size:0.8rem;color:#64748B;"><strong style="color:#374151;">Health:</strong> <span class="health-badge ${m.healthStatus ? m.healthStatus.toLowerCase().replace(' ','-') : 'normal'}">${m.healthStatus || 'Normal'}</span></span>` : ''}
                    </div>
                    <div style="display:flex;flex-direction:column;gap:0.4rem;">
                        ${type === 'patients' ? `
                            <button onclick="viewPatientDetails('${m.uid}')" style="width:100%;padding:0.65rem;border-radius:9px;border:none;background:#1D4ED8;color:#fff;font-weight:600;font-size:0.875rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                                <i data-lucide="external-link" style="width:16px;height:16px;"></i> View Records
                            </button>
                        ` : `
                            <button onclick="toggleStatus('${m.uid}', '${m.status || 'active'}', '${type}')" style="width:100%;padding:0.65rem;border-radius:6px;border:none;background:#1E293B;color:#fff;font-weight:600;font-size:0.875rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                                <i data-lucide="power" style="width:16px;height:16px;"></i> Toggle Status
                            </button>
                            <button onclick="deleteStaff('${m.uid}', '${type}')" style="width:100%;padding:0.65rem;border-radius:6px;border:none;background:#DC2626;color:#fff;font-weight:600;font-size:0.875rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                                <i data-lucide="trash-2" style="width:16px;height:16px;"></i> Delete Account
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
    }, SKELETON_DELAY);
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

    if (!name || !email || !password || !role) return showToast('Please fill all fields', 'error');

    const btn = document.getElementById('submit-staff-btn');
    const loader = document.getElementById('staff-loader');
    const btnText = btn.querySelector('.btn-text');
    btnText.classList.add('hidden');
    loader.classList.remove('hidden');
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
        btnText.classList.remove('hidden');
        loader.classList.add('hidden');
        btn.disabled = false;
    }
};

// â”€â”€ Subscription Simulation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.simulateUpgrade = () => {
    showToast('Pro features simulated! AI Diagnostics now enabled!', 'success');
};

// â”€â”€ Chart.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function initializeCharts() {
    // Restore canvases if ANY structural skeletons are present
    const lineChartBody = document.querySelector('.chart-card:nth-child(1) .chart-body');
    if (lineChartBody && (lineChartBody.querySelector('.chart-skeleton-bars') || lineChartBody.querySelector('.skeleton'))) {
        if (patientChartInstance) {
            patientChartInstance.destroy();
            patientChartInstance = null;
        }
        lineChartBody.innerHTML = '<canvas id="patientChart"></canvas>';
    }

    const donutChartBody = document.querySelector('.chart-card:nth-child(2) .chart-body');
    if (donutChartBody && (donutChartBody.querySelector('.donut-skeleton-container') || donutChartBody.querySelector('.skeleton'))) {
        if (appointmentStatusChart) {
            appointmentStatusChart.destroy();
            appointmentStatusChart = null;
        }
        donutChartBody.innerHTML = '<canvas id="appointmentChart"></canvas>';
    }

    const lineCtx = document.getElementById('patientChart')?.getContext('2d');
    if (lineCtx && !patientChartInstance) {
        patientChartInstance = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: ['-', '-', '-', '-', '-', 'Current Month'],
                datasets: [{
                    label: 'Patients Registered',
                    data: [0, 0, 0, 0, 0, 0],
                    fill: true,
                    backgroundColor: 'rgba(37, 99, 235, 0.08)',
                    borderColor: '#2563EB',
                    borderWidth: 2.5,
                    tension: 0.4,
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
    const q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snap) => {
        allApptsData = [];
        snap.forEach(doc => allApptsData.push({ id: doc.id, ...doc.data() }));
        apptsPage = 1;
        displayAppts();
    });
}

function displayAppts() {
    const tbody = document.getElementById('all-appts-table-body');
    const pagination = document.getElementById('all-appts-pagination');
    if (!tbody) return;

    const searchTerm = document.getElementById('appt-search')?.value.toLowerCase() || '';
    const filtered = allApptsData.filter(a => 
        (a.patientName || '').toLowerCase().includes(searchTerm) ||
        (a.doctorName || '').toLowerCase().includes(searchTerm)
    );

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No appointments found.</td></tr>';
        if (pagination) pagination.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(filtered.length / ADMIN_PER_PAGE);
    const start = (apptsPage - 1) * ADMIN_PER_PAGE;
    const paginated = filtered.slice(start, start + ADMIN_PER_PAGE);

    tbody.innerHTML = paginated.map(a => {
        const dateDisplay = a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const timeDisplay = a.time || '—';
        const statusClass = a.status === 'completed' ? 'active' : (a.status === 'cancelled' ? 'inactive' : 'pending');
        
        const ptAvatar = getAvatarConfig({ name: a.patientName, photoURL: a.patientPhotoURL, id: a.patientId });
        const drAvatar = getAvatarConfig({ name: a.doctorName, photoURL: a.doctorPhotoURL, id: a.doctorId });

        return `
            <tr class="admin-table-row">
                <td>
                    <div class="user-info-cell">
                        <div class="user-avatar-sm ${ptAvatar.classes}" style="${ptAvatar.style}">${ptAvatar.html}</div>
                        <span class="user-name-text">${a.patientName || 'Patient'}</span>
                    </div>
                </td>
                <td>
                    <div class="user-info-cell">
                        <div class="user-avatar-sm ${drAvatar.classes}" style="${drAvatar.style}">${drAvatar.html}</div>
                        <span class="user-name-text">Dr. ${a.doctorName || 'Doctor'}</span>
                    </div>
                </td>
                <td class="table-cell-muted">${dateDisplay} · ${timeDisplay}</td>
                <td><span class="status-indicator-pill ${statusClass}">${a.status || 'Pending'}</span></td>
                <td class="table-actions-cell">
                    <button class="icon-btn-subtle" title="Cancel" onclick="cancelAppointmentAdmin('${a.id}')">
                        <i data-lucide="x-circle" width="14" height="14"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (pagination && totalPages > 1) {
        pagination.style.display = 'flex';
        renderPagination(pagination, apptsPage, totalPages, (newPage) => {
            apptsPage = newPage;
            displayAppts();
        });
    } else if (pagination) {
        pagination.style.display = 'none';
    }

    if (window.lucide) lucide.createIcons();
}

window.filterAppointments = () => {
    apptsPage = 1;
    displayAppts();
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

// ── Clinic Settings ──────────────────────────────────────────
const shiftForm = document.getElementById('shift-config-form');
if (shiftForm) {
    shiftForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const mode = document.getElementById('shift-mode-select').value;
        try {
            await setDoc(doc(db, 'clinic', 'settings'), { shiftMode: mode }, { merge: true });
            showToast(`Shift mode updated to ${mode} hours.`, 'success');
        } catch (e) {
            showToast('Failed to save settings.', 'error');
        }
    });
}

// Load settings on start
async function loadClinicSettings() {
    const snap = await getDoc(doc(db, 'clinic', 'settings'));
    if (snap.exists()) {
        const modeSelect = document.getElementById('shift-mode-select');
        if (modeSelect) modeSelect.value = snap.data().shiftMode || '8';
    }
}

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

    await Promise.all([
        fetchDashboardStats(),
        renderStaffTable('doctors'),
        renderStaffTable('receptionists'),
        renderStaffTable('patients'),
        loadAllAppointments(),
        loadClinicSettings()
    ]);

    if (window.lucide) lucide.createIcons();
});

window.showIDCard = (uid, roleType) => window.downloadIDCardDirectly(uid, roleType);
