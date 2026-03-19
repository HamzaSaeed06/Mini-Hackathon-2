import { renderPagination } from '../../js/pagination.js';
import { 
    applyAvatarStyle, 
    AVATAR_PALETTES,
    getAvatarPalette,
    getAvatarConfig,
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

// Instant initialization
if (window.lucide) lucide.createIcons();


function updateMetricCard(id, title, value, iconClass) {
    const container = document.getElementById(id);
    if (!container) return;

    container.innerHTML = `
        <div class="metric-header">
            <span class="metric-title">${title}</span>
            <div class="metric-icon ${iconClass.includes('success') ? 'success' : 'primary'}">
                <i data-lucide="${iconClass}"></i>
            </div>
        </div>
        <div class="metric-value">${value}</div>
    `;
    if (window.lucide) lucide.createIcons();
}

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
                if (targetId === 'medical-history-section') {
                    loadMyHistory(auth.currentUser.uid);
                } else if (targetId === 'appointments-section') {
                    loadMyAppointments(auth.currentUser.uid);
                } else if (targetId === 'smart-booking-section') {
                    if (!item.dataset.loaded) {
                        if (window.smartBooking) {
                            window.smartBooking.renderBookingInterface();
                        }
                        item.dataset.loaded = 'true';
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
        
        updateMetricCard('metric-consultations-card', 'Total Consultations', snap.size, 'stethoscope');
        
        currentHistoryPage = 1;
        renderHistory();
    }, (err) => {
        console.warn('Medical records listener error (may be offline):', err.code);
        renderHistory();
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
            if (data.status === 'cancelled') {
                category = 'Cancelled'; categoryClass = 'cancelled';
            } else if (data.status === 'completed') {
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
                        ${(data.status !== 'completed' && data.status !== 'cancelled') ? `<button class="btn-action-sm danger" onclick="cancelAppointment('${data.id}')" title="Cancel Appointment">
                            <i data-lucide="x"></i>
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
                    ${(data.status !== 'completed' && data.status !== 'cancelled') ? `<div class="staff-card-actions">
                        <button class="btn-action-sm danger" onclick="cancelAppointment('${data.id}')">
                            <i data-lucide="x"></i> Cancel
                        </button>
                    </div>` : ''}
                </div>
            `;
        });

        if (tableBody) tableBody.innerHTML = tableHtml || '<tr><td colspan="4" class="empty-state">No appointments yet.</td></tr>';
        if (cardGrid) cardGrid.innerHTML = cardHtml || '<p class="empty-state">No appointments yet.</p>';

        const upcoming = allPatientAppts.find(a => a.status !== 'completed' && (a.date || '') >= today);
        const nextValue = upcoming
            ? `${upcoming.date ? new Date(upcoming.date + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : ''} · ${upcoming.time}`
            : 'None Scheduled';
        
        updateMetricCard('metric-next-appt-card', 'Next Appointment', nextValue, 'calendar');

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
    }, (err) => {
        console.warn('Appointments listener error (may be offline):', err.code);
        renderAppts();
    });
}

// ── Populate Doctors ──────────────────────────────────────────
async function populateDoctors() {
    onSnapshot(query(collection(db, 'users'), where('role', '==', 'doctor')), (snap) => {
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
        const complaint = (document.getElementById('appt-complaint')?.value || '').trim();

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
                if (dbApptsSnap.size >= capacity) {
                    showToast(`Dr. ${doctorName} is fully booked for ${date}. Please select another date.`, 'warning', 5000);
                    return;
                }
            }

            await addDoc(collection(db, 'appointments'), {
                patientId: auth.currentUser.uid,
                patientName: userData.name,
                patientEmail: auth.currentUser.email || userData.email || '',
                patientAge: userData.age || '—',
                patientGender: userData.gender || '—',
                patientPhotoURL: userData.photoURL || '',
                doctorId,
                doctorName,
                doctorPhotoURL: doctorPhotoURL || '',
                date,
                time,
                complaint: complaint || '',
                status: 'pending',
                bookedBy: 'patient',
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
    const confirmed = await new Promise((resolve) => {
        if (window.customConfirm) {
            window.customConfirm(
                'Are you sure you want to cancel this appointment? This action cannot be undone.',
                () => resolve(true),
                () => resolve(false),
                { type: 'warning', confirmText: 'Yes, Cancel' }
            );
        } else {
            resolve(confirm('Cancel this appointment?'));
        }
    });

    if (!confirmed) return;

    try {
        await updateDoc(doc(db, 'appointments', id), {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
            cancelledBy: 'patient'
        });
        showToast('Appointment cancelled successfully.', 'success');
    } catch (err) {
        console.error(err);
        showToast('Failed to cancel appointment. Please try again.', 'error');
    }
};

// ── AI Assistant Logic ────────────────────────────────────────
window.askAi = async () => {
    const input = document.getElementById('ai-input');
    const msg = input.value.trim();
    if (!msg) return;

    addChatMessage('user', msg);
    input.value = '';
    input.disabled = true;

    // Show typing indicator
    const typingId = addTypingIndicator();

    // Simulate AI thinking delay (600-1200ms)
    const delay = 600 + Math.random() * 600;
    await new Promise(r => setTimeout(r, delay));

    removeTypingIndicator(typingId);
    const response = simulateAiResponse(msg);
    addChatMessage('ai', response);
    input.disabled = false;
    input.focus();
};

window.explainDiagnosis = (apptId) => {
    const appt = medicalRecords.find(r => r.id === apptId) || medicalRecords[0];
    if (!appt) return;

    document.querySelector('[data-target="ai-assistant-section"]').click();
    const prompt = `Can you explain my diagnosis of "${appt.diagnosis}" and what these medicines do: ${appt.medicines}?`;

    addChatMessage('user', prompt);
    const response = `Certainly! Your diagnosis of **${appt.diagnosis}** means... (Reflecting your records: ${appt.medicines}). Please take your medications exactly as Dr. ${appt.doctorName} prescribed.`;
    addChatMessage('ai', response);
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
    addChatMessage('ai', text);
}

function simulateAiResponse(userMsg) {
    const q = userMsg.toLowerCase();

    if (q.includes('hello') || q.includes('hi') || q.includes('hey'))
        return `Hello! I'm your personal health assistant. I can help you understand your medical records, explain diagnoses, answer general health questions, or help you prepare for your next visit. What would you like to know?`;

    if (q.includes('diagnosis') || q.includes('diagnos'))
        return `Based on your records, I can see you have had ${medicalRecords.length} consultation(s) with our doctors. Your most recent diagnosis was <strong>${medicalRecords[0]?.diagnosis || 'not yet available'}</strong>. Would you like me to explain what this means in simple terms?`;

    if (q.includes('medicine') || q.includes('medication') || q.includes('drug') || q.includes('pill'))
        return `Your most recently prescribed medications include: <strong>${(medicalRecords[0]?.medicines || []).join(', ') || 'None recorded yet'}</strong>. Always take your medicines as directed by your doctor, with or without food as specified. Never skip a dose or stop without consulting your doctor first.`;

    if (q.includes('appointment') || q.includes('book') || q.includes('schedule'))
        return `You can book a new appointment from the <strong>Book Appointment</strong> section in the sidebar. Select your preferred doctor, date, and time. Our team will confirm your slot. If you need urgent care, please call the clinic directly.`;

    if (q.includes('cancel'))
        return `To cancel an appointment, go to <strong>My Appointments</strong> section and click the cancel button on the appointment you wish to remove. Please cancel at least 24 hours in advance to help other patients get the slot.`;

    if (q.includes('fever') || q.includes('temperature'))
        return `For fever: rest, stay hydrated with plenty of fluids, and take Paracetamol 500mg every 6 hours as needed. If your fever is above 39°C (102°F), lasts more than 3 days, or is accompanied by a stiff neck or severe headache, please visit the clinic immediately.`;

    if (q.includes('headache') || q.includes('head pain'))
        return `For mild to moderate headaches: rest in a quiet, dark room, apply a cool compress, and take Ibuprofen 400mg (with food) or Paracetamol 500mg. Stay hydrated. If the headache is sudden and severe, or with vision changes, seek emergency care.`;

    if (q.includes('blood pressure') || q.includes('bp') || q.includes('hypertension'))
        return `Normal blood pressure is around 120/80 mmHg. To manage high blood pressure: reduce salt intake, exercise regularly, limit alcohol and caffeine, and take your prescribed medication consistently. Do not skip doses even when you feel fine.`;

    if (q.includes('diabetes') || q.includes('sugar') || q.includes('blood sugar'))
        return `For diabetes management: monitor your blood glucose daily, take medications as prescribed, follow a low-sugar diet, exercise for 30 minutes daily, and attend regular HbA1c check-ups every 3 months. Avoid skipping meals.`;

    if (q.includes('cough') || q.includes('cold') || q.includes('flu'))
        return `For cough and cold: rest, drink warm fluids (honey + ginger tea), take Paracetamol for fever, and use a humidifier if available. Ambroxol syrup can help loosen mucus. See a doctor if symptoms persist beyond 7 days or if you develop chest pain or difficulty breathing.`;

    if (q.includes('history') || q.includes('records') || q.includes('past'))
        return `You have <strong>${medicalRecords.length} completed consultation(s)</strong> on record. You can view your full medical history with diagnoses, medications, and doctor's findings in the <strong>Medical History</strong> section of your dashboard.`;

    if (q.includes('thank'))
        return `You're very welcome! Your health is our priority at CareSync. If you have any more questions or need to book an appointment, I'm here to help. Stay well! 🌿`;

    if (q.includes('emergency') || q.includes('urgent'))
        return `⚠️ If this is a medical emergency, please call <strong>115 (Rescue)</strong> immediately or go to your nearest emergency room. Do not delay seeking help for chest pain, difficulty breathing, severe bleeding, or loss of consciousness.`;

    return `That's a good question. While I can provide general health information, for specific medical advice regarding your condition, it's always best to consult with your doctor. Would you like help booking an appointment or viewing your medical records?`;
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
        await new Promise(resolve => setTimeout(resolve, 100));

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
