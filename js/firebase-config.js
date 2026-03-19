import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA_W3AnyT17siEgzqon65FjkgyTynFPJq4",
    authDomain: "ai-clinic-management-4acf5.firebaseapp.com",
    projectId: "ai-clinic-management-4acf5",
    storageBucket: "ai-clinic-management-4acf5.firebasestorage.app",
    messagingSenderId: "32883267644",
    appId: "1:32883267644:web:5695eb89de6ade5aa34b39"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

function showNetworkBanner(online) {
    let banner = document.getElementById('network-status-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'network-status-banner';
        banner.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
            padding: 10px 20px; text-align: center; font-size: 0.85rem;
            font-weight: 600; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
            transition: transform 0.3s ease, opacity 0.3s ease;
            display: flex; align-items: center; justify-content: center; gap: 8px;
        `;
        document.body.appendChild(banner);
    }

    if (online) {
        banner.style.background = '#dcfce7';
        banner.style.color = '#166534';
        banner.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Connected to CareSync servers`;
        banner.style.transform = 'translateY(0)';
        banner.style.opacity = '1';
        setTimeout(() => {
            banner.style.transform = 'translateY(-100%)';
            banner.style.opacity = '0';
        }, 3000);
    } else {
        banner.style.background = '#fef3c7';
        banner.style.color = '#92400e';
        banner.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Offline mode — showing cached data. Some features may be limited.`;
        banner.style.transform = 'translateY(0)';
        banner.style.opacity = '1';
    }
}

window.addEventListener('online', () => showNetworkBanner(true));
window.addEventListener('offline', () => showNetworkBanner(false));

if (!navigator.onLine) {
    document.addEventListener('DOMContentLoaded', () => showNetworkBanner(false));
}
