import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { auth, db } from "../../js/firebase-config.js";
import { showToast } from "../../js/utils.js";


// Smart Scheduling System - Dynamic Core
class SmartSchedulingSystem {
    constructor() {
        this.doctorSchedules = new Map();
        this.shiftContainers = []; 
        this.clinicHours = { start: 8, end: 20 };
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadDoctorSchedules();
        await this.loadClinicSettingsAndSync();
    }

    setupEventListeners() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.renderSchedulingInterface();
                this.setupFormListeners();
            });
        } else {
            this.renderSchedulingInterface();
            this.setupFormListeners();
        }
    }

    setupFormListeners() {
        const shiftForm = document.getElementById('shift-config-form');
        const shiftModeSelect = document.getElementById('shift-mode-select');

        // Add a blank starting option
        if (shiftModeSelect && !shiftModeSelect.querySelector('option[value=""]')) {
            shiftModeSelect.insertAdjacentHTML('afterbegin', '<option value="">-- Choose Shift Mode --</option>');
            shiftModeSelect.value = '';
        }

        if (shiftForm) {
            shiftForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = shiftForm.querySelector('button[type="submit"]');
                const btnText = btn.querySelector('.btn-text');
                const originalText = btnText.innerHTML;
                const duration = parseInt(shiftModeSelect.value);
                if (!duration) {
                    showToast('Please select a shift mode first', 'error');
                    return;
                }
                
                try {
                    if (btn) {
                        btn.classList.add('loading');
                        btnText.textContent = 'Saving Settings...';
                    }
                    // Sync to Firestore
                    await setDoc(doc(db, 'clinic', 'settings'), { shiftMode: duration.toString() }, { merge: true });
                    
                    this.shiftContainers = duration === 12 
                        ? ['Day Shift (12h)', 'Night Shift (12h)'] 
                        : ['Morning Shift (8h)', 'Evening Shift (8h)', 'Night Shift (8h)'];
                    
                    this.initializeShiftContainers();
                    showToast('Clinic Shift Configuration saved.', 'success');
                } catch (err) {
                    showToast('Failed to save shift mode', 'error');
                } finally {
                    if (btn) {
                        btn.classList.remove('loading');
                        btnText.innerHTML = originalText;
                    }
                }
            });
        }
    }

    async loadClinicSettingsAndSync() {
        try {
            const snap = await getDoc(doc(db, 'clinic', 'settings'));
            if (snap.exists()) {
                const data = snap.data();
                const duration = parseInt(data.shiftMode || '0');
                
                if (duration) {
                    this.shiftContainers = duration === 12 
                        ? ['Day Shift (12h)', 'Night Shift (12h)'] 
                        : ['Morning Shift (8h)', 'Evening Shift (8h)', 'Night Shift (8h)'];
                    
                    // Update UI select if it exists
                    const modeSelect = document.getElementById('shift-mode-select');
                    if (modeSelect) modeSelect.value = duration.toString();
                }
            }
            // Always try to init containers (will show placeholder if empty)
            this.initializeShiftContainers();
        } catch (e) {
            console.error("Error loading clinic settings:", e);
            this.initializeShiftContainers();
        }
    }

    // Dynamic Core: Smart Scheduling with Active Energy
    async createDoctorSchedule(doctorId, scheduleData) {
        const scheduleRef = doc(db, 'doctorSchedules', doctorId);
        
        const schedule = {
            monday: scheduleData.monday || [],
            tuesday: scheduleData.tuesday || [],
            wednesday: scheduleData.wednesday || [],
            thursday: scheduleData.thursday || [],
            friday: scheduleData.friday || [],
            saturday: scheduleData.saturday || [],
            sunday: scheduleData.sunday || [],
            isActive: true,
            lastUpdated: serverTimestamp(),
            busyLevel: this.calculateBusyLevel(scheduleData)
        };

        await setDoc(scheduleRef, {
            doctorId,
            ...schedule,
            createdAt: serverTimestamp()
        });

        this.doctorSchedules.set(doctorId, schedule);
        return schedule;
    }

    calculateBusyLevel(scheduleData) {
        const totalSlots = Object.values(scheduleData).reduce((acc, day) => acc + (day?.length || 0), 0);
        if (totalSlots >= 20) return 'High';
        if (totalSlots >= 10) return 'Medium';
        return 'Low';
    }

    // Shift Orchestration: 8h/12h shifts for receptionists
    async assignReceptionistShift(receptionistId, shiftType, duration = 8) {
        const shiftRef = doc(db, 'receptionistShifts', receptionistId);
        
        const shiftAssignment = {
            receptionistId,
            shiftType, // 'Shift A', 'Shift B', 'Shift C'
            duration, // 8 or 12 hours
            startTime: this.getShiftStartTime(shiftType),
            endTime: this.getShiftEndTime(shiftType, duration),
            isActive: true,
            assignedAt: serverTimestamp(),
            clinicHours: this.clinicHours
        };

        await setDoc(shiftRef, shiftAssignment);
        return shiftAssignment;
    }

    getShiftStartTime(shiftType) {
        const shiftTimes = {
            'Shift A': 8, 'Shift B': 16, 'Shift C': 0, // Legacy fallbacks
            'Day Shift (12h)': 8,
            'Night Shift (12h)': 20, // 8 PM
            'Morning Shift (8h)': 8,
            'Evening Shift (8h)': 16, // 4 PM
            'Night Shift (8h)': 0 // 12 AM
        };
        return shiftTimes[shiftType] !== undefined ? shiftTimes[shiftType] : 8;
    }

    getShiftEndTime(shiftType, duration) {
        const startTime = this.getShiftStartTime(shiftType);
        return startTime + duration;
    }

    // Real-time monitoring of schedule changes
    loadDoctorSchedules() {
        const schedulesQuery = query(collection(db, 'doctorSchedules'));
        
        onSnapshot(schedulesQuery, (snapshot) => {
            snapshot.forEach(doc => {
                const schedule = doc.data();
                this.doctorSchedules.set(doc.id, schedule);
            });
            this.updateScheduleUI();
        });
    }

    // Initialize Shift Containers UI
    async initializeShiftContainers() {
        const shiftContainer = document.getElementById('shift-containers');
        if (!shiftContainer) return;

        if (this.shiftContainers.length === 0) {
            shiftContainer.innerHTML = `
                <div style="text-align:center; padding: 2rem; border: 1px dashed var(--border); border-radius: var(--radius-lg); color: var(--text-muted);">
                    <i data-lucide="clock" style="margin-bottom: 0.5rem; width: 32px; height: 32px; opacity: 0.5;"></i>
                    <p style="font-size: 0.9rem;">Please select 8 Hours or 12 Hours from "Shift Configuration" and click Save to generate shift slots.</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Fetch receptionists for dropdown
        const recReq = await getDocs(query(collection(db, 'users'), where('role', '==', 'receptionist'), where('status', '==', 'active')));
        let recOptions = '<option value="">Select Receptionist...</option>';
        recReq.forEach(doc => {
            recOptions += `<option value="${doc.id}">${doc.data().name}</option>`;
        });

        const containerHTML = this.shiftContainers.map(shift => `
            <div class="shift-container" data-shift="${shift}">
                <div class="shift-header">
                    <h3>${shift}</h3>
                    <span class="shift-time">${this.getShiftTimeRange(shift)}</span>
                    <div class="shift-status-indicator" id="${shift.replace(' ','-')}-status">
                        <span class="status-dot active"></span>
                        <span>Active</span>
                    </div>
                </div>
                
                <div class="doctor-selector" style="margin-bottom: 0.75rem;">
                    <select id="${shift.replace(' ','-')}-select" class="form-select" style="padding: 0.4rem 0.6rem; font-size: 0.8rem;">
                        ${recOptions}
                    </select>
                </div>
                
                <div class="shift-receptionists" id="${shift.replace(' ','-')}-receptionists">
                    <!-- Assigned Receptionists will be loaded here -->
                </div>
                <div class="shift-actions" style="margin-top: 0.75rem;">
                    <button class="btn btn-sm btn-primary" onclick="smartScheduling.assignReceptionistToShift('${shift}', this)">
                        <span class="btn-text"><i data-lucide="user-plus"></i> Assign</span>
                        <span class="btn-loader"></span>
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="smartScheduling.loadShiftAssignments('${shift}')">
                        <i data-lucide="eye"></i> View
                    </button>
                </div>
            </div>
        `).join('');

        shiftContainer.innerHTML = containerHTML;
        if (window.lucide) lucide.createIcons();
        
        // Auto-load assigned receptionists for each shift
        this.shiftContainers.forEach(shift => this.loadShiftAssignments(shift));
    }

    async assignReceptionistToShift(shiftType, btn) {
        const selectId = `${shiftType.replace(' ','-')}-select`;
        const receptionistId = document.getElementById(selectId).value;
        const durationSelect = document.getElementById('shift-mode-select');
        const duration = parseInt(durationSelect ? durationSelect.value : '8');
        
        if (!receptionistId) {
            showToast('Please select a receptionist first', 'error');
            return;
        }

        try {
            if (btn) {
                const btnText = btn.querySelector('.btn-text');
                btn.dataset.original = btnText.innerHTML;
                btnText.textContent = 'Assigning...';
                btn.classList.add('loading');
            }
            await this.assignReceptionistShift(receptionistId, shiftType, duration);
            showToast(`Receptionist assigned to ${shiftType}`, 'success');
            this.loadShiftAssignments(shiftType);
        } catch (error) {
            console.error(error);
            showToast('Failed to assign shift', 'error');
        } finally {
            if (btn) {
                btn.classList.remove('loading');
                btn.querySelector('.btn-text').innerHTML = btn.dataset.original;
            }
        }
    }

    async loadShiftAssignments(shiftType) {
        const listDiv = document.getElementById(`${shiftType.replace(' ','-')}-receptionists`);
        if (!listDiv) return;
        
        listDiv.innerHTML = '<span style="font-size:0.8rem;">Loading...</span>';
        
        const q = query(collection(db, 'receptionistShifts'), where('shiftType', '==', shiftType), where('isActive', '==', true));
        onSnapshot(q, async (snap) => {
            if (snap.empty) {
                listDiv.innerHTML = '<span style="color:var(--text-muted); font-size:0.8rem;">No receptionists assigned.</span>';
                return;
            }
            
            let html = '<div style="display:flex; flex-direction:column; gap:0.4rem;">';
            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                try {
                    const userDoc = await getDoc(doc(db, 'users', data.receptionistId));
                    if (userDoc.exists()) {
                        html += `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--background); padding:0.4rem 0.6rem; border-radius:var(--radius-sm); border:1px solid var(--border);">
                                <span style="font-size:0.85rem; font-weight:600;">${userDoc.data().name}</span>
                                <button class="btn-outline" style="padding:2px 5px; border:none; color:var(--danger);" onclick="smartScheduling.removeReceptionistShift('${data.receptionistId}')">
                                    <i data-lucide="x" style="width:14px; height:14px;"></i>
                                </button>
                            </div>
                        `;
                    }
                } catch(e){}
            }
            html += '</div>';
            listDiv.innerHTML = html;
            if (window.lucide) lucide.createIcons();
        });
    }

    async removeReceptionistShift(receptionistId) {
        try {
            await updateDoc(doc(db, 'receptionistShifts', receptionistId), { isActive: false });
            showToast('Receptionist removed from shift', 'success');
        } catch (error) {
            showToast('Failed to remove shift', 'error');
        }
    }

    getShiftTimeRange(shift) {
        const duration = parseInt(document.getElementById('shift-mode-select')?.value || '8');
        if (duration === 12) {
            const ranges12 = {
                'Day Shift (12h)': '8:00 AM - 8:00 PM',
                'Night Shift (12h)': '8:00 PM - 8:00 AM'
            };
            return ranges12[shift] || '8:00 AM - 8:00 PM';
        }

        const ranges8 = {
            'Morning Shift (8h)': '8:00 AM - 4:00 PM',
            'Evening Shift (8h)': '4:00 PM - 12:00 AM',
            'Night Shift (8h)': '12:00 AM - 8:00 AM'
        };
        return ranges8[shift] || '8:00 AM - 4:00 PM';
    }

    // Render the Smart Scheduling Interface
    renderSchedulingInterface() {
        const schedulingSection = document.getElementById('smart-scheduling-section');
        if (!schedulingSection) return;

        schedulingSection.innerHTML = `
            <div class="scheduling-dashboard">
                <div class="scheduling-header">
                    <h2>Dynamic Clinic Scheduling</h2>
                    <h3 class="stats-heading" style="margin-top: 1.5rem; margin-bottom: 1rem; font-size: 1rem; font-weight: 600; color: var(--text-main);"><i data-lucide="bar-chart-3" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px; color: var(--primary);"></i> Scheduling Insights</h3>
                    
                    <div class="scheduling-metrics-grid">
                        <div class="metric-card animate-in">
                            <div class="metric-header">
                                <span class="metric-title">Active Doctors</span>
                                <div class="metric-icon"><i data-lucide="users"></i></div>
                            </div>
                            <div class="metric-value" id="active-doctors">0</div>
                        </div>
                        <div class="metric-card animate-in">
                            <div class="metric-header">
                                <span class="metric-title">Available Slots</span>
                                <div class="metric-icon success"><i data-lucide="calendar-check"></i></div>
                            </div>
                            <div class="metric-value" id="total-slots">0</div>
                        </div>
                        <div class="metric-card animate-in">
                            <div class="metric-header">
                                <span class="metric-title">Shift Coverage</span>
                                <div class="metric-icon warning"><i data-lucide="activity"></i></div>
                            </div>
                            <div class="metric-value" id="shift-coverage">85%</div>
                        </div>
                    </div>
                </div>

                <div class="scheduling-content">
                    <div class="doctor-scheduling-panel">
                        <h3><i data-lucide="clock"></i> Doctor Schedule Configuration</h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Set the working hours for specific doctors. Patients will only be able to book within these slots.</p>
                        <div class="doctor-selector">
                            <select id="doctor-select" class="form-select">
                                <option value="">Select Doctor...</option>
                            </select>
                            <button class="btn btn-primary btn-sm" onclick="smartScheduling.loadDoctorSchedule()">
                                Load
                            </button>
                        </div>
                        
                        <div class="weekly-schedule" id="weekly-schedule">
                            <!-- Weekly schedule grid will be rendered here -->
                        </div>

                        <div class="schedule-actions">
                            <button class="btn btn-success" id="save-doc-schedule-btn" onclick="smartScheduling.saveDoctorSchedule(this)">
                                <span class="btn-text"><i data-lucide="save"></i> Save Schedule</span>
                                <span class="btn-loader"></span>
                            </button>
                            <button class="btn btn-secondary" onclick="smartScheduling.applyScheduleTemplate()">
                                <i data-lucide="copy"></i> Load 9-5 Template
                            </button>
                        </div>
                    </div>

                    <div class="shift-orchestration-panel">
                        <h3>Shift Orchestration</h3>
                        <div id="shift-containers">
                            <!-- Shift containers will be rendered here -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.loadDoctorOptions();
        this.initializeShiftContainers();
        this.updateSchedulingStats();
        if (window.lucide) lucide.createIcons();
    }

    async loadDoctorOptions() {
        const doctorSelect = document.getElementById('doctor-select');
        if (!doctorSelect) return;

        const doctorsQuery = query(collection(db, 'users'), where('role', '==', 'doctor'));
        
        onSnapshot(doctorsQuery, (snapshot) => {
            const options = ['<option value="">Select Doctor...</option>'];
            snapshot.forEach(doc => {
                const doctor = doc.data();
                options.push(`<option value="${doc.id}">${doctor.name}</option>`);
            });
            doctorSelect.innerHTML = options.join('');
        });
    }

    loadDoctorSchedule() {
        const doctorId = document.getElementById('doctor-select').value;
        if (!doctorId) return;

        const schedule = this.doctorSchedules.get(doctorId);
        this.renderWeeklySchedule(schedule || this.getDefaultSchedule());
    }

    getDefaultSchedule() {
        return {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: []
        };
    }

    renderWeeklySchedule(schedule) {
        const weeklySchedule = document.getElementById('weekly-schedule');
        if (!weeklySchedule) return;

        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        let col1HTML = '';
        let col2HTML = '';

        days.forEach((day, index) => {
            const dayHTML = `
                <div class="day-schedule" data-day="${day}">
                    <div class="day-header">
                        <h4>${dayNames[index]}</h4>
                        <div class="day-energy-indicator" id="${day}-energy">
                            <span class="energy-dot ${this.getDayBusyLevel(schedule[day]).toLowerCase()}"></span>
                            <span>${this.getDayBusyLevel(schedule[day])} Busy</span>
                        </div>
                    </div>
                    <div class="day-slots" id="${day}-slots">
                        ${(schedule[day] || []).map((slot, i) => {
                            const slotId = slot.id || `slot-${day}-${i}-${Date.now()}`;
                            return `
                                <div class="time-slot" data-day="${day}" data-id="${slotId}">
                                    <div class="slot-time">
                                        <input type="time" value="${slot.start}" class="time-input" data-field="start">
                                        <span>to</span>
                                        <input type="time" value="${slot.end}" class="time-input" data-field="end">
                                    </div>
                                    <button class="btn btn-sm btn-danger" onclick="smartScheduling.removeSlot('${day}', '${slotId}')" title="Remove Slot">
                                        <i data-lucide="trash-2"></i>
                                    </button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="smartScheduling.addSlot('${day}')">
                        <i data-lucide="plus"></i> Add Slot
                    </button>
                </div>
            `;
            
            if (index % 2 === 0) col1HTML += dayHTML;
            else col2HTML += dayHTML;
        });

        weeklySchedule.innerHTML = `
            <div class="schedule-column">${col1HTML}</div>
            <div class="schedule-column">${col2HTML}</div>
        `;

        if (window.lucide) {
            lucide.createIcons();
        }
        this.updateSchedulingStats();
    }

    getDayBusyLevel(slots) {
        if (!slots || slots.length === 0) return 'None';
        if (slots.length >= 3) return 'High';
        if (slots.length >= 2) return 'Medium';
        return 'Low';
    }

    updateDayBusyUI(day) {
        const daySlots = document.getElementById(`${day}-slots`);
        if (!daySlots) return;

        const slotCount = daySlots.children.length;
        const slotsArray = Array(slotCount).fill({}); // Dummy array to use existing getDayBusyLevel logic
        const level = this.getDayBusyLevel(slotsArray);
        const levelLower = level.toLowerCase();

        const indicatorContainer = document.getElementById(`${day}-energy`);
        if (indicatorContainer) {
            indicatorContainer.innerHTML = `
                <span class="energy-dot ${levelLower}"></span>
                <span>${level} Busy</span>
            `;
        }
        this.updateSchedulingStats();
    }

    addSlot(day) {
        const daySlots = document.getElementById(`${day}-slots`);
        const slotId = `slot-${day}-${Date.now()}`;

        const newSlot = document.createElement('div');
        newSlot.className = 'time-slot';
        newSlot.dataset.day = day;
        newSlot.dataset.id = slotId;
        
        newSlot.innerHTML = `
            <div class="slot-time">
                <input type="time" value="09:00" class="time-input" data-field="start">
                <span>to</span>
                <input type="time" value="17:00" class="time-input" data-field="end">
            </div>
            <button class="btn btn-sm btn-danger" onclick="smartScheduling.removeSlot('${day}', '${slotId}')" title="Remove Slot">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        
        daySlots.appendChild(newSlot);
        if (window.lucide) lucide.createIcons();
        this.updateDayBusyUI(day);
    }

    removeSlot(day, id) {
        const slot = document.querySelector(`.time-slot[data-day="${day}"][data-id="${id}"]`);
        if (slot) {
            slot.remove();
            this.updateDayBusyUI(day);
        }
    }

    async saveDoctorSchedule(btn) {
        if (btn && btn.classList.contains('loading')) return;

        const doctorId = document.getElementById('doctor-select').value;
        if (!doctorId) {
            showToast('Please select a doctor first', 'error');
            return;
        }

        const btnText = btn ? btn.querySelector('.btn-text') : null;
        // Store original content safely
        const originalHTML = btnText ? btnText.innerHTML : '';

        try {
            if (btn) {
                btnText.textContent = 'Saving Schedule...';
                btn.classList.add('loading');
                btn.disabled = true;
            }
            const schedule = this.collectScheduleFromUI();
            await this.createDoctorSchedule(doctorId, schedule);
            showToast('Doctor Schedule saved successfully!', 'success');
        } catch (e) {
            console.error(e);
            showToast('Failed to save schedule', 'error');
        } finally {
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
                if (btnText) {
                    btnText.innerHTML = originalHTML;
                    // Force icon re-init
                    if (window.lucide) lucide.createIcons();
                }
            }
        }
    }

    collectScheduleFromUI() {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const schedule = {};

        days.forEach(day => {
            const slots = document.querySelectorAll(`.time-slot[data-day="${day}"]`);
            schedule[day] = Array.from(slots).map(slot => {
                const startInput = slot.querySelector('[data-field="start"]');
                const endInput = slot.querySelector('[data-field="end"]');
                return {
                    start: startInput?.value || '09:00',
                    end: endInput?.value || '17:00'
                };
            });
        });

        return schedule;
    }

    applyScheduleTemplate() {
        const templateSchedule = {
            monday: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
            tuesday: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
            wednesday: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
            thursday: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
            friday: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
            saturday: [{ start: '09:00', end: '13:00' }],
            sunday: []
        };

        this.renderWeeklySchedule(templateSchedule);
        this.updateSchedulingStats();
        showToast('Standard 9-5 template applied. Please save to confirm.', 'success');
    }

    updateSchedulingStats() {
        const activeDoctorsEl = document.getElementById('active-doctors');
        const totalSlotsEl = document.getElementById('total-slots');
        const shiftCoverageEl = document.getElementById('shift-coverage');

        if (!activeDoctorsEl || !totalSlotsEl) return;

        const activeDoctors = this.doctorSchedules.size;
        const totalSlots = this.countSlotsInUI();

        activeDoctorsEl.textContent = activeDoctors;
        totalSlotsEl.textContent = totalSlots;
        if (shiftCoverageEl) shiftCoverageEl.textContent = '85%'; 
    }

    // New helper to count slots currently in UI across all days
    countSlotsInUI() {
        let total = 0;
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        days.forEach(day => {
            const slots = document.querySelectorAll(`.time-slot[data-day="${day}"]`);
            total += slots.length;
        });
        return total;
    }

    updateScheduleUI() {
        this.updateSchedulingStats();
    }
}

// Global instance
window.smartScheduling = new SmartSchedulingSystem();
