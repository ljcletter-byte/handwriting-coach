// ── 날짜 헬퍼 (시간대 안전) ────────────────────────────────
// toISOString()은 UTC 기준이라 한국에서 자정 직후에 하루 어긋날 수 있어 직접 포맷합니다.
const ymd = d => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const today = () => ymd(new Date());

// ── 접근성: 글자 크기 조절 ────────────────────────────────
// 연세 있으신 분들도 편하게 쓰실 수 있도록, 화면 전체를 확대하는 옵션입니다.
// 로그인 전 화면(온보딩 등)에도 바로 적용되도록 스크립트 로드 시점에 즉시 실행합니다.
const TEXT_SIZE_LEVELS = ['', 'text-lg', 'text-xl'];
const TEXT_SIZE_LABELS = { '': '', 'text-lg': '크게', 'text-xl': '아주크게' };
function applyTextSize(level) {
  document.body.classList.remove('text-lg', 'text-xl');
  if (level) document.body.classList.add(level);
  const ind = document.getElementById('text-size-indicator');
  if (ind) ind.textContent = level ? ` ${TEXT_SIZE_LABELS[level]}` : '';
}
(function initTextSize() {
  const saved = localStorage.getItem('textSizeLevel') || '';
  const apply = () => applyTextSize(TEXT_SIZE_LEVELS.includes(saved) ? saved : '');
  if (document.body) apply();
  else document.addEventListener('DOMContentLoaded', apply);
})();
window.cycleTextSize = function() {
  const current = TEXT_SIZE_LEVELS.find(l => l && document.body.classList.contains(l)) || '';
  const idx = (TEXT_SIZE_LEVELS.indexOf(current) + 1) % TEXT_SIZE_LEVELS.length;
  const next = TEXT_SIZE_LEVELS[idx];
  applyTextSize(next);
  try { localStorage.setItem('textSizeLevel', next); } catch (e) { /* 저장 실패해도 이번 세션엔 적용됨 */ }
};

// ── Firebase 데이터 관리 ──────────────────────────────────
let userData = {
  startDate: today(),
  completedDays: {},
  journals: {},
  practiceSeconds: {},  // { "2026-06-30": 720, "2026-07-01": 645, ... } — 날짜별 연습 초
  onboarded: false      // 첫 사용자 안내를 봤는지
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
// ── 전체 초기화 (여러 안전장치) ───────────────────────────
// 1) 통계 탭 깊숙이 위치  2) 백업 권유  3) '초기화' 직접 입력해야 실행
window.startReset = function() {
  const cntEl = document.getElementById('reset-count');
  if (cntEl) cntEl.textContent = `${doneCount()}일치`;
  const input = document.getElementById('reset-confirm-input');
  if (input) input.value = '';
  const btn = document.getElementById('reset-final-btn');
  if (btn) btn.disabled = true;
  document.getElementById('reset-modal').classList.remove('hidden');
};
window.closeResetModal = function() {
  document.getElementById('reset-modal').classList.add('hidden');
};
window.checkResetInput = function() {
  const input = document.getElementById('reset-confirm-input');
  const btn = document.getElementById('reset-final-btn');
  if (!input || !btn) return;
  btn.disabled = (input.value.trim() !== '초기화');
};
window.confirmReset = async function() {
  const input = document.getElementById('reset-confirm-input');
  if (!input || input.value.trim() !== '초기화') return;
  closeResetModal();
  await doReset();
  alert('✅ 초기화 완료! 오늘부터 Day 1입니다.');
};

// 실제 초기화 실행 (내부용)
async function doReset() {
  userData = { startDate: today(), completedDays: {}, journals: {}, practiceSeconds: {}, onboarded: true };
  await saveUserData();
  // 스톱워치/타이머도 초기화
  clearInterval(tIv); tIv = null; tRun = false;
  clearInterval(swIv); swIv = null;
  tSec = 600; swSec = 0;
  breakShown = false;
  document.getElementById('btn-timer').textContent = '▶ 시작';
  document.getElementById('timer-done').classList.remove('show');
  tUpd(); swUpd(); practiceUpd();
  // 화면 초기화
  document.getElementById('weakness-input').value = '';
  document.getElementById('feedback-input').value = '';
  selfCheckValue = null;
  if (typeof renderSelfCheck === 'function') renderSelfCheck();
  const preview = document.getElementById('upload-preview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; preview.classList.add('collapsed'); }
  uploadedImg = null;
  uploadedThumb = null;
  galleryCache = null;
  journalDate = today();
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
  if (typeof renderStats === 'function') renderStats();
}

// ── 날짜 헬퍼 (계속) ─────────────────────────────────────
const dayFromStart = () => {
  const d = Math.floor((new Date(today()) - new Date(userData.startDate)) / 864e5) + 1;
  return Math.min(Math.max(d, 1), 84);
};
const wkDay    = n => ({ w: Math.min(Math.ceil(n/7), 12), d: Math.min(((n-1)%7)+1, 7) });
const doneCount = () => Object.keys(userData.completedDays || {}).length;

// ── 탭 전환 ───────────────────────────────────────────────
// 하단 탭바에 직접 있는 탭들 (나머지는 '더보기' 안에 있음)
const BOTTOM_TABS = ['mission', 'journal', 'calendar', 'stats'];

window.switchTab = function(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.classList.add('active');

  // 하단 탭바 활성화 표시
  document.querySelectorAll('.bn-item').forEach(b => b.classList.remove('active'));
  const bnItem = document.querySelector(`.bn-item[data-tab="${name}"]`);
  if (bnItem) {
    bnItem.classList.add('active');
  } else {
    // 더보기 안에 있는 탭이면 '더보기' 버튼을 활성 표시
    const more = document.getElementById('bn-more');
    if (more) more.classList.add('active');
  }

  // 맨 위로 스크롤 (탭 바꿀 때마다 상단부터 보이도록)
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'calendar') renderCalendar();
  if (name === 'gallery') renderGallery();
  if (name === 'stats') renderStats();
};

window.openMoreSheet = function() {
  document.getElementById('more-sheet').classList.remove('hidden');
  updateNotifToggleUI();
};
window.closeMoreSheet = function() {
  document.getElementById('more-sheet').classList.add('hidden');
};

window.toggleAccordion = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
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

// ── 리마인더 알림 ─────────────────────────────────────────
// "앱을 며칠 안 열면 잊어버린다"는 문제를 완화하기 위해,
// 앱을 열 때마다 마지막 완료일을 기준으로 며칠 지났는지 계산해서
// 따뜻한 톤의 배너를 보여줍니다. (죄책감을 주지 않고 격려하는 문구로)
let reminderDismissed = false;

// 오늘 기준으로 마지막 완료일로부터 며칠이 지났는지 계산
// 반환값: 0(오늘 이미 함), 1(어제까지만 함), 2 이상(며칠 지남), null(기록이 아예 없는 신규 사용자)
function daysSinceLastPractice() {
  const cd = userData.completedDays || {};
  const dates = Object.keys(cd).filter(k => cd[k]);
  if (dates.length === 0) return null; // 아직 한 번도 완료 기록이 없음 (온보딩 케이스)
  dates.sort(); // 문자열 날짜 정렬 (YYYY-MM-DD 형식이라 문자열 정렬 = 날짜 정렬)
  const lastDate = dates[dates.length - 1];
  const last = new Date(lastDate);
  const now = new Date(today());
  return Math.round((now - last) / 864e5);
}

function maybeShowReminder() {
  const banner = document.getElementById('reminder-banner');
  if (!banner || reminderDismissed) return;

  const gap = daysSinceLastPractice();
  // 오늘 이미 했거나(0), 신규 사용자(null)면 배너를 보여주지 않음
  if (gap === null || gap <= 0) {
    banner.classList.remove('show');
    return;
  }

  const iconEl = document.getElementById('reminder-banner-icon');
  const textEl = document.getElementById('reminder-banner-text');
  let icon, msg;
  if (gap === 1) {
    icon = '🌱';
    msg = '어제는 쉬셨네요. 오늘 10분만 다시 이어가볼까요?';
  } else if (gap <= 3) {
    icon = '🌤️';
    msg = `${gap}일 동안 연습을 못하셨어요. 지금 시작해도 전혀 늦지 않았어요!`;
  } else if (gap <= 7) {
    icon = '💌';
    msg = `${gap}일 만이에요! 잠깐 5분이라도 다시 시작해보면 어떨까요?`;
  } else {
    icon = '🌿';
    msg = '오랜만이에요. 부담 갖지 마시고, 오늘은 한 글자만 써봐도 충분해요.';
  }
  fillReminderBanner(banner, iconEl, textEl, icon, msg);

  // 알림 권한이 이미 허용된 상태라면, 앱을 여는 순간 OS 알림도 함께 띄워줌
  // (앱을 아예 안 열면 발송할 방법이 없으므로, 열었을 때 눈에 더 잘 띄게 하는 보조 수단)
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('12주 악필 교정 챌린저', {
        body: msg,
        icon: 'icon-192.png',
        tag: 'daily-reminder' // 같은 태그로 중복 알림 방지
      });
    } catch (e) { console.error('알림 표시 오류:', e); }
  }
}

function fillReminderBanner(banner, iconEl, textEl, icon, msg) {
  iconEl.textContent = icon;
  textEl.textContent = msg;
  banner.classList.add('show');
}

window.dismissReminder = function() {
  reminderDismissed = true;
  const banner = document.getElementById('reminder-banner');
  if (banner) banner.classList.remove('show');
};

// 더보기 시트의 "리마인더 알림" 버튼 표시를 현재 권한 상태에 맞게 갱신
function updateNotifToggleUI() {
  const title = document.getElementById('notif-toggle-title');
  const desc = document.getElementById('notif-toggle-desc');
  if (!title || !desc) return;
  if (typeof Notification === 'undefined') {
    title.textContent = '리마인더 알림 (미지원)';
    desc.textContent = '이 브라우저는 알림 기능을 지원하지 않아요';
    return;
  }
  if (Notification.permission === 'granted') {
    title.textContent = '리마인더 알림 켜짐 ✓';
    desc.textContent = '앱을 열 때 며칠 못했으면 OS 알림으로도 알려드려요';
  } else if (Notification.permission === 'denied') {
    title.textContent = '리마인더 알림 (차단됨)';
    desc.textContent = '브라우저 설정에서 알림 권한을 허용해주세요';
  } else {
    title.textContent = '리마인더 알림 켜기';
    desc.textContent = '앱을 열 때 며칠 못했으면 알려드려요';
  }
}

window.toggleNotificationPref = async function() {
  if (typeof Notification === 'undefined') {
    alert('이 브라우저는 알림 기능을 지원하지 않아요.');
    return;
  }
  if (Notification.permission === 'denied') {
    alert('알림이 차단되어 있어요. 브라우저(또는 홈 화면 앱) 설정에서 이 사이트의 알림 권한을 허용한 뒤 다시 시도해주세요.');
    return;
  }
  if (Notification.permission === 'granted') {
    // 이미 켜져 있으면, 테스트 알림을 한 번 보여줘서 잘 작동하는지 확인시켜줌
    try {
      new Notification('12주 악필 교정 챌린저', { body: '리마인더 알림이 켜져 있어요! 👍', icon: 'icon-192.png' });
    } catch (e) { /* 무시 */ }
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    updateNotifToggleUI();
    if (perm === 'granted') {
      new Notification('12주 악필 교정 챌린저', { body: '리마인더 알림이 켜졌어요! 며칠 연습을 못하면 앱을 열 때 알려드릴게요.', icon: 'icon-192.png' });
    }
  } catch (e) {
    console.error('알림 권한 요청 오류:', e);
  }
};

// ── 주차 탭 ───────────────────────────────────────────────
let selW = 1, selD = 1;

function initWeekTabs() {
  const c = document.getElementById('week-tabs');
  c.innerHTML = '';
  for (let w = 1; w <= 12; w++) {
    const b = document.createElement('button');
    b.className = 'week-tab' + (w === selW ? ' active' : '');
    b.textContent = w + '주차';
    b.onclick = () => {
      selW = w; selD = 1; initWeekTabs(); renderMission(); renderWorksheet();
      // 주차를 고르면 미리보기 아코디언을 닫고 맨 위 미션으로 스크롤
      const acc = document.getElementById('acc-weeks');
      if (acc) acc.classList.remove('open');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    c.appendChild(b);
  }
}

// ── 미션 ─────────────────────────────────────────────────
// 예시 글씨체: 'serif'(명조·교본용) 또는 'gaegu'(개구쟁이·손글씨)
let practiceFont = 'serif';
const FONT_FAMILY = {
  serif: "'Noto Serif KR', serif",
  gaegu: "'Gaegu', cursive"
};

window.setPracticeFont = function(f) {
  practiceFont = f;
  document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
  const active = document.querySelector(`.font-btn[onclick*="${f}"]`);
  if (active) active.classList.add('active');
  renderGridExamples();
};

// 네모칸(원고지) 예시 렌더링 — 각 글자를 격자 칸에 넣고 보조선 표시
function renderGridExamples() {
  const fam = FONT_FAMILY[practiceFont] || FONT_FAMILY.serif;
  document.querySelectorAll('.grid-example').forEach(box => {
    const text = box.dataset.text || '';
    const size = parseInt(box.dataset.size || '44', 10);
    box.innerHTML = '';
    [...text].forEach(ch => {
      const isSpace = ch === ' ';
      const cell = document.createElement('div');
      cell.className = 'grid-cell' + (isSpace ? ' space' : '');
      cell.style.width = size + 'px';
      cell.style.height = size + 'px';
      if (!isSpace) {
        const guide = document.createElement('div');
        guide.className = 'grid-guide';
        cell.appendChild(guide);
        const g = document.createElement('span');
        g.textContent = ch;
        g.style.fontFamily = fam;
        g.style.fontSize = Math.round(size * 0.72) + 'px';
        cell.appendChild(g);
      }
      box.appendChild(cell);
    });
  });
}

// ── 따라쓰기 연습지 PDF ────────────────────────────────────
// jsPDF는 한글 폰트를 기본 내장하지 않아 텍스트를 직접 그리면 깨지므로,
// 브라우저가 이미 로드해둔 웹폰트(Noto Serif KR / Gaegu)로 캔버스에 먼저
// 그린 뒤 그 캔버스를 이미지로 PDF에 넣는 방식을 씁니다. (글자 깨짐 없음)
let _jspdfLoading = null;
function ensureJsPDFLoaded() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  if (_jspdfLoading) return _jspdfLoading;
  _jspdfLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'));
    document.head.appendChild(s);
  });
  return _jspdfLoading;
}

// 원고지 스타일 격자 칸 하나를 캔버스에 그림 (guide=null이면 빈 칸, 문자가 있으면 연한 회색 예시 글자 표시)
function drawGridCell(ctx, x, y, size, guide, fontFamily) {
  const r = size * 0.12;
  ctx.strokeStyle = '#cfd8d2';
  ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
  ctx.fillStyle = '#fbfcfb';
  ctx.fill();
  ctx.stroke();
  // 십자 보조선 (원고지 느낌)
  ctx.strokeStyle = '#e3ebe6';
  ctx.lineWidth = Math.max(1, size * 0.01);
  ctx.beginPath();
  ctx.moveTo(x + size / 2, y); ctx.lineTo(x + size / 2, y + size);
  ctx.moveTo(x, y + size / 2); ctx.lineTo(x + size, y + size / 2);
  ctx.stroke();
  if (guide) {
    ctx.fillStyle = '#b7c3bc';
    ctx.font = `${Math.round(size * 0.62)}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(guide, x + size / 2, y + size / 2 + size * 0.03);
  }
}

// 글자 배열을 격자 한 줄에 그리고(guideRow=true면 예시 글자 포함, false면 빈 칸),
// 공백은 칸을 띄우지 않고 좁은 간격만 줌
function drawCharRow(ctx, chars, x, y, cellSize, gap, guideRow, fontFamily) {
  let cx = x;
  chars.forEach(ch => {
    if (ch === ' ') { cx += cellSize * 0.35; return; }
    drawGridCell(ctx, cx, y, cellSize, guideRow ? ch : null, fontFamily);
    cx += cellSize + gap;
  });
  return cx;
}

window.downloadTracingPDF = async function() {
  const btn = document.getElementById('btn-pdf-download');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 만드는 중...'; }
  try {
    await ensureJsPDFLoaded();
    await (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());

    const mw = WEEKS[selW], md = mw.days[selD - 1];
    const dayNum = (selW - 1) * 7 + selD;
    const fam = FONT_FAMILY[practiceFont] || FONT_FAMILY.serif;
    const fontLabel = practiceFont === 'gaegu' ? '개구쟁이' : '명조(교본)';

    // A4 캔버스 준비 (약 200dpi 상당 해상도)
    const PX_PER_MM = 8;
    const PAGE_W = 210 * PX_PER_MM, PAGE_H = 297 * PX_PER_MM;
    const MARGIN = 15 * PX_PER_MM;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W; canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    let y = MARGIN;

    // 헤더
    ctx.fillStyle = '#2D6A4F';
    ctx.font = `700 ${Math.round(6.2*PX_PER_MM)}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('12주 악필 교정 챌린저', MARGIN, y + 6*PX_PER_MM);
    ctx.fillStyle = '#666';
    ctx.font = `500 ${Math.round(3.6*PX_PER_MM)}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(today() + ' 발급', PAGE_W - MARGIN, y + 6*PX_PER_MM);
    y += 9*PX_PER_MM;

    ctx.fillStyle = '#222';
    ctx.font = `700 ${Math.round(5.4*PX_PER_MM)}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`Day ${dayNum} · ${selW}주차 ${selD}일차 따라쓰기 연습지`, MARGIN, y + 5.4*PX_PER_MM);
    y += 8.5*PX_PER_MM;

    ctx.fillStyle = '#7FA88F';
    ctx.font = `400 ${Math.round(3.4*PX_PER_MM)}px 'Noto Sans KR', sans-serif`;
    ctx.fillText(`이번 주 관찰 포인트: ${mw.focus}  ·  예시 글씨체: ${fontLabel}`, MARGIN, y + 3.4*PX_PER_MM);
    y += 7*PX_PER_MM;

    ctx.strokeStyle = '#E5E1D8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(PAGE_W - MARGIN, y); ctx.stroke();
    y += 7*PX_PER_MM;

    // 섹션 그리는 헬퍼: 라벨 + 설명 + 예시줄(회색 글자) + 빈 연습줄 여러 개
    function drawSection(label, text, desc, practiceRows) {
      ctx.fillStyle = '#2D6A4F';
      ctx.font = `700 ${Math.round(4.2*PX_PER_MM)}px 'Noto Sans KR', sans-serif`;
      ctx.fillText(label, MARGIN, y + 4.2*PX_PER_MM);
      y += 6*PX_PER_MM;
      ctx.fillStyle = '#888';
      ctx.font = `400 ${Math.round(3.2*PX_PER_MM)}px 'Noto Sans KR', sans-serif`;
      ctx.fillText(desc, MARGIN, y + 3.2*PX_PER_MM);
      y += 6.5*PX_PER_MM;

      const chars = [...text];
      const gap = 1.6 * PX_PER_MM;
      // 글자 수에 맞춰 칸 크기를 조절해서 한 줄에 모두 들어가도록 함
      let cellSize = 13 * PX_PER_MM;
      const neededW = chars.reduce((w, ch) => w + (ch === ' ' ? cellSize*0.35 : cellSize + gap), 0);
      if (neededW > CONTENT_W) cellSize = Math.max(7*PX_PER_MM, (CONTENT_W - chars.length*gap) / chars.length);

      // 예시 줄 (회색 글자)
      drawCharRow(ctx, chars, MARGIN, y, cellSize, gap, true, fam);
      y += cellSize + 3*PX_PER_MM;
      // 빈 연습 줄들
      for (let i = 0; i < practiceRows; i++) {
        drawCharRow(ctx, chars, MARGIN, y, cellSize, gap, false, fam);
        y += cellSize + 3*PX_PER_MM;
      }
      y += 4*PX_PER_MM;
    }

    drawSection('✍️ Part 2 · 단어', md.p2, md.p2d, 4);
    drawSection('✍️ Part 3 · 문장', md.p3, md.p3d, 3);

    // 푸터
    ctx.fillStyle = '#B7C3BC';
    ctx.font = `400 ${Math.round(3*PX_PER_MM)}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('12주 악필 교정 챌린저 · ljcletter-byte.github.io/handwriting-coach', PAGE_W/2, PAGE_H - 8*PX_PER_MM);

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    pdf.save(`악필교정_Day${dayNum}_따라쓰기연습지.pdf`);
  } catch (err) {
    console.error('PDF 생성 오류:', err);
    alert('연습지를 만드는 중 문제가 생겼어요. 인터넷 연결을 확인하고 다시 시도해주세요.\n(' + err.message + ')');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🖨️ 오늘의 따라쓰기 연습지 PDF 받기'; }
  }
};

function renderMission() {
  const mw = WEEKS[selW], md = mw.days[selD - 1];
  document.getElementById('mission-title').textContent = selW + '주차: ' + mw.title;
  document.getElementById('mission-badge').textContent = 'Day ' + ((selW-1)*7 + selD);
  document.getElementById('mission-body').innerHTML = `
    <div class="week-focus">
      <div class="week-focus-head">🔍 이번 주 관찰 포인트</div>
      <div class="week-focus-main">${mw.focus}</div>
      <div class="week-focus-q">"${mw.question}"</div>
    </div>
    <div class="font-switch">
      <span class="font-switch-label">✍️ 예시 글씨체</span>
      <button class="font-btn${practiceFont==='serif'?' active':''}" onclick="setPracticeFont('serif')">명조 (교본)</button>
      <button class="font-btn${practiceFont==='gaegu'?' active':''}" onclick="setPracticeFont('gaegu')">개구쟁이</button>
    </div>
    <button class="btn-pdf-download" id="btn-pdf-download" onclick="downloadTracingPDF()">🖨️ 오늘의 따라쓰기 연습지 PDF 받기</button>
    <div class="mission-part">
      <div class="part-badge part-1">Part 1 · 선긋기</div>
      <h3>${md.p1}</h3><p>${md.p1d}</p>
    </div>
    <div class="mission-part">
      <div class="part-badge part-2">Part 2 · 단어</div>
      <h3>${md.p2}</h3><p>${md.p2d}</p>
      <div class="example-label">✍️ 이렇게 써보세요</div>
      <div class="grid-example" data-text="${md.p2}" data-size="46"></div>
    </div>
    <div class="mission-part">
      <div class="part-badge part-3">Part 3 · 문장</div>
      <h3>${md.p3}</h3><p>${md.p3d}</p>
      <div class="example-label">✍️ 이렇게 써보세요</div>
      <div class="grid-example" data-text="${md.p3}" data-size="38"></div>
    </div>
    <div class="day-pills">
      ${[1,2,3,4,5,6,7].map(d =>
        `<button class="day-pill${d===selD?' active':''}" onclick="selDay(${d})">${d}일</button>`
      ).join('')}
    </div>`;
  renderGridExamples();
  renderWorksheet();
  if (typeof renderSelfCheck === 'function') renderSelfCheck();
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
let breakShown = false; // 이번 세션에서 5분 휴식 알림을 이미 띄웠는지
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
        // 5분(300초) 지점 도달 시 손목 휴식 알림 (한 번만)
        if (tSec === 300 && !breakShown) {
          breakShown = true;
          showWristBreak();
        }
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
  // 스톱워치 누적 시간을 오늘 기록에 저장 (연습한 시간은 사라지지 않고 저장됨)
  commitPracticeTime();
  saveUserData();
  tSec = 600;
  breakShown = false;
  window.closeWristBreak && window.closeWristBreak();
  document.getElementById('btn-timer').textContent = '▶ 시작';
  document.getElementById('timer-done').classList.remove('show');
  tUpd();
  swUpd();
  practiceUpd();
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

// 휴식 알림용 부드러운 2음 차임 (완료음 beep보다 낮고 포근한 느낌)
function softChime() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [[587.33, 0], [440, .3]].forEach(([freq, t]) => {
      const o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(.18, a.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.001, a.currentTime + t + .5);
      o.start(a.currentTime + t); o.stop(a.currentTime + t + .5);
    });
  } catch(e) {}
}

// 5분 손목 휴식 알림 배너
function showWristBreak() {
  softChime();
  const el = document.getElementById('wrist-break');
  if (!el) return;
  el.classList.add('show');
  // 12초 후 자동으로 사라짐 (사용자가 직접 닫을 수도 있음)
  clearTimeout(window._wristBreakTimer);
  window._wristBreakTimer = setTimeout(() => el.classList.remove('show'), 12000);
}
window.closeWristBreak = function() {
  const el = document.getElementById('wrist-break');
  if (el) el.classList.remove('show');
  clearTimeout(window._wristBreakTimer);
};

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
  const t = journalDate; // 선택한 날짜 (기본값: 오늘)
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
    // 스톱워치로 잰 시간은 '실제로 연습한 오늘'에 누적합니다
    // (지난 날짜 일지를 쓰더라도, 방금 연습한 시간은 오늘 기록이므로)
    const realToday = today();
    userData.practiceSeconds[realToday] = (userData.practiceSeconds[realToday] || 0) + swSec;
    swSec = 0;
    swUpd(); practiceUpd();
  }
  // 사진이 있으면 별도 문서(users/{uid}/journalPhotos/{날짜})에 저장
  // 메인 데이터 문서에 직접 넣지 않는 이유: 84일치 사진이 쌓이면 Firestore의
  // "문서당 1MB 제한"을 넘을 수 있어서, 날짜별로 분리된 작은 문서에 따로 저장합니다.
  let hasPhoto = (userData.journals[t] && userData.journals[t].hasPhoto) || false;
  if (uploadedThumb && window._currentUser) {
    try {
      const photoRef = window._doc(window._db, 'users', window._currentUser.uid, 'journalPhotos', t);
      const savedPhoto = uploadedThumb;
      await window._setDoc(photoRef, { photo: savedPhoto, savedAt: new Date().toISOString() });
      hasPhoto = true;
      uploadedThumb = null;
      // 갤러리 캐시에도 반영 (다시 조회하지 않아도 최신 사진이 바로 보이도록)
      if (galleryCache) {
        const idx = galleryCache.findIndex(it => it.ds === t);
        if (idx >= 0) galleryCache[idx].photo = savedPhoto;
        else { galleryCache.unshift({ ds: t, photo: savedPhoto }); galleryCache.sort((a, b) => b.ds.localeCompare(a.ds)); }
      }
    } catch (e) {
      console.error('사진 저장 오류:', e);
      // 사진 저장에 실패해도 일지 텍스트 저장은 계속 진행
    }
  }
  userData.journals[t] = {
    weakness: document.getElementById('weakness-input').value,
    feedback: document.getElementById('feedback-input').value,
    selfCheck: selfCheckValue,
    hasPhoto: hasPhoto,
    savedAt:  new Date().toISOString()
  };
  userData.completedDays[t] = true;
  await saveUserData();
  updateDash(); renderCalendar();
  if (t === today()) { const rb = document.getElementById('reminder-banner'); if (rb) rb.classList.remove('show'); }
  btn.disabled = false;
  btn.textContent = origText;
  const ok = document.getElementById('save-ok');
  ok.classList.add('show');
  setTimeout(() => ok.classList.remove('show'), 3000);
  celebrateStamp();
};

// 저장 완료 축하 도장 연출 (쾅! 찍히고 잠시 후 사라짐)
function celebrateStamp() {
  const el = document.getElementById('stamp-celebrate');
  if (!el) return;
  const flower = document.getElementById('stamp-flower');
  // 연속 진행률(스트릭)에 따라 응원 문구 변경
  const streak = (typeof computeStreak === 'function') ? computeStreak() : 0;
  const cap = document.getElementById('stamp-caption');
  if (cap) {
    cap.textContent = streak >= 2
      ? `${streak}일 연속 달성! 대단해요 🔥`
      : '오늘도 완료! 수고했어요 🎉';
  }
  // 애니메이션 재시작을 위해 클래스 리셋
  el.classList.remove('hidden');
  if (flower) { flower.style.animation = 'none'; void flower.offsetWidth; flower.style.animation = ''; }
  if (typeof beep === 'function') beep();
  clearTimeout(window._stampTimer);
  window._stampTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

// ── 일지 작성 날짜 ────────────────────────────────────────
// 기본은 오늘이지만, 지난 날짜를 골라 그날의 일지를 쓰거나 다시 피드백받을 수 있습니다.
let journalDate = today();

window.setJournalToday = function() {
  journalDate = today();
  const input = document.getElementById('journal-date');
  if (input) input.value = journalDate;
  loadJournal();
};

window.onJournalDateChange = function() {
  const input = document.getElementById('journal-date');
  if (!input || !input.value) return;
  // 미래 날짜는 선택 불가
  if (input.value > today()) {
    alert('아직 오지 않은 날짜는 선택할 수 없어요.');
    input.value = journalDate;
    return;
  }
  journalDate = input.value;
  loadJournal();
};

// 선택한 날짜가 몇 일차인지 계산 (미션 표시용)
function dayNumOf(ds) {
  const start = new Date(userData.startDate || ds);
  const dt = new Date(ds);
  return Math.min(Math.max(Math.floor((dt - start) / 864e5) + 1, 1), 84);
}

async function loadJournal() {
  const t = journalDate;
  const j = (userData.journals || {})[t] || {};
  document.getElementById('weakness-input').value = j.weakness || '';
  document.getElementById('feedback-input').value = j.feedback || '';
  // 자가 진단 복원
  selfCheckValue = j.selfCheck || null;
  renderSelfCheck();

  // 날짜 입력창 동기화
  const input = document.getElementById('journal-date');
  if (input) { input.value = t; input.max = today(); }

  // 오늘이 아닌 날짜면 안내 표시
  const note = document.getElementById('journal-date-note');
  const btnToday = document.getElementById('btn-journal-today');
  if (note) {
    if (t !== today()) {
      const dn = dayNumOf(t);
      const { w, d } = wkDay(dn);
      note.innerHTML = `📅 <strong>${t}</strong> (Day ${dn}/84 · ${w}주차 ${d}일차)의 일지를 작성/수정 중이에요. 저장하면 그날 기록으로 반영됩니다.`;
      note.classList.add('show');
      if (btnToday) btnToday.style.display = '';
    } else {
      note.classList.remove('show');
      if (btnToday) btnToday.style.display = 'none';
    }
  }

  // 이전 미리보기/업로드 상태 초기화
  uploadedImg = null;
  uploadedThumb = null;
  const preview = document.getElementById('upload-preview');
  const hint = document.getElementById('upload-preview-hint');
  const fname = document.getElementById('upload-filename');
  if (preview) { preview.src = ''; preview.style.display = 'none'; preview.classList.add('collapsed'); }
  if (hint) hint.classList.remove('show');
  if (fname) fname.textContent = '';
  const ai = document.getElementById('ai-result');
  if (ai) { ai.innerHTML = ''; ai.classList.remove('show'); }

  // 그날 저장된 사진이 있으면 불러와서 미리보기 + AI 재요청 가능하게
  if (j.hasPhoto && window._currentUser) {
    try {
      const cached = galleryCache && galleryCache.find(it => it.ds === t);
      let photo = cached ? cached.photo : null;
      if (!photo) {
        const ref = window._doc(window._db, 'users', window._currentUser.uid, 'journalPhotos', t);
        const snap = await window._getDoc(ref);
        if (snap.exists()) photo = snap.data().photo;
      }
      if (photo && journalDate === t) { // 그 사이 날짜가 바뀌지 않았을 때만
        uploadedImg = photo;   // AI 재요청용
        uploadedThumb = null;  // 이미 저장돼 있으니 재저장 불필요
        if (preview) { preview.src = photo; preview.style.display = 'block'; preview.classList.add('collapsed'); }
        if (hint) hint.classList.add('show');
        if (fname) fname.textContent = '저장된 사진을 불러왔어요';
      }
    } catch (e) {
      console.error('저장된 사진 불러오기 오류:', e);
    }
  }
}

// ── 자가 진단 ─────────────────────────────────────────────
let selfCheckValue = null;
function selfCheckLabel(v) {
  return { good: '😊 잘됨', soso: '😐 보통', hard: '😥 아쉬움' }[v] || '-';
}
function renderSelfCheck() {
  // 선택한 일지 날짜가 속한 주의 관찰 포인트를 질문에 반영
  const dn = (typeof journalDate !== 'undefined') ? dayNumOf(journalDate) : 1;
  const { w } = wkDay(dn);
  const mw = WEEKS[w] || WEEKS[selW];
  const q = document.getElementById('selfcheck-q');
  if (q && mw) q.innerHTML = `관찰 포인트 <strong>「${mw.focus}」</strong>를 얼마나 지켰나요?`;
  // 선택 상태 표시
  document.querySelectorAll('.selfcheck-opt').forEach(b => {
    b.classList.toggle('selected', b.dataset.v === selfCheckValue);
  });
}
window.selectSelfCheck = function(v) {
  selfCheckValue = (selfCheckValue === v) ? null : v; // 다시 누르면 해제
  renderSelfCheck();
};

// ── AI 피드백 ─────────────────────────────────────────────
// Anthropic API를 브라우저에서 직접 호출할 수 없으므로
// Cloudflare Worker(중계 서버)를 통해 호출합니다.
const AI_WORKER_URL = 'https://handwriting-ai-coach.ljcletter.workers.dev';

// 실제 API 호출 (한 번의 시도) — 성공 시 텍스트 반환, 실패 시 예외
// 예외 객체에 .status와 .retryable을 함께 실어서, 호출한 쪽에서
// "재시도할 가치가 있는 오류인지"를 판단할 수 있게 합니다.
async function requestAIFeedback(uc) {
  let res;
  try {
    res = await fetch(AI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: uc }] })
    });
  } catch (networkErr) {
    // fetch 자체가 실패 (오프라인, DNS, CORS 등) — 재시도 가치 있음
    const e = new Error('네트워크 연결에 실패했습니다 (' + networkErr.message + ')');
    e.retryable = true;
    throw e;
  }

  // 응답 본문을 먼저 텍스트로 받고, JSON 파싱은 그 다음에 안전하게 시도
  // (Worker나 Cloudflare가 에러 시 HTML/평문을 줄 수도 있어서 res.json()이 바로 깨질 수 있음)
  const rawText = await res.text();
  let data = null;
  try { data = rawText ? JSON.parse(rawText) : null; } catch (_) { /* JSON이 아님 */ }

  // 재시도해볼 만한 상태 코드: 429(속도제한), 403(신규계정 검토 등 일시적일 수 있음),
  // 500/502/503/504(서버 오류), 529(Anthropic 과부하)
  const RETRYABLE_STATUSES = new Set([403, 408, 409, 425, 429, 500, 502, 503, 504, 529]);

  if (!res.ok) {
    const detail = (data && data.error && (data.error.message || JSON.stringify(data.error)))
      || rawText.slice(0, 200)
      || '(응답 본문 없음)';
    const e = new Error(`HTTP ${res.status}: ${detail}`);
    e.status = res.status;
    e.retryable = RETRYABLE_STATUSES.has(res.status);
    throw e;
  }
  if (data && data.error) {
    const e = new Error(data.error.message || JSON.stringify(data.error));
    e.retryable = true; // 200으로 왔지만 error 필드가 있는 경우도 일단 재시도 대상으로
    throw e;
  }
  if (!data || !data.content) {
    const e = new Error('응답이 비어 있습니다: ' + rawText.slice(0, 200));
    e.retryable = true;
    throw e;
  }
  return data.content.map(i => i.text || '').join('');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

window.getAIFeedback = async function() {
  const weak = document.getElementById('weakness-input').value.trim();
  // 선택한 일지 날짜의 미션을 기준으로 피드백 (지난 날짜도 가능)
  const dn = dayNumOf(journalDate);
  const { w: jw, d: jd } = wkDay(dn);
  const mw = WEEKS[jw], md = mw.days[jd - 1];
  const isPast = journalDate !== today();
  const loadingEl = document.getElementById('ai-loading');
  const resultEl  = document.getElementById('ai-result');
  loadingEl.classList.add('show');
  loadingEl.textContent = '⏳ AI 코치가 글씨를 분석 중입니다...';
  resultEl.classList.remove('show');
  document.getElementById('btn-ai').disabled = true;

  // 프롬프트 구성
  const uc = [];
  if (uploadedImg) {
    const b = uploadedImg.split(',')[1];
    const mt = uploadedImg.split(';')[0].split(':')[1] || 'image/jpeg';
    uc.push({ type: 'image', source: { type: 'base64', media_type: mt, data: b } });
  }
  let pr = `당신은 한국어 손글씨 교정 전문 AI 코치입니다.\n대상 날짜: ${journalDate}${isPast ? ' (지난 연습에 대한 피드백)' : ''}\nDay ${dn}/84 (${jw}주차 ${jd}일차), 주제: ${mw.title}\n이번 주 관찰 포인트: ${mw.focus}\nPart 1: ${md.p1}\nPart 2: ${md.p2}\nPart 3: ${md.p3}`;
  if (weak) pr += `\n학습자가 발견한 불규칙 부분: ${weak}`;
  pr += uploadedImg
    ? '\n\n업로드된 글씨 사진을 분석해 피드백을 제공해주세요.'
    : '\n\n(사진 없음 — 해당 날짜 미션 기반 일반 연습 포인트와 격려 메시지를 제공해주세요.)';
  pr += `\n\n다음 형식으로 300자 내외:\n✅ **잘한 점**: 1~2가지\n🔍 **개선 포인트**: 가장 중요한 1가지\n💡 **다음 연습 팁**: 실천 가능한 1가지\n🌱 **응원 한마디**: 따뜻한 한 문장\n\n친근하고 격려적인 톤으로.`;
  uc.push({ type: 'text', text: pr });

  // 자동 재시도: 최대 5회, 재시도 가능한 오류일 때만 계속 시도
  // (재시도해도 소용없는 오류라면 바로 멈춰서 사용자를 불필요하게 기다리게 하지 않음)
  const MAX_TRIES = 5;
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      if (attempt > 1) {
        loadingEl.textContent = `⏳ 연결이 잠시 불안정해요. 다시 시도 중... (${attempt}/${MAX_TRIES})`;
      }
      const txt = await requestAIFeedback(uc);
      resultEl.innerHTML = txt.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      resultEl.classList.add('show');
      document.getElementById('feedback-input').value = txt;
      loadingEl.classList.remove('show');
      document.getElementById('btn-ai').disabled = false;
      return; // 성공 → 종료
    } catch (err) {
      lastErr = err;
      console.error(`AI 피드백 오류 (시도 ${attempt}/${MAX_TRIES}, status=${err.status || '-'}, retryable=${err.retryable}):`, err);
      const canRetry = err.retryable !== false; // 명시적으로 false가 아니면 재시도 대상으로 취급
      if (attempt < MAX_TRIES && canRetry) {
        // 지수 백오프 + 약간의 무작위 지연(여러 요청이 동시에 몰리는 것을 완화)
        const backoff = Math.min(1500 * Math.pow(1.7, attempt - 1), 8000);
        const jitter = Math.random() * 400;
        await sleep(backoff + jitter);
      } else if (!canRetry) {
        break; // 재시도해도 소용없는 오류면 바로 중단
      }
    }
  }

  // 모두 실패 (또는 재시도 불가능한 오류로 중단)
  const statusInfo = lastErr && lastErr.status ? ` [HTTP ${lastErr.status}]` : '';
  resultEl.innerHTML = '😥 AI 코치 연결에 실패했어요.<br>잠시 후 <strong>"✨ 피드백 받기"</strong>를 다시 눌러주세요.<br><span style="font-size:11px;color:#999">(오류' + statusInfo + ': ' + (lastErr ? lastErr.message : '알 수 없음') + ')</span>';
  resultEl.classList.add('show');
  loadingEl.classList.remove('show');
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
      (isDone && min > 0 ? `<span class="cal-day-min">${min}분</span>` : '') + `</div>` +
      (isDone ? calFlowerSVG() : '');
    if (isDone) {
      el.classList.add('clickable');
      el.title = '클릭하면 그날의 기록을 볼 수 있어요';
      el.onclick = () => showJournalDetail(ds);
    }
    g.appendChild(el);
  }
  document.getElementById('cal-done-count').textContent = doneCount();
}

// 캘린더 완료 칸에 얹는 작은 보라 꽃도장
function calFlowerSVG() {
  return `<svg class="cal-flower" width="30" height="30" viewBox="0 0 100 100" aria-hidden="true">
    <g transform="translate(50,50)">
      <g fill="#7E5BC2" opacity="0.9">
        ${[0,45,90,135,180,225,270,315].map(a =>
          `<ellipse cx="0" cy="-30" rx="11" ry="18" transform="rotate(${a})"/>`).join('')}
      </g>
      <circle cx="0" cy="0" r="16" fill="#5E3FA0"/>
      <path d="M-7,0 L-2,6 L8,-6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>`;
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

window.showJournalDetail = async function(ds) {
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
    ${j.hasPhoto ? `
    <div class="modal-section" id="modal-photo-section">
      <div class="modal-section-label">📷 그날 연습 사진</div>
      <div class="modal-section-body empty" id="modal-photo-body">⏳ 사진 불러오는 중...</div>
    </div>` : ''}
    <div class="modal-section">
      <div class="modal-section-label">⏱ 실제 연습 시간</div>
      <div class="modal-section-body${timeLabel ? '' : ' empty'}">${timeLabel || '기록된 연습 시간이 없어요'}</div>
    </div>
    ${j.selfCheck ? `
    <div class="modal-section">
      <div class="modal-section-label">🔍 자가 진단 (관찰 포인트)</div>
      <div class="modal-section-body">${selfCheckLabel(j.selfCheck)}</div>
    </div>` : ''}
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

  // 사진은 별도 문서라 모달을 연 뒤 비동기로 불러옵니다.
  // (갤러리에서 이미 불러온 사진이면 캐시에서 바로 꺼내 재조회를 건너뜁니다)
  if (j.hasPhoto && window._currentUser) {
    const cached = galleryCache && galleryCache.find(it => it.ds === ds);
    if (cached) {
      const body = document.getElementById('modal-photo-body');
      if (body) body.outerHTML = `<img src="${cached.photo}" alt="그날의 연습 사진" style="width:100%;border-radius:8px;display:block">`;
      return;
    }
    try {
      const photoRef = window._doc(window._db, 'users', window._currentUser.uid, 'journalPhotos', ds);
      const snap = await window._getDoc(photoRef);
      const body = document.getElementById('modal-photo-body');
      if (!body) return; // 모달이 이미 닫힌 경우
      if (snap.exists() && snap.data().photo) {
        body.outerHTML = `<img src="${snap.data().photo}" alt="그날의 연습 사진" style="width:100%;border-radius:8px;display:block">`;
      } else {
        body.textContent = '사진을 불러올 수 없어요';
      }
    } catch (e) {
      console.error('사진 불러오기 오류:', e);
      const body = document.getElementById('modal-photo-body');
      if (body) body.textContent = '사진을 불러오는 중 오류가 발생했어요';
    }
  }
};

window.closeJournalModal = function() {
  document.getElementById('journal-modal').classList.add('hidden');
};

// ── 사진 모아보기 (갤러리) ────────────────────────────────
// 한 번 불러온 사진은 galleryCache에 저장해두고, 탭을 다시 열어도
// Firestore를 재조회하지 않고 캐시를 재사용합니다 (읽기 횟수/속도 절약).
let galleryCache = null; // [{ ds, photo }, ...] — 최신순 정렬

async function renderGallery() {
  const loadingEl = document.getElementById('gallery-loading');
  const emptyEl   = document.getElementById('gallery-empty');
  const gridEl    = document.getElementById('gallery-grid');

  if (galleryCache) {
    renderGalleryGrid(galleryCache);
    return;
  }
  if (!window._currentUser) return;

  loadingEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');
  gridEl.innerHTML = '';

  try {
    const colRef = window._collection(window._db, 'users', window._currentUser.uid, 'journalPhotos');
    const snap = await window._getDocs(colRef);
    const items = [];
    snap.forEach(d => {
      const data = d.data();
      if (data && data.photo) items.push({ ds: d.id, photo: data.photo });
    });
    items.sort((a, b) => b.ds.localeCompare(a.ds)); // 최신 날짜 먼저
    galleryCache = items;
    renderGalleryGrid(items);
  } catch (e) {
    console.error('갤러리 로드 오류:', e);
    loadingEl.textContent = '사진을 불러오는 중 오류가 발생했어요';
  }
}

function renderGalleryGrid(items) {
  const loadingEl = document.getElementById('gallery-loading');
  const emptyEl   = document.getElementById('gallery-empty');
  const gridEl    = document.getElementById('gallery-grid');
  const compareCard = document.getElementById('gallery-compare-card');

  loadingEl.classList.add('hidden');
  renderCompare(items, compareCard);
  if (items.length === 0) {
    emptyEl.classList.remove('hidden');
    gridEl.innerHTML = '';
    return;
  }
  emptyEl.classList.add('hidden');
  gridEl.innerHTML = items.map(({ ds, photo }) => {
    const dt = new Date(ds);
    const label = `${dt.getMonth() + 1}/${dt.getDate()}`;
    return `
      <div class="gallery-item" onclick="showJournalDetail('${ds}')">
        <img src="${photo}" alt="${label} 연습 사진" loading="lazy">
        <div class="gallery-date">${label}</div>
      </div>`;
  }).join('');
}

// items는 최신순 정렬 상태 — 맨 앞이 최근 사진, 맨 뒤가 가장 오래된(첫날) 사진
function renderCompare(items, compareCard) {
  if (!compareCard) compareCard = document.getElementById('gallery-compare-card');
  if (items.length < 2) { compareCard.style.display = 'none'; return; }

  const latest = items[0];
  const first  = items[items.length - 1];
  const fmt = ds => { const d = new Date(ds); return `${d.getMonth() + 1}/${d.getDate()}`; };

  document.getElementById('compare-row').innerHTML = `
    <div class="compare-col">
      <img src="${first.photo}" alt="첫날 연습 사진">
      <div class="compare-label"><strong>시작</strong> · ${fmt(first.ds)}</div>
    </div>
    <div class="compare-col">
      <img src="${latest.photo}" alt="최근 연습 사진">
      <div class="compare-label"><strong>최근</strong> · ${fmt(latest.ds)}</div>
    </div>`;
  compareCard.style.display = '';
}

// ── 통계 대시보드 ─────────────────────────────────────────
function fmtHM(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function computeStreak() {
  const cd = userData.completedDays || {};
  let d = new Date();
  // 오늘 아직 안 했어도 어제까지 이어져 있으면 스트릭 유지 (오늘 할 시간이 남아있으니까)
  if (!cd[ymd(d)]) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (cd[ymd(d)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// 누적 연습시간 면적 그래프 — 시작일부터 오늘까지 계속 쌓이는 총량
function renderCumulativeChart(ps) {
  const box = document.getElementById('cumulative-chart');
  const totalEl = document.getElementById('cumulative-total');
  if (!box) return;

  // 시작일 ~ 오늘까지 날짜별 누적 (연습 기록이 있는 구간만 의미 있게)
  const start = new Date(userData.startDate || today());
  const end = new Date(today());
  const dayCount = Math.max(Math.floor((end - start) / 864e5) + 1, 1);
  const N = Math.min(dayCount, 84); // 최대 84일

  const pts = [];
  let cum = 0;
  for (let i = 0; i < N; i++) {
    const dt = new Date(start); dt.setDate(dt.getDate() + i);
    cum += (ps[ymd(dt)] || 0);
    pts.push({ dt, cumMin: Math.round(cum / 60) });
  }
  const totalMin = pts.length ? pts[pts.length - 1].cumMin : 0;
  if (totalEl) totalEl.textContent = fmtHM(totalMin * 60);

  if (totalMin === 0) {
    box.innerHTML = '<div style="text-align:center;color:#bbb;font-size:12px;padding:24px 0">아직 쌓인 연습 시간이 없어요.<br>연습을 시작하면 그래프가 우상향해요! 🏔️</div>';
    return;
  }

  const W = 320, H = 150, padL = 32, padR = 10, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxCum = Math.max(totalMin, 10);
  const x = i => padL + (plotW * i / Math.max(N - 1, 1));
  const y = m => padT + plotH - (plotH * m / maxCum);

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.cumMin).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${x(N-1).toFixed(1)},${(padT+plotH).toFixed(1)} L${x(0).toFixed(1)},${(padT+plotH).toFixed(1)} Z`;
  const grids = [0, Math.round(maxCum/2), maxCum];

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">`;
  svg += `<defs><linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">`
       + `<stop offset="0%" stop-color="#40916C" stop-opacity="0.35"/>`
       + `<stop offset="100%" stop-color="#40916C" stop-opacity="0.02"/></linearGradient></defs>`;
  grids.forEach(g => {
    const gy = y(g);
    svg += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W-padR}" y2="${gy.toFixed(1)}" stroke="#eee" stroke-width="1"/>`;
    svg += `<text x="${padL-6}" y="${(gy+3).toFixed(1)}" text-anchor="end" font-size="9" fill="#bbb">${g}</text>`;
  });
  svg += `<path d="${areaPath}" fill="url(#cumGrad)"/>`;
  svg += `<path d="${linePath}" fill="none" stroke="#2D6A4F" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  // 마지막 점 강조
  const last = pts[pts.length - 1];
  svg += `<circle cx="${x(N-1).toFixed(1)}" cy="${y(last.cumMin).toFixed(1)}" r="4" fill="#2D6A4F"/>`;
  svg += `<circle cx="${x(N-1).toFixed(1)}" cy="${y(last.cumMin).toFixed(1)}" r="8" fill="#2D6A4F" opacity="0.15"/>`;
  // x축 날짜 (시작·중간·오늘)
  [0, Math.floor((N-1)/2), N-1].forEach(i => {
    const p = pts[i];
    const label = `${p.dt.getMonth()+1}/${p.dt.getDate()}`;
    svg += `<text x="${x(i).toFixed(1)}" y="${(H-8).toFixed(1)}" text-anchor="middle" font-size="9" fill="#999">${label}</text>`;
  });
  svg += `</svg>`;
  box.innerHTML = svg;
}

// 최근 14일 일별 연습시간 꺾은선 그래프 (SVG, 라이브러리 없음)
function renderDailyLineChart(ps) {
  const box = document.getElementById('daily-line-chart');
  if (!box) return;
  const DAYS = 14;
  const pts = [];
  const base = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const dt = new Date(base); dt.setDate(dt.getDate() - i);
    const min = Math.round((ps[ymd(dt)] || 0) / 60);
    pts.push({ dt, min });
  }
  const maxMin = Math.max(...pts.map(p => p.min), 10);

  const W = 320, H = 150, padL = 28, padR = 10, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = i => padL + (plotW * i / (DAYS - 1));
  const y = m => padT + plotH - (plotH * m / maxMin);

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.min).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${x(DAYS-1).toFixed(1)},${(padT+plotH).toFixed(1)} L${x(0).toFixed(1)},${(padT+plotH).toFixed(1)} Z`;
  const grids = [0, Math.round(maxMin/2), maxMin];

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">`;
  grids.forEach(g => {
    const gy = y(g);
    svg += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W-padR}" y2="${gy.toFixed(1)}" stroke="#eee" stroke-width="1"/>`;
    svg += `<text x="${padL-6}" y="${(gy+3).toFixed(1)}" text-anchor="end" font-size="9" fill="#bbb">${g}</text>`;
  });
  svg += `<path d="${areaPath}" fill="#D8F3DC" opacity="0.5"/>`;
  svg += `<path d="${linePath}" fill="none" stroke="#2D6A4F" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  pts.forEach((p, i) => {
    if (p.min > 0) {
      svg += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.min).toFixed(1)}" r="3" fill="#2D6A4F"/>`;
      svg += `<text x="${x(i).toFixed(1)}" y="${(y(p.min)-7).toFixed(1)}" text-anchor="middle" font-size="9" fill="#2D6A4F" font-weight="600">${p.min}</text>`;
    }
  });
  pts.forEach((p, i) => {
    if (i % 3 === 0 || i === DAYS - 1) {
      const label = `${p.dt.getMonth()+1}/${p.dt.getDate()}`;
      svg += `<text x="${x(i).toFixed(1)}" y="${(H-8).toFixed(1)}" text-anchor="middle" font-size="9" fill="#999">${label}</text>`;
    }
  });
  svg += `</svg>`;

  const hasAny = pts.some(p => p.min > 0);
  box.innerHTML = hasAny ? svg : '<div style="text-align:center;color:#bbb;font-size:12px;padding:24px 0">아직 연습 기록이 없어요.<br>연습하고 저장하면 그래프가 그려져요.</div>';
}

function renderStats() {
  const cd = userData.completedDays  || {};
  const ps = userData.practiceSeconds || {};
  const start = new Date(userData.startDate || today());

  // 총 연습시간 / 하루 평균
  const totalSec = Object.values(ps).reduce((a, b) => a + b, 0);
  const daysWithTime = Object.values(ps).filter(s => s > 0).length;
  document.getElementById('stat-total-time').textContent = totalSec > 0 ? fmtHM(totalSec) : '0분';
  document.getElementById('stat-avg-time').textContent = daysWithTime ? Math.round(totalSec / 60 / daysWithTime) + '분' : '-';

  // 연속 기록
  document.getElementById('stat-streak').textContent = computeStreak() + '일';

  // 이번 주(현재 주차) 연습시간
  const n = Math.min(Math.max(dayFromStart(), 1), 84);
  const { w: curW } = wkDay(n);
  const curWeekStart = new Date(start); curWeekStart.setDate(curWeekStart.getDate() + (curW - 1) * 7);
  let weekSec = 0;
  for (let i = 0; i < 7; i++) {
    const dt = new Date(curWeekStart); dt.setDate(dt.getDate() + i);
    weekSec += ps[ymd(dt)] || 0;
  }
  document.getElementById('stat-week-time').textContent = Math.round(weekSec / 60) + '분';

  // 최근 14일 일별 연습시간 꺾은선 그래프
  renderDailyLineChart(ps);
  renderCumulativeChart(ps);

  // 주차별 연습시간 막대그래프 (1~12주)
  const weekMin = [];
  for (let wi = 0; wi < 12; wi++) {
    const ws = new Date(start); ws.setDate(ws.getDate() + wi * 7);
    let sec = 0;
    for (let i = 0; i < 7; i++) {
      const dt = new Date(ws); dt.setDate(dt.getDate() + i);
      sec += ps[ymd(dt)] || 0;
    }
    weekMin.push(Math.round(sec / 60));
  }
  const maxWeekMin = Math.max(...weekMin, 1);
  document.getElementById('week-chart').innerHTML = weekMin.map((m, i) => `
    <div class="bar-col${i + 1 === curW ? ' today' : ''}">
      <div class="bar-value">${m > 0 ? m + '분' : ''}</div>
      <div class="bar" style="height:${m > 0 ? Math.max(m / maxWeekMin * 100, 4) : 0}%"></div>
      <div class="bar-label">${i + 1}주</div>
    </div>`).join('');

  // 요일별 참여 현황 (완료한 날 기준, 일~토)
  const dowCount = [0, 0, 0, 0, 0, 0, 0];
  Object.keys(cd).forEach(ds => { if (cd[ds]) dowCount[new Date(ds).getDay()]++; });
  const maxDow = Math.max(...dowCount, 1);
  const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const todayDow = new Date().getDay();
  document.getElementById('dow-chart').innerHTML = dowCount.map((c, i) => `
    <div class="bar-col${i === todayDow ? ' today' : ''}">
      <div class="bar-value">${c > 0 ? c + '회' : ''}</div>
      <div class="bar" style="height:${c > 0 ? Math.max(c / maxDow * 100, 4) : 0}%"></div>
      <div class="bar-label">${dowLabels[i]}</div>
    </div>`).join('');

  // 달성 배지 (누적 완료 일수 기준 — 스트릭이 끊겨도 한 번 딴 배지는 유지)
  const MILESTONES = [
    { days: 3,  icon: '🌱', label: '새싹' },
    { days: 7,  icon: '🔥', label: '일주일' },
    { days: 14, icon: '⭐', label: '2주 완주' },
    { days: 30, icon: '💪', label: '한 달' },
    { days: 50, icon: '🏆', label: '50일' },
    { days: 84, icon: '🎉', label: '전체 완주' }
  ];
  const totalDone = doneCount();
  document.getElementById('badge-grid').innerHTML = MILESTONES.map(m => `
    <div class="badge-item${totalDone >= m.days ? ' earned' : ''}">
      <div class="badge-icon">${m.icon}</div>
      <div class="badge-label">${m.label}<br>${m.days}일</div>
    </div>`).join('');

  // 주차 완주 배지 (해당 주 7일을 모두 완료했을 때)
  const weekBadges = [];
  for (let wi = 0; wi < 12; wi++) {
    const ws = new Date(start); ws.setDate(ws.getDate() + wi * 7);
    let allDone = true;
    for (let i = 0; i < 7; i++) {
      const dt = new Date(ws); dt.setDate(dt.getDate() + i);
      if (!cd[ymd(dt)]) { allDone = false; break; }
    }
    weekBadges.push(allDone);
  }
  document.getElementById('week-badge-row').innerHTML = weekBadges.map((done, i) => `
    <div class="week-badge${done ? ' earned' : ''}" title="${i + 1}주차${done ? ' 완주!' : ''}">${i + 1}</div>`).join('');
}

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
  maybeShowOnboard();
  maybeShowReminder();
};

// ── 첫 사용자 안내(온보딩) ────────────────────────────────
let onboardIdx = 0;
function maybeShowOnboard() {
  // 아직 완료한 날이 하나도 없고, 온보딩을 본 적 없으면 표시
  if (userData.onboarded) return;
  if (doneCount() > 0) { userData.onboarded = true; saveUserData(); return; }
  onboardIdx = 0;
  renderOnboardDots();
  updateOnboardSlide();
  document.getElementById('onboard-modal').classList.remove('hidden');
}
function renderOnboardDots() {
  const total = document.querySelectorAll('.onboard-slide').length;
  const dots = document.getElementById('onboard-dots');
  let html = '';
  for (let i = 0; i < total; i++) html += `<div class="onboard-dot${i === 0 ? ' active' : ''}"></div>`;
  dots.innerHTML = html;
}
function updateOnboardSlide() {
  const slides = document.querySelectorAll('.onboard-slide');
  const dots = document.querySelectorAll('.onboard-dot');
  slides.forEach((s, i) => s.classList.toggle('active', i === onboardIdx));
  dots.forEach((dot, i) => dot.classList.toggle('active', i === onboardIdx));
  const isLast = onboardIdx === slides.length - 1;
  document.getElementById('onboard-next').textContent = isLast ? '시작하기' : '다음';
  document.getElementById('onboard-skip').style.visibility = isLast ? 'hidden' : 'visible';
}
window.onboardNext = function() {
  const total = document.querySelectorAll('.onboard-slide').length;
  if (onboardIdx < total - 1) {
    onboardIdx++;
    updateOnboardSlide();
  } else {
    closeOnboard();
  }
};
window.closeOnboard = function() {
  document.getElementById('onboard-modal').classList.add('hidden');
  userData.onboarded = true;
  saveUserData();
};

// ── 데이터 백업 / 내보내기 / 복원 ─────────────────────────
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 복원용 JSON (사진은 별도 저장이라 제외 — 텍스트 기록/시간/진도만 백업)
window.exportJSON = function() {
  const backup = {
    _type: 'handwriting-coach-backup',
    _version: 1,
    _exportedAt: new Date().toISOString(),
    startDate: userData.startDate,
    completedDays: userData.completedDays || {},
    journals: userData.journals || {},
    practiceSeconds: userData.practiceSeconds || {},
    onboarded: userData.onboarded || false
  };
  const stamp = today().replace(/-/g, '');
  downloadFile(`악필교정_백업_${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
};

// 읽기용 텍스트 (사람이 읽기 좋은 일기장 형태)
window.exportText = function() {
  const cd = userData.completedDays  || {};
  const jn = userData.journals       || {};
  const ps = userData.practiceSeconds || {};
  const dates = Array.from(new Set([...Object.keys(cd), ...Object.keys(jn), ...Object.keys(ps)])).sort();

  let out = '12주 악필 교정 챌린저 — 나의 연습 기록\n';
  out += `내보낸 날짜: ${today()}\n`;
  out += `총 완료: ${doneCount()}일 / 84일\n`;
  out += '='.repeat(40) + '\n\n';

  if (dates.length === 0) {
    out += '아직 저장된 기록이 없습니다.\n';
  }

  const start = new Date(userData.startDate || today());
  dates.forEach(ds => {
    const dt = new Date(ds);
    const dn = Math.min(Math.max(Math.floor((dt - start) / 864e5) + 1, 1), 84);
    const { w, d } = wkDay(dn);
    const sec = ps[ds] || 0;
    const min = Math.floor(sec / 60), s = sec % 60;
    const j = jn[ds] || {};

    out += `[${ds}] Day ${dn}/84 · ${w}주차 ${d}일차\n`;
    if (sec > 0) out += `  ⏱ 연습 시간: ${min}분 ${s}초\n`;
    if (j.selfCheck) out += `  🔍 자가 진단: ${selfCheckLabel(j.selfCheck)}\n`;
    if (j.weakness) out += `  ✏️ 불규칙한 부분: ${j.weakness}\n`;
    if (j.feedback) {
      // 마크다운 강조 기호 제거해서 깔끔하게
      const fb = j.feedback.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
      out += `  🤖 AI 피드백:\n`;
      fb.split('\n').forEach(line => { if (line.trim()) out += `     ${line.trim()}\n`; });
    }
    out += '\n';
  });

  const stamp = today().replace(/-/g, '');
  downloadFile(`악필교정_기록_${stamp}.txt`, out, 'text/plain;charset=utf-8');
};

// 백업 파일(JSON)로 복원
document.getElementById('restore-input').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = ''; // 같은 파일 다시 선택 가능하도록 초기화
  if (!f) return;
  try {
    const text = await f.text();
    const data = JSON.parse(text);
    if (data._type !== 'handwriting-coach-backup') {
      alert('올바른 백업 파일이 아니에요. 이 앱에서 내보낸 .json 파일을 선택해주세요.');
      return;
    }
    const cnt = Object.keys(data.completedDays || {}).length;
    if (!confirm(`백업 파일에서 ${cnt}일치 기록을 발견했어요.\n\n지금 기록을 이 백업 내용으로 덮어쓸까요?\n(현재 클라우드 기록은 백업 내용으로 대체됩니다)`)) return;

    userData.startDate       = data.startDate || userData.startDate;
    userData.completedDays   = data.completedDays   || {};
    userData.journals        = data.journals        || {};
    userData.practiceSeconds = data.practiceSeconds || {};
    userData.onboarded       = data.onboarded !== undefined ? data.onboarded : true;

    await saveUserData();
    updateDash(); renderCalendar(); loadJournal();
    if (typeof renderStats === 'function') renderStats();
    galleryCache = null;
    alert('복원이 완료됐어요! 스탬프와 통계에서 기록을 확인해보세요.\n(사진은 백업에 포함되지 않아 별도로 남아있는 것만 표시됩니다)');
  } catch (err) {
    console.error('복원 오류:', err);
    alert('파일을 읽는 중 오류가 발생했어요. 올바른 백업 파일인지 확인해주세요.');
  }
});
