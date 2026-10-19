/* 總覽、名冊、信件總覽、設定。 */
'use strict';

/* ───────── 總覽 ───────── */
function renderHome() {
  const y = new Date().getFullYear() - 1911, st = stats(y), el = $('#main');
  const unreadOver = st.overdue, todo = st.overdue + st.pipe.done;
  const kpi = (icon, label, n, g, unit, f) => `<button class="kpi2" data-act="kpiGo" data-f="${f}"><span class="l">${icon} ${label}</span>
    <span class="n">${num(n)} <small>${g ? '/ ' + num(g) + ' ' + unit : unit}</small></span>${g ? `<span class="bar"><i style="width:${Math.min(100, n / g * 100)}%"></i></span>` : ''}</button>`;
  el.innerHTML = `
  <div class="hero2 ${todo ? 'busy' : ''}"><img src="art/worker_tablet.png" alt=""><div><div class="n">${todo}</div><p>件事等你處理：<b>${unreadOver}</b> 個確認逾期、<b>${st.pipe.done}</b> 場待結案。</p></div>
    <div class="ds-sp"></div><button class="ds-btn primary" data-act="tabGo" data-tab="sess">到場次管理處理 →</button></div>
  <div class="kpis">
    ${kpi('<img class="ico" src="art/megaphone.png" alt="">', `${y} 年宣導場次（已辦）`, st.doneN, goal('goal_sessions'), '場', '全部')}
    ${kpi('<img class="ico" src="art/team.png" alt="">', '宣導人次', st.ppl, goal('goal_people'), '人次', '全部')}
    ${kpi('<img class="ico" src="art/pin.png" alt="">', '偏鄉場次（含排定）', st.ruralAll, goal('goal_rural'), '場', '偏鄉')}
    <button class="kpi2 ${st.overdue ? 'warn' : ''}" data-act="kpiGo" data-f="待確認"><span class="l"><img class="ico" src="art/warning.png" alt=""> 確認逾期</span><span class="n">${st.overdue}</span><span class="ds-note">點一下只看這些場次</span></button>
    <button class="kpi2" data-act="tabGo" data-tab="report"><span class="l"><img class="ico" src="art/star.png" alt=""> 滿意＋非常滿意</span><span class="n">${st.top2 ?? '—'}<small>%</small></span><span class="ds-note">全年 ${num(st.fbTotal)} 份回饋</span></button>
  </div>
  <div class="grid2">
    <section class="panel"><h3><img src="art/target.png" alt="">年度目標進度（依方案）</h3>
      ${st.progs.map(p => { const b = st.by[p], g = goal('goal:' + p) || Math.max(1, b.done + b.plan); return `<div class="prog"><span>${esc(p)}</span><div class="tr">
        <i class="p" style="width:${Math.min(100, (b.done + b.plan) / g * 100)}%"></i><i class="d" style="width:${Math.min(100, b.done / g * 100)}%"></i></div>
        <b>${b.done}<small style="color:var(--ds-muted)">+${b.plan}</small> / ${goal('goal:' + p) || '—'}</b></div>`; }).join('')}
      <div class="legend"><span><i style="background:var(--ds-mint)"></i>已辦理</span><span><i style="background:rgba(61,165,245,.35)"></i>已排定</span></div></section>
    <section class="panel"><h3><img src="art/calendar_check.png" alt="">每一場走到哪一步</h3>
      <div class="pipe">${[['plan', '籌備中', 'hold'], ['inviting', '確認中', 'pend'], ['confirmed', '三方已確認', 'info'], ['done', '待結案', 'edit'], ['closed', '已結案', 'ok']]
        .map(([k, t, c], i) => `${i ? '<span class="ar">›</span>' : ''}<div class="st"><b>${st.pipe[k]}</b>${badge(c, t)}</div>`).join('')}</div>
      <h3 style="margin-top:16px"><img src="art/bar_chart.png" alt="">每月宣導人次</h3><div class="chart">${chartSvg('bar', st.months.map((v, i) => [i + 1 + '月', v]), { w: 600, h: 210, mono: true })}</div></section>
  </div>`;
}

/* ───────── 名冊 ───────── */
function renderRos() {
  const f = A.ui.cFilter, q = A.ui.cq;
  const rows = A.d.contacts.filter(c => (f === '全部' || c.type === f || (f === '停用' && !c.is_active)) && (f === '停用' || c.is_active) && (!q || (c.org + c.person + c.title + c.phone + c.email + c.town).includes(q)));
  const uses = c => { const ss = A.s.filter(s => s.venue_id === c.id || s.partner_id === c.id || s.lecturer_id === c.id); return ss; };
  $('#main').innerHTML = `<div class="toolbar"><h2 style="margin:0">名冊</h2><span class="ds-note">學校・場地・合作單位・講師；在場次頁新增的也會出現在這裡</span><span class="ds-sp"></span>
    <input class="ds-input" id="cq" placeholder="搜尋名稱、聯絡人、電話" value="${esc(q)}" autocomplete="off">
    <button class="ds-btn primary" data-act="newContact" ${can('contact.edit') ? '' : 'disabled'}>＋ 新增</button></div>
  <div class="ds-chips" style="margin:0 0 10px">${['全部', '學校', '場地', '社區單位', '講師', '網路平台', '其他', '停用'].map(x => `<button class="ds-chip" aria-pressed="${f === x}" data-act="cf" data-f="${x}">${x}</button>`).join('')}</div>
  <table class="ds-table ctbl"><thead><tr><th>單位／姓名</th><th>聯絡人</th><th>電話</th><th>Email</th><th>鄉鎮</th><th>用在</th><th></th></tr></thead><tbody>
  ${rows.map(c => { const u = uses(c); return `<tr class="${c.is_active ? '' : 'off'}"><td><b style="color:var(--ds-ink)">${esc(c.org)}</b><span class="ds-note" style="display:block">${esc(c.type)}</span></td>
    <td>${esc(c.title)} ${c.type === '講師' ? '' : esc(c.person)}</td><td class="nw">${esc(c.phone)}</td><td style="font-size:15px">${c.email ? esc(c.email) : '<span class="missing">沒有 Email</span>'}</td><td>${esc(c.town)}</td>
    <td>${u.length ? `<span class="uses"><span>場次 ${u.length}</span></span>` : ''}</td><td><button class="ds-btn sm" data-act="editContact" data-id="${c.id}">修改</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">沒有符合的資料</td></tr>'}
  </tbody></table>`;
  const i = $('#cq'); i.oninput = () => { A.ui.cq = i.value; const pos = i.selectionStart; renderRos(); const j = $('#cq'); j.focus(); j.setSelectionRange(pos, pos); };
}

/* ───────── 信件總覽（輔助：所有場次的確認狀態一覽） ───────── */
function renderMail() {
  const rows = A.s.filter(s => s.status === 'active' && !s.attended_at).flatMap(s => needRoles(s).map(r => ({ s, r, cf: s.conf[r] })))
    .sort((a, b) => (overdue(b.cf) - overdue(a.cf)) || ((a.cf && a.cf.state === 'confirmed') - (b.cf && b.cf.state === 'confirmed')) || a.s.date.localeCompare(b.s.date));
  $('#main').innerHTML = `<div class="toolbar"><h2 style="margin:0">信件總覽</h2><span class="ds-note">尚未辦理場次的三方確認一覽；寄信、記錄回覆請到場次頁</span></div>
  <table class="ds-table trk"><thead><tr><th>場次</th><th>對象</th><th>狀態</th><th>寄出</th><th></th></tr></thead><tbody>
  ${rows.map(({ s, r, cf }) => { const c = C(roleCid(s, r)), st = lstate(cf); return `<tr class="${overdue(cf) ? 'ds-pending' : ''}"><td class="nw">${roc(s.d)}<span class="ds-note" style="display:block">${esc(shortPlace(s))}</span></td>
    <td>${ROLE_LABEL[r]}：${c ? esc(c.org) + (c.type === '講師' ? '' : ' ' + esc(c.person)) : '<span class="missing">未指定</span>'}</td><td>${badge(st.k, st.t)}</td>
    <td class="nw">${cf && cf.sent_at ? ago(cf.sent_at) + '前' : '—'}</td><td><button class="ds-btn sm" data-act="calev" data-id="${s.id}">到這一場 →</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">沒有待確認的場次。</td></tr>'}</tbody></table>`;
}

/* ───────── 設定 ───────── */
const PH = ['對象', '單位', '講師', '地點', '方案', '主題', '日期', '日期長', '時間', '預估人數', '回覆期限', '回覆期限長', '承辦', '承辦電話', '承辦Email', '確認方式', '場次編號', '原主旨'];
function renderSet() {
  const t = A.ui.setTab, sup = can('settings.edit');
  const nav = [['tpl', '✉ 書信公版'], ['goal', '🎯 年度目標與參數'], ['perm', '🔐 權限'], ['users', '👤 帳號'], ['files', '📁 範本與資料夾'], ['about', 'ℹ 系統資訊']];
  let body = '';
  if (t === 'tpl') body = `<p class="hint">寄信時公版會自動帶入場次資料；{{佔位字}} 會被換成實際內容。${can('template.edit') ? '' : '（目前只有督導可以修改）'}</p>
    ${(A.d.templates || []).map(x => `<section class="panel"><h3>${esc(x.title)} <span class="ds-note">最後修改：${esc(x.updated_by || '')} ${fmtT(x.updated_at)}</span></h3>
      <div class="ds-field"><label class="ds-label">主旨</label><input class="ds-input" data-tsub="${x.key}" value="${esc(x.subject)}" ${can('template.edit') ? '' : 'disabled'}></div>
      <div class="ds-field"><label class="ds-label">內容</label><textarea class="ds-input mailbody" style="min-height:220px" data-tbody="${x.key}" ${can('template.edit') ? '' : 'disabled'}>${esc(x.body)}</textarea></div>
      ${can('template.edit') ? `<div class="ds-row"><span class="ph-list">${PH.map(p => `<button data-ins="${x.key}" data-ph="${p}">{{${p}}}</button>`).join('')}</span><span class="ds-sp"></span><button class="ds-btn primary" data-act="saveTpl" data-key="${x.key}" data-ver="${x.ver}">儲存公版</button></div>` : ''}</section>`).join('')}`;
  if (t === 'goal') {
    const g = [['org_name', '方案名稱（領據、報告書抬頭）'], ['goal_sessions', '年度宣導場次目標'], ['goal_people', '年度宣導人次目標'], ['goal_rural', '偏鄉場次目標'],
      ...[...new Set(A.s.map(s => s.prog).concat((A.d.registry || []).filter(r => r.kind === 'prog').map(r => r.name)))].map(p => ['goal:' + p, `「${p}」場次目標`]),
      ['rural_towns', '偏鄉鄉鎮（逗號分隔）'], ['fee_per_hour', '講師鐘點費預設（元／小時）'], ['due_days_before', '確認信回覆期限：活動前幾天'], ['confirm_method', '信件裡「確認方式」的文字'], ['sync_seconds', '同步檢查間隔（秒）'], ['demo_mode', '示範模式（1＝開：顯示模擬按鈕與動畫；0＝關）']];
    body = `${sup ? '' : '<div class="readonly-note">只有督導可以修改。</div>'}<section class="panel">${g.map(([k, l]) => `<div class="ds-field"><label class="ds-label">${esc(l)}</label><input class="ds-input" data-set="${esc(k)}" value="${esc(setting(k, ''))}" ${sup ? '' : 'disabled'}></div>`).join('')}
      ${sup ? '<button class="ds-btn primary" data-act="saveSettings">儲存</button>' : ''}</section>`;
  }
  if (t === 'perm') body = `<p class="hint">權限尚未定案：先把每個動作設成「所有人」或「只有督導」，日後定案直接在這裡改，不必改程式。督導永遠可以做所有動作；「系統設定與權限」固定只有督導。</p>
    <section class="panel">${(A.d.perms || []).map(p => `<div class="perm"><span>${esc(p.label)}</span>${p.key === 'settings.edit' ? '<b>只有督導</b>' :
      `<span class="seg"><button aria-pressed="${p.rule === 'all'}" data-act="perm" data-key="${p.key}" data-v="all" ${sup ? '' : 'disabled'}>所有人</button><button aria-pressed="${p.rule === 'supervisor'}" data-act="perm" data-key="${p.key}" data-v="supervisor" ${sup ? '' : 'disabled'}>只有督導</button></span>`}</div>`).join('')}</section>`;
  if (t === 'users') body = `<p class="hint">三個帳號各用自己名字的啟動捷徑開啟（不用輸入密碼）。這裡改的是顯示名稱、職稱、聯絡方式與身分。</p>
    ${users().map(u => `<section class="panel"><h3>${esc(u.name)} <span class="ds-note">帳號 ${esc(u.username)}</span></h3><div class="fgrid">
      <div class="ds-field"><label class="ds-label">顯示名稱</label><input class="ds-input" data-u="${u.id}" data-f="display_name" value="${esc(u.name)}" ${sup ? '' : 'disabled'}></div>
      <div class="ds-field"><label class="ds-label">職稱</label><input class="ds-input" data-u="${u.id}" data-f="title" value="${esc(u.title)}" ${sup ? '' : 'disabled'}></div>
      <div class="ds-field"><label class="ds-label">Email（寄信署名）</label><input class="ds-input" data-u="${u.id}" data-f="email" value="${esc(u.email)}" ${sup ? '' : 'disabled'}></div>
      <div class="ds-field"><label class="ds-label">電話</label><input class="ds-input" data-u="${u.id}" data-f="phone" value="${esc(u.phone)}" ${sup ? '' : 'disabled'}></div>
      <div class="ds-field"><label class="ds-label">身分</label><span class="ds-select"><select data-u="${u.id}" data-f="role" ${sup ? '' : 'disabled'}><option value="supervisor" ${u.role === 'supervisor' ? 'selected' : ''}>督導（權限較高）</option><option value="staff" ${u.role === 'staff' ? 'selected' : ''}>社工</option></select></span></div>
    </div>${sup ? `<button class="ds-btn" data-act="saveUser" data-id="${u.id}">儲存</button>` : ''}</section>`).join('')}`;
  if (t === 'files') body = `<section class="panel"><h3>📁 範本資料夾</h3><p>位置：<code>${esc(A.app.templatesDir)}</code></p>
    <p>目前的 Word 範本：${(A.app.templateFiles || []).map(f => `<b>${esc(f)}</b>`).join('、') || '<span class="missing">沒有</span>'}</p>
    <p class="hint">換範本＝把新的 Word 檔放進去覆蓋同名檔（例如「講師領據.docx」），在要填的地方寫 {{佔位字}}。說明見資料夾裡的「範本說明.txt」。</p>
    <button class="ds-btn" data-act="openTpl">開啟範本資料夾</button></section>`;
  if (t === 'about') body = `<section class="panel"><h3>ℹ 系統資訊</h3><dl class="kv"><dt>版本</dt><dd>${esc(A.app.version)}</dd><dt>資料庫</dt><dd><code>${esc(A.app.dataPath)}</code></dd>
    <dt>登入身分</dt><dd>${esc(A.d.me.name)}（${esc(A.d.me.label)}）</dd><dt>同步</dt><dd>每 ${esc(setting('sync_seconds', '6'))} 秒檢查一次；切回視窗時立即檢查</dd></dl></section>`;
  $('#main').innerHTML = `<div class="toolbar"><h2 style="margin:0">設定</h2></div><div class="setgrid"><nav class="setnav">${nav.map(([k, l]) => `<button aria-pressed="${t === k}" data-act="setTab" data-t="${k}">${l}</button>`).join('')}</nav><div>${body}</div></div>`;
  $$('[data-ins]').forEach(b => b.onclick = () => { const ta = $(`[data-tbody="${b.dataset.ins}"]`), p = ta.selectionStart, v = `{{${b.dataset.ph}}}`; ta.value = ta.value.slice(0, p) + v + ta.value.slice(ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = p + v.length; });
}

Object.assign(ACT, {
  kpiGo: el => { A.ui.tab = 'sess'; A.ui.sFilter = el.dataset.f; A.ui.sView = 'list'; render(); },
  tabGo: el => { A.ui.tab = el.dataset.tab; render(); },
  cf: el => { A.ui.cFilter = el.dataset.f; render(); },
  setTab: el => { A.ui.setTab = el.dataset.t; render(); },
  openTpl: () => quiet(api('openTemplatesFolder').catch(e => toast(e.message, true))),
  saveTpl: el => quiet(act('saveTemplate', { key: el.dataset.key, ver: +el.dataset.ver, fields: { subject: $(`[data-tsub="${el.dataset.key}"]`).value, body: $(`[data-tbody="${el.dataset.key}"]`).value } }, '公版已儲存，三台電腦都會用新的版本。')),
  saveSettings: async () => { try { for (const i of $$('[data-set]')) if (i.value !== setting(i.dataset.set, '')) await api('setSetting', { key: i.dataset.set, value: i.value.trim() }); await refresh(); toast('設定已儲存。'); } catch (e) { toast(e.message, true); } },
  perm: el => quiet(act('setSetting', { key: 'perm:' + el.dataset.key, value: el.dataset.v }, '權限已更新，其他電腦下次同步時生效。')),
  saveUser: el => { const id = +el.dataset.id, fields = {}; $$(`[data-u="${id}"]`).forEach(i => fields[i.dataset.f] = i.value.trim()); quiet(act('saveUser', { id, fields }, '帳號資料已儲存。')); },
});
