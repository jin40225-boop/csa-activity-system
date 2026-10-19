/* 成果報告書：版型比照「子方案成果報告書」；文字、圖表、照片由資料帶入，可就地改字、切換圖表樣式，匯出真的 Word（.docx）。 */
'use strict';
const CC = ['#1F4E79', '#E8735A', '#2E8B8B', '#E0B04B', '#7BC67E', '#A77BEA'];
function chartSvg(type, data, o = {}) {
  const W = o.w || 560, H = o.h || 260, tot = data.reduce((a, d) => a + d[1], 0) || 1, F = '"Microsoft JhengHei","Noto Sans TC",sans-serif';
  const txt = (x, y, s, opt = '') => `<text x="${x}" y="${y}" font-family='${F}' ${opt}>${esc(s)}</text>`;
  let body = '';
  if (type === 'bar' || type === 'line') {
    const max = Math.max(...data.map(d => d[1]), 1) * 1.15, n = data.length || 1, gw = (W - 40) / n, bw = Math.min(46, gw * .62), base = H - 34;
    body += `<line x1="20" y1="${base}" x2="${W - 10}" y2="${base}" stroke="#C9BBA3" stroke-width="2"/>`;
    const pts = data.map((d, i) => [20 + i * gw + gw / 2, base - d[1] / max * (base - 24)]);
    data.forEach((d, i) => { const cx = 20 + i * gw + gw / 2, h = d[1] / max * (base - 24);
      if (type === 'bar') body += `<rect x="${cx - bw / 2}" y="${base - h}" width="${bw}" height="${h}" rx="6" fill="${o.mono ? CC[0] : CC[i % CC.length]}"/>`;
      if (d[1]) body += txt(cx, (type === 'bar' ? base - h : pts[i][1]) - 9, o.pct ? d[1] + '%' : num(d[1]), 'text-anchor="middle" font-size="15" font-weight="800" fill="#2D251A"');
      body += txt(cx, base + 22, d[0], 'text-anchor="middle" font-size="14" fill="#6B5B45"'); });
    if (type === 'line') body += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${CC[2]}" stroke-width="4" stroke-linejoin="round"/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="6" fill="#fff" stroke="${CC[2]}" stroke-width="3"/>`).join('');
  } else if (type === 'hbar') {
    const max = Math.max(...data.map(d => d[1]), 1) * 1.1, rh = Math.min(44, (H - 20) / (data.length || 1)), lw = 130;
    data.forEach((d, i) => { const y = 14 + i * rh, w = d[1] / max * (W - lw - 80);
      body += txt(lw - 10, y + rh * .6, d[0], 'text-anchor="end" font-size="15" fill="#2D251A"') + `<rect x="${lw}" y="${y + 4}" width="${w}" height="${rh - 12}" rx="6" fill="${CC[i % CC.length]}"/>` +
        txt(lw + w + 8, y + rh * .6, o.pct ? d[1] + '%' : num(d[1]), 'font-size="15" font-weight="800" fill="#2D251A"'); });
  } else {
    const cx = H / 2 + 6, cy = H / 2, r = H / 2 - 16; let a0 = -Math.PI / 2;
    data.forEach((d, i) => { if (d[1] <= 0) return; const a1 = a0 + d[1] / tot * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0, p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)], [x0, y0] = p(a0), [x1, y1] = p(a1 - 1e-4);
      body += `<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z" fill="${CC[i % CC.length]}" stroke="#fff" stroke-width="2"/>`; a0 = a1; });
    if (type === 'donut') body += `<circle cx="${cx}" cy="${cy}" r="${r * .58}" fill="#fff"/>` + (o.center ? txt(cx, cy + 11, o.center, `text-anchor="middle" font-size="30" font-weight="800" fill="${CC[1]}"`) : '');
    data.forEach((d, i) => { const y = 28 + i * 32; body += `<rect x="${H + 30}" y="${y - 14}" width="18" height="18" rx="4" fill="${CC[i % CC.length]}"/>` +
      txt(H + 56, y, `${d[0]}　${o.pct ? d[1] + '%' : num(d[1])}（${Math.round(d[1] / tot * 100)}%）`, 'font-size="15" fill="#2D251A"'); });
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img"><rect width="${W}" height="${H}" fill="${o.bg || 'none'}"/>${body}</svg>`;
}
function svgToPng(svg, scale = 2) {
  return new Promise((res, rej) => { const im = new Image(); const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/); const w = +m[1], h = +m[2];
    im.onload = () => { const cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/png')); };
    im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
}
/** 照片轉成 Word 用的 JPEG（長邊 1600，避免報告檔過大）。 */
function photoData(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
    cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', .85)); };
    im.onerror = () => rej(new Error('照片讀不到：' + decodeURIComponent(url.split('/').pop()))); im.src = url; });
}

/* ───────── 報告資料 ───────── */
function rptData() {
  const y = A.ui.rptYear, st = stats(y), rows = st.all.slice().sort((a, b) => a.date.localeCompare(b.date)), done = rows.filter(s => s.attended_at);
  const withPh = done.filter(s => photos(s).some(p => p.in_report && p.rel_path));
  const featured = withPh[withPh.length - 1] || null;
  const miss = done.filter(s => missingEvidence(s).length);
  const g = (lab, k) => goal(k);
  const parentDone = rows.filter(s => s.prog === '親職講座' && s.attended_at).length;
  const goals = [['宣導活動', '宣導場次', `${g('', 'goal_sessions')} 場`, `${st.doneN} 場`, st.doneN / (g('', 'goal_sessions') || 1)],
    ['', '受宣導人次', `${num(g('', 'goal_people'))} 人次`, `${num(st.ppl)} 人次`, st.ppl / (g('', 'goal_people') || 1)],
    ['', '偏鄉場次', `至少 ${g('', 'goal_rural')} 場`, `${st.ruralDone} 場（排定 ${st.ruralAll}）`, st.ruralAll / (g('', 'goal_rural') || 1)],
    ['親職講座', '場次', `${goal('goal:親職講座')} 場`, `${parentDone} 場`, parentDone / (goal('goal:親職講座') || 1)],
    ['滿意度調查', '滿意＋非常滿意', '70% 以上', `${st.top2 ?? '—'}%`, (st.top2 || 0) >= 70 ? 1 : (st.top2 || 0) / 70]];
  const today = new Date();
  const intro = `本方案以「讓孩子懂得保護自己、讓大人知道如何陪伴」為核心，${y} 年度深入校園、社區與網路辦理兒少性不當對待防治宣導。截至 ${rocLong(today)}，已辦理宣導 ${st.doneN} 場、受宣導 ${num(st.ppl)} 人次，回收回饋單 ${num(st.fbTotal)} 份，參與者表示「滿意」與「非常滿意」者達 ${st.top2 ?? '—'}%` +
    (st.pre != null ? `；校園場次課前測平均答對率 ${st.pre}%，課後測提升至 ${st.post}%，顯示學生對身體界線與求助管道的理解明顯提升。` : '。');
  const quotes = done.flatMap(s => String(s.quotes || '').split(/\n+/).map(x => x.trim()).filter(Boolean)).slice(0, 6);
  return { y, st, rows, done, featured, miss, goals, intro, quotes };
}
const CHART_OPTS = { sat: ['donut', 'pie', 'bar', 'hbar'], prog: ['bar', 'hbar', 'pie', 'donut'], month: ['bar', 'line'], pp: ['hbar', 'bar'] };
const CHART_NAME = { bar: '長條', hbar: '橫條', pie: '圓餅', donut: '環圈', line: '折線' };
function chartDefs(d) {
  const st = d.st;
  return {
    sat: { title: '回饋滿意度分布（份）', data: [['非常滿意', st.allH[4]], ['滿意', st.allH[3]], ['普通', st.allH[2]], ['不滿意', st.allH[1]], ['非常不滿意', st.allH[0]]], o: { center: (st.top2 ?? 0) + '%' } },
    prog: { title: '各方案受宣導人次', data: st.progs.map(p => [p, st.by[p].ppl]) },
    month: { title: '每月宣導人次', data: st.months.map((v, i) => [i + 1 + '月', v]) , o: { mono: true } },
    pp: { title: '校園場次課前／課後測答對率', data: [['課前測', st.pre || 0], ['課後測', st.post || 0]], o: { pct: true } },
  };
}
const chartBlock = (k, def) => `<figure class="rchart"><div class="chartsw noprint">${CHART_OPTS[k].map(x => `<button class="${x === A.ui.charts[k] ? 'on' : ''}" data-act="ctype" data-k="${k}" data-v="${x}">${CHART_NAME[x]}</button>`).join('')}</div>
  ${chartSvg(A.ui.charts[k], def.data, Object.assign({}, def.o || {}, { w: 620, h: 260, bg: '#FBF7EF' }))}<figcaption>圖：${def.title}</figcaption></figure>`;

function renderReport() {
  const years = [...new Set(A.s.map(s => s.year))].sort((a, b) => b - a);
  if (!years.includes(A.ui.rptYear)) years.unshift(A.ui.rptYear);
  $('#main').innerHTML = `<section class="panel rpt-bar"><h3 style="margin:0">📄 成果報告書</h3>
    <label class="ds-label" for="rptY">年度</label><span class="ds-select"><select id="rptY">${years.map(y => `<option value="${y}" ${y === A.ui.rptYear ? 'selected' : ''}>${y} 年</option>`).join('')}</select></span>
    <span class="ds-note">文字可直接點進去改；圖表可切換樣式；照片取自各場「放進報告」的照片</span><span class="ds-sp"></span>
    <button class="ds-btn primary" data-act="genRpt">📄 產生報告書</button>
    <button class="ds-btn" data-act="docx" ${A.ui.rptShown ? '' : 'disabled'}>⬇ 下載 Word（.docx）</button>
    <button class="ds-btn" data-act="printRpt" ${A.ui.rptShown ? '' : 'disabled'}>🖨 列印／PDF</button></section>
  <div id="paper">${A.ui.rptShown ? reportHtml() : `<div class="rpt-empty"><p>按「產生報告書」，系統會把場次、回饋、照片排進正式版型。</p></div>`}</div>`;
  $('#rptY').onchange = e => { A.ui.rptYear = +e.target.value; render(); };
}
function reportHtml() {
  const d = rptData(), defs = chartDefs(d), f = d.featured, ph = f ? photos(f).filter(p => p.in_report && p.rel_path) : [];
  const fdesc = f ? `${rocLong(f.d)}於${placeName(f)}辦理「${f.topic}」${f.prog}，由${(C(f.lecturer_id) || {}).org || ''}講師授課，出席 ${num(people(f))} 人次，回收回饋單 ${fbN(f)} 份（線上 ${f.online_fb} 份、紙本 ${f.paper_fb} 份），滿意＋非常滿意 ${top2(satH(f)) ?? '—'}%` + (f.pre_rate != null ? `，課前測答對率 ${f.pre_rate}%、課後測 ${f.post_rate}%。` : '。') : '';
  return `<article class="paper in ds-export">
    <h1 class="rt">子方案成果報告書－${esc(setting('org_name', '兒少性不當對待防治宣導'))}</h1>
    ${ph[0] ? `<img class="hero" src="${fileUrl(ph[0])}" alt="">` : ''}
    <p class="ind" contenteditable="true" data-p="intro">${esc(d.intro)}</p>
    <h2 class="rh">壹、服務指標與達成情形</h2>
    <table class="gt"><thead><tr><th>項目</th><th>指標內容</th><th>預定目標值</th><th>執行成果</th><th>執行率</th></tr></thead><tbody>
      ${d.goals.map(g => `<tr><td>${g[0]}</td><td>${g[1]}</td><td>${g[2]}</td><td>${g[3]}</td><td class="${g[4] >= 1 ? 'okc' : 'ngc'}">${Math.min(100, Math.round(g[4] * 100))}%</td></tr>`).join('')}</tbody></table>
    <h2 class="rh">貳、宣導活動辦理情形</h2>
    <table class="gt"><thead><tr><th>序號</th><th>主題</th><th>辦理方式</th><th>對象</th><th>辦理時間</th><th>地點</th><th>人次</th></tr></thead><tbody>
      ${d.rows.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.topic)}</td><td>${esc(s.prog)}</td><td>${esc(s.audience)}</td><td>${roc(s.d)}</td><td class="l">${esc(placeName(s))}${isRural(s) ? '（偏鄉）' : ''}</td><td>${s.attended_at ? num(people(s)) + (s.flags ? '*' : '') : '排定'}</td></tr>`).join('')}</tbody></table>
    ${f ? `<h2 class="rh">參、場次成果：${esc(placeName(f))}</h2>
      <div class="collage"><div class="ct">${rocC(f.d)} ${esc(f.topic)}</div><div class="cg">${ph.slice(0, 6).map(p => `<img src="${fileUrl(p)}" alt="">`).join('')}</div><div class="cd">${roc(f.d)}</div></div>
      <p class="ind" contenteditable="true" data-p="featured">${esc(fdesc)}</p>` : '<p class="note">（還沒有場次上傳「放進報告」的照片；上傳後這一節會自動出現照片拼貼。）</p>'}
    <h2 class="rh">肆、回饋與成效分析</h2>
    <div class="infog"><div class="big"><svg viewBox="0 0 200 200" width="170" height="170"><circle cx="100" cy="100" r="80" fill="none" stroke="#1F4E79" stroke-width="26"/><text x="100" y="114" text-anchor="middle" font-size="40" font-weight="800" fill="#E8735A">${d.st.top2 ?? '—'}%</text></svg><b>服務正向肯定率</b></div>
      <ul><li>✔ ${num(d.st.fbTotal)} 份有效回饋（線上與紙本合計）</li>${d.st.pre != null ? `<li>✔ 校園場次課後測答對率由 ${d.st.pre}% 提升至 ${d.st.post}%</li>` : ''}<li>✔ 受宣導 ${num(d.st.ppl)} 人次</li></ul></div>
    <div class="charts2">${['sat', 'prog', 'month', 'pp'].map(k => chartBlock(k, defs[k])).join('')}</div>
    ${d.quotes.length ? `<h3 class="rh3">參與者心聲</h3><div class="quotes">${d.quotes.map(q => `<q>${esc(q)}</q>`).join('')}</div>` : ''}
    <h2 class="rh">伍、缺件與待補</h2>${d.miss.length ? `<ul>${d.miss.map(s => `<li>${esc(s.code)} ${roc(s.d)} ${esc(placeName(s))}：缺 ${missingEvidence(s).join('、')}</li>`).join('')}</ul>` : '<p>無缺件。</p>'}
    <p class="note">本報告由系統依已登錄資料產出，文字可直接修改；正式版經承辦、督導、單位主管簽核後送出。</p>
    <div class="sign"><div>承辦人</div><div>督導</div><div>單位主管</div></div></article>`;
}

/* ───────── Word（.docx）：最小 OOXML＋ZIP（不壓縮），示範版已用 Word 實測可開 ───────── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipBytes(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  files.forEach(f => { const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length; });
  const csize = cen.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)]);
}
const b64bytes = url => { const s = atob(url.split(',')[1]); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
const imgSize = url => new Promise(r => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r([640, 427]); im.src = url; });
function DocW() {
  const media = [], body = [];
  const xe = s => esc(s).replace(/&#39;/g, '&apos;');
  const run = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="${o.ea || '標楷體'}"/>${o.b ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 24}"/><w:szCs w:val="${o.sz || 24}"/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  const api2 = {
    p(t, o = {}) { body.push(`<w:p><w:pPr>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 120}" w:line="${o.line || 400}" w:lineRule="auto"/>${o.ind ? '<w:ind w:firstLine="480"/>' : ''}</w:pPr>${run(t, o)}</w:p>`); },
    h(t) { api2.p(t, { b: true, sz: 32, color: '1F4E79', ea: '微軟正黑體', before: 360, after: 160 }); },
    h3(t) { api2.p(t, { b: true, sz: 26, color: '1F4E79', ea: '微軟正黑體', before: 200 }); },
    table(head, rows, widths) {
      const cell = (t, w, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>${run(t, { sz: 21, b: o.b })}</w:p></w:tc>`;
      const tr = (r, o) => `<w:tr>${r.map((t, i) => cell(String(t), widths[i], o)).join('')}</w:tr>`;
      body.push(`<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="6" w:space="0" w:color="999999"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${tr(head, { fill: 'EFE7DA', b: true })}${rows.map(r => tr(r)).join('')}</w:tbl>`);
      api2.p('', { after: 60 });
    },
    async img(url, wcm, caption) {
      const [w, h] = await imgSize(url); const id = media.length + 1, png = url.startsWith('data:image/png');
      media.push({ name: `word/media/image${id}.${png ? 'png' : 'jpg'}`, data: b64bytes(url), id });
      const cx = Math.round(wcm * 360000), cy = Math.round(cx * h / w);
      body.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      if (caption) api2.p(caption, { jc: 'center', sz: 20, color: '666666' });
    },
    blob() {
      const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
      const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${media.map(m => `<Relationship Id="rImg${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name.split('/').pop()}"/>`).join('')}</Relationships>`;
      return zipBytes([
        { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
        { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
        { name: 'word/document.xml', data: doc }, { name: 'word/_rels/document.xml.rels', data: rels }, ...media.map(m => ({ name: m.name, data: m.data }))]);
    },
  };
  return api2;
}
async function buildReportDocx() {
  const d = rptData(), defs = chartDefs(d), f = d.featured, W = DocW();
  const ph = f ? photos(f).filter(p => p.in_report && p.rel_path) : [];
  const para = k => { const e = $(`#paper [data-p="${k}"]`); return e ? e.textContent : ''; };
  W.p('子方案成果報告書－' + setting('org_name', '兒少性不當對待防治宣導'), { jc: 'center', b: true, sz: 36, ea: '微軟正黑體', after: 240 });
  if (ph[0]) await W.img(await photoData(fileUrl(ph[0])), 15);
  W.p(para('intro') || d.intro, { ind: true });
  W.h('壹、服務指標與達成情形');
  W.table(['項目', '指標內容', '預定目標值', '執行成果', '執行率'], d.goals.map(g => [g[0], g[1], g[2], g[3], Math.min(100, Math.round(g[4] * 100)) + '%']), [1600, 2000, 1800, 2600, 1200]);
  W.h('貳、宣導活動辦理情形');
  W.table(['序號', '主題', '辦理方式', '對象', '辦理時間', '地點', '人次'], d.rows.map((s, i) => [i + 1, s.topic, s.prog, s.audience, roc(s.d), placeName(s) + (isRural(s) ? '（偏鄉）' : ''), s.attended_at ? num(people(s)) : '排定']), [600, 2000, 1100, 900, 1200, 2500, 900]);
  if (f) { W.h('參、場次成果：' + placeName(f)); for (const p of ph.slice(0, 4)) await W.img(await photoData(fileUrl(p)), 11, p.caption || ''); W.p(para('featured'), { ind: true }); }
  W.h('肆、回饋與成效分析');
  W.p(`服務正向肯定率 ${d.st.top2 ?? '—'}%：${num(d.st.fbTotal)} 份有效回饋（線上與紙本合計）` + (d.st.pre != null ? `；校園場次課後測答對率由 ${d.st.pre}% 提升至 ${d.st.post}%。` : '。'), { ind: true });
  for (const k of ['sat', 'prog', 'month', 'pp']) await W.img(await svgToPng(chartSvg(A.ui.charts[k], defs[k].data, Object.assign({}, defs[k].o || {}, { w: 620, h: 260, bg: '#FBF7EF' }))), 14, '圖：' + defs[k].title);
  if (d.quotes.length) { W.h3('參與者心聲'); d.quotes.forEach(q => W.p(`「${q}」`, { ind: true })); }
  W.h('伍、缺件與待補');
  (d.miss.length ? d.miss.map(s => `${s.code} ${roc(s.d)} ${placeName(s)}：缺 ${missingEvidence(s).join('、')}`) : ['無缺件。']).forEach(t => W.p('・' + t));
  W.p('本報告由系統依已登錄資料產出；正式版經承辦、督導、單位主管簽核後送出。', { sz: 20, color: '666666', before: 200 });
  W.table(['承辦人', '督導', '單位主管'], [['', '', '']], [3200, 3200, 3200]);
  return W.blob();
}
const blobB64 = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });

Object.assign(ACT, {
  genRpt: () => { A.ui.rptShown = true; render(); toast('報告書已產生：文字、圖表、照片都由系統資料帶入。'); },
  ctype: el => { A.ui.charts[el.dataset.k] = el.dataset.v; el.closest('.rchart').outerHTML = chartBlock(el.dataset.k, chartDefs(rptData())[el.dataset.k]); },
  printRpt: () => window.print(),
  docx: async () => {
    toast('正在產生 Word 檔…');
    try { const b = await buildReportDocx(); const r = await api('saveDocx', { name: `${A.ui.rptYear}年成果報告書_${rocC(new Date())}.docx`, base64: await blobB64(b) }); if (!r.cancelled) toast('已存好 Word 檔：' + r.path); }
    catch (e) { toast('Word 檔產生失敗：' + e.message, true); }
  },
});
