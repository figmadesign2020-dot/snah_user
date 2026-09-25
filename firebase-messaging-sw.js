importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
   apiKey: "AIzaSyDrCpFjk8qvASRYSs-YWsiFy3nMpAPP_zw",
       authDomain: "snah-efb34.firebaseapp.com",
       projectId: "snah-efb34",
       storageBucket: "snah-efb34.firebasestorage.app",
       messagingSenderId: "519504214960",
       appId: "1:519504214960:web:412c5d1a2afa463fa87475",
       measurementId: "G-2G8X36S9YX"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("Background message:", payload);

  const notificationTitle =
    payload.notification?.title || "New notification";

  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/icons/Icon-192.png",
  };

  self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});