import { renderPagination } from '../../js/pagination.js';
import { 
    showToast, 
    applyAvatarStyle, 
    getAvatarPalette,
    getAvatarConfig,
    AVATAR_PALETTES
} from '../../js/utils.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, getDoc, collection, query, where, onSnapshot, getDocs,
    updateDoc, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { auth, db } from "../../js/firebase-config.js";

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
    if (!snap.exists() || snap.data().role !== 'doctor') {
        showToast('Access Denied: Doctors only.', 'error');
        return (window.location.href = '../index.html');
    }

    userData = snap.data();
    
    // Deterministic palette handled by utils now

    if (displayName) displayName.textContent = `Dr. ${userData.name || 'Doctor'}`;
    if (userAvatar) {
        const { html, style, classes } = getAvatarConfig(userData);
        userAvatar.innerHTML = html;
        userAvatar.className = `avatar ${classes}`;
        userAvatar.style.cssText = style;
    }

// Population Profile Section
    populateProfile(user.uid, userData, 'doctor');

    // Start listeners
    loadAppointments(user.uid);
    loadPersonalStats(user.uid);
    loadMedicalHistory();

    // Profile Download ID Listener
    document.getElementById('profile-download-id-btn')?.addEventListener('click', () => {
        if (!userData.photoURL) {
            showToast('Please upload a profile photo to generate your Digital ID.', 'warning');
            return;
        }
        window.downloadIDCardDirectly(user.uid, 'Doctor');
    });
});

// Mirror Admin's Avatar System for 1:1 Parity
const getAvatarHTML = (m) => {
    const { html, style, classes } = getAvatarConfig(m);
    return `<div class="user-avatar-sm ${classes}" style="display:inline-flex; align-items:center; justify-content:center; ${style}">${html}</div>`;
};

// ── Photo Upload UX ──────────────────────────────────────────
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
        avatarEl.style.background = 'transparent';
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
            
            // Global Sync: Update all instances of the avatar on the page
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
            }

            showToast('Profile photo updated successfully!', 'success');
            resetUploadButton();
        } else {
            throw new Error('Upload failed');
        }
    } catch (err) {
        console.error(err);
        showToast('Upload failed. Switching back.', 'error');
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
    const capacityInput = document.getElementById('profile-capacity-input');

    if (nameEl) nameEl.textContent = role === 'doctor' ? `Dr. ${data.name}` : data.name;
    if (roleEl) roleEl.textContent = role === 'doctor' ? 'Medical Specialist' : 'Healthcare Professional';
    if (emailEl) emailEl.textContent = data.email || 'N/A';
    if (idEl) idEl.textContent = `#${role.substring(0, 3).toUpperCase()}-${uid.substring(0, 5).toUpperCase()}`;
    if (capacityInput) capacityInput.value = data.dailyCapacity || 10;
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
            downloadBtn.onclick = () => window.showIDCard(uid, 'Doctor');
        } else {
            downloadBtn.disabled = true;
            if (warningMsg) warningMsg.style.display = 'flex';
        }
    }
}

// ── Constants & State ──────────────────────────────────────────
const APPT_PER_PAGE = 6;
let allAppointments = [];
let currentApptPage = 1;

const historyDataCache = [];
let currentHistPage = 1;
const HIST_PER_PAGE = 6;

// Modal History State
const MODAL_HIST_PER_PAGE = 6;
let currentModalPage = 1;
let currentPatientHistory = [];
let currentPatientName = "";
let activePatientName = ""; // To store the name for diagnosis/prescription



// ── Update Daily Capacity ──────────────────────────────────────
window.updateDailyCapacity = async () => {
    const input = document.getElementById('profile-capacity-input');
    if (!input) return;
    const capacity = parseInt(input.value);

    if (isNaN(capacity) || capacity < 1 || capacity > 50) {
        showToast("Please enter a valid capacity between 1 and 50.", 'warning');
        return;
    }
    try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, { dailyCapacity: capacity });
        showToast(`Daily capacity updated to ${capacity} patients per day.`, 'success');
    } catch (error) {
        console.error("Error updating capacity:", error);
        showToast("Failed to update daily capacity.", 'error');
    }
}

// ── Navigation Logic ──────────────────────────────────────────
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        const targetId = item.getAttribute('data-target');
        if (!targetId) return;

        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        sections.forEach(section => {
            section.classList.remove('active');
            if (section.id === targetId) {
                section.classList.add('active');
                
                // Perception Delay on Click
                if (targetId === 'appointments-section') {
                    renderApptPage();
                } else if (targetId === 'patients-history-section') {
                    renderHistoryTable();
                }
            }
        });

        // Ensure icons are created for the new section
        if (window.lucide) {
            setTimeout(() => lucide.createIcons(), 50);
        }

        // Special handling for profile
        if (targetId === 'profile-section') {
            const user = auth.currentUser;
            if (user) {
                // userData is global in doctor.js
                populateProfile(user.uid, userData, 'doctor');
            }
        }

        const newTitle = item.getAttribute('data-title') || item.querySelector('span').textContent;
        if (pageTitle) pageTitle.textContent = newTitle;

        if (window.innerWidth < 1024) window.closeSidebar();
    });
});

// ── Logout ────────────────────────────────────────────────────
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = '../index.html');
    });
}

function loadAppointments(doctorId) {
    const q = query(collection(db, 'appointments'), where('doctorId', '==', doctorId));

    onSnapshot(q, (snap) => {
        allAppointments = [];
        snap.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));
        renderApptPage();
    }, (err) => {
        console.warn('Appointments listener error (may be offline):', err.code);
        renderApptPage();
    });
}

function renderApptPage() {
    const tableBody = document.getElementById('appointments-table-body');
    const cardGrid = document.getElementById('appointments-card-grid');
    const paginationContainer = document.getElementById('appointments-pagination-container');
    if (!tableBody || !cardGrid) return;

    if (allAppointments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="empty-state">No appointments found.</td></tr>';
        cardGrid.innerHTML = `
            <div class="empty-state-card v-excellence">
                <i data-lucide="calendar-x" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 1rem;"></i>
                <p>No appointments scheduled for today.</p>
            </div>
        `;
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(allAppointments.length / APPT_PER_PAGE);
    const startIndex = (currentApptPage - 1) * APPT_PER_PAGE;
    const paginatedItems = allAppointments.slice(startIndex, startIndex + APPT_PER_PAGE);

    let tableHtml = '';
    let cardHtml = '';

    paginatedItems.forEach(data => {
        const pName = data.patientName || 'Patient';
        // patientEmail is stored directly in appointment (both receptionist-booked and self-booked)
        const pEmail = data.patientEmail || historyDataCache.find(pt => pt.id === data.patientId)?.email || '—';

        // Robust Date Formatter: handles both 'YYYY-MM-DD' strings and Firestore Timestamps
        let displayDate = 'No Date';
        if (data.date) {
            if (data.date.toDate) {
                // Firestore Timestamp
                displayDate = data.date.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
            } else if (typeof data.date === 'string' && data.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // 'YYYY-MM-DD' string — parse with local time to avoid UTC-offset off-by-one
                const [y, m, d] = data.date.split('-').map(Number);
                displayDate = new Date(y, m - 1, d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
            } else {
                displayDate = data.date;
            }
        }
        const displayTime = data.time || '—';
        const complaint = data.complaint ? data.complaint : null;

        tableHtml += `
            <tr class="admin-table-row">
                <td>
                    <div class="user-info-cell">
                        ${getAvatarHTML({ name: pName, uid: data.patientId, photoURL: data.patientPhotoURL })}
                        <div class="user-details">
                            <span class="user-name-text">${pName}</span>
                            <span class="user-email-subtext">${pEmail}</span>
                        </div>
                    </div>
                </td>
                <td class="table-cell-muted">
                    <div>${displayDate} · ${displayTime}</div>
                    ${complaint ? `<div style="font-size:0.75rem;color:#DC2626;margin-top:2px;font-style:italic;">⚕ ${complaint}</div>` : ''}
                </td>
                <td>
                    <span class="status-indicator-pill ${data.status || 'pending'}">
                        <span class="status-dot-indicator"></span>
                        <span class="status-text-compact">${(data.status || 'pending').toUpperCase()}</span>
                    </span>
                </td>
                <td class="table-actions-cell">
                    <button class="btn-doctor-action" onclick="openDiagnosis('${data.id}', '${pName.replace(/'/g, "\\'")}')" title="Attend Patient">
                        <i data-lucide="stethoscope"></i>
                        <span>Attend</span>
                    </button>
                </td>
            </tr>
        `;

        cardHtml += `
            <div class="staff-card v-excellence">
                <div class="staff-card-header">
                    <div class="staff-header-info">
                        ${getAvatarHTML({ name: pName, uid: data.patientId, photoURL: data.patientPhotoURL })}
                        <div class="staff-title-box">
                            <span class="staff-name">${pName}</span>
                            <span class="staff-role-tag">Appointment</span>
                        </div>
                    </div>
                    <span class="status-indicator-pill ${data.status || 'pending'}"><span class="status-dot-indicator"></span>${(data.status || 'pending').toUpperCase()}</span>
                </div>
                <div class="staff-card-body">
                    <div class="staff-detail-row">
                        <i data-lucide="mail"></i>
                        <span>${pEmail}</span>
                    </div>
                    <div class="staff-detail-row">
                        <i data-lucide="calendar"></i>
                        <span>${displayDate} · ${displayTime}</span>
                    </div>
                    ${complaint ? `<div class="staff-detail-row" style="color:#DC2626;">
                        <i data-lucide="clipboard-list"></i>
                        <span style="font-style:italic;">${complaint}</span>
                    </div>` : ''}
                </div>
                <div class="staff-card-footer">
                    <button class="btn btn-primary btn-full" onclick="openDiagnosis('${data.id}', '${pName.replace(/'/g, "\\'")}')">
                        <i data-lucide="stethoscope"></i> Attend Patient
                    </button>
                </div>
            </div>
        `;
    });

    tableBody.innerHTML = tableHtml;
    cardGrid.innerHTML = cardHtml;
    
    if (paginationContainer) {
        if (totalPages > 1) {
            renderPagination(paginationContainer, currentApptPage, totalPages, (newPage) => {
                currentApptPage = newPage;
                renderApptPage();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        } else {
            paginationContainer.innerHTML = '';
        }
    }

    if (window.lucide) lucide.createIcons();
}

window.rapidAiAssist = async () => {
    const findings = document.getElementById('finding-text').value.trim();
    if (!findings) return showToast('Please describe symptoms first for AI to analyze.', 'warning');

    const btn = document.querySelector('[onclick="rapidAiAssist()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Analyzing...`; if (window.lucide) lucide.createIcons(); }

    showToast('AI is analyzing symptoms...', 'info');

    await new Promise(r => setTimeout(r, 800));

    const text = findings.toLowerCase();
    const has = (kws) => kws.some(k => text.includes(k));

    let diagnosis = '';
    let medicines = '';

    if (has(['fever', 'flu', 'cold', 'runny nose', 'nasal', 'sneezing', 'chills', 'body ache'])) {
        diagnosis = 'Viral Upper Respiratory Infection (Flu)';
        medicines = 'Paracetamol 500mg every 6 hrs, Arinac Forte 1 tab twice daily, Vitamin C 500mg once daily';
    } else if (has(['sore throat', 'tonsil', 'throat pain', 'strep', 'pharyngitis'])) {
        diagnosis = 'Bacterial Pharyngitis / Tonsillitis';
        medicines = 'Amoxicillin 500mg 8-hrly x5 days, Paracetamol 500mg PRN, Strepsils lozenges';
    } else if (has(['cough', 'chest congestion', 'phlegm', 'mucus', 'bronchitis', 'wheeze'])) {
        diagnosis = 'Acute Bronchitis / Productive Cough';
        medicines = 'Ambroxol 30mg twice daily, Salbutamol inhaler if wheeze present, Steam inhalation twice daily';
    } else if (has(['stomach', 'vomit', 'diarrhea', 'loose motion', 'nausea', 'gastroenteritis', 'abdominal pain'])) {
        diagnosis = 'Acute Gastroenteritis';
        medicines = 'ORS sachets every 4 hrs, Metronidazole 400mg 3x daily x5 days, Domperidone 10mg before meals';
    } else if (has(['headache', 'migraine', 'head pain', 'tension headache'])) {
        diagnosis = 'Tension Headache / Migraine';
        medicines = 'Ibuprofen 400mg with food, Paracetamol 500mg PRN, Rest in quiet dark room';
    } else if (has(['allergy', 'rash', 'itch', 'hives', 'urticaria', 'skin reaction'])) {
        diagnosis = 'Allergic Reaction / Urticaria';
        medicines = 'Cetirizine 10mg once daily at night, Hydrocortisone cream topically, Avoid allergen trigger';
    } else if (has(['diabetes', 'sugar', 'blood sugar', 'hyperglycemia', 'fasting glucose'])) {
        diagnosis = 'Type 2 Diabetes — Review Visit';
        medicines = 'Metformin 500mg twice daily with meals, HbA1c test in 3 months, Monitor fasting glucose daily';
    } else if (has(['bp', 'blood pressure', 'hypertension', 'hypertensive'])) {
        diagnosis = 'Hypertension';
        medicines = 'Amlodipine 5mg once daily morning, Low-sodium diet, Lifestyle modification counselled';
    } else if (has(['back pain', 'lumbar', 'spine', 'muscle strain', 'sciatica'])) {
        diagnosis = 'Musculoskeletal Back Pain';
        medicines = 'Diclofenac 75mg twice daily with food, Muscle relaxant Methocarbamol 750mg twice daily, Hot compress + rest';
    } else if (has(['joint pain', 'arthritis', 'swollen joint', 'knee pain', 'gout'])) {
        diagnosis = 'Arthralgia / Arthritis';
        medicines = 'Ibuprofen 400mg 3x daily with meals, Physiotherapy referral, Joint support if needed';
    } else if (has(['urinary', 'uti', 'burning urine', 'frequent urination', 'dysuria'])) {
        diagnosis = 'Urinary Tract Infection (UTI)';
        medicines = 'Ciprofloxacin 500mg twice daily x5 days, Increase water intake >2L/day, Urinalysis follow-up';
    } else if (has(['anxiety', 'stress', 'panic', 'mental health', 'depression', 'insomnia'])) {
        diagnosis = 'Anxiety / Stress Disorder';
        medicines = 'Escitalopram 10mg once daily (review in 2 weeks), CBT referral recommended, Lifestyle counselling';
    } else if (has(['wound', 'cut', 'laceration', 'injury', 'bruise', 'trauma'])) {
        diagnosis = 'Minor Trauma / Wound Care';
        medicines = 'Amoxicillin-Clavulanate 625mg twice daily if infected, Tetanus prophylaxis if needed, Dressing change daily';
    } else {
        diagnosis = 'General Medical Assessment Required';
        medicines = 'Paracetamol 500mg PRN for symptomatic relief, Full clinical examination required, Further investigation recommended';
    }

    document.getElementById('diagnosis-input').value = diagnosis;
    document.getElementById('medicines-input').value = medicines;

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="wand-2"></i> AI Assist`;
        if (window.lucide) lucide.createIcons();
    }

    showToast('AI diagnosis applied based on symptoms!', 'success');
};

window.openDiagnosis = async (apptId, patientName) => {
    document.getElementById('active-appt-id').value = apptId;
    activePatientName = patientName;
    document.getElementById('diagnosis-modal').classList.add('active');
    document.getElementById('diagnosis-form').reset();

    // Reset info strip
    const strip = document.getElementById('modal-patient-info-strip');
    const subtitle = document.getElementById('modal-patient-subtitle');
    if (subtitle) subtitle.textContent = 'Loading patient info...';
    if (strip) strip.style.display = 'none';

    try {
        const apptSnap = await getDoc(doc(db, 'appointments', apptId));
        if (apptSnap.exists()) {
            const appt = apptSnap.data();

            // Store patient id for PDF
            const patIdInput = document.getElementById('active-patient-id');
            if (patIdInput) patIdInput.value = appt.patientId || '';

            // Populate info strip
            const nameTag = document.getElementById('modal-patient-name-tag');
            const demog = document.getElementById('modal-patient-demog');
            const apptDate = document.getElementById('modal-appt-date');

            if (nameTag) nameTag.textContent = appt.patientName || patientName;
            if (demog) {
                const age = appt.patientAge ? `${appt.patientAge} yrs` : 'N/A';
                const gender = appt.patientGender || 'N/A';
                demog.textContent = `${age} / ${gender}`;
            }
            if (apptDate) {
                let dateStr = 'N/A';
                if (appt.date) {
                    if (appt.date.toDate) {
                        dateStr = appt.date.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
                    } else if (typeof appt.date === 'string' && appt.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        const [y, mo, d] = appt.date.split('-').map(Number);
                        dateStr = new Date(y, mo - 1, d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
                    } else {
                        dateStr = appt.date;
                    }
                }
                apptDate.textContent = `${dateStr}${appt.time ? ' at ' + appt.time : ''}`;
            }

            // Show chief complaint in modal if present
            const complaintRow = document.getElementById('modal-complaint-row');
            const complaintText = document.getElementById('modal-complaint-text');
            if (appt.complaint && appt.complaint.trim()) {
                if (complaintText) complaintText.textContent = appt.complaint;
                if (complaintRow) complaintRow.style.display = 'block';
                // Pre-fill the findings textarea with complaint to speed up doctor workflow
                const findingEl = document.getElementById('finding-text');
                if (findingEl && !findingEl.value) {
                    findingEl.value = `Chief Complaint: ${appt.complaint}`;
                }
            } else {
                if (complaintRow) complaintRow.style.display = 'none';
            }

            if (strip) strip.style.display = 'block';
            if (subtitle) subtitle.textContent = `${appt.patientName || patientName}`;

            if (window.lucide) lucide.createIcons();
        }
    } catch (err) {
        console.warn('Could not load appointment info:', err.message);
        if (subtitle) subtitle.textContent = patientName;
    }
};

window.closeModal = (id) => {
    document.getElementById(id).classList.remove('active');
};

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// ── Stats Logic ───────────────────────────────────────────────
async function loadPersonalStats(doctorId) {
    const container = document.getElementById('stats-grid');
    if (!container) return;

    const q = query(collection(db, 'appointments'), where('doctorId', '==', doctorId));
    onSnapshot(q, (snap) => {
        let total = 0;
        let completed = 0;
        const today = new Date().toISOString().split('T')[0];
        let todayCountVal = 0;

        snap.forEach(d => {
            total++;
            const data = d.data();
            if (data.status === 'completed') completed++;
            if (data.date === today) todayCountVal++;
        });

        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Update the Stats Section UI (Admin Style metric-card)
        container.innerHTML = `
            <div class="metric-card">
                <div class="metric-header">
                    <span class="metric-title">Total Patients</span>
                    <div class="metric-icon"><i data-lucide="users"></i></div>
                </div>
                <div class="metric-value">${total}</div>
                <div class="metric-trend text-success"><i data-lucide="trending-up"></i> <span>+5%</span> vs last month</div>
            </div>
            <div class="metric-card">
                <div class="metric-header">
                    <span class="metric-title">Today's Appointments</span>
                    <div class="metric-icon success"><i data-lucide="calendar"></i></div>
                </div>
                <div class="metric-value">${todayCountVal}</div>
                <div class="metric-trend text-success"><i data-lucide="clock"></i> <span>Active</span></div>
            </div>
            <div class="metric-card">
                <div class="metric-header">
                    <span class="metric-title">Completed Visits</span>
                    <div class="metric-icon warning"><i data-lucide="check-circle"></i></div>
                </div>
                <div class="metric-value">${completed}</div>
                <div class="metric-trend text-success"><i data-lucide="activity"></i> <span>Pulse</span></div>
            </div>
            <div class="metric-card">
                <div class="metric-header">
                    <span class="metric-title">Completion Rate</span>
                    <div class="metric-icon revenue"><i data-lucide="percent"></i></div>
                </div>
                <div class="metric-value">${completionRate}%</div>
                <div class="metric-trend text-success"><i data-lucide="award"></i> <span>Top Tier</span></div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    }, (err) => {
        console.warn('Stats listener error (may be offline):', err.code);
    });
}

// ── Save Diagnosis & Prescription ───────────────────────────
window.saveDiagnosis = async () => {
    const apptId = document.getElementById('active-appt-id').value;
    const diagnosis = document.getElementById('diagnosis-input').value.trim();
    const medicinesRaw = document.getElementById('medicines-input').value.trim();
    const findings = document.getElementById('finding-text').value.trim();

    if (!diagnosis) return showToast('Please enter a diagnosis before saving.', 'warning');
    if (!apptId) return showToast('No appointment selected.', 'error');

    const saveBtn = document.querySelector('[onclick="saveDiagnosis()"]');
    const originalBtnHTML = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Saving...`;
        if (window.lucide) lucide.createIcons();
    }

    const medicines = medicinesRaw ? medicinesRaw.split(',').map(m => m.trim()).filter(Boolean) : [];

    try {
        // Get appointment data for complete prescription
        const apptSnap = await getDoc(doc(db, 'appointments', apptId));
        const apptData = apptSnap.exists() ? apptSnap.data() : {};

        await updateDoc(doc(db, 'appointments', apptId), {
            status: 'completed',
            diagnosis,
            medicines,
            findings,
            completedAt: serverTimestamp()
        });

        // Add to diagnosisLogs for Admin analytics
        await setDoc(doc(collection(db, 'diagnosisLogs')), {
            appointmentId: apptId,
            symptoms: findings || diagnosis,
            diagnosis,
            patientId: apptData.patientId || '',
            patientName: apptData.patientName || activePatientName || '',
            doctorId: auth.currentUser.uid,
            createdAt: serverTimestamp()
        });

        showToast('Prescription saved! Generating PDF...', 'success');
        closeModal('diagnosis-modal');

        // Generate professional PDF
        await generatePrescriptionPDF({
            patientName: apptData.patientName || activePatientName || 'Patient',
            patientAge: apptData.patientAge || '',
            patientGender: apptData.patientGender || '',
            doctorName: userData?.name || 'Doctor',
            specialization: userData?.specialization || 'General Physician',
            diagnosis,
            medicines,
            findings
        });

    } catch (e) {
        console.error('Save diagnosis error:', e);
        showToast('Failed to save diagnosis. Please try again.', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnHTML;
            if (window.lucide) lucide.createIcons();
        }
    }
};

// ── AI Consultant (Patient-Aware Smart Diagnosis) ────────────
window.analyzeSymptoms = async () => {
    const inputField = document.getElementById('symptoms-input');
    const input = inputField.value.trim();
    if (!input) return showToast('Please enter patient info & symptoms.', 'warning');

    const chatMessages = document.getElementById('ai-chat-messages');

    // Helper: add a message row with avatar
    function addRow(side, html) {
        const row = document.createElement('div');
        row.className = `ai-msg-row ai-msg-row--${side}`;

        const avatarEl = document.createElement('div');
        avatarEl.className = side === 'ai' ? 'ai-avatar' : 'user-avatar';
        avatarEl.innerHTML = side === 'ai'
            ? '<i data-lucide="brain-circuit"></i>'
            : '<i data-lucide="user-round"></i>';

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble bubble-${side}`;
        bubble.innerHTML = html;

        if (side === 'ai') {
            row.appendChild(avatarEl);
            row.appendChild(bubble);
        } else {
            row.appendChild(bubble);
            row.appendChild(avatarEl);
        }
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        if (window.lucide) lucide.createIcons();
    }

    // Show user message
    addRow('user', input);
    inputField.value = '';

    // Show typing indicator
    const typingRow = document.createElement('div');
    typingRow.className = 'ai-msg-row ai-msg-row--ai';
    typingRow.innerHTML = `
        <div class="ai-avatar"><i data-lucide="brain-circuit"></i></div>
        <div class="ai-typing-indicator">
            <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        </div>`;
    chatMessages.appendChild(typingRow);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        if (typingRow.parentNode) typingRow.remove();

        const text = input.toLowerCase();

        // ── Parse Age ────────────────────────────────────────────
        let age = null;
        const ageMatch = text.match(/(\d+)\s*(years?|yrs?|سال|year old|yr old)/i)
            || text.match(/age[:\s]+(\d+)/i)
            || text.match(/(\d+)\s*y\/o/i);
        if (ageMatch) age = parseInt(ageMatch[1]);

        // If no age info provided, ask for it
        if (age === null) {
            addRow('ai', `⚠️ To prescribe the correct medicine, I need the patient's <strong>age</strong> and any <strong>allergies</strong>.<br><br>Please re-enter in this format:<br><em>"Age: 7, Symptoms: fever, cough, sore throat"</em>`);
            return;
        }

        const isChild   = age < 12;
        const isTeen    = age >= 12 && age < 18;
        const isElderly = age >= 60;

        // ── Symptom Detection ─────────────────────────────────────
        const has = (keywords) => keywords.some(k => text.includes(k));

        let diagnosis = '';
        let medicines = '';
        let note = '';

        if (has(['fever', 'flu', 'cold', 'runny nose', 'nasal', 'sneezing', 'بخار', 'نزلہ', 'زکام'])) {
            diagnosis = 'Viral Upper Respiratory Infection (Flu/Cold)';
            if (isChild) {
                medicines = 'Paracetamol Syrup (120mg/5ml) — 5–10ml every 6 hrs<br>Saline nasal drops as needed<br>Triaminic Cold Syrup — per weight';
                note = '⚠️ Avoid Aspirin in children. Keep hydrated.';
            } else if (isElderly) {
                medicines = 'Paracetamol 500mg every 6 hrs (avoid NSAIDs)<br>Vitamin C 500mg daily<br>Arinac Forte — 1 tab twice daily';
                note = '⚠️ Avoid Ibuprofen in elderly with renal issues.';
            } else {
                medicines = 'Paracetamol 500mg every 6 hrs<br>Arinac Forte — 1 tab twice daily<br>Vitamin C 1000mg once daily';
            }
        } else if (has(['sore throat', 'tonsil', 'throat', 'گلا', 'گلے میں درد'])) {
            diagnosis = 'Bacterial Pharyngitis / Tonsillitis';
            if (isChild) {
                medicines = 'Amoxicillin Syrup (125mg/5ml) — 10ml every 8 hrs for 5 days<br>Paracetamol Syrup for fever<br>Diflucan gargle';
            } else {
                medicines = 'Amoxicillin 500mg — 1 cap every 8 hrs for 5 days<br>Paracetamol 500mg PRN<br>Strepsils lozenges as needed';
            }
        } else if (has(['cough', 'chest', 'phlegm', 'mucus', 'bronchitis', 'کھانسی'])) {
            diagnosis = 'Acute Bronchitis / Productive Cough';
            if (isChild) {
                medicines = 'Ambroxol Syrup (15mg/5ml) — 5ml twice daily<br>Salbutamol Syrup if wheeze present<br>Steam inhalation';
            } else {
                medicines = 'Ambroxol 30mg — 1 tab twice daily<br>Salbutamol inhaler if wheeze<br>Honey + ginger warm drink advised';
            }
        } else if (has(['stomach', 'vomit', 'diarrhea', 'loose motion', 'nausea', 'پیٹ', 'اسہال', 'قے'])) {
            diagnosis = 'Acute Gastroenteritis';
            if (isChild) {
                medicines = 'ORS sachets (Pedialyte) — after every loose stool<br>Zinc Sulfate Syrup — 10ml once daily for 10 days<br>Probiotics (Lactobacillus syrup)';
                note = '⚠️ Do NOT give Metronidazole to children under 3 years without stool culture.';
            } else {
                medicines = 'ORS sachets every 4 hrs<br>Metronidazole 400mg — 3x daily for 5 days<br>Domperidone 10mg — 30 min before meals';
            }
        } else if (has(['headache', 'migraine', 'سر درد', 'head pain'])) {
            diagnosis = 'Tension Headache / Migraine';
            if (isChild) {
                medicines = 'Paracetamol Syrup — as per weight<br>Rest in dark quiet room<br>Cool compress on forehead';
            } else if (isElderly) {
                medicines = 'Paracetamol 500mg (avoid NSAIDs)<br>Rest advised<br>Check BP before prescribing';
                note = '⚠️ Rule out hypertension as cause.';
            } else {
                medicines = 'Ibuprofen 400mg — with food<br>Paracetamol 500mg alternating if needed<br>Caffeine tablet (Cafergot) for migraine';
            }
        } else if (has(['allergy', 'rash', 'itch', 'hives', 'urticaria', 'الرجی', 'خارش'])) {
            diagnosis = 'Allergic Reaction / Urticaria';
            if (isChild) {
                medicines = 'Cetirizine Syrup (5mg/5ml) — 5ml once daily<br>Hydrocortisone Cream 1% (topical)<br>Cool bath for itching';
            } else {
                medicines = 'Cetirizine 10mg — once daily at night<br>Loratadine 10mg alternative<br>Hydrocortisone cream for local rash';
                if (isElderly) note = '⚠️ Avoid sedating antihistamines in elderly (fall risk).';
            }
        } else if (has(['diabetes', 'sugar', 'blood sugar', 'شوگر', 'ذیابیطس'])) {
            diagnosis = 'Type 2 Diabetes Management Review';
            medicines = 'Metformin 500mg — twice daily with meals<br>Monitor fasting glucose daily<br>HbA1c test every 3 months';
            note = '⚠️ Adjust dose based on kidney function. Avoid fasting without monitoring.';
        } else if (has(['bp', 'blood pressure', 'hypertension', 'بلڈ پریشر', 'ہائپر ٹینشن'])) {
            diagnosis = 'Hypertension';
            medicines = 'Amlodipine 5mg — once daily morning<br>Losartan 50mg — once daily<br>Low-sodium diet, reduce caffeine';
            note = '⚠️ Check renal function before ACE inhibitors in elderly.';
        } else {
            // Generic fallback
            diagnosis = 'General Medical Assessment Needed';
            medicines = isChild
                ? 'Paracetamol Syrup (per weight) for symptom relief<br>Consult further for specific treatment'
                : 'Paracetamol 500mg PRN<br>Further examination recommended for specific diagnosis';
        }

        // ── Build response ────────────────────────────────────────
        const ageLabel = isChild ? `Child (${age} yrs)` : isElderly ? `Elderly (${age} yrs)` : `Adult (${age} yrs)`;
        let html = `
            <div style="font-size:0.78rem;color:var(--primary);font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;">
                Patient: ${ageLabel}
            </div>
            <strong>Diagnosis:</strong> ${diagnosis}<br>
            <strong>Medicines:</strong><br>${medicines}`;
        if (note) html += `<br><br><span style="color:#b45309;font-size:0.82rem;">${note}</span>`;

        addRow('ai', html);
    }, 1200);
};



function typeText(element, text, callback) {
    let i = 0;
    element.textContent = "";
    const timer = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            const chatBox = document.getElementById('ai-chat-messages');
            if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
        } else {
            clearInterval(timer);
            if (callback) callback();
        }
    }, 25);
}

// ── Search & Filters ──────────────────────────────────────────
window.filterAppointments = () => {
    const query = document.getElementById('appointment-search').value.toLowerCase();
    const rows = document.querySelectorAll('#appointments-table-body tr');
    const cards = document.querySelectorAll('#appointments-card-grid .staff-card');

    rows.forEach(row => {
        const text = row.querySelector('.user-name-text')?.textContent.toLowerCase() || '';
        row.style.display = text.includes(query) ? '' : 'none';
    });

    cards.forEach(card => {
        const text = card.querySelector('.staff-name')?.textContent.toLowerCase() || '';
        card.style.display = text.includes(query) ? '' : 'none';
    });
};

window.filterHistory = () => {
    const query = document.getElementById('history-search').value.toLowerCase();
    const rows = document.querySelectorAll('#history-table-body tr');
    const cards = document.querySelectorAll('#history-card-grid .staff-card');

    rows.forEach(row => {
        const text = row.querySelector('.user-name-text')?.textContent.toLowerCase() || '';
        row.style.display = text.includes(query) ? '' : 'none';
    });

    cards.forEach(card => {
        const text = card.querySelector('.staff-name')?.textContent.toLowerCase() || '';
        card.style.display = text.includes(query) ? '' : 'none';
    });
};

window.filterHistory = () => {
    const query = document.getElementById('history-search')?.value.toLowerCase() || '';
    const filtered = historyDataCache.filter(p => 
        (p.name || '').toLowerCase().includes(query) || 
        (p.email || '').toLowerCase().includes(query)
    );
    renderHistoryTable(filtered);
};

// ── Medical History Timeline (Paginated) ──────────────────────
async function loadMedicalHistory() {
    const historyBody = document.getElementById('history-table-body');
    const paginationContainer = document.getElementById('history-pagination-container');
    if (!historyBody) return;

    const q = query(collection(db, 'users'), where('role', '==', 'patient'));
    onSnapshot(q, (snap) => {
        historyDataCache.length = 0;
        snap.forEach(d => historyDataCache.push({ id: d.id, ...d.data() }));
        
        if (historyDataCache.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="5" class="empty-state">No patients found.</td></tr>';
            if (paginationContainer)    paginationContainer.innerHTML = generatePaginationHTML(historyDataCache.length, HIST_PER_PAGE, currentHistPage, 'Hist');
            if (window.lucide) lucide.createIcons();
            return;
        }
        currentHistPage = 1;
        renderHistoryTable();
    }, (err) => {
        console.warn('Medical history listener error (may be offline):', err.code);
        if (historyBody) historyBody.innerHTML = '<tr><td colspan="5" class="empty-state">Unable to load patient records. Check connection.</td></tr>';
    });
}

function renderHistoryTable(filteredPatients = null) {
    const tableBody = document.getElementById('history-table-body');
    const cardGrid = document.getElementById('history-card-grid');
    const paginationContainer = document.getElementById('history-pagination-container');

    if (!tableBody || !cardGrid) return;

    const dataToRender = filteredPatients || historyDataCache;
    
    if (dataToRender.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="empty-state">No patient records found.</td></tr>`;
        cardGrid.innerHTML = `<p class="empty-state" style="padding:2rem; text-align:center;">No patients found.</p>`;
        return;
    }

    const totalPages = Math.ceil(dataToRender.length / HIST_PER_PAGE);
    const startIndex = (currentHistPage - 1) * HIST_PER_PAGE;
    const paginatedItems = dataToRender.slice(startIndex, startIndex + HIST_PER_PAGE);

    let tableHtml = '';
    let cardHtml = '';

    paginatedItems.forEach(p => {
        const joinedDate = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const { html: avatarHTML, style: avatarStyle, classes: avatarClasses } = getAvatarConfig(p);
        const patientStatus = p.status || 'active';
        const statusLabel = patientStatus.charAt(0).toUpperCase() + patientStatus.slice(1);

        tableHtml += `
            <tr class="admin-table-row">
                <td>
                    <div class="user-info-cell">
                        ${getAvatarHTML(p)}
                        <div class="user-details">
                            <span class="user-name-text">${p.name || '—'}</span>
                            <span class="user-email-subtext">${p.id ? `ID: ${p.id.substring(0, 8)}...` : '—'}</span>
                        </div>
                    </div>
                </td>
                <td class="table-cell-muted">${p.email || '—'}</td>
                <td class="table-cell-muted">${joinedDate}</td>
                <td>
                    <span class="status-indicator-pill ${patientStatus}">
                        <span class="status-dot-indicator"></span>
                        <span class="status-text-compact">${statusLabel}</span>
                    </span>
                </td>
                <td class="table-actions-cell">
                    <button class="btn-doctor-action" onclick="viewTimeline('${p.id}', '${p.name}')" title="View Records">
                        <i data-lucide="eye"></i>
                        <span>View Records</span>
                    </button>
                </td>
            </tr>
        `;

        cardHtml += `
            <div class="staff-card v-excellence">
                <div class="staff-card-header">
                    <div class="staff-header-info">
                        <div class="avatar-circle ${avatarClasses}" style="${avatarStyle}">${avatarHTML}</div>
                        <div class="staff-title-box">
                            <span class="staff-name">${p.name || '—'}</span>
                            <span class="staff-role-tag">Patient</span>
                        </div>
                    </div>
                    <span class="status-indicator-pill ${patientStatus}"><span class="status-dot-indicator"></span>${statusLabel}</span>
                </div>
                <div class="staff-card-body">
                    <div class="staff-detail-row">
                        <i data-lucide="mail"></i>
                        <span>${p.email || '—'}</span>
                    </div>
                    <div class="staff-detail-row">
                        <i data-lucide="calendar"></i>
                        <span>Since: ${joinedDate}</span>
                    </div>
                </div>
                <div class="staff-card-footer">
                    <button class="btn btn-primary btn-full" onclick="viewTimeline('${p.id}', '${p.name}')">
                        <i data-lucide="eye"></i> Full Records
                    </button>
                </div>
            </div>
        `;
    });

    tableBody.innerHTML = tableHtml;
    cardGrid.innerHTML = cardHtml;

    if (paginationContainer) {
        if (totalPages > 1) {
            renderPagination(paginationContainer, currentHistPage, totalPages, (newPage) => {
                currentHistPage = newPage;
                renderHistoryTable(filteredPatients);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        } else {
            paginationContainer.innerHTML = '';
        }
    }

    if (window.lucide) lucide.createIcons();
}



window.viewTimeline = async (patientId, patientName) => {
    try {
        const q = query(collection(db, 'appointments'),
            where('patientId', '==', patientId),
            where('status', '==', 'completed')
        );
        
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return showToast(`No past medical history found for ${patientName}.`, 'info');

        const history = [];
        querySnapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));

        // Sort by date descending (newest first)
        history.sort((a,b) => {
            const da = a.completedAt?.toDate?.() || new Date(a.date);
            const db_ = b.completedAt?.toDate?.() || new Date(b.date);
            return db_ - da;
        });

        currentPatientHistory = history;
        currentFilteredHistory = history;
        currentPatientName = patientName;
        currentModalPage = 1;

        const modal = document.getElementById('medical-history-modal');
        const nameEl = document.getElementById('history-modal-patient-name');

        // Reset filters in UI
        document.getElementById('history-filter-start').value = '';
        document.getElementById('history-filter-end').value = '';

        if (nameEl) nameEl.textContent = `${patientName}'s Medical History`;
        renderModalHistoryPage();

        if (window.lucide) lucide.createIcons();
        modal.classList.add('active');

    } catch (e) {
        console.error("Timeline Error:", e);
        showToast('Failed to load medical history.', 'error');
    }
};

function renderModalHistoryPage() {
    const contentEl = document.getElementById('medical-timeline-content');
    const paginationEl = document.getElementById('modal-history-pagination');
    
    const totalPages = Math.ceil(currentFilteredHistory.length / MODAL_HIST_PER_PAGE);
    if (currentModalPage > totalPages && totalPages > 0) currentModalPage = totalPages;

    const start = (currentModalPage - 1) * MODAL_HIST_PER_PAGE;
    const paginatedItems = currentFilteredHistory.slice(start, start + MODAL_HIST_PER_PAGE);

    if (contentEl) {
        contentEl.innerHTML = paginatedItems.length > 0 
            ? renderMedicalTimeline(paginatedItems)
            : `<div class="empty-state">No medical records found.</div>`;
    }

    if (paginationEl) {
        if (totalPages > 1) {
            renderPagination(paginationEl, currentModalPage, totalPages, (newPage) => {
                currentModalPage = newPage;
                renderModalHistoryPage();
                document.getElementById('timeline-scroll-area').scrollTo({ top: 0, behavior: 'smooth' });
            });
        } else {
            paginationEl.innerHTML = '';
        }
    }
    
    if (window.lucide) lucide.createIcons();
}

function renderMedicalTimeline(history) {
    return history.map(item => {
        let dateStr = 'Unknown Date';
        if (item.completedAt && typeof item.completedAt.toDate === 'function') {
            dateStr = item.completedAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
        } else if (item.date) {
            dateStr = new Date(item.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        const meds = Array.isArray(item.medicines) ? item.medicines : [];

        return `
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-header-flex">
                    <span class="timeline-date">
                        <i data-lucide="calendar"></i> ${dateStr}
                    </span>
                    <span class="visit-type-tag">Routine Visit</span>
                </div>
                
                <div class="timeline-card">
                    <div class="timeline-row">
                        <div class="timeline-col">
                            <h5 class="timeline-section-label">
                                <i data-lucide="clipboard-list"></i> Symptoms & Findings
                            </h5>
                            <div class="timeline-findings">
                                ${item.findings || item.symptoms || 'No specific findings recorded for this visit.'}
                            </div>
                        </div>
                        
                        <div class="timeline-col">
                            <h5 class="timeline-section-label">
                                <i data-lucide="activity"></i> Final Diagnosis
                            </h5>
                            <div class="diagnosis-display-box">
                                ${item.diagnosis || 'General Health Checkup'}
                            </div>
                        </div>
                    </div>

                    <div class="timeline-prescription-section">
                        <h5 class="timeline-section-label">
                            <i data-lucide="pill"></i> Prescribed Medications
                        </h5>
                        <div class="med-pills-container">
                            ${meds.length > 0 
                                ? meds.map(m => `<span class="med-pill">${m}</span>`).join('') 
                                : '<span class="text-muted" style="font-size:0.85rem; font-style:italic; padding-left:4px;">No medications prescribed.</span>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.applyHistoryFilter = () => {
    const start = document.getElementById('history-filter-start').value;
    const end = document.getElementById('history-filter-end').value;

    if (!start && !end) return showToast("Please select a date range", "info");

    const filtered = currentPatientHistory.filter(item => {
        const itemDate = item.completedAt?.toDate?.() || new Date(item.date);
        itemDate.setHours(0,0,0,0);
        
        if (start) {
            const startDate = new Date(start);
            startDate.setHours(0,0,0,0);
            if (itemDate < startDate) return false;
        }
        if (end) {
            const endDate = new Date(end);
            endDate.setHours(23,59,59,999);
            if (itemDate > endDate) return false;
        }
        return true;
    });

    currentFilteredHistory = filtered;
    currentModalPage = 1;
    renderModalHistoryPage();
};

window.resetHistoryFilter = () => {
    document.getElementById('history-filter-start').value = '';
    document.getElementById('history-filter-end').value = '';
    
    currentFilteredHistory = currentPatientHistory;
    currentModalPage = 1;
    renderModalHistoryPage();
};

// ── PDF Prescription Generator ──────────────────────────────────
async function generatePrescriptionPDF(data) {
    if (!window.jspdf) {
        showToast('PDF library not loaded. Please refresh and try again.', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const margin = 20;
    const contentW = pageW - margin * 2;

    // ── Header Background ──
    pdf.setFillColor(37, 99, 235); // #2563EB
    pdf.rect(0, 0, pageW, 38, 'F');

    // ── Brand Name ──
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('CareSync AI', margin, 16);

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(180, 210, 255);
    pdf.text('Smart Healthcare Management System', margin, 23);

    // ── Prescription Title (right-aligned) ──
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('DIGITAL PRESCRIPTION', pageW - margin, 16, { align: 'right' });

    const today = new Date();
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(180, 210, 255);
    pdf.text(`Date: ${today.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageW - margin, 23, { align: 'right' });

    // ── Doctor Info Section ──
    let y = 50;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(`Dr. ${data.doctorName || 'Attending Physician'}`, margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text(data.specialization || 'General Physician', margin, y + 6);

    // ── Divider ──
    y += 16;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageW - margin, y);
    y += 8;

    // ── Patient Info Box ──
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(margin, y, contentW, 24, 3, 3, 'FD');

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 116, 139);
    pdf.text('PATIENT', margin + 6, y + 6);
    pdf.text('AGE', margin + 80, y + 6);
    pdf.text('GENDER', margin + 110, y + 6);

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(data.patientName || 'Patient', margin + 6, y + 14);
    pdf.text(data.patientAge ? `${data.patientAge} yrs` : '—', margin + 80, y + 14);
    pdf.text(data.patientGender || '—', margin + 110, y + 14);

    y += 32;

    // ── Diagnosis Section ──
    pdf.setFillColor(239, 246, 255);
    pdf.setDrawColor(147, 197, 253);
    pdf.roundedRect(margin, y, contentW, 20, 3, 3, 'FD');

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(37, 99, 235);
    pdf.text('DIAGNOSIS', margin + 6, y + 6);

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    const dxLines = pdf.splitTextToSize(data.diagnosis || 'General Medical Assessment', contentW - 12);
    pdf.text(dxLines, margin + 6, y + 14);
    y += 28;

    // ── Findings ──
    if (data.findings && data.findings.trim()) {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(71, 85, 105);
        pdf.text('CLINICAL FINDINGS', margin, y);
        y += 6;

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(51, 65, 85);
        const findingLines = pdf.splitTextToSize(data.findings, contentW);
        pdf.text(findingLines, margin, y);
        y += findingLines.length * 5 + 8;
    }

    // ── Medicines ──
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(71, 85, 105);
    pdf.text('PRESCRIBED MEDICATIONS', margin, y);
    y += 6;

    const meds = Array.isArray(data.medicines) ? data.medicines : (data.medicines || '').split(',').map(m => m.trim()).filter(Boolean);

    if (meds.length === 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(148, 163, 184);
        pdf.text('No medications prescribed.', margin, y);
        y += 8;
    } else {
        meds.forEach((med, i) => {
            pdf.setFillColor(i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 250 : 255);
            pdf.rect(margin, y - 4, contentW, 9, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(37, 99, 235);
            pdf.text(`${i + 1}.`, margin + 2, y + 1);

            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(15, 23, 42);
            const medLine = pdf.splitTextToSize(med, contentW - 14);
            pdf.text(medLine, margin + 10, y + 1);
            y += medLine.length * 5 + 4;
        });
    }

    y += 6;

    // ── Separator ──
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, y, pageW - margin, y);
    y += 8;

    // ── Instructions ──
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(71, 85, 105);
    pdf.text('GENERAL INSTRUCTIONS', margin, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    const instructions = [
        '• Take medications as prescribed by your doctor.',
        '• Do not skip doses. Complete the full course of antibiotics.',
        '• If symptoms worsen or new symptoms appear, consult immediately.',
        '• Store medicines away from heat and direct sunlight.'
    ];
    instructions.forEach(line => {
        pdf.text(line, margin, y);
        y += 5;
    });

    // ── Footer ──
    y = pageH - 20;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, y - 4, pageW - margin, y - 4);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    pdf.text('Generated by CareSync AI Healthcare Management System', margin, y);
    pdf.text(`Ref: CSX-${Date.now().toString().slice(-8)}`, pageW - margin, y, { align: 'right' });

    pdf.save(`CareSync_Prescription_${(data.patientName || 'Patient').replace(/\s/g, '_')}_${today.toISOString().split('T')[0]}.pdf`);
}

window.clearDiagnosisForm = () => {
    document.getElementById('symptoms-input').value = '';
    const container = document.getElementById('ai-response-container');
    if (container) container.classList.add('hidden');
};

// Start history listener
loadMedicalHistory();

// rapidAiAssist moved above to line 416

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
        window.openModal('id-card-modal');

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
        if (!renderArea) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

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
                    <div class="id-card-container" style="transform: scale(1.1); flex-shrink: 0;">
                        <div class="id-front-header">
                            <h2 class="id-logo-text">CARESYNC</h2>
                            <span class="id-slogan-text">AI Healthcare Management</span>
                        </div>

                        <div class="id-profile-section">
                            <div class="id-photo-frame ${avatarClasses}" style="${avatarStyle}; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                                ${avatarHTML}
                            </div>
                            <div class="id-user-info">
                                <h3 class="id-name-text">${data.name || 'User'}</h3>
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
                    <div class="id-card-back-container" style="transform: scale(1.1); flex-shrink: 0;">
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

        // Wait for rendering
        await new Promise(resolve => setTimeout(resolve, 800));

        // PDF Options - Optimized for Multi-page
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
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
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
