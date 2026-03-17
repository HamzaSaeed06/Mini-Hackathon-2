import { renderPagination } from '../../js/pagination.js';
import { 
    applyAvatarStyle, 
    AVATAR_PALETTES,
    getAvatarPalette,
    getAvatarConfig,
    SKELETON_DELAY,
    showToast
} from '../../js/utils.js';
import {
    doc, getDoc, getDocs, collection, query, where, onSnapshot,
    addDoc, serverTimestamp, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { auth, db } from "../../js/firebase-config.js";
import { initCustomSelect } from '../../js/dropdown.js';

// ── DOM refs ──────────────────────────────────────────────────
const displayName = document.getElementById('display-name');
const userAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');
const navItems = document.querySelectorAll('.nav-item[data-target]');
const sections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('page-title');
let userData = null;

// ── Auth Guard ────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) return (window.location.href = '../index.html');

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists() || snap.data().role !== 'receptionist') {
        showToast('Access Denied: Receptionists only.', 'error');
        return (window.location.href = '../index.html');
    }

    userData = snap.data();
    
    // Deterministic palette handled by utils now

    if (displayName) displayName.textContent = userData.name || 'Receptionist';
    if (userAvatar) {
        const { html, style, classes } = getAvatarConfig(userData);
        userAvatar.innerHTML = html;
        userAvatar.className = `avatar ${classes}`;
        userAvatar.style.cssText = style;
    }

    // Populate Profile
    populateProfile(user.uid, userData, 'receptionist');

    // Start listeners
    loadQueue();
    loadStats();
    populateDropdowns();
    loadPatientDirectory();
    loadDoctorDirectory();
    loadClinicSettings();
    
    // Add Search Listener
    document.getElementById('patient-search')?.addEventListener('input', (e) => {
        filterPatientDirectory(e.target.value.toLowerCase());
    });
    document.getElementById('doctor-dir-search')?.addEventListener('input', (e) => {
        filterDoctorDirectory(e.target.value.toLowerCase());
    });


    if (window.lucide) lucide.createIcons();
});

// â”€â”€ Photo Upload UX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let pendingPhotoFile = null;

async function handlePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    pendingPhotoFile = file;
    const avatarEl = document.getElementById('profile-avatar-display');
    const btn = document.querySelector('.btn-edit-avatar');

    const reader = new FileReader();
    reader.onload = (e) => {
        avatarEl.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        avatarEl.classList.remove('avatar-placeholder-circle');
    };
    reader.readAsDataURL(file);

    btn.innerHTML = `<i data-lucide="check" style="width: 18px;"></i>`;
    btn.title = "Confirm Upload";
    btn.onclick = handleActualUpload;
    btn.style.background = "#22c55e";
    btn.style.color = "white";
    if (window.lucide) lucide.createIcons();
}

async function handleActualUpload() {
    if (!pendingPhotoFile) return;
    const btn = document.querySelector('.btn-edit-avatar');
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

            // Global Sync
            const avatarDisplays = [
                document.getElementById('profile-avatar-display'),
                document.getElementById('user-avatar')
            ];

            avatarDisplays.forEach(el => {
                if (el) {
                    const { html, style, classes } = getAvatarConfig(userData);
                    el.innerHTML = html;
                    el.className = el.id === 'user-avatar' ? `avatar ${classes}` : `avatar-placeholder-circle ${classes}`;
                    el.style.cssText = style;
                    if (photoURL) el.style.background = 'transparent';
                }
            });

            // Enable ID Download immediately
            const downloadBtn = document.getElementById('profile-download-id-btn');
            const warningMsg = document.getElementById('photo-required-msg');
            if (downloadBtn) {
                downloadBtn.disabled = false;
                if (warningMsg) warningMsg.style.display = 'none';
                downloadBtn.onclick = () => window.downloadIDCardDirectly(auth.currentUser.uid, 'Receptionist');
            }

            showToast('Profile photo updated successfully!', 'success');
            resetUploadButton();
        } else {
            throw new Error('Upload failed');
        }
    } catch (err) {
        console.error(err);
        showToast('Upload failed. Resetting.', 'error');
        resetUploadButton();
    }
}

function resetUploadButton() {
    const btn = document.querySelector('.btn-edit-avatar');
    btn.innerHTML = `<i data-lucide="camera" style="width: 18px;"></i>`;
    btn.onclick = () => document.getElementById('photo-upload-input').click();
    btn.style.background = "white";
    btn.style.color = "var(--profile-text)";
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
}

window.handlePhotoSelect = handlePhotoSelect;
window.handleActualUpload = handleActualUpload;

function populateProfile(uid, data, role) {
    const nameEl = document.getElementById('profile-name-display');
    const roleEl = document.getElementById('profile-role-display');
    const emailEl = document.getElementById('profile-email-display');
    const idEl = document.getElementById('profile-id-display');
    const avatarEl = document.getElementById('profile-avatar-display');
    const joinedEl = document.getElementById('profile-joined-display');
    const downloadBtn = document.getElementById('profile-download-id-btn');
    const warningMsg = document.getElementById('photo-required-msg');

    if (nameEl) nameEl.textContent = data.name || 'N/A';
    if (roleEl) roleEl.textContent = 'Reception Manager';
    if (emailEl) emailEl.textContent = data.email || 'N/A';
    if (idEl) idEl.textContent = `#${role.substring(0, 3).toUpperCase()}-${uid.substring(0, 5).toUpperCase()}`;
    
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

    // Restriction Logic
    if (downloadBtn) {
        if (data.photoURL) {
            downloadBtn.disabled = false;
            if (warningMsg) warningMsg.style.display = 'none';
            downloadBtn.onclick = () => window.downloadIDCardDirectly(uid, 'Receptionist');
        } else {
            downloadBtn.disabled = true;
            if (warningMsg) warningMsg.style.display = 'flex';
        }
    }

}

// ── Navigation Logic ──────────────────────────────────────────
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetId = item.getAttribute('data-target');
        if (!targetId) return;

        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        sections.forEach(sec => {
            sec.classList.remove('active');
            if (sec.id === targetId) {
                sec.classList.add('active');
                
                // Perception Delay on Click
                if (targetId === 'dashboard-section') {
                    renderSkeletons('dashboard');
                    setTimeout(() => renderQueueTab(), SKELETON_DELAY || 600);
                } else if (targetId === 'patients-list-section') {
                    renderSkeletons('patients');
                    setTimeout(() => renderPatientPage(), SKELETON_DELAY || 600);
                } else if (targetId === 'doctors-list-section') {
                    renderSkeletons('doctors');
                    setTimeout(() => loadDoctorDirectory(), SKELETON_DELAY);
                } else {
                    const contentArea = sec.querySelector('.table-container') || sec.querySelector('.profile-container') || sec;
                    if (!contentArea.dataset.loader) {
                        contentArea.dataset.loader = 'true';
                        const originalOpacity = contentArea.style.opacity;
                        contentArea.style.opacity = '0.5';
                        contentArea.style.pointerEvents = 'none';
                        contentArea.style.position = 'relative';
                        
                        const loader = document.createElement('div');
                        loader.className = 'section-loader-overlay';
                        loader.innerHTML = `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:50; color:var(--primary);"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2 spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>`;
                        contentArea.appendChild(loader);

                        setTimeout(() => {
                            contentArea.style.opacity = originalOpacity || '1';
                            contentArea.style.pointerEvents = 'auto';
                            loader.remove();
                            delete contentArea.dataset.loader;
                        }, SKELETON_DELAY || 600);
                    }
                }
            }
        });

        const newTitle = item.getAttribute('data-title') || item.querySelector('span').textContent;
        // Special handling for profile section
        if (targetId === 'profile-section') {
            if (userData) {
                populateProfile(auth.currentUser.uid, userData, 'receptionist');
            }
        }

        if (window.innerWidth < 1024) window.closeSidebar();
    });
});

// ── Logout ────────────────────────────────────────────────────
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = '../index.html');
    });
}

// ── Load Stats ────────────────────────────────────────────────
function loadStats() {
    const patientsCount = document.getElementById('stats-new-patients');

    onSnapshot(query(collection(db, 'users'), where('role', '==', 'patient')), (snap) => {
        setTimeout(() => {
            if (patientsCount) patientsCount.textContent = snap.size;
        }, SKELETON_DELAY);
    });
}

// ── Helper: Get Today's Date String (YYYY-MM-DD) ──────────────
function getTodayStr() {
    return new Date().toISOString().split('T')[0];
}

// ── Load Queue with Tabs ───────────────────────────────────────
let allAppointments = [];
let activeTab = 'today';
let currentQueuePage = 1;
const QUEUE_PER_PAGE = 6;

function loadQueue() {
    const tableBody = document.getElementById('queue-table-body');
    const q = query(collection(db, 'appointments'));

    // Setup tab click handlers
    document.querySelectorAll('.queue-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.queue-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.dataset.tab;
            renderQueueTab();
        });
    });

    onSnapshot(q, async (snap) => {
        allAppointments = [];
        snap.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));

        // Fetch live patient photos for all appointments at once
        await Promise.all(allAppointments.map(async (appt) => {
            if (appt.patientId) {
                try {
                    const userSnap = await getDoc(doc(db, 'users', appt.patientId));
                    if (userSnap.exists()) {
                        appt._livePhotoURL = userSnap.data().photoURL || '';
                    }
                } catch (_) {}
            }
        }));

        setTimeout(() => {
            updateTabBadges();
            currentQueuePage = 1;
            renderQueueTab();
        }, SKELETON_DELAY);
    });
}

function getFilteredQueue(today) {
    return allAppointments.filter(appt => {
        const d = appt.date || '';
        if (activeTab === 'completed') return appt.status === 'completed';
        if (appt.status === 'completed') return false;
        if (activeTab === 'today') return d === today;
        if (activeTab === 'upcoming') return d > today;
        if (activeTab === 'expired') return d < today || !d;
        return false;
    });
}

function updateTabBadges() {
    const today = getTodayStr();
    let counts = { today: 0, upcoming: 0, expired: 0, completed: 0 };

    allAppointments.forEach(appt => {
        const d = appt.date || '';
        if (appt.status === 'completed') {
            counts.completed++;
        } else if (d === today) {
            counts.today++;
        } else if (d > today) {
            counts.upcoming++;
        } else if (d < today || !d) {
            counts.expired++;
        }
    });

    ['today', 'upcoming', 'expired', 'completed'].forEach(tab => {
        const el = document.getElementById(`tab-badge-${tab}`);
        if (el) el.textContent = counts[tab];
    });

    const statsQueue = document.getElementById('stats-queue');
    const statsUpcoming = document.getElementById('stats-upcoming');
    const statsCompleted = document.getElementById('stats-completed');
    if (statsQueue) statsQueue.textContent = counts.today;
    if (statsUpcoming) statsUpcoming.textContent = counts.upcoming;
    if (statsCompleted) statsCompleted.textContent = counts.completed;
}

async function renderQueueTab() {
    const tableBody = document.getElementById('queue-table-body');
    const pagination = document.getElementById('queue-pagination');
    if (!tableBody) return;

    const today = getTodayStr();
    const filtered = getFilteredQueue(today);
    const totalPages = Math.max(1, Math.ceil(filtered.length / QUEUE_PER_PAGE));
    if (currentQueuePage > totalPages) currentQueuePage = totalPages;

    const startIndex = (currentQueuePage - 1) * QUEUE_PER_PAGE;
    const paginatedItems = filtered.slice(startIndex, startIndex + QUEUE_PER_PAGE);

    const rows = paginatedItems.map(data => {
        const photoURL = data._livePhotoURL || data.patientPhotoURL || '';
        const { html: avatarHTML, style: avatarStyle, classes: avatarClasses } = getAvatarConfig({
            uid: data.patientId,
            name: data.patientName,
            photoURL: photoURL
        });

        const dateDisplay = data.date
            ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';

        const statusLabel = data.status === 'completed' ? 'completed'
            : (!data.date || data.date < today) ? 'expired'
            : 'pending';

        return `
            <tr class="admin-table-row">
                <td>
                    <div class="user-info-cell">
                        <div class="user-avatar-sm ${avatarClasses}" style="${avatarStyle}">
                            ${avatarHTML}
                        </div>
                        <div class="user-details">
                            <span class="user-name-text">${data.patientName}</span>
                        </div>
                    </div>
                </td>
                <td class="table-cell-muted">Dr. ${data.doctorName || 'Assigned'}</td>
                <td class="table-cell-muted">${dateDisplay}</td>
                <td class="table-cell-muted">${data.time || '—'}</td>
                <td><span class="status-indicator-pill ${statusLabel}">${statusLabel}</span></td>
            </tr>
        `;
    });

    tableBody.classList.remove('page-transition');
    void tableBody.offsetWidth;
    tableBody.classList.add('page-transition');
    tableBody.innerHTML = rows.join('') || `<tr><td colspan="5" class="empty-state">No appointments in this category.</td></tr>`;

    if (pagination && totalPages > 1) {
        renderPagination(pagination, currentQueuePage, totalPages, (newPage) => {
            currentQueuePage = newPage;
            renderQueueTab();
        });
    } else if (pagination) {
        pagination.style.display = 'none';
        pagination.innerHTML = '';
    }

    if (window.lucide) lucide.createIcons();

}


// ── Populate Dropdowns ────────────────────────────────────────
async function populateDropdowns() {
    // Load Patients
    onSnapshot(query(collection(db, 'users'), where('role', '==', 'patient')), (snap) => {
        setTimeout(() => {
            const patients = [];
            snap.forEach(d => {
                const data = d.data();
                patients.push({
                    id: d.id,
                    name: data.name,
                    sub: data.email,
                    photoURL: data.photoURL,
                    extra: { name: data.name, age: data.age || '', gender: data.gender || '', photoURL: data.photoURL || '' }
                });
            });
            initCustomSelect('patient-select-container', 'patient-options-list', 'select-patient', patients);
        }, SKELETON_DELAY);
    });

    // Load Doctors (Active only)
    onSnapshot(query(collection(db, 'users'), where('role', '==', 'doctor'), where('status', '==', 'active')), (snap) => {
        const doctors = [];
        snap.forEach(d => {
            const data = d.data();
            doctors.push({
                id: d.id,
                name: data.name,
                sub: data.specialization || 'General Physician',
                photoURL: data.photoURL,
                extra: { name: data.name, photoURL: data.photoURL || '' }
            });
        });
        initCustomSelect('doctor-select-container', 'doctor-options-list', 'select-doctor', doctors);
    });
}

window.openModal = (id) => document.getElementById(id)?.classList.add('active');
window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');

function renderSkeletons(type) {
    let tbodyId, cardGridId;
    if (type === 'dashboard') {
        tbodyId = 'queue-table-body';
        cardGridId = null; // Add if card grid exists for queue
    } else {
        tbodyId = `${type}-table-body`;
        cardGridId = `${type}-card-grid`;
    }
    
    const tbody = document.getElementById(tbodyId);
    const cardGrid = cardGridId ? document.getElementById(cardGridId) : null;
    
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
        <div class="compact-staff-card" style="border-color:#F1F5F9;">
            <div class="card-header-row">
                <div class="header-left">
                    <div class="skeleton skeleton-avatar" style="width:40px;height:40px;"></div>
                    <div>
                        <div class="skeleton-text skeleton" style="width:100px;height:16px;"></div>
                        <div class="skeleton-text skeleton" style="width:70px;height:12px;"></div>
                    </div>
                </div>
                <div class="skeleton-badge skeleton"></div>
            </div>
            <div class="card-body-section">
                <div class="skeleton-text skeleton" style="width:60%;"></div>
            </div>
            <div class="card-actions-vertical" style="margin-top:0.5rem;">
                <div class="skeleton skeleton-btn" style="width:100%;height:36px;border-radius:8px;"></div>
                <div class="skeleton skeleton-btn" style="width:100%;height:36px;border-radius:8px;opacity:0.6;"></div>
            </div>
        </div>
    `;

    if (tbody) tbody.innerHTML = skeletonRow.repeat(4);
    if (cardGrid) cardGrid.innerHTML = skeletonCard.repeat(3);
}

// ── Form Handlers ─────────────────────────────────────────────

// 1. Register Patient
const registerForm = document.getElementById('register-patient-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('patient-name').value;
        const email = document.getElementById('patient-email').value;
        const age = document.getElementById('patient-age').value;
        const gender = document.getElementById('patient-gender').value;

        try {
            // In a real app, we'd use Firebase Auth to create a user.
            // For hackathon, we save to Firestore and simulate.
            const newPatientRef = doc(collection(db, 'users'));
            await setDoc(newPatientRef, {
                name,
                email,
                age,
                gender,
                role: 'patient',
                status: 'active',
                createdAt: serverTimestamp()
            });

            showToast('Patient registered successfully!', 'success');
            registerForm.reset();
            // Switch to queue
            document.querySelector('[data-target="overview-section"]').click();
        } catch (err) {
            console.error(err);
            showToast('Failed to register patient.', 'error');
        }
    });
}

// 2. Book Appointment
const bookForm = document.getElementById('book-appointment-form');
if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const patientEl = document.getElementById('select-patient');
        const doctorEl = document.getElementById('select-doctor');
        const date = document.getElementById('appointment-date').value;
        const time = document.getElementById('appointment-time').value;

        if (!date) { showToast('Please select an appointment date.', 'warning'); return; }

        const patientId = patientEl.value;
        const patientName = patientEl.options[patientEl.selectedIndex].dataset.name;
        const patientAge = patientEl.options[patientEl.selectedIndex].dataset.age;
        const patientGender = patientEl.options[patientEl.selectedIndex].dataset.gender;

        const doctorId = doctorEl.value;
        const doctorName = doctorEl.options[doctorEl.selectedIndex].dataset.name;
        const doctorPhotoURL = doctorEl.options[doctorEl.selectedIndex].dataset.photoUrl;
        const patientPhotoURL = patientEl.options[patientEl.selectedIndex].dataset.photoUrl;

        try {
            // Capacity Validation
            const doctorSnap = await getDoc(doc(db, 'users', doctorId));
            if (doctorSnap.exists()) {
                const capacity = doctorSnap.data().dailyCapacity || 10;
                const apptsQuery = query(
                    collection(db, 'appointments'),
                    where('doctorId', '==', doctorId),
                    where('date', '==', date)
                );
                const apptsSnap = await getDocs(apptsQuery);
                if (apptsSnap.size >= capacity) {
                    showToast(`Dr. ${doctorName} is fully booked for ${date}. Please select another date.`, 'warning', 5000);
                    return;
                }
            }

            await addDoc(collection(db, 'appointments'), {
                patientId,
                patientName,
                patientAge,
                patientGender,
                patientPhotoURL: patientPhotoURL || '',
                doctorId,
                doctorName,
                doctorPhotoURL: doctorPhotoURL || '',
                date,
                time,
                shift: getShiftFromTime(time, clinicShiftMode),
                status: 'pending',
                createdAt: serverTimestamp()
            });

            showToast('Appointment booked successfully!', 'success');
            bookForm.reset();
            document.querySelector('[data-target="overview-section"]').click();
        } catch (err) {
            console.error(err);
            showToast('Failed to book appointment.', 'error');
        }
    });
}

// ── Patient Directory ─────────────────────────────────────────
const patientDirectoryCache = [];
let currentDirPage = 1;
const DIR_PER_PAGE = 6;

function loadPatientDirectory() {
    const tableBody = document.getElementById('patients-table-body');
    if (!tableBody) return;

    onSnapshot(query(collection(db, 'users'), where('role', '==', 'patient')), (snap) => {
        setTimeout(() => {
            patientDirectoryCache.length = 0;
            snap.forEach(d => patientDirectoryCache.push({ id: d.id, ...d.data() }));
            renderPatientDirectory(patientDirectoryCache);
        }, SKELETON_DELAY + 200);
    });
}

function renderPatientDirectory(patients) {
    const tableBody = document.getElementById('patients-table-body');
    const pagination = document.getElementById('dir-pagination');
    if (!tableBody) return;

    const totalPages = Math.max(1, Math.ceil(patients.length / DIR_PER_PAGE));
    if (currentDirPage > totalPages) currentDirPage = totalPages;

    const start = (currentDirPage - 1) * DIR_PER_PAGE;
    const paginatedPatients = patients.slice(start, start + DIR_PER_PAGE);

    let html = '';
    paginatedPatients.forEach(m => {
        const joined = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : '—';
        const { html: avatarHTML, style: avatarStyle, classes: avatarClasses } = getAvatarConfig(m);

        html += `
            <tr class="admin-table-row">
                <td>
                    <div class="user-info-cell">
                        <div class="user-avatar-sm ${avatarClasses}" style="${avatarStyle}">${avatarHTML}</div>
                        <div class="user-details">
                            <span class="user-name-text">${m.name || 'Patient'}</span>
                        </div>
                    </div>
                </td>
                <td class="table-cell-muted">${m.email || '—'}</td>
                <td class="table-cell-muted">${joined}</td>
                <td class="table-actions-cell">
                    <button class="btn-action-sm" onclick="showIDCard('${m.id}', 'patient')" title="View Digital ID">
                        <i data-lucide="contact-2"></i>
                    </button>
                    ${m.id ? `<button class="btn-action-sm" onclick="window.location.href='../doctor/index.html?patient=${m.id}'" title="View Records" style="display:none;">
                        <i data-lucide="eye"></i>
                    </button>` : ''}
                </td>
            </tr>
        `;
    });

    tableBody.classList.remove('page-transition');
    void tableBody.offsetWidth;
    tableBody.classList.add('page-transition');
    tableBody.innerHTML = html || '<tr><td colspan="4" class="empty-state">No patients found.</td></tr>';

    if (pagination) {
        if (totalPages > 1) {
            pagination.style.display = 'flex';
            renderPagination(pagination, currentDirPage, totalPages, (newPage) => {
                currentDirPage = newPage;
                const queryVal = document.getElementById('patient-search')?.value.toLowerCase() || '';
                if (queryVal) {
                    const filtered = patientDirectoryCache.filter(p => 
                        (p.name || '').toLowerCase().includes(queryVal) || 
                        (p.email || '').toLowerCase().includes(queryVal)
                    );
                    renderPatientDirectory(filtered);
                } else {
                    renderPatientDirectory(patientDirectoryCache);
                }
            });
        } else {
            pagination.style.display = 'none';
            pagination.innerHTML = '';
        }
    }

    if (window.lucide) lucide.createIcons();
}

// ── Doctor Directory ──────────────────────────────────────────
const doctorDirectoryCache = [];
let currentDoctorDirPage = 1;
const DOCTOR_DIR_PER_PAGE = 6;

function loadDoctorDirectory() {
    const tableBody = document.getElementById('doctors-table-body');
    if (!tableBody) return;

    onSnapshot(query(collection(db, 'users'), where('role', '==', 'doctor')), (snap) => {
        setTimeout(() => {
            doctorDirectoryCache.length = 0;
            snap.forEach(d => doctorDirectoryCache.push({ id: d.id, ...d.data() }));
            renderDoctorDirectory(doctorDirectoryCache);
        }, SKELETON_DELAY + 200);
    });
}

function renderDoctorDirectory(doctors) {
    const tableBody = document.getElementById('doctors-table-body');
    const cardGrid = document.getElementById('doctors-card-grid');
    const pagination = document.getElementById('doctor-dir-pagination');
    if (!tableBody) return;

    const totalPages = Math.max(1, Math.ceil(doctors.length / DOCTOR_DIR_PER_PAGE));
    if (currentDoctorDirPage > totalPages) currentDoctorDirPage = totalPages;

    const start = (currentDoctorDirPage - 1) * DOCTOR_DIR_PER_PAGE;
    const paginatedDoctors = doctors.slice(start, start + DOCTOR_DIR_PER_PAGE);

    let html = '';
    let cardsHtml = '';

    paginatedDoctors.forEach(m => {
        const { html: avatarHTML, style: avatarStyle, classes: avatarClasses } = getAvatarConfig(m);
        const statusClass = m.status === 'active' ? 'active' : 'inactive';

        html += `
            <tr class="admin-table-row">
                <td>
                    <div class="user-info-cell">
                        <div class="user-avatar-sm ${avatarClasses}" style="${avatarStyle}">${avatarHTML}</div>
                        <div class="user-details">
                            <span class="user-name-text">Dr. ${m.name || 'Doctor'}</span>
                        </div>
                    </div>
                </td>
                <td class="table-cell-muted">${m.specialization || 'General Physician'}</td>
                <td><span class="status-indicator-pill ${statusClass}">${m.status || 'Active'}</span></td>
                <td class="table-actions-cell">
                    <button class="btn-action-sm danger" onclick="reassignDoctorAppointments('${m.id}')" title="Unavailable - Reassign Appts">
                        <i data-lucide="user-x"></i>
                        <span>Reassign</span>
                    </button>
                    <button class="btn-action-sm" onclick="showIDCard('${m.id}', 'doctor')" title="View ID">
                        <i data-lucide="contact-2"></i>
                    </button>
                </td>
            </tr>
        `;

        cardsHtml += `
            <div class="compact-staff-card">
                <div class="card-header-row">
                    <div class="header-left">
                        <div class="user-avatar-sm ${avatarClasses}" style="${avatarStyle}">${avatarHTML}</div>
                        <div>
                            <h4 class="card-user-name">Dr. ${m.name}</h4>
                            <p class="card-user-email">${m.specialization || 'Physician'}</p>
                        </div>
                    </div>
                    <span class="status-indicator-pill ${statusClass}">${m.status}</span>
                </div>
                <div class="card-actions-vertical" style="margin-top:0.5rem;">
                    <button class="spc-btn danger" onclick="reassignDoctorAppointments('${m.id}')">
                        <i data-lucide="user-x"></i> Reassign Appointments
                    </button>
                    <button class="spc-btn" onclick="showIDCard('${m.id}', 'doctor')">
                        <i data-lucide="contact-2"></i> View ID Card
                    </button>
                </div>
            </div>
        `;
    });

    tableBody.innerHTML = html || '<tr><td colspan="4" class="empty-state">No doctors found.</td></tr>';
    if (cardGrid) cardGrid.innerHTML = cardsHtml;

    if (pagination && totalPages > 1) {
        renderPagination(pagination, currentDoctorDirPage, totalPages, (newPage) => {
            currentDoctorDirPage = newPage;
            const queryVal = document.getElementById('doctor-dir-search')?.value.toLowerCase() || '';
            if (queryVal) {
                const filtered = doctorDirectoryCache.filter(p => (p.name || '').toLowerCase().includes(queryVal));
                renderDoctorDirectory(filtered);
            } else {
                renderDoctorDirectory(doctorDirectoryCache);
            }
        });
    } else if (pagination) {
        pagination.style.display = 'none';
        pagination.innerHTML = '';
    }

    if (window.lucide) lucide.createIcons();
}

function filterDoctorDirectory(query) {
    const filtered = doctorDirectoryCache.filter(p => (p.name || '').toLowerCase().includes(query.toLowerCase()));
    renderDoctorDirectory(filtered);
}
// ── Digital ID logic ──────────────────────────────────────────
// getAvatar removed in favor of getAvatarConfig

window.showIDCard = async (uid, roleType) => {
    try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!userSnap.exists()) return showToast('Profile not found.', 'error');

        const data = { ...userSnap.data(), uid };
        const renderArea = document.getElementById('id-card-render-area');
        if (!renderArea) return;

        const joinedDate = data.createdAt?.toDate
            ? data.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';

        const { html: avatarHTML, style: avatarStyle, classes: avatarClasses } = getAvatarConfig(data);

        const getProductionID = (role, id) => {
            const prefixes = { 'Admin': 'ADM', 'Doctor': 'DOC', 'Patient': 'PAT', 'Receptionist': 'REC' };
            const yr = new Date().getFullYear().toString().slice(-2);
            return `${prefixes[role] || 'STF'}-${yr}-${id.substring(0, 5).toUpperCase()}`;
        };
        const productionID = getProductionID(roleType, uid);

        renderArea.innerHTML = `
            <div class="id-card-wrapper">
                <div class="id-card-container">
                    <div class="id-front-header">
                        <h2 class="id-logo-text">CARESYNC</h2>
                        <span class="id-slogan-text">AI Healthcare Management</span>
                    </div>
                    <div class="id-profile-section">
                        <div class="id-photo-frame ${avatarClasses}" style="${avatarStyle}">${avatarHTML}</div>
                        <div class="id-user-info">
                            <h3 class="id-name-text">${data.name || 'User'}</h3>
                            <span class="id-role-tag">${roleType}</span>
                        </div>
                    </div>
                    <div class="id-front-footer">
                        <div class="id-number-box">
                            <span class="id-number-label">Official Membership ID</span>
                            <span class="id-number-value">${productionID}</span>
                        </div>
                    </div>
                </div>

                <div class="id-card-back-container">
                    <div class="id-back-header">
                        <h2 class="id-logo-text">CARESYNC</h2>
                        <span class="id-slogan-text">AI Healthcare Management</span>
                    </div>
                    <div class="id-card-back-content">
                        <div class="id-back-info-list">
                            <div class="id-back-row"><span class="id-back-label">Name :</span><span class="id-back-value">${data.name || '---'}</span></div>
                            <div class="id-back-row"><span class="id-back-label">Role :</span><span class="id-back-value">${roleType}</span></div>
                            <div class="id-back-row"><span class="id-back-label">UID :</span><span class="id-back-value">${uid.substring(0, 14).toUpperCase()}</span></div>
                            <div class="id-back-row"><span class="id-back-label">Date :</span><span class="id-back-value">${joinedDate}</span></div>
                        </div>
                        <div class="id-back-bottom">
                            <div class="id-qr-box">
                                <div id="id-qrcode-canvas"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();
        window.openModal('id-card-modal');

        setTimeout(() => {
            const qrContainer = document.getElementById('id-qrcode-canvas');
            if (qrContainer && window.QRCode) {
                qrContainer.innerHTML = '';
                new QRCode(qrContainer, {
                    text: `${window.location.origin}/verify.html?id=${uid}`,
                    width: 80, height: 80, colorDark: "#0c4a6e", colorLight: "#ffffff", useSVG: true
                });
            }
        }, 100);
    } catch (err) {
        console.error(err);
    }
};

window.downloadIDCardDirectly = async (uid, roleType) => {
    const btn = document.getElementById('profile-download-id-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Generating...`;
    btn.disabled = true;
    if (window.lucide) lucide.createIcons();

    try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!userSnap.exists()) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            return showToast('Profile not found.', 'error');
        }

        const data = { ...userSnap.data(), uid };
        const renderArea = document.getElementById('id-card-render-area');
        if (!renderArea) return;

        const joinedDate = data.createdAt?.toDate 
            ? data.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';

        const { html: avatarHTML, style: avatarStyle, classes: avatarClasses } = getAvatarConfig(data);

        const getProductionID = (role, id) => {
            const prefixes = { 'Admin': 'ADM', 'Doctor': 'DOC', 'Patient': 'PAT', 'Receptionist': 'REC' };
            const yr = new Date().getFullYear().toString().slice(-2);
            return `${prefixes[role] || 'STF'}-${yr}-${id.substring(0, 5).toUpperCase()}`;
        };
        const productionID = getProductionID(roleType, uid);

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
                            <div class="id-photo-frame ${avatarClasses}" style="${avatarStyle}; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                                ${avatarHTML}
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
            </div>
        `;

        const qrContainer = renderArea.querySelector('#id-qrcode-canvas');
        if (qrContainer && window.QRCode) {
            new QRCode(qrContainer, {
                text: `${window.location.origin}/verify.html?id=${uid}`,
                width: 80, height: 80, colorDark: "#0c4a6e", colorLight: "#ffffff", useSVG: true
            });
        }

        await new Promise(r => setTimeout(r, 800));

        const opt = {
            margin: 0,
            filename: `${roleType}-ID-${Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: { 
                scale: 4, 
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
    }
};

window.openModal = (id) => document.getElementById(id)?.classList.add('active');
window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');
// ── Bulk Reassign Appointments ───────────────────────────────
window.reassignDoctorAppointments = async (oldDoctorId) => {
    customConfirm('This will cancel all pending appointments for this doctor. You can then reassign them manually from the list.', async () => {
        try {
            const q = query(
                collection(db, 'appointments'),
                where('doctorId', '==', oldDoctorId),
                where('status', '==', 'pending')
            );
            const snap = await getDocs(q);
            if (snap.empty) return showToast('No pending appointments found for this doctor.', 'info');

            const batch = writeBatch(db);
            snap.forEach(d => {
                batch.update(d.ref, { 
                    status: 'cancelled',
                    reassignmentNeeded: true,
                    originalDoctorId: oldDoctorId
                });
            });
            await batch.commit();
            showToast(`Cancelled ${snap.size} appointments for reassignment.`, 'success');
        } catch (e) {
            console.error(e);
            showToast('Bulk action failed.', 'error');
        }
    }, { type: 'warning', confirmText: 'Proceed' });
};

// ── Shift Management ──────────────────────────────────────────
let clinicShiftMode = '8'; // Default

async function loadClinicSettings() {
    try {
        const snap = await getDoc(doc(db, 'clinic', 'settings'));
        if (snap.exists()) {
            clinicShiftMode = snap.data().shiftMode || '8';
        }
        updateShiftDisplay();
        // Update display every minute
        setInterval(updateShiftDisplay, 60000);
    } catch (e) {
        console.error("Settings Error:", e);
    }
}

function updateShiftDisplay() {
    const display = document.getElementById('current-shift-display');
    const hoursEl = document.getElementById('shift-hours-display');
    if (!display || !hoursEl) return;

    const now = new Date();
    const hour = now.getHours();
    let shiftName = '';
    let shiftHours = '';

    if (clinicShiftMode === '12') {
        // 12-hour shifts: 08:00-20:00 (Day), 20:00-08:00 (Night)
        if (hour >= 8 && hour < 20) {
            shiftName = 'Day Shift';
            shiftHours = '08:00 AM - 08:00 PM';
        } else {
            shiftName = 'Night Shift';
            shiftHours = '08:00 PM - 08:00 AM';
        }
    } else {
        // 8-hour shifts: A(06-14), B(14-22), C(22-06)
        if (hour >= 6 && hour < 14) {
            shiftName = 'Shift A';
            shiftHours = '06:00 AM - 02:00 PM';
        } else if (hour >= 14 && hour < 22) {
            shiftName = 'Shift B';
            shiftHours = '02:00 PM - 10:00 PM';
        } else {
            shiftName = 'Shift C';
            shiftHours = '10:00 PM - 06:00 AM';
        }
    }

    display.textContent = shiftName;
    hoursEl.textContent = shiftHours;
}

function getShiftFromTime(timeStr, mode) {
    if (!timeStr) return 'Unknown';
    const hour = parseInt(timeStr.split(':')[0]);
    
    if (mode === '12') {
        if (hour >= 8 && hour < 20) return 'Day Shift';
        return 'Night Shift';
    } else {
        if (hour >= 6 && hour < 14) return 'Shift A';
        if (hour >= 14 && hour < 22) return 'Shift B';
        return 'Shift C';
    }
}

// ... existing code ...
