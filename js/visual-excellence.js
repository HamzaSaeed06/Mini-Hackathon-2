// Visual Excellence System - Micro-interactions, Live Status Pips, Real-time Stats
class VisualExcellenceSystem {
    constructor() {
        this.liveStats = new Map();
        this.statusPips = new Map();
        this.animationQueue = [];
        this.isAnimating = false;
        this.init();
    }

    init() {
        this.setupMicroInteractions();
        this.initializeLiveStats();
        this.createStatusPips();
        this.initializeSmoothTransitions();
        this.setupParticleEffects();
    }

    // Micro-interactions system
    setupMicroInteractions() {
        // Button hover effects with ripple
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn') || e.target.closest('.btn')) {
                const button = e.target.classList.contains('btn') ? e.target : e.target.closest('.btn');
                this.createRippleEffect(button, e);
            }
        });

        // Card hover effects
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest('.metric-card, .appointment-card, .notification-item')) {
                this.addHoverEffect(e.target.closest('.metric-card, .appointment-card, .notification-item'));
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.closest('.metric-card, .appointment-card, .notification-item')) {
                this.removeHoverEffect(e.target.closest('.metric-card, .appointment-card, .notification-item'));
            }
        });

        // Smooth scroll behavior
        document.addEventListener('click', (e) => {
            if (e.target.hasAttribute('data-smooth-scroll')) {
                e.preventDefault();
                this.smoothScrollTo(e.target.getAttribute('data-smooth-scroll'));
            }
        });

        // Input focus effects
        document.addEventListener('focus', (e) => {
            if (e.target.matches('input, textarea, select')) {
                this.addInputFocusEffect(e.target);
            }
        }, true);

        document.addEventListener('blur', (e) => {
            if (e.target.matches('input, textarea, select')) {
                this.removeInputFocusEffect(e.target);
            }
        }, true);
    }

    createRippleEffect(button, event) {
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        
        button.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    addHoverEffect(element) {
        element.style.transform = 'translateY(-2px)';
        element.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
        element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    }

    removeHoverEffect(element) {
        element.style.transform = '';
        element.style.boxShadow = '';
    }

    addInputFocusEffect(input) {
        input.parentElement.classList.add('input-focused');
        this.createGlowEffect(input);
    }

    removeInputFocusEffect(input) {
        input.parentElement.classList.remove('input-focused');
        this.removeGlowEffect(input);
    }

    createGlowEffect(element) {
        element.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1), 0 0 20px rgba(59, 130, 246, 0.1)';
        element.style.transition = 'all 0.3s ease';
    }

    removeGlowEffect(element) {
        element.style.boxShadow = '';
    }

    smoothScrollTo(targetId) {
        const target = document.getElementById(targetId);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Live Status Pips
    createStatusPips() {
        const statusContainer = document.getElementById('live-status-pips');
        if (!statusContainer) return;

        const pips = [
            { id: 'patients', label: 'Patients', color: '#10b981', icon: 'users' },
            { id: 'appointments', label: 'Appointments', color: '#3b82f6', icon: 'calendar' },
            { id: 'doctors', label: 'Doctors', color: '#f59e0b', icon: 'user-check' },
            { id: 'receptionists', label: 'Reception', color: '#8b5cf6', icon: 'headphones' }
        ];

        const pipsHTML = pips.map(pip => `
            <div class="status-pip" data-type="${pip.id}">
                <div class="pip-indicator" style="background: ${pip.color}">
                    <div class="pip-pulse"></div>
                </div>
                <div class="pip-content">
                    <i data-lucide="${pip.icon}"></i>
                    <span class="pip-label">${pip.label}</span>
                    <span class="pip-count" id="${pip.id}-count">0</span>
                </div>
            </div>
        `).join('');

        statusContainer.innerHTML = pipsHTML;
        if (window.lucide) lucide.createIcons();

        // Initialize pip animations
        this.animateStatusPips();
    }

    animateStatusPips() {
        const pips = document.querySelectorAll('.status-pip');
        pips.forEach((pip, index) => {
            setTimeout(() => {
                pip.style.opacity = '1';
                pip.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }

    updateStatusPip(type, count, change = null) {
        const countElement = document.getElementById(`${type}-count`);
        if (!countElement) return;

        const currentCount = parseInt(countElement.textContent) || 0;
        
        if (change !== null) {
            this.animateNumberChange(countElement, currentCount, currentCount + change);
        } else {
            this.animateNumberChange(countElement, currentCount, count);
        }

        // Add pulse animation
        const pip = document.querySelector(`[data-type="${type}"]`);
        if (pip) {
            pip.classList.add('pip-updated');
            setTimeout(() => pip.classList.remove('pip-updated'), 1000);
        }
    }

    animateNumberChange(element, from, to) {
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = Math.floor(from + (to - from) * this.easeOutQuad(progress));
            element.textContent = current;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    easeOutQuad(t) {
        return t * (2 - t);
    }

    // Real-time Stats
    initializeLiveStats() {
        this.startRealtimeUpdates();
        this.initializeCounters();
        this.setupStatAnimations();
    }

    startRealtimeUpdates() {
        // Update stats every 5 seconds
        setInterval(() => {
            this.updateLiveStats();
        }, 5000);

        // Update critical stats every 2 seconds
        setInterval(() => {
            this.updateCriticalStats();
        }, 2000);
    }

    async updateLiveStats() {
        // Simulate real-time data updates
        const stats = {
            patients: Math.floor(Math.random() * 10) + 150,
            appointments: Math.floor(Math.random() * 5) + 45,
            doctors: Math.floor(Math.random() * 2) + 12,
            receptionists: Math.floor(Math.random() * 1) + 6
        };

        Object.entries(stats).forEach(([key, value]) => {
            this.updateStatusPip(key, value);
            this.updateMetricCard(key, value);
        });
    }

    updateCriticalStats() {
        // Update urgent metrics more frequently
        const criticalStats = {
            urgentAppointments: Math.floor(Math.random() * 3),
            waitingPatients: Math.floor(Math.random() * 8) + 5,
            availableDoctors: Math.floor(Math.random() * 2) + 8
        };

        Object.entries(criticalStats).forEach(([key, value]) => {
            this.updateCriticalMetric(key, value);
        });
    }

    updateMetricCard(type, value) {
        const card = document.querySelector(`[data-metric="${type}"]`);
        if (!card) return;

        const valueElement = card.querySelector('.metric-value');
        if (valueElement) {
            this.animateNumberChange(valueElement, parseInt(valueElement.textContent) || 0, value);
        }

        // Add update animation
        card.classList.add('metric-updated');
        setTimeout(() => card.classList.remove('metric-updated'), 1000);
    }

    updateCriticalMetric(type, value) {
        const element = document.getElementById(`critical-${type}`);
        if (element) {
            this.animateNumberChange(element, parseInt(element.textContent) || 0, value);
            
            // Add urgency animation if value is high
            if (value > 5) {
                element.parentElement.classList.add('urgent');
            }
        }
    }

    initializeCounters() {
        const counters = document.querySelectorAll('[data-counter]');
        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-counter'));
            this.animateCounter(counter, 0, target);
        });
    }

    animateCounter(element, from, to) {
        const duration = 2000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = Math.floor(from + (to - from) * this.easeOutQuad(progress));
            element.textContent = current.toLocaleString();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    setupStatAnimations() {
        // Intersection Observer for scroll animations
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.stat-card, .metric-card').forEach(card => {
            observer.observe(card);
        });
    }

    // Smooth Transitions
    initializeSmoothTransitions() {
        // Page transitions
        this.setupPageTransitions();
        
        // Modal transitions
        this.setupModalTransitions();
        
        // Navigation transitions
        this.setupNavigationTransitions();
    }

    setupPageTransitions() {
        // Add page transition class to body
        document.body.classList.add('page-transition-ready');
        
        // Handle navigation clicks
        document.addEventListener('click', (e) => {
            if (e.target.hasAttribute('data-navigate')) {
                e.preventDefault();
                this.navigateWithTransition(e.target.getAttribute('data-navigate'));
            }
        });
    }

    navigateWithTransition(url) {
        window.location.href = url;
    }

    setupModalTransitions() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.addEventListener('show', () => {
                modal.classList.add('modal-show');
            });
            
            modal.addEventListener('hide', () => {
                modal.classList.add('modal-hide');
                setTimeout(() => {
                    modal.classList.remove('modal-show', 'modal-hide');
                }, 300);
            });
        });
    }

    setupNavigationTransitions() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(nav => nav.classList.remove('nav-active'));
                item.classList.add('nav-active');
            });
        });
    }

    // Particle Effects
    setupParticleEffects() {
        this.createBackgroundParticles();
        this.createSuccessParticles();
        this.createErrorParticles();
    }

    createBackgroundParticles() {
        const canvas = document.createElement('canvas');
        canvas.id = 'particle-canvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '-1';
        canvas.style.opacity = '0.3';
        
        document.body.appendChild(canvas);
        
        this.animateParticles(canvas);
    }

    animateParticles(canvas) {
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        const particles = [];
        const particleCount = 50;
        
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1
            });
        }
        
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            particles.forEach(particle => {
                particle.x += particle.vx;
                particle.y += particle.vy;
                
                if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
                if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;
                
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
                ctx.fill();
            });
            
            requestAnimationFrame(animate);
        };
        
        animate();
        
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });
    }

    createSuccessParticles() {
        window.showSuccessParticles = (element) => {
            const rect = element.getBoundingClientRect();
            const particles = [];
            
            for (let i = 0; i < 20; i++) {
                const particle = document.createElement('div');
                particle.className = 'success-particle';
                particle.style.left = rect.left + rect.width / 2 + 'px';
                particle.style.top = rect.top + rect.height / 2 + 'px';
                particle.style.transform = `rotate(${Math.random() * 360}deg)`;
                
                document.body.appendChild(particle);
                particles.push(particle);
                
                setTimeout(() => {
                    particle.style.transform = `rotate(${Math.random() * 360}deg) translateX(${Math.random() * 100}px)`;
                    particle.style.opacity = '0';
                }, 10);
                
                setTimeout(() => {
                    particle.remove();
                }, 1000);
            }
        };
    }

    createErrorParticles() {
        window.showErrorParticles = (element) => {
            const rect = element.getBoundingClientRect();
            
            for (let i = 0; i < 10; i++) {
                const particle = document.createElement('div');
                particle.className = 'error-particle';
                particle.style.left = rect.left + rect.width / 2 + 'px';
                particle.style.top = rect.top + rect.height / 2 + 'px';
                
                document.body.appendChild(particle);
                
                setTimeout(() => {
                    particle.style.transform = `translateY(${Math.random() * 50 + 20}px)`;
                    particle.style.opacity = '0';
                }, 10);
                
                setTimeout(() => {
                    particle.remove();
                }, 800);
            }
        };
    }

    // Loading animations
    showLoadingState(element, message = 'Loading...') {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-message">${message}</div>
        `;
        
        element.style.position = 'relative';
        element.appendChild(loadingOverlay);
        
        return loadingOverlay;
    }

    hideLoadingState(element) {
        const loadingOverlay = element.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('loading-hide');
            setTimeout(() => {
                loadingOverlay.remove();
            }, 300);
        }
    }

    // Progress animations
    animateProgress(element, targetProgress) {
        const progressElement = element.querySelector('.progress-fill') || element;
        const currentProgress = parseFloat(progressElement.style.width) || 0;
        
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = currentProgress + (targetProgress - currentProgress) * this.easeOutQuad(progress);
            progressElement.style.width = current + '%';
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    // Chart animations
    animateChart(chartElement) {
        const bars = chartElement.querySelectorAll('.chart-bar');
        bars.forEach((bar, index) => {
            const height = bar.getAttribute('data-height') || bar.style.height;
            bar.style.height = '0';
            
            setTimeout(() => {
                bar.style.transition = 'height 0.5s ease-out';
                bar.style.height = height;
            }, index * 100);
        });
    }

    // Notification animations
    animateNotificationIn(notification) {
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';
        
        setTimeout(() => {
            notification.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 10);
    }

    animateNotificationOut(notification) {
        notification.style.transition = 'all 0.3s ease-in';
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';
        
        setTimeout(() => {
            notification.remove();
        }, 300);
    }
}

// Global instance
window.visualExcellence = new VisualExcellenceSystem();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.visualExcellence.init();
});
