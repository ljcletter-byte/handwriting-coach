// ── Firebase 데이터 관리 ──────────────────────────────────
let userData = {
  startDate: new Date().toISOString().split('T')[0],
  completedDays: {},
  journals: {}
};

function setSyncStatus(status) {
  const badge = document.getElementById('sync-badge');
  const text  = document.getElementById('sync-text');
  if (!badge) return;
  badge.className = 'sync-badge ' + status;
  text.textContent = status === 'syncing' ? '동기화 중...' : '동기화됨';
}

window.loadUserData = async function(uid) {
  try {
    setSyncStatus('syncing');
    const ref  = window._doc(window._db, 'users', uid);
    const snap = await window._getDoc(ref);
    if (snap.exists()) {
      userData = snap.data();
    } else {
      await window._setDoc(ref, userData);
    }
    setSyncStatus('synced');
  } catch(e) {
    console.error('데이터 로드 오류:', e);
    setSyncStatus('synced');
  }
};

async function saveUserData() {
  const user = window._currentUser;
  if (!user) return;
  try {
    setSyncStatus('syncing');
    const ref = window._doc(window._db, 'users', user.uid);
    await window._setDoc(ref, userData);
    setSyncStatus('synced');
  } catch(e) {
    console.error('저장 오류:', e);
  }
}

// ── 인증 ─────────────────────────────────────────────────
window.loginWithGoogle = async function() {
  const btn     = document.getElementById('btn-login');
  const loading = document.getElementById('login-loading');
  btn.style.display     = 'none';
  loading.style.display = 'block';
  try {
    // 팝업 방식 먼저 시도
    const provider = new window._GoogleAuthProvider();
    await window._signInWithPopup(window._auth, provider);
  } catch(e) {
    if (e.code === 'auth/popup-blocked' ||
        e.code === 'auth/popup-closed-by-user' ||
        e.code === 'auth/cancelled-popup-request') {
      // 팝업 차단 시 리디렉션 방식으로 전환
      try {
        const provider = new window._GoogleAuthProvider();
        await window._signInWithRedirect(window._auth, provider);
      } catch(e2) {
        console.error('redirect 오류:', e2);
        btn.style.display     = 'flex';
        loading.style.display = 'none';
        alert('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } else {
      console.error('로그인 오류:', e.code);
      btn.style.display     = 'flex';
      loading.style.display = 'none';
    }
  }
};

window.logout = async function() {
  if (confirm('로그아웃 하시겠습니까?')) {
    await window._signOut(window._auth);
  }
};

// ── 날짜 헬퍼 ─────────────────────────────────────────────
const today       = () => new Date().toISOString().split('T')[0];
const dayFromStart = () => {
  const d = Math.floor((new Date(today()) - new Date(userData.startDate)) / 864e5) + 1;
  return Math.min(Math.max(d, 1), 84);
};
const wkDay    = n => ({ w: Math.min(Math.ceil(n/7), 12), d: Math.min(((n-1)%7)+1, 7) });
const doneCount = () => Object.keys(userData.completedDays || {}).length;

// ── 탭 전환 ───────────────────────────────────────────────
window.switchTab = function(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  if (name === 'calendar') renderCalendar();
};

// ── 대시보드 ──────────────────────────────────────────────
function updateDash() {
  const n = dayFromStart(), {w} = wkDay(n), done = doneCount();
  document.getElementById('dash-week').textContent = w;
  document.getElementById('dash-day').textContent  = n;
  document.getElementById('dash-done').textContent = done;
  const pct = Math.round(done / 84 * 100);
  document.getElementById('pct-text').textContent = pct + '%';
  document.getElementById('progress-fill').style.width = pct + '%';
}

// ── 주차 탭 ───────────────────────────────────────────────
let selW = 1, selD = 1;

function initWeekTabs() {
  const c = document.getElementById('week-tabs');
  c.innerHTML = '';
  for (let w = 1; w <= 12; w++) {
    const b = document.createElement('button');
    b.className = 'week-tab' + (w === selW ? ' active' : '');
    b.textContent = w + '주차';
    b.onclick = () => { selW = w; selD = 1; initWeekTabs(); renderMission(); renderWorksheet(); };
    c.appendChild(b);
  }
}

// ── 미션 ─────────────────────────────────────────────────
function renderMission() {
  const mw = WEEKS[selW], md = mw.days[selD - 1];
  document.getElementById('mission-title').textContent = selW + '주차: ' + mw.title;
  document.getElementById('mission-badge').textContent = 'Day ' + ((selW-1)*7 + selD);
  document.getElementById('mission-body').innerHTML = `
    <div class="mission-part">
      <div class="part-badge part-1">Part 1 · 선긋기</div>
      <h3>${md.p1}</h3><p>${md.p1d}</p>
    </div>
    <div class="mission-part">
      <div class="part-badge part-2">Part 2 · 단어</div>
      <h3>${md.p2}</h3><p>${md.p2d}</p>
      <div class="example-box">${md.p2}</div>
    </div>
    <div class="mission-part">
      <div class="part-badge part-3">Part 3 · 문장</div>
      <h3>${md.p3}</h3><p>${md.p3d}</p>
      <div class="example-box">${md.p3}</div>
    </div>
    <div class="day-pills">
      ${[1,2,3,4,5,6,7].map(d =>
        `<button class="day-pill${d===selD?' active':''}" onclick="selDay(${d})">${d}일</button>`
      ).join('')}
    </div>`;
  renderWorksheet();
}
window.selDay = function(d) { selD = d; renderMission(); };

// ── 워크시트 안내 ─────────────────────────────────────────
function renderWorksheet() {
  const mw = WEEKS[selW], md = mw.days[selD - 1];
  const dn = (selW - 1) * 7 + selD;
  const g  = WORKSHEET_GUIDE;
  let html = `
    <div class="ws-intro">
      <div class="ws-intro-icon">${mw.theme}</div>
      <div>
        <div class="ws-day">${selW}주차 ${selD}일차 · Day ${dn} / 84</div>
        <div class="ws-theme">${mw.title}</div>
        <p>${g.intro}</p>
      </div>
    </div><div class="ws-sections">`;
  g.sections.forEach((sec, i) => {
    const content = i === 0 ? null : i === 1 ? md.p2 : md.p3;
    html += `
      <div class="ws-section" style="--sec-color:${sec.color}">
        <div class="ws-sec-header">
          <span class="ws-sec-icon">${sec.icon}</span>
          <span class="ws-sec-label">${sec.label}</span>
          <span class="ws-sec-title">${sec.title}</span>
        </div>
        ${content ? `<div class="ws-example">${content}</div>` : ''}
        <ol class="ws-steps">${sec.steps.map(s => `<li>${s}</li>`).join('')}</ol>
      </div>`;
  });
  html += `</div>
    <div class="ws-checklist">
      <div class="ws-check-title">✅ 오늘의 자가 점검</div>
      <div class="ws-checks">
        ${g.checklist.map(item => `
          <label class="ws-check-item">
            <input type="checkbox" onchange="checklistChange()">
            <span>${item}</span>
          </label>`).join('')}
      </div>
    </div>
    <div class="ws-print-tip">
      <span>💡</span>
      <span>이 화면을 보면서 A4 용지에 직접 연습하세요. Ctrl+P로 인쇄도 가능합니다.</span>
    </div>`;
  document.getElementById('worksheet-content').innerHTML = html;
}
window.checklistChange = function() {
  const checks = document.querySelectorAll('.ws-check-item input');
  if ([...checks].every(c => c.checked))
    document.querySelector('.ws-checklist').classList.add('all-done');
};

// ── 호흡 ─────────────────────────────────────────────────
let breathPhase = 'idle', breathCount = 0;
window.startBreath = function() {
  if (breathPhase !== 'idle') return;
  breathCount = 0;
  document.getElementById('breath-circle').classList.remove('pulse');
  doBreath();
};
function doBreath() {
  const c = document.getElementById('breath-circle');
  const p = document.getElementById('breath-phase');
  const s = document.getElementById('breath-sub');
  if (breathCount >= 3) {
    c.textContent = '완료 ✓'; p.textContent = '마음이 차분해졌나요?'; s.textContent = '연습을 시작해봐요';
    breathPhase = 'idle';
    setTimeout(() => { c.textContent = '다시'; c.classList.add('pulse'); }, 2500);
    return;
  }
  breathPhase = 'inhale';
  c.classList.add('inhale'); c.textContent = '들숨';
  p.textContent = '코로 천천히 들이쉬세요... (4초)';
  s.textContent = `${breathCount + 1} / 3 회`;
  setTimeout(() => {
    breathPhase = 'exhale'; c.classList.remove('inhale'); c.textContent = '날숨';
    p.textContent = '입으로 천천히 내쉬세요... (4초)';
    setTimeout(() => { breathCount++; doBreath(); }, 4000);
  }, 4000);
}

function setQuote() {
  document.getElementById('quote-text').innerHTML = QUOTES[dayFromStart() % QUOTES.length];
}

// ── 타이머 ────────────────────────────────────────────────
let tSec = 600, tRun = false, tIv = null;
const tFmt = s => String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
function tUpd() {
  document.getElementById('timer-display').textContent = tFmt(tSec);
  document.getElementById('timer-prog').style.width = (tSec/600*100) + '%';
  document.getElementById('timer-display').className = 'timer-display'
    + (tRun ? ' running' : '') + (tSec <= 60 && tSec > 0 ? ' warning' : '');
}
window.timerToggle = function() {
  if (tSec <= 0) return;
  if (tRun) {
    clearInterval(tIv); tRun = false;
    document.getElementById('btn-timer').textContent = '▶ 계속';
  } else {
    tRun = true; document.getElementById('btn-timer').textContent = '⏸ 일시정지';
    tIv = setInterval(() => {
      tSec--; tUpd();
      if (tSec <= 0) {
        clearInterval(tIv); tRun = false;
        document.getElementById('btn-timer').textContent = '▶ 시작';
        document.getElementById('timer-done').classList.add('show');
        beep();
      }
    }, 1000);
  }
  tUpd();
};
window.timerReset = function() {
  clearInterval(tIv); tRun = false; tSec = 600;
  document.getElementById('btn-timer').textContent = '▶ 시작';
  document.getElementById('timer-done').classList.remove('show');
  tUpd();
};
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, .25, .5].forEach(t => {
      const o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(.25, a.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.001, a.currentTime + t + .35);
      o.start(a.currentTime + t); o.stop(a.currentTime + t + .35);
    });
  } catch(e) {}
}

// ── 저널 ─────────────────────────────────────────────────
let uploadedImg = null;
document.getElementById('file-input').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  document.getElementById('upload-filename').textContent = f.name;
  const r = new FileReader();
  r.onload = ev => {
    uploadedImg = ev.target.result;
    const img = document.getElementById('upload-preview');
    img.src = ev.target.result; img.style.display = 'block';
  };
  r.readAsDataURL(f);
});

window.saveJournal = async function() {
  const t = today();
  if (!userData.journals)     userData.journals = {};
  if (!userData.completedDays) userData.completedDays = {};
  userData.journals[t] = {
    weakness: document.getElementById('weakness-input').value,
    feedback: document.getElementById('feedback-input').value,
    savedAt:  new Date().toISOString()
  };
  userData.completedDays[t] = true;
  await saveUserData();
  updateDash(); renderCalendar();
  const ok = document.getElementById('save-ok');
  ok.classList.add('show');
  setTimeout(() => ok.classList.remove('show'), 3000);
};

function loadJournal() {
  const t = today(), j = (userData.journals || {})[t] || {};
  if (j.weakness) document.getElementById('weakness-input').value = j.weakness;
  if (j.feedback) document.getElementById('feedback-input').value = j.feedback;
}

// ── AI 피드백 ─────────────────────────────────────────────
window.getAIFeedback = async function() {
  const weak = document.getElementById('weakness-input').value.trim();
  const mw = WEEKS[selW], md = mw.days[selD - 1], dn = (selW-1)*7 + selD;
  document.getElementById('ai-loading').classList.add('show');
  document.getElementById('ai-result').classList.remove('show');
  document.getElementById('btn-ai').disabled = true;
  try {
    const uc = [];
    if (uploadedImg) {
      const b = uploadedImg.split(',')[1];
      const mt = uploadedImg.split(';')[0].split(':')[1] || 'image/jpeg';
      uc.push({ type: 'image', source: { type: 'base64', media_type: mt, data: b } });
    }
    let pr = `당신은 한국어 손글씨 교정 전문 AI 코치입니다.\n현재 Day ${dn}/84 (${selW}주차 ${selD}일차), 주제: ${mw.title}\nPart 1: ${md.p1}\nPart 2: ${md.p2}\nPart 3: ${md.p3}`;
    if (weak) pr += `\n학습자가 발견한 불규칙 부분: ${weak}`;
    pr += uploadedImg
      ? '\n\n업로드된 글씨 사진을 분석해 피드백을 제공해주세요.'
      : '\n\n(사진 없음 — 오늘 미션 기반 일반 연습 포인트와 격려 메시지를 제공해주세요.)';
    pr += `\n\n다음 형식으로 300자 내외:\n✅ **잘한 점**: 1~2가지\n🔍 **개선 포인트**: 가장 중요한 1가지\n💡 **내일의 연습 팁**: 실천 가능한 1가지\n🌱 **응원 한마디**: 따뜻한 한 문장\n\n친근하고 격려적인 톤으로.`;
    uc.push({ type: 'text', text: pr });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: uc }] })
    });
    const data = await res.json();
    const txt = data.content.map(i => i.text || '').join('');
    document.getElementById('ai-result').innerHTML =
      txt.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    document.getElementById('ai-result').classList.add('show');
    document.getElementById('feedback-input').value = txt;
  } catch(err) {
    document.getElementById('ai-result').innerHTML = '피드백 요청 중 오류가 발생했습니다.';
    document.getElementById('ai-result').classList.add('show');
  }
  document.getElementById('ai-loading').classList.remove('show');
  document.getElementById('btn-ai').disabled = false;
};

// ── 캘린더 ────────────────────────────────────────────────
let calY = new Date().getFullYear(), calM = new Date().getMonth();
function renderCalendar() {
  const start = new Date(userData.startDate || today());
  const end   = new Date(start); end.setDate(end.getDate() + 83);
  document.getElementById('cal-title').textContent = calY + '년 ' + (calM+1) + '월';
  const first = new Date(calY, calM, 1), last = new Date(calY, calM+1, 0);
  const g = document.getElementById('cal-grid'); g.innerHTML = '';
  for (let i = 0; i < first.getDay(); i++) {
    const d = document.createElement('div'); d.className = 'cal-day empty'; g.appendChild(d);
  }
  for (let d = 1; d <= last.getDate(); d++) {
    const dt = new Date(calY, calM, d), ds = dt.toISOString().split('T')[0];
    const el = document.createElement('div'); el.textContent = d;
    const inC  = dt >= start && dt <= end;
    const isT  = ds === today();
    const isDone = (userData.completedDays || {})[ds];
    el.className = 'cal-day' + (isDone ? ' done' : isT ? ' today' : inC ? ' challenge' : '');
    g.appendChild(el);
  }
  document.getElementById('cal-done-count').textContent = doneCount();
}
window.calPrev = function() { if (calM===0){calY--;calM=11;}else calM--; renderCalendar(); };
window.calNext = function() { if (calM===11){calY++;calM=0;}else calM++; renderCalendar(); };

// ── 앱 초기화 ─────────────────────────────────────────────
window.initApp = function() {
  const n = dayFromStart(), {w, d} = wkDay(n);
  selW = w; selD = d;
  updateDash();
  initWeekTabs();
  renderMission();
  setQuote();
  loadJournal();
  renderCalendar();
  tUpd();
};
