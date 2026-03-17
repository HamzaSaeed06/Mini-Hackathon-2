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
    addDoc, deleteDoc, serverTimestamp, orderBy, limit, updateDoc
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
let medicalRecords = [];

// ── Auth Guard ────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) return (window.location.href = '../index.html');

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists() || snap.data().role !== 'patient') {
        showToast('Access Denied: Patients only.', 'error');
        return (window.location.href = '../index.html');
    }

    userData = snap.data();
    
    // Deterministic palette handled by utils now

    if (displayName) displayName.textContent = userData.name || 'Patient';
    if (userAvatar) {
        const { html, style, classes } = getAvatarConfig(userData);
        userAvatar.innerHTML = html;
        userAvatar.className = `avatar ${classes}`;
        userAvatar.style.cssText = style;
    }

    // Populate Profile
    populateProfile(user.uid, userData, 'patient');

    // Start Listeners
    loadMyHistory(user.uid);
    loadMyAppointments(user.uid);
    populateDoctors();

    // Set initial greeting
    const greetingEl = document.querySelector('.patient-name-placeholder');
    if (greetingEl) greetingEl.textContent = userData.name.split(' ')[0];

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
            const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { photoURL });
            
            // Sync global state
            if (userData) userData.photoURL = photoURL;
            
            // UI Sync
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

            if (userData) userData.photoURL = photoURL;
            showToast('Profile photo updated successfully!', 'success');

            // Enable download button immediately
            const downloadBtn = document.getElementById('profile-download-id-btn');
            const warningMsg = document.getElementById('photo-required-msg');
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.onclick = () => window.downloadIDCardDirectly(auth.currentUser.uid, 'patient');
            }
            if (warningMsg) warningMsg.style.display = 'none';

            resetUploadButton();
        } else { throw new Error('Upload failed'); }
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
    const ageGenderEl = document.getElementById('profile-age-gender-display');

    if (nameEl) nameEl.textContent = data.name || 'N/A';
    if (roleEl) roleEl.textContent = 'CareSync Member';
    if (emailEl) emailEl.textContent = data.email || 'N/A';
    if (idEl) idEl.textContent = `#PAT-${uid.substring(0, 5).toUpperCase()}`;
    
    if (avatarEl) {
        const { html, style, classes } = getAvatarConfig(data);
        avatarEl.innerHTML = html;
        avatarEl.className = `avatar-placeholder-circle ${classes}`;
        avatarEl.style.cssText = style;
        if (data.photoURL) avatarEl.style.background = 'transparent';
    }
    
    if (ageGenderEl) ageGenderEl.textContent = `${data.age || 'N/A'} yrs | ${data.gender || 'N/A'}`;
    
    if (joinedEl && data.createdAt) {
        const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        joinedEl.textContent = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    // Handle Download Button State
    const downloadBtn = document.getElementById('profile-download-id-btn');
    const warningMsg = document.getElementById('photo-required-msg');
    const hasPhoto = !!data.photoURL;

    if (downloadBtn) {
        downloadBtn.disabled = !hasPhoto;
        if (hasPhoto) {
            downloadBtn.onclick = () => window.downloadIDCardDirectly(uid, 'patient');
        }
    }
    if (warningMsg) {
        warningMsg.style.display = hasPhoto ? 'none' : 'flex';
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
                if (targetId === 'appointments-section') {
                    renderSkeletons('appts');
                    setTimeout(() => loadMyAppointments(auth.currentUser.uid), SKELETON_DELAY || 600);
                } else if (targetId === 'patients-history-section') {
                    renderSkeletons('history');
                    setTimeout(() => loadMyHistory(auth.currentUser.uid), SKELETON_DELAY || 600);
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
        if (pageTitle) pageTitle.textContent = newTitle;

        if (targetId === 'profile-section' && auth.currentUser) {
            // userData is updated in onAuthStateChanged
            populateProfile(auth.currentUser.uid, userData, 'patient');
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

window.openModal = (id) => document.getElementById(id)?.classList.add('active');
window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');

window.openModal = (id) => document.getElementById(id)?.classList.add('active');
window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');

function renderSkeletons(type) {
    const tbody = document.getElementById(`${type}-table-body`);
    const cardGrid = document.getElementById(`${type}-card-grid`);
    
    if (!tbody || !cardGrid) return;

    const skeletonRow = `
        <tr class="skeleton-row">
            <td><div class="skeleton-text skeleton" style="width:100px;"></div></td>
            <td><div class="user-info-cell"><div class="skeleton skeleton-avatar"></div><div class="skeleton-text skeleton" style="width:120px;"></div></div></td>
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
            </div>
            <div class="card-body-section">
                <div class="skeleton-badge skeleton"></div>
            </div>
            <div class="card-actions-vertical" style="margin-top:0.5rem;">
                <div class="skeleton skeleton-btn" style="width:100%;height:36px;border-radius:8px;"></div>
            </div>
        </div>
    `;

    tbody.innerHTML = skeletonRow.repeat(4);
    cardGrid.innerHTML = skeletonCard.repeat(3);
}

// ── Load Medical History ──────────────────────────────────────
let currentHistoryPage = 1;
const HISTORY_PER_PAGE = 5;

function loadMyHistory(uid) {
    const tableBody = document.getElementById('history-table-body');
    const cardGrid = document.getElementById('history-card-grid');
    const statsTotalVisits = document.getElementById('stats-total-visits');
    const pagination = document.getElementById('history-pagination');

    const q = query(
        collection(db, 'appointments'),
        where('patientId', '==', uid),
        where('status', '==', 'completed'),
        orderBy('createdAt', 'desc')
    );

    function renderHistory() {
        if (!tableBody) return;
        
        const totalPages = Math.max(1, Math.ceil(medicalRecords.length / HISTORY_PER_PAGE));
        if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;
        
        const start = (currentHistoryPage - 1) * HISTORY_PER_PAGE;
        const paginatedRecords = medicalRecords.slice(start, start + HISTORY_PER_PAGE);

        let tableHtml = '';
        let cardHtml = '';

        paginatedRecords.forEach(data => {
            const date = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
            const { html: doctorAvatar, style: drAvatarStyle, classes: drAvatarClasses } = getAvatarConfig({
                uid: data.doctorId,
                name: data.doctorName,
                photoURL: data.doctorPhotoURL
            });

            tableHtml += `
                <tr class="admin-table-row">
                    <td class="table-cell-muted">${date}</td>
                    <td>
                        <div class="user-info-cell">
                            <div class="user-avatar-sm ${drAvatarClasses}" style="${drAvatarStyle}">${doctorAvatar}</div>
                            <span class="user-name-text">Dr. ${data.doctorName}</span>
                        </div>
                    </td>
                    <td><span class="status-indicator-pill active">${data.diagnosis || 'Completed'}</span></td>
                    <td class="table-actions-cell">
                        <button class="btn-action-sm" onclick="explainDiagnosis('${data.id}')" title="Ask AI about this">
                            <i data-lucide="sparkles"></i>
                        </button>
                    </td>
                </tr>
            `;

            cardHtml += `
                <div class="staff-card">
                    <div class="staff-card-header">
                        <div class="user-avatar-sm ${drAvatarClasses}" style="${drAvatarStyle}">${doctorAvatar}</div>
                        <div>
                            <div class="user-name-text">Dr. ${data.doctorName}</div>
                            <div class="text-muted" style="font-size:0.75rem">${date}</div>
                        </div>
                    </div>
                    <div class="staff-card-body">
                        <span class="status-indicator-pill active">${data.diagnosis || 'Completed'}</span>
                    </div>
                    <div class="staff-card-actions">
                        <button class="btn-action-sm" onclick="explainDiagnosis('${data.id}')">
                            <i data-lucide="sparkles"></i> Ask AI
                        </button>
                    </div>
                </div>
            `;
        });

        tableBody.innerHTML = tableHtml || '<tr><td colspan="4" class="empty-state">No medical history found.</td></tr>';
        if (cardGrid) cardGrid.innerHTML = cardHtml || '<p class="empty-state">No medical history found.</p>';
        
        if (pagination && totalPages > 1) {
            renderPagination(pagination, currentHistoryPage, totalPages, (newPage) => {
                currentHistoryPage = newPage;
                renderHistory();
            });
        } else if (pagination) {
            pagination.style.display = 'none';
            pagination.innerHTML = '';
        }

        if (window.lucide) lucide.createIcons();
    }

    onSnapshot(q, (snap) => {
        medicalRecords = [];
        snap.forEach(d => medicalRecords.push({ id: d.id, ...d.data() }));
        
        if (statsTotalVisits) statsTotalVisits.textContent = snap.size;
        
        setTimeout(() => {
            currentHistoryPage = 1;
            renderHistory();
        }, SKELETON_DELAY);
    });
}

// ── Load Upcoming Appointments ────────────────────────────────
function loadMyAppointments(uid) {
    const tableBody = document.getElementById('appts-table-body');
    const cardGrid = document.getElementById('appts-card-grid');
    const statsNextAppt = document.getElementById('stats-next-appt');
    const today = new Date().toISOString().split('T')[0];

    let allPatientAppts = [];
    let currentApptsPage = 1;
    const APPTS_PER_PAGE = 6;

    function renderAppts() {

        const pagination = document.getElementById('appts-pagination');

        const totalPages = Math.max(1, Math.ceil(allPatientAppts.length / APPTS_PER_PAGE));

        if (currentApptsPage > totalPages) currentApptsPage = totalPages;
        const start = (currentApptsPage - 1) * APPTS_PER_PAGE;
        const paginatedAppts = allPatientAppts.slice(start, start + APPTS_PER_PAGE);

        let tableHtml = '';
        let cardHtml = '';

        paginatedAppts.forEach(data => {
            const apptDate = data.date || '';
            const dateDisplay = apptDate
                ? new Date(apptDate + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';

            let category, categoryClass;
            if (data.status === 'completed') {
                category = 'Completed'; categoryClass = 'completed';
            } else if (apptDate === today) {
                category = 'Today'; categoryClass = 'pending';
            } else if (apptDate > today) {
                category = 'Upcoming'; categoryClass = 'pending';
            } else {
                category = 'Expired'; categoryClass = 'expired';
            }

            const { html: drAvatarContent, style: drAvatarStyle, classes: drAvatarClasses } = getAvatarConfig({
                uid: data.doctorId,
                name: data.doctorName,
                photoURL: data.doctorPhotoURL
            });

            tableHtml += `
                <tr class="admin-table-row">
                    <td class="table-cell-muted">${dateDisplay} · ${data.time || '—'}</td>
                    <td>
                        <div class="user-info-cell">
                            <div class="user-avatar-sm ${drAvatarClasses}" style="${drAvatarStyle}">${drAvatarContent}</div>
                            <span class="user-name-text">Dr. ${data.doctorName}</span>
                        </div>
                    </td>
                    <td><span class="status-indicator-pill ${categoryClass}">${category}</span></td>
                    <td class="table-actions-cell">
                        ${data.status !== 'completed' ? `<button class="btn-action-sm" onclick="cancelAppointment('${data.id}')" title="Cancel Appointment">
                            <i data-lucide="trash-2"></i>
                        </button>` : ''}
                    </td>
                </tr>
            `;

            cardHtml += `
                <div class="staff-card">
                    <div class="staff-card-header">
                        <div class="user-avatar-sm ${drAvatarClasses}" style="${drAvatarStyle}">${drAvatarContent}</div>
                        <div>
                            <div class="user-name-text">Dr. ${data.doctorName}</div>
                            <div class="text-muted" style="font-size:0.75rem">${dateDisplay} · ${data.time || '—'}</div>
                        </div>
                    </div>
                    <div class="staff-card-body">
                        <span class="status-indicator-pill ${categoryClass}">${category}</span>
                    </div>
                    ${data.status !== 'completed' ? `<div class="staff-card-actions">
                        <button class="btn-action-sm danger" onclick="cancelAppointment('${data.id}')">
                            <i data-lucide="trash-2"></i> Cancel
                        </button>
                    </div>` : ''}
                </div>
            `;
        });

        if (tableBody) tableBody.innerHTML = tableHtml || '<tr><td colspan="4" class="empty-state">No appointments yet.</td></tr>';
        if (cardGrid) cardGrid.innerHTML = cardHtml || '<p class="empty-state">No appointments yet.</p>';

        if (statsNextAppt) {
            const upcoming = allPatientAppts.find(a => a.status !== 'completed' && (a.date || '') >= today);
            statsNextAppt.textContent = upcoming
                ? `${upcoming.date ? new Date(upcoming.date + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : ''} · ${upcoming.time} · Dr. ${upcoming.doctorName.split(' ')[0]}`
                : 'None Scheduled';
        }

        if (pagination && totalPages > 1) {
            renderPagination(pagination, currentApptsPage, totalPages, (newPage) => {
                currentApptsPage = newPage;
                renderAppts();
            });
        } else if (pagination) {
            pagination.style.display = 'none';
            pagination.innerHTML = '';
        }

        if (window.lucide) lucide.createIcons();

    }

    const q = query(collection(db, 'appointments'), where('patientId', '==', uid));

    onSnapshot(q, (snap) => {
        setTimeout(() => {
            allPatientAppts = [];
            snap.forEach(d => allPatientAppts.push({ id: d.id, ...d.data() }));

            allPatientAppts.sort((a, b) => {
                const da = a.date || '';
                const db_ = b.date || '';
                if (da !== db_) return da > db_ ? 1 : -1;
                return (a.time || '') > (b.time || '') ? 1 : -1;
            });

            currentApptsPage = 1;
            renderAppts();
        }, SKELETON_DELAY);
    });
}

// ── Populate Doctors ──────────────────────────────────────────
async function populateDoctors() {
    onSnapshot(query(collection(db, 'users'), where('role', '==', 'doctor')), (snap) => {
        setTimeout(() => {
            const doctors = [];
            snap.forEach(d => {
                const data = d.data();
                doctors.push({
                    id: d.id,
                    name: data.name,
                    sub: data.specialization || 'General Physician',
                    photoURL: data.photoURL,
                    extra: { ...data }
                });
            });
            initCustomSelect('doctor-select-container', 'doctor-options-list', 'select-doctor', doctors);
        }, SKELETON_DELAY);
    });
}

// ── Book Appointment ──────────────────────────────────────────
const bookForm = document.getElementById('book-form');
if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectEl = document.getElementById('select-doctor');
        const date = document.getElementById('appt-date').value;
        const time = document.getElementById('appt-time').value;

        if (!selectEl.value || !date || !time) {
            showToast('Please select a doctor, date and time.', 'warning');
            return;
        }

        // Get doctor name from the option's data-name attribute
        const doctorId = selectEl.value;
        const doctorName = selectEl.options[selectEl.selectedIndex].dataset.name;
        const doctorPhotoURL = selectEl.options[selectEl.selectedIndex].dataset.photoUrl;

        try {
            // Capacity Validation
            const doctorSnap = await getDoc(doc(db, 'users', doctorId));
            if (doctorSnap.exists()) {
                const capacity = doctorSnap.data().dailyCapacity || 10;
                const dbApptsQuery = query(
                    collection(db, 'appointments'),
                    where('doctorId', '==', doctorId),
                    where('date', '==', date)
                );
                const dbApptsSnap = await getDocs(dbApptsQuery);
                // Exclude canceled/expired if needed, but here simple count
                if (dbApptsSnap.size >= capacity) {
                    showToast(`Dr. ${doctorName} is fully booked for ${date}. Please select another date.`, 'warning', 5000);
                    return;
                }
            }

            await addDoc(collection(db, 'appointments'), {
                patientId: auth.currentUser.uid,
                patientName: userData.name,
                patientAge: userData.age || '—',
                patientGender: userData.gender || '—',
                patientPhotoURL: userData.photoURL || '',
                doctorId,
                doctorName,
                doctorPhotoURL: doctorPhotoURL || '',
                date,
                time,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            showToast('Appointment requested successfully!', 'success');
            bookForm.reset();
            // Reset custom select trigger text
            const trigger = document.querySelector('#doctor-select-trigger span');
            if (trigger) trigger.textContent = 'Choose a doctor...';
            document.querySelector('[data-target="appointments-section"]').click();
        } catch (err) {
            console.error(err);
            showToast('Failed to book appointment.', 'error');
        }
    });
}

// ── Cancel Appointment ────────────────────────────────────────
window.cancelAppointment = async (id) => {
    if (!confirm('Cancel this appointment?')) return;
    try {
        await deleteDoc(doc(db, 'appointments', id));
    } catch (err) {
        console.error(err);
        showToast('Failed to cancel.', 'error');
    }
};

// ── AI Assistant Logic ────────────────────────────────────────
window.askAi = async () => {
    const input = document.getElementById('ai-input');
    const msg = input.value.trim();
    if (!msg) return;

    addChatMessage('user', msg);
    input.value = '';

    // Simulate AI thinking
    const loaderId = addTypingIndicator();

    // Simulate Gemini AI Response
    setTimeout(() => {
        removeTypingIndicator(loaderId);
        const response = simulateAiResponse(msg);
        typeText(response);
    }, 1500);
};

window.explainDiagnosis = (apptId) => {
    const appt = medicalRecords.find(r => r.id === apptId) || medicalRecords[0];
    if (!appt) return;

    document.querySelector('[data-target="ai-assistant-section"]').click();
    const prompt = `Can you explain my diagnosis of "${appt.diagnosis}" and what these medicines do: ${appt.medicines}?`;

    addChatMessage('user', prompt);
    const loaderId = addTypingIndicator();

    setTimeout(() => {
        removeTypingIndicator(loaderId);
        const response = `Certainly! Your diagnosis of **${appt.diagnosis}** means... (Simulated Explanation of ${appt.medicines}). Please take your medications exactly as Dr. ${appt.doctorName} prescribed.`;
        typeText(response);
    }, 1500);
};

function addChatMessage(role, text) {
    const container = document.getElementById('ai-chat-messages');
    const div = document.createElement('div');
    div.className = `chat-bubble bubble-${role}`;
    div.innerHTML = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function addTypingIndicator() {
    const container = document.getElementById('ai-chat-messages');
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'chat-bubble bubble-ai typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function typeText(text) {
    const container = document.getElementById('ai-chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-bubble bubble-ai';
    container.appendChild(div);

    let i = 0;
    const interval = setInterval(() => {
        div.innerHTML += text[i];
        i++;
        container.scrollTop = container.scrollHeight;
        if (i >= text.length) clearInterval(interval);
    }, 20);
}

function simulateAiResponse(userMsg) {
    const q = userMsg.toLowerCase();
    if (q.includes('hello') || q.includes('hi')) return "Hello! I'm your health assistant. I can explain your records or answer medical questions.";
    if (q.includes('diagnosis')) return "Based on your records, your most recent diagnosis was handled by your specialist. I can explain the terminology if you'd like.";
    return "That's a great question. While I'm an AI, I suggest discussing specific symptoms with your doctor during your next visit. Would you like to book one now?";
}

// ── Direct ID Card Download (No Preview) ─────────────────────
window.downloadIDCardDirectly = async (uid, roleType = 'patient') => {
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

        const productionID = `PAT-${new Date().getFullYear().toString().slice(-2)}-${uid.substring(0, 5).toUpperCase()}`;
        const joinedDate = data.createdAt?.toDate 
            ? data.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
            : '2024';

        const { html: avatarHTML, style: avatarStyle, classes: avatarClasses } = getAvatarConfig(data);

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
                colorDark: "#0c4a6e",
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
                scale: 4, 
                useCORS: true, 
                letterRendering: true,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const cardElement = renderArea.querySelector('.id-card-wrapper');
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
