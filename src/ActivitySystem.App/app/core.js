/* 核心：呼叫程式本體（api）、資料快照、衍生狀態與共用小工具。所有畫面只讀這裡算出來的結果。 */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p2 = n => String(n).padStart(2, '0');
const WD = '日一二三四五六';
const num = n => Number(n || 0).toLocaleString('en-US');
const DAY = 864e5;

/* ───────── 日期（存 ISO，顯示民國） ───────── */
const iso2d = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const dt = s => s ? new Date(String(s).replace(' ', 'T')) : null;
const roc = d => d ? `${d.getFullYear() - 1911}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}` : '';
const rocW = d => d ? `${roc(d)}（${WD[d.getDay()]}）` : '';
const rocLong = d => d ? `${d.getFullYear() - 1911}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）` : '';
const rocC = d => d ? `${d.getFullYear() - 1911}${p2(d.getMonth() + 1)}${p2(d.getDate())}` : '';
const hm = d => d ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : '';
const fmtT = s => { const d = dt(s); return d ? `${roc(d).slice(4)} ${hm(d)}` : ''; };
const endOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
function parseRoc(v) {
  const m = String(v || '').trim().match(/^(\d{2,4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/); if (!m) return null;
  let y = +m[1]; if (y < 1911) y += 1911; const d = new Date(y, +m[2] - 1, +m[3]); return isNaN(d) || d.getDate() !== +m[3] ? null : d;
}
function ago(s) { const ms = Date.now() - dt(s); const dd = Math.floor(ms / DAY), hh = Math.floor(ms % DAY / 36e5), mm = Math.floor(ms % 36e5 / 6e4);
  return dd > 0 ? `${dd} 天 ${hh} 小時` : hh > 0 ? `${hh} 小時 ${mm} 分` : `${Math.max(0, mm)} 分鐘`; }

/* ───────── 與程式本體溝通 ───────── */
const A = { d: null, app: null, c: new Map(), s: [], byId: new Map(), seq: 0, syncErr: null,
  ui: { tab: 'sess', sel: null, sFilter: '全部', sView: 'list', calM: null, cFilter: '全部', cq: '', setTab: 'tpl', rptYear: null, rptShown: false,
        charts: { sat: 'donut', prog: 'bar', month: 'bar', pp: 'hbar' } } };

async function api(method, args = {}) {
  if (!window.chrome || !chrome.webview || !chrome.webview.hostObjects) throw new Error('這個畫面要在「活動與教育訓練系統」程式裡開啟。');
  const raw = await chrome.webview.hostObjects.api.Call(method, JSON.stringify(args));
  const r = JSON.parse(raw);
  if (!r.ok) { const e = new Error(r.error || '操作失敗'); e.conflict = !!r.conflict; throw e; }
  return r.result;
}
/** 寫入動作：成功→重新讀資料並提示；失敗→紅色提示（不自動消失）；衝突→先更新畫面再提示。 */
async function act(method, args, okMsg) {
  try {
    const r = await api(method, args);
    await refresh();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    if (e.conflict) await refresh().catch(() => {});
    toast(e.message, true);
    throw e;
  }
}
const toast = (msg, err) => CmsKit.toast(msg, err);
const quiet = p => p.catch(() => null);

/* ───────── 快照 → 衍生資料 ───────── */
function setSnapshot(d) {
  A.d = d; A.seq = d.seq;
  A.c = new Map(d.contacts.map(c => [c.id, c]));
  const conf = new Map(), msgs = new Map(), files = new Map();
  d.confirmations.forEach(c => { if (!conf.has(c.session_id)) conf.set(c.session_id, {}); conf.get(c.session_id)[c.role] = c; });
  d.messages.forEach(m => { if (!msgs.has(m.session_id)) msgs.set(m.session_id, []); msgs.get(m.session_id).push(m); });
  d.attachments.forEach(a => { if (!files.has(a.session_id)) files.set(a.session_id, []); files.get(a.session_id).push(a); });
  A.s = d.sessions.map(s => Object.assign(s, { d: iso2d(s.date), conf: conf.get(s.id) || {}, msgs: msgs.get(s.id) || [], files: files.get(s.id) || [] }));
  A.byId = new Map(A.s.map(s => [s.id, s]));
  if (!A.ui.sel || !A.byId.has(A.ui.sel)) A.ui.sel = (A.s.find(s => !s.closed_at && s.status === 'active' && s.d >= new Date(new Date().toDateString())) || A.s[A.s.length - 1] || {}).id || null;
  if (!A.ui.rptYear) A.ui.rptYear = new Date().getFullYear() - 1911;
}
async function refresh() { setSnapshot(await api('snapshot')); render(); }

const S = () => A.d.settings || {};
const setting = (k, def = '') => (A.d.settings || {})[k] ?? def;
const can = key => { const p = (A.d.perms || []).find(x => x.key === key); return p ? p.can : A.d.me.isSupervisor; };
const C = id => A.c.get(id) || null;
const users = () => A.d.users || [];
const userName = id => (users().find(u => u.id === id) || {}).name || '';
const ruralTowns = () => setting('rural_towns', '南庄鄉,泰安鄉,獅潭鄉').split(/[,，、\s]+/).filter(Boolean);
const isRural = s => { const v = C(s.venue_id); return !!v && ruralTowns().includes(v.town); };
const placeName = s => (C(s.venue_id) || C(s.partner_id) || {}).org || '（未定地點）';
const shortPlace = s => placeName(s).replace(/^.{2}[鄉鎮市](?=.)/, '');
const people = s => s.reach != null ? s.reach : (s.male || 0) + (s.female || 0);
const fbN = s => (s.online_fb || 0) + (s.paper_fb || 0);
const satH = s => [s.sat1, s.sat2, s.sat3, s.sat4, s.sat5].map(v => v || 0);
const top2 = h => { const n = h.reduce((a, b) => a + b, 0); return n ? Math.round((h[3] + h[4]) / n * 1000) / 10 : null; };
const photos = s => s.files.filter(f => f.kind === 'photo');
const filesOf = (s, k) => s.files.filter(f => f.kind === k);
const fileUrl = f => f.rel_path ? 'https://files.activity.local/' + f.rel_path.split('/').map(encodeURIComponent).join('/') : '';

const ROLES = ['venue', 'partner', 'lecturer'];
const ROLE_LABEL = { venue: '場地方', partner: '協辦單位', lecturer: '講師' };
const ROLE_SHORT = { venue: '場', partner: '協', lecturer: '講' };
const roleCid = (s, r) => r === 'venue' ? s.venue_id : r === 'partner' ? s.partner_id : s.lecturer_id;
const needRoles = s => s.prog === '網路宣導' ? ['lecturer'] : ROLES;
const dueOf = cf => cf && cf.due_date ? endOfDay(iso2d(cf.due_date)) : null;
const overdue = cf => !!cf && (cf.state === 'sent' || cf.state === 'opened') && dueOf(cf) && Date.now() > dueOf(cf);
function lstate(cf) {
  if (!cf || cf.state === 'none') return { k: 'hold', t: '尚未寄信' };
  if (cf.state === 'confirmed') return { k: 'ok', t: '已確認 ' + fmtT(cf.confirmed_at) + (cf.confirmed_via ? `（${cf.confirmed_via}）` : '') };
  if (cf.state === 'declined') return { k: 'no', t: '婉拒／需改期' };
  if (overdue(cf)) return { k: 'no', t: `逾期 ${Math.max(1, Math.floor((Date.now() - dueOf(cf)) / DAY) + 1)} 天未回` };
  if (cf.state === 'opened') return { k: 'info', t: '已開啟・等待回覆' };
  return { k: 'pend', t: '已寄出・等待回覆' };
}
function status(s) {
  if (s.status === 'cancelled') return { k: 'hold', t: '已取消', c: 'cancelled' };
  if (s.closed_at) return { k: 'ok', t: '已結案', c: 'closed' };
  if (s.attended_at) return { k: 'edit', t: '已辦理・待結案', c: 'done' };
  const cs = needRoles(s).map(r => s.conf[r]);
  if (cs.every(c => c && c.state === 'confirmed')) return { k: 'info', t: '三方已確認', c: 'confirmed' };
  if (cs.some(overdue)) return { k: 'no', t: '確認逾期', c: 'inviting' };
  if (cs.every(c => !c || c.state === 'none')) return { k: 'hold', t: '籌備中', c: 'plan' };
  return { k: 'pend', t: `確認中 ${cs.filter(c => c && c.state === 'confirmed').length}/${cs.length}`, c: 'inviting' };
}
function evOf(s) {
  const cs = needRoles(s).map(r => s.conf[r]).filter(Boolean);
  const sent = cs.map(c => c.sent_at).filter(Boolean).sort()[0] || null;
  const conf = cs.length && cs.every(c => c.state === 'confirmed') ? cs.map(c => c.confirmed_at).filter(Boolean).sort().pop() : null;
  return { invite: sent, confirm: conf, attend: s.attended_at, close: s.closed_at };
}
function missingEvidence(s) {
  const m = [];
  if (!people(s)) m.push('出席人次');
  if (!fbN(s) && s.reach == null) m.push('回饋單');
  if (!photos(s).length) m.push('活動照片');
  if (!filesOf(s, 'sign').length && s.reach == null) m.push('簽到表');
  return m;
}
const goal = k => Number(setting(k, 0)) || 0;
function stats(year) {
  const all = A.s.filter(s => s.status === 'active' && (!year || s.year === year));
  const pub = all.filter(s => s.prog !== '親職講座');
  const doneS = pub.filter(s => s.attended_at);
  const allH = [0, 0, 0, 0, 0]; all.forEach(s => satH(s).forEach((v, i) => allH[i] += v));
  const progs = [...new Set([...(A.d.registry || []).filter(r => r.kind === 'prog').map(r => r.name), ...all.map(s => s.prog)])];
  const by = {}; progs.forEach(p => { const a = all.filter(s => s.prog === p); by[p] = { done: a.filter(s => s.attended_at).length, plan: a.filter(s => !s.attended_at).length, ppl: a.filter(s => s.attended_at).reduce((x, s) => x + people(s), 0) }; });
  const months = Array(12).fill(0); doneS.forEach(s => months[s.d.getMonth()] += people(s));
  const pipe = { plan: 0, inviting: 0, confirmed: 0, done: 0, closed: 0 }; all.forEach(s => { const c = status(s).c; if (c in pipe) pipe[c]++; });
  const pp = all.filter(s => s.attended_at && s.pre_rate != null && s.post_rate != null);
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  const allConf = all.flatMap(s => needRoles(s).map(r => s.conf[r]).filter(Boolean));
  return { all, pub, doneN: doneS.length, ppl: doneS.reduce((a, s) => a + people(s), 0), ruralAll: pub.filter(isRural).length, ruralDone: pub.filter(s => isRural(s) && s.attended_at).length,
    overdue: allConf.filter(overdue).length, top2: top2(allH), allH, fbTotal: allH.reduce((a, b) => a + b, 0) || all.reduce((a, s) => a + fbN(s), 0),
    by, progs, months, pipe, pre: avg(pp.map(s => s.pre_rate)), post: avg(pp.map(s => s.post_rate)) };
}

/* ───────── 書信公版：{{佔位字}} 填值 ───────── */
function letterVars(s, role, due, extra = {}) {
  const c = C(roleCid(s, role)) || {}, lect = C(s.lecturer_id) || {}, me = A.d.me, u = users().find(x => x.id === me.id) || {};
  return Object.assign({
    對象: role === 'lecturer' ? (c.org || '') : (c.person || c.org || ''), 單位: c.org || '', 講師: lect.org || '', 地點: placeName(s), 方案: s.prog, 主題: s.topic || '',
    日期: roc(s.d), 日期長: rocLong(s.d), 時間: [s.start_time, s.end_time].filter(Boolean).join('–'), 預估人數: s.target || '', 回覆期限: due ? roc(due) : '（期限）',
    回覆期限長: due ? rocLong(due) : '（期限）', 承辦: me.name, 承辦電話: u.phone || '', 承辦Email: u.email || '', 確認方式: setting('confirm_method', ''), 場次編號: s.code,
  }, extra);
}
const fillTpl = (t, v) => String(t || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, k) => v[k] != null ? String(v[k]) : m);
const tpl = key => (A.d.templates || []).find(t => t.key === key) || { subject: '', body: '', title: key };
const badge = (k, t) => `<span class="ds-badge ${k}">${esc(t)}</span>`;

/** 畫面上所有 data-act 按鈕對應的動作（各檔案往這裡登記）。 */
const ACT = {};
