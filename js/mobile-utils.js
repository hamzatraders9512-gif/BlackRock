// Small mobile utilities: adds a mobile nav toggle and collapses .desktop-only elements on small screens
(function(){
  function isSmall() { return window.innerWidth <= 800; }

  function init() {
    // Collapse desktop-only elements on small screens
    function updateDesktopOnly() {
      document.querySelectorAll('.desktop-only').forEach(function(el){
        if (isSmall()) el.classList.add('collapsed');
        else el.classList.remove('collapsed');
      });
    }

    // Add a floating nav toggle button if not present
    if (!document.getElementById('mobileNavToggle')) {
      var btn = document.createElement('button');
      btn.id = 'mobileNavToggle';
      btn.className = 'mobile-nav-toggle';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Toggle navigation');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg><span style="font-size:0.9rem;line-height:1">Menu</span>';

      btn.addEventListener('click', function(){
        var expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        document.body.classList.toggle('nav-open');

        // toggle visibility for elements marked as mobile-nav-target
        document.querySelectorAll('.mobile-nav-target').forEach(function(target){
          if (!expanded) target.classList.remove('collapsed');
          else target.classList.add('collapsed');
        });
      });

      document.body.appendChild(btn);
    }

    // ensure nav targets are collapsed initially on small screens
    document.querySelectorAll('.mobile-nav-target').forEach(function(t){
      if (isSmall()) t.classList.add('collapsed');
      else t.classList.remove('collapsed');
    });

    updateDesktopOnly();

    window.addEventListener('resize', function(){
      updateDesktopOnly();
      document.querySelectorAll('.mobile-nav-target').forEach(function(t){
        if (isSmall()) t.classList.add('collapsed');
        else t.classList.remove('collapsed');
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
