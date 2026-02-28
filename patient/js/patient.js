import { auth, db } from '../../js/firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, getDoc, collection, query, where, onSnapshot,
    addDoc, deleteDoc, serverTimestamp, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
        alert('Access Denied: Patients only.');
        return (window.location.href = '../index.html');
    }

    userData = snap.data();
    if (displayName) displayName.textContent = userData.name || 'Patient';
    if (userAvatar) userAvatar.textContent = (userData.name || 'P')[0].toUpperCase();

    // Set AI greeting
    const greeting = document.querySelector('.patient-name-placeholder');
    if (greeting) greeting.textContent = userData.name.split(' ')[0];

    // Start listeners
    loadMyHistory(user.uid);
    loadMyAppointments(user.uid);
    populateDoctors();

    if (window.lucide) lucide.createIcons();
});

// ── Navigation Logic ──────────────────────────────────────────
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        const targetId = item.getAttribute('data-target');

        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        sections.forEach(section => {
            section.classList.remove('active');
            if (section.id === targetId) section.classList.add('active');
        });

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

// ── Load Medical History ──────────────────────────────────────
function loadMyHistory(uid) {
    const tableBody = document.getElementById('history-table-body');
    const cardGrid = document.getElementById('history-card-grid');
    const statsTotalVisits = document.getElementById('stats-total-visits');

    const q = query(
        collection(db, 'appointments'),
        where('patientId', '==', uid),
        where('status', '==', 'completed'),
        orderBy('createdAt', 'desc')
    );

    onSnapshot(q, (snap) => {
        medicalRecords = [];
        let tableHtml = '';
        let cardHtml = '';

        snap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            medicalRecords.push(data);
            const date = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString() : '—';

            tableHtml += `
                <tr class="admin-table-row">
                    <td class="table-cell-muted">${date}</td>
                    <td><div class="user-info-cell"><span class="user-name-text">Dr. ${data.doctorName}</span></div></td>
                    <td><span class="status-indicator-pill active">${data.diagnosis || 'Completed'}</span></td>
                    <td class="table-actions-cell">
                        <button class="btn-action-sm" onclick="explainDiagnosis('${d.id}')" title="Ask AI about this">
                            <i data-lucide="sparkles"></i>
                        </button>
                    </td>
                </tr>
            `;

            cardHtml += `
                <div class="staff-card">
                    <div class="staff-card-header">
                        <div class="user-avatar-sm" style="background:#EFF6FF;color:#2563EB">Dr</div>
                        <div>
                            <div class="user-name-text">Dr. ${data.doctorName}</div>
                            <div class="text-muted" style="font-size:0.75rem">${date}</div>
                        </div>
                    </div>
                    <div class="staff-card-body">
                        <span class="status-indicator-pill active">${data.diagnosis || 'Completed'}</span>
                    </div>
                    <div class="staff-card-actions">
                        <button class="btn-action-sm" onclick="explainDiagnosis('${d.id}')">
                            <i data-lucide="sparkles"></i> Ask AI
                        </button>
                    </div>
                </div>
            `;
        });

        if (tableBody) tableBody.innerHTML = tableHtml || '<tr><td colspan="4" class="empty-state">No medical history found.</td></tr>';
        if (cardGrid) cardGrid.innerHTML = cardHtml || '<p class="empty-state">No medical history found.</p>';
        if (statsTotalVisits) statsTotalVisits.textContent = snap.size;
        if (window.lucide) lucide.createIcons();
    });
}

// ── Load Upcoming Appointments ────────────────────────────────
function loadMyAppointments(uid) {
    const tableBody = document.getElementById('appts-table-body');
    const cardGrid = document.getElementById('appts-card-grid');
    const statsNextAppt = document.getElementById('stats-next-appt');

    const q = query(
        collection(db, 'appointments'),
        where('patientId', '==', uid),
        where('status', '==', 'pending'),
        orderBy('time', 'asc')
    );

    onSnapshot(q, (snap) => {
        let tableHtml = '';
        let cardHtml = '';
        let nextAppt = null;

        snap.forEach(d => {
            const data = d.data();
            if (!nextAppt) nextAppt = data;

            tableHtml += `
                <tr class="admin-table-row">
                    <td class="user-name-text">Dr. ${data.doctorName}</td>
                    <td class="table-cell-muted">${data.time}</td>
                    <td><span class="status-indicator-pill pending">Upcoming</span></td>
                    <td class="table-actions-cell">
                        <button class="btn-action-sm" onclick="cancelAppointment('${d.id}')" title="Cancel Appointment">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </td>
                </tr>
            `;

            cardHtml += `
                <div class="staff-card">
                    <div class="staff-card-header">
                        <div class="user-avatar-sm" style="background:#EFF6FF;color:#2563EB">Dr</div>
                        <div>
                            <div class="user-name-text">Dr. ${data.doctorName}</div>
                            <div class="text-muted" style="font-size:0.75rem">${data.time}</div>
                        </div>
                    </div>
                    <div class="staff-card-body">
                        <span class="status-indicator-pill pending">Upcoming</span>
                    </div>
                    <div class="staff-card-actions">
                        <button class="btn-action-sm danger" onclick="cancelAppointment('${d.id}')">
                            <i data-lucide="trash-2"></i> Cancel
                        </button>
                    </div>
                </div>
            `;
        });

        if (tableBody) tableBody.innerHTML = tableHtml || '<tr><td colspan="4" class="empty-state">No upcoming appointments.</td></tr>';
        if (cardGrid) cardGrid.innerHTML = cardHtml || '<p class="empty-state">No upcoming appointments.</p>';
        if (statsNextAppt) {
            statsNextAppt.textContent = nextAppt ? `${nextAppt.time} · Dr. ${nextAppt.doctorName.split(' ')[0]}` : 'None Scheduled';
        }
        if (window.lucide) lucide.createIcons();
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
                sub: 'Specialist',
                extra: { name: data.name }
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
        const drEl = document.getElementById('select-doctor');
        const time = document.getElementById('appt-time').value;

        if (!drEl.value || !time) {
            alert('Please select a doctor and time.');
            return;
        }

        // Get doctor name from the option's data-name attribute
        const selectedOpt = drEl.options[drEl.selectedIndex];
        const doctorName = selectedOpt ? (selectedOpt.dataset.name || selectedOpt.textContent) : 'Unknown';

        try {
            await addDoc(collection(db, 'appointments'), {
                patientId: auth.currentUser.uid,
                patientName: userData.name,
                patientAge: userData.age || '—',
                patientGender: userData.gender || '—',
                doctorId: drEl.value,
                doctorName: doctorName,
                time: time,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            alert('Appointment requested successfully!');
            bookForm.reset();
            // Reset custom select trigger text
            const trigger = document.querySelector('#doctor-select-trigger span');
            if (trigger) trigger.textContent = 'Choose a doctor...';
            document.querySelector('[data-target="appointments-section"]').click();
        } catch (err) {
            console.error(err);
            alert('Failed to book appointment.');
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
        alert('Failed to cancel.');
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
