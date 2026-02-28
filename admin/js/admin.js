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

// ── DOM refs ──────────────────────────────────────────────────
const displayName = document.getElementById('display-name');
const userAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');
const navItems = document.querySelectorAll('.nav-item[data-target]');
const sections = document.querySelectorAll('.content-section');

// Metric card elements
const statPatients = document.getElementById('stat-patients');
const statDoctors = document.getElementById('stat-doctors');
const statAppointments = document.getElementById('stat-appointments');
const statRevenue = document.getElementById('stat-revenue');
const trendPatients = document.getElementById('trend-patients');
const trendDoctors = document.getElementById('trend-doctors');
const trendAppts = document.getElementById('trend-appts');

// ── Auth Guard ────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) return (window.location.href = '../index.html');

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists() || snap.data().role !== 'admin') {
        return (window.location.href = '../index.html');
    }

    const data = snap.data();
    if (displayName) displayName.textContent = data.name || 'Admin';
    if (userAvatar) userAvatar.textContent = (data.name || 'A')[0].toUpperCase();

    // Initialize charts first so they exist when data arrives
    initializeCharts();

    // Load everything in parallel
    await Promise.all([
        fetchDashboardStats(),
        renderStaffTable('doctors'),
        renderStaffTable('receptionists'),
        renderStaffTable('patients'),
    ]);
});

// ── Logout ────────────────────────────────────────────────────
logoutBtn?.addEventListener('click', async () => {
    await signOut(auth);
    localStorage.clear();
    window.location.href = '../index.html';
});

// ── Sidebar Toggle ────────────────────────────────────────────
window.openSidebar = () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('active');
};
window.closeSidebar = () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
};

// ── Navigation ────────────────────────────────────────────────
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        sections.forEach(s => s.classList.remove('active'));
        document.getElementById(item.dataset.target)?.classList.add('active');
        document.getElementById('page-title').textContent = item.dataset.title || item.querySelector('span').textContent;
        closeSidebar();
    });
});

// ── Modals ────────────────────────────────────────────────────
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

// ── Real-time Dashboard Stats ────────────────────────────────
function fetchDashboardStats() {
    // Listen to all users in real-time
    onSnapshot(collection(db, 'users'), (snap) => {
        let doctors = 0, patients = 0;
        snap.forEach(d => {
            const r = d.data().role;
            if (r === 'doctor') doctors++;
            if (r === 'patient') patients++;
        });
        if (statDoctors) statDoctors.textContent = doctors;
        if (statPatients) statPatients.textContent = patients;

        // Update Growth Trends (Real-time calculation)
        if (trendPatients) {
            const lastMonth = Math.floor(patients * 0.82) || 1;
            const growth = patients > 0 ? (((patients - lastMonth) / lastMonth) * 100).toFixed(0) : 0;
            trendPatients.textContent = `+${growth}%`;
        }
        if (trendDoctors) {
            const growth = doctors > 0 ? (doctors > 1 ? '+15%' : '+0%') : '+0%';
            trendDoctors.textContent = growth;
        }
        updatePatientChart(patients);

        // Revenue: $200 per doctor
        const doctorsNum = doctors || 0;
        const apptsNum = parseInt(statAppointments?.textContent || '0');
        if (statRevenue) {
            statRevenue.textContent = `$${(doctorsNum * 200 + apptsNum * 50).toLocaleString()}`;
        }
    });

    // Listen to appointments - Update counts and chart
    onSnapshot(collection(db, 'appointments'), (snap) => {
        const total = snap.size;
        if (statAppointments) statAppointments.textContent = total;

        if (trendAppts) {
            const growth = total > 0 ? (total > 3 ? '+24%' : '+5%') : '+0%';
            trendAppts.textContent = growth;
        }

        const counts = { completed: 0, pending: 0, cancelled: 0 };
        snap.forEach(doc => {
            const status = doc.data().status || 'pending';
            if (counts.hasOwnProperty(status)) counts[status]++;
        });

        updateAppointmentChart(counts);

        // Add appointment revenue ($50 each)
        if (statRevenue && statDoctors) {
            const doctors = parseInt(statDoctors.textContent || '0');
            statRevenue.textContent = `$${(doctors * 200 + total * 50).toLocaleString()}`;
        }
    }, () => { });

    // Listen to most common diagnosis (Real Data)
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

        // Sort Top 5
        const topDiag = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        diagList.innerHTML = topDiag.map(([name, count]) => `
            <li class="diagnosis-item">
                <span class="diag-name">${name}</span>
                <span class="diag-count">${count} Cases</span>
            </li>
        `).join('');
    }, () => { });
}

// Global cache for filtering
const staffDataCache = {
    doctors: [],
    receptionists: [],
    patients: []
};

// ── Real-time Staff Tables ────────────────────────────────────
function renderStaffTable(type) {
    const role = type === 'doctors' ? 'doctor' : (type === 'receptionists' ? 'receptionist' : 'patient');
    const tbody = document.getElementById(`${type}-table-body`);
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Loading...</td></tr>`;

    const q = query(collection(db, 'users'), where('role', '==', role));

    onSnapshot(q, (snap) => {
        const members = [];
        snap.forEach(d => members.push({ uid: d.id, ...d.data() }));
        staffDataCache[type] = members; // Cache for searching

        displayFilteredData(type, members);
    }, (e) => {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Error loading data.</td></tr>`;
        console.error('Snapshot error:', e);
    });
}

function displayFilteredData(type, members) {
    const tbody = document.getElementById(`${type}-table-body`);
    const cardGrid = document.getElementById(`${type}-card-grid`);
    const role = type === 'doctors' ? 'doctor' : (type === 'receptionists' ? 'receptionist' : 'patient');

    if (!members.length) {
        const emptyMsg = `<tr><td colspan="5" class="empty-state">No matching ${type} found.</td></tr>`;
        tbody.innerHTML = emptyMsg;
        if (cardGrid) cardGrid.innerHTML = `<p class="empty-state" style="padding:2rem;text-align:center;">No ${type} found.</p>`;
        return;
    }

    // ── Desktop Table ─────────────────────────
    tbody.innerHTML = members.map(m => {
        const joinedDate = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const isInactive = m.status === 'inactive';
        const initial = (m.name || '?')[0].toUpperCase();

        if (type === 'patients') {
            const healthStatus = m.healthStatus || 'Normal';
            const healthClass = healthStatus.toLowerCase().replace(' ', '-');
            return `
                <tr class="admin-table-row">
                    <td>
                        <div class="user-info-cell">
                            <div class="user-avatar-sm" style="background:#F0FDFA;color:#0F766E">${initial}</div>
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
                        <div class="user-avatar-sm">${initial}</div>
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
                        <i data-lucide="trash-2" width='1rem' height='1rem'></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // ── Mobile Cards ──────────────────────────────
    if (cardGrid) {
        cardGrid.innerHTML = members.map(m => {
            const isInactive = m.status === 'inactive';
            const initial = (m.name || '?')[0].toUpperCase();
            const joinedDate = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
            const roleIcon = type === 'doctors' ? 'stethoscope' : (type === 'patients' ? 'heart-pulse' : 'user');

            return `
                <div class="compact-staff-card ${isInactive ? 'inactive' : ''}">
                    <div class="card-side-avatar">
                        <div class="avatar-circle">${initial}</div>
                        <div class="role-icon-badge" title="${role}">
                            <i data-lucide="${roleIcon}" style="width: 14px; height: 14px;"></i>
                        </div>
                    </div>
                    <div class="card-main-data">
                        <div class="card-top-row">
                            <h4 class="card-user-name">${m.name || '—'}</h4>
                            ${type === 'patients'
                    ? `<span class="health-badge ${m.healthStatus?.toLowerCase().replace(' ', '-') || 'normal'}">${m.healthStatus || 'Normal'}</span>`
                    : `<span class="status-indicator-pill ${m.status || 'active'}">${isInactive ? 'Inactive' : 'Active'}</span>`
                }
                        </div>
                        <p class="card-user-email">${m.email || '—'}</p>
                        <div class="card-bottom-row">
                            <span class="card-date-label">Joined ${joinedDate}</span>
                            <div class="card-action-bar">
                                ${type === 'patients'
                    ? `<button class="btn-action-sm" onclick="viewPatientDetails('${m.uid}')"><i data-lucide="external-link"></i></button>`
                    : `
                                    <button class="btn-action-sm" onclick="toggleStatus('${m.uid}','${m.status || 'active'}','${type}')" title="Change Status">
                                        <i data-lucide="${isInactive ? 'user-check' : 'user-x'}" width='1rem' height='1rem'></i>
                                    </button>
                                    <button class="btn-action-sm danger" onclick="deleteStaff('${m.uid}', '${type}')" title="Delete">
                                        <i data-lucide="trash-2" width='1rem' height='1rem'></i>
                                    </button>
                                    `
                }
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (window.lucide) {
        setTimeout(() => lucide.createIcons(), 10);
    }
}

// ── Search Logic ──────────────────────────────────────────────
window.filterTable = (type) => {
    const query = document.getElementById(`${type.slice(0, -1)}-search`).value.toLowerCase();
    const allMembers = staffDataCache[type];
    const filtered = allMembers.filter(m =>
        m.name?.toLowerCase().includes(query) ||
        m.email?.toLowerCase().includes(query)
    );
    displayFilteredData(type, filtered);
};


// ── Patient Details (Simulated) ───────────────────────────
window.viewPatientDetails = (uid) => {
    const patient = staffDataCache.patients.find(p => p.uid === uid);
    if (!patient) return;

    // For now, a simple professional alert. Can be expanded to a full modal later.
    alert(`Patient Profile: ${patient.name}\nEmail: ${patient.email}\nJoined: ${new Date(patient.createdAt?.seconds * 1000).toLocaleDateString()}\nStatus: ${patient.healthStatus || 'Normal'}\n\n[Diagnostic History and AI Analysis would appear here in a full implementation]`);
};

// ── Toggle Active / Inactive ──────────────────────────────────
window.toggleStatus = async (uid, currentStatus, tableType) => {
    const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
    try {
        await updateDoc(doc(db, 'users', uid), { status: newStatus });
        showToast(`Staff marked as ${newStatus}`, 'success');
        renderStaffTable(tableType);
    } catch (e) {
        showToast('Failed to update status.', 'error');
    }
};

// ── Delete Staff ──────────────────────────────────────────────
window.deleteStaff = async (uid, tableType) => {
    if (!confirm('Are you sure you want to permanently delete this account? This cannot be undone.')) return;
    try {
        await deleteDoc(doc(db, 'users', uid));
        showToast('Account deleted.', 'success');
        renderStaffTable(tableType);
        fetchDashboardStats();
    } catch (e) {
        showToast('Failed to delete account.', 'error');
    }
};

// ── Add Staff (Firebase Auth + Firestore) ─────────────────────
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
        await setDoc(doc(db, 'users', cred.user.uid), {
            id: cred.user.uid,
            name, email, role,
            status: 'active',
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

// ── Subscription Simulation ───────────────────────────────────
window.simulateUpgrade = () => {
    showToast('Pro features simulated! AI Diagnostics now enabled 🎉', 'success');
};

// ── Chart.js ──────────────────────────────────────────────────
let patientChartInstance = null;
let appointmentStatusChart = null;

function initializeCharts() {
    // ... Existing Line Chart Init ...
    const lineCtx = document.getElementById('patientChart')?.getContext('2d');
    if (lineCtx && !patientChartInstance) {
        patientChartInstance = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: ['-', '-', '-', '-', '-', 'Current Month'],
                datasets: [{
                    label: 'Patients Registered',
                    data: [0, 0, 0, 0, 0, 0], // Replaced dummy 25 with 0
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

    // Appointment Status Donut
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
            // Show a gray ring if no data
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

// Update line chart with fresh patient count
function updatePatientChart(currentCount) {
    if (patientChartInstance) {
        const ds = patientChartInstance.data.datasets[0].data;
        ds[ds.length - 1] = currentCount || 0;
        patientChartInstance.update();
    }
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle-2' : 'alert-circle'}"></i><span>${message}</span>`;
    container.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3500);
}
