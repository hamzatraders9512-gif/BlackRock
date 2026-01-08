// Externalized from test.html
/* Level logic and referral utilities */
document.addEventListener('DOMContentLoaded', () => {
  const totalReferrals = 28;
  let level = "Silver", reward = 5, progress = (totalReferrals/10)*100, iconClass="silver", info="0–10 referrals";

  if(totalReferrals>10 && totalReferrals<=25){ level="Gold"; reward=7; progress=((totalReferrals-10)/15)*100; iconClass="gold"; info="11–25 referrals"; }
  if(totalReferrals>25){ level="Platinum"; reward=10; progress=100; iconClass="platinum"; info="26+ referrals"; }

  const rewardEl = document.getElementById("rewardValue"); if (rewardEl) rewardEl.innerText = `$${reward}`;
  const levelNameEl = document.getElementById("levelName"); if (levelNameEl) levelNameEl.innerText = level;
  const levelInfoEl = document.getElementById("levelInfo"); if (levelInfoEl) levelInfoEl.innerText = info;
  const progressBar = document.getElementById("progressBar"); if (progressBar) progressBar.style.width = progress+"%";

  const icon = document.getElementById("levelIcon"); if (icon) { icon.classList.add(iconClass); icon.innerText = level==="Silver"?"⬤":level==="Gold"?"◆":"⬟"; }

  // Copy & Share handlers
  function copyLink(){
    const ref = document.getElementById("refLink"); if (!ref) return; navigator.clipboard.writeText(ref.value).then(()=>alert("Referral link copied!"));
  }

  function shareLink(){
    const ref = document.getElementById("refLink"); if (!ref) return;
    const link = ref.value;
    if(navigator.share){
      navigator.share({title:"Join My Affiliate Program", text:"Use my referral link:", url:link}).catch(()=>{});
    } else {
      alert("Sharing not supported. Link copied to clipboard!");
      navigator.clipboard.writeText(link);
    }
  }

  function downloadQR(){
    const ref = document.getElementById("refLink"); if (!ref) return;
    const link = ref.value;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(link)}`;
    const a = document.createElement('a'); a.href = qrUrl; a.download = 'referral-qr.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // Attach to UI buttons (replaces inline onclick attributes)
  const copyBtn = document.getElementById('copyBtn'); if (copyBtn) copyBtn.addEventListener('click', copyLink);
  const shareBtn = document.getElementById('shareBtn'); if (shareBtn) shareBtn.addEventListener('click', shareLink);
  const qrBtn = document.getElementById('qrBtn'); if (qrBtn) qrBtn.addEventListener('click', downloadQR);

  // Chart initialization (keeps original Chart.js usage)
  try {
    const ctx = document.getElementById("refChart");
    if (ctx && window.Chart) {
      const chartCtx = ctx.getContext('2d');
      new Chart(chartCtx, {
        type: 'line',
        data: {
          labels: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"],
          datasets:[{ label:"Daily Registrations", data:[1,0,2,1,0,3,2,1,4,2,3,0,1,2,2,1,3,0,1,2,2,1,2,3,0,1,2,1,3,2], borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.2)", tension: 0.3, fill:true, pointRadius:3, pointHoverRadius:6 }]
        },
        options:{ responsive:true, plugins:{legend:{labels:{color:"#9a9a9a"}}}, scales:{ x:{ ticks:{ color:"#9a9a9a" }, grid:{ color:"rgba(255,255,255,0.05)"} }, y:{ ticks:{ color:"#9a9a9a" }, grid:{ color:"rgba(255,255,255,0.05)"} } }
      });
    }
  } catch (e) { console.error('Chart init failed', e); }
});
