import { getApps, initializeApp } from 'firebase-admin/app';

// One Firebase app for Firestore and FCM.
if (!getApps().length) initializeApp();
