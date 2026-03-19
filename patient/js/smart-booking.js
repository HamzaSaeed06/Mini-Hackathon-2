import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { auth, db } from "../../js/firebase-config.js";


// Context-Aware Booking System
class SmartBookingSystem {
    constructor() {
        this.availableSlots = new Map();
        this.doctorSchedules = new Map();
        this.bookedAppointments = new Map();
        this.doctorCache = new Map(); // Cache for real doctor data
        this.selectedSpecialty = null;
        this.selectedDoctor = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadDoctors(); // Load real doctor data first
        this.loadDoctorSchedules();
        this.loadBookedAppointments();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.renderBookingInterface();
        });
    }

    // Load real doctor data into cache
    loadDoctors() {
        const doctorsQuery = query(collection(db, 'users'), where('role', '==', 'doctor'));
        onSnapshot(doctorsQuery, (snapshot) => {
            snapshot.forEach(d => {
                this.doctorCache.set(d.id, d.data());
            });
        });
    }

    // Load doctor schedules for context-aware booking
    loadDoctorSchedules() {
        const schedulesQuery = query(collection(db, 'doctorSchedules'));
        
        onSnapshot(schedulesQuery, (snapshot) => {
            snapshot.forEach(doc => {
                this.doctorSchedules.set(doc.id, doc.data());
            });
            this.updateAvailableSlots();
        });
    }

    // Load existing appointments to exclude booked slots
    loadBookedAppointments() {
        const appointmentsQuery = query(collection(db, 'appointments'));
        
        onSnapshot(appointmentsQuery, (snapshot) => {
            this.bookedAppointments.clear();
            snapshot.forEach(doc => {
                const appointment = doc.data();
                const key = `${appointment.doctorId}-${appointment.date}-${appointment.time}`;
                this.bookedAppointments.set(key, appointment);
            });
            this.updateAvailableSlots();
        });
    }

    // Calculate available slots based on doctor schedules and existing appointments
    updateAvailableSlots() {
        this.availableSlots.clear();
        
        this.doctorSchedules.forEach((schedule, doctorId) => {
            const weeklySlots = this.generateWeeklySlots(schedule, doctorId);
            this.availableSlots.set(doctorId, weeklySlots);
        });
        
        this.renderAvailableSlots();
    }

    generateWeeklySlots(schedule, doctorId) {
        const slots = {};
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        
        days.forEach(day => {
            const daySlots = schedule[day] || [];
            slots[day] = [];
            
            daySlots.forEach(timeSlot => {
                const generatedSlots = this.generateTimeSlots(
                    timeSlot.start, 
                    timeSlot.end, 
                    30 // 30-minute intervals
                );
                
                generatedSlots.forEach(time => {
                    const isBooked = this.isSlotBooked(doctorId, day, time);
                    if (!isBooked) {
                        slots[day].push({
                            time,
                            available: true,
                            doctorId,
                            energyLevel: this.getSlotEnergyLevel(time, schedule.energyLevel)
                        });
                    }
                });
            });
        });
        
        return slots;
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

    isSlotBooked(doctorId, day, time) {
        const today = new Date();
        const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(day);
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + ((dayIndex - today.getDay() + 7) % 7));
        
        const dateStr = targetDate.toISOString().split('T')[0];
        const key = `${doctorId}-${dateStr}-${time}`;
        return this.bookedAppointments.has(key);
    }

    getSlotEnergyLevel(time, doctorEnergyLevel) {
        const hour = parseInt(time.split(':')[0]);
        
        // Peak hours have higher energy
        if (hour >= 9 && hour <= 11) return 'Peak';
        if (hour >= 14 && hour <= 16) return 'High';
        if (hour >= 17 && hour <= 19) return 'Medium';
        return 'Low';
    }

    // Render the Context-Aware Booking Interface
    renderBookingInterface() {
        const bookingSection = document.getElementById('smart-booking-section');
        if (!bookingSection) return;

        bookingSection.innerHTML = `
            <div class="smart-booking-dashboard">
                <div class="booking-header">
                    <h2>Smart Appointment Booking</h2>
                    <div class="booking-stats">
                        <div class="stat-card">
                            <span class="stat-value" id="available-doctors">0</span>
                            <span class="stat-label">Available Doctors</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-value" id="total-available-slots">0</span>
                            <span class="stat-label">Available Slots</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-value" id="earliest-available">--:--</span>
                            <span class="stat-label">Earliest Available</span>
                        </div>
                    </div>
                </div>

                <div class="booking-content">
                    <div class="booking-filters">
                        <div class="filter-group">
                            <label for="specialty-select">Select Specialty</label>
                            <select id="specialty-select" class="form-select" onchange="smartBooking.filterBySpecialty()">
                                <option value="">All Specialties</option>
                                <option value="general">General Practice</option>
                                <option value="cardiology">Cardiology</option>
                                <option value="dermatology">Dermatology</option>
                                <option value="pediatrics">Pediatrics</option>
                                <option value="orthopedics">Orthopedics</option>
                                <option value="neurology">Neurology</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <label for="doctor-select">Select Doctor</label>
                            <select id="doctor-select" class="form-select" onchange="smartBooking.filterByDoctor()">
                                <option value="">All Doctors</option>
                            </select>
                        </div>

                        <div class="filter-group">
                            <label for="date-select">Select Date</label>
                            <input type="date" id="date-select" class="form-input" onchange="smartBooking.filterByDate()">
                        </div>
                    </div>

                    <div class="booking-results">
                        <div class="results-header">
                            <h3>Available Appointments</h3>
                            <div class="view-toggle">
                                <button class="btn btn-sm btn-outline active" data-view="calendar" onclick="smartBooking.toggleView('calendar')">
                                    <i data-lucide="calendar"></i> Calendar
                                </button>
                                <button class="btn btn-sm btn-outline" data-view="list" onclick="smartBooking.toggleView('list')">
                                    <i data-lucide="list"></i> List
                                </button>
                            </div>
                        </div>

                        <div class="smart-recommendation" id="smart-recommendation">
                            <!-- Smart recommendations will appear here -->
                        </div>

                        <div class="booking-view" id="calendar-view">
                            <div class="weekly-calendar" id="weekly-calendar">
                                <!-- Calendar view will be rendered here -->
                            </div>
                        </div>

                        <div class="booking-view hidden" id="list-view">
                            <div class="available-slots-list" id="available-slots-list">
                                <!-- List view will be rendered here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.loadDoctorOptions();
        this.setDefaultDate();
        this.renderAvailableSlots();
        this.updateBookingStats();
    }

    loadDoctorOptions() {
        const doctorSelect = document.getElementById('doctor-select');
        if (!doctorSelect) return;

        const doctorsQuery = query(collection(db, 'users'), where('role', '==', 'doctor'));
        
        onSnapshot(doctorsQuery, (snapshot) => {
            const options = ['<option value="">All Doctors</option>'];
            snapshot.forEach(doc => {
                const doctor = doc.data();
                options.push(`<option value="${doc.id}">${doctor.name} - ${doctor.specialty || 'General Practice'}</option>`);
            });
            doctorSelect.innerHTML = options.join('');
        });
    }

    setDefaultDate() {
        const dateSelect = document.getElementById('date-select');
        if (dateSelect) {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            dateSelect.min = today.toISOString().split('T')[0];
            dateSelect.value = tomorrow.toISOString().split('T')[0];
        }
    }

    renderAvailableSlots() {
        this.renderCalendarView();
        this.renderListView();
        this.generateSmartRecommendations();
    }

    renderCalendarView() {
        const calendarContainer = document.getElementById('weekly-calendar');
        if (!calendarContainer) return;

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

        const calendarHTML = days.map((day, index) => {
            const dayKey = dayKeys[index];
            const daySlots = this.getFilteredSlots(dayKey);
            
            return `
                <div class="calendar-day" data-day="${dayKey}">
                    <div class="day-header">
                        <h4>${day}</h4>
                        <span class="slot-count">${daySlots.length} slots</span>
                    </div>
                    <div class="day-slots">
                        ${daySlots.slice(0, 6).map(slot => this.renderSlotCard(slot)).join('')}
                        ${daySlots.length > 6 ? `
                            <button class="btn btn-sm btn-outline show-more" onclick="smartBooking.showMoreSlots('${dayKey}')">
                                +${daySlots.length - 6} more
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        calendarContainer.innerHTML = calendarHTML;
    }

    renderListView() {
        const listContainer = document.getElementById('available-slots-list');
        if (!listContainer) return;

        const allSlots = this.getAllFilteredSlots();
        const sortedSlots = allSlots.sort((a, b) => {
            if (a.time !== b.time) return a.time.localeCompare(b.time);
            return a.doctorName.localeCompare(b.doctorName);
        });

        const listHTML = sortedSlots.map(slot => this.renderSlotListItem(slot)).join('');
        listContainer.innerHTML = listHTML || '<p class="no-slots">No available slots found for the selected criteria.</p>';
    }

    renderSlotCard(slot) {
        const energyClass = slot.energyLevel.toLowerCase();
        const earliestClass = slot.isEarliest ? 'earliest' : '';
        
        return `
            <div class="slot-card ${energyClass} ${earliestClass}" onclick="smartBooking.selectSlot('${slot.doctorId}', '${slot.day}', '${slot.time}')">
                <div class="slot-time">${slot.time}</div>
                <div class="slot-doctor">${slot.doctorName}</div>
                <div class="slot-energy">${slot.energyLevel}</div>
                ${slot.isEarliest ? '<div class="earliest-badge">Earliest</div>' : ''}
            </div>
        `;
    }

    renderSlotListItem(slot) {
        const energyClass = slot.energyLevel.toLowerCase();
        const earliestClass = slot.isEarliest ? 'earliest' : '';
        
        return `
            <div class="slot-list-item ${energyClass} ${earliestClass}" onclick="smartBooking.selectSlot('${slot.doctorId}', '${slot.day}', '${slot.time}')">
                <div class="slot-info">
                    <div class="slot-primary">
                        <span class="slot-time">${slot.time}</span>
                        <span class="slot-doctor">${slot.doctorName}</span>
                        ${slot.isEarliest ? '<span class="earliest-badge">Earliest Available</span>' : ''}
                    </div>
                    <div class="slot-secondary">
                        <span class="slot-day">${slot.day}</span>
                        <span class="slot-specialty">${slot.specialty}</span>
                        <span class="slot-energy">${slot.energyLevel} Energy</span>
                    </div>
                </div>
                <div class="slot-action">
                    <button class="btn btn-sm btn-primary">Book Now</button>
                </div>
            </div>
        `;
    }

    getFilteredSlots(day) {
        const slots = [];
        
        this.availableSlots.forEach((daySlots, doctorId) => {
            const doctorData = this.getDoctorData(doctorId);
            const daySlotList = daySlots[day] || [];
            
            daySlotList.forEach(slot => {
                slots.push({
                    ...slot,
                    doctorId,
                    doctorName: doctorData.name,
                    specialty: doctorData.specialty || 'General Practice',
                    day: day.charAt(0).toUpperCase() + day.slice(1),
                    isEarliest: this.isEarliestAvailable(slot.time)
                });
            });
        });
        
        return slots.filter(slot => this.matchesFilters(slot));
    }

    getAllFilteredSlots() {
        const allSlots = [];
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        
        days.forEach(day => {
            allSlots.push(...this.getFilteredSlots(day));
        });
        
        return allSlots;
    }

    matchesFilters(slot) {
        const specialty = document.getElementById('specialty-select')?.value;
        const doctor = document.getElementById('doctor-select')?.value;
        
        if (specialty && slot.specialty.toLowerCase() !== specialty.toLowerCase()) {
            return false;
        }
        
        if (doctor && slot.doctorId !== doctor) {
            return false;
        }
        
        return true;
    }

    isEarliestAvailable(time) {
        const allTimes = this.getAllFilteredSlots().map(slot => slot.time);
        const sortedTimes = allTimes.sort();
        return sortedTimes[0] === time;
    }

    generateSmartRecommendations() {
        const recommendationContainer = document.getElementById('smart-recommendation');
        if (!recommendationContainer) return;

        const allSlots = this.getAllFilteredSlots();
        const earliestSlots = allSlots.filter(slot => slot.isEarliest).slice(0, 3);
        const highEnergySlots = allSlots.filter(slot => slot.energyLevel === 'High').slice(0, 3);

        const recommendationsHTML = `
            <div class="recommendation-section">
                <h4>Smart Recommendations</h4>
                <div class="recommendation-tabs">
                    <button class="tab-btn active" onclick="smartBooking.showRecommendation('earliest')">Earliest Available</button>
                    <button class="tab-btn" onclick="smartBooking.showRecommendation('energy')">High Energy</button>
                </div>
                <div class="recommendation-content">
                    <div class="recommendation-list" id="earliest-rec">
                        ${earliestSlots.map(slot => this.renderRecommendationCard(slot, 'earliest')).join('')}
                    </div>
                    <div class="recommendation-list hidden" id="energy-rec">
                        ${highEnergySlots.map(slot => this.renderRecommendationCard(slot, 'energy')).join('')}
                    </div>
                </div>
            </div>
        `;

        recommendationContainer.innerHTML = recommendationsHTML;
    }

    renderRecommendationCard(slot, type) {
        const badge = type === 'earliest' ? '⚡ Fastest' : '🔥 High Energy';
        return `
            <div class="recommendation-card" onclick="smartBooking.selectSlot('${slot.doctorId}', '${slot.day}', '${slot.time}')">
                <div class="rec-badge">${badge}</div>
                <div class="rec-time">${slot.time}</div>
                <div class="rec-doctor">${slot.doctorName}</div>
                <div class="rec-specialty">${slot.specialty}</div>
            </div>
        `;
    }

    async selectSlot(doctorId, day, time) {
        const doctorData = this.getDoctorData(doctorId);
        const appointmentData = {
            doctorId,
            doctorName: doctorData.name,
            patientId: auth.currentUser?.uid,
            patientName: auth.currentUser?.displayName || localStorage.getItem('userName') || 'Patient',
            date: this.getNextDateForDay(day),
            time,
            status: 'confirmed',
            createdAt: serverTimestamp(),
            bookingType: 'smart'
        };

        try {
            await addDoc(collection(db, 'appointments'), appointmentData);
            showToast('Appointment booked successfully!', 'success');
            this.updateAvailableSlots();
        } catch (error) {
            showToast('Failed to book appointment', 'error');
        }
    }

    getNextDateForDay(day) {
        const today = new Date();
        const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(day);
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + ((dayIndex - today.getDay() + 7) % 7));
        return targetDate.toISOString().split('T')[0];
    }

    getDoctorData(doctorId) {
        const cached = this.doctorCache.get(doctorId);
        return {
            name: cached?.name || `Dr. ${doctorId.substring(0, 5)}`,
            specialty: cached?.specialty || 'General Practice'
        };
    }

    filterBySpecialty() {
        this.renderAvailableSlots();
        this.updateBookingStats();
    }

    filterByDoctor() {
        this.renderAvailableSlots();
        this.updateBookingStats();
    }

    filterByDate() {
        this.renderAvailableSlots();
        this.updateBookingStats();
    }

    toggleView(view) {
        document.querySelectorAll('.view-toggle button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        document.getElementById('calendar-view').classList.toggle('hidden', view !== 'calendar');
        document.getElementById('list-view').classList.toggle('hidden', view !== 'list');
    }

    showRecommendation(type) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.toLowerCase().includes(type));
        });
        
        document.getElementById('earliest-rec').classList.toggle('hidden', type !== 'earliest');
        document.getElementById('energy-rec').classList.toggle('hidden', type !== 'energy');
    }

    showMoreSlots(day) {
        // Implementation for showing more slots
        console.log('Show more slots for:', day);
    }

    updateBookingStats() {
        const allSlots = this.getAllFilteredSlots();
        const availableDoctors = new Set(allSlots.map(slot => slot.doctorId)).size;
        const earliestSlot = allSlots.sort((a, b) => a.time.localeCompare(b.time))[0];
        
        document.getElementById('available-doctors').textContent = availableDoctors;
        document.getElementById('total-available-slots').textContent = allSlots.length;
        document.getElementById('earliest-available').textContent = earliestSlot?.time || '--:--';
    }
}

// Global instance
window.smartBooking = new SmartBookingSystem();
