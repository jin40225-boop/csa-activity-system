/* 場次管理：左邊清單、右邊這一場的一站式頁面。
   常用動作做成「快速選項第二排」大按鈕並寫出狀態（出席與回饋／照片／講師領據／結案）——不藏在頁面最下。 */
'use strict';

function renderSess() {
  const el = $('#main'), f = A.ui.sFilter;
  const progs = [...new Set(A.s.map(s => s.prog))];
  let rows = [...A.s].sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''));
  if (f === '進行中') rows = rows.filter(s => !s.closed_at && s.status === 'active');
  else if (f === '待確認') rows = rows.filter(s => ['inviting', 'plan'].includes(status(s).c));
  else if (f === '待結案') rows = rows.filter(s => status(s).c === 'done');
  else if (f === '偏鄉') rows = rows.filter(isRural);
  else if (f === '我的場次') rows = rows.filter(s => s.owner_user_id === A.d.me.id);
  else if (progs.includes(f)) rows = rows.filter(s => s.prog === f);
  const s = A.byId.get(A.ui.sel);
  const keepD = $('.sdetail') ? $('.sdetail').scrollTop : 0, keepL = $('.slist') ? $('.slist').scrollTop : null;
  el.innerHTML = `
  <div class="toolbar"><h2 style="margin:0">場次管理</h2><span class="ds-note">一場一頁：三方確認、寄信、出席回饋、照片、領據、結案都在這裡</span><span class="ds-sp"></span>
    <div class="seg"><button aria-pressed="${A.ui.sView === 'list'}" data-act="sview" data-v="list">☰ 列表</button><button aria-pressed="${A.ui.sView === 'cal'}" data-act="sview" data-v="cal">▦ 月曆</button></div>
    <button class="ds-btn primary" data-act="newSession" ${can('session.create') ? '' : 'disabled title="目前設定為只有督導可以新增"'}>＋ 新增場次</button></div>
  <div class="ds-chips" style="margin:0 0 10px">${['全部', '進行中', '待確認', '待結案', '我的場次', '偏鄉', ...progs].map(x => `<button class="ds-chip" aria-pressed="${f === x}" data-act="sf" data-f="${esc(x)}">${esc(x)}</button>`).join('')}</div>
  ${A.ui.sView === 'cal' ? calendar() : `<div class="sgrid">
    <div class="slist">${rows.map(x => sitem(x)).join('') || '<p class="empty">這個篩選沒有場次。</p>'}</div>
    <div class="sdetail">${s ? detail(s) : '<p class="empty">左邊選一場，或按「＋ 新增場次」。</p>'}</div></div>`}`;
  if ($('.sdetail')) $('.sdetail').scrollTop = keepD;
  const sl = $('.slist');
  if (sl) { if (keepL != null) sl.scrollTop = keepL; const it = $('.sitem.on'); if (it && (keepL == null || A.ui.scrollSel)) { sl.scrollTop = it.offsetTop - sl.offsetTop - 70; A.ui.scrollSel = false; } }
  const tb = $('#thrBody'); if (tb) tb.scrollTop = tb.scrollHeight;
}

function sitem(x) {
  const st = status(x), od = needRoles(x).some(r => overdue(x.conf[r]));
  const dots = needRoles(x).map(r => { const c = x.conf[r]; const k = x.attended_at || (c && c.state === 'confirmed') ? 'y' : c && overdue(c) ? 'x' : c && c.state !== 'none' ? 'w' : 'n';
    return `<i class="${k}" title="${ROLE_LABEL[r]}：${esc(lstate(c).t)}">${ROLE_SHORT[r]}</i>`; }).join('');
  return `<button class="sitem ${x.id === A.ui.sel ? 'on' : ''}" data-act="ssel" data-id="${x.id}">
    <span class="d">${roc(x.d).slice(4)}<small>（${WD[x.d.getDay()]}）</small></span>
    <span class="m"><b>${esc(shortPlace(x))}${isRural(x) ? '<span class="tag rural">偏鄉</span>' : ''}${od ? '<span class="tag odt">逾期</span>' : ''}</b>
      <small>${esc(x.prog)}・${esc((C(x.lecturer_id) || {}).org || '講師未定')}</small></span>
    <span class="dots">${dots}</span><span class="st">${badge(st.k, st.t)}</span></button>`;
}

function detail(s) {
  const ev = evOf(s), st = status(s), cancelled = s.status === 'cancelled';
  const nd = (label, d, n) => `<div class="nd ${d ? 'ok' : ''}"><div class="c">${d ? '✓' : n}</div><b>${label}</b><small>${d ? fmtT(d) : '尚未'}</small></div>`;
  const thread = s.msgs;
  const miss = missingEvidence(s), ph = photos(s), rec = filesOf(s, 'receipt');
  const att = people(s) ? `${num(people(s))} 人次・回饋 ${fbN(s)} 份` : '尚未登錄';
  const closeTxt = s.closed_at ? `已結案 ${fmtT(s.closed_at)}` : miss.length ? '還缺：' + miss.join('、') : '資料齊全，可以結案';
  return `
  <div class="dh"><div><span class="ds-note">${esc(s.code)}・${esc(s.prog)}・承辦 ${esc(userName(s.owner_user_id))}</span>
    <h3>${rocW(s.d)} ${esc([s.start_time, s.end_time].filter(Boolean).join('–'))}<br>${esc(placeName(s))}${isRural(s) ? '<span class="tag rural">偏鄉</span>' : ''}</h3>
    <span class="ds-note">主題：${esc(s.topic || '—')}・對象：${esc(s.audience || '—')}・預估 ${s.target || 0} 人次・${s.hours || 0} 小時${s.signups ? `・已報名 ${s.signups} 人` : ''}</span></div>
    <span class="ds-sp"></span>${badge(st.k, st.t)}</div>
  <div class="quick1">
    <button class="ds-btn" data-act="editSession" data-id="${s.id}">✏️ 編輯場次</button>
    <button class="ds-btn" data-act="openFolder" data-code="${esc(s.code)}">📂 場次資料夾</button>
    <button class="ds-btn" data-act="history" data-table="sessions" data-id="${s.id}">🕘 異動紀錄</button>
    ${isDemo() ? `<button class="ds-btn" data-act="forms" data-id="${s.id}">🔗 報名表／回饋單 ${DEMO_B}</button>` : ''}
    ${can('session.cancel') ? `<button class="ds-btn" data-act="cancelSession" data-id="${s.id}">${cancelled ? '↺ 恢復場次' : '⛔ 取消場次'}</button>` : ''}
  </div>
  <div class="quick2">
    <button class="qb ${people(s) ? 'ok' : 'todo'}" data-act="attend" data-id="${s.id}"><img class="ic" src="art/survey.png" alt=""><span><b>出席與回饋</b><small>${att}</small></span></button>
    <button class="qb ${ph.length ? 'ok' : 'todo'}" data-act="photos" data-id="${s.id}"><img class="ic" src="art/upload.png" alt=""><span><b>活動照片</b><small>${ph.length ? ph.length + ' 張・' + ph.filter(p => p.in_report).length + ' 張放進報告' : '尚未上傳'}</small></span></button>
    <button class="qb ${rec.length ? 'ok' : ''}" data-act="receipt" data-id="${s.id}"><img class="ic" src="art/signature_pen.png" alt=""><span><b>講師領據</b><small>${rec.length ? '已存 ' + rec.length + ' 份' : '一鍵產生 Word'}</small></span></button>
    <button class="qb ${s.closed_at ? 'ok' : miss.length ? 'warn' : 'main'}" data-act="close" data-id="${s.id}"><img class="ic" src="art/check.png" alt=""><span><b>場次結案</b><small>${esc(closeTxt)}</small></span></button>
  </div>
  <h4><img class="h4i" src="art/handshake.png" alt="">三方確認 <span class="ds-note">電話談完，再寄確認信請對方回覆確認，雙方都有紀錄</span></h4>
  <div class="roles">${needRoles(s).map(r => roleRow(s, r)).join('')}</div>
  <h4><img class="h4i" src="art/chats.png" alt="">信件往來 <span class="ds-note">寄出的信、對方的回覆、電話紀錄都在這一場底下</span></h4>
  <div class="thr"><div class="thrb" id="thrBody">${thread.length ? thread.map(m => msgHtml(s, m)).join('') : '<p class="ds-note">還沒有往來紀錄。</p>'}</div></div>
  <h4><img class="h4i" src="art/calendar_check.png" alt="">進度時間軸</h4>
  <div class="tl">${nd('寄出確認信', ev.invite, 1)}${nd('三方確認', ev.confirm, 2)}${nd('完成辦理', ev.attend, 3)}${nd('場次結案', ev.close, 4)}</div>
  ${s.notes ? `<h4><img class="h4i" src="art/edit.png" alt="">備註</h4><p style="white-space:pre-line;margin:0">${esc(s.notes)}</p>` : ''}`;
}

function msgHtml(s, m) {
  if (m.dir === 'sys') return `<div class="msg sys">${esc(m.body)}<span class="ds-note"> ・${ROLE_LABEL[m.role] || ''}・${fmtT(m.at)}</span></div>`;
  const c = C(roleCid(s, m.role)) || {};
  const who = m.dir === 'out' ? `${esc(m.by_user)} → ${ROLE_LABEL[m.role]}` : `${esc(c.person || c.org || '')}（${ROLE_LABEL[m.role]}）`;
  return `<div class="msg ${m.dir === 'out' ? 'out' : ''}"><div class="who">${who}・${fmtT(m.at)}</div>${m.subject ? `<div class="body"><b>${esc(m.subject)}</b></div>` : ''}<div class="body">${esc(m.body)}</div></div>`;
}

function roleRow(s, r) {
  const c = C(roleCid(s, r)), cf = s.conf[r], ls = lstate(cf), conf = cf && cf.state === 'confirmed', done = !!s.attended_at || s.status === 'cancelled';
  if (!c) return `<div class="role"><span class="rk">${ROLE_LABEL[r]}</span><span class="rc"><b class="missing">尚未指定</b><small>到「✏️ 編輯場次」選擇${ROLE_LABEL[r]}</small></span><span class="rs"></span><span class="ra"></span></div>`;
  const mailOk = !!c.email;
  return `<div class="role ${overdue(cf) ? 'od' : ''} ${conf ? 'okr' : ''}">
    <span class="rk">${ROLE_LABEL[r]}</span>
    <span class="rc"><b>${esc(c.org)}${c.type === '講師' ? ' 講師' : '　' + esc(c.title) + ' ' + esc(c.person)}</b>
      <small>☎ ${esc(c.phone || '—')}　✉ ${mailOk ? esc(c.email) : '<span class="missing">沒有 Email</span>'}　<a href="#" data-act="editContact" data-id="${c.id}">修改</a></small></span>
    <span class="rs">${badge(ls.k, ls.t)}<small>${cf && cf.called_at ? `📞 已電話聯繫 ${fmtT(cf.called_at)}（${esc(cf.called_by || '')}）` : '📞 尚未電話聯繫'}${cf && cf.sent_at && !conf ? `・寄出 ${ago(cf.sent_at)}${cf.due_date ? '・期限 ' + roc(iso2d(cf.due_date)).slice(4) : ''}` : ''}${cf && cf.reminded_at ? '・已提醒' : ''}</small></span>
    <span class="ra">${done ? '' : `
      ${!cf || !cf.called_at ? `<button class="ds-btn sm" data-act="call" data-id="${s.id}" data-r="${r}">📞 記錄電話</button>` : ''}
      ${!conf ? `<button class="ds-btn sm ${!cf || cf.state === 'none' ? 'send' : ''}" data-act="compose" data-id="${s.id}" data-r="${r}">✉ ${!cf || cf.state === 'none' ? '寄確認信' : '再寄一次'}</button>` : ''}
      ${overdue(cf) ? `<button class="ds-btn sm" data-act="compose" data-id="${s.id}" data-r="${r}" data-remind="1">🔔 寄提醒</button>` : ''}
      <button class="ds-btn sm" data-act="reply" data-id="${s.id}" data-r="${r}">📝 記錄回覆</button>
      ${isDemo() && cf && (cf.state === 'sent' || cf.state === 'opened') ? `<button class="ds-btn sm demo" data-act="simConfirm" data-id="${s.id}" data-r="${r}">🎬 模擬對方點確認連結</button><button class="ds-btn sm demo" data-act="simReply" data-id="${s.id}" data-r="${r}">🎬 模擬對方回信</button>` : ''}`}</span></div>`;
}

function calendar() {
  const now = new Date(), y = A.ui.calY ?? now.getFullYear(), m = A.ui.calM ?? now.getMonth(), first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay()); const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * DAY), evs = A.s.filter(s => s.d.toDateString() === d.toDateString());
    cells.push(`<div class="d ${d.getMonth() !== m ? 'o' : ''} ${d.toDateString() === now.toDateString() ? 'today' : ''}"><span class="dn">${d.getDate()}</span>${evs.map(s => { const st = status(s);
      return `<button class="ev" data-act="calev" data-id="${s.id}" style="background:var(--ds-${st.k === 'info' ? 'soft' : st.k + 'bg'});color:var(--${st.k === 'info' ? 'info' : 'ds-' + st.k})">${esc(shortPlace(s))}<br>${esc(st.t)}</button>`; }).join('')}</div>`);
  }
  return `<div class="toolbar"><button class="ds-btn sm" data-act="calm" data-d="-1">‹ 上個月</button><b style="font-size:22px;color:var(--ds-ink)">${y - 1911} 年 ${m + 1} 月</b><button class="ds-btn sm" data-act="calm" data-d="1">下個月 ›</button><button class="ds-btn sm" data-act="calm" data-d="0">回到本月</button></div>
    <div class="cal">${[...WD].map(w => `<div class="h">${w}</div>`).join('')}${cells.join('')}</div>`;
}

Object.assign(ACT, {
  sview: el => { A.ui.sView = el.dataset.v; render(); },
  sf: el => { A.ui.sFilter = el.dataset.f; render(); },
  ssel: el => { A.ui.sel = +el.dataset.id; render(); if ($('.sdetail')) $('.sdetail').scrollTop = 0; },
  calev: el => { A.ui.sView = 'list'; A.ui.sel = +el.dataset.id; A.ui.sFilter = '全部'; A.ui.scrollSel = true; render(); },
  calm: el => { const d = +el.dataset.d, now = new Date(); if (!d) { A.ui.calM = now.getMonth(); A.ui.calY = now.getFullYear(); }
    else { const t = new Date(A.ui.calY ?? now.getFullYear(), (A.ui.calM ?? now.getMonth()) + d, 1); A.ui.calM = t.getMonth(); A.ui.calY = t.getFullYear(); } render(); },
  openFolder: el => quiet(api('openSessionFolder', { code: el.dataset.code }).catch(e => toast(e.message, true))),
  cancelSession: async el => { const s = A.byId.get(+el.dataset.id); const to = s.status === 'cancelled' ? 'active' : 'cancelled';
    if (to === 'cancelled' && !confirm(`確定要取消 ${s.code} ${placeName(s)} 這一場嗎？（之後可以恢復）`)) return;
    await quiet(act('setSessionStatus', { id: s.id, status: to }, to === 'cancelled' ? '已取消場次（可隨時恢復）。' : '已恢復場次。')); },
  call: async el => { const s = A.byId.get(+el.dataset.id), r = el.dataset.r;
    await quiet(act('recordCall', { sessionId: s.id, role: r, note: '' }, `📞 已記錄與${ROLE_LABEL[r]}的電話聯繫。接著寄確認信請對方回覆確認。`)); },
});
