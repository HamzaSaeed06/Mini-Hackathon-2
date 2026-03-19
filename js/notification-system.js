import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";


// Unified Notification System - Patient Pivot & Doctor Sync
class NotificationSystem {
    constructor() {
        this.notifications = new Map();
        this.activeChannels = new Map();
        this.notificationQueue = [];
        this.pushSubscription = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadNotifications();
        this.initializePushNotifications();
        this.setupRealtimeSync();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.renderNotificationUI();
        });
    }

    // Load user notifications
    loadNotifications() {
        if (!auth.currentUser) return;

        const notificationsQuery = query(
            collection(db, 'notifications'),
            where('recipientId', '==', auth.currentUser.uid)
        );

        onSnapshot(notificationsQuery, (snapshot) => {
            snapshot.forEach(doc => {
                const notification = { id: doc.id, ...doc.data() };
                this.notifications.set(doc.id, notification);
            });
            this.updateNotificationUI();
            this.updateUnreadCount();
        });
    }

    // Initialize push notifications
    async initializePushNotifications() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array('your-vapid-public-key')
                });
                
                this.pushSubscription = subscription;
                await this.savePushSubscription(subscription);
            } catch (error) {
                console.log('Push notifications not available:', error);
            }
        }
    }

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        
        return outputArray;
    }

    async savePushSubscription(subscription) {
        if (!auth.currentUser) return;
        
        await setDoc(doc(db, 'pushSubscriptions', auth.currentUser.uid), {
            subscription,
            userId: auth.currentUser.uid,
            createdAt: serverTimestamp()
        });
    }

    // Create different types of notifications
    async createNotification(notificationData) {
        const notification = {
            ...notificationData,
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: serverTimestamp(),
            read: false,
            priority: notificationData.priority || 'normal'
        };

        // Save to Firestore
        await addDoc(collection(db, 'notifications'), notification);
        
        // Send push notification if available
        if (this.pushSubscription) {
            await this.sendPushNotification(notification);
        }

        // Show in-app notification
        this.showInAppNotification(notification);

        return notification;
    }

    // Patient Pivot - Rescheduling notifications
    async createPatientRescheduleNotification(appointmentData) {
        const notification = {
            type: 'appointment-rescheduled',
            recipientId: appointmentData.patientId,
            recipientType: 'patient',
            title: 'Appointment Rescheduled',
            message: `Your appointment with Dr. ${appointmentData.doctorName} has been rescheduled from ${appointmentData.oldTime} to ${appointmentData.newTime}`,
            data: {
                appointmentId: appointmentData.id,
                oldTime: appointmentData.oldTime,
                newTime: appointmentData.newTime,
                doctorName: appointmentData.doctorName,
                date: appointmentData.date
            },
            priority: 'high',
            actions: [
                { label: 'View Details', action: 'view-appointment' },
                { label: 'Confirm', action: 'confirm-reschedule' }
            ]
        };

        return await this.createNotification(notification);
    }

    // Doctor Sync - Real-time appointment updates
    async createDoctorSyncNotification(appointmentData) {
        const notification = {
            type: 'appointment-updated',
            recipientId: appointmentData.doctorId,
            recipientType: 'doctor',
            title: 'Schedule Update',
            message: `Appointment with ${appointmentData.patientName} has been ${appointmentData.status}`,
            data: {
                appointmentId: appointmentData.id,
                patientName: appointmentData.patientName,
                time: appointmentData.time,
                status: appointmentData.status,
                priority: appointmentData.priority || 'normal'
            },
            priority: appointmentData.priority === 'urgent' ? 'high' : 'normal',
            actions: [
                { label: 'View Schedule', action: 'view-schedule' }
            ]
        };

        return await this.createNotification(notification);
    }

    // Bulk notification for multiple patients
    async createBulkNotification(recipients, notificationData) {
        const promises = recipients.map(recipientId => 
            this.createNotification({
                ...notificationData,
                recipientId,
                bulkId: notificationData.bulkId || `bulk-${Date.now()}`
            })
        );

        return await Promise.all(promises);
    }

    // System notifications
    async createSystemNotification(message, severity = 'info') {
        const notification = {
            type: 'system',
            recipientId: 'all',
            recipientType: 'all',
            title: 'System Notification',
            message,
            severity,
            priority: severity === 'critical' ? 'high' : 'normal',
            data: { systemGenerated: true }
        };

        return await this.createNotification(notification);
    }

    // Send push notification
    async sendPushNotification(notification) {
        try {
            const response = await fetch('/api/send-push-notification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    notification: {
                        title: notification.title,
                        body: notification.message,
                        icon: '/icons/icon-192x192.png',
                        badge: '/icons/badge-72x72.png',
                        tag: notification.id,
                        data: notification.data,
                        actions: notification.actions
                    },
                    subscription: this.pushSubscription
                })
            });

            if (!response.ok) {
                throw new Error('Failed to send push notification');
            }
        } catch (error) {
            console.error('Push notification error:', error);
        }
    }

    // Show in-app notification
    showInAppNotification(notification) {
        const typeMap = {
            success: 'success',
            error: 'error',
            warning: 'warning',
            info: 'info',
            'new-appointment': 'info',
            'status-update': 'info',
            'system': 'warning'
        };
        const toastType = typeMap[notification.type] || 'info';

        const notificationEl = document.createElement('div');
        notificationEl.className = `toast toast-${toastType}`;
        notificationEl.id = `toast-${notification.id}`;
        
        notificationEl.innerHTML = `
            <div style="display:flex; align-items:center; gap:var(--space-4); width:100%;">
                ${this.getNotificationIcon(notification.type)}
                <div style="flex:1;">
                    <div style="font-weight:700; font-size:0.95rem; margin-bottom:2px;">${notification.title}</div>
                    <div style="font-size:0.85rem; color:var(--text-secondary); white-space:normal;">${notification.message}</div>
                </div>
                ${notification.actions ? `
                <div style="display:flex; gap:0.5rem;">
                    ${notification.actions.map(action => 
                        `<button class="btn btn-secondary" style="padding:0.25rem 0.75rem; font-size:0.75rem;" onclick="notificationSystem.handleNotificationAction('${notification.id}', '${action.action}')">${action.label}</button>`
                    ).join('')}
                </div>
                ` : ''}
                <button style="background:none; border:none; color:var(--text-tertiary); cursor:pointer; padding:0.25rem;" onclick="notificationSystem.closeNotification('${notification.id}')">
                    <i data-lucide="x" style="width:16px;height:16px;"></i>
                </button>
            </div>
        `;

        // Add to container
        const container = document.getElementById('toast-container') || this.createNotificationContainer();
        container.appendChild(notificationEl);
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: notificationEl });

        // Auto-remove after 5 seconds
        const timeoutId = setTimeout(() => {
            this.closeNotification(notification.id);
        }, 5000);
        
        // Store timeout to clear if manually closed
        notificationEl.dataset.timeoutId = timeoutId;

        // Animate in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => notificationEl.classList.add('show'));
        });
    }

    createNotificationContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    getNotificationIcon(type) {
        const icons = {
            'appointment-rescheduled': '<i data-lucide="calendar-clock"></i>',
            'appointment-updated': '<i data-lucide="refresh-cw"></i>',
            'appointment-cancelled': '<i data-lucide="calendar-x"></i>',
            'system': '<i data-lucide="info"></i>',
            'urgent': '<i data-lucide="alert-triangle"></i>',
            'reminder': '<i data-lucide="bell"></i>',
            'message': '<i data-lucide="message-circle"></i>'
        };
        return icons[type] || '<i data-lucide="bell"></i>';
    }

    // Close notification
    closeNotification(notificationId) {
        const notificationEl = document.getElementById(`toast-${notificationId}`);
        if (notificationEl) {
            // Clear auto-close timeout
            if (notificationEl.dataset.timeoutId) {
                clearTimeout(parseInt(notificationEl.dataset.timeoutId));
            }
            
            notificationEl.classList.remove('show');
            setTimeout(() => {
                notificationEl.remove();
            }, 500); // Wait for transition
        }
    }

    // Handle notification actions
    async handleNotificationAction(notificationId, action) {
        const notification = this.notifications.get(notificationId);
        if (!notification) return;

        // Mark as read
        await this.markAsRead(notificationId);

        // Handle specific actions
        switch (action) {
            case 'view-appointment':
                this.viewAppointment(notification.data.appointmentId);
                break;
            case 'confirm-reschedule':
                await this.confirmReschedule(notificationId);
                break;
            case 'view-schedule':
                this.viewSchedule(notification.recipientId);
                break;
            case 'contact-patient':
                this.contactPatient(notification.data.patientId);
                break;
        }

        this.closeNotification(notificationId);
    }

    async markAsRead(notificationId) {
        await updateDoc(doc(db, 'notifications', notificationId), {
            read: true,
            readAt: serverTimestamp()
        });
    }

    async markAllAsRead() {
        if (!auth.currentUser) return;

        const unreadNotifications = Array.from(this.notifications.values())
            .filter(notif => !notif.read && notif.recipientId === auth.currentUser.uid);

        const promises = unreadNotifications.map(notif => 
            updateDoc(doc(db, 'notifications', notif.id), {
                read: true,
                readAt: serverTimestamp()
            })
        );

        await Promise.all(promises);
        this.updateNotificationUI();
    }

    // Navigation actions
    viewAppointment(appointmentId) {
        // Navigate to appointment details
        window.location.href = `/appointment-details?id=${appointmentId}`;
    }

    viewSchedule(userId) {
        // Navigate to schedule view
        window.location.href = `/schedule?user=${userId}`;
    }

    contactPatient(patientId) {
        // Open contact modal or navigate to patient profile
        window.location.href = `/patient-profile?id=${patientId}`;
    }

    async confirmReschedule(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (!notification) return;

        // Update appointment status to confirmed
        await updateDoc(doc(db, 'appointments', notification.data.appointmentId), {
            status: 'confirmed',
            patientConfirmed: true,
            confirmedAt: serverTimestamp()
        });

        // Create confirmation notification for doctor
        await this.createDoctorSyncNotification({
            doctorId: notification.recipientId,
            patientName: 'Patient',
            status: 'confirmed by patient',
            priority: 'normal'
        });

        showToast('Reschedule confirmed', 'success');
    }

    // Real-time sync between patient and doctor dashboards
    setupRealtimeSync() {
        // Listen for appointment changes
        onSnapshot(collection(db, 'appointments'), (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                const appointment = { id: change.doc.id, ...change.doc.data() };

                if (change.type === 'modified') {
                    // Notify doctor of patient status changes
                    if (appointment.status === 'confirmed' && appointment.patientConfirmed) {
                        await this.createDoctorSyncNotification({
                            doctorId: appointment.doctorId,
                            patientName: appointment.patientName,
                            status: 'confirmed by patient',
                            time: appointment.time,
                            priority: 'normal'
                        });
                    }

                    // Notify patient of doctor status changes
                    if (appointment.status === 'in-progress' && !appointment.patientNotified) {
                        await this.createPatientRescheduleNotification({
                            patientId: appointment.patientId,
                            doctorName: appointment.doctorName,
                            status: 'in-progress',
                            message: 'Your appointment is now in progress'
                        });

                        // Mark that patient was notified
                        await updateDoc(doc(db, 'appointments', appointment.id), {
                            patientNotified: true
                        });
                    }
                }
            });
        });

        // Listen for doctor status changes
        onSnapshot(collection(db, 'users'), (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'modified') {
                    const user = change.doc.data();
                    
                    // If doctor becomes inactive, reschedule appointments
                    if (user.role === 'doctor' && user.status === 'inactive') {
                        await this.handleDoctorInactive(user.id);
                    }
                }
            });
        });
    }

    async handleDoctorInactive(doctorId) {
        // Get all confirmed appointments for this doctor
        const appointmentsQuery = query(
            collection(db, 'appointments'),
            where('doctorId', '==', doctorId),
            where('status', '==', 'confirmed')
        );

        const snapshot = await getDocs(appointmentsQuery);
        const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Create bulk notification for affected patients
        const patientNotifications = appointments.map(async (appointment) => {
            await this.createNotification({
                type: 'doctor-unavailable',
                recipientId: appointment.patientId,
                recipientType: 'patient',
                title: 'Doctor Unavailable',
                message: `Dr. ${appointment.doctorName} is now unavailable. Your appointment will be rescheduled.`,
                priority: 'high',
                data: {
                    appointmentId: appointment.id,
                    doctorName: appointment.doctorName
                }
            });
        });

        await Promise.all(patientNotifications);
    }

    // Render notification UI
    renderNotificationUI() {
        const notificationPanel = document.getElementById('notification-panel');
        if (!notificationPanel) return;

        notificationPanel.innerHTML = `
            <div class="notification-header">
                <h3>Notifications</h3>
                <div class="notification-controls">
                    <span class="unread-count" id="unread-count">0</span>
                    <button class="btn btn-sm btn-outline" onclick="notificationSystem.markAllAsRead()">
                        Mark all as read
                    </button>
                </div>
            </div>
            <div class="notification-list" id="notification-list">
                <!-- Notifications will be rendered here -->
            </div>
        `;

        this.updateNotificationUI();
    }

    updateNotificationUI() {
        const notificationList = document.getElementById('notification-list');
        if (!notificationList) return;

        if (!auth.currentUser) return;

        const userNotifications = Array.from(this.notifications.values())
            .filter(notif => notif.recipientId === auth.currentUser.uid || notif.recipientId === 'all')
            .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

        const notificationsHTML = userNotifications.map(notification => 
            this.renderNotificationItem(notification)
        ).join('');

        notificationList.innerHTML = notificationsHTML || '<p class="no-notifications">No notifications</p>';
        this.updateUnreadCount();

        if (window.lucide) lucide.createIcons();
    }

    renderNotificationItem(notification) {
        const isRead = notification.read;
        const priorityClass = notification.priority;

        return `
            <div class="notification-item ${isRead ? 'read' : 'unread'} ${priorityClass}" 
                 data-notification-id="${notification.id}"
                 onclick="notificationSystem.handleNotificationClick('${notification.id}')">
                <div class="notification-icon">
                    ${this.getNotificationIcon(notification.type)}
                </div>
                <div class="notification-content">
                    <div class="notification-header">
                        <span class="notification-title">${notification.title}</span>
                        <span class="notification-time">${this.formatTime(notification.createdAt)}</span>
                    </div>
                    <div class="notification-message">${notification.message}</div>
                    ${notification.actions ? `
                        <div class="notification-actions">
                            ${notification.actions.map(action => 
                                `<button class="notification-action-btn" onclick="event.stopPropagation(); notificationSystem.handleNotificationAction('${notification.id}', '${action.action}')">${action.label}</button>`
                            ).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="notification-status">
                    ${!isRead ? '<div class="unread-indicator"></div>' : ''}
                </div>
            </div>
        `;
    }

    formatTime(timestamp) {
        const date = timestamp.toDate();
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);

        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return date.toLocaleDateString();
    }

    updateUnreadCount() {
        if (!auth.currentUser) return;

        const unreadCount = Array.from(this.notifications.values())
            .filter(notif => !notif.read && notif.recipientId === auth.currentUser.uid)
            .length;

        const countElement = document.getElementById('unread-count');
        if (countElement) {
            countElement.textContent = unreadCount;
            countElement.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }

        // Update page title
        if (unreadCount > 0) {
            document.title = `(${unreadCount}) CareSync - Clinic Management`;
        } else {
            document.title = 'CareSync - Clinic Management';
        }
    }

    handleNotificationClick(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (notification && !notification.read) {
            this.markAsRead(notificationId);
        }
    }
}

// Global instance
window.notificationSystem = new NotificationSystem();
