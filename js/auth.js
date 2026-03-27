import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginLoader = document.getElementById('login-loader');

const _authToastMsgs = new Set();

function _dismissAuthToast(toast) {
    if (toast._dismissed) return;
    toast._dismissed = true;
    if (toast.dataset.msg) _authToastMsgs.delete(toast.dataset.msg);
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
}

function showToast(message, type = 'success') {
    // Deduplicate
    if (_authToastMsgs.has(message)) return;

    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    // Max 3 toasts
    const existing = toastContainer.querySelectorAll('.toast');
    if (existing.length >= 3) {
        existing[0]._dismissed = true;
        existing[0].classList.remove('show');
        setTimeout(() => existing[0].remove(), 400);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.dataset.msg = message;
    toast.style.cursor = 'pointer';
    toast.title = 'Click to dismiss';

    const iconName = type === 'success' ? 'check-circle-2' : type === 'info' ? 'info' : 'alert-circle';
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;

    _authToastMsgs.add(message);
    toastContainer.appendChild(toast);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: toast });
    }

    setTimeout(() => {
        toast.classList.add('show');
    }, 50);

    toast.addEventListener('click', () => _dismissAuthToast(toast));
    setTimeout(() => _dismissAuthToast(toast), 4000);
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (loginBtn && loginLoader) {
            const btnText = loginBtn.querySelector('.btn-text');
            const btnIcon = loginBtn.querySelector('.btn-icon');
            if (btnText) btnText.classList.add('hidden');
            if (btnIcon) btnIcon.classList.add('hidden');
            loginLoader.classList.remove('hidden');
            loginBtn.disabled = true;
        }

        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                const role = userData.role;

                localStorage.setItem('userRole', role);
                localStorage.setItem('userName', userData.name);

                if (role === 'admin') window.location.href = 'admin/dashboard.html';
                else if (role === 'doctor') window.location.href = 'doctor/dashboard.html';
                else if (role === 'receptionist') window.location.href = 'reception/dashboard.html';
                else if (role === 'patient') window.location.href = 'patient/dashboard.html';
                else if (loginBtn) resetLoginButton();
            } else {
                if (loginBtn) resetLoginButton();
            }
        } catch (error) {
            console.error("Error auto-redirecting:", error);
            if (loginBtn) resetLoginButton();
        }
    }
});

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showToast('Please enter both email and password', 'error');
            return;
        }

        const btnText = loginBtn.querySelector('.btn-text');
        const btnIcon = loginBtn.querySelector('.btn-icon');
        if (btnText) btnText.classList.add('hidden');
        if (btnIcon) btnIcon.classList.add('hidden');
        loginLoader.classList.remove('hidden');
        loginBtn.disabled = true;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                const role = userData.role;

                showToast('Login successful! Redirecting...', 'success');
                localStorage.setItem('userRole', role);
                localStorage.setItem('userName', userData.name);

                setTimeout(() => {
                    if (role === 'admin') window.location.href = 'admin/dashboard.html';
                    else if (role === 'doctor') window.location.href = 'doctor/dashboard.html';
                    else if (role === 'receptionist') window.location.href = 'reception/dashboard.html';
                    else if (role === 'patient') window.location.href = 'patient/dashboard.html';
                    else {
                        showToast('Invalid role assigned to user', 'error');
                        resetLoginButton();
                    }
                }, 1200);
            } else {
                showToast('User record not found. Contact administrator.', 'error');
                resetLoginButton();
            }
        } catch (error) {
            let errorMsg = 'Login failed. Please check your credentials.';
            if (
                error.code === 'auth/invalid-credential' ||
                error.code === 'auth/user-not-found' ||
                error.code === 'auth/wrong-password'
            ) {
                errorMsg = 'Invalid email or password. Please try again.';
            } else if (error.code === 'auth/too-many-requests') {
                errorMsg = 'Too many failed attempts. Please try again later.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMsg = 'Network error. Check your internet connection.';
            }
            showToast(errorMsg, 'error');
            resetLoginButton();
        }
    });
}

function resetLoginButton() {
    const btnText = loginBtn.querySelector('.btn-text');
    const btnIcon = loginBtn.querySelector('.btn-icon');
    if (btnText) btnText.classList.remove('hidden');
    if (btnIcon) btnIcon.classList.remove('hidden');
    loginLoader.classList.add('hidden');
    loginBtn.disabled = false;
}

// â”€â”€ Forgot Password Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let resendCooldownTimer = null;
let resendSecondsRemaining = 0;

window.openForgotPassword = () => {
    const modal = document.getElementById('forgot-password-modal');
    if (modal) {
        // Reset Cooldown if any
        if (resendCooldownTimer) {
            clearInterval(resendCooldownTimer);
            resendCooldownTimer = null;
        }
        resendSecondsRemaining = 0;

        // Reset UI to initial state
        document.getElementById('forgot-initial-state').style.display = 'block';
        document.getElementById('forgot-success-state').style.display = 'none';
        
        // Reset Buttons
        const sendBtn = document.getElementById('send-reset-btn');
        if (sendBtn) {
            sendBtn.innerHTML = `<i data-lucide="send" style="width:15px;height:15px;"></i> Send Reset Link`;
            sendBtn.disabled = false;
        }

        const resendBtn = document.getElementById('resend-reset-btn');
        const resendBtnText = document.getElementById('resend-btn-text');
        if (resendBtn && resendBtnText) {
            resendBtn.disabled = false;
            resendBtnText.textContent = "Resend Link";
        }

        modal.classList.add('active');
        
        const resetEmailInput = document.getElementById('reset-email');
        if (resetEmailInput && emailInput?.value) {
            resetEmailInput.value = emailInput.value;
        }
        if (resetEmailInput) resetEmailInput.focus();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

window.closeForgotPassword = () => {
    const modal = document.getElementById('forgot-password-modal');
    if (modal) modal.classList.remove('active');
    
    // Clear timer when modal is closed
    if (resendCooldownTimer) {
        clearInterval(resendCooldownTimer);
        resendCooldownTimer = null;
    }
};

/**
 * Sends password reset email and manages UI states
 * @param {boolean} isResend - Whether this is a resend attempt
 */
window.sendPasswordReset = async (isResend = false) => {
    const resetEmailInput = document.getElementById('reset-email');
    const sendBtn = document.getElementById(isResend ? 'resend-reset-btn' : 'send-reset-btn');
    const resendBtnText = document.getElementById('resend-btn-text');
    
    if (!resetEmailInput) return;
    
    const email = resetEmailInput.value.trim();
    if (!email) {
        showToast('Please enter your email address.', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Please enter a valid email address.', 'error');
        return;
    }

    // Handlers for loading states
    const originalContent = sendBtn.innerHTML;
    sendBtn.innerHTML = `<div class="loader-spinner" style="position:relative;left:auto;top:auto;margin:0;border-top-color:white;width:18px;height:18px;"></div> ${isResend ? 'Sending...' : 'Verifying...'}`;
    sendBtn.disabled = true;

    try {
        // Step 1: Check if email exists in our records
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showToast('This email is not registered in our system.', 'error');
            sendBtn.innerHTML = originalContent;
            sendBtn.disabled = false;
            return;
        }

        // Step 2: Proceed with Firebase Password Reset
        await sendPasswordResetEmail(auth, email);
        
        // Switch to Success State
        document.getElementById('forgot-initial-state').style.display = 'none';
        document.getElementById('forgot-success-state').style.display = 'block';
        document.getElementById('sent-email-display').textContent = email;
        
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Start Resend Cooldown
        startResendCooldown();
        
        const resetMessage = isResend ? 'Reset email resent.' : 'Reset link sent to your registered email.';
        showToast(resetMessage, 'success');

    } catch (error) {
        console.error("Reset Error:", error);
        let msg = 'Failed to send reset email. Please try again.';
        if (error.code === 'auth/invalid-email') {
            msg = 'Invalid email address format.';
        } else if (error.code === 'auth/too-many-requests') {
            msg = 'Too many requests. Please wait a few minutes.';
        }
        showToast(msg, 'error');
        sendBtn.innerHTML = originalContent;
        sendBtn.disabled = false;
    }
};

function startResendCooldown() {
    const resendBtn = document.getElementById('resend-reset-btn');
    const resendBtnText = document.getElementById('resend-btn-text');
    
    if (!resendBtn || !resendBtnText) return;

    resendSecondsRemaining = 60;
    resendBtn.disabled = true;
    
    if (resendCooldownTimer) clearInterval(resendCooldownTimer);

    resendCooldownTimer = setInterval(() => {
        resendSecondsRemaining--;
        if (resendSecondsRemaining <= 0) {
            clearInterval(resendCooldownTimer);
            resendCooldownTimer = null;
            resendBtn.disabled = false;
            resendBtnText.textContent = "Resend Link";
        } else {
            resendBtnText.textContent = `Resend in ${resendSecondsRemaining}s`;
        }
    }, 1000);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeForgotPassword?.();
    }
});
