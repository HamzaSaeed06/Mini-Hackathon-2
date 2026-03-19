import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginLoader = document.getElementById('login-loader');

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconName = type === 'success' ? 'check-circle-2' : type === 'info' ? 'info' : 'alert-circle';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: toast });
    }

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
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

// ── Forgot Password Handler ──────────────────────────────────
window.openForgotPassword = () => {
    const modal = document.getElementById('forgot-password-modal');
    if (modal) {
        modal.classList.add('active');
        const resetEmailInput = document.getElementById('reset-email');
        if (resetEmailInput && emailInput?.value) {
            resetEmailInput.value = emailInput.value;
        }
        if (resetEmailInput) resetEmailInput.focus();
    }
};

window.closeForgotPassword = () => {
    const modal = document.getElementById('forgot-password-modal');
    if (modal) modal.classList.remove('active');
};

window.sendPasswordReset = async () => {
    const resetEmailInput = document.getElementById('reset-email');
    const sendBtn = document.getElementById('send-reset-btn');
    
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

    const originalText = sendBtn.innerHTML;
    sendBtn.innerHTML = `<div class="loader-spinner" style="position:relative;left:auto;top:auto;margin:0;border-top-color:white;width:18px;height:18px;"></div> Sending...`;
    sendBtn.disabled = true;

    try {
        await sendPasswordResetEmail(auth, email);
        // Firebase Email Enumeration Protection: sendPasswordResetEmail always
        // succeeds silently — it sends email only for registered accounts but
        // never reveals whether the address is registered or not. Always show
        // a generic success + spam guidance so the UX is correct either way.
        showToast('If this email is registered, a reset link has been sent. Check your inbox and spam folder.', 'success');
        window.closeForgotPassword();
        resetEmailInput.value = '';
    } catch (error) {
        let msg = 'Failed to send reset email. Please try again.';
        if (error.code === 'auth/invalid-email') {
            msg = 'Invalid email address format.';
        } else if (error.code === 'auth/too-many-requests') {
            msg = 'Too many requests. Please wait a few minutes before trying again.';
        } else if (error.code === 'auth/network-request-failed') {
            msg = 'Network error. Check your internet connection and try again.';
        }
        showToast(msg, 'error');
    } finally {
        sendBtn.innerHTML = originalText;
        sendBtn.disabled = false;
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeForgotPassword?.();
    }
});
