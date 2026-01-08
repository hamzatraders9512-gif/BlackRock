(function(){
  const KEY = 'br_theme_mode';
  const body = document.body;
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  function apply(mode) {
    if (mode === 'light') {
      body.classList.add('light-mode');
      btn.textContent = 'Dark Mode';
      btn.setAttribute('aria-pressed','true');
    } else {
      body.classList.remove('light-mode');
      btn.textContent = 'Light Mode';
      btn.setAttribute('aria-pressed','false');
    }
  }

  // Initialize from localStorage or prefers-color-scheme
  const stored = localStorage.getItem(KEY);
  if (stored === 'light' || stored === 'dark') {
    apply(stored === 'light' ? 'light' : 'dark');
  } else {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    apply(prefersLight ? 'light' : 'dark');
  }

  btn.addEventListener('click', function(){
    const isLight = body.classList.contains('light-mode');
    const next = isLight ? 'dark' : 'light';
    apply(next);
    localStorage.setItem(KEY, next);
  });
})();
