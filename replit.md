# CareSync AI - Clinic Management System

## Overview
A modern, responsive Clinic Management System with role-based access for Admins, Doctors, Receptionists, and Patients. Includes AI-assisted diagnostics and real-time data sync via Firebase Firestore.

## Tech Stack
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+ with ES Modules)
- **Backend/Database:** Firebase (Auth + Firestore) — loaded via CDN
- **Libraries (CDN):** Lucide Icons, Chart.js, qrcodejs, html2pdf.js
- **Server (dev):** `serve` (Node.js static file server)

## Project Structure
- `index.html` — Main login/entry page
- `index-pro.html` — Production landing page
- `patient-signup.html` — Patient signup
- `setup-admin.html` — Admin setup utility
- `admin/` — Admin portal (dashboard.html, js/, css/)
- `doctor/` — Doctor portal (dashboard.html, js/, css/)
- `patient/` — Patient portal (dashboard.html, js/, css/)
- `reception/` — Receptionist portal (dashboard.html, js/, css/)
- `js/` — Shared JS modules (firebase-config.js, auth.js, etc.)
- `css/` — Shared stylesheets

## Running the App
The app is served as a static site on port 5000 using `serve`.

**Workflow:** "Start application" — runs `serve -s . -l 5000`

## Deployment
Configured as a **static** deployment with `publicDir: "."`.

## Firebase Configuration
Firebase credentials are in `js/firebase-config.js`. Update with your Firebase project credentials before deploying.

## Key Features & Changes (Latest)

### Bug Fixes Applied (March 2026)
- **Dashboard Layout Fix:** Doctor, Patient, Reception dashboards had `<body class="bg-light-blue">` instead of `<body class="dashboard-layout bg-light-blue">` — this was breaking sidebar/content layout for all three portals
- **Firebase Offline Persistence:** `js/firebase-config.js` updated to use `initializeFirestore` with `persistentLocalCache` + `persistentMultipleTabManager` for IndexedDB offline caching — eliminates "client is offline" errors when Firestore WebSocket is slow
- **Network Status Banner:** Added automatic offline/online status indicator banner via firebase-config.js — shows yellow warning when offline, green success when reconnected
- **Visual Excellence CSS Fix:** `css/visual-excellence.css` had `.metric-card { opacity: 0 }` without an IntersectionObserver on non-admin portals — changed to `opacity: 1` by default, with `animate-ready` class for opt-in animation
- **Reception Navigation Title:** `reception/js/reception.js` nav click handler was getting `newTitle` but never setting `pageTitle.textContent` — fixed
- **onSnapshot Error Handlers:** All Firestore `onSnapshot` calls in doctor.js, patient.js, reception.js, admin.js now have proper error callbacks (no more uncaught offline errors)
- **Promise.allSettled:** admin.js `Promise.all(...)` changed to `Promise.allSettled(...)` — one failing Firebase call no longer crashes the entire admin dashboard init

### Original Features
- **Login Page:** Forgot password modal, show/hide password toggle, improved error handling
- **Patient Registration (Reception):** Firebase Auth account creation via REST API, default password `CareSync@123`, credentials display box, phone field
- **Doctor AI Assist:** 13+ condition symptom-keyword matching (flu, headache, BP, diabetes, etc.)
- **Prescription PDF:** Full professional A4 layout with colored header, patient info box, diagnosis box, medicine list, reference number, general instructions footer
- **saveDiagnosis:** Fetches appointment data for complete patient demographics in PDF, loading state on save button, diagnosisLogs written for admin analytics
- **Patient Appointment Cancellation:** Uses `updateDoc` to mark as `cancelled` (not deleted), custom confirm dialog, proper toast feedback
- **Patient AI Assistant:** Smart contextual responses using medical records data, 15+ intent patterns (fever, BP, diabetes, emergency, etc.), typing indicator animation
- **Status Pills:** `cancelled` and `scheduled` CSS styles added globally
- **Cloudinary:** Upload preset `Ai Clinic` on account `ds05q0lls`
