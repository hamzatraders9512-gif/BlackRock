// Moved from inline script in dashboard.html to comply with CSP
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('affiliateBtn');
    const modal = document.getElementById('affiliateQrModal');
    const closeBtn = document.getElementById('closeAffiliateModal');
    const modalQrWrap = document.getElementById('modalQrCode');
    const modalLinkEl = document.getElementById('modalReferralLink');

    async function fetchAffiliateInfoForModal(){
      try{
        const res = await fetch('/api/affiliate/info', { credentials: 'include' });
        if(!res.ok) throw new Error('Fetch failed');
        const info = await res.json();
        const origin = window.location.origin;
        const link = info.referralLink || (origin + (info.referralCode ? (`/signup.html?ref=${info.referralCode}`) : '/signup.html'));
        return { info, link };
      }catch(e){ console.error('Affiliate fetch error', e); return null; }
    }

    function renderModalQR(link){
      if(!modalQrWrap) return;
      while (modalQrWrap.firstChild) modalQrWrap.removeChild(modalQrWrap.firstChild);
      if(window.QRCode){ new QRCode(modalQrWrap, { text: link, width: 180, height: 180, colorDark: '#0b2130', colorLight: '#ffffff00' }); }
      else { modalQrWrap.textContent = 'QR not available'; }
    }

    function openModal(){ if(!modal) return; modal.style.display = 'flex'; modal.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
    function closeModal(){ if(!modal) return; modal.style.display = 'none'; modal.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }

    async function openAffiliatePopup(){
      openModal();
      const payload = await fetchAffiliateInfoForModal();
      if(!payload){ modalLinkEl.textContent = 'Failed to load referral'; return; }
      modalLinkEl.textContent = payload.link;
      renderModalQR(payload.link);
    }

    if (btn) btn.addEventListener('click', function () { window.location.href = '/affiliate.html'; });
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modal) modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(); });

    const copyBtn = document.getElementById('copyModalRefBtn');
    if(copyBtn) copyBtn.addEventListener('click', async ()=>{
      const txt = modalLinkEl ? modalLinkEl.textContent : '';
      if(!txt) return;
      try{
        if(navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(txt);
        else { const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
        const msg = document.createElement('div'); msg.textContent='Copied'; msg.style.position='fixed'; msg.style.left='50%'; msg.style.top='12%'; msg.style.transform='translateX(-50%)'; msg.style.padding='6px 10px'; msg.style.borderRadius='6px'; msg.style.background='rgba(0,0,0,0.7)'; document.body.appendChild(msg); setTimeout(()=>msg.remove(),1500);
      }catch(e){ console.error(e); }
    });

    const shareBtn = document.getElementById('shareModalRefBtn');
    if(shareBtn) shareBtn.addEventListener('click', async ()=>{
      const url = modalLinkEl ? modalLinkEl.textContent : '';
      if(!url) return;
      try{ if(navigator.share) await navigator.share({ title: 'Join', text: 'Sign up with my referral', url }); else { if(navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(url); alert('Link copied for sharing'); } }catch(e){ console.error('Share failed', e); }
    });

    const dlBtn = document.getElementById('downloadModalQrBtn');
    if(dlBtn) dlBtn.addEventListener('click', (e)=>{ try{ e.preventDefault(); e.stopPropagation();
      try{
        const linkText = modalLinkEl ? modalLinkEl.textContent : '';
        if(!linkText){ alert('Referral link missing'); return; }
        const tmp = document.createElement('div'); tmp.style.position='fixed'; tmp.style.left='-9999px'; tmp.style.top='-9999px'; document.body.appendChild(tmp);
        if(window.QRCode){ new QRCode(tmp, { text: linkText, width: 320, height: 320, colorDark: '#000000', colorLight: '#ffffff' }); }
        setTimeout(()=>{
          try{
            const img = tmp.querySelector('img'); const canvas = tmp.querySelector('canvas');
            if(img && img.src){ const a=document.createElement('a'); a.href = img.src; a.download = 'referral-qr.png'; document.body.appendChild(a); a.click(); a.remove(); }
            else if(canvas){ const data = canvas.toDataURL('image/png'); const a=document.createElement('a'); a.href = data; a.download = 'referral-qr.png'; document.body.appendChild(a); a.click(); a.remove(); }
            else { alert('QR not available for download'); }
          }catch(e){ console.error('QR download error', e); alert('Failed to download QR'); }
          try{ while(tmp.firstChild) tmp.removeChild(tmp.firstChild); tmp.remove(); }catch(e){}
        }, 250);
      }catch(e){ console.error('download modal qr error', e); }
      }catch(er){ console.error(er); }
    });
  });
})();
