// Externalized small animation script from about.html
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const obs = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if(e.isIntersecting) { e.target.classList.add('in-view'); obs.unobserve(e.target); }
      });
    },{threshold:0.12});
    document.querySelectorAll('.glass-card').forEach(el=>{ el.classList.add('pre-animate'); obs.observe(el); });
  });
})();
