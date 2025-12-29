// Registers the service worker and handles beforeinstallprompt for install UX
(function(){
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => {
        console.log('Service Worker registered', reg);
      })
      .catch((err) => console.warn('SW registration failed', err));
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Optionally show a custom install button if your UI has one
    document.addEventListener('click', function onClickShowInstall(ev){
      const target = ev.target;
      if (target && (target.id === 'install-btn' || target.classList.contains('install-btn'))) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
      }
    });
  });
})();
