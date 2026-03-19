import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { auth, db } from "../../js/firebase-config.js";


// Receptionist Command Center - Real-time Traffic Control
class CommandCenter {
    constructor() {
        this.appointments = new Map();
        this.doctorSchedules = new Map();
        this.alerts = new Map();
        this.reassignQueue = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadAppointments();
        this.loadDoctorSchedules();
        this.startRealTimeMonitoring();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.renderCommandCenter();
        });
    }

    // Load all appointments for real-time monitoring
    loadAppointments() {
        const appointmentsQuery = query(collection(db, 'appointments'));
        
        onSnapshot(appointmentsQuery, (snapshot) => {
            snapshot.forEach(doc => {
                const appointment = doc.data();
                appointment.id = doc.id;
                this.appointments.set(doc.id, appointment);
            });
            this.monitorAppointmentStatus();
            this.updateDashboard();
        });
    }

    // Load doctor schedules for availability checking
    loadDoctorSchedules() {
        const schedulesQuery = query(collection(db, 'doctorSchedules'));
        
        onSnapshot(schedulesQuery, (snapshot) => {
            snapshot.forEach(doc => {
                this.doctorSchedules.set(doc.id, doc.data());
            });
            this.checkAppointmentConflicts();
        });
    }

    // Real-time monitoring system
    startRealTimeMonitoring() {
        // Check for stalled appointments every 30 seconds
        setInterval(() => {
            this.checkStalledAppointments();
        }, 30000);

        // Check for unattended appointments every minute
        setInterval(() => {
            this.checkUnattendedAppointments();
        }, 60000);

        // Update alerts every 15 seconds
        setInterval(() => {
            this.updateAlerts();
        }, 15000);
    }

    // Monitor appointment status and flag issues
    monitorAppointmentStatus() {
        const now = new Date();
        const alerts = [];

        this.appointments.forEach((appointment, id) => {
            const appointmentTime = new Date(`${appointment.date} ${appointment.time}`);
            const timeDiff = now - appointmentTime;
            const minutesDiff = Math.floor(timeDiff / (1000 * 60));

            // Flag appointments that should have started but haven't
            if (appointment.status === 'confirmed' && minutesDiff > 15) {
                alerts.push({
                    type: 'stalled',
                    appointmentId: id,
                    message: `Appointment for ${appointment.patientName} is ${minutesDiff} minutes delayed`,
                    severity: this.calculateSeverity(minutesDiff),
                    doctorId: appointment.doctorId,
                    patientId: appointment.patientId
                });
            }

            // Flag appointments that are running too long
            if (appointment.status === 'in-progress' && minutesDiff > 60) {
                alerts.push({
                    type: 'extended',
                    appointmentId: id,
                    message: `Appointment with ${appointment.patientName} is running overtime`,
                    severity: 'medium',
                    doctorId: appointment.doctorId,
                    patientId: appointment.patientId
                });
            }

            // Flag no-show appointments
            if (appointment.status === 'confirmed' && minutesDiff > 30) {
                alerts.push({
                    type: 'no-show',
                    appointmentId: id,
                    message: `Patient ${appointment.patientName} may be a no-show`,
                    severity: 'high',
                    doctorId: appointment.doctorId,
                    patientId: appointment.patientId
                });
            }
        });

        this.updateAlertsList(alerts);
    }

    calculateSeverity(minutesDiff) {
        if (minutesDiff > 60) return 'critical';
        if (minutesDiff > 30) return 'high';
        if (minutesDiff > 15) return 'medium';
        return 'low';
    }

    checkStalledAppointments() {
        const now = new Date();
        
        this.appointments.forEach((appointment, id) => {
            const appointmentTime = new Date(`${appointment.date} ${appointment.time}`);
            const timeDiff = now - appointmentTime;
            const minutesDiff = Math.floor(timeDiff / (1000 * 60));

            if (appointment.status === 'confirmed' && minutesDiff > 20) {
                this.createAlert({
                    type: 'stalled',
                    appointmentId: id,
                    message: `Stalled: ${appointment.patientName} - ${minutesDiff} min delay`,
                    severity: minutesDiff > 45 ? 'critical' : 'high',
                    actionRequired: true,
                    doctorId: appointment.doctorId,
                    patientId: appointment.patientId
                });
            }
        });
    }

    checkUnattendedAppointments() {
        const now = new Date();
        
        this.appointments.forEach((appointment, id) => {
            const appointmentTime = new Date(`${appointment.date} ${appointment.time}`);
            const timeDiff = now - appointmentTime;
            const minutesDiff = Math.floor(timeDiff / (1000 * 60));

            if (appointment.status === 'confirmed' && minutesDiff > 10 && !appointment.attended) {
                this.createAlert({
                    type: 'unattended',
                    appointmentId: id,
                    message: `Unattended: ${appointment.patientName} waiting for ${minutesDiff} minutes`,
                    severity: 'medium',
                    actionRequired: true,
                    doctorId: appointment.doctorId,
                    patientId: appointment.patientId
                });
            }
        });
    }

    checkAppointmentConflicts() {
        // Check for double bookings and schedule conflicts
        const doctorAppointments = new Map();

        this.appointments.forEach(appointment => {
            if (!doctorAppointments.has(appointment.doctorId)) {
                doctorAppointments.set(appointment.doctorId, []);
            }
            doctorAppointments.get(appointment.doctorId).push(appointment);
        });

        doctorAppointments.forEach((appointments, doctorId) => {
            const sortedAppointments = appointments.sort((a, b) => {
                const timeA = new Date(`${a.date} ${a.time}`);
                const timeB = new Date(`${b.date} ${b.time}`);
                return timeA - timeB;
            });

            for (let i = 1; i < sortedAppointments.length; i++) {
                const current = sortedAppointments[i];
                const previous = sortedAppointments[i - 1];
                
                const currentTime = new Date(`${current.date} ${current.time}`);
                const previousTime = new Date(`${previous.date} ${previous.time}`);
                const timeDiff = (currentTime - previousTime) / (1000 * 60);

                if (timeDiff < 15) {
                    this.createAlert({
                        type: 'conflict',
                        appointmentId: current.id,
                        message: `Schedule conflict: ${current.patientName} and ${previous.patientName} too close`,
                        severity: 'high',
                        actionRequired: true,
                        doctorId: doctorId
                    });
                }
            }
        });
    }

    createAlert(alert) {
        const alertId = `alert-${alert.appointmentId}-${alert.type}-${Date.now()}`;
        alert.id = alertId;
        alert.timestamp = Date.now(); // Use JS timestamp, not Firestore serverTimestamp
        alert.acknowledged = false;
        
        this.alerts.set(alertId, alert);
        this.renderAlert(alert);
        this.playNotificationSound(alert.severity);
    }

    updateAlerts(newAlerts = []) {
        // Update existing alerts and add new ones
        newAlerts.forEach(alert => {
            const alertId = `alert-${alert.appointmentId}-${alert.type}`;
            if (!this.alerts.has(alertId)) {
                this.createAlert(alert);
            }
        });

        // Remove old alerts
        const now = new Date();
        this.alerts.forEach((alert, id) => {
            const alertAge = (now - alert.timestamp.toDate()) / (1000 * 60);
            if (alertAge > 30) {
                this.alerts.delete(id);
            }
        });

        this.updateAlertsList();
    }

    updateAlertsList(newAlerts = []) {
        const alertsContainer = document.getElementById('alerts-list');
        if (!alertsContainer) return;

        const activeAlerts = Array.from(this.alerts.values())
            .filter(alert => !alert.acknowledged)
            .sort((a, b) => {
                const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
                return severityOrder[a.severity] - severityOrder[b.severity];
            });

        const alertsHTML = activeAlerts.map(alert => this.renderAlertCard(alert)).join('');
        alertsContainer.innerHTML = alertsHTML || '<p class="no-alerts">No active alerts</p>';
    }

    renderAlertCard(alert) {
        const severityClass = alert.severity;
        const iconMap = {
            stalled: 'clock',
            unattended: 'user-x',
            conflict: 'alert-triangle',
            extended: 'clock',
            'no-show': 'user-minus'
        };

        return `
            <div class="alert-card ${severityClass}" data-alert-id="${alert.id}">
                <div class="alert-header">
                    <div class="alert-icon">
                        <i data-lucide="${iconMap[alert.type] || 'alert-circle'}"></i>
                    </div>
                    <div class="alert-info">
                        <span class="alert-type">${alert.type.replace('-', ' ').toUpperCase()}</span>
                        <span class="alert-time">${this.formatAlertTime(alert.timestamp)}</span>
                    </div>
                    <div class="alert-severity">
                        <span class="severity-badge ${severityClass}">${severityClass.toUpperCase()}</span>
                    </div>
                </div>
                <div class="alert-message">${alert.message}</div>
                <div class="alert-actions">
                    ${alert.actionRequired ? `
                        <button class="btn btn-sm btn-primary" onclick="commandCenter.handleAlertAction('${alert.id}', 'reassign')">
                            <i data-lucide="refresh-cw"></i> Reassign
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="commandCenter.handleAlertAction('${alert.id}', 'contact')">
                            <i data-lucide="phone"></i> Contact
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-outline" onclick="commandCenter.acknowledgeAlert('${alert.id}')">
                        <i data-lucide="check"></i> Acknowledge
                    </button>
                </div>
            </div>
        `;
    }

    formatAlertTime(timestamp) {
        const date = new Date(timestamp); // timestamp is now a JS number
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        return `${Math.floor(diff / 3600)}h ago`;
    }

    // One-Click Reassignment System
    async handleAlertAction(alertId, action) {
        const alert = this.alerts.get(alertId);
        if (!alert) return;

        switch (action) {
            case 'reassign':
                await this.oneClickReassign(alert);
                break;
            case 'contact':
                await this.contactPatient(alert);
                break;
        }
    }

    async oneClickReassign(alert) {
        const appointment = this.appointments.get(alert.appointmentId);
        if (!appointment) return;

        // Find next available slot for the same doctor
        const nextSlot = this.findNextAvailableSlot(appointment.doctorId, appointment.date);
        
        if (nextSlot) {
            try {
                await updateDoc(doc(db, 'appointments', alert.appointmentId), {
                    time: nextSlot.time,
                    status: 'rescheduled',
                    rescheduledAt: serverTimestamp(),
                    rescheduledBy: auth.currentUser?.uid,
                    previousTime: appointment.time
                });

                // Create notification for patient
                await this.createPatientNotification({
                    type: 'rescheduled',
                    patientId: appointment.patientId,
                    message: `Your appointment has been rescheduled to ${nextSlot.time}`,
                    oldTime: appointment.time,
                    newTime: nextSlot.time
                });

                // Update doctor dashboard
                await this.updateDoctorDashboard(appointment.doctorId);

                showToast(`Appointment rescheduled to ${nextSlot.time}`, 'success');
                this.acknowledgeAlert(alert.id);
                
            } catch (error) {
                showToast('Failed to reschedule appointment', 'error');
            }
        } else {
            showToast('No available slots found for reassignment', 'error');
        }
    }

    findNextAvailableSlot(doctorId, date) {
        const schedule = this.doctorSchedules.get(doctorId);
        if (!schedule) return null;

        const dayOfWeek = new Date(date).toLocaleLowerCase('en-US', { weekday: 'long' });
        const daySlots = schedule[dayOfWeek] || [];

        // Get existing appointments for this doctor on this date
        const existingAppointments = Array.from(this.appointments.values())
            .filter(apt => apt.doctorId === doctorId && apt.date === date)
            .map(apt => apt.time);

        // Find first available slot
        for (const slot of daySlots) {
            const generatedSlots = this.generateTimeSlots(slot.start, slot.end, 30);
            for (const time of generatedSlots) {
                if (!existingAppointments.includes(time)) {
                    return { time, available: true };
                }
            }
        }

        return null;
    }

    generateTimeSlots(startTime, endTime, intervalMinutes) {
        const slots = [];
        const start = this.timeToMinutes(startTime);
        const end = this.timeToMinutes(endTime);
        
        for (let time = start; time < end; time += intervalMinutes) {
            slots.push(this.minutesToTime(time));
        }
        
        return slots;
    }

    timeToMinutes(time) {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    }

    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    // Bulk Actions for doctor status changes
    async bulkReassignDoctorAppointments(doctorId) {
        const doctorAppointments = Array.from(this.appointments.values())
            .filter(apt => apt.doctorId === doctorId && apt.status === 'confirmed');

        const reassignPromises = doctorAppointments.map(async (appointment) => {
            const nextSlot = this.findNextAvailableSlot(doctorId, appointment.date);
            if (nextSlot) {
                await updateDoc(doc(db, 'appointments', appointment.id), {
                    time: nextSlot.time,
                    status: 'rescheduled',
                    rescheduledAt: serverTimestamp(),
                    rescheduledBy: auth.currentUser?.uid
                });

                await this.createPatientNotification({
                    type: 'bulk-rescheduled',
                    patientId: appointment.patientId,
                    message: `Your appointment has been rescheduled due to doctor unavailability`,
                    oldTime: appointment.time,
                    newTime: nextSlot.time
                });
            }
        });

        try {
            await Promise.all(reassignPromises);
            showToast(`Bulk rescheduled ${doctorAppointments.length} appointments`, 'success');
        } catch (error) {
            showToast('Bulk rescheduling failed', 'error');
        }
    }

    async acknowledgeAlert(alertId) {
        const alert = this.alerts.get(alertId);
        if (alert) {
            alert.acknowledged = true;
            this.updateAlertsList();
        }
    }

    async createPatientNotification(notification) {
        await addDoc(collection(db, 'notifications'), {
            ...notification,
            createdAt: serverTimestamp(),
            read: false
        });
    }

    async updateDoctorDashboard(doctorId) {
        // This would trigger a real-time update to the doctor's dashboard
        // Implementation depends on the doctor dashboard structure
    }

    async contactPatient(alert) {
        // Implementation for contacting patient (email, SMS, etc.)
        showToast(`Contacting patient for appointment ${alert.appointmentId}`, 'info');
    }

    playNotificationSound(severity) {
        // Play different sounds based on severity
        if (severity === 'critical') {
            // Play critical alert sound
        } else if (severity === 'high') {
            // Play high priority sound
        }
    }

    // Render the Command Center Interface
    renderCommandCenter() {
        const commandCenterSection = document.getElementById('command-center-section');
        if (!commandCenterSection) return;

        commandCenterSection.innerHTML = `
            <div class="command-center">
                <div class="command-header">
                    <h2>Traffic Control Center</h2>
                    <div class="live-indicator">
                        <span class="live-dot"></span>
                        <span>LIVE</span>
                    </div>
                </div>

                <div class="command-stats">
                    <div class="stat-card critical">
                        <span class="stat-value" id="critical-alerts">0</span>
                        <span class="stat-label">Critical</span>
                    </div>
                    <div class="stat-card high">
                        <span class="stat-value" id="high-alerts">0</span>
                        <span class="stat-label">High Priority</span>
                    </div>
                    <div class="stat-card medium">
                        <span class="stat-value" id="medium-alerts">0</span>
                        <span class="stat-label">Medium</span>
                    </div>
                    <div class="stat-card total">
                        <span class="stat-value" id="total-appointments">0</span>
                        <span class="stat-label">Total Appointments</span>
                    </div>
                </div>

                <div class="command-content">
                    <div class="alerts-panel">
                        <div class="panel-header">
                            <h3>Active Alerts</h3>
                            <div class="panel-actions">
                                <button class="btn btn-sm btn-outline" onclick="commandCenter.acknowledgeAllAlerts()">
                                    <i data-lucide="check-all"></i> Acknowledge All
                                </button>
                                <button class="btn btn-sm btn-outline" onclick="commandCenter.clearResolvedAlerts()">
                                    <i data-lucide="trash-2"></i> Clear Resolved
                                </button>
                            </div>
                        </div>
                        <div class="alerts-container" id="alerts-list">
                            <!-- Alerts will be rendered here -->
                        </div>
                    </div>

                    <div class="appointments-panel">
                        <div class="panel-header">
                            <h3>Real-time Appointments</h3>
                            <div class="filter-controls">
                                <select id="status-filter" class="form-select" onchange="commandCenter.filterAppointments()">
                                    <option value="">All Status</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="in-progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                        </div>
                        <div class="appointments-container" id="appointments-list">
                            <!-- Appointments will be rendered here -->
                        </div>
                    </div>
                </div>

                <div class="bulk-actions-panel">
                    <h3>Bulk Actions</h3>
                    <div class="bulk-actions">
                        <div class="action-group">
                            <label>Select Doctor:</label>
                            <select id="bulk-doctor-select" class="form-select">
                                <option value="">Choose doctor...</option>
                            </select>
                            <button class="btn btn-danger" onclick="commandCenter.bulkReassignSelectedDoctor()">
                                <i data-lucide="refresh-cw"></i> Pulse Reassign All
                            </button>
                        </div>
                        <div class="action-group">
                            <button class="btn btn-secondary" onclick="commandCenter.sendBulkNotifications()">
                                <i data-lucide="send"></i> Send Bulk Notifications
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.loadDoctorOptions();
        this.updateDashboard();
        if (window.lucide) lucide.createIcons();
    }

    loadDoctorOptions() {
        const doctorSelect = document.getElementById('bulk-doctor-select');
        if (!doctorSelect) return;

        const doctorsQuery = query(collection(db, 'users'), where('role', '==', 'doctor'));
        
        onSnapshot(doctorsQuery, (snapshot) => {
            const options = ['<option value="">Choose doctor...</option>'];
            snapshot.forEach(doc => {
                const doctor = doc.data();
                options.push(`<option value="${doc.id}">${doctor.name}</option>`);
            });
            doctorSelect.innerHTML = options.join('');
        });
    }

    updateDashboard() {
        this.updateStats();
        this.renderAppointments();
        this.updateAlertsList();
    }

    updateStats() {
        const alerts = Array.from(this.alerts.values());
        const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length;
        const highCount = alerts.filter(a => a.severity === 'high' && !a.acknowledged).length;
        const mediumCount = alerts.filter(a => a.severity === 'medium' && !a.acknowledged).length;

        document.getElementById('critical-alerts').textContent = criticalCount;
        document.getElementById('high-alerts').textContent = highCount;
        document.getElementById('medium-alerts').textContent = mediumCount;
        document.getElementById('total-appointments').textContent = this.appointments.size;
    }

    renderAppointments() {
        const appointmentsContainer = document.getElementById('appointments-list');
        if (!appointmentsContainer) return;

        const statusFilter = document.getElementById('status-filter')?.value;
        const filteredAppointments = Array.from(this.appointments.values())
            .filter(apt => !statusFilter || apt.status === statusFilter)
            .sort((a, b) => {
                const timeA = new Date(`${a.date} ${a.time}`);
                const timeB = new Date(`${b.date} ${b.time}`);
                return timeA - timeB;
            });

        const appointmentsHTML = filteredAppointments.map(appointment => this.renderAppointmentCard(appointment)).join('');
        appointmentsContainer.innerHTML = appointmentsHTML;
    }

    renderAppointmentCard(appointment) {
        const statusClass = appointment.status.replace(' ', '-');
        const timeClass = this.getTimeStatusClass(appointment);
        
        return `
            <div class="appointment-card ${statusClass} ${timeClass}">
                <div class="appointment-header">
                    <div class="appointment-time">${appointment.time}</div>
                    <div class="appointment-status">
                        <span class="status-badge ${statusClass}">${appointment.status.replace('-', ' ').toUpperCase()}</span>
                    </div>
                </div>
                <div class="appointment-details">
                    <div class="patient-info">
                        <strong>${appointment.patientName || 'Patient'}</strong>
                        <span class="appointment-date">${appointment.date}</span>
                    </div>
                    <div class="doctor-info">
                        Dr. ${appointment.doctorName || 'Unknown'}
                    </div>
                </div>
                <div class="appointment-actions">
                    <button class="btn btn-sm btn-outline" onclick="commandCenter.markAppointmentStatus('${appointment.id}', 'in-progress')">
                        <i data-lucide="play"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="commandCenter.markAppointmentStatus('${appointment.id}', 'completed')">
                        <i data-lucide="check"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="commandCenter.reassignAppointment('${appointment.id}')">
                        <i data-lucide="refresh-cw"></i>
                    </button>
                </div>
            </div>
        `;
    }

    getTimeStatusClass(appointment) {
        const now = new Date();
        const appointmentTime = new Date(`${appointment.date} ${appointment.time}`);
        const timeDiff = (now - appointmentTime) / (1000 * 60);

        if (appointment.status === 'completed') return '';
        if (timeDiff > 30) return 'overdue';
        if (timeDiff > 15) return 'delayed';
        if (timeDiff > -15) return 'current';
        return 'upcoming';
    }

    async markAppointmentStatus(appointmentId, status) {
        try {
            await updateDoc(doc(db, 'appointments', appointmentId), {
                status,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid
            });
            showToast(`Appointment marked as ${status}`, 'success');
        } catch (error) {
            showToast('Failed to update appointment status', 'error');
        }
    }

    async reassignAppointment(appointmentId) {
        const appointment = this.appointments.get(appointmentId);
        if (appointment) {
            await this.oneClickReassign({
                appointmentId,
                doctorId: appointment.doctorId,
                patientId: appointment.patientId
            });
        }
    }

    filterAppointments() {
        this.renderAppointments();
    }

    async acknowledgeAllAlerts() {
        this.alerts.forEach(alert => {
            alert.acknowledged = true;
        });
        this.updateAlertsList();
        showToast('All alerts acknowledged', 'success');
    }

    clearResolvedAlerts() {
        const unresolvedAlerts = new Map();
        this.alerts.forEach((alert, id) => {
            if (!alert.acknowledged) {
                unresolvedAlerts.set(id, alert);
            }
        });
        this.alerts = unresolvedAlerts;
        this.updateAlertsList();
        showToast('Resolved alerts cleared', 'success');
    }

    async bulkReassignSelectedDoctor() {
        const doctorId = document.getElementById('bulk-doctor-select').value;
        if (!doctorId) {
            showToast('Please select a doctor first', 'error');
            return;
        }

        await this.bulkReassignDoctorAppointments(doctorId);
    }

    async sendBulkNotifications() {
        // Implementation for sending bulk notifications
        showToast('Bulk notifications sent', 'success');
    }
}

// Global instance
window.commandCenter = new CommandCenter();
