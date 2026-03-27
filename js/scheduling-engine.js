import { 
    collection, query, where, getDocs, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

/**
 * Advanced Scheduling Engine for Clinic Management
 * Handles doctor availability, slot generation, and conflict detection.
 */
class SchedulingEngine {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Get available slots for a doctor on a specific date.
     * @param {string} doctorId 
     * @param {string} date - YYYY-MM-DD
     * @returns {Promise<Array>} - Array of slot objects { time: 'HH:mm', available: boolean }
     */
    async getAvailableSlots(doctorId, date) {
        const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
        
        // 1. Get Doctor's Base Availability
        const availability = await this.getDoctorAvailability(doctorId, dayOfWeek);
        if (!availability || !availability.isActive) {
            return []; // Not working on this day
        }

        // 2. Get Existing Appointments
        const bookedSlots = await this.getBookedSlots(doctorId, date);

        // 3. Generate All Possible Slots
        const allSlots = this.generateSlots(
            availability.startTime, 
            availability.endTime, 
            availability.slotDuration || 30,
            availability.breakStart,
            availability.breakEnd
        );

        // 4. Mark Availability
        return allSlots.map(slot => ({
            time: slot,
            available: !bookedSlots.includes(slot)
        }));
    }

    /**
     * Fetch availability from Firestore
     */
    async getDoctorAvailability(doctorId, dayOfWeek) {
        const cacheKey = `${doctorId}-${dayOfWeek}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const q = query(
            collection(db, 'doctor_availability'), 
            where('doctorId', '==', doctorId),
            where('dayOfWeek', '==', dayOfWeek)
        );
        const snap = await getDocs(q);
        
        if (snap.empty) {
            // Check for default settings in user profile
            const userSnap = await getDoc(doc(db, 'users', doctorId));
            if (userSnap.exists()) {
                const data = userSnap.data();
                return {
                    isActive: true,
                    startTime: data.workingStart || '09:00',
                    endTime: data.workingEnd || '17:00',
                    slotDuration: data.slotDuration || 30
                };
            }
            return null;
        }

        const data = snap.docs[0].data();
        this.cache.set(cacheKey, data);
        return data;
    }

    /**
     * Fetch booked appointments
     */
    async getBookedSlots(doctorId, date) {
        const q = query(
            collection(db, 'appointments'),
            where('doctorId', '==', doctorId),
            where('date', '==', date),
            where('status', 'in', ['pending', 'confirmed', 'checked-in', 'in-consultation'])
        );
        const snap = await getDocs(q);
        return snap.docs.map(doc => doc.data().time);
    }

    /**
     * Helper to generate slots
     */
    generateSlots(start, end, duration, breakStart, breakEnd) {
        const slots = [];
        let current = this.timeToMinutes(start);
        const endTime = this.timeToMinutes(end);
        
        const bStart = breakStart ? this.timeToMinutes(breakStart) : null;
        const bEnd = breakEnd ? this.timeToMinutes(breakEnd) : null;

        while (current + duration <= endTime) {
            // Skip break time
            if (bStart !== null && bEnd !== null) {
                if (current >= bStart && current < bEnd) {
                    current = bEnd;
                    continue;
                }
            }

            slots.push(this.minutesToTime(current));
            current += duration;
        }
        return slots;
    }

    timeToMinutes(time) {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    }

    minutesToTime(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
}

export const schedulingEngine = new SchedulingEngine();
