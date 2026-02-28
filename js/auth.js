import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// DOM Elements
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginLoader = document.getElementById('login-loader');

// Toast Notification
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Using Lucide icons syntax inside toast
    const iconName = type === 'success' ? 'check-circle-2' : 'alert-circle';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    // Re-initialize icons for newly added elements
    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: toast });
    }

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// Handle Login
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showToast('Please enter both email and password', 'error');
            return;
        }

        // Show loader, hide text/icon
        const btnText = loginBtn.querySelector('.btn-text');
        const btnIcon = loginBtn.querySelector('.btn-icon');
        if (btnText) btnText.classList.add('hidden');
        if (btnIcon) btnIcon.classList.add('hidden');
        loginLoader.classList.remove('hidden');
        loginBtn.disabled = true;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Fetch user role from Firestore
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                const role = userData.role;

                showToast('Login successful! Redirecting...', 'success');
                localStorage.setItem('userRole', role);
                localStorage.setItem('userName', userData.name);

                // Redirect based on role
                setTimeout(() => {
                    if (role === 'admin') window.location.href = 'admin/dashboard.html';
                    else if (role === 'doctor') window.location.href = 'doctor/dashboard.html';
                    else if (role === 'receptionist') window.location.href = 'reception/dashboard.html';
                    else if (role === 'patient') window.location.href = 'patient/dashboard.html';
                    else {
                        showToast('Invalid role assigned to user', 'error');
                        resetLoginButton();
                    }
                }, 1500);
            } else {
                showToast('User record not found in database', 'error');
                resetLoginButton();
            }
        } catch (error) {
            let errorMsg = 'Login failed. Please try again.';
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorMsg = 'Invalid email or password';
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
