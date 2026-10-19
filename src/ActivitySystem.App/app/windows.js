/* 浮動視窗：編輯、寫信、出席回饋、照片、領據、結案、名冊、異動紀錄。
   規則（D3）：可拖曳、不加遮罩、不鎖主畫面、同時最多 4 個；按鈕一律長在原畫面那筆資料旁邊。 */
'use strict';

function win(key, o) { return CmsKit.open(Object.assign({ key, kind: key.split(':')[0] }, o)); }
const W = (w, sel) => $(sel, w.el);
const val = (w, name) => { const e = W(w, `[name="${name}"]`); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; };
const field = (label, name, value = '', o = {}) => `<div class="ds-field ${o.full ? 'full' : ''}"><label class="ds-label">${label}</label>
  <input class="ds-input" name="${name}" value="${esc(value)}" ${o.list ? `list="${o.list}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} autocomplete="off" ${o.ro ? 'readonly' : ''}>${o.note != null ? `<span class="autof" data-note="${name}">${o.note}</span>` : ''}</div>`;
const datalist = (id, kind) => `<datalist id="${id}">${(A.d.registry || []).filter(r => r.kind === kind).map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>`;
const cLabel = c => c ? (c.type === '講師' ? `${c.org}（${c.title || '講師'}）` : `${c.org}・${c.title || ''} ${c.person || ''}`.trim()) : '';

/** 下拉＋搜尋：點一下列出名冊，打字就篩；最後一項永遠是「＋ 新增」（就地填完整資料，存進名冊）。 */
function ddInit(w, name, types, label, onChange) {
  const inp = W(w, `[name="${name}_txt"]`), box = W(w, `[data-dd="${name}"]`), hid = W(w, `[name="${name}"]`);
  const show = () => {
    const q = inp.value.trim(), list = A.d.contacts.filter(c => c.is_active && types.includes(c.type) && (!q || (c.org + c.person + c.title + c.town).includes(q))).slice(0, 30);
    box.innerHTML = list.map(c => `<button type="button" data-cid="${c.id}">${esc(c.org)} <small>${esc(c.title || '')} ${c.type === '講師' ? '' : esc(c.person || '')}・${esc(c.town || c.phone || '')}${c.email ? '' : '・缺 Email'}</small></button>`).join('') +
      `<button type="button" class="add" data-add="1">＋ 新增${label}${q ? `「${esc(q)}」` : ''}（填完整聯絡資料，存進名冊）</button>`;
    box.hidden = false;
  };
  inp.addEventListener('focus', show);
  inp.addEventListener('input', () => { hid.value = ''; inp.classList.remove('filled'); show(); onChange && onChange(); });
  box.addEventListener('mousedown', e => e.preventDefault());
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; box.hidden = true;
    if (b.dataset.add) return contactForm(null, { type: types[0], org: inp.value.trim(), label }, c => { hid.value = c.id; inp.value = cLabel(c); inp.classList.add('filled'); onChange && onChange(); });
    const c = C(+b.dataset.cid); hid.value = c.id; inp.value = cLabel(c); inp.classList.add('filled'); onChange && onChange();
  });
  inp.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
}
const ddField = (label, name, c, o = {}) => `<div class="ds-field dd ${o.full ? 'full' : ''}"><label class="ds-label">${label}</label>
  <input class="ds-input ${c ? 'filled' : ''}" name="${name}_txt" value="${esc(cLabel(c))}" placeholder="點一下選擇，或打字搜尋" autocomplete="off"><input type="hidden" name="${name}" value="${c ? c.id : ''}">
  <div class="opts" data-dd="${name}" hidden></div><span class="autof" data-note="${name}"></span></div>`;

/* ───────── 新增／編輯場次 ───────── */
function sessionForm(id) {
  const s = id ? A.byId.get(id) : null;
  const key = 'sess:' + (id || 'new');
  const w = win(key, { title: s ? '編輯場次' : '＋ 新增場次', sub: s ? s.code : '', icon: '📅', width: 780, html: `
    <div class="fgrid">
      ${field('方案', 'prog', s ? s.prog : '校園宣導', { list: 'dlProg', note: '' })}
      ${field('日期（民國年）', 'date', s ? roc(s.d) : '', { ph: '例：115/12/09', note: '' })}
      ${field('主題', 'topic', s ? s.topic : '', { list: 'dlTopic', full: true })}
      ${field('開始時間', 'start_time', s ? s.start_time : '09:10', { ph: '09:10' })}
      ${field('結束時間', 'end_time', s ? s.end_time : '10:40', { ph: '10:40' })}
      ${field('對象', 'audience', s ? s.audience : '學生', { list: 'dlAud' })}
      ${field('時數', 'hours', s ? s.hours : '1.5')}
      ${ddField('場地方', 'venue_id', s && C(s.venue_id), { full: true })}
      <div class="full" style="margin:-4px 0 10px"><div class="ruralhint" data-rural></div></div>
      ${ddField('協辦單位', 'partner_id', s && C(s.partner_id), { full: true })}
      ${ddField('講師', 'lecturer_id', s && C(s.lecturer_id), { full: true })}
      ${field('預估人次', 'target', s ? s.target : '')}
      <div class="ds-field"><label class="ds-label">承辦</label><span class="ds-select"><select name="owner_user_id">${users().filter(u => u.is_active).map(u => `<option value="${u.id}" ${(s ? s.owner_user_id : A.d.me.id) === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></span></div>
      <div class="ds-field full"><label class="ds-label">備註</label><textarea class="ds-input" name="notes" style="min-height:70px">${esc(s ? s.notes : '')}</textarea></div>
    </div>${datalist('dlProg', 'prog')}${datalist('dlTopic', 'topic')}${datalist('dlAud', 'audience')}`,
    foot: `<span class="hint">名冊沒有的對象，選「＋ 新增」就地填寫，存檔自動進名冊</span><span class="cms-sp" style="flex:1"></span>
      <button class="ds-btn" data-w-close>取消</button><button class="ds-btn primary" data-w-save>${s ? '儲存修改' : '新增場次'}</button>` });
  const sync = () => {
    const v = C(+val(w, 'venue_id')), rural = v && ruralTowns().includes(v.town);
    const rh = W(w, '[data-rural]'); rh.className = 'ruralhint' + (rural ? ' on' : '');
    rh.textContent = rural ? `📍 場地在 ${v.town}，自動標記「偏鄉場次」` : `📍 場地落在 ${ruralTowns().join('、')} 時自動標記偏鄉`;
    ['venue_id', 'partner_id', 'lecturer_id'].forEach(n => { const c = C(+val(w, n)); const nt = W(w, `[data-note="${n}"]`);
      nt.className = 'autof' + (c && !c.email ? ' newv' : ''); nt.textContent = c ? (c.email ? `✓ ☎ ${c.phone || '—'}・✉ ${c.email}` : `⚠ 這筆沒有 Email，寄確認信前請補上`) : ''; });
    const d = parseRoc(val(w, 'date')), dn = W(w, '[data-note="date"]');
    dn.className = 'autof' + (val(w, 'date') && !d ? ' newv' : ''); dn.textContent = d ? '✓ ' + rocLong(d) : val(w, 'date') ? '看不懂這個日期，請寫成 115/12/09' : '';
  };
  ddInit(w, 'venue_id', ['學校', '場地', '社區單位', '網路平台', '其他'], '場地', sync);
  ddInit(w, 'partner_id', ['學校', '社區單位', '網路平台', '其他'], '協辦單位', sync);
  ddInit(w, 'lecturer_id', ['講師'], '講師', sync);
  W(w, '[name="date"]').addEventListener('input', sync);
  if (!s) { const v = C(+val(w, 'venue_id')); if (!v) W(w, '[name="partner_id_txt"]').addEventListener('focus', () => {}); }
  sync();
  W(w, '[data-w-close]').onclick = () => CmsKit.close(w);
  W(w, '[data-w-save]').onclick = async () => {
    const fields = { prog: val(w, 'prog'), date: val(w, 'date'), topic: val(w, 'topic'), start_time: val(w, 'start_time'), end_time: val(w, 'end_time'), audience: val(w, 'audience'),
      hours: val(w, 'hours'), venue_id: val(w, 'venue_id'), partner_id: val(w, 'partner_id'), lecturer_id: val(w, 'lecturer_id'), target: val(w, 'target'), owner_user_id: val(w, 'owner_user_id'), notes: val(w, 'notes') };
    if (!parseRoc(fields.date)) return toast('日期看不懂，請寫成 115/12/09。', true);
    try {
      const r = await act('saveSession', { id: s ? s.id : null, ver: s ? s.ver : null, fields }, s ? '已儲存修改。' : '已新增場次，接著在右邊做三方確認。');
      if (!s && r) { A.ui.sel = r.id; A.ui.sFilter = '全部'; A.ui.sView = 'list'; A.ui.scrollSel = true; render(); }
      CmsKit.close(w);
    } catch (e) { /* 已提示 */ }
  };
}

/* ───────── 名冊：新增／修改一筆 ───────── */
function contactForm(id, preset = {}, onSaved) {
  const c = id ? C(id) : null, t = c ? c.type : (preset.type || '學校'), isL = t === '講師';
  const w = win('contact:' + (id || 'new' + Date.now()), { title: c ? '修改名冊資料' : `＋ 新增${preset.label || t}（存進名冊）`, icon: '🗂', width: 700, html: `
    <div class="fgrid">
      ${field(isL ? '講師姓名' : '單位名稱', 'org', c ? c.org : preset.org || '')}
      <div class="ds-field"><label class="ds-label">類別</label><span class="ds-select"><select name="type">${['學校', '場地', '社區單位', '講師', '網路平台', '其他'].map(x => `<option ${x === t ? 'selected' : ''}>${x}</option>`).join('')}</select></span></div>
      ${isL ? '' : field('聯絡人', 'person', c ? c.person : '')}
      ${field(isL ? '專長／職稱' : '職稱', 'title', c ? c.title : '')}
      ${field('電話（必填）', 'phone', c ? c.phone : '')}
      ${field('Email（寄確認信用）', 'email', c ? c.email : '', { note: '' })}
      ${field('鄉鎮市（判斷偏鄉用）', 'town', c ? c.town : '', { ph: '例：南庄鄉' })}
      ${field('地址', 'address', c ? c.address : '')}
      <div class="ds-field full"><label class="ds-label">備註</label><textarea class="ds-input" name="notes" style="min-height:60px">${esc(c ? c.notes : '')}</textarea></div>
      ${c ? `<label class="ds-check full"><input type="checkbox" class="ds-cb" name="is_active" ${c.is_active ? 'checked' : ''}> 使用中（取消勾選＝停用，舊場次照樣保留）</label>` : ''}
    </div>`,
    foot: `<span class="hint">存進名冊後，新增場次、寫信、報表都能帶入</span><span style="flex:1"></span><button class="ds-btn" data-w-close>取消</button><button class="ds-btn primary" data-w-save>${c ? '儲存' : '存進名冊'}</button>` });
  const em = W(w, '[name="email"]'), note = W(w, '[data-note="email"]');
  const chk = () => { const v = em.value.trim(), ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); note.className = 'autof' + (v && !ok ? ' newv' : ''); note.textContent = !v ? '沒有 Email 也能存，但寄確認信前要補上' : ok ? '✓ 格式正確' : '格式看起來不對，請確認'; };
  em.addEventListener('input', chk); chk();
  W(w, '[data-w-close]').onclick = () => CmsKit.close(w);
  W(w, '[data-w-save]').onclick = async () => {
    const fields = { org: val(w, 'org'), type: val(w, 'type'), person: isL ? val(w, 'org') : val(w, 'person'), title: val(w, 'title'), phone: val(w, 'phone'), email: val(w, 'email'),
      town: val(w, 'town'), address: val(w, 'address'), notes: val(w, 'notes') };
    if (c) fields.is_active = val(w, 'is_active') ? 1 : 0;
    if (!fields.org) return toast('請填寫' + (isL ? '講師姓名' : '單位名稱') + '。', true);
    if (!fields.phone && !c) return toast('請填寫電話。', true);
    try {
      const r = await act('saveContact', { id: c ? c.id : null, ver: c ? c.ver : null, fields }, c ? '名冊已更新，之後寄信、報表都用新資料。' : `「${fields.org}」已存進名冊。`);
      CmsKit.close(w); if (onSaved) onSaved(C(c ? c.id : r.id));
    } catch (e) { /* 已提示 */ }
  };
}

/* ───────── 寫確認信／提醒信 ───────── */
function composeForm(sid, role, remind) {
  const s = A.byId.get(sid), c = C(roleCid(s, role)), cf = s.conf[role] || {};
  const dueDef = cf.due_date ? iso2d(cf.due_date) : new Date(s.d.getTime() - (Number(setting('due_days_before', 3)) || 3) * DAY);
  const lastOut = [...s.msgs].reverse().find(m => m.role === role && m.dir === 'out' && m.subject);
  const t = remind ? tpl('mail.remind') : tpl('mail.' + role);
  const vars = letterVars(s, role, dueDef, { 原主旨: lastOut ? lastOut.subject.replace(/^【提醒】/, '') : '' });
  const atts = s.files.filter(f => f.rel_path && f.kind !== 'photo');
  const w = win('mail:' + sid + ':' + role, { title: (remind ? '寄提醒信給' : '寄確認信給') + ROLE_LABEL[role], sub: `${s.code}・${c ? c.org : ''}`, icon: '✉', width: 780, html: `
    ${!c || !c.email ? `<div class="unsaved">⚠ ${ROLE_LABEL[role]}沒有 Email。<button class="ds-btn sm" data-fix>補上 Email</button></div>` : ''}
    <div class="fgrid">
      ${field('收件人', 'to', c ? c.email : '', { ro: false })}
      ${field('請對方回覆的期限（民國年）', 'due', roc(dueDef))}
      ${field('主旨', 'subject', fillTpl(t.subject, vars), { full: true })}
    </div>
    <div class="ds-field"><label class="ds-label">信件內容（公版已自動帶入，可直接修改）</label><textarea class="ds-input mailbody" name="body">${esc(fillTpl(t.body, vars))}</textarea></div>
    ${atts.length ? `<div class="ds-field"><span class="ds-label">附件（勾選要一起寄的檔案）</span>${atts.map(f => `<label class="ds-check"><input type="checkbox" class="ds-cb" name="att" value="${esc(f.rel_path)}"> ${esc(f.file_name)}</label>`).join('')}</div>` : ''}
    <p class="hint">按「開啟郵件程式寄出」會用這台電腦的郵件程式（例如 Outlook 公務信箱）開一封寫好的信，按「傳送」即可；系統同時記錄「已寄出」並開始追蹤回覆期限。<br>
    <span class="later">確認連結（對方點一下自動回填）待網路表單機制建置後接上；目前請對方回信，收到後按「📝 記錄回覆」。</span></p>`,
    foot: isDemo() ? `<button class="ds-btn" data-w-close>取消</button><span style="flex:1"></span><button class="ds-btn" data-copy>📋 複製內容</button><button class="ds-btn" data-send>用郵件程式寄出</button><button class="ds-btn primary" data-demo-send>✉ 寄出 <span class="demo-b">示範・不會真的寄</span></button>`
      : `<button class="ds-btn" data-w-close>取消</button><span style="flex:1"></span><button class="ds-btn" data-copy>📋 只複製內容（自己貼到信箱）</button><button class="ds-btn primary" data-send>✉ 開啟郵件程式寄出</button>` });
  const fix = W(w, '[data-fix]'); if (fix && c) fix.onclick = () => contactForm(c.id, {}, () => { CmsKit.close(w); composeForm(sid, role, remind); });
  W(w, '[name="due"]').addEventListener('input', () => {
    const d = parseRoc(val(w, 'due')); if (!d) return; const v2 = letterVars(s, role, d, { 原主旨: vars.原主旨 });
    const b = W(w, '[name="body"]'); if (!b.dataset.edited) b.value = fillTpl(t.body, v2);
  });
  W(w, '[name="body"]').addEventListener('input', e => { e.target.dataset.edited = '1'; });
  W(w, '[data-w-close]').onclick = () => CmsKit.close(w);
  const send = async (viaMail, demo) => {
    const subject = val(w, 'subject'), body = W(w, '[name="body"]').value, due = val(w, 'due'), to = val(w, 'to');
    if (viaMail && !demo && !to) return toast('沒有收件人 Email。請先補上，或改用「只複製內容」。', true);
    try {
      await act('sendLetter', { sessionId: sid, role, subject, body, due, remind: !!remind }, null);
      if (demo) { await flyMail('已寄出（示範模式：不會真的寄出）'); toast('✉ 已記錄寄出並開始追蹤回覆期限。可以按「🎬 模擬對方點確認連結」看對方確認後的變化。'); }
      else if (viaMail) { await api('mailDraft', { to, subject, body, attachmentPaths: $$('[name="att"]:checked', w.el).map(x => x.value) }); toast('已開啟郵件程式，請確認後按「傳送」。系統已記錄寄出時間並開始追蹤。'); }
      else { await api('copyText', { text: `主旨：${subject}\n\n${body}` }); toast('信件內容已複製，請貼到公務信箱寄出。系統已記錄寄出時間並開始追蹤。'); }
      CmsKit.close(w);
    } catch (e) { if (!e.conflict) toast(e.message, true); }
  };
  W(w, '[data-send]').onclick = () => send(true);
  W(w, '[data-copy]').onclick = () => send(false);
  const ds = W(w, '[data-demo-send]'); if (ds) ds.onclick = () => send(true, true);
}

/* ───────── 記錄對方回覆 ───────── */
function replyForm(sid, role) {
  const s = A.byId.get(sid), c = C(roleCid(s, role)) || {};
  const w = win('reply:' + sid + ':' + role, { title: '記錄' + ROLE_LABEL[role] + '的回覆', sub: `${s.code}・${c.org || ''}`, icon: '📝', width: 620, html: `
    <div class="ds-field"><span class="ds-label">對方的回覆</span>
      <label class="ds-check"><input type="radio" name="state" value="confirmed" checked> ✅ 已確認（${role === 'lecturer' ? '確定出席、接受費用' : role === 'venue' ? '場地可使用' : '確認協辦'}）</label>
      <label class="ds-check"><input type="radio" name="state" value="declined"> ⛔ 婉拒／需要改期</label>
      <label class="ds-check"><input type="radio" name="state" value=""> 💬 只是回信（不改確認狀態）</label></div>
    <div class="ds-field"><label class="ds-label">回覆方式</label><span class="ds-select"><select name="via">${['回信', '電話', '當面', 'LINE', '確認連結'].map(x => `<option>${x}</option>`).join('')}</select></span></div>
    <div class="ds-field"><label class="ds-label">回覆內容（可貼上對方的回信，選填）</label><textarea class="ds-input" name="body"></textarea></div>`,
    foot: `${(s.conf[role] || {}).state && (s.conf[role] || {}).state !== 'none' ? '<button class="ds-btn" data-reset>↺ 重設確認狀態</button>' : ''}<span style="flex:1"></span><button class="ds-btn" data-w-close>取消</button><button class="ds-btn primary" data-save>儲存</button>` });
  W(w, '[data-w-close]').onclick = () => CmsKit.close(w);
  const rs = W(w, '[data-reset]'); if (rs) rs.onclick = async () => { if (!confirm('重設後要重新寄確認信（例如換了講師或場地）。確定？')) return; await quiet(act('resetConfirmation', { sessionId: sid, role }, '已重設。')); CmsKit.close(w); };
  W(w, '[data-save]').onclick = async () => {
    const state = (W(w, '[name="state"]:checked') || {}).value || '';
    try { await act('recordReply', { sessionId: sid, role, state, via: val(w, 'via'), body: W(w, '[name="body"]').value }, state === 'confirmed' ? `✅ ${ROLE_LABEL[role]}已確認。` : '已記錄。'); CmsKit.close(w); } catch (e) { }
  };
}

/* ───────── 出席與回饋（照實際流程：線上、紙本掃描、簽到表、前後測） ───────── */
function attendForm(sid) {
  const s = A.byId.get(sid), net = s.prog === '網路宣導', closed = !!s.closed_at;
  const n = (label, name, v, o = {}) => `<div class="ds-field"><label class="ds-label">${label}</label><input class="ds-input" name="${name}" inputmode="numeric" value="${v ?? ''}" ${closed ? 'disabled' : ''} ${o.ph ? `placeholder="${o.ph}"` : ''}></div>`;
  const fl = k => filesOf(s, k).map(f => `<button data-open="${f.id}">📄 ${esc(f.file_name)}</button>`).join('') || '<span class="hint">還沒上傳</span>';
  const w = win('attend:' + sid, { title: '出席與回饋', sub: `${s.code}・${shortPlace(s)}`, icon: '📋', width: 860, html: `
    ${closed ? '<div class="readonly-note">這一場已結案，資料唯讀；要修改請督導在「場次結案」重新開啟。</div>' : '<div class="unsaved" data-unsaved hidden></div>'}
    <div class="wcards">
      <section class="wcard"><h4><span class="no">1</span>${net ? '網路觸及' : '簽到表 → 出席人次'}</h4>
        ${net ? n('觸及人次', 'reach', s.reach) + '<p class="hint">網路場次人次算法待委辦單位確認。</p>' :
          `<div class="fgrid">${n('男', 'male', s.male)}${n('女', 'female', s.female)}</div><p class="hint" data-total></p>
          <div class="files">${fl('sign')}</div>${closed ? '' : '<button class="ds-btn sm" data-up="sign">⬆ 上傳簽到表（掃描 PDF／照片）</button>'}
          ${isDemo() && !closed ? `<button class="ds-btn sm demo" data-ai="sign">🤖 AI 辨識簽到表 ${DEMO_B}</button>` : '<span class="later">AI 數簽名、依名冊算男女：之後接上</span>'}`}</section>
      <section class="wcard"><h4><span class="no">2</span>回饋單份數</h4>
        <div class="fgrid">${n('線上回饋單', 'online_fb', s.online_fb)}${n('紙本回饋單', 'paper_fb', s.paper_fb)}</div>
        <div class="files">${fl('paper')}</div>${closed ? '' : '<button class="ds-btn sm" data-up="paper">⬆ 上傳紙本回饋單掃描檔</button>'}
        ${isDemo() && !closed ? `<div class="ds-row"><button class="ds-btn sm demo" data-ai="paper">🤖 AI 辨識紙本回饋單 ${DEMO_B}</button><button class="ds-btn sm demo" data-forms>🎬 線上回饋單 ${DEMO_B}</button></div>` : '<span class="later">線上表單自動勾稽、紙本 AI 辨識：之後接上</span>'}</section>
      <section class="wcard"><h4><span class="no">3</span>滿意度分布（份）</h4>
        <div class="sat5">${['非常不滿意', '不滿意', '普通', '滿意', '非常滿意'].map((l, i) => `<div class="ds-field"><label class="ds-label" style="font-size:14px">${l}</label><input class="ds-input" name="sat${i + 1}" inputmode="numeric" value="${s['sat' + (i + 1)] || 0}" ${closed ? 'disabled' : ''}></div>`).join('')}</div>
        <p class="hint" data-sat></p></section>
      <section class="wcard"><h4><span class="no">4</span>前後測與心聲</h4>
        <div class="fgrid">${n('課前測答對率 %', 'pre_rate', s.pre_rate)}${n('課後測答對率 %', 'post_rate', s.post_rate)}</div>
        <div class="ds-field"><label class="ds-label">參與者心聲（一行一則，會放進成果報告書）</label><textarea class="ds-input" name="quotes" style="min-height:80px" ${closed ? 'disabled' : ''}>${esc(s.quotes || '')}</textarea></div>${isDemo() && !closed ? `<button class="ds-btn sm demo" data-aiq>🤖 AI 摘錄心聲 ${DEMO_B}</button>` : ''}</section>
    </div>`,
    foot: closed ? '<span style="flex:1"></span><button class="ds-btn" data-w-close>關閉</button>' : `<span class="hint">數字改完按「儲存」才會寫入；別人同時改同一場會提醒你</span><span style="flex:1"></span><button class="ds-btn" data-w-close>關閉</button><button class="ds-btn primary" data-save>儲存</button>` });
  const names = ['male', 'female', 'reach', 'online_fb', 'paper_fb', 'sat1', 'sat2', 'sat3', 'sat4', 'sat5', 'pre_rate', 'post_rate', 'quotes'];
  const orig = {}; names.forEach(k => { const e = W(w, `[name="${k}"]`); if (e) orig[k] = e.value; });
  const upd = () => {
    const g = k => Number(val(w, k)) || 0;
    const t = W(w, '[data-total]'); if (t) t.textContent = `合計 ${g('male') + g('female')} 人次（自動加總）`;
    const h = [1, 2, 3, 4, 5].map(i => g('sat' + i)), tot = h.reduce((a, b) => a + b, 0), fb = g('online_fb') + g('paper_fb');
    W(w, '[data-sat]').textContent = tot ? `共 ${tot} 份；滿意＋非常滿意 ${top2(h)}%` + (fb && tot !== fb ? `（⚠ 與回饋單份數 ${fb} 不一致，請確認）` : '') : '';
    const un = W(w, '[data-unsaved]'); if (un) { const c = names.filter(k => W(w, `[name="${k}"]`) && W(w, `[name="${k}"]`).value !== orig[k]).length; un.hidden = !c; un.textContent = `還有 ${c} 處沒存`; }
  };
  w.el.addEventListener('input', upd); upd();
  W(w, '[data-w-close]').onclick = () => { const un = W(w, '[data-unsaved]'); if (un && !un.hidden && !confirm('還有修改沒存，確定關閉？')) return; CmsKit.close(w); };
  $$('[data-open]', w.el).forEach(b => b.onclick = () => quiet(api('openAttachment', { id: +b.dataset.open }).catch(e => toast(e.message, true))));
  $$('[data-up]', w.el).forEach(b => b.onclick = async () => { try { const r = await api('pickFiles', { sessionId: sid, code: s.code, kind: b.dataset.up }); if (r.cancelled) return; await refresh(); toast(`已上傳 ${r.count} 個檔案到場次資料夾。`); attendForm(sid); } catch (e) { toast(e.message, true); } });
  $$('[data-ai]', w.el).forEach(b => b.onclick = () => aiScan(b.dataset.ai, w, sid));
  const aq = W(w, '[data-aiq]'); if (aq) aq.onclick = () => aiQuotes(w);
  const fm = W(w, '[data-forms]'); if (fm) fm.onclick = () => { const un = W(w, '[data-unsaved]'); if (un && !un.hidden) return toast('請先儲存或關閉這個視窗，再模擬線上回收（避免數字互相覆蓋）。', true); CmsKit.close(w); formsWindow(sid); };
  const sv = W(w, '[data-save]');
  if (sv) sv.onclick = async () => {
    const fields = {}; names.forEach(k => { const e = W(w, `[name="${k}"]`); if (e) fields[k] = e.value.trim(); });
    try { await act('saveAttendance', { id: sid, ver: s.ver, fields }, '出席與回饋已儲存，統計同步更新。'); CmsKit.close(w); } catch (e) { if (e.conflict) { CmsKit.close(w); attendForm(sid); } }
  };
}

/* ───────── 活動照片 ───────── */
function photosForm(sid) {
  const s = A.byId.get(sid), ph = photos(s), closed = !!s.closed_at;
  const w = win('photos:' + sid, { title: '活動照片', sub: `${s.code}・${shortPlace(s)}・${ph.length} 張`, icon: '📷', width: 900, html: `
    <p class="hint">勾選「放進報告」的照片會排進成果報告書的照片拼貼；說明文字會當圖說。照片檔存在 NAS 的場次資料夾，原檔不動。</p>
    <div class="pgrid">${ph.map(p => `<div class="ph ${p.in_report ? '' : 'out'}">${p.rel_path ? `<img src="${fileUrl(p)}" alt="" data-zoom="${fileUrl(p)}" loading="lazy">` : `<div class="noimg">${esc(p.file_name)}</div>`}
      <div class="pb"><input data-cap="${p.id}" value="${esc(p.caption || '')}" placeholder="說明（選填）" ${closed ? 'disabled' : ''}>
      <label><input type="checkbox" class="ds-cb" data-inr="${p.id}" ${p.in_report ? 'checked' : ''} ${closed ? 'disabled' : ''}> 放進報告</label>
      <div class="ds-row">${p.rel_path ? `<button class="ds-btn sm" data-open="${p.id}">開啟</button>` : ''}${can('file.delete') && !closed ? `<button class="ds-btn sm" data-del="${p.id}">刪除</button>` : ''}</div></div></div>`).join('') || '<p class="empty">還沒有照片。</p>'}</div>`,
    foot: `<button class="ds-btn" data-folder>📂 開啟資料夾</button><span style="flex:1"></span><button class="ds-btn" data-w-close>關閉</button>${closed ? '' : '<button class="ds-btn primary" data-up>⬆ 選擇照片上傳（可多選）</button>'}` });
  W(w, '[data-w-close]').onclick = () => CmsKit.close(w);
  W(w, '[data-folder]').onclick = () => quiet(api('openSessionFolder', { code: s.code }).catch(e => toast(e.message, true)));
  const up = W(w, '[data-up]'); if (up) up.onclick = async () => { try { const r = await api('pickFiles', { sessionId: sid, code: s.code, kind: 'photo' }); if (r.cancelled) return; await refresh(); toast(`已上傳 ${r.count} 張照片。`); photosForm(sid); } catch (e) { toast(e.message, true); } };
  $$('[data-open]', w.el).forEach(b => b.onclick = () => quiet(api('openAttachment', { id: +b.dataset.open }).catch(e => toast(e.message, true))));
  $$('[data-zoom]', w.el).forEach(im => im.onclick = () => { const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${im.dataset.zoom}" alt="">`; lb.onclick = () => lb.remove(); document.body.appendChild(lb); });
  $$('[data-cap]', w.el).forEach(i => i.onchange = () => quiet(act('updateAttachment', { id: +i.dataset.cap, fields: { caption: i.value } }, '圖說已儲存。')));
  $$('[data-inr]', w.el).forEach(i => i.onchange = async () => { await quiet(act('updateAttachment', { id: +i.dataset.inr, fields: { in_report: i.checked ? 1 : 0 } }, null)); photosForm(sid); });
  $$('[data-del]', w.el).forEach(b => b.onclick = async () => { if (!confirm('刪除這張照片的紀錄？（檔案仍留在資料夾，可找回）')) return; await quiet(act('updateAttachment', { id: +b.dataset.del, fields: { is_deleted: 1 } }, '已刪除。')); photosForm(sid); });
}

/* ───────── 講師領據（範本資料夾的 Word 範本填值） ───────── */
const cnNum = n => { const d = '零壹貳參肆伍陸柒捌玖', u = ['', '拾', '佰', '仟'], b = ['', '萬', '億']; if (!n) return '零元整'; let s = '', g = 0;
  while (n > 0) { const part = n % 10000; let t = '', z = false; for (let i = 0; i < 4; i++) { const x = Math.floor(part / 10 ** i) % 10; if (x) { t = d[x] + u[i] + (z ? '零' : '') + t; z = false; } else if (t) z = true; } if (part) s = t + b[g] + s; n = Math.floor(n / 10000); g++; }
  return s + '元整'; };
function receiptForm(sid) {
  const s = A.byId.get(sid), l = C(s.lecturer_id), rate = s.fee_per_hour || Number(setting('fee_per_hour', 2000)) || 0;
  const tplOk = (A.app.templateFiles || []).includes('講師領據.docx');
  const w = win('receipt:' + sid, { title: '講師領據', sub: `${s.code}・${l ? l.org : '講師未定'}`, icon: '🧾', width: 620, html: `
    ${!tplOk ? `<div class="unsaved">⚠ 範本資料夾找不到「講師領據.docx」。<button class="ds-btn sm" data-tpl>開啟範本資料夾</button></div>` : ''}
    <div class="fgrid">
      ${field('講師', 'lect', l ? l.org : '', { ro: true })}${field('授課時數', 'hours', s.hours)}
      ${field('每小時鐘點費（元）', 'rate', rate)}${field('交通費', 'traffic', '依實際核支')}
    </div><p class="hint" data-total></p>
    <p class="hint">身分證字號、戶籍地址、簽章由講師親填，系統不預填。換成貴中心正式領據：把 Word 範本放進「範本」資料夾（檔名 講師領據.docx），用 {{佔位字}} 標出要填的地方。</p>
    ${filesOf(s, 'receipt').length ? `<div class="files">${filesOf(s, 'receipt').map(f => `<button data-open="${f.id}">📄 ${esc(f.file_name)}</button>`).join('')}</div>` : ''}`,
    foot: `<button class="ds-btn" data-tpl>📂 範本資料夾</button>${s.closed_at ? '' : '<button class="ds-btn" data-up>⬆ 上傳簽好的領據</button>'}<span style="flex:1"></span><button class="ds-btn" data-w-close>關閉</button><button class="ds-btn primary" data-make>⬇ 產生 Word 領據</button>` });
  const tot = () => { const t = Math.round((Number(val(w, 'hours')) || 0) * (Number(val(w, 'rate')) || 0)); W(w, '[data-total]').textContent = `鐘點費 ${num(t)} 元（${cnNum(t)}）`; return t; };
  w.el.addEventListener('input', tot); tot();
  W(w, '[data-w-close]').onclick = () => CmsKit.close(w);
  $$('[data-tpl]', w.el).forEach(b => b.onclick = () => quiet(api('openTemplatesFolder').catch(e => toast(e.message, true))));
  $$('[data-open]', w.el).forEach(b => b.onclick = () => quiet(api('openAttachment', { id: +b.dataset.open }).catch(e => toast(e.message, true))));
  const up = W(w, '[data-up]'); if (up) up.onclick = async () => { try { const r = await api('pickFiles', { sessionId: sid, code: s.code, kind: 'receipt' }); if (r.cancelled) return; await refresh(); toast('已上傳領據。'); receiptForm(sid); } catch (e) { toast(e.message, true); } };
  W(w, '[data-make]').onclick = async () => {
    if (!l) return toast('這一場還沒指定講師。', true);
    const t = tot(), d = s.d, me = A.d.me;
    const values = { 方案名稱: setting('org_name', ''), 課程名稱: `${s.prog}－${s.topic || ''}`, 辦理日期: rocLong(d), 辦理時間: [s.start_time, s.end_time].filter(Boolean).join('–'), 辦理地點: placeName(s),
      講師姓名: l.org, 授課時數: String(val(w, 'hours')), 鐘點費單價: num(val(w, 'rate')), 鐘點費: num(t), 交通費: val(w, 'traffic'), 合計: num(t), 合計大寫: cnNum(t), 承辦: me.name,
      民國年: String(d.getFullYear() - 1911), 月: String(d.getMonth() + 1), 日: String(d.getDate()) };
    try { const r = await api('receipt', { values, name: `講師領據_${l.org}_${rocC(d)}.docx` }); if (r.cancelled) return; toast('已產生領據 Word 檔' + (r.missing && r.missing.length ? `（範本裡有沒對應的佔位字：${r.missing.join('、')}）` : '。')); }
    catch (e) { toast(e.message, true); }
  };
}

/* ───────── 結案 ───────── */
function closeForm(sid) {
  const s = A.byId.get(sid), miss = missingEvidence(s);
  const items = [['出席人次', people(s) ? num(people(s)) + ' 人次' : ''], ['回饋單', s.reach != null ? '網路場次免' : fbN(s) ? fbN(s) + ' 份' : ''], ['活動照片', photos(s).length ? photos(s).length + ' 張' : ''],
    ['簽到表', s.reach != null ? '網路場次免' : filesOf(s, 'sign').length ? filesOf(s, 'sign').length + ' 份' : '']];
  const w = win('close:' + sid, { title: '場次結案', sub: `${s.code}・${shortPlace(s)}`, icon: '✔', width: 560, html: `
    ${s.closed_at ? `<p>已於 ${fmtT(s.closed_at)} 由 ${esc(s.closed_by || '')} 結案。結案後資料唯讀，報表直接採用。</p>` : `<p>四項證據齊了才能結案：</p>`}
    <ul style="list-style:none;padding:0;margin:0">${items.map(([k, v]) => `<li style="font-size:18px;margin:6px 0">${v ? '✅' : '⬜'} ${k}　<b>${esc(v || '還缺')}</b></li>`).join('')}</ul>`,
    foot: `<span style="flex:1"></span><button class="ds-btn" data-w-close>關閉</button>${s.closed_at ? (can('session.reopen') ? '<button class="ds-btn" data-reopen>↺ 重新開啟</button>' : '') :
      `<button class="ds-btn primary" data-close ${miss.length ? 'disabled' : ''}>✔ 確認無誤，結案</button>`}` });
  W(w, '[data-w-close]').onclick = () => CmsKit.close(w);
  const cl = W(w, '[data-close]'); if (cl) cl.onclick = async () => { try { await act('closeSession', { id: sid }, '場次已結案，總覽與成果報告書同步更新。'); CmsKit.close(w); } catch (e) { } };
  const ro = W(w, '[data-reopen]'); if (ro) ro.onclick = async () => { try { await act('closeSession', { id: sid, reopen: true }, '已重新開啟。'); CmsKit.close(w); } catch (e) { } };
}

/* ───────── 異動紀錄 ───────── */
async function historyForm(table, id) {
  try {
    const rows = await api('history', { table, id });
    win('hist:' + table + id, { title: '異動紀錄', sub: table === 'sessions' ? (A.byId.get(id) || {}).code : '', icon: '🕘', width: 620,
      html: rows.length ? `<table class="ds-table"><thead><tr><th>時間</th><th>誰</th><th>做了什麼</th></tr></thead><tbody>${rows.map(r => `<tr><td class="nw">${fmtT(r.at)}</td><td>${esc(r.user_name)}</td><td>${esc(r.summary)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">沒有紀錄。</p>' });
  } catch (e) { toast(e.message, true); }
}

Object.assign(ACT, {
  newSession: () => sessionForm(null),
  editSession: el => sessionForm(+el.dataset.id),
  editContact: el => contactForm(+el.dataset.id),
  newContact: el => contactForm(null, { type: el.dataset.type || '學校' }),
  compose: el => composeForm(+el.dataset.id, el.dataset.r, !!el.dataset.remind),
  reply: el => replyForm(+el.dataset.id, el.dataset.r),
  attend: el => attendForm(+el.dataset.id),
  photos: el => photosForm(+el.dataset.id),
  receipt: el => receiptForm(+el.dataset.id),
  close: el => closeForm(+el.dataset.id),
  history: el => historyForm(el.dataset.table, +el.dataset.id),
});
