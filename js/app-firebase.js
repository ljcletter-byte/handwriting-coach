// ── 날짜 헬퍼 (시간대 안전) ────────────────────────────────
const ymd = d => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const today = () => ymd(new Date());

function ymdOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymd(d);
}

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
  try { localStorage.setItem('textSizeLevel', next); } catch (e) {}
};

function applyTheme(mode) {
  if (mode) document.documentElement.setAttribute('data-theme', mode);
  else document.documentElement.removeAttribute('data-theme');
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const isDark = mode === 'dark' || (!mode && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  btn.textContent = isDark ? '☀️' : '🌙';
}
(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('themeMode'); } catch (e) {}
  const apply = () => applyTheme(saved);
  if (document.body) apply();
  else document.addEventListener('DOMContentLoaded', apply);
})();
window.toggleTheme = function() {
  const currentlyDark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (!document.documentElement.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = currentlyDark ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('themeMode', next); } catch (e) {}
};

let userData = {
  startDate: today(),
  completedDays: {},
  journals: {},
  practiceSeconds: {},
  onboarded: false
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

const MAX_BACKUPS = 10;

async function createBackupSnapshot(kind) {
  const user = window._currentUser;
  if (!user) return null;
  try {
    const ts = new Date();
    const stamp = ymd(ts) + '_' + String(ts.getHours()).padStart(2,'0') + String(ts.getMinutes()).padStart(2,'0') + String(ts.getSeconds()).padStart(2,'0');
    const backupId = `${kind}-${stamp}`;
    const ref = window._doc(window._db, 'users', user.uid, 'backups', backupId);
    await window._setDoc(ref, {
      kind,
      savedAt: ts.toISOString(),
      startDate: userData.startDate || null,
      completedDays: userData.completedDays || {},
      journals: userData.journals || {},
      practiceSeconds: userData.practiceSeconds || {},
    });
    return backupId;
  } catch (e) {
    console.error('자동 백업 저장 오류:', e);
    return null;
  }
}

async function pruneOldBackups() {
  const user = window._currentUser;
  if (!user) return;
  try {
    const col = window._collection(window._db, 'users', user.uid, 'backups');
    const snap = await window._getDocs(col);
    const docs = [];
    snap.forEach(d => docs.push({ id: d.id, savedAt: (d.data() || {}).savedAt || '' }));
    docs.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    const toDelete = docs.slice(MAX_BACKUPS);
    for (const d of toDelete) {
      try { await window._deleteDoc(window._doc(window._db, 'users', user.uid, 'backups', d.id)); }
      catch (e) { console.error('오래된 백업 삭제 오류:', e); }
    }
  } catch (e) {
    console.error('백업 정리 오류:', e);
  }
}

async function maybeAutoBackup() {
  const last = userData.lastAutoBackup;
  const gap = last ? Math.round((new Date(today()) - new Date(last)) / 864e5) : 999;
  if (gap < 7) return;
  const id = await createBackupSnapshot('auto');
  if (id) {
    userData.lastAutoBackup = today();
    await saveUserData();
    pruneOldBackups();
  }
}

async function renderBackupList() {
  const el = document.getElementById('backup-list');
  if (!el) return;
  const user = window._currentUser;
  if (!user) { el.innerHTML = '<div class="backup-empty">로그인이 필요합니다</div>'; return; }
  el.innerHTML = '<div class="backup-empty">불러오는 중...</div>';
  try {
    const col = window._collection(window._db, 'users', user.uid, 'backups');
    const snap = await window._getDocs(col);
    const docs = [];
    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    if (docs.length === 0) {
      el.innerHTML = '<div class="backup-empty">아직 자동 백업이 없어요. 앱을 사용하면서 7일마다 자동으로 쌓여요.</div>';
      return;
    }
    docs.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
    el.innerHTML = docs.map(b => {
      const dt = b.savedAt ? new Date(b.savedAt) : null;
      const dateStr = dt ? `${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}` : b.id;
      const doneCnt = Object.values(b.completedDays || {}).filter(Boolean).length;
      const badge = b.kind === 'prereset' ? '<span class="backup-item-badge">초기화 직전</span>' : '';
      return `<div class="backup-item">
        <div class="backup-item-info">
          <div class="backup-item-date">${dateStr}${badge}</div>
          <div class="backup-item-meta">완료 ${doneCnt}일 기록됨</div>
        </div>
        <button class="btn-backup-restore" onclick="restoreFromBackup('${b.id}')">이 시점으로 복원</button>
      </div>`;
    }).join('');
  } catch (e) {
    console.error('백업 목록 조회 오류:', e);
    el.innerHTML = '<div class="backup-empty">백업 목록을 불러오지 못했어요.</div>';
  }
}

window.restoreFromBackup = async function(backupId) {
  const user = window._currentUser;
  if (!user) return;
  if (!confirm('이 백업 시점으로 복원하면 현재 기록이 이 백업 내용으로 덮어써집니다.\n(복원 전 상태도 자동으로 한 번 더 백업해둘게요)\n\n정말 복원하시겠어요?')) return;
  try {
    await createBackupSnapshot('prerestore');
    const ref = window._doc(window._db, 'users', user.uid, 'backups', backupId);
    const snap = await window._getDoc(ref);
    if (!snap.exists()) { alert('백업 데이터를 찾을 수 없어요.'); return; }
    const b = snap.data();
    userData.startDate = b.startDate || today();
    userData.completedDays = b.completedDays || {};
    userData.journals = b.journals || {};
    userData.practiceSeconds = b.practiceSeconds || {};
    await saveUserData();
    alert('✅ 복원되었습니다!');
    location.reload();
  } catch (e) {
    console.error('복원 오류:', e);
    alert('복원 중 문제가 생겼어요. 다시 시도해주세요.');
  }
};

window.loginWithGoogle = async function() {
  const btn     = document.getElementById('btn-login');
  const loading = document.getElementById('login-loading');
  btn.style.display     = 'none';
  loading.style.display = 'block';
  try {
    const provider = new window._GoogleAuthProvider();
    await window._signInWithPopup(window._auth, provider);
  } catch(e) {
    if (e.code === 'auth/popup-blocked' ||
        e.code === 'auth/popup-closed-by-user' ||
        e.code === 'auth/cancelled-popup-request') {
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
  await createBackupSnapshot('prereset');
  await doReset();
  alert('✅ 초기화 완료! 오늘부터 Day 1입니다.\n(혹시 실수였다면, 통계 탭의 "자동 백업 기록"에서 방금 전 상태로 복원할 수 있어요)');
};

async function doReset() {
  userData = { startDate: today(), completedDays: {}, journals: {}, practiceSeconds: {}, onboarded: true };
  await saveUserData();
  clearInterval(tIv); tIv = null; tRun = false;
  clearInterval(swIv); swIv = null;
  tSec = 600; swSec = 0;
  breakShown = false;
  document.getElementById('btn-timer').textContent = '▶ 시작';
  document.getElementById('timer-done').classList.remove('show');
  tUpd(); swUpd(); practiceUpd();
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

const dayFromStart = () => {
  const d = Math.floor((new Date(today()) - new Date(userData.startDate)) / 864e5) + 1;
  return Math.min(Math.max(d, 1), 84);
};
const wkDay    = n => ({ w: Math.min(Math.ceil(n/7), 12), d: Math.min(((n-1)%7)+1, 7) });
const doneCount = () => Object.keys(userData.completedDays || {}).length;

const BOTTOM_TABS = ['mission', 'journal', 'calendar', 'stats'];

window.switchTab = function(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.classList.add('active');

  document.querySelectorAll('.bn-item').forEach(b => b.classList.remove('active'));
  const bnItem = document.querySelector(`.bn-item[data-tab="${name}"]`);
  if (bnItem) {
    bnItem.classList.add('active');
  } else {
    const more = document.getElementById('bn-more');
    if (more) more.classList.add('active');
  }

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

function updateDash() {
  const n = dayFromStart(), {w} = wkDay(n), done = doneCount();
  document.getElementById('dash-week').textContent = w;
  document.getElementById('dash-day').textContent  = n;
  document.getElementById('dash-done').textContent = done;
  const pct = Math.round(done / 84 * 100);
  document.getElementById('pct-text').textContent = pct + '%';
  document.getElementById('progress-fill').style.width = pct + '%';
}

let reminderDismissed = false;

function daysSinceLastPractice() {
  const cd = userData.completedDays || {};
  const dates = Object.keys(cd).filter(k => cd[k]);
  if (dates.length === 0) return null;
  dates.sort();
  const lastDate = dates[dates.length - 1];
  const last = new Date(lastDate);
  const now = new Date(today());
  return Math.round((now - last) / 864e5);
}

// 어제부터 거꾸로 세어, 며칠간 연속으로 안 했는지 계산 (오늘은 세지 않음)
function consecutiveMissedDays() {
  const cd = userData.completedDays || {};
  let missed = 0;
  for (let i = 1; i <= 365; i++) {
    const key = ymdOffset(-i);
    if (cd[key]) return missed;
    missed++;
    if (userData.startDate && key < userData.startDate) return missed;
  }
  return missed;
}

// ── 리마인더 배너 (개선됨) ──────────────────────────────────
// ① 오늘 이미 완료 → 축하  ② 오늘 안함+어제 완료 → 격려  ③ 어제도 안함 → 복귀 유도  ④ 신규 사용자 → 숨김
function maybeShowReminder() {
  const banner = document.getElementById('reminder-banner');
  if (!banner || reminderDismissed) return;

  const iconEl = document.getElementById('reminder-banner-icon');
  const textEl = document.getElementById('reminder-banner-text');

  const cd = userData.completedDays || {};
  const dates = Object.keys(cd).filter(k => cd[k]);

  if (dates.length === 0) {
    banner.classList.remove('show');
    return;
  }

  const t = today();
  const yesterday = ymdOffset(-1);
  const doneToday = !!cd[t];
  const doneYesterday = !!cd[yesterday];
  const streak = (typeof computeStreak === 'function') ? computeStreak() : 0;
  const missed = consecutiveMissedDays();

  let icon, msg;

  if (doneToday) {
    if (streak >= 50) { icon = '🏆'; msg = `${streak}일 연속! 완주가 눈앞에 있어요. 정말 대단해요.`; }
    else if (streak >= 30) { icon = '💪'; msg = `${streak}일 연속 실천! 이제 안 하는 게 오히려 어색할 정도예요.`; }
    else if (streak >= 14) { icon = '⭐'; msg = `${streak}일 연속 완주 중! 이제 근육이 진짜로 기억하기 시작해요.`; }
    else if (streak >= 7)  { icon = '🔥'; msg = `${streak}일 연속! 일주일을 넘겼으니 습관이 잡히는 중이에요.`; }
    else if (streak >= 3)  { icon = '🌿'; msg = `${streak}일 연속 실천 중! 손이 리듬을 찾기 시작해요.`; }
    else { icon = '✨'; msg = '오늘 미션 완료! 내일 또 만나요.'; }
  }
  else if (doneYesterday) {
    if (streak >= 30) { icon = '💪'; msg = `${streak}일 연속 실천 중! 오늘도 이 흐름을 이어가볼까요?`; }
    else if (streak >= 14) { icon = '🔥'; msg = `${streak}일 연속 이어오셨네요! 오늘도 10분만 함께해요.`; }
    else if (streak >= 7)  { icon = '⭐'; msg = `일주일 넘게 이어오셨네요! 오늘도 10분만 함께해요.`; }
    else if (streak >= 3)  { icon = '🌿'; msg = `${streak}일 연속 실천 중! 오늘도 좋은 흐름 이어가세요.`; }
    else { icon = '☀️'; msg = '어제도 완주하셨네요! 오늘도 10분만 함께해요.'; }
  }
  else if (missed === 1) { icon = '🌱'; msg = '어제는 쉬셨네요. 오늘 10분만 다시 이어가볼까요?'; }
  else if (missed <= 3)  { icon = '🌤️'; msg = `${missed}일 동안 연습을 못하셨어요. 지금 시작해도 전혀 늦지 않았어요!`; }
  else if (missed <= 7)  { icon = '💌'; msg = `${missed}일 만이에요! 잠깐 5분이라도 다시 시작해보면 어떨까요?`; }
  else { icon = '🌿'; msg = '오랜만이에요. 부담 갖지 마시고, 오늘은 한 글자만 써봐도 충분해요.'; }

  fillReminderBanner(banner, iconEl, textEl, icon, msg);

  if (!doneToday && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('12주 악필 교정 챌린저', { body: msg, icon: 'icon-192.png', tag: 'daily-reminder' });
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
    try {
      new Notification('12주 악필 교정 챌린저', { body: '리마인더 알림이 켜져 있어요! 👍', icon: 'icon-192.png' });
    } catch (e) {}
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
      const acc = document.getElementById('acc-weeks');
      if (acc) acc.classList.remove('open');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    c.appendChild(b);
  }
}

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
      let cellSize = 13 * PX_PER_MM;
      const neededW = chars.reduce((w, ch) => w + (ch === ' ' ? cellSize*0.35 : cellSize + gap), 0);
      if (neededW > CONTENT_W) cellSize = Math.max(7*PX_PER_MM, (CONTENT_W - chars.length*gap) / chars.length);

      drawCharRow(ctx, chars, MARGIN, y, cellSize, gap, true, fam);
      y += cellSize + 3*PX_PER_MM;
      for (let i = 0; i < practiceRows; i++) {
        drawCharRow(ctx, chars, MARGIN, y, cellSize, gap, false, fam);
        y += cellSize + 3*PX_PER_MM;
      }
      y += 4*PX_PER_MM;
    }

    drawSection('✍️ Part 2 · 단어', md.p2, md.p2d, 4);
    drawSection('✍️ Part 3 · 문장', md.p3, md.p3d, 3);

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

// 이제 미션 탭 안의 아코디언에 렌더됩니다 (이전엔 별도 탭이었음)
function renderWorksheet() {
  const target = document.getElementById('worksheet-content');
  if (!target) return;
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
  target.innerHTML = html;
}
window.checklistChange = function() {
  const checks = document.querySelectorAll('.ws-check-item input');
  if ([...checks].every(c => c.checked))
    document.querySelector('.ws-checklist').classList.add('all-done');
};

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
  if (breathCount >= BREATH_CYCLES) {
    c.textContent = '완료 ✓'; p.textContent = '마음이 차분해졌나요?'; s.textContent = '연습을 시작해봐요';
    breathPhase = 'idle';
    setTimeout(() => { c.textContent = '다시'; c.classList.add('pulse'); }, 2500);
    return;
  }
  breathPhase = 'inhale';
  c.classList.add('inhale'); c.textContent = '들숨';
  p.textContent = '코로 천천히 들이쉬세요... (4초)';
  s.textContent = `${breathCount + 1} / ${BREATH_CYCLES} 회`;
  setTimeout(() => {
    breathPhase = 'exhale'; c.classList.remove('inhale'); c.textContent = '날숨';
    p.textContent = '입으로 천천히 내쉬세요... (4초)';
    setTimeout(() => { breathCount++; doBreath(); }, 4000);
  }, 4000);
}

function setQuote() {
  document.getElementById('quote-text').innerHTML = QUOTES[dayFromStart() % QUOTES.length];
}

let warmupGuideIdx = -1;
let warmupGuideInterval = null;
let warmupGuideRemaining = 0;

window.startWarmupGuide = function() {
  document.getElementById('btn-warmup-guide').classList.add('hidden');
  document.getElementById('warmup-steps').classList.add('hidden');
  document.getElementById('warmup-guide-active').classList.remove('hidden');
  document.getElementById('mind-prep-line').classList.add('hidden');
  warmupGuideIdx = 0;
  renderWarmupGuideStep();
};

function renderWarmupGuideProgress() {
  const el = document.getElementById('warmup-guide-progress');
  if (!el) return;
  el.innerHTML = WARMUP_STEPS.map((_, i) => {
    const cls = i < warmupGuideIdx ? 'done' : (i === warmupGuideIdx ? 'current' : '');
    return `<span class="${cls}"></span>`;
  }).join('');
}

function renderWarmupGuideStep() {
  if (warmupGuideInterval) { clearInterval(warmupGuideInterval); warmupGuideInterval = null; }
  if (warmupGuideIdx >= WARMUP_STEPS.length) { finishWarmupGuide(); return; }
  const step = WARMUP_STEPS[warmupGuideIdx];
  document.getElementById('warmup-guide-icon').textContent = step.icon;
  document.getElementById('warmup-guide-title').textContent = step.title;
  document.getElementById('warmup-guide-desc').textContent = step.desc;
  warmupGuideRemaining = step.sec;
  document.getElementById('warmup-guide-timer').textContent = warmupGuideRemaining;
  renderWarmupGuideProgress();
  warmupGuideInterval = setInterval(() => {
    warmupGuideRemaining--;
    const t = document.getElementById('warmup-guide-timer');
    if (t) t.textContent = Math.max(0, warmupGuideRemaining);
    if (warmupGuideRemaining <= 0) {
      clearInterval(warmupGuideInterval); warmupGuideInterval = null;
      warmupGuideIdx++;
      renderWarmupGuideStep();
    }
  }, 1000);
}

window.skipWarmupStep = function() {
  warmupGuideIdx++;
  renderWarmupGuideStep();
};

window.stopWarmupGuide = function() {
  if (warmupGuideInterval) { clearInterval(warmupGuideInterval); warmupGuideInterval = null; }
  warmupGuideIdx = -1;
  document.getElementById('warmup-guide-active').classList.add('hidden');
  document.getElementById('warmup-steps').classList.remove('hidden');
  document.getElementById('btn-warmup-guide').classList.remove('hidden');
  document.getElementById('mind-prep-line').classList.add('hidden');
};

function finishWarmupGuide() {
  document.getElementById('warmup-guide-active').classList.add('hidden');
  document.getElementById('warmup-steps').classList.remove('hidden');
  const btn = document.getElementById('btn-warmup-guide');
  btn.classList.remove('hidden');
  btn.textContent = '✓ 손 풀기 완료! 다시 하려면 눌러주세요';
  const prep = document.getElementById('mind-prep-line');
  prep.textContent = MIND_PREP_LINE;
  prep.classList.remove('hidden');
  const circle = document.getElementById('breath-circle');
  if (circle) {
    circle.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { if (breathPhase === 'idle') window.startBreath(); }, 2500);
  }
}

let tSec = 600, tRun = false, tIv = null;
let breakShown = false;
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
    clearInterval(tIv); tIv = null; tRun = false;
    clearInterval(swIv); swIv = null;
    btn.textContent = '▶ 계속';
  } else {
    btn.textContent = '⏸ 일시정지';
    if (tSec > 0) {
      tRun = true;
      tIv = setInterval(() => {
        tSec--; tUpd();
        if (tSec === 300 && !breakShown) {
          breakShown = true;
          showWristBreak();
        }
        if (tSec <= 0) {
          clearInterval(tIv); tIv = null; tRun = false;
          document.getElementById('timer-done').classList.add('show');
          beep();
        }
      }, 1000);
    }
    swIv = setInterval(() => { swSec++; swUpd(); practiceUpd(); }, 1000);
  }
  tUpd();
};

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

function showWristBreak() {
  softChime();
  const el = document.getElementById('wrist-break');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(window._wristBreakTimer);
  window._wristBreakTimer = setTimeout(() => el.classList.remove('show'), 12000);
}
window.closeWristBreak = function() {
  const el = document.getElementById('wrist-break');
  if (el) el.classList.remove('show');
  clearTimeout(window._wristBreakTimer);
};

let uploadedImg = null;
let uploadedThumb = null;

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
    uploadedImg   = await resizeImage(f, 1200, 0.8);
    uploadedThumb = await resizeImage(f, 700, 0.6);
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
  const t = journalDate;
  if (!userData.journals)     userData.journals = {};
  if (!userData.completedDays) userData.completedDays = {};
  if (!userData.practiceSeconds) userData.practiceSeconds = {};
  if (swIv) {
    clearInterval(swIv); swIv = null;
    clearInterval(tIv); tIv = null; tRun = false;
    document.getElementById('btn-timer').textContent = '▶ 시작';
  }
  if (swSec > 0) {
    const realToday = today();
    userData.practiceSeconds[realToday] = (userData.practiceSeconds[realToday] || 0) + swSec;
    swSec = 0;
    swUpd(); practiceUpd();
  }
  let hasPhoto = (userData.journals[t] && userData.journals[t].hasPhoto) || false;
  if (uploadedThumb && window._currentUser) {
    try {
      const photoRef = window._doc(window._db, 'users', window._currentUser.uid, 'journalPhotos', t);
      const savedPhoto = uploadedThumb;
      await window._setDoc(photoRef, { photo: savedPhoto, savedAt: new Date().toISOString() });
      hasPhoto = true;
      uploadedThumb = null;
      if (galleryCache) {
        const idx = galleryCache.findIndex(it => it.ds === t);
        if (idx >= 0) galleryCache[idx].photo = savedPhoto;
        else { galleryCache.unshift({ ds: t, photo: savedPhoto }); galleryCache.sort((a, b) => b.ds.localeCompare(a.ds)); }
      }
    } catch (e) {
      console.error('사진 저장 오류:', e);
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

function celebrateStamp() {
  const el = document.getElementById('stamp-celebrate');
  if (!el) return;
  const flower = document.getElementById('stamp-flower');
  const streak = (typeof computeStreak === 'function') ? computeStreak() : 0;
  const cap = document.getElementById('stamp-caption');
  if (cap) {
    cap.textContent = streak >= 2
      ? `${streak}일 연속 달성! 대단해요 🔥`
      : '오늘도 완료! 수고했어요 🎉';
  }
  el.classList.remove('hidden');
  if (flower) { flower.style.animation = 'none'; void flower.offsetWidth; flower.style.animation = ''; }
  if (typeof beep === 'function') beep();
  clearTimeout(window._stampTimer);
  window._stampTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

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
  if (input.value > today()) {
    alert('아직 오지 않은 날짜는 선택할 수 없어요.');
    input.value = journalDate;
    return;
  }
  journalDate = input.value;
  loadJournal();
};

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
  selfCheckValue = j.selfCheck || null;
  renderSelfCheck();

  const input = document.getElementById('journal-date');
  if (input) { input.value = t; input.max = today(); }

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

  if (j.hasPhoto && window._currentUser) {
    try {
      const cached = galleryCache && galleryCache.find(it => it.ds === t);
      let photo = cached ? cached.photo : null;
      if (!photo) {
        const ref = window._doc(window._db, 'users', window._currentUser.uid, 'journalPhotos', t);
        const snap = await window._getDoc(ref);
        if (snap.exists()) photo = snap.data().photo;
      }
      if (photo && journalDate === t) {
        uploadedImg = photo;
        uploadedThumb = null;
        if (preview) { preview.src = photo; preview.style.display = 'block'; preview.classList.add('collapsed'); }
        if (hint) hint.classList.add('show');
        if (fname) fname.textContent = '저장된 사진을 불러왔어요';
      }
    } catch (e) {
      console.error('저장된 사진 불러오기 오류:', e);
    }
  }
}

let selfCheckValue = null;
function selfCheckLabel(v) {
  return { good: '😊 잘됨', soso: '😐 보통', hard: '😥 아쉬움' }[v] || '-';
}
function renderSelfCheck() {
  const dn = (typeof journalDate !== 'undefined') ? dayNumOf(journalDate) : 1;
  const { w } = wkDay(dn);
  const mw = WEEKS[w] || WEEKS[selW];
  const q = document.getElementById('selfcheck-q');
  if (q && mw) q.innerHTML = `관찰 포인트 <strong>「${mw.focus}」</strong>를 얼마나 지켰나요?`;
  document.querySelectorAll('.selfcheck-opt').forEach(b => {
    b.classList.toggle('selected', b.dataset.v === selfCheckValue);
  });
}
window.selectSelfCheck = function(v) {
  selfCheckValue = (selfCheckValue === v) ? null : v;
  renderSelfCheck();
};

const AI_WORKER_URL = 'https://handwriting-ai-coach.ljcletter.workers.dev';

async function requestAIFeedback(uc) {
  let res;
  try {
    res = await fetch(AI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: uc }] })
    });
  } catch (networkErr) {
    const e = new Error('네트워크 연결에 실패했습니다 (' + networkErr.message + ')');
    e.retryable = true;
    throw e;
  }

  const rawText = await res.text();
  let data = null;
  try { data = rawText ? JSON.parse(rawText) : null; } catch (_) {}

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
    e.retryable = true;
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
      return;
    } catch (err) {
      lastErr = err;
      console.error(`AI 피드백 오류 (시도 ${attempt}/${MAX_TRIES}, status=${err.status || '-'}, retryable=${err.retryable}):`, err);
      const canRetry = err.retryable !== false;
      if (attempt < MAX_TRIES && canRetry) {
        const backoff = Math.min(1500 * Math.pow(1.7, attempt - 1), 8000);
        const jitter = Math.random() * 400;
        await sleep(backoff + jitter);
      } else if (!canRetry) {
        break;
      }
    }
  }

  const statusInfo = lastErr && lastErr.status ? ` [HTTP ${lastErr.status}]` : '';
  resultEl.innerHTML = '😥 AI 코치 연결에 실패했어요.<br>잠시 후 <strong>"✨ 피드백 받기"</strong>를 다시 눌러주세요.<br><span style="font-size:11px;color:#999">(오류' + statusInfo + ': ' + (lastErr ? lastErr.message : '알 수 없음') + ')</span>';
  resultEl.classList.add('show');
  loadingEl.classList.remove('show');
  document.getElementById('btn-ai').disabled = false;
};

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
      if (!body) return;
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

let galleryCache = null;

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
    items.sort((a, b) => b.ds.localeCompare(a.ds));
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

function fmtHM(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function computeStreak() {
  const cd = userData.completedDays || {};
  let d = new Date();
  if (!cd[ymd(d)]) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (cd[ymd(d)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function renderCumulativeChart(ps) {
  const box = document.getElementById('cumulative-chart');
  const totalEl = document.getElementById('cumulative-total');
  if (!box) return;

  const start = new Date(userData.startDate || today());
  const end = new Date(today());
  const dayCount = Math.max(Math.floor((end - start) / 864e5) + 1, 1);
  const N = Math.min(dayCount, 84);

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
  const last = pts[pts.length - 1];
  svg += `<circle cx="${x(N-1).toFixed(1)}" cy="${y(last.cumMin).toFixed(1)}" r="4" fill="#2D6A4F"/>`;
  svg += `<circle cx="${x(N-1).toFixed(1)}" cy="${y(last.cumMin).toFixed(1)}" r="8" fill="#2D6A4F" opacity="0.15"/>`;
  [0, Math.floor((N-1)/2), N-1].forEach(i => {
    const p = pts[i];
    const label = `${p.dt.getMonth()+1}/${p.dt.getDate()}`;
    svg += `<text x="${x(i).toFixed(1)}" y="${(H-8).toFixed(1)}" text-anchor="middle" font-size="9" fill="#999">${label}</text>`;
  });
  svg += `</svg>`;
  box.innerHTML = svg;
}

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
  renderBackupList();

  const totalSec = Object.values(ps).reduce((a, b) => a + b, 0);
  const daysWithTime = Object.values(ps).filter(s => s > 0).length;
  document.getElementById('stat-total-time').textContent = totalSec > 0 ? fmtHM(totalSec) : '0분';
  document.getElementById('stat-avg-time').textContent = daysWithTime ? Math.round(totalSec / 60 / daysWithTime) + '분' : '-';

  document.getElementById('stat-streak').textContent = computeStreak() + '일';

  const n = Math.min(Math.max(dayFromStart(), 1), 84);
  const { w: curW } = wkDay(n);
  const curWeekStart = new Date(start); curWeekStart.setDate(curWeekStart.getDate() + (curW - 1) * 7);
  let weekSec = 0;
  for (let i = 0; i < 7; i++) {
    const dt = new Date(curWeekStart); dt.setDate(dt.getDate() + i);
    weekSec += ps[ymd(dt)] || 0;
  }
  document.getElementById('stat-week-time').textContent = Math.round(weekSec / 60) + '분';

  renderDailyLineChart(ps);
  renderCumulativeChart(ps);

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
  maybeAutoBackup();
};

let onboardIdx = 0;
function maybeShowOnboard() {
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

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
      const fb = j.feedback.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
      out += `  🤖 AI 피드백:\n`;
      fb.split('\n').forEach(line => { if (line.trim()) out += `     ${line.trim()}\n`; });
    }
    out += '\n';
  });

  const stamp = today().replace(/-/g, '');
  downloadFile(`악필교정_기록_${stamp}.txt`, out, 'text/plain;charset=utf-8');
};

document.getElementById('restore-input').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
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
