// ── 날짜 헬퍼 (시간대 안전) ────────────────────────────────
// toISOString()은 UTC 기준이라 한국에서 자정 직후에 하루 어긋날 수 있어 직접 포맷합니다.
const ymd = d => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const today = () => ymd(new Date());

// ── Firebase 데이터 관리 ──────────────────────────────────
let userData = {
  startDate: today(),
  completedDays: {},
  journals: {},
  practiceSeconds: {}  // { "2026-06-30": 720, "2026-07-01": 645, ... } — 날짜별 연습 초
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

// ── 진행 초기화 ───────────────────────────────────────────
// 완료 일수, 일지, 시작일을 모두 초기화하여 Day 1부터 다시 시작합니다.
// 실수 방지를 위해 두 단계 확인을 거칩니다.
window.resetProgress = async function() {
  if (!confirm('⚠️ 정말 처음부터 다시 시작하시겠습니까?\n\n지금까지의 완료 일수, 일지, 스탬프가 모두 삭제되고 오늘이 Day 1이 됩니다.\n(이 작업은 되돌릴 수 없습니다)')) return;
  if (!confirm('한 번 더 확인합니다.\n정말 초기화하시겠습니까?')) return;
  userData = { startDate: today(), completedDays: {}, journals: {}, practiceSeconds: {} };
  await saveUserData();
  // 스톱워치/타이머도 초기화
  clearInterval(tIv); tIv = null; tRun = false;
  clearInterval(swIv); swIv = null;
  tSec = 600; swSec = 0;
  document.getElementById('btn-timer').textContent = '▶ 시작';
  document.getElementById('timer-done').classList.remove('show');
  tUpd(); swUpd(); practiceUpd();
  // 화면 초기화
  document.getElementById('weakness-input').value = '';
  document.getElementById('feedback-input').value = '';
  const preview = document.getElementById('upload-preview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; preview.classList.add('collapsed'); }
  uploadedImg = null;
  uploadedThumb = null;
  const hint = document.getElementById('upload-preview-hint');
  if (hint) hint.classList.remove('show');
  const ai = document.getElementById('ai-result');
  if (ai) { ai.innerHTML = ''; ai.classList.remove('show'); }
  const n = dayFromStart(), { w, d } = wkDay(n);
  selW = w; selD = d;
  updateDash();
  initWeekTabs();
  renderMission();
  renderCalendar();
  alert('✅ 초기화 완료! 오늘부터 Day 1입니다.');
};

// ── 날짜 헬퍼 (계속) ─────────────────────────────────────
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

// ── 타이머 + 스톱워치 ────────────────────────────────────
// 타이머: 10분 카운트다운 (기존)
// 스톱워치: 실제 연습 시간을 초 단위로 누적 측정 (신규)
// 시작 버튼을 누르면 둘 다 함께 시작됩니다.
// 타이머가 0에 도달해도 스톱워치는 계속 진행됩니다.
// 일시정지·초기화 버튼도 두 기능을 함께 제어합니다.
// 초기화 또는 저장 시, 스톱워치 시간이 오늘의 practiceSeconds에 자동 누적됩니다.
let tSec = 600, tRun = false, tIv = null;
let swSec = 0, swIv = null;

const tFmt = s => String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
const swFmt = s => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

function tUpd() {
  document.getElementById('timer-display').textContent = tFmt(tSec);
  document.getElementById('timer-prog').style.width = (tSec/600*100) + '%';
  document.getElementById('timer-display').className = 'timer-display'
    + (tRun ? ' running' : '') + (tSec <= 60 && tSec > 0 ? ' warning' : '');
}
function swUpd() {
  const el = document.getElementById('stopwatch-display');
  if (el) el.textContent = swFmt(swSec);
}
function practiceUpd() {
  const t = today();
  const ps = userData.practiceSeconds || {};
  const todaySec = (ps[t] || 0) + swSec;
  const totalSec = Object.values(ps).reduce((a, b) => a + b, 0) + swSec;
  // 이번 주 = 최근 7일
  const now = new Date();
  let weekSec = swSec;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = ymd(d);
    if (key !== t && ps[key]) weekSec += ps[key];
  }
  const fmt = s => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  };
  const el = document.getElementById('practice-stats');
  if (el) el.innerHTML =
    `오늘 <strong>${fmt(todaySec)}</strong> · 이번 주 <strong>${fmt(weekSec)}</strong> · 전체 <strong>${fmt(totalSec)}</strong>`;
}

window.timerToggle = function() {
  const btn = document.getElementById('btn-timer');
  if (tRun || swIv) {
    // 일시정지
    clearInterval(tIv); tIv = null; tRun = false;
    clearInterval(swIv); swIv = null;
    btn.textContent = '▶ 계속';
  } else {
    // 시작 (또는 계속)
    btn.textContent = '⏸ 일시정지';
    // 타이머 (0이면 재시작 안 함, 스톱워치만 진행)
    if (tSec > 0) {
      tRun = true;
      tIv = setInterval(() => {
        tSec--; tUpd();
        if (tSec <= 0) {
          clearInterval(tIv); tIv = null; tRun = false;
          document.getElementById('timer-done').classList.add('show');
          beep();
          // 스톱워치는 계속 돌아감
        }
      }, 1000);
    }
    // 스톱워치 (항상 진행)
    swIv = setInterval(() => { swSec++; swUpd(); practiceUpd(); }, 1000);
  }
  tUpd();
};

// 오늘 연습 시간 누적 저장
function commitPracticeTime() {
  if (swSec <= 0) return;
  if (!userData.practiceSeconds) userData.practiceSeconds = {};
  const t = today();
  userData.practiceSeconds[t] = (userData.practiceSeconds[t] || 0) + swSec;
  swSec = 0;
  swUpd(); practiceUpd();
}

window.timerReset = function() {
  clearInterval(tIv); tIv = null; tRun = false;
  clearInterval(swIv); swIv = null;
  // 스톱워치 누적 시간을 오늘 기록에 저장
  commitPracticeTime();
  saveUserData();
  tSec = 600;
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
let uploadedImg = null;   // AI 분석용 (1200px, 고화질)
let uploadedThumb = null; // Firebase Storage 저장용 (700px, 압축 — 용량 최소화)

// 휴대폰 카메라 사진은 용량이 매우 커서(수 MB) Anthropic API가 거부할 수 있으므로,
// 업로드 시 가로/세로 1200px 이하, JPEG 품질 0.8 정도로 자동 축소합니다.
function resizeImage(file, maxSize = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

window.togglePreviewSize = function() {
  document.getElementById('upload-preview').classList.toggle('collapsed');
};

document.getElementById('file-input').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  document.getElementById('upload-filename').textContent = f.name;
  try {
    uploadedImg   = await resizeImage(f, 1200, 0.8); // AI 분석용
    uploadedThumb = await resizeImage(f, 700, 0.6);  // 저장용 (용량 절약)
    const img = document.getElementById('upload-preview');
    img.src = uploadedImg; img.style.display = 'block'; img.classList.add('collapsed');
    document.getElementById('upload-preview-hint').classList.add('show');
  } catch (err) {
    console.error('이미지 처리 오류:', err);
    alert('이미지를 처리하는 중 오류가 발생했습니다. 다른 사진으로 시도해주세요.');
  }
});

window.saveJournal = async function() {
  const btn = document.getElementById('btn-save');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = uploadedThumb ? '📤 사진 저장 중...' : '💾 저장 중...';
  const t = today();
  if (!userData.journals)     userData.journals = {};
  if (!userData.completedDays) userData.completedDays = {};
  if (!userData.practiceSeconds) userData.practiceSeconds = {};
  // 스톱워치가 돌아가고 있으면 정지 후 시간 누적
  if (swIv) {
    clearInterval(swIv); swIv = null;
    clearInterval(tIv); tIv = null; tRun = false;
    document.getElementById('btn-timer').textContent = '▶ 시작';
  }
  if (swSec > 0) {
    userData.practiceSeconds[t] = (userData.practiceSeconds[t] || 0) + swSec;
    swSec = 0;
    swUpd(); practiceUpd();
  }
  // 사진이 있으면 Storage에 업로드 (같은 날짜 파일은 덮어써서 용량이 쌓이지 않음)
  let photoUrl = (userData.journals[t] && userData.journals[t].photoUrl) || null;
  if (uploadedThumb && window._currentUser) {
    try {
      const path = `journal-photos/${window._currentUser.uid}/${t}.jpg`;
      const ref = window._storageRef(window._storage, path);
      await window._uploadString(ref, uploadedThumb, 'data_url');
      photoUrl = await window._getDownloadURL(ref);
      uploadedThumb = null;
    } catch (e) {
      console.error('사진 저장 오류:', e);
      // 사진 저장에 실패해도 일지 텍스트 저장은 계속 진행
    }
  }
  userData.journals[t] = {
    weakness: document.getElementById('weakness-input').value,
    feedback: document.getElementById('feedback-input').value,
    photoUrl: photoUrl,
    savedAt:  new Date().toISOString()
  };
  userData.completedDays[t] = true;
  await saveUserData();
  updateDash(); renderCalendar();
  btn.disabled = false;
  btn.textContent = origText;
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
// Anthropic API를 브라우저에서 직접 호출할 수 없으므로
// Cloudflare Worker(중계 서버)를 통해 호출합니다.
const AI_WORKER_URL = 'https://handwriting-ai-coach.ljcletter.workers.dev';

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
    const res = await fetch(AI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: uc }] })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const txt = data.content.map(i => i.text || '').join('');
    document.getElementById('ai-result').innerHTML =
      txt.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    document.getElementById('ai-result').classList.add('show');
    document.getElementById('feedback-input').value = txt;
  } catch(err) {
    console.error('AI 피드백 오류:', err);
    document.getElementById('ai-result').innerHTML = '피드백 요청 중 오류가 발생했습니다. (' + err.message + ')';
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
    const dt = new Date(calY, calM, d), ds = ymd(dt);
    const el = document.createElement('div');
    const inC  = dt >= start && dt <= end;
    const isT  = ds === today();
    const isDone = (userData.completedDays || {})[ds];
    const sec = (userData.practiceSeconds || {})[ds] || 0;
    const min = Math.round(sec / 60);
    el.className = 'cal-day' + (isDone ? ' done' : isT ? ' today' : inC ? ' challenge' : '');
    el.innerHTML = `<div class="cal-day-content"><span class="cal-day-num">${d}</span>` +
      (isDone && min > 0 ? `<span class="cal-day-min">${min}분</span>` : '') + `</div>`;
    if (isDone) {
      el.classList.add('clickable');
      el.title = '클릭하면 그날의 기록을 볼 수 있어요';
      el.onclick = () => showJournalDetail(ds);
    }
    g.appendChild(el);
  }
  document.getElementById('cal-done-count').textContent = doneCount();
}
window.calPrev = function() { if (calM===0){calY--;calM=11;}else calM--; renderCalendar(); };
window.calNext = function() { if (calM===11){calY++;calM=0;}else calM++; renderCalendar(); };

// ── 지난 기록 다시 보기 (모달) ───────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}
function formatFeedbackHtml(s) {
  return escHtml(s).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

window.showJournalDetail = function(ds) {
  const j   = (userData.journals || {})[ds] || {};
  const sec = (userData.practiceSeconds || {})[ds] || 0;

  const dateObj   = new Date(ds);
  const dateLabel = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`;

  const startD = new Date(userData.startDate || ds);
  const dn = Math.min(Math.max(Math.floor((dateObj - startD) / 864e5) + 1, 1), 84);
  const { w, d } = wkDay(dn);
  const mw = WEEKS[w];

  const min = Math.floor(sec / 60), s = sec % 60;
  const timeLabel = sec > 0 ? `${min}분 ${s}초` : '';

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-date">${dateLabel} · Day ${dn}/84 (${w}주차 ${d}일차)</div>
    <div class="modal-title">${mw ? '✍️ ' + mw.title : ''}</div>
    ${j.photoUrl ? `
    <div class="modal-section">
      <div class="modal-section-label">📷 그날 연습 사진</div>
      <img src="${j.photoUrl}" alt="그날의 연습 사진" style="width:100%;border-radius:8px;display:block">
    </div>` : ''}
    <div class="modal-section">
      <div class="modal-section-label">⏱ 실제 연습 시간</div>
      <div class="modal-section-body${timeLabel ? '' : ' empty'}">${timeLabel || '기록된 연습 시간이 없어요'}</div>
    </div>
    <div class="modal-section">
      <div class="modal-section-label">✏️ 발견한 가장 불규칙한 부분</div>
      <div class="modal-section-body${j.weakness ? '' : ' empty'}">${j.weakness ? escHtml(j.weakness) : '작성된 메모가 없어요'}</div>
    </div>
    <div class="modal-section">
      <div class="modal-section-label">🤖 AI 코치 피드백</div>
      <div class="modal-section-body${j.feedback ? '' : ' empty'}">${j.feedback ? formatFeedbackHtml(j.feedback) : '저장된 피드백이 없어요'}</div>
    </div>
  `;
  document.getElementById('journal-modal').classList.remove('hidden');
};

window.closeJournalModal = function() {
  document.getElementById('journal-modal').classList.add('hidden');
};

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
  swUpd();
  practiceUpd();
};
