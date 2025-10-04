// src/main.jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        // ако нов SW е готов веднага
        if (reg.waiting) {
          window.dispatchEvent(new CustomEvent("swUpdated", { detail: reg }));
        }
        // когато се появи нов SW
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent("swUpdated", { detail: reg }));
            }
          });
        });
        // по желание: периодична проверка
        setInterval(() => reg.update().catch(()=>{}), 60 * 60 * 1000);
      })
      .catch(console.error);

    // ако контролерът се смени (след SKIP_WAITING), презареди
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  });
}
