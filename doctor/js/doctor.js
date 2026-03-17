import { renderPagination } from '../../js/pagination.js';
import { 
    showToast, 
    applyAvatarStyle, 
    getAvatarPalette,
    getAvatarConfig,
    AVATAR_PALETTES,
    SKELETON_DELAY
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
let currentFilteredHistory = [];
let currentPatientName = "";

// ── Skeleton Loaders ──────────────────────────────────────────
function renderMetricSkeletons() {
    const statsContainer = document.querySelector('.page-content');
    if (!statsContainer) return;
    
    // Specifically target the stats boxes if they exist
    const stats_boxes = [
        document.getElementById('stats-today'),
        document.getElementById('stats-monthly')
    ];

    stats_boxes.forEach(box => {
        if (box) {
            box.innerHTML = `<div class="skeleton-text skeleton" style="width:40px;height:32px;margin:0 auto;"></div>`;
        }
    });
}

function renderTableSkeletons(type) {
    const tbody = document.getElementById(`${type}-table-body`);
    const cardGrid = document.getElementById(`${type}-card-grid`);
    
    if (tbody) {
        tbody.innerHTML = `
            <tr class="skeleton-row">
                <td><div class="user-info-cell"><div class="skeleton skeleton-avatar"></div><div class="skeleton-text skeleton" style="width:120px;"></div></div></td>
                <td><div class="skeleton-text skeleton" style="width:150px;"></div></td>
                <td><div class="skeleton-text skeleton" style="width:100px;"></div></td>
                <td class="table-actions-cell"><div class="skeleton-btn skeleton"></div></td>
            </tr>
        `.repeat(4);
    }
    
    if (cardGrid) {
        cardGrid.innerHTML = `
            <div class="compact-staff-card skeleton-card">
                <div class="card-header-row" style="display:flex; gap:1rem; align-items:center; margin-bottom:1rem;">
                    <div class="skeleton skeleton-avatar" style="width:52px;height:52px;"></div>
                    <div style="flex:1;"><div class="skeleton-text skeleton" style="width:70%;"></div></div>
                </div>
                <div class="card-body-section" style="margin-bottom:1rem;">
                    <div class="skeleton-text skeleton" style="width:90%;"></div>
                </div>
                <div class="card-actions-vertical">
                    <div class="skeleton skeleton-btn" style="width:100%;height:38px;"></div>
                </div>
            </div>
        `.repeat(3);
    }
}

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
                    renderTableSkeletons('appointments');
                    setTimeout(() => renderApptPage(), SKELETON_DELAY);
                } else if (targetId === 'patients-history-section') {
                    renderTableSkeletons('history');
                    setTimeout(() => renderHistoryTable(), SKELETON_DELAY);
                } else {
                    const contentArea = section.querySelector('.table-container') || section.querySelector('.profile-container') || section;
                    if (!contentArea.dataset.loader) {
                        contentArea.dataset.loader = 'true';
                        
                        const loader = document.createElement('div');
                        loader.className = 'section-loader-overlay';
                        loader.innerHTML = `
                            <div class="loader-content">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2 spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                            </div>
                        `;
                        contentArea.appendChild(loader);

                        setTimeout(() => {
                            loader.remove();
                            delete contentArea.dataset.loader;
                        }, SKELETON_DELAY);
                    }
                }
            }
        });

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

// ── Load Appointments (Real-time & Paginated) ─────────────────

function loadAppointments(doctorId) {
    const tableBody = document.getElementById('appointments-table-body');
    const cardGrid = document.getElementById('appointments-card-grid');
    const paginationContainer = document.getElementById('appointments-pagination-container');

    renderTableSkeletons('appointments');
    renderMetricSkeletons();

    const q = query(collection(db, 'appointments'), where('doctorId', '==', doctorId));

    onSnapshot(q, (snap) => {
        allAppointments = [];
        snap.forEach(d => allAppointments.push({ id: d.id, ...d.data() }));

        // Perception Delay
        setTimeout(() => {
            if (allAppointments.length === 0) {
                if (tableBody) tableBody.innerHTML = `<tr><td colspan="4" class="empty-state">No appointments found.</td></tr>`;
                if (cardGrid) cardGrid.innerHTML = '<p class="empty-state">No appointments found.</p>';
                if (paginationContainer) paginationContainer.innerHTML = '';
                return;
            }

            allAppointments.sort((a, b) => {
                if (a.status === 'completed' && b.status !== 'completed') return 1;
                if (a.status !== 'completed' && b.status === 'completed') return -1;
                const da = a.date || '';
                const db_ = b.date || '';
                if (da !== db_) return da > db_ ? 1 : -1;
                return (a.time || '') > (b.time || '') ? 1 : -1;
            });

            currentApptPage = 1;
            renderApptPage();
        }, SKELETON_DELAY);
    });
}

function renderApptPage() {
    const tableBody = document.getElementById('appointments-table-body');
    const cardGrid = document.getElementById('appointments-card-grid');
    const paginationContainer = document.getElementById('appointments-pagination-container');

    const totalPages = Math.ceil(allAppointments.length / APPT_PER_PAGE);
    if (currentApptPage > totalPages && totalPages > 0) currentApptPage = totalPages;

    const startIndex = (currentApptPage - 1) * APPT_PER_PAGE;
    const paginatedItems = allAppointments.slice(startIndex, startIndex + APPT_PER_PAGE);

    let tableHtml = '';
    let cardHtml = '';

    paginatedItems.forEach(data => {
        const pName = data.patientName || 'Patient';
        const { html: pAvatarContent, style: pAvatarStyle, classes: pAvatarClasses } = getAvatarConfig({
            uid: data.patientId,
            name: pName,
            photoURL: data.patientPhotoURL
        });

        tableHtml += `
            <tr class="admin-table-row">
                <td>
                    <div class="user-info-cell">
                         <div class="user-avatar-sm ${pAvatarClasses}" style="${pAvatarStyle}">${pAvatarContent}</div>
                         <div class="user-details">
                            <span class="user-name-text">${pName}</span>
                            <span class="table-cell-muted">${data.patientGender}, ${data.patientAge}y</span>
                         </div>
                    </div>
                </td>
                <td class="table-cell-muted">${data.date ? new Date(data.date+'T00:00:00').toLocaleDateString('en-PK',{day:'2-digit',month:'short'}) : '—'} · ${data.time || '—'}</td>
                <td><span class="status-indicator-pill ${data.status}">${data.status}</span></td>
                <td class="table-actions-cell">
                    <button class="btn-action-sm btn-attend" onclick="openDiagnosis('${data.id}', '${pName}')" title="Attend Patient">
                        <i data-lucide="stethoscope"></i>
                        <span>Attend</span>
                    </button>
                </td>
            </tr>
        `;

        cardHtml += `
            <div class="compact-staff-card">
                <div class="card-header-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                    <div style="display:flex; gap:12px; align-items:center;">
                        <div class="user-avatar-sm ${pAvatarClasses}" style="${pAvatarStyle}">${pAvatarContent}</div>
                        <div>
                            <h4 class="card-user-name">${pName}</h4>
                            <p class="card-user-email">${data.patientGender}, ${data.patientAge}y</p>
                        </div>
                    </div>
                </div>
                <div class="card-body-section" style="margin-bottom:0.75rem; padding: 0.5rem 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
                    <p class="table-cell-muted" style="font-size:0.85rem; display:flex; align-items:center; gap:6px;">
                        <i data-lucide="calendar" style="width:14px;height:14px; color: var(--primary);"></i>
                        ${data.date ? new Date(data.date+'T00:00:00').toLocaleDateString('en-PK',{day:'2-digit',month:'short'}) : '—'} · ${data.time || '—'}
                    </p>
                    <div style="margin-top:0.5rem;">
                        <span class="status-indicator-pill ${data.status}" style="font-size:0.7rem; padding:2px 8px;">${data.status}</span>
                    </div>
                </div>
                <div class="card-actions-vertical">
                    <button class="spc-btn primary" onclick="openDiagnosis('${data.id}', '${pName}')">
                        <i data-lucide="stethoscope"></i> Attend Patient
                    </button>
                </div>
            </div>
        `;
    });

    if (tableBody) tableBody.innerHTML = tableHtml;
    if (cardGrid) cardGrid.innerHTML = cardHtml;
    
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
    
    showToast('AI is analyzing symptoms...', 'info');
    
    setTimeout(() => {
        const diagnostics = [
            { d: "Common Flu", m: "Panadol, Arinac, Vita-C" },
            { d: "Bacterial Infection", m: "Amoxicillin, Panadol" },
            { d: "Allergic Rhinitis", m: "Softin, Nasal Spray" },
            { d: "Viral Fever", m: "Paracetamol, Hydration" }
        ];
        const pick = diagnostics[Math.floor(Math.random() * diagnostics.length)];
        
        document.getElementById('diagnosis-input').value = pick.d;
        document.getElementById('medicines-input').value = pick.m;
        
        showToast('AI Suggestion applied!', 'success');
    }, 1500);
};

window.openDiagnosis = (apptId, patientName) => {
    document.getElementById('active-appt-id').value = apptId;
    document.getElementById('diagnosis-modal').classList.add('active');
    // Clear previous
    document.getElementById('diagnosis-form').reset();
};

window.closeModal = (id) => {
    document.getElementById(id).classList.remove('active');
};

// ── Stats Logic ───────────────────────────────────────────────
function loadPersonalStats(doctorId) {
    const todayCount = document.getElementById('stats-today');
    const monthlyCount = document.getElementById('stats-monthly');

    const q = query(collection(db, 'appointments'), where('doctorId', '==', doctorId));
    onSnapshot(q, (snap) => {
        setTimeout(() => {
            const today = new Date().toISOString().split('T')[0];
            let todayCountVal = 0;
            let completed = 0;

            snap.forEach(d => {
                const data = d.data();
                if (data.status === 'completed') completed++;
                if (data.date === today && data.status === 'pending') todayCountVal++;
            });

            if (todayCount) todayCount.textContent = todayCountVal;
            if (monthlyCount) monthlyCount.textContent = completed;
        }, SKELETON_DELAY);
    });
}

// ── Save Diagnosis & Prescription ───────────────────────────
window.saveDiagnosis = async () => {
    const apptId = document.getElementById('active-appt-id').value;
    const diagnosis = document.getElementById('diagnosis-input').value.trim();
    const medicines = document.getElementById('medicines-input').value.split(',').map(m => m.trim());
    const findings = document.getElementById('finding-text').value.trim();

    if (!diagnosis) return showToast('Please enter a diagnosis.', 'warning');

    try {
        const docRef = doc(db, 'appointments', apptId);
        await updateDoc(docRef, {
            status: 'completed',
            diagnosis,
            medicines,
            findings,
            completedAt: serverTimestamp()
        });

        // Also add to a general 'diagnosisLogs' for Admin analytics
        await setDoc(doc(collection(db, 'diagnosisLogs')), {
            appointmentId: apptId,
            symptoms: diagnosis, // Using diagnosis as the primary 'disease' for admin charts
            doctorId: auth.currentUser.uid,
            createdAt: serverTimestamp()
        });

        showToast('Appointment completed and prescription saved!', 'success');
        generatePrescriptionPDF({
            patientName: document.querySelector('#appointments-table-body .user-name-text')?.textContent || 'Patient',
            diagnosis,
            medicines,
            findings
        });
        closeModal('diagnosis-modal');
    } catch (e) {
        console.error(e);
        showToast('Failed to save diagnosis.', 'error');
    }
};

// ── AI Consultant (Gemini Chat Effect) ──────────────────────
window.analyzeSymptoms = async () => {
    const inputField = document.getElementById('symptoms-input');
    const input = inputField.value.trim();
    if (!input) return showToast('Please enter symptoms first.', 'warning');

    const chatMessages = document.getElementById('ai-chat-messages');

    // 1. Add User Bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble bubble-user';
    userBubble.textContent = input;
    chatMessages.appendChild(userBubble);
    inputField.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 2. Add Typing Indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'ai-typing-indicator';
    typingIndicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        // Simulated AI Logic with Typing Effect
        setTimeout(() => {
            if (typingIndicator.parentNode) chatMessages.removeChild(typingIndicator);

            const aiBubble = document.createElement('div');
            aiBubble.className = 'chat-bubble bubble-ai';
            chatMessages.appendChild(aiBubble);

            const responses = [
                `Based on your input of '${input}', I suspect a possible Viral Respiratory Infection. Recommendation: Monitor SPO2, rest, and symptomatic treatment.`,
                `Symptoms of '${input}' align with Seasonal Allergies. Advise antihistamines and monitoring for 48 hours.`,
                `The report '${input}' indicates localized inflammation. Clinical correlation recommended along with standard analgesic protocols.`
            ];
            const response = responses[Math.floor(Math.random() * responses.length)];

            typeText(aiBubble, response, () => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
                if (window.lucide) lucide.createIcons();
            });
        }, 1200);
    } catch (e) {
        if (typingIndicator.parentNode) typingIndicator.remove();
        showToast('AI Service offline.', 'error');
    }
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
    const cards = document.querySelectorAll('#appointments-card-grid .compact-staff-card');

    rows.forEach(row => {
        const text = row.querySelector('.user-name-text')?.textContent.toLowerCase() || '';
        row.style.display = text.includes(query) ? '' : 'none';
    });

    cards.forEach(card => {
        const text = card.querySelector('.card-user-name')?.textContent.toLowerCase() || '';
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

    renderTableSkeletons('history');

    const q = query(collection(db, 'users'), where('role', '==', 'patient'));
    onSnapshot(q, (snap) => {
        historyDataCache.length = 0;
        snap.forEach(d => historyDataCache.push({ id: d.id, ...d.data() }));
        
        setTimeout(() => {
            if (historyDataCache.length === 0) {
                historyBody.innerHTML = '<tr><td colspan="4" class="empty-state">No patients found.</td></tr>';
                if (paginationContainer) paginationContainer.innerHTML = '';
                return;
            }
            currentHistPage = 1;
            renderHistoryTable();
        }, SKELETON_DELAY);
    });
}

function renderHistoryTable(filteredPatients = null) {
    const historyBody = document.getElementById('history-table-body');
    const cardGrid = document.getElementById('history-card-grid');
    const paginationContainer = document.getElementById('history-pagination-container');

    const dataToRender = filteredPatients || historyDataCache;
    const totalPages = Math.ceil(dataToRender.length / HIST_PER_PAGE);
    
    if (currentHistPage > totalPages && totalPages > 0) currentHistPage = totalPages;

    const startIndex = (currentHistPage - 1) * HIST_PER_PAGE;
    const paginatedItems = dataToRender.slice(startIndex, startIndex + HIST_PER_PAGE);

    let tableHtml = '';
    let cardHtml = '';
    
    paginatedItems.forEach(p => {
        const joined = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PK', {day:'2-digit', month:'short', year:'numeric'}) : '—';
        const { html: pAvatarContent, style: pAvatarStyle, classes: pAvatarClasses } = getAvatarConfig(p);
        const pGender = p.gender || '—';
        const pAge = p.age || '—';

        tableHtml += `
            <tr class="admin-table-row">
                <td>
                    <div class="user-info-cell">
                         <div class="user-avatar-sm ${pAvatarClasses}" style="${pAvatarStyle}">${pAvatarContent}</div>
                         <div class="user-details">
                            <span class="user-name-text">${p.name}</span>
                            <span class="table-cell-muted">${pGender}, ${pAge}y</span>
                        </div>
                    </div>
                </td>
                <td class="table-cell-muted">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i data-lucide="clock" style="width:14px; color: var(--text-muted);"></i>
                        ${joined}
                    </div>
                </td>
                <td>
                    <span class="status-indicator-pill active">Verified</span>
                </td>
                <td class="table-actions-cell">
                    <button class="btn-action-sm btn-view" onclick="viewTimeline('${p.id}', '${p.name}')" title="View Records">
                        <i data-lucide="eye"></i>
                        <span>View</span>
                    </button>
                </td>
            </tr>
        `;

        cardHtml += `
            <div class="compact-staff-card">
                <div class="card-header-row" style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1rem;">
                    <div style="display:flex; gap:12px; align-items:center;">
                        <div class="user-avatar-sm ${pAvatarClasses}" style="${pAvatarStyle}">${pAvatarContent}</div>
                        <div>
                            <h4 class="card-user-name" style="margin:0;">${p.name}</h4>
                            <p class="card-user-email" style="margin:0;">Patient ID: #${p.id.slice(0,6)}</p>
                        </div>
                    </div>
                    <span class="status-indicator-pill active" style="font-size:0.65rem;">Verified</span>
                </div>
                <div class="card-body-section" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:1.25rem; padding: 1rem 0; border-top: 1px dashed var(--border); border-bottom: 1px dashed var(--border);">
                    <div class="info-item">
                        <span style="display:block; font-size:0.7rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; margin-bottom:4px;">Joined</span>
                        <span style="font-size:0.85rem; font-weight:600; color:#1e293b;">${joined}</span>
                    </div>
                    <div class="info-item">
                        <span style="display:block; font-size:0.7rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; margin-bottom:4px;">Details</span>
                        <span style="font-size:0.85rem; font-weight:600; color:#1e293b;">${pGender}, ${pAge}y</span>
                    </div>
                </div>
                <div class="card-actions-vertical">
                    <button class="spc-btn primary" onclick="viewTimeline('${p.id}', '${p.name}')" style="height:44px;">
                        <i data-lucide="eye" style="width:16px;"></i> View Records
                    </button>
                </div>
            </div>
        `;
    });
    
    if (historyBody) historyBody.innerHTML = tableHtml || '<tr><td colspan="4" class="empty-state">No patients found.</td></tr>';
    if (cardGrid) cardGrid.innerHTML = cardHtml || '<p class="empty-state">No patients found.</p>';
    
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
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229); // Indigo #4f46e5
    doc.text("CareSync AI Clinic", 20, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Digital Prescription - Smart Healthcare", 20, 28);
    doc.line(20, 32, 190, 32);

    // Patient Info
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Patient: ${data.patientName}`, 20, 45);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 150, 45);

    // Diagnosis
    doc.setFontSize(14);
    doc.text("Diagnosis:", 20, 60);
    doc.setFontSize(12);
    doc.text(data.diagnosis || "N/A", 25, 68);

    // Medicines
    doc.setFontSize(14);
    doc.text("Prescribed Medicines:", 20, 85);
    doc.setFontSize(12);
    let y = 93;
    data.medicines.forEach((med, i) => {
        doc.text(`${i + 1}. ${med}`, 25, y);
        y += 8;
    });

    // Instructions
    doc.setFontSize(14);
    doc.text("Instructions:", 20, y + 10);
    doc.setFontSize(12);
    doc.text(data.findings || "Take as prescribed by doctor.", 25, y + 18);

    // Footer
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text("Generated by CareSync AI Diagnostic Tool", 20, 280);

    doc.save(`Prescription_${data.patientName.replace(/\s/g, '_')}.pdf`);
}

window.clearDiagnosisForm = () => {
    document.getElementById('symptoms-input').value = '';
    const container = document.getElementById('ai-response-container');
    if (container) container.classList.add('hidden');
};

// Start history listener
loadMedicalHistory();

window.rapidAiAssist = () => {
    const findings = document.getElementById('finding-text').value;
    if (!findings) return showToast('Please enter physical findings first.', 'warning');

    document.getElementById('diagnosis-input').value = "AI Suggestion: Viral Fever"; // Simulated rapid assist
};

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

        setTimeout(() => {
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
