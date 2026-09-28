'use strict';
(() => {
const D = globalThis.FE_DATA;
const C = globalThis.PlannerCore;
const PORTRAITS = globalThis.FE_PORTRAITS || {};
const KEY = 'banshisenko-planner:v1';
const UI_KEY = 'banshisenko-planner:ui';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const chars = new Map(D.characters.map(c => [c.id, c]));
const jobs = new Map(D.classes.map(j => [j.id, j]));
const routes = new Map(D.routes.map(r => [r.id, r]));
const STAT_KEYS = C.STATS.map(([k]) => k);
const PROFS = ['검', '창', '도끼', '활', '격투', '흑마법', '백마법', '기마', '비행', '중장', '보병', '지휘'];
const QUICK = ['물리', '마법', '활', '기병', '비행', '중장', '힐러'];
const AUTO_TAGS = ['고속 물리', '물리 딜탱', '마법 딜러', '마법탱', '하이브리드', '고기술/필살형', '지원형', '기병 시너지', '비행 시너지', '활 시너지', '필살', '추격', '회복', '전열 지원', '마법 시너지'];
const TIERS = [...new Map(D.classes.map(j => [j.rank, j.tier]))].sort((a, b) => a[0] - b[0]);
const SORTS = [['default', '기본'], ['name', '이름'], ...C.STATS.map(([k, n]) => [k, `${n} 높은 순`])];
// A count at or above these marks is highlighted as overlap. It is a fact, not a verdict.
const DUP = { role: 4, weapon: 4, job: 2 };

/* ---------- icons ---------- */
const svg = (d, extra = '') => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  compare: svg('<rect x="3.5" y="5" width="7" height="14" rx="1.5"/><rect x="13.5" y="5" width="7" height="14" rx="1.5"/>'),
  grip: svg('<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>', 'style="fill:currentColor;stroke:none"'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  gear: svg('<circle cx="12" cy="12" r="7.6" stroke-width="3.2" stroke-dasharray="2.99 2.98" stroke-linecap="butt"/><circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="2"/>'),
  chev: svg('<path d="m6 9 6 6 6-6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>'),
  up: svg('<path d="m6 15 6-6 6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'),
  shield: svg('<path d="M12 3 20 6v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6Z"/>'),
  bars: svg('<path d="M5 20v-8M12 20V5M19 20v-12"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>')
};

/* ---------- state ---------- */
let state = C.initial(D);
let corruptBackup = null;
let storageError = false;
let hadSaved = false;
try {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    hadSaved = true;
    try { state = C.validateState(JSON.parse(saved), D); } catch { corruptBackup = saved; }
  }
} catch { storageError = true; }
if (!hadSaved && matchMedia('(prefers-color-scheme: dark)').matches) state.settings.theme = 'dark';

const ui = {
  route: 'dietrich', view: 'planner', pane: 'squad', sort: 'default',
  filtersOpen: false, compare: [], undo: null,
  drawer: null, withClass: true, tagEdit: false, modal: null, pendingImport: null
};
try {
  const saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
  if (routes.has(saved.route)) ui.route = saved.route;
  if (SORTS.some(([k]) => k === saved.sort)) ui.sort = saved.sort;
  if (typeof saved.withClass === 'boolean') ui.withClass = saved.withClass;
} catch { /* ignore */ }
const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify({ route: ui.route, sort: ui.sort, withClass: ui.withClass })); } catch { /* ignore */ } };

const f = { q: '', assign: 'all', route: '', quick: '', role: '', job: '', strength: '', weakness: '', tag: '' };
const PANEL_FILTERS = ['route', 'role', 'job', 'strength', 'weakness', 'tag'];

/* ---------- helpers ---------- */
// Hidden characters' names must not leak through other characters' trait text.
function safe(s) {
  let t = String(s ?? '');
  if (state.settings.spoilers) return t;
  for (const c of D.characters) if (!C.visible(c, state)) t = t.replaceAll(c.name, '[비공개]');
  return t;
}
const e = s => esc(safe(s));
const isVisible = id => chars.has(id) && C.visible(chars.get(id), state);
const visibleChars = () => D.characters.filter(c => C.visible(c, state));
const shown = r => state.routes[r].filter(b => isVisible(b.characterId));
const getBuild = (r, id) => state.routes[r].find(b => b.characterId === id);
const assigned = id => D.routes.filter(r => getBuild(r.id, id));
const jobName = id => jobs.get(id)?.name || '';
const cur = () => routes.get(ui.route);
const sign = n => n == null ? '—' : n > 0 ? `+${n}` : String(n);
const filled = s => s && s.trim() !== '-' ? s.trim() : '';
const drawerBuild = () => ui.drawer && getBuild(ui.drawer.route, ui.drawer.id);
const isMobile = () => matchMedia('(max-width: 759px)').matches;

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho = s => [...s].map(ch => { const k = ch.charCodeAt(0) - 0xac00; return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : ch; }).join('');
const isCho = q => /^[ㄱ-ㅎ]+$/.test(q);

// Decode the inline data URLs once into short blob URLs so re-rendering lists stays cheap.
const portraitUrls = new Map();
function portrait(id) {
  if (portraitUrls.has(id)) return portraitUrls.get(id);
  let url = '';
  const data = PORTRAITS[id];
  if (data) {
    try {
      const comma = data.indexOf(',');
      const mime = data.slice(5, data.indexOf(';'));
      const bin = atob(data.slice(comma + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch { url = data; }
  }
  portraitUrls.set(id, url);
  return url;
}
function avatar(c, size = '') {
  const src = portrait(c.id);
  return `<span class="avatar ${size}" aria-hidden="true"><span>${e(c.name[0])}</span>${src ? `<img src="${src}" alt="" decoding="async" draggable="false">` : ''}</span>`;
}
document.addEventListener('error', ev => { if (ev.target.tagName === 'IMG' && ev.target.closest('.avatar')) ev.target.remove(); }, true);

function traits(text) {
  const s = safe(text).trim();
  if (!s || s === '-') return [];
  return s.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(.+?)\s*[:：]\s*(.*)$/);
    return m ? { name: m[1], body: m[2] } : { name: line, body: '' };
  });
}
function options(values, value, empty) {
  return (empty != null ? `<option value="">${esc(empty)}</option>` : '') + values.map(x => {
    const [v, n] = Array.isArray(x) ? x : [x, x];
    return `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${e(n)}</option>`;
  }).join('');
}
function missingParts(b) {
  const m = [];
  if (!b.roles.length) m.push('역할');
  if (!b.primary) m.push('무기');
  if (!b.movement) m.push('이동');
  if (!b.finalClass) m.push('최종직');
  return m;
}
function dupes(a) {
  const out = [];
  for (const [id, ids] of Object.entries(a.classes)) if (ids.length >= DUP.job) out.push({ label: jobName(id), n: ids.length });
  for (const [k, n] of Object.entries(a.roles)) if (n >= DUP.role) out.push({ label: k, n });
  for (const [k, n] of Object.entries(a.weapons)) if (n >= DUP.weapon) out.push({ label: k, n });
  return out;
}

/* ---------- persistence ---------- */
let saveTimer = 0;
function setStatus(text, bad = false) {
  const el = $('#save-status');
  el.textContent = text;
  el.classList.toggle('bad', bad);
}
function refreshStatus() {
  if (corruptBackup) return setStatus('임시 편집 중', true);
  if (storageError && !syncOn()) return setStatus('저장 실패', true);
  if (syncOn()) {
    if (sync.status === 'error') return setStatus('동기화 오류', true);
    if (sync.status === 'syncing' || sync.dirty) return setStatus('동기화 중…');
    return setStatus('동기화됨');
  }
  setStatus(state.updatedAt ? '저장됨' : '');
}
function writeLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageError = false;
  } catch {
    storageError = true;
  }
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  state.updatedAt = new Date().toISOString();
  if (corruptBackup) { refreshStatus(); return; }
  writeLocal();
  queuePush();
  refreshStatus();
  renderBanner();
}
function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 300);
}
addEventListener('pagehide', () => { if (saveTimer) persist(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) persist(); });
addEventListener('storage', ev => {
  if (ev.key !== KEY || !ev.newValue || corruptBackup) return;
  try {
    state = C.validateState(JSON.parse(ev.newValue), D);
    render();
  } catch { /* keep current */ }
});

/* ---------- device sync (private GitHub gist) ---------- */
const SYNC_KEY = 'banshisenko-planner:sync';
const TOKEN_URL = `https://github.com/settings/tokens/new?scopes=gist&description=${encodeURIComponent('만자천홍 부대 편성실')}`;
// base: updatedAt of the remote copy this device last saw; dirty: local edits not yet uploaded.
let lastTyped = 0;
const sync = { token: '', gistId: '', base: null, dirty: false, status: 'idle', error: '', busy: false, again: false, timer: 0, lastSync: null, pending: null };
try {
  const saved = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
  if (saved?.token && saved?.gistId) Object.assign(sync, { token: saved.token, gistId: saved.gistId, base: saved.base ?? null, dirty: !!saved.dirty });
} catch { /* ignore */ }
function syncOn() { return !!(sync.token && sync.gistId); }
function saveSync() {
  try {
    if (syncOn()) localStorage.setItem(SYNC_KEY, JSON.stringify({ token: sync.token, gistId: sync.gistId, base: sync.base, dirty: sync.dirty }));
    else localStorage.removeItem(SYNC_KEY);
  } catch { /* ignore */ }
}
function queuePush() {
  if (!syncOn()) return;
  sync.dirty = true;
  saveSync();
  clearTimeout(sync.timer);
  sync.timer = setTimeout(() => syncNow(), 1500);
}
const sameData = (a, b) => JSON.stringify([a.routes, a.characterTags, a.settings.spoilers]) === JSON.stringify([b.routes, b.characterTags, b.settings.spoilers]);
function applyRemote(raw, keepUndo) {
  let next;
  try { next = C.validateState(raw, D); } catch { throw new Error('동기화 데이터가 손상되었습니다.'); }
  next.settings.theme = state.settings.theme;
  const changed = !sameData(next, state);
  if (keepUndo && changed) snapshot();
  state = next;
  writeLocal();
  sync.base = raw.updatedAt ?? null;
  sync.dirty = false;
  render();
  return changed;
}
async function syncNow(fromPoll = false) {
  if (!syncOn() || corruptBackup) return;
  if (sync.busy) { sync.again = true; return; }
  // Do not redraw under the cursor while the user is typing.
  if (fromPoll && !sync.dirty && Date.now() - lastTyped < 4000) return;
  sync.busy = true;
  sync.status = 'syncing';
  refreshStatus();
  try {
    const remote = await GistSync.read(sync.token, sync.gistId);
    const remoteAt = remote?.updatedAt ?? null;
    const remoteMoved = remoteAt !== sync.base;
    if (remoteMoved && (!sync.dirty || (remoteAt && (!state.updatedAt || remoteAt > state.updatedAt)))) {
      // Another device saved later: take its copy. Local unsent edits stay reachable through undo.
      const conflict = sync.dirty;
      if (applyRemote(remote, conflict)) toast(conflict ? '다른 기기에서 더 최근에 바뀐 편성으로 맞췄습니다.' : '다른 기기의 변경 사항을 반영했습니다.', conflict);
    } else if (sync.dirty) {
      const at = state.updatedAt;
      await GistSync.write(sync.token, sync.gistId, state);
      sync.base = at;
      if (state.updatedAt === at) sync.dirty = false;
    }
    sync.status = 'ok';
    sync.error = '';
    sync.lastSync = new Date();
  } catch (err) {
    sync.status = 'error';
    sync.error = err.message || '동기화하지 못했습니다.';
  } finally {
    sync.busy = false;
    saveSync();
    refreshStatus();
    if (ui.modal?.kind === 'settings') renderModal();
    if (sync.again) { sync.again = false; syncNow(); }
  }
}
function finishConnect(token, gistId) {
  sync.token = token;
  sync.gistId = gistId;
  sync.status = 'ok';
  sync.error = '';
  sync.lastSync = new Date();
  sync.pending = null;
  saveSync();
  refreshStatus();
}
async function connectSync(token) {
  if (corruptBackup) { sync.error = '저장 데이터를 먼저 복구하거나 백업을 불러와주세요.'; renderModal(); return; }
  sync.error = '';
  sync.status = 'syncing';
  renderModal();
  try {
    const id = await GistSync.find(token);
    if (!id) {
      if (!state.updatedAt) { state.updatedAt = new Date().toISOString(); writeLocal(); }
      const newId = await GistSync.create(token, state);
      sync.base = state.updatedAt;
      sync.dirty = false;
      finishConnect(token, newId);
      openModal({ kind: 'settings' });
      toast('동기화를 시작했습니다. 다른 기기에서도 같은 토큰으로 연결하세요.');
      return;
    }
    const remote = await GistSync.read(token, id);
    let next;
    try { next = C.validateState(remote, D); } catch { throw new Error('GitHub의 동기화 데이터가 손상되었습니다.'); }
    if (!state.updatedAt || sameData(next, state)) {
      finishConnect(token, id);
      applyRemote(remote, true);
      openModal({ kind: 'settings' });
      toast('GitHub에 저장된 편성을 불러왔습니다.');
      return;
    }
    sync.status = 'idle';
    sync.pending = { token, id, remote };
    const when = t => t ? esc(new Date(t).toLocaleString('ko-KR')) : '기록 없음';
    const counts = st => D.routes.map(r => `${esc(r.name)} ${(st.routes[r.id] || []).length}`).join(' · ');
    openModal({ kind: 'confirm', title: '어느 편성을 사용할까요?', ok: 'GitHub 편성 사용', okAct: 'sync-use-remote', cancel: '이 기기 편성 올리기', cancelAct: 'sync-use-local',
      body: `<p>GitHub와 이 기기에 서로 다른 편성이 있습니다. 선택하지 않은 쪽은 덮어씌워집니다.</p>
        <div class="choice"><b>GitHub</b><span>마지막 수정 ${when(remote.updatedAt)}</span><span>${counts(next)}</span></div>
        <div class="choice"><b>이 기기</b><span>마지막 수정 ${when(state.updatedAt)}</span><span>${counts(state)}</span></div>` });
  } catch (err) {
    sync.status = 'idle';
    sync.error = err.message || '연결하지 못했습니다.';
    renderModal();
  }
}
setInterval(() => { if (syncOn() && !document.hidden) syncNow(true); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && syncOn()) syncNow(true); });
addEventListener('focus', () => { if (syncOn()) syncNow(true); });
addEventListener('online', () => { if (syncOn()) syncNow(); });

function snapshot() { ui.undo = C.clone(state); }
function undo() {
  if (!ui.undo) return;
  state = ui.undo;
  ui.undo = null;
  persist();
  render();
  toast('되돌렸습니다.');
}

let toastTimer;
function toast(msg, withUndo = false) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${withUndo && ui.undo ? '<button data-act="undo">되돌리기</button>' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, withUndo ? 7000 : 2600);
}

/* ---------- mutations ---------- */
function add(id, r = ui.route) {
  if (!isVisible(id) || getBuild(r, id)) return;
  state.routes[r].push(C.blankBuild(id));
  persist();
  render();
  toast(`${chars.get(id).name} → ${routes.get(r).name} 부대에 추가`);
}
function remove(id, r = ui.route) {
  if (!getBuild(r, id)) return;
  snapshot();
  state.routes[r] = state.routes[r].filter(b => b.characterId !== id);
  persist();
  render();
  toast(`${chars.get(id).name} · ${routes.get(r).name} 부대에서 제외`, true);
}
// Reorder only the visible builds; builds hidden by spoiler protection keep their slots.
function setVisibleOrder(r, ids) {
  const list = state.routes[r];
  const byId = new Map(list.map(b => [b.characterId, b]));
  const vis = new Set(ids);
  let k = 0;
  state.routes[r] = list.map(b => vis.has(b.characterId) ? byId.get(ids[k++]) : b);
}
function moveBy(id, delta, r = ui.route) {
  const ids = shown(r).map(b => b.characterId);
  const i = ids.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  setVisibleOrder(r, ids);
  persist();
  render();
}
function insertAt(id, beforeId) {
  if (!isVisible(id)) return;
  const existing = getBuild(ui.route, id);
  if (existing && !beforeId) return;
  if (!existing) {
    state.routes[ui.route].push(C.blankBuild(id));
    toast(`${chars.get(id).name} → ${cur().name} 부대에 추가`);
  }
  if (beforeId && beforeId !== id) {
    const ids = shown(ui.route).map(b => b.characterId).filter(x => x !== id);
    const k = ids.indexOf(beforeId);
    ids.splice(k < 0 ? ids.length : k, 0, id);
    setVisibleOrder(ui.route, ids);
  }
  persist();
  render();
}
function selectClass(id) {
  const b = drawerBuild();
  if (!b) return;
  const j = id ? jobs.get(id) : null;
  if (id && !j) return;
  snapshot();
  const cleared = C.applyClass(b, j);
  persist();
  closeModal();
  render();
  toast(j
    ? `${j.name} 선택 · 이동 ${b.movement || '미정'}${cleared.length ? ` · 쓸 수 없는 ${cleared.join('·')} 해제` : ''}`
    : '최종직을 비웠습니다.', true);
}
function appendPath(id) {
  const b = drawerBuild(), j = jobs.get(id);
  if (!b || !j) return;
  const path = b.path.trim();
  b.path = (path ? `${path} → ${j.name}` : j.name).slice(0, 3000);
  persist();
  closeModal();
  render();
}
function toggleCompare(id) {
  if (ui.compare.includes(id)) ui.compare = ui.compare.filter(x => x !== id);
  else if (ui.compare.length < 3) ui.compare.push(id);
  else { toast('비교는 3명까지 할 수 있습니다.'); return; }
  renderList();
  renderDrawer();
  if (ui.modal?.kind === 'compare') ui.compare.length ? renderModal() : closeModal();
}

/* ---------- render: chrome ---------- */
function applyTheme() {
  const dark = state.settings.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name="theme-color"]').content = dark ? '#171a20' : '#ffffff';
  $('#theme-btn').innerHTML = dark ? I.sun : I.moon;
  document.documentElement.style.setProperty('--route', cur().color);
}
function renderBanner() {
  const b = $('#banner');
  let msg = '';
  if (corruptBackup) msg = '저장된 편성을 읽지 못해 초기 편성으로 열었습니다. 원본은 그대로 보존되어 있습니다.';
  else if (storageError) msg = '이 브라우저에 저장할 수 없습니다. 마치기 전에 데이터를 내보내주세요.';
  b.hidden = !msg;
  b.innerHTML = msg ? `<span>${msg}</span><button class="btn sm" data-act="settings">백업 열기</button>` : '';
}
function renderRoutes() {
  $('#route-tabs').innerHTML = D.routes.map(r => `<button class="route-tab" data-act="route" data-route="${r.id}" style="--c:${r.color}" aria-pressed="${r.id === ui.route}"><i></i><span>${esc(r.name)}</span><b>${shown(r.id).length}</b></button>`).join('');
}
function renderView() {
  const planner = ui.view === 'planner';
  $('#planner').hidden = !planner;
  $('#overview').hidden = planner;
  $('#planner').dataset.pane = ui.pane;
  document.body.dataset.view = ui.view;
  $$('[data-act="view"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === ui.view)));
  $$('#bottom-nav button').forEach(b => b.setAttribute('aria-pressed', String(planner ? b.dataset.pane === ui.pane : b.dataset.pane === 'overview')));
}

/* ---------- render: list ---------- */
function matches(c) {
  const b = getBuild(ui.route, c.id);
  const rs = assigned(c.id);
  const tags = C.tags(c, state);
  const g = c.growth;
  const skills = c.strengths || [], weak = c.weaknesses || [];
  const roles = C.buildRoles(b || C.blankBuild(c.id));
  const weapons = [b?.primary, b?.secondary];
  const q = f.q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (q) {
    if (isCho(q.replace(/ /g, ''))) {
      const k = q.replace(/ /g, '');
      if (![c.name, ...c.aliases].some(n => cho(n).includes(k))) return false;
    } else {
      const text = [c.name, ...c.aliases, ...tags, c.personal, c.unique, ...skills, ...weak, b?.roleLabel, jobName(b?.finalClass)].join(' ').toLowerCase();
      if (!q.split(' ').every(w => text.includes(w))) return false;
    }
  }
  if (f.assign === 'route' && !b) return false;
  if (f.assign === 'planned' && !rs.length) return false;
  if (f.assign === 'unassigned' && rs.length) return false;
  if (f.route && !getBuild(f.route, c.id)) return false;
  if (f.role && !roles.includes(f.role)) return false;
  if (f.job && b?.finalClass !== f.job) return false;
  if (f.strength && !skills.includes(f.strength)) return false;
  if (f.weakness && !weak.includes(f.weakness)) return false;
  if (f.tag && !tags.includes(f.tag)) return false;
  switch (f.quick) {
    case '물리': return g.str >= 40 || roles.includes('물리딜');
    case '마법': return g.mg >= 40 || roles.includes('마법딜') || weapons.includes('흑마법');
    case '활': return skills.includes('활') || weapons.includes('활') || roles.includes('활');
    case '힐러': return skills.includes('백마법') || roles.includes('힐 가능');
    case '기병': return b?.movement === '기병' || skills.includes('기마');
    case '비행': return b?.movement === '비행' || skills.includes('비행');
    case '중장': return b?.movement === '중장' || skills.includes('중장');
    default: return true;
  }
}
function sortChars(list) {
  if (ui.sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (STAT_KEYS.includes(ui.sort)) return [...list].sort((a, b) => (b.growth[ui.sort] ?? -1) - (a.growth[ui.sort] ?? -1));
  return list;
}
function routeDots(id) {
  const names = assigned(id).map(r => r.name).join(' · ') || '미배정';
  return `<span class="route-dots" role="img" aria-label="${esc(names)}" title="${esc(names)}">${D.routes.map(r => `<i style="--c:${r.color}"${getBuild(r.id, id) ? ' class="on"' : ''}></i>`).join('')}</span>`;
}
function charRow(c) {
  const inRoute = !!getBuild(ui.route, c.id);
  const tags = C.tags(c, state);
  const cmp = ui.compare.includes(c.id);
  const stat = STAT_KEYS.includes(ui.sort) ? c.growth[ui.sort] : null;
  return `<li class="char-row${ui.drawer?.id === c.id ? ' active' : ''}" draggable="true" data-drag="${c.id}">
    <button class="char-open" data-act="open" data-id="${c.id}">${avatar(c)}<span class="char-text"><span class="char-name">${e(c.name)}</span><span class="char-sub">${e(tags.slice(0, 3).join(' · ')) || '&nbsp;'}</span></span>${stat != null ? `<span class="stat-badge">${stat}</span>` : ''}</button>
    ${routeDots(c.id)}
    <button class="icon-btn cmp" data-act="compare" data-id="${c.id}" aria-pressed="${cmp}" title="비교 후보" aria-label="${e(c.name)} 비교 후보">${I.compare}</button>
    <button class="add-btn${inRoute ? ' on' : ''}" data-act="${inRoute ? 'remove' : 'add'}" data-id="${c.id}" title="${inRoute ? '부대에서 제외' : '부대에 추가'}" aria-label="${e(c.name)} ${esc(cur().name)} 부대${inRoute ? '에서 제외' : '에 추가'}">${inRoute ? I.check : I.plus}</button>
  </li>`;
}
function renderList() {
  const all = visibleChars();
  const list = sortChars(all.filter(matches));
  $('#list-count').textContent = list.length === all.length ? `${all.length}명` : `${list.length} / ${all.length}명`;
  $$('#assign-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.assign === f.assign)));
  $('#assign-seg [data-assign="route"]').textContent = cur().name;
  $('#quick-chips').innerHTML = QUICK.map(q => `<button class="chip" data-act="quick" data-quick="${q}" aria-pressed="${f.quick === q}">${q}</button>`).join('');
  const active = PANEL_FILTERS.filter(k => f[k]).length;
  $('#filter-btn').innerHTML = `${svg('<path d="M4 6h16M7 12h10M10 18h4"/>')}필터${active ? `<b>${active}</b>` : ''}`;
  $('#filter-btn').setAttribute('aria-expanded', String(ui.filtersOpen));
  $('#char-list').innerHTML = list.length
    ? list.map(charRow).join('')
    : '<li class="empty">조건에 맞는 캐릭터가 없습니다.<button class="btn sm" data-act="reset-filters">검색·필터 초기화</button></li>';
  renderCompareBar();
}
function renderFilterPanel() {
  const p = $('#filter-panel');
  p.hidden = !ui.filtersOpen;
  if (!ui.filtersOpen) return;
  const allTags = [...new Set(visibleChars().flatMap(c => C.tags(c, state)))].sort((a, b) => a.localeCompare(b, 'ko'));
  p.innerHTML = `
    <label>배정 루트<select data-filter="route">${options(D.routes.map(r => [r.id, r.name]), f.route, '전체')}</select></label>
    <label>태그<select data-filter="tag">${options(allTags, f.tag, '전체')}</select></label>
    <label>특기<select data-filter="strength">${options(PROFS, f.strength, '전체')}</select></label>
    <label>약점<select data-filter="weakness">${options(PROFS, f.weakness, '전체')}</select></label>
    <label>역할 (${esc(cur().name)})<select data-filter="role">${options(C.ROLES, f.role, '전체')}</select></label>
    <label>최종직 (${esc(cur().name)})<select data-filter="job">${options(D.classes.map(j => [j.id, j.name]), f.job, '전체')}</select></label>
    <button class="btn sm" data-act="reset-filters">필터 초기화</button>`;
}
function renderCompareBar() {
  const bar = $('#compare-bar');
  ui.compare = ui.compare.filter(isVisible);
  bar.hidden = !ui.compare.length;
  if (!ui.compare.length) return;
  bar.innerHTML = `<span class="faces">${ui.compare.map(id => avatar(chars.get(id))).join('')}</span>
    <span class="label">비교 ${ui.compare.length}/3</span>
    <button class="btn sm primary" data-act="show-compare"${ui.compare.length < 2 ? ' disabled' : ''}>비교 보기</button>
    <button class="icon-btn" data-act="clear-compare" aria-label="비교 비우기">${I.x}</button>`;
}

/* ---------- render: squad ---------- */
function squadRow(b, i, a) {
  const c = chars.get(b.characterId);
  const j = jobs.get(b.finalClass);
  const role = b.roleLabel || C.buildRoles(b).join(' · ');
  const weapons = [...new Set([b.primary, b.secondary].filter(Boolean))];
  const dupJob = j && a.classes[j.id]?.length >= DUP.job;
  return `<li class="squad-row${ui.drawer?.id === c.id ? ' active' : ''}" data-id="${c.id}">
    <button class="handle" data-handle="${c.id}" aria-label="${e(c.name)} 순서 이동 (위아래 화살표)" title="끌어서 순서 변경">${I.grip}</button>
    <button class="squad-open" data-act="open" data-id="${c.id}" data-tab="build">
      <span class="squad-num">${i + 1}</span>${avatar(c)}
      <span class="squad-text"><span class="squad-name">${e(c.name)}</span><span class="squad-role${role ? '' : ' muted'}">${e(role || '역할 미정')}</span></span>
      <span class="squad-build">${j ? `<span class="pill job${dupJob ? ' dup' : ''}">${esc(j.name)}</span>` : '<span class="pill ghost">최종직 미정</span>'}${weapons.map(w => `<span class="pill">${esc(w)}</span>`).join('')}${b.movement ? `<span class="pill">${esc(b.movement)}</span>` : ''}</span>
    </button>
    <button class="icon-btn remove" data-act="remove" data-id="${c.id}" aria-label="${e(c.name)} 부대에서 제외" title="부대에서 제외">${I.x}</button>
  </li>`;
}
function renderSquad() {
  const r = cur();
  const builds = shown(r.id);
  const a = C.analyze(builds);
  const hidden = state.routes[r.id].length - builds.length;
  $('#squad-title').textContent = `${r.name} 부대`;
  $('#squad-sub').textContent = `${a.total}명 · 최종직 ${Object.keys(a.classes).length}종${a.unconfigured ? ` · 빌드 미정 ${a.unconfigured}명` : ''}`;
  const d = dupes(a);
  $('#squad-alerts').innerHTML = d.length
    ? `<div class="alerts"><span class="alerts-label">겹침</span>${d.map(x => `<button data-act="pane" data-pane="stats">${esc(x.label)} ×${x.n}</button>`).join('')}</div>`
    : '';
  $('#squad-list').innerHTML = builds.length
    ? builds.map((b, i) => squadRow(b, i, a)).join('')
    : `<li class="squad-empty">아직 편성한 동료가 없습니다.<button class="btn sm primary" data-act="focus-search">동료 찾기</button></li>`;
  $('#squad-hidden').hidden = !hidden;
  $('#squad-hidden').textContent = `스포일러 보호로 ${hidden}명이 숨겨져 있습니다.`;
}

/* ---------- render: stats ---------- */
function renderStats() {
  const r = cur();
  const builds = shown(r.id);
  const a = C.analyze(builds);
  const barRow = (label, n, dupAt) => `<div class="bar-row${n ? '' : ' zero'}${dupAt && n >= dupAt ? ' dup' : ''}"><span>${esc(label)}</span><span class="bar"><i style="width:${a.total ? Math.min(100, n / a.total * 100) : 0}%"></i></span><b>${n}</b></div>`;
  const tile = (label, n, dupAt) => `<div class="tile${n ? '' : ' zero'}${dupAt && n >= dupAt ? ' dup' : ''}"><b>${n}</b><span>${esc(label)}</span></div>`;
  const groups = Object.entries(a.classes).sort((x, y) => y[1].length - x[1].length || jobName(x[0]).localeCompare(jobName(y[0]), 'ko'));
  const todo = builds.filter(b => missingParts(b).length);
  $('#stats').innerHTML = `<div class="stats-inner">
    <div class="col-head"><div><h2>부대 분석</h2><p class="col-sub">${esc(r.name)} 부대 기준</p></div></div>
    <div class="kpis">
      <div class="kpi"><b>${a.total}</b><span>인원</span></div>
      <div class="kpi"><b>${Object.keys(a.classes).length}</b><span>최종직 종류</span></div>
      <div class="kpi${a.unconfigured ? ' warn' : ''}"><b>${a.unconfigured}</b><span>빌드 미정</span></div>
    </div>
    <section class="stat-sec"><h3>역할 <small>${a.missing.roles ? `미정 ${a.missing.roles}명` : ''}</small></h3>${C.ROLES.map(x => barRow(x, a.roles[x], DUP.role)).join('')}</section>
    <section class="stat-sec"><h3>무기 <small>${a.missing.weapons ? `미정 ${a.missing.weapons}명` : ''}</small></h3><div class="tiles">${C.WEAPONS.map(x => tile(x, a.weapons[x], DUP.weapon)).join('')}</div></section>
    <section class="stat-sec"><h3>이동 타입 <small>${a.missing.movement ? `미정 ${a.missing.movement}명` : ''}</small></h3><div class="tiles">${C.MOVEMENTS.map(x => tile(x, a.movement[x])).join('')}</div></section>
    <section class="stat-sec"><h3>최종직 <small>${a.missing.classes ? `미정 ${a.missing.classes}명` : ''}</small></h3>
      ${groups.length ? groups.map(([id, ids]) => `<div class="job-group${ids.length >= DUP.job ? ' dup' : ''}"><div class="job-top"><button data-act="class-info" data-job="${id}">${esc(jobName(id))}</button><span class="n">×${ids.length}</span></div><div class="name-links">${ids.map(cid => `<button data-act="open" data-id="${cid}" data-tab="build">${e(chars.get(cid).name)}</button>`).join('')}</div></div>`).join('') : '<p class="note">아직 지정한 최종직이 없습니다.</p>'}
    </section>
    ${todo.length ? `<section class="stat-sec"><h3>빌드 미정 <small>${todo.length}명</small></h3>${todo.map(b => `<button class="todo-row" data-act="open" data-id="${b.characterId}" data-tab="build"><b>${e(chars.get(b.characterId).name)}</b><span>${missingParts(b).join(' · ')}</span></button>`).join('')}</section>` : ''}
  </div>`;
}

/* ---------- render: overview ---------- */
function renderOverview() {
  const counts = Object.fromEntries(D.routes.map(r => [r.id, C.analyze(shown(r.id))]));
  const vis = visibleChars();
  const multi = vis.filter(c => assigned(c.id).length > 1);
  const unused = vis.filter(c => !assigned(c.id).length);
  const groups = [
    ['인원', [['인원', a => a.total]]],
    ['역할', C.ROLES.map(x => [x, a => a.roles[x], DUP.role])],
    ['무기', C.WEAPONS.map(x => [x, a => a.weapons[x], DUP.weapon])],
    ['이동 타입', C.MOVEMENTS.map(x => [x, a => a.movement[x]])]
  ];
  const labels = id => `<span class="route-labels">${assigned(id).map(r => `<span class="route-label" style="--c:${r.color}"><i></i>${esc(r.name)}</span>`).join('')}</span>`;
  $('#overview').innerHTML = `
    <div class="ov-cards">${D.routes.map(r => {
      const a = counts[r.id];
      return `<button class="ov-card" style="--c:${r.color}" data-act="route" data-route="${r.id}"><h3>${esc(r.name)}</h3><div class="big">${a.total}<small>명</small></div><p>최종직 ${Object.keys(a.classes).length}종 · 빌드 미정 ${a.unconfigured}명</p></button>`;
    }).join('')}</div>
    <div class="ov-grid">
      <section class="panel"><h2>루트별 구성 비교</h2>
        <div class="table-wrap"><table class="table">
          <thead><tr><th></th>${D.routes.map(r => `<th style="--c:${r.color}"><i></i>${esc(r.name)}</th>`).join('')}</tr></thead>
          <tbody>${groups.map(([title, rows]) => `${title !== '인원' ? `<tr class="group"><th colspan="${D.routes.length + 1}">${title}</th></tr>` : ''}${rows.map(([n, fn, dupAt]) => `<tr><th>${esc(n)}</th>${D.routes.map(r => { const v = fn(counts[r.id]); return `<td class="${v ? '' : 'zero'}${dupAt && v >= dupAt ? ' dup' : ''}">${v}</td>`; }).join('')}</tr>`).join('')}`).join('')}</tbody>
        </table></div>
      </section>
      <div>
        <section class="panel"><h2>여러 루트에 배치 <span class="count">${multi.length}명</span></h2>
          ${multi.length ? multi.map(c => `<div class="overlap-row"><button data-act="open" data-id="${c.id}">${avatar(c)}${e(c.name)}</button>${labels(c.id)}</div>`).join('') : '<p class="note">두 루트 이상에 배치한 캐릭터가 없습니다.</p>'}
        </section>
        <section class="panel"><h2>미배정 <span class="count">${unused.length}명</span></h2>
          ${unused.length ? `<div class="face-grid">${unused.map(c => `<button class="face" data-act="open" data-id="${c.id}">${avatar(c, 'md')}${e(c.name)}</button>`).join('')}</div>` : '<p class="note">모든 캐릭터가 한 루트 이상에 배치되어 있습니다.</p>'}
        </section>
      </div>
    </div>`;
}

/* ---------- drawer ---------- */
function openDrawer(id, tab) {
  if (!isVisible(id)) return;
  const wasOpen = !!ui.drawer;
  const same = ui.drawer?.id === id;
  ui.drawer = { id, route: same ? ui.drawer.route : ui.route, tab: tab || (same ? ui.drawer.tab : 'info') };
  if (!same) ui.tagEdit = false;
  renderDrawer(!same);
  const el = $('#drawer');
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('show');
  if (!wasOpen) {
    try { history.pushState({ drawer: 1 }, ''); } catch { /* ignore */ }
    requestAnimationFrame(() => $('#drawer [data-act="close-drawer"]')?.focus({ preventScroll: true }));
  }
  renderList();
  renderSquad();
}
function closeDrawer(fromHistory = false) {
  if (!ui.drawer) return;
  const id = ui.drawer.id;
  ui.drawer = null;
  ui.tagEdit = false;
  const el = $('#drawer');
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  $('#scrim').classList.remove('show');
  if (!fromHistory && history.state?.drawer) history.back();
  renderList();
  renderSquad();
  $(`.char-open[data-id="${id}"], .squad-open[data-id="${id}"]`)?.focus({ preventScroll: true });
}
addEventListener('popstate', () => { if (ui.drawer) closeDrawer(true); });

function growthBlock(c, j) {
  const withJ = j && ui.withClass;
  return `<div class="block"><div class="block-head"><h3>성장률</h3>${j ? `<label class="toggle"><input type="checkbox" id="with-class"${ui.withClass ? ' checked' : ''}>${esc(j.name)} 보정 포함</label>` : ''}</div>
    <div class="growth">${C.STATS.map(([k, n]) => {
      const base = c.growth[k];
      const add = withJ ? (j.growth[k] || 0) : 0;
      const total = base == null ? null : base + add;
      const baseW = Math.max(0, Math.min(100, add < 0 ? total : base ?? 0));
      const addW = add > 0 ? Math.max(0, Math.min(100 - baseW, add)) : 0;
      return `<div class="g-row${base >= 50 ? ' hi' : ''}"><span class="lab">${n}</span><span class="g-bar"><i style="width:${baseW}%"></i>${addW ? `<i class="cls" style="width:${addW}%"></i>` : ''}</span><span class="g-val">${total ?? '—'}${withJ && add ? `<small>${sign(add)}</small>` : ''}</span></div>`;
    }).join('')}</div></div>`;
}
function traitBlock(label, text) {
  const t = traits(text);
  if (!t.length) return `<div class="trait none"><span class="trait-label">${label}</span>없음</div>`;
  return `<details class="trait"><summary><span class="trait-label">${label}</span><span class="trait-names">${esc(t.map(x => x.name).join(' / '))}</span>${I.chev}</summary><dl>${t.map(x => `<dt>${esc(x.name)}</dt><dd>${esc(x.body || '—')}</dd>`).join('')}</dl></details>`;
}
function tagBlock(c) {
  const tags = C.tags(c, state);
  const custom = Object.hasOwn(state.characterTags, c.id);
  if (!ui.tagEdit) {
    return `<div class="block"><div class="block-head"><h3>태그${custom ? ' <small class="muted">직접 수정함</small>' : ''}</h3><button class="btn sm ghost" data-act="tag-edit">${I.pencil}수정</button></div>
      <div class="chips">${tags.length ? tags.map(t => `<span class="tag">${e(t)}</span>`).join('') : '<span class="note">태그 없음</span>'}</div></div>`;
  }
  const suggestions = AUTO_TAGS.filter(t => !tags.includes(t));
  return `<div class="block"><div class="block-head"><h3>태그 수정</h3><button class="btn sm primary" data-act="tag-edit">완료</button></div>
    <div class="tag-edit">
      <div class="chips">${tags.map(t => `<span class="tag">${e(t)}<button data-act="tag-remove" data-tag="${esc(t)}" aria-label="${esc(t)} 삭제">${I.x}</button></span>`).join('') || '<span class="note">태그 없음</span>'}</div>
      <div class="row"><input type="text" id="tag-input" maxlength="80" placeholder="새 태그 입력 후 Enter"><button class="btn sm" data-act="tag-add">추가</button></div>
      ${suggestions.length ? `<div class="chips">${suggestions.map(t => `<button class="tag add" data-act="tag-add" data-tag="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>` : ''}
      ${custom ? '<div><button class="btn sm" data-act="tag-reset">자동 태그로 되돌리기</button></div>' : ''}
    </div></div>`;
}
function pathChips(path) {
  return path.split(/→|->|>|＞|,/).map(s => s.trim()).filter(Boolean).map(n => {
    const j = D.classes.find(x => x.name.replace(/\s/g, '') === n.replace(/\s/g, ''));
    return j ? `<button class="pill job" data-act="class-info" data-job="${j.id}">${esc(j.name)}</button>` : '';
  }).join('');
}
function weaponChips(b, slot, allowed) {
  const value = b[slot];
  const chips = allowed.map(w => `<button class="chip" data-act="weapon" data-slot="${slot}" data-w="${esc(w)}" aria-pressed="${value === w}">${esc(w)}</button>`);
  if (value && !allowed.includes(value)) chips.push(`<button class="chip bad" data-act="weapon" data-slot="${slot}" data-w="${esc(value)}" title="이 병종은 사용할 수 없습니다. 눌러서 해제" aria-pressed="true">${esc(value)}</button>`);
  return `<div class="chips">${chips.join('')}</div>`;
}
function buildBlock(c, d) {
  const r = routes.get(d.route);
  const b = getBuild(d.route, c.id);
  const pick = `<div class="route-pick">${D.routes.map(x => `<button data-act="drawer-route" data-route="${x.id}" style="--c:${x.color}" class="${getBuild(x.id, c.id) ? 'member' : ''}" aria-pressed="${x.id === d.route}"><i></i>${esc(x.name)}</button>`).join('')}</div>`;
  if (!b) {
    return `<div class="block-head"><h3>루트별 빌드</h3></div>${pick}
      <div class="build-empty">${esc(r.name)} 부대에 없는 캐릭터입니다.<button class="btn primary" data-act="add" data-id="${c.id}" data-route="${r.id}">${I.plus}${esc(r.name)} 부대에 추가</button></div>`;
  }
  const j = jobs.get(b.finalClass);
  const allowed = C.classWeapons(j);
  const ids = shown(d.route).map(x => x.characterId);
  const pos = ids.indexOf(c.id);
  return `<div class="block-head"><h3>루트별 빌드</h3></div>${pick}
    <label class="field"><span class="f-label">역할 이름</span><input type="text" data-bfield="roleLabel" value="${esc(b.roleLabel)}" maxlength="150" placeholder="예: 딜탱, 마법 타조, 전열 지원"></label>
    <div class="field"><span class="f-label">집계 역할 <small>여러 개 선택</small></span><div class="chips">${C.ROLES.map(x => `<button class="chip" data-act="role" data-role="${x}" aria-pressed="${b.roles.includes(x)}">${x}</button>`).join('')}</div></div>
    <div class="field"><span class="f-label">최종직</span>
      <div class="job-field">
        <button class="job-btn${j ? '' : ' empty-job'}" data-act="pick-class" data-mode="final">${j ? `<b>${esc(j.name)}</b><span>${esc(j.tier)} · ${esc(j.movementType || '이동 미수록')} · ${esc(j.weapons.join(' · ') || '무기 자료 없음')}</span>` : '<b>병종 선택</b><span>이동 타입 자동 적용 · 무기는 병종 사용 무기로 제한</span>'}</button>
        ${j ? `<button class="icon-btn" data-act="class-info" data-job="${j.id}" aria-label="${esc(j.name)} 병종 정보" title="병종 정보">${I.info}</button>` : ''}
      </div></div>
    <div class="field"><span class="f-label">주무기${j && !j.weapons.length ? ' <small>무기 자료가 없어 전체 표시</small>' : ''}</span>${weaponChips(b, 'primary', allowed)}</div>
    <div class="field"><span class="f-label">보조무기</span>${weaponChips(b, 'secondary', allowed)}</div>
    <div class="field"><span class="f-label">이동 타입</span><div class="chips">${C.MOVEMENTS.map(x => `<button class="chip" data-act="movement" data-move="${x}" aria-pressed="${b.movement === x}">${x}</button>`).join('')}</div></div>
    <div class="field"><span class="f-label">중간 전직 경로</span>
      <div class="path-row"><input type="text" data-bfield="path" value="${esc(b.path)}" maxlength="3000" placeholder="병사 → 기갑 타조병 → 가디언"><button class="btn" data-act="pick-class" data-mode="path">${I.plus}병종</button></div>
      <div class="path-chips" id="path-chips">${pathChips(b.path)}</div></div>
    <label class="field"><span class="f-label">육성 메모</span><textarea data-bfield="notes" rows="4" maxlength="20000" placeholder="우선 훈련할 적성, 장비, 목표 등">${esc(b.notes)}</textarea></label>
    <div class="build-foot">
      <span class="order-btns">순서 ${pos + 1}/${ids.length}
        <button class="icon-btn" data-act="drawer-move" data-dir="-1" aria-label="위로"${pos <= 0 ? ' disabled' : ''}>${I.up}</button>
        <button class="icon-btn" data-act="drawer-move" data-dir="1" aria-label="아래로"${pos >= ids.length - 1 ? ' disabled' : ''}>${I.down}</button></span>
      <button class="btn sm danger" data-act="remove" data-id="${c.id}" data-route="${r.id}">${esc(r.name)} 부대에서 제외</button>
    </div>`;
}
function renderDrawer(resetScroll = false) {
  const d = ui.drawer;
  if (!d) return;
  const c = chars.get(d.id);
  if (!c || !C.visible(c, state)) { closeDrawer(); return; }
  const oldBody = $('#drawer .drawer-body');
  const scroll = resetScroll || !oldBody ? 0 : oldBody.scrollTop;
  const j = jobs.get(getBuild(d.route, c.id)?.finalClass);
  const tags = C.tags(c, state);
  const cmp = ui.compare.includes(c.id);
  $('#drawer').innerHTML = `
    <header class="drawer-head">
      ${avatar(c, 'lg')}
      <div class="dh-text">
        <h2 id="drawer-title">${e(c.name)}${c.aliases.length ? `<small>${e(c.aliases.join(', '))}</small>` : ''}</h2>
        <div class="dh-tags">${tags.slice(0, 5).map(t => `<span class="tag">${e(t)}</span>`).join('')}</div>
      </div>
      <button class="icon-btn" data-act="compare" data-id="${c.id}" aria-pressed="${cmp}" title="${cmp ? '비교 후보에서 빼기' : '비교 후보에 추가'}" aria-label="비교 후보">${I.compare}</button>
      <button class="icon-btn" data-act="close-drawer" aria-label="닫기" title="닫기 (Esc)">${I.x}</button>
    </header>
    <nav class="drawer-tabs" aria-label="상세 보기">
      <button data-act="drawer-tab" data-tab="info" aria-pressed="${d.tab === 'info'}">정보</button>
      <button data-act="drawer-tab" data-tab="build" aria-pressed="${d.tab === 'build'}">빌드 · ${esc(routes.get(d.route).name)}</button>
    </nav>
    <div class="drawer-body" data-tab="${d.tab}">
      <section class="d-info">
        ${growthBlock(c, j)}
        <div class="block"><h3>특기 · 약점</h3>
          <div class="apt"><span class="apt-label">특기</span><div class="chips">${(c.strengths || []).map(x => `<span class="pill">${esc(x)}</span>`).join('') || '<span class="note">자료 없음</span>'}</div></div>
          <div class="apt"><span class="apt-label weak">약점</span><div class="chips">${(c.weaknesses || []).map(x => `<span class="pill weak-pill">${esc(x)}</span>`).join('') || '<span class="note">자료 없음</span>'}</div></div>
        </div>
        <div class="block"><h3>특성</h3>${traitBlock('개인', c.personal)}${traitBlock('유니크', c.unique)}</div>
        ${tagBlock(c)}
      </section>
      <section class="d-build">${buildBlock(c, d)}</section>
    </div>`;
  $('#drawer .drawer-body').scrollTop = scroll;
}

/* ---------- modal ---------- */
function openModal(m) {
  ui.modal = m;
  renderModal();
  const dlg = $('#modal');
  if (!dlg.open) dlg.showModal();
  if (m.kind === 'picker' && !isMobile()) $('#picker-q')?.focus();
}
function closeModal() {
  const dlg = $('#modal');
  if (dlg.open) dlg.close();
  ui.modal = null;
}
$('#modal').addEventListener('close', () => { ui.modal = null; });
$('#modal').addEventListener('click', ev => {
  const dlg = ev.currentTarget;
  if (ev.target !== dlg) return;
  const r = dlg.getBoundingClientRect();
  if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) closeModal();
});
const mHead = (title, sub = '') => `<header class="m-head"><div><h2>${title}</h2>${sub ? `<p class="m-sub">${sub}</p>` : ''}</div><button class="icon-btn" data-act="close-modal" aria-label="닫기">${I.x}</button></header>`;

function renderModal() {
  const m = ui.modal;
  if (!m) return;
  const dlg = $('#modal');
  dlg.classList.toggle('wide', m.kind === 'compare');
  const html = {
    picker: pickerHtml, class: classHtml, compare: compareHtml, settings: settingsHtml,
    confirm: () => `${mHead(m.title)}<div class="m-body">${m.body}</div><div class="m-foot"><button class="btn" data-act="${m.cancelAct || 'close-modal'}">${m.cancel || '취소'}</button><button class="btn ${m.danger ? 'danger' : 'primary'}" data-act="${m.okAct}">${m.ok}</button></div>`,
    message: () => `${mHead(m.title)}<div class="m-body">${m.body}</div><div class="m-foot"><button class="btn primary" data-act="close-modal">확인</button></div>`
  }[m.kind]();
  dlg.innerHTML = html;
  if (m.kind === 'picker') renderPickerList();
}

function classTable(j, c) {
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th></th>${C.STATS.map(([, n]) => `<th>${n}</th>`).join('')}</tr></thead>
    <tbody>
      <tr><th>병종 성장률</th>${STAT_KEYS.map(k => `<td class="${j.growth[k] ? '' : 'zero'}">${sign(j.growth[k])}</td>`).join('')}</tr>
      <tr><th>능력치 보정</th>${STAT_KEYS.map(k => `<td class="${j.modifiers?.[k] ? '' : 'zero'}">${sign(j.modifiers?.[k])}</td>`).join('')}</tr>
      ${c ? `<tr><th>${e(c.name)}</th>${STAT_KEYS.map(k => `<td>${c.growth[k] ?? '—'}</td>`).join('')}</tr>
      <tr><th>합산 성장률</th>${STAT_KEYS.map(k => `<td class="${(c.growth[k] ?? 0) >= 50 ? 'best' : ''}">${c.growth[k] != null ? c.growth[k] + (j.growth[k] || 0) : '—'}</td>`).join('')}</tr>` : ''}
    </tbody></table></div>`;
}
function classHtml() {
  const j = jobs.get(ui.modal.job);
  const d = ui.modal.fromDrawer ? ui.drawer : null;
  const c = d ? chars.get(d.id) : null;
  const b = d ? drawerBuild() : null;
  return `${mHead(esc(j.name), `${esc(j.tier)}${j.restrictions ? ` · ${esc(j.restrictions)} 전용` : ''}`)}
    <div class="m-body">
      <div class="facts">
        <div class="fact"><span>이동 타입</span>${esc(j.movementType || '미수록')}</div>
        <div class="fact"><span>이동력 (보정)</span>${j.movement ?? '—'} (${sign(j.movementBonus)})</div>
        <div class="fact"><span>사용 무기·마법</span>${esc(j.weapons.join(' · ') || '자료 없음')}</div>
        <div class="fact"><span>적성</span>${esc(j.proficiencies.join(' · ') || '자료 없음')}</div>
      </div>
      ${classTable(j, c)}
      <h3 class="sec-title">전직 조건</h3><p class="text-block">${esc(filled(j.requirements) || '없음')}${j.restrictions ? `\n${esc(j.restrictions)} 전용` : ''}</p>
      <h3 class="sec-title">마스터 스킬</h3><p class="text-block">${esc(filled(j.master) || '자료 없음')}</p>
      ${j.skills.filter(filled).length ? `<h3 class="sec-title">병종 스킬</h3><p class="text-block">${esc(j.skills.filter(filled).join('\n'))}</p>` : ''}
    </div>
    <div class="m-foot">${b && b.finalClass !== j.id ? `<button class="btn primary" data-act="pick" data-job="${j.id}">${esc(routes.get(d.route).name)} 최종직으로 선택</button>` : ''}<button class="btn" data-act="close-modal">닫기</button></div>`;
}
function pickerHtml() {
  const m = ui.modal, d = ui.drawer, c = chars.get(d.id), b = drawerBuild();
  return `${mHead(m.mode === 'final' ? '최종직 선택' : '전직 경로에 병종 추가', `${e(c.name)} · ${esc(routes.get(d.route).name)}`)}
    <div class="m-tools">
      <label class="search"><span class="search-icon">${I.search}</span><input id="picker-q" type="search" placeholder="병종 이름, 무기, 이동 타입" value="${esc(m.q)}" autocomplete="off"></label>
      <div class="chip-row">
        <button class="chip" data-act="picker-tier" data-tier="" aria-pressed="${!m.tier}">전체</button>
        ${TIERS.map(([rank, tier]) => `<button class="chip" data-act="picker-tier" data-tier="${rank}" aria-pressed="${String(m.tier) === String(rank)}">${esc(tier)}</button>`).join('')}
        <button class="chip" data-act="picker-fit" aria-pressed="${m.fit}" title="${e(c.name)}의 특기 무기를 쓰는 병종만">특기 무기</button>
      </div>
    </div>
    <div class="m-body"><div id="picker-list" class="job-list"></div></div>
    ${m.mode === 'final' && b?.finalClass ? '<div class="m-foot"><button class="btn" data-act="clear-class">최종직 비우기</button></div>' : ''}`;
}
function renderPickerList() {
  const m = ui.modal;
  if (m?.kind !== 'picker') return;
  const d = ui.drawer, c = chars.get(d.id), b = drawerBuild();
  const q = m.q.trim().toLowerCase();
  const strengths = c.strengths || [];
  const list = D.classes.filter(j => {
    if (m.tier && String(j.rank) !== String(m.tier)) return false;
    if (m.fit && !j.weapons.some(w => strengths.includes(w))) return false;
    if (q && ![j.name, j.tier, j.movementType, ...j.weapons].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const html = TIERS.map(([rank, tier]) => {
    const rows = list.filter(j => j.rank === rank);
    if (!rows.length) return '';
    return `<p class="tier-title">${esc(tier)}</p>${rows.map(j => {
      const current = m.mode === 'final' && b?.finalClass === j.id;
      const open = m.open === j.id;
      return `<div class="job-row${current ? ' current' : ''}${open ? ' open' : ''}">
        <div class="job-row-top">
          <button class="job-main" data-act="job-expand" data-job="${j.id}" aria-expanded="${open}">${I.chev}<span><b>${esc(j.name)}</b><span>${esc(j.movementType || '이동 미수록')} ${j.movement ?? ''} · ${esc(j.weapons.join(' · ') || '무기 자료 없음')}${j.restrictions ? ` · ${esc(j.restrictions)}` : ''}</span></span></button>
          <button class="btn sm${current ? '' : ' primary'}" data-act="pick" data-job="${j.id}"${current ? ' disabled' : ''}>${current ? '선택됨' : m.mode === 'final' ? '선택' : '추가'}</button>
        </div>
        ${open ? `<div class="job-detail">${classTable(j, c)}<p><b>전직 조건</b> ${esc(filled(j.requirements) || '없음')}</p><p><b>마스터 스킬</b> ${esc(filled(j.master) || '자료 없음')}</p></div>` : ''}
      </div>`;
    }).join('')}`;
  }).join('');
  $('#picker-list').innerHTML = html || '<p class="empty">조건에 맞는 병종이 없습니다.</p>';
}
function compareHtml() {
  const cs = ui.compare.filter(isVisible).map(id => chars.get(id));
  const best = k => Math.max(...cs.map(c => c.growth[k] ?? -1));
  const r = cur();
  const text = (label, fn) => `<tr><th>${label}</th>${cs.map(c => `<td class="text">${fn(c)}</td>`).join('')}</tr>`;
  const traitCell = t => { const x = traits(t); return x.length ? x.map(y => `<details><summary>${esc(y.name)}</summary>${esc(y.body)}</details>`).join('') : '없음'; };
  return `${mHead('후보 비교', '성장률이 가장 높은 값을 강조합니다.')}
    <div class="m-body"><div class="table-wrap"><table class="table cmp-table">
      <colgroup><col class="cmp-label">${cs.map(() => '<col>').join('')}</colgroup>
      <thead><tr><th></th>${cs.map(c => `<th class="cmp-head">${avatar(c, 'md')}<b>${e(c.name)}</b></th>`).join('')}</tr></thead>
      <tbody>
        ${C.STATS.map(([k, n]) => `<tr><th>${n}</th>${cs.map(c => `<td class="${cs.length > 1 && c.growth[k] === best(k) ? 'best' : ''}">${c.growth[k] ?? '—'}</td>`).join('')}</tr>`).join('')}
        ${text('특기', c => esc((c.strengths || []).join(' · ') || '—'))}
        ${text('약점', c => esc((c.weaknesses || []).join(' · ') || '—'))}
        ${text('태그', c => e(C.tags(c, state).join(' · ') || '—'))}
        ${text('개인 특성', c => traitCell(c.personal))}
        ${text('유니크', c => traitCell(c.unique))}
        ${text('배정', c => esc(assigned(c.id).map(x => x.name).join(' · ') || '미배정'))}
        <tr><th></th>${cs.map(c => `<td>${getBuild(r.id, c.id) ? `<span class="pill">${esc(r.name)} 편성됨</span>` : `<button class="btn sm primary" data-act="add" data-id="${c.id}">${esc(r.name)}에 추가</button>`}</td>`).join('')}</tr>
        <tr><th></th>${cs.map(c => `<td><button class="btn sm ghost" data-act="compare" data-id="${c.id}">빼기</button></td>`).join('')}</tr>
      </tbody></table></div></div>
    <div class="m-foot"><button class="btn" data-act="clear-compare">비교 비우기</button><button class="btn primary" data-act="close-modal">닫기</button></div>`;
}
function syncSection() {
  if (!syncOn()) {
    return `<section class="set"><h3>기기 간 동기화</h3>
      <p>GitHub의 비공개 gist에 편성을 저장합니다. 같은 토큰으로 연결한 모든 기기에 수정 내용이 자동으로 반영됩니다.</p>
      <ol class="steps">
        <li><a href="${TOKEN_URL}" target="_blank" rel="noopener noreferrer">GitHub 토큰 만들기</a>를 열고, gist만 체크된 상태로 맨 아래 <b>Generate token</b>을 누르세요.</li>
        <li>만들어진 토큰을 아래에 붙여넣고 연결하세요. 다른 기기에서도 같은 토큰으로 한 번씩 연결하면 됩니다.</li>
      </ol>
      <div class="row"><input type="password" id="sync-token" placeholder="ghp_로 시작하는 토큰" autocomplete="off" spellcheck="false" aria-label="GitHub 토큰"><button class="btn primary" data-act="sync-connect"${sync.status === 'syncing' ? ' disabled' : ''}>${sync.status === 'syncing' ? '연결 중…' : '연결'}</button></div>
      ${sync.error ? `<p class="hint warn">${esc(sync.error)}</p>` : ''}
    </section>`;
  }
  const label = sync.status === 'error' ? '오류' : sync.status === 'syncing' || sync.dirty ? '동기화 중…' : '연결됨';
  return `<section class="set"><h3>기기 간 동기화 <small>${label}</small></h3>
    <p>수정하면 자동으로 올라가고, 다른 기기의 변경은 화면을 열거나 돌아올 때와 15초마다 반영됩니다.${sync.lastSync ? ` 마지막 확인 ${esc(sync.lastSync.toLocaleTimeString('ko-KR'))}.` : ''}</p>
    ${sync.error ? `<p class="hint warn">${esc(sync.error)}</p>` : ''}
    <div class="row"><button class="btn" data-act="sync-now"${sync.busy ? ' disabled' : ''}>지금 동기화</button><button class="btn danger" data-act="sync-disconnect">이 기기 연결 해제</button></div>
  </section>`;
}
function settingsHtml() {
  const count = visibleChars().length;
  const dark = state.settings.theme === 'dark';
  return `${mHead('설정')}
    <div class="m-body">
      ${syncSection()}
      <section class="set"><h3>스포일러 보호</h3>
        <label class="switch-row"><span>3부 이후 캐릭터도 표시</span><span class="switch"><input type="checkbox" id="spoiler-toggle"${state.settings.spoilers ? ' checked' : ''}><span></span></span></label>
        <p>현재 ${count}명 표시 중. 끄면 1·2부에 합류하는 캐릭터만 보입니다.</p></section>
      <section class="set"><h3>화면</h3>
        <div class="seg" role="group" aria-label="테마"><button data-act="set-theme" data-mode="light" aria-pressed="${!dark}">라이트</button><button data-act="set-theme" data-mode="dark" aria-pressed="${dark}">다크</button></div></section>
      <section class="set"><h3>백업 <small>${state.updatedAt ? `마지막 저장 ${esc(new Date(state.updatedAt).toLocaleString('ko-KR'))}` : ''}</small></h3>
        <p>편성·빌드·메모·태그를 JSON 파일로 저장하고, 다른 기기에서 불러올 수 있습니다.</p>
        <div class="row"><button class="btn primary" data-act="export">내보내기</button><button class="btn" data-act="import">불러오기</button>${corruptBackup ? '<button class="btn" data-act="export-corrupt">읽지 못한 원본 내보내기</button>' : ''}</div></section>
      <section class="set"><h3>초기화</h3>
        <p>처음 받은 루트별 명단으로 되돌립니다. 빌드·메모·수정한 태그가 지워집니다.</p>
        <div class="row"><button class="btn danger" data-act="reset-ask">초기 편성으로 되돌리기</button></div></section>
      <section class="set"><h3>자료 출처 <small>${esc(D.version)} 기준</small></h3>
        <ul class="sources">
          <li><a href="https://cass07.github.io/fe18-db/" target="_blank" rel="noopener noreferrer">cass07 만자천홍 DB</a><span>캐릭터·병종 성장률, 특성, 능력치 보정, 전직 조건, 마스터 스킬</span></li>
          <li><a href="https://redfreshet.com/game-tools/fe-banshisenko/" target="_blank" rel="noopener noreferrer">redfreshet 공략 도구</a><span>특기·약점, 사용 무기, 이동 타입·이동력, 합류 시점</span></li>
          <li><a href="https://fefw.azaws.workers.dev/" target="_blank" rel="noopener noreferrer">만자천홍 육성 도감</a><span>1부 초상화</span></li>
        </ul></section>
    </div>`;
}

/* ---------- backup ---------- */
function download(value, name) {
  const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportState() {
  download({ ...state, exportedAt: new Date().toISOString() }, `만자천홍-편성-${new Date().toISOString().slice(0, 10)}.json`);
  toast('백업 파일을 내보냈습니다.');
}
$('#import-file').addEventListener('change', async ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('2MB 이하 파일만 불러올 수 있습니다.');
    ui.pendingImport = C.validateState(JSON.parse(await file.text()), D);
    const counts = D.routes.map(r => `<span class="route-label" style="--c:${r.color}"><i></i>${esc(r.name)} ${ui.pendingImport.routes[r.id].length}명</span>`).join('');
    openModal({ kind: 'confirm', title: '백업 불러오기', ok: '이 백업으로 교체', okAct: 'import-apply', cancel: '취소',
      body: `<p><b>${esc(file.name)}</b></p><div class="preview-counts">${counts}</div><p>현재 편성을 이 파일의 내용으로 교체합니다. 스포일러 보호는 켜진 상태로 적용됩니다.</p>` });
  } catch (err) {
    ui.pendingImport = null;
    openModal({ kind: 'message', title: '불러올 수 없습니다', body: `<p>${esc(err instanceof SyntaxError ? 'JSON 형식이 올바르지 않습니다.' : err.message)}</p><p>현재 편성은 그대로입니다.</p>` });
  }
});

/* ---------- actions ---------- */
function focusSearch() {
  ui.view = 'planner';
  if (isMobile()) ui.pane = 'list';
  renderView();
  const s = $('#search');
  s.focus();
  s.select();
}
function tagsOf(id) { return [...C.tags(chars.get(id), state)]; }
function setTags(id, list) {
  const clean = [...new Set(list.map(t => t.trim()).filter(Boolean))];
  if (clean.length > 30 || clean.some(t => t.length > 80)) { toast('태그는 30개, 한 개당 80자까지입니다.'); return; }
  state.characterTags[id] = clean;
  persist();
  render();
}

const A = {
  route(d) { ui.route = d.route; ui.view = 'planner'; saveUi(); if (ui.drawer) ui.drawer.route = d.route; render(); },
  view(d) { ui.view = d.view; render(); scrollTo(0, 0); },
  pane(d) {
    if (d.pane === 'overview') ui.view = 'overview';
    else { ui.view = 'planner'; ui.pane = d.pane; }
    render();
    scrollTo(0, 0);
  },
  theme() { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; persist(); applyTheme(); },
  'set-theme'(d) { state.settings.theme = d.mode; persist(); applyTheme(); renderModal(); },
  settings() { openModal({ kind: 'settings' }); },
  open(d) { openDrawer(d.id, d.tab); },
  'close-drawer'() { closeDrawer(); },
  'drawer-tab'(d) { ui.drawer.tab = d.tab; renderDrawer(true); },
  'drawer-route'(d) { ui.drawer.route = d.route; ui.drawer.tab = 'build'; renderDrawer(); },
  'drawer-move'(d) { moveBy(ui.drawer.id, Number(d.dir), ui.drawer.route); },
  add(d) { add(d.id, d.route || ui.route); },
  remove(d) { remove(d.id, d.route || ui.route); },
  compare(d) { toggleCompare(d.id); },
  'show-compare'() { if (ui.compare.length >= 2) openModal({ kind: 'compare' }); },
  'clear-compare'() { ui.compare = []; if (ui.modal?.kind === 'compare') closeModal(); renderList(); renderDrawer(); },
  assign(d) { f.assign = d.assign; renderList(); },
  quick(d) { f.quick = f.quick === d.quick ? '' : d.quick; renderList(); },
  'toggle-filters'() { ui.filtersOpen = !ui.filtersOpen; renderFilterPanel(); renderList(); },
  'reset-filters'() {
    Object.keys(f).forEach(k => { f[k] = k === 'assign' ? 'all' : ''; });
    $('#search').value = '';
    renderFilterPanel();
    renderList();
  },
  'focus-search'() { focusSearch(); },
  role(d) {
    const b = drawerBuild();
    if (!b) return;
    b.roles = b.roles.includes(d.role) ? b.roles.filter(x => x !== d.role) : C.ROLES.filter(x => x === d.role || b.roles.includes(x));
    persist();
    render();
  },
  weapon(d) {
    const b = drawerBuild();
    if (!b) return;
    const other = d.slot === 'primary' ? 'secondary' : 'primary';
    if (b[d.slot] === d.w) b[d.slot] = '';
    else {
      if (!C.classWeapons(jobs.get(b.finalClass)).includes(d.w)) return;
      b[d.slot] = d.w;
      if (b[other] === d.w) b[other] = '';
    }
    persist();
    render();
  },
  movement(d) {
    const b = drawerBuild();
    if (!b) return;
    b.movement = b.movement === d.move ? '' : d.move;
    persist();
    render();
  },
  'pick-class'(d) { openModal({ kind: 'picker', mode: d.mode, q: '', tier: '', fit: false, open: drawerBuild()?.finalClass || null }); },
  'picker-tier'(d) { ui.modal.tier = d.tier; renderModal(); },
  'picker-fit'() { ui.modal.fit = !ui.modal.fit; renderModal(); },
  'job-expand'(d) { ui.modal.open = ui.modal.open === d.job ? null : d.job; renderPickerList(); },
  pick(d) { if (ui.modal?.kind === 'picker' && ui.modal.mode === 'path') appendPath(d.job); else selectClass(d.job); },
  'clear-class'() { selectClass(''); },
  'class-info'(d, el) { openModal({ kind: 'class', job: d.job, fromDrawer: !!el.closest('#drawer') }); },
  'tag-edit'() { ui.tagEdit = !ui.tagEdit; renderDrawer(); if (ui.tagEdit) $('#tag-input')?.focus(); },
  'tag-remove'(d) { const id = ui.drawer.id; setTags(id, tagsOf(id).filter(t => t !== d.tag)); },
  'tag-add'(d) {
    const id = ui.drawer.id;
    const value = d.tag || $('#tag-input')?.value || '';
    if (!value.trim()) return;
    setTags(id, [...tagsOf(id), value]);
    $('#tag-input')?.focus();
  },
  'tag-reset'() { delete state.characterTags[ui.drawer.id]; persist(); render(); },
  export() { exportState(); },
  import() { $('#import-file').value = ''; $('#import-file').click(); },
  'export-corrupt'() { download(corruptBackup, '만자천홍-저장원본-복구용.json'); },
  'reset-ask'() {
    openModal({ kind: 'confirm', title: '초기 편성으로 되돌릴까요?', ok: '초기화', okAct: 'reset-apply', danger: true, cancelAct: 'settings',
      body: '<p>빌드·메모·수정한 태그가 모두 지워지고 처음 명단으로 돌아갑니다.</p><p>필요하면 먼저 내보내기로 백업하세요.</p>' });
  },
  'reset-apply'() {
    snapshot();
    const { theme } = state.settings;
    state = C.initial(D);
    state.settings.theme = theme;
    corruptBackup = null;
    ui.compare = [];
    closeModal();
    closeDrawer();
    persist();
    render();
    toast('초기 편성으로 되돌렸습니다.', true);
  },
  'spoiler-on'() { state.settings.spoilers = true; persist(); render(); openModal({ kind: 'settings' }); },
  'import-apply'() {
    if (!ui.pendingImport) return;
    snapshot();
    state = ui.pendingImport;
    state.settings.spoilers = false;
    ui.pendingImport = null;
    corruptBackup = null;
    ui.compare = [];
    closeModal();
    closeDrawer();
    persist();
    render();
    toast('백업을 불러왔습니다.', true);
  },
  undo() { undo(); },
  'close-modal'() { closeModal(); },
  'sync-connect'() {
    const token = $('#sync-token')?.value.trim();
    if (!token) { $('#sync-token')?.focus(); return; }
    connectSync(token);
  },
  'sync-now'() { syncNow(); },
  'sync-disconnect'() {
    clearTimeout(sync.timer);
    Object.assign(sync, { token: '', gistId: '', base: null, dirty: false, status: 'idle', error: '' });
    saveSync();
    refreshStatus();
    renderModal();
    toast('이 기기의 동기화를 해제했습니다. GitHub의 데이터는 그대로 있습니다.');
  },
  'sync-use-remote'() {
    const p = sync.pending;
    if (!p) return;
    finishConnect(p.token, p.id);
    applyRemote(p.remote, true);
    openModal({ kind: 'settings' });
    toast('GitHub 편성으로 맞췄습니다.', true);
  },
  'sync-use-local'() {
    const p = sync.pending;
    if (!p) return;
    sync.base = p.remote.updatedAt ?? null;
    finishConnect(p.token, p.id);
    sync.dirty = true;
    saveSync();
    openModal({ kind: 'settings' });
    syncNow();
  }
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (fn) fn(el.dataset, el, ev);
});
document.addEventListener('input', ev => {
  const t = ev.target;
  lastTyped = Date.now();
  if (t.id === 'search') { f.q = t.value; renderList(); return; }
  if (t.id === 'picker-q') { ui.modal.q = t.value; renderPickerList(); return; }
  if (t.dataset.bfield) {
    const b = drawerBuild();
    if (!b) return;
    b[t.dataset.bfield] = t.value;
    persistSoon();
    renderSquad();
    renderStats();
    if (t.dataset.bfield === 'path') $('#path-chips').innerHTML = pathChips(b.path);
  }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.filter) { f[t.dataset.filter] = t.value; renderList(); return; }
  if (t.id === 'sort') { ui.sort = t.value; saveUi(); renderList(); return; }
  if (t.id === 'with-class') { ui.withClass = t.checked; saveUi(); renderDrawer(); return; }
  if (t.id === 'spoiler-toggle') {
    if (t.checked) {
      t.checked = false;
      openModal({ kind: 'confirm', title: '전체 캐릭터를 표시할까요?', ok: '표시', okAct: 'spoiler-on', cancel: '보호 유지', cancelAct: 'settings',
        body: '<p>3부 이후 합류하거나 합류 시점이 확인되지 않은 캐릭터가 목록에 나타납니다.</p><p>설정에서 언제든 다시 숨길 수 있습니다.</p>' });
    } else {
      state.settings.spoilers = false;
      ui.compare = ui.compare.filter(isVisible);
      persist();
      render();
      renderModal();
    }
  }
});
document.addEventListener('keydown', ev => {
  const t = ev.target;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if (t.id === 'tag-input' && ev.key === 'Enter') { ev.preventDefault(); A['tag-add']({}); return; }
  if (t.id === 'sync-token' && ev.key === 'Enter') { ev.preventDefault(); A['sync-connect'](); return; }
  if (t.id === 'search' && ev.key === 'Escape' && t.value) { ev.preventDefault(); t.value = ''; f.q = ''; renderList(); return; }
  if (t.dataset?.handle && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
    ev.preventDefault();
    const id = t.dataset.handle;
    moveBy(id, ev.key === 'ArrowUp' ? -1 : 1);
    $(`[data-handle="${id}"]`)?.focus();
    return;
  }
  if ($('#modal').open) return;
  if (ev.key === 'Escape' && ui.drawer) { ev.preventDefault(); closeDrawer(); return; }
  if (typing) return;
  if (ev.key === '/') { ev.preventDefault(); if (ui.drawer) closeDrawer(); focusSearch(); }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && ui.undo) { ev.preventDefault(); undo(); }
});

/* ---------- drag & drop ---------- */
// Mouse: drag a character from the list into the squad (HTML5 DnD).
document.addEventListener('dragstart', ev => {
  const row = ev.target.closest?.('[data-drag]');
  if (!row) return;
  ev.dataTransfer.setData('text/plain', row.dataset.drag);
  ev.dataTransfer.effectAllowed = 'copy';
});
const squadCol = $('#squad-col');
squadCol.addEventListener('dragover', ev => {
  if (!ev.dataTransfer.types.includes('text/plain')) return;
  ev.preventDefault();
  squadCol.classList.add('dragover');
});
squadCol.addEventListener('dragleave', ev => { if (!squadCol.contains(ev.relatedTarget)) squadCol.classList.remove('dragover'); });
squadCol.addEventListener('drop', ev => {
  ev.preventDefault();
  squadCol.classList.remove('dragover');
  const id = ev.dataTransfer.getData('text/plain');
  if (!isVisible(id)) return;
  insertAt(id, ev.target.closest('.squad-row')?.dataset.id);
});
// Mouse + touch: reorder squad rows by the grip handle.
$('#squad-list').addEventListener('pointerdown', ev => {
  const handle = ev.target.closest('[data-handle]');
  if (!handle || ev.button > 0) return;
  ev.preventDefault();
  const list = $('#squad-list');
  const row = handle.closest('.squad-row');
  const scroller = getComputedStyle(squadCol).overflowY === 'auto' ? squadCol : null;
  const pid = ev.pointerId;
  let y = ev.clientY, moved = false, raf = 0;
  row.classList.add('dragging');
  document.body.classList.add('sorting');
  const place = () => {
    const rows = $$('.squad-row', list).filter(r => r !== row);
    const before = rows.find(r => { const rc = r.getBoundingClientRect(); return y < rc.top + rc.height / 2; });
    if (before) { if (row.nextElementSibling !== before) { list.insertBefore(row, before); moved = true; } }
    else if (list.lastElementChild !== row) { list.appendChild(row); moved = true; }
  };
  const tick = () => {
    const top = scroller ? scroller.getBoundingClientRect().top : $('#topbar').offsetHeight;
    const bottom = scroller ? scroller.getBoundingClientRect().bottom : innerHeight - (isMobile() ? 62 : 0);
    const dy = y < top + 56 ? -10 : y > bottom - 56 ? 10 : 0;
    if (dy) scroller ? scroller.scrollBy(0, dy) : scrollBy(0, dy);
    place();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  // Listen on window: moving the row in the DOM drops any pointer capture on the handle.
  const onMove = e => { if (e.pointerId !== pid) return; e.preventDefault(); y = e.clientY; place(); };
  const onUp = e => {
    if (e.pointerId !== pid) return;
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    document.body.classList.remove('sorting');
    row.classList.remove('dragging');
    if (moved) {
      setVisibleOrder(ui.route, $$('.squad-row', list).map(r => r.dataset.id));
      persist();
    }
    render();
  };
  addEventListener('pointermove', onMove, { passive: false });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
});

/* ---------- boot ---------- */
function render() {
  applyTheme();
  renderRoutes();
  renderView();
  renderFilterPanel();
  renderList();
  renderSquad();
  renderStats();
  if (ui.view === 'overview') renderOverview();
  renderDrawer();
  if (ui.modal && ['compare', 'settings', 'class'].includes(ui.modal.kind)) renderModal();
}

$('#settings-btn').innerHTML = I.gear;
$('.search-icon').innerHTML = I.search;
$$('[data-icon]').forEach(el => { el.outerHTML = I[el.dataset.icon]; });
$('#sort').innerHTML = options(SORTS, ui.sort);
new ResizeObserver(() => document.documentElement.style.setProperty('--hh', `${$('#topbar').offsetHeight}px`)).observe($('#topbar'));
renderBanner();
render();
refreshStatus();
if (syncOn()) syncNow();
})();
