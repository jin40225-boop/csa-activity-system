/* 啟動、頁籤、事件、三人同步。 */
'use strict';

function render() {
  if (!A.d) return;
  if ($('#demoChip')) $('#demoChip').hidden = !isDemo();
  const t = A.ui.tab;
  $$('#tabs .ds-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  const od = A.s.filter(s => s.status === 'active' && !s.attended_at).reduce((a, s) => a + needRoles(s).filter(r => overdue(s.conf[r])).length, 0);
  const cnt = od + A.s.filter(s => status(s).c === 'done').length;
  $('#cntSess').textContent = cnt; $('#cntSess').hidden = !cnt;
  $('#cntMail').textContent = od; $('#cntMail').hidden = !od;
  // 重畫前記住輸入中的欄位（同步更新不能吃掉正在打的字）
  const ae = document.activeElement, keepId = ae && ae.id && $('#main').contains(ae) ? ae.id : null, keepVal = keepId ? ae.value : null, keepPos = keepId && ae.selectionStart;
  ({ sess: renderSess, home: renderHome, report: renderReport, ros: renderRos, mail: renderMail, set: renderSet })[t]();
  if (keepId && $('#' + keepId)) { const e = $('#' + keepId); e.value = keepVal; e.focus(); try { e.setSelectionRange(keepPos, keepPos); } catch (x) { } }
}

/* ───────── 三人同步：每幾秒問一次「最新異動序號」，變了就重讀 ───────── */
let pulling = false;
async function pulse(force) {
  if (pulling || !A.d) return; pulling = true;
  const chip = $('#sync');
  try {
    const p = await api('pulse');
    if (p.seq !== A.seq || force) {
      chip.className = 'sync busy'; chip.textContent = '● 更新中…';
      const before = A.seq;
      setSnapshot(await api('snapshot'));
      // 正在打字或報告書已展開時，只更新不影響輸入的部分
      const typing = document.activeElement && document.activeElement.matches('#main input, #main textarea') ;
      if (!typing && !(A.ui.tab === 'report' && A.ui.rptShown)) render(); else renderBadgesOnly();
      if (p.by && p.by !== A.d.me.name && before && p.seq > before) toast(`🔄 ${p.by} 剛剛：${p.summary}`);
    }
    A.syncErr = null; chip.className = 'sync'; chip.textContent = '● 已同步 ' + hm(new Date()).slice(0, 5);
  } catch (e) {
    A.syncErr = e.message; chip.className = 'sync err'; chip.textContent = '● 連不到資料（NAS）'; chip.title = e.message;
  } finally { pulling = false; }
}
function renderBadgesOnly() {
  const od = A.s.filter(s => s.status === 'active' && !s.attended_at).reduce((a, s) => a + needRoles(s).filter(r => overdue(s.conf[r])).length, 0);
  $('#cntMail').textContent = od; $('#cntMail').hidden = !od;
}

/* ───────── 搜尋（Ctrl+K）：找場次、學校、講師，選了直接跳到那一場 ───────── */
function findInit() {
  const inp = $('#find'), res = $('#findRes'); let cur = -1, items = [];
  const show = () => {
    const q = inp.value.trim(); if (!q) { res.hidden = true; return; }
    items = A.s.filter(s => [s.code, s.topic, s.prog, placeName(s), (C(s.lecturer_id) || {}).org, (C(s.partner_id) || {}).org, roc(s.d)].join(' ').includes(q)).slice(0, 12);
    res.innerHTML = items.map((s, i) => `<button data-i="${i}">${rocW(s.d)} ${esc(placeName(s))}<small>${esc(s.code)}・${esc(s.prog)}・${esc((C(s.lecturer_id) || {}).org || '')}・${esc(status(s).t)}</small></button>`).join('') || '<p class="empty">找不到</p>';
    res.hidden = false; cur = -1;
  };
  const go = i => { const s = items[i]; if (!s) return; A.ui.tab = 'sess'; A.ui.sView = 'list'; A.ui.sFilter = '全部'; A.ui.sel = s.id; A.ui.scrollSel = true; res.hidden = true; inp.value = ''; render(); };
  inp.addEventListener('input', show);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { cur = Math.min(items.length - 1, cur + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); e.preventDefault(); }
    else if (e.key === 'Enter') { go(cur < 0 ? 0 : cur); e.preventDefault(); }
    else if (e.key === 'Escape') { res.hidden = true; inp.blur(); }
    $$('button', res).forEach(b => b.classList.toggle('on', +b.dataset.i === cur));
  });
  res.addEventListener('mousedown', e => e.preventDefault());
  res.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); });
  inp.addEventListener('blur', () => setTimeout(() => res.hidden = true, 150));
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.focus(); inp.select(); } });
}

/* ───────── 事件委派 ───────── */
document.addEventListener('click', e => {
  const tab = e.target.closest('#tabs [data-tab]');
  if (tab) { A.ui.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  if (el.tagName === 'A') e.preventDefault();
  const fn = ACT[el.dataset.act]; if (fn) fn(el);
});
$('#btnTheme').addEventListener('click', () => { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('theme', r.dataset.theme); } catch (x) { } });
window.addEventListener('app-focus', () => pulse());

(async function boot() {
  try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch (x) { }
  try {
    const r = await api('boot');
    A.app = r.app; setSnapshot(r.data);
    $('#who').textContent = `${A.d.me.name}・${A.d.me.label}`; $('#who').classList.toggle('sup', A.d.me.isSupervisor);
    $('#ver').textContent = A.app.version;
    ['#top', '#tabs', '#main'].forEach(s => $(s).hidden = false); $('#boot').remove();
    findInit(); render();
    setInterval(pulse, Math.max(3, Number(setting('sync_seconds', 6)) || 6) * 1000);
  } catch (e) {
    const b = $('#boot'); b.className = 'app-boot err'; b.textContent = '系統打不開：\n' + e.message;
  }
})();
window.__app = { A, api, refresh, render, pulse };
