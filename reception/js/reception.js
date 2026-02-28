import { auth, db } from '../../js/firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, getDoc, collection, query, where, onSnapshot,
    addDoc, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initCustomSelect } from '../../js/dropdown.js';

// ── DOM refs ──────────────────────────────────────────────────
const displayName = document.getElementById('display-name');
const userAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');
const navItems = document.querySelectorAll('.nav-item[data-target]');
const sections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('page-title');

// ── Auth Guard ────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) return (window.location.href = '../index.html');

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists() || snap.data().role !== 'receptionist') {
        alert('Access Denied: Receptionists only.');
        return (window.location.href = '../index.html');
    }

    const data = snap.data();
    if (displayName) displayName.textContent = data.name || 'Receptionist';
    if (userAvatar) userAvatar.textContent = (data.name || 'R')[0].toUpperCase();

    // Start listeners
    loadQueue();
    loadStats();
    populateDropdowns();
    loadPatientDirectory();

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

// ── Load Stats ────────────────────────────────────────────────
function loadStats() {
    const patientsCount = document.getElementById('stats-new-patients');
    const queueCount = document.getElementById('stats-queue');

    // New patients today (simplified)
    onSnapshot(query(collection(db, 'users'), where('role', '==', 'patient')), (snap) => {
        if (patientsCount) patientsCount.textContent = snap.size;
    });

    onSnapshot(query(collection(db, 'appointments'), where('status', '==', 'pending')), (snap) => {
        if (queueCount) queueCount.textContent = snap.size;
    });
}

// ── Load Queue ────────────────────────────────────────────────
function loadQueue() {
    const tableBody = document.getElementById('queue-table-body');
    const q = query(collection(db, 'appointments'));

    onSnapshot(q, (snap) => {
        let html = '';
        snap.forEach(d => {
            const data = d.data();
            const initial = (data.patientName || '?')[0].toUpperCase();
            html += `
                <tr class="admin-table-row">
                    <td>
                        <div class="user-info-cell">
                            <div class="user-avatar-sm" style="background:#F0FDFA;color:#0F766E">${initial}</div>
                            <div class="user-details">
                                <span class="user-name-text">${data.patientName}</span>
                            </div>
                        </div>
                    </td>
                    <td class="table-cell-muted">Dr. ${data.doctorName || 'Assigned'}</td>
                    <td class="table-cell-muted">${data.time}</td>
                    <td><span class="status-indicator-pill ${data.status}">${data.status}</span></td>
                </tr>
            `;
        });
        if (tableBody) tableBody.innerHTML = html || '<tr><td colspan="4" class="empty-state">Queue is empty.</td></tr>';
        if (window.lucide) lucide.createIcons();
    });
}

// ── Populate Dropdowns ────────────────────────────────────────
async function populateDropdowns() {
    // Load Patients
    onSnapshot(query(collection(db, 'users'), where('role', '==', 'patient')), (snap) => {
        const patients = [];
        snap.forEach(d => {
            const data = d.data();
            patients.push({
                id: d.id,
                name: data.name,
                sub: data.email,
                extra: { name: data.name, age: data.age || '', gender: data.gender || '' }
            });
        });
        initCustomSelect('patient-select-container', 'patient-options-list', 'select-patient', patients);
    });

    // Load Doctors
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

            alert('Patient registered successfully!');
            registerForm.reset();
            // Switch to queue
            document.querySelector('[data-target="overview-section"]').click();
        } catch (err) {
            console.error(err);
            alert('Failed to register patient.');
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
        const time = document.getElementById('appointment-time').value;

        const patientId = patientEl.value;
        const patientName = patientEl.options[patientEl.selectedIndex].dataset.name;
        const patientAge = patientEl.options[patientEl.selectedIndex].dataset.age;
        const patientGender = patientEl.options[patientEl.selectedIndex].dataset.gender;

        const doctorId = doctorEl.value;
        const doctorName = doctorEl.options[doctorEl.selectedIndex].dataset.name;

        try {
            await addDoc(collection(db, 'appointments'), {
                patientId,
                patientName,
                patientAge,
                patientGender,
                doctorId,
                doctorName,
                time,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            alert('Appointment booked successfully!');
            bookForm.reset();
            document.querySelector('[data-target="overview-section"]').click();
        } catch (err) {
            console.error(err);
            alert('Failed to book appointment.');
        }
    });
}

// ── Patient Directory ─────────────────────────────────────────
function loadPatientDirectory() {
    const tableBody = document.getElementById('patients-table-body');
    if (!tableBody) return;

    onSnapshot(query(collection(db, 'users'), where('role', '==', 'patient')), (snap) => {
        let html = '';
        snap.forEach(d => {
            const m = d.data();
            const joined = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : '—';
            const initial = (m.name || '?')[0].toUpperCase();

            html += `
                <tr class="admin-table-row">
                    <td>
                        <div class="user-info-cell">
                            <div class="user-avatar-sm" style="background:#F0FDFA;color:#0F766E">${initial}</div>
                            <div class="user-details">
                                <span class="user-name-text">${m.name}</span>
                            </div>
                        </div>
                    </td>
                    <td class="table-cell-muted">${m.email}</td>
                    <td class="table-cell-muted">${joined}</td>
                    <td class="table-actions-cell">
                        <button class="btn-action-sm" title="View Details">
                            <i data-lucide="eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html || '<tr><td colspan="4" class="empty-state">No patients found.</td></tr>';
        if (window.lucide) lucide.createIcons();
    });
}
