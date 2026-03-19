// Enhanced Doctor Dashboard - Better User Experience
import { auth, db } from '../../js/firebase-config.js';
import {
    onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc, getDoc, setDoc, updateDoc,
    deleteDoc, collection, query, where,
    serverTimestamp, onSnapshot, getDocs,
    orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";


// Enhanced Doctor System
class EnhancedDoctorSystem {
    constructor() {
        this.appointments = new Map();
        this.patients = new Map();
        this.prescriptions = new Map();
        this.notifications = new Map();
        this.currentView = 'appointments';
        this.filterStatus = 'all';
        this.searchQuery = '';
    }

    init() {
        this.setupEventListeners();
        this.startRealTimeListeners();
        this.initializeEnhancedUI();
    }

    setupEventListeners() {
        // Enhanced navigation
        document.querySelectorAll('.nav-item[data-target]').forEach(item => {
            item.addEventListener('click', (e) => this.handleNavigation(e));
        });

        // Search functionality
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }

        // Filter functionality
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFilter(e.target.dataset.filter));
        });

        // Quick actions
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleQuickAction(e.target.dataset.action));
        });
    }

    async handleNavigation(event) {
        const targetId = event.currentTarget.getAttribute('data-target');
        const targetTitle = event.currentTarget.getAttribute('data-title');
        
        // Update active state
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        event.currentTarget.classList.add('active');
        
        // Update page title
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) pageTitle.textContent = targetTitle;
        
        // Show content with animation
        this.showSection(targetId);
        
        // Update mobile view
        if (window.innerWidth < 1024) {
            this.closeSidebar();
        }
    }

    showSection(sectionId) {
        // Hide all sections immediately
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active', 'fade-out');
        });

        // Show target section immediately
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
            this.loadSectionContent(sectionId);
        }
    }

    async loadSectionContent(sectionId) {
        switch(sectionId) {
            case 'appointments-section':
                await this.loadAppointments();
                break;
            case 'patients-history-section':
                await this.loadPatientsHistory();
                break;
            case 'ai-diagnosis-section':
                await this.loadAIDiagnosis();
                break;
            case 'stats-section':
                await this.loadStats();
                break;
            case 'profile-section':
                await this.loadProfile();
                break;
        }
    }

    async loadAppointments() {
        
        const appointmentsQuery = query(
            collection(db, 'appointments'),
            where('doctorId', '==', auth.currentUser.uid),
            orderBy('date', 'asc'),
            orderBy('time', 'asc')
        );

        const snapshot = onSnapshot(appointmentsQuery, (querySnapshot) => {
            this.appointments.clear();
            querySnapshot.forEach(doc => {
                this.appointments.set(doc.id, { id: doc.id, ...doc.data() });
            });
            this.renderAppointments();
        });
    }

    renderAppointments() {
        const container = document.getElementById('appointments-container');
        if (!container) return;

        const filteredAppointments = this.getFilteredAppointments();
        
        if (filteredAppointments.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="calendar-x" style="width: 48px; height: 48px; color: var(--text-muted);"></i>
                    <h3>No Appointments Found</h3>
                    <p>There are no appointments matching your current filter.</p>
                </div>
            `;
            return;
        }

        const appointmentsHTML = filteredAppointments.map(apt => this.renderAppointmentCard(apt)).join('');
        container.innerHTML = `
            <div class="appointments-header">
                <div class="appointments-stats">
                    <div class="stat-item">
                        <span class="stat-number">${filteredAppointments.length}</span>
                        <span class="stat-label">Total</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${this.getTodayAppointments().length}</span>
                        <span class="stat-label">Today</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${this.getUpcomingAppointments().length}</span>
                        <span class="stat-label">Upcoming</span>
                    </div>
                </div>
                <div class="appointments-actions">
                    <button class="btn btn-primary" onclick="enhancedDoctor.scheduleNewAppointment()">
                        <i data-lucide="plus"></i> Schedule New
                    </button>
                    <button class="btn btn-secondary" onclick="enhancedDoctor.exportAppointments()">
                        <i data-lucide="download"></i> Export
                    </button>
                </div>
            </div>
            <div class="appointments-grid">
                ${appointmentsHTML}
            </div>
        `;

        // Reinitialize icons
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    renderAppointmentCard(appointment) {
        const statusClass = this.getStatusClass(appointment.status);
        const statusIcon = this.getStatusIcon(appointment.status);
        const dateObj = new Date(appointment.date);
        const formattedDate = dateObj.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });

        return `
            <div class="appointment-card ${statusClass} hover-lift" data-id="${appointment.id}">
                <div class="appointment-header">
                    <div class="appointment-patient">
                        <i data-lucide="user"></i>
                        <span>${appointment.patientName || 'Loading...'}</span>
                    </div>
                    <div class="appointment-status">
                        <i data-lucide="${statusIcon}"></i>
                        <span>${appointment.status}</span>
                    </div>
                </div>
                <div class="appointment-body">
                    <div class="appointment-time">
                        <i data-lucide="clock"></i>
                        <span>${appointment.time}</span>
                    </div>
                    <div class="appointment-date">
                        <i data-lucide="calendar"></i>
                        <span>${formattedDate}</span>
                    </div>
                    ${appointment.reason ? `
                        <div class="appointment-reason">
                            <i data-lucide="message-circle"></i>
                            <span>${appointment.reason}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="appointment-actions">
                    <button class="btn btn-sm btn-primary" onclick="enhancedDoctor.startConsultation('${appointment.id}')">
                        <i data-lucide="video"></i> Start
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="enhancedDoctor.viewPatientDetails('${appointment.patientId}')">
                        <i data-lucide="file-text"></i> Details
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="enhancedDoctor.rescheduleAppointment('${appointment.id}')">
                        <i data-lucide="calendar"></i> Reschedule
                    </button>
                </div>
            </div>
        `;
    }

    getStatusClass(status) {
        switch(status.toLowerCase()) {
            case 'confirmed': return 'status-confirmed';
            case 'completed': return 'status-completed';
            case 'cancelled': return 'status-cancelled';
            case 'in-progress': return 'status-in-progress';
            default: return 'status-pending';
        }
    }

    getStatusIcon(status) {
        switch(status.toLowerCase()) {
            case 'confirmed': return 'check-circle';
            case 'completed': return 'check-circle-2';
            case 'cancelled': return 'x-circle';
            case 'in-progress': return 'clock';
            default: return 'alert-circle';
        }
    }

    getFilteredAppointments() {
        let filtered = Array.from(this.appointments.values());
        
        // Apply status filter
        if (this.filterStatus !== 'all') {
            filtered = filtered.filter(apt => apt.status.toLowerCase() === this.filterStatus);
        }
        
        // Apply search filter
        if (this.searchQuery) {
            filtered = filtered.filter(apt => 
                apt.patientName?.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                apt.reason?.toLowerCase().includes(this.searchQuery.toLowerCase())
            );
        }
        
        return filtered;
    }

    getTodayAppointments() {
        const today = new Date().toISOString().split('T')[0];
        return Array.from(this.appointments.values()).filter(apt => apt.date === today);
    }

    getUpcomingAppointments() {
        const today = new Date();
        return Array.from(this.appointments.values()).filter(apt => 
            new Date(apt.date) >= today && apt.status !== 'completed'
        );
    }

    async loadPatientsHistory() {
        
        const patientsQuery = query(
            collection(db, 'users'),
            where('role', '==', 'patient'),
            orderBy('name', 'asc')
        );

        const snapshot = onSnapshot(patientsQuery, (querySnapshot) => {
            this.patients.clear();
            querySnapshot.forEach(doc => {
                this.patients.set(doc.id, { id: doc.id, ...doc.data() });
            });
            this.renderPatientsHistory();
        });
    }

    renderPatientsHistory() {
        const container = document.getElementById('patients-container');
        if (!container) return;

        const patientsHTML = Array.from(this.patients.values())
            .map(patient => this.renderPatientCard(patient))
            .join('');

        container.innerHTML = `
            <div class="patients-header">
                <div class="search-container">
                    <i data-lucide="search"></i>
                    <input type="text" id="patient-search" placeholder="Search patients..." 
                           onkeyup="enhancedDoctor.searchPatients(this.value)">
                </div>
            </div>
            <div class="patients-grid">
                ${patientsHTML}
            </div>
        `;

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    renderPatientCard(patient) {
        const lastVisit = patient.lastVisit ? new Date(patient.lastVisit).toLocaleDateString() : 'No visits';
        const totalVisits = patient.totalVisits || 0;

        return `
            <div class="patient-card hover-lift" data-id="${patient.id}">
                <div class="patient-avatar">
                    ${patient.photoURL ? 
                        `<img src="${patient.photoURL}" alt="${patient.name}">` : 
                        `<div class="avatar-placeholder">${patient.name.charAt(0)}</div>`
                    }
                </div>
                <div class="patient-info">
                    <h4>${patient.name}</h4>
                    <p class="patient-email">${patient.email}</p>
                    <div class="patient-stats">
                        <span class="stat-item">
                            <i data-lucide="calendar"></i>
                            <span>Last Visit: ${lastVisit}</span>
                        </span>
                        <span class="stat-item">
                            <i data-lucide="activity"></i>
                            <span>Total Visits: ${totalVisits}</span>
                        </span>
                    </div>
                </div>
                <div class="patient-actions">
                    <button class="btn btn-sm btn-primary" onclick="enhancedDoctor.viewPatientRecord('${patient.id}')">
                        <i data-lucide="file-text"></i> Records
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="enhancedDoctor.scheduleAppointment('${patient.id}')">
                        <i data-lucide="calendar-plus"></i> Schedule
                    </button>
                </div>
            </div>
        `;
    }

    async loadAIDiagnosis() {
        const container = document.getElementById('ai-diagnosis-container');
        if (!container) return;

        container.innerHTML = `
            <div class="ai-diagnosis-interface">
                <div class="ai-header">
                    <h3>AI Medical Diagnosis Assistant</h3>
                    <p>Advanced symptom analysis with treatment recommendations</p>
                </div>
                <div class="ai-input-section">
                    <div class="input-group">
                        <label class="form-label">Patient Symptoms</label>
                        <textarea id="symptoms-input" class="form-input" rows="4" 
                                  placeholder="Enter patient symptoms..."></textarea>
                    </div>
                    <div class="input-group">
                        <label class="form-label">Patient Age</label>
                        <input type="number" id="age-input" class="form-input" placeholder="Enter patient age...">
                    </div>
                    <div class="input-group">
                        <label class="form-label">Gender</label>
                        <select id="gender-input" class="form-input">
                            <option value="">Select gender...</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <button class="btn btn-primary btn-lg" onclick="enhancedDoctor.analyzeSymptoms()">
                        <i data-lucide="brain-circuit"></i> Analyze Symptoms
                    </button>
                </div>
                <div class="ai-results" id="ai-results">
                    <!-- AI analysis results will appear here -->
                </div>
            </div>
        `;
    }

    async analyzeSymptoms() {
        const symptoms = document.getElementById('symptoms-input').value;
        const age = document.getElementById('age-input').value;
        const gender = document.getElementById('gender-input').value;

        if (!symptoms) {
            this.showMessage('Please enter patient symptoms', 'warning');
            return;
        }

        // Show loading state
        const resultsContainer = document.getElementById('ai-results');
        resultsContainer.innerHTML = `
            <div class="ai-loading">
                <div class="loading-spinner"></div>
                <p>Analyzing symptoms with AI...</p>
            </div>
        `;

        // AI analysis (Instant)
        const analysis = this.simulateAIAnalysis(symptoms, age, gender);
        this.displayAIResults(analysis);
    }

    simulateAIAnalysis(symptoms, age, gender) {
        // This is a simulation - in production, this would call a real AI service
        return {
            possibleConditions: ['Common Cold', 'Seasonal Allergy', 'Viral Infection'],
            severity: 'Mild',
            recommendations: [
                'Rest and hydration',
                'Over-the-counter medication',
                'Monitor symptoms for 48 hours',
                'Consult if symptoms worsen'
            ],
            urgency: 'Low',
            confidence: 85
        };
    }

    displayAIResults(analysis) {
        const resultsContainer = document.getElementById('ai-results');
        resultsContainer.innerHTML = `
            <div class="ai-analysis-results">
                <div class="analysis-header">
                    <h4>AI Analysis Results</h4>
                    <div class="confidence-badge">
                        <span>${analysis.confidence}% Confidence</span>
                    </div>
                </div>
                <div class="analysis-content">
                    <div class="possible-conditions">
                        <h5>Possible Conditions:</h5>
                        <ul>
                            ${analysis.possibleConditions.map(condition => 
                                `<li><i data-lucide="alert-circle"></i> ${condition}</li>`
                            ).join('')}
                        </ul>
                    </div>
                    <div class="severity-indicator">
                        <h5>Severity Level:</h5>
                        <div class="severity-bar">
                            <div class="severity-fill ${analysis.severity.toLowerCase()}" 
                                 style="width: ${this.getSeverityWidth(analysis.severity)}%"></div>
                        </div>
                        <span class="severity-text">${analysis.severity}</span>
                    </div>
                    <div class="recommendations">
                        <h5>Recommendations:</h5>
                        <ul>
                            ${analysis.recommendations.map(rec => 
                                `<li><i data-lucide="check-circle"></i> ${rec}</li>`
                            ).join('')}
                        </ul>
                    </div>
                    <div class="urgency-level">
                        <h5>Urgency:</h5>
                        <span class="urgency-badge ${analysis.urgency.toLowerCase()}">
                            ${analysis.urgency}
                        </span>
                    </div>
                </div>
                <div class="analysis-actions">
                    <button class="btn btn-primary" onclick="enhancedDoctor.generatePrescription()">
                        <i data-lucide="file-text"></i> Generate Prescription
                    </button>
                    <button class="btn btn-secondary" onclick="enhancedDoctor.scheduleFollowUp()">
                        <i data-lucide="calendar"></i> Schedule Follow-up
                    </button>
                </div>
            </div>
        `;

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    getSeverityWidth(severity) {
        switch(severity.toLowerCase()) {
            case 'mild': return 25;
            case 'moderate': return 50;
            case 'severe': return 75;
            default: return 50;
        }
    }

    async loadStats() {
        const container = document.getElementById('stats-container');
        if (!container) return;

        // Calculate doctor statistics
        const stats = await this.calculateDoctorStats();
        
        container.innerHTML = `
            <div class="stats-dashboard">
                <div class="stats-grid">
                    <div class="stat-card hover-lift">
                        <div class="stat-icon">
                            <i data-lucide="users"></i>
                        </div>
                        <div class="stat-content">
                            <h3>${stats.totalPatients}</h3>
                            <p>Total Patients</p>
                        </div>
                    </div>
                    <div class="stat-card hover-lift">
                        <div class="stat-icon">
                            <i data-lucide="calendar-check"></i>
                        </div>
                        <div class="stat-content">
                            <h3>${stats.totalAppointments}</h3>
                            <p>Total Appointments</p>
                        </div>
                    </div>
                    <div class="stat-card hover-lift">
                        <div class="stat-icon">
                            <i data-lucide="clock"></i>
                        </div>
                        <div class="stat-content">
                            <h3>${stats.avgConsultationTime}</h3>
                            <p>Avg Consultation (min)</p>
                        </div>
                    </div>
                    <div class="stat-card hover-lift">
                        <div class="stat-icon">
                            <i data-lucide="trending-up"></i>
                        </div>
                        <div class="stat-content">
                            <h3>${stats.patientSatisfaction}%</h3>
                            <p>Patient Satisfaction</p>
                        </div>
                    </div>
                </div>
                <div class="performance-chart">
                    <h4>Monthly Performance</h4>
                    <canvas id="performance-chart" width="400" height="200"></canvas>
                </div>
            </div>
        `;

        // Initialize performance chart
        this.initializePerformanceChart(stats);
        
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    async calculateDoctorStats() {
        // This would calculate real statistics from Firestore
        return {
            totalPatients: 156,
            totalAppointments: 89,
            avgConsultationTime: 15,
            patientSatisfaction: 94
        };
    }

    initializePerformanceChart(stats) {
        const canvas = document.getElementById('performance-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // Simple chart implementation (in production, use Chart.js or similar)
        const data = {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Appointments',
                data: [12, 19, 15, 25, 22, 30],
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                tension: 0.4
            }]
        };

        // Draw simple chart
        this.drawSimpleChart(ctx, data);
    }

    drawSimpleChart(ctx, data) {
        // Simple chart drawing implementation
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const padding = 40;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw axes
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // Draw data points and lines
        const chartWidth = width - (padding * 2);
        const chartHeight = height - (padding * 2);
        const dataPoints = data.datasets[0].data;
        const maxValue = Math.max(...dataPoints);
        
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        dataPoints.forEach((value, index) => {
            const x = padding + (index * (chartWidth / (dataPoints.length - 1)));
            const y = height - padding - ((value / maxValue) * chartHeight);
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw points
        dataPoints.forEach((value, index) => {
            const x = padding + (index * (chartWidth / (dataPoints.length - 1)));
            const y = height - padding - ((value / maxValue) * chartHeight);
            
            ctx.fillStyle = '#2563EB';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    handleSearch(query) {
        this.searchQuery = query.toLowerCase();
        this.renderAppointments();
    }

    handleFilter(filter) {
        this.filterStatus = filter;
        this.renderAppointments();
    }

    handleQuickAction(action) {
        switch(action) {
            case 'refresh':
                this.loadAppointments();
                break;
            case 'export':
                this.exportAppointments();
                break;
            case 'settings':
                this.openSettings();
                break;
        }
    }

    showLoadingState(containerId) {
        // Removed artificial loading states
    }

    hideLoadingState(containerId) {
        // Removed artificial loading states
    }

    showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-toast ${type}-message`;
        messageDiv.innerHTML = `
            <i data-lucide="${this.getMessageIcon(type)}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.classList.add('fade-out');
            setTimeout(() => messageDiv.remove(), 300);
        }, 3000);
    }

    getMessageIcon(type) {
        switch(type) {
            case 'success': return 'check-circle';
            case 'error': return 'x-circle';
            case 'warning': return 'alert-triangle';
            default: return 'info';
        }
    }

    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }

    startRealTimeListeners() {
        // Listen for real-time updates
        const appointmentsRef = collection(db, 'appointments');
        onSnapshot(appointmentsRef, (snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'modified') {
                    this.handleRealTimeUpdate(change.doc.data());
                }
            });
        });
    }

    handleRealTimeUpdate(data) {
        // Show real-time notification
        this.showMessage('Appointment status updated', 'success');
        this.loadAppointments(); // Refresh appointments
    }

    initializeEnhancedUI() {
        // Add smooth scrolling
        document.documentElement.style.scrollBehavior = 'smooth';
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'k':
                        this.handleSearch(document.getElementById('search-input')?.value || '');
                        break;
                    case 'n':
                        this.scheduleNewAppointment();
                        break;
                    case 'r':
                        this.loadAppointments();
                        break;
                }
            }
        });
    }

    // Public methods for global access
    scheduleNewAppointment() {
        this.showMessage('Opening appointment scheduler...', 'info');
        // Navigate to appointment scheduling
        this.handleNavigation({ currentTarget: { getAttribute: () => 'appointments-section' } });
    }

    exportAppointments() {
        this.showMessage('Exporting appointments...', 'info');
        // Export functionality
    }

    viewPatientDetails(patientId) {
        this.showMessage(`Loading patient details...`, 'info');
        // View patient details
    }

    startConsultation(appointmentId) {
        this.showMessage('Starting consultation...', 'info');
        // Start video consultation
    }

    rescheduleAppointment(appointmentId) {
        this.showMessage('Opening rescheduler...', 'info');
        // Reschedule appointment
    }

    viewPatientRecord(patientId) {
        this.showMessage('Loading patient records...', 'info');
        // View full patient records
    }

    generatePrescription() {
        this.showMessage('Generating prescription...', 'info');
        // Generate prescription
    }

    scheduleFollowUp() {
        this.showMessage('Scheduling follow-up...', 'info');
        // Schedule follow-up appointment
    }

    openSettings() {
        this.showMessage('Opening settings...', 'info');
        // Open settings modal
    }
}

// Global instance
window.enhancedDoctor = new EnhancedDoctorSystem();

onAuthStateChanged(auth, (user) => {
    if (user) {
        enhancedDoctor.init();
    }
});
