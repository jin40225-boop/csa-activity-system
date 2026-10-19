/* 示範模式：尚未接上的功能（真的寄信與確認連結、報名表與線上回饋單、AI 辨識）先用動畫＋假資料展示流程。
   所有模擬按鈕都標「示範」；督導在「設定 → 年度目標與參數」把示範模式設為 0 就全部隱藏。
   接上真功能時，只要把對應的模擬函式換成真的呼叫，畫面與資料流程不變。 */
'use strict';
const isDemo = () => setting('demo_mode', '0') === '1';
const DEMO_B = '<span class="demo-b">示範</span>';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** 信封飛出動畫（示範寄出：不會真的寄） */
async function flyMail(text) {
  const o = document.createElement('div'); o.className = 'demo-fly';
  o.innerHTML = `<div class="env">✉</div><div class="msg">${esc(text)}</div>`;
  document.body.appendChild(o); await sleep(1700); o.remove();
}

/** 模擬對方的手機：收到信 → 點確認連結 → 系統即時改成已確認 */
async function simConfirm(sid, role) {
  const s = A.byId.get(sid), c = C(roleCid(s, role)) || {}, lec = role === 'lecturer';
  const label = lec ? '確定出席（接受費用）' : role === 'venue' ? '確認場地可使用' : '確認協辦與聯繫窗口';
  const w = win('phone:' + sid + role, { title: '模擬：對方的手機', sub: c.org || '', icon: '📱', width: 400, html: `
    <div class="demo-phone"><div class="scr"><div class="bar">📥 收件匣</div>
      <div class="pm"><b>兒少保護方案 公務信箱</b><p>${esc(fillTpl(tpl('mail.' + role).subject, letterVars(s, role, null)))}</p>
      <p class="sm">${esc((lec ? c.org + '講師' : (c.person || c.org || '')) + '您好：……請點擊下方連結確認。')}</p>
      <button class="pbtn" data-tap>✅ ${label}</button></div>
      <div class="done" hidden>✅ 已收到您的確認，謝謝！<br><small>承辦人會在系統上即時看到。</small></div></div></div>
    <p class="hint">${DEMO_B} 正式版：對方點信裡的連結，系統自動回填。現在用模擬展示這個流程。</p>` });
  await sleep(900);
  const b = W(w, '[data-tap]'); if (!b) return;
  b.classList.add('tap'); await sleep(700);
  W(w, '.pm').hidden = true; W(w, '.done').hidden = false;
  try { await act('recordReply', { sessionId: sid, role, state: 'confirmed', via: '確認連結', body: '' }, `✅ ${c.org || ROLE_LABEL[role]}已點確認連結，狀態即時改成「已確認」。`); } catch (e) { }
  await sleep(1600); CmsKit.close(w);
}

const SAMPLE_REPLY = {
  lecturer: '雅筑您好，當天沒問題，簡報整理好後會再寄給您。請問現場有投影機與麥克風嗎？',
  venue: '您好，場地已登記，當天會開放禮堂，投影設備與麥克風都有。',
  partner: '收到，當天由我負責聯繫，會請導師帶學生 9:00 前入場。',
};
async function simReply(sid, role) {
  const c = C(roleCid(A.byId.get(sid), role)) || {};
  try { await act('recordReply', { sessionId: sid, role, state: '', via: '回信', body: SAMPLE_REPLY[role].replace('雅筑', A.d.me.name.slice(-2)) }, `📨 ${c.org || ROLE_LABEL[role]}回信了，已歸到這一場的信件往來。`); } catch (e) { }
}

/** 報名表與線上回饋單（示範連結＋模擬回收） */
function qrSvg(seed) {
  let cells = '', x = seed * 9973 + 1234567; const N = 25;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { x = (x * 1103515245 + 12345) & 0x7fffffff;
    const a = i >= N - 7 ? i - (N - 7) : i, b = j >= N - 7 ? j - (N - 7) : j, fin = (i < 7 || i >= N - 7) && (j < 7 || j >= N - 7) && !(i >= N - 7 && j >= N - 7);
    const on = fin ? (a === 0 || a === 6 || b === 0 || b === 6 || (a >= 2 && a <= 4 && b >= 2 && b <= 4)) : (x >> 16) & 1;
    if (on) cells += `<rect x="${j * 4}" y="${i * 4}" width="4" height="4"/>`; }
  return `<svg class="qr" viewBox="-4 -4 108 108"><rect x="-4" y="-4" width="108" height="108" fill="#fff"/><g fill="#2D251A">${cells}</g></svg>`;
}
function formsWindow(sid) {
  const s = A.byId.get(sid), code = s.code.replace(/\W/g, '');
  const w = win('forms:' + sid, { title: '報名表與線上回饋單', sub: `${s.code}・${shortPlace(s)}`, icon: '🔗', width: 780, html: `
    <p class="hint">${DEMO_B} 正式版會接上 Google 表單：場次自動推到表單選項、回覆自動勾稽回這一場。現在用示範連結與模擬回收展示。</p>
    <div class="wcards">
      <section class="wcard"><h4>📝 報名表</h4>${qrSvg(s.id)}<p class="sm">https://forms.gle/DEMO-${code}-signup</p>
        <div class="big" data-sg>${s.signups || 0}<small> 人已報名</small></div>
        <button class="ds-btn" data-sim-signup>🎬 模擬收到報名</button></section>
      <section class="wcard"><h4>📋 課後線上回饋單</h4>${qrSvg(s.id + 7)}<p class="sm">https://forms.gle/DEMO-${code}-feedback</p>
        <div class="big" data-fb>${s.online_fb || 0}<small> 份已回收</small></div>
        <button class="ds-btn" data-sim-fb>🎬 模擬課後線上回收</button></section>
    </div>`, foot: '<span style="flex:1"></span><button class="ds-btn" data-w-close>關閉</button>' });
  W(w, '[data-w-close]').onclick = () => CmsKit.close(w);
  const count = async (sel, from, to) => { const el = W(w, sel); for (let i = 1; i <= 20; i++) { el.firstChild.textContent = Math.round(from + (to - from) * i / 20); await sleep(45); } };
  W(w, '[data-sim-signup]').onclick = async () => {
    const cur = A.byId.get(sid), add = rint(8, 25), to = (cur.signups || 0) + add;
    await count('[data-sg]', cur.signups || 0, to);
    try { await act('saveAttendance', { id: sid, ver: cur.ver, fields: { signups: to } }, `🎬 收到 ${add} 筆報名（示範）。`); } catch (e) { }
  };
  W(w, '[data-sim-fb]').onclick = async () => {
    const cur = A.byId.get(sid), base = people(cur) || cur.target || 100, add = Math.max(5, Math.round(base * (0.15 + Math.random() * 0.1)));
    const h = satH(cur); const dist = [0.01, 0.02, 0.08, 0.29, 0.60]; let left = add;
    const inc = dist.map((p, i) => { const v = i === 4 ? left : Math.round(add * p); left -= v; return v; });
    await count('[data-fb]', cur.online_fb || 0, (cur.online_fb || 0) + add);
    const fields = { online_fb: (cur.online_fb || 0) + add }; h.forEach((v, i) => fields['sat' + (i + 1)] = v + inc[i]);
    if (cur.pre_rate != null && cur.post_rate == null) fields.post_rate = rint(84, 91);
    try { await act('saveAttendance', { id: sid, ver: cur.ver, fields }, `🎬 線上回饋單回收 ${add} 份（示範），滿意度分布與回收率已自動更新。`); } catch (e) { }
  };
}

/** AI 辨識（示範）：掃描動畫 → 把辨識結果填進出席與回饋視窗（還沒存，人確認後按儲存） */
async function aiScan(kind, aw, sid) {
  const s = A.byId.get(sid), sign = kind === 'sign', files = filesOf(s, kind);
  const fname = files.length ? files[files.length - 1].file_name : (sign ? '簽到表_掃描.pdf' : '紙本回饋單_掃描.pdf');
  const rows = Array.from({ length: 14 }, (_, i) => `<line x1="20" y1="${70 + i * 26}" x2="380" y2="${70 + i * 26}" stroke="#bbb"/>` +
    (sign ? `<path d="M210 ${88 + i * 26} q12 -14 24 0 t24 0 t20 -4" stroke="#2a4a8a" fill="none" stroke-width="2"/>` : `<rect x="${250 + (i * 37) % 100}" y="${78 + i * 26}" width="14" height="14" fill="none" stroke="#333"/><path d="M${252 + (i * 37) % 100} ${84 + i * 26} l4 5 l9 -11" stroke="#2a4a8a" fill="none" stroke-width="2.5"/>`) +
    `<text x="28" y="${88 + i * 26}" font-size="13" fill="#444">${sign ? (i + 1) + '　座號 ' + p2(i + 3) : (i + 1) + '. 題目（示意）'}</text>`).join('');
  const w = win('ai:' + sid + kind, { title: 'AI 辨識：' + fname, sub: s.code, icon: '🤖', width: 780, html: `
    <div class="aiwrap"><div class="aidoc"><svg viewBox="0 0 400 460" width="100%"><rect width="400" height="460" fill="#fdfcf8"/><text x="200" y="40" text-anchor="middle" font-size="18" font-weight="700" fill="#222">${sign ? '宣導活動簽到表' : '課後回饋單'}</text>${rows}</svg><div class="aiscan run"></div></div>
    <div class="aires" data-res><p class="hint">辨識中…</p></div></div>
    <p class="hint">${DEMO_B} 正式版：上傳的掃描檔由 AI 辨識（本機處理、個資不外送）；看不清楚的列出來讓人確認。現在用模擬結果展示。</p>`,
    foot: '<span style="flex:1"></span><button class="ds-btn" data-w-close>關閉</button><button class="ds-btn primary" data-fill disabled>✔ 填入出席與回饋（還要按儲存）</button>' });
  W(w, '[data-w-close]').onclick = () => CmsKit.close(w);
  await sleep(2200);
  const base = Math.max(30, s.target || 120);
  let res;
  if (sign) { const tot = Math.round(base * (0.92 + Math.random() * 0.06)), m = Math.round(tot * (0.48 + Math.random() * 0.06)); res = { male: m, female: tot - m };
    W(w, '[data-res]').innerHTML = `<div class="air"><b>${tot} 筆簽名</b><span>辨識完成（${Math.ceil(tot / 28)} 頁）</span></div><div class="air"><b>男 ${res.male}・女 ${res.female}</b><span>依名冊性別比對</span></div>
      <div class="aiq"><b>⚠ 2 筆字跡不清，請人工確認</b><p class="hint" style="margin:4px 0 0">第 4 頁第 12 列、第 7 頁第 3 列：已先計入，可在出席欄位修正。</p></div>`; }
  else { const n = Math.round(base * (0.55 + Math.random() * 0.15)); const inc = [0, 1, Math.round(n * .07), Math.round(n * .28)]; inc.push(n - inc.reduce((a, b) => a + b, 0)); const post = rint(84, 92);
    res = { paper_fb: n, inc, post_rate: post };
    W(w, '[data-res]').innerHTML = `<div class="air"><b>${n} 份</b><span>辨識完成</span></div><div class="air"><b>滿意＋非常滿意 ${top2(inc)}%</b><span>勾選題自動計分</span></div>
      <div class="air"><b>課後測答對 ${post}%</b><span>是非題自動對答案</span></div><div class="aiq"><b>⚠ 3 份無法判讀（重複勾選或空白），已列入人工覆核</b></div>`; }
  const btn = W(w, '[data-fill]'); btn.disabled = false;
  btn.onclick = () => {
    const set = (n, v) => { const e = W(aw, `[name="${n}"]`); if (e) { e.value = v; e.classList.add('filled'); } };
    if (sign) { set('male', res.male); set('female', res.female); }
    else { set('paper_fb', res.paper_fb); res.inc.forEach((v, i) => { const e = W(aw, `[name="sat${i + 1}"]`); if (e) set('sat' + (i + 1), (Number(e.value) || 0) + v); }); set('post_rate', res.post_rate); }
    aw.el.dispatchEvent(new Event('input', { bubbles: true }));
    CmsKit.close(w); toast('🤖 辨識結果已填入（示範）。確認數字無誤後按「儲存」。');
  };
}
function aiQuotes(aw) {
  const q = W(aw, '[name="quotes"]'); if (!q) return;
  q.value = ['原來不舒服的碰觸可以說「不要」。', '老師講得很清楚，我知道可以找誰幫忙。', '網路上認識的人也要小心。'].join('\n');
  q.classList.add('filled'); aw.el.dispatchEvent(new Event('input', { bubbles: true }));
  toast('🤖 已從紙本回饋單開放題摘錄心聲（示範），可直接修改。');
}

Object.assign(ACT, {
  simConfirm: el => simConfirm(+el.dataset.id, el.dataset.r),
  simReply: el => simReply(+el.dataset.id, el.dataset.r),
  forms: el => formsWindow(+el.dataset.id),
});
