import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const signupForm = document.getElementById('patient-signup-form');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const signupBtn = document.getElementById('signup-btn');
const signupLoader = document.getElementById('signup-loader');

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconName = type === 'success' ? 'check-circle-2' : 'alert-circle';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!name || !email || !password || !confirmPassword) {
            return showToast('Please fill in all fields', 'error');
        }

        if (password !== confirmPassword) {
            return showToast('Passwords do not match', 'error');
        }

        if (password.length < 8) {
            return showToast('Password must be at least 8 characters', 'error');
        }

        const btnText = signupBtn.querySelector('.btn-text');
        const btnIcon = signupBtn.querySelector('.btn-icon');
        if (btnText) btnText.classList.add('hidden');
        if (btnIcon) btnIcon.classList.add('hidden');
        signupLoader.classList.remove('hidden');
        signupBtn.disabled = true;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Hardcode 'patient' role
            await setDoc(doc(db, 'users', user.uid), {
                id: user.uid,
                name: name,
                email: email,
                role: 'patient',
                createdAt: serverTimestamp()
            });

            showToast('Patient account created successfully!', 'success');

            localStorage.setItem('userRole', 'patient');
            localStorage.setItem('userName', name);

            setTimeout(() => {
                window.location.href = 'patient/dashboard.html';
            }, 1500);

        } catch (error) {
            let errorMsg = 'Failed to create account.';
            if (error.code === 'auth/email-already-in-use') errorMsg = 'Email is already registered.';
            if (error.code === 'auth/invalid-email') errorMsg = 'Invalid email format.';
            showToast(errorMsg, 'error');
            resetSignupButton();
        }
    });
}

function resetSignupButton() {
    const btnText = signupBtn.querySelector('.btn-text');
    const btnIcon = signupBtn.querySelector('.btn-icon');
    if (btnText) btnText.classList.remove('hidden');
    if (btnIcon) btnIcon.classList.remove('hidden');
    signupLoader.classList.add('hidden');
    signupBtn.disabled = false;
}
