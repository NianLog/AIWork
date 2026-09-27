/**
 * 组件状态与色彩审计（一次性可复跑工具）。
 *
 * 几何审计（layout/spacing）回答「排得对不对」，本回答「看起来对不对」——
 * 但它不靠眼睛，靠解析真实浏览器里的最终计算样式：
 *
 *   1. 文字对比度：每段可见文字的实际前景 vs 有效背景（含半透明层叠加、
 *      祖先 opacity 压暗、渐变背景取全部色标做最坏情况）。WCAG 4.5:1 / 大字 3:1。
 *   2. 悬停反馈：凡是 computed cursor:pointer 的元素，鼠标移上去前后逐项比对
 *      color/background/box-shadow/border/transform——一个属性都没变 = 死 affordance
 *      （「看起来能点，点了没反应」的前半句都骗人）。
 *   3. 键盘焦点：按 Tab 走前 14 个站点，记录每个 activeElement 的 outline/box-shadow——
 *      没有任何可见焦点环的可聚焦元素是无障碍缺陷。
 *   4. 禁用态：native disabled / aria-disabled 元素的实际观感（过灰读不出 = 负优化）。
 *   5. 全页色彩普查：每种不透明背景色占了多少像素面积——品牌橙是不是只出现在
 *      该出现的位置，卡片白与页面灰是否分得开。
 *   6. 品牌色违规：#ED7D33 出现在文字色、细边框、伪元素细条上 = 违反 tokens.css
 *      写下的使用约束（该色只有 2.77:1，只许大面积色块）。
 *
 * 用法：node scripts/qc/state-audit.mjs [页面名片段]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9338;

const P = 'http://127.0.0.1:5173';
const A = 'http://127.0.0.1:5174';

const PAGES = [
  ['portal/workbench', `${P}/preview`, 1440, 900],
  ['portal/workbench@sm', `${P}/preview`, 390, 844],
  ['portal/market', `${P}/preview/market`, 1440, 900],
  ['portal/market@sm', `${P}/preview/market`, 390, 844],
  ['portal/status', `${P}/preview/status`, 1440, 900],
  ['portal/status@sm', `${P}/preview/status`, 390, 844],
  ['portal/login', `${P}/login`, 1440, 900],
  ['portal/login@sm', `${P}/login`, 390, 844],
  ['portal/workspace', `${P}/apps/ai-image-gen`, 1440, 900],
  ['portal/drawer', `${P}/preview/market`, 1440, 900, `document.querySelector('.portal-appcard__name').click()`],
  ['portal/drawer@sm', `${P}/preview/market`, 390, 844, `document.querySelector('.portal-appcard__name').click()`],
  ['portal/404', `${P}/missing`, 1440, 900],
  ['admin/apps', `${A}/preview/apps`, 1440, 900],
  ['admin/apps@sm', `${A}/preview/apps`, 390, 844, `document.querySelector('.admin-header__navtoggle').click()`],
  ['admin/users', `${A}/preview/users`, 1440, 900],
  ['admin/roles', `${A}/preview/roles`, 1440, 900],
  ['admin/orgs', `${A}/preview/organizations`, 1440, 900],
  ['admin/publish', `${A}/preview/publish`, 1440, 900],
  ['admin/login', `${A}/login`, 1440, 900],
  ['admin/404', `${A}/missing`, 1440, 900],
];

const PROBE = String.raw`(() => {
  /* ---------- 颜色数学 ---------- */
  const parseColor = (str) => {
    if (!str || str === 'none' || str === 'transparent') return null;
    let m = str.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    m = str.match(/^#([0-9a-f]{6})$/i);
    if (m) { const v = parseInt(m[1], 16); return { r: v >> 16 & 255, g: v >> 8 & 255, b: v & 255, a: 1 }; }
    return null;
  };
  const gradStops = (bgi) => {
    if (!bgi || bgi === 'none') return null;
    const cols = [...bgi.matchAll(/rgba?\([^)]*\)|#[0-9a-f]{6}/gi)]
      .map((x) => parseColor(x[0])).filter(Boolean);
    return cols.length ? cols : null;
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const contrast = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.bottom < 0 || r.top > innerHeight + 2000) return false; // 视口外太远的（滚动区外）不查
    if (el.closest('.ui-skip-link:not(:focus)')) return false;
    return true;
  };

  /*
   * 有效背景：从元素向上走，收集半透明背景层与祖先 opacity，直到遇到
   * 第一个不透明底色或渐变节点（渐变取全部色标，逐个做候选）。
   * 返回候选数组——调用方按最坏情况判定。
   */
  const bgCandidates = (el) => {
    const layers = [];          // 半透明背景层，el -> root 顺序
    let opacity = 1;            // el 到背景提供者之间的累计 opacity
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      opacity *= parseFloat(cs.opacity || '1');
      const stops = gradStops(cs.backgroundImage);
      const solid = parseColor(cs.backgroundColor);
      if (stops) {
        const bases = bgBelow(node, layers.slice(), opacity);
        return bases.flatMap((base) => stops.map((st) => ({ c: over({ ...st, a: 1 }, base.c), op: base.op, via: 'gradient ' + hex(st) })));
      }
      if (solid && solid.a >= 0.99) return [{ c: { ...solid, a: 1 }, op: opacity, via: hex(solid) }];
      if (solid && solid.a > 0.02) layers.push({ solid, opBefore: opacity });
      node = node.parentElement;
    }
    // 一路透明：落到文档底色
    const docBg = parseColor(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    let base = { ...docBg, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i].solid, base);
    return [{ c: base, op: opacity, via: 'doc' }];
  };
  const bgBelow = (fromNode, layers, op) => {
    let node = fromNode.parentElement;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      const solid = parseColor(cs.backgroundColor);
      if (solid && solid.a >= 0.99) {
        let base = { ...solid, a: 1 };
        for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i].solid, base);
        return [{ c: base, op }];
      }
      if (solid && solid.a > 0.02) layers.push({ solid });
      node = node.parentElement;
    }
    let base = parseColor(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i].solid, base);
    return [{ c: { ...base, a: 1 }, op }];
  };

  const label = (el) => {
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };
  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.trim().replace(/\s+/g, ' ');
  };

  /* ---------- 1. 文字对比度 ---------- */
  const contrastFails = [];
  const seenSig = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const t = ownText(el);
    if (!t || t.length < 2) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    if (fs < 10) continue;
    const fw = parseInt(cs.fontWeight, 10) || 400;
    const fg = parseColor(cs.color);
    if (!fg) continue;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;
    let worst = null;
    for (const cand of bgCandidates(el)) {
      // 祖先 opacity 会压暗前景：等效前景 = 文字色以 (fg.a * op) 叠在背景上
      const eff = over({ ...fg, a: fg.a * cand.op }, cand.c);
      const ratio = contrast(eff, cand.c);
      if (!worst || ratio < worst.ratio) worst = { ratio, bg: cand.c, via: cand.via, op: cand.op };
    }
    if (worst && worst.ratio < need) {
      const sig = label(el) + '|' + hex(fg) + '|' + hex(worst.bg);
      if (seenSig.has(sig)) continue;
      seenSig.add(sig);
      contrastFails.push({ el: label(el), text: t.slice(0, 24), fs: cs.fontSize, fw, fg: hex(fg), bg: hex(worst.bg), via: worst.via, ratio: +worst.ratio.toFixed(2), need });
    }
  }

  /* ---------- 6. 品牌色违规（先于 hover，避免鼠标位置污染读取） ---------- */
  const BRAND = '237, 125, 51';
  const brandViolations = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.color === 'rgb(' + BRAND + ')' && ownText(el)) {
      brandViolations.push({ where: label(el), kind: '文字色', text: ownText(el).slice(0, 18), fs: cs.fontSize });
    }
    const bw = Math.max(parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderBottomWidth) || 0);
    if (bw > 0 && bw <= 2 && (cs.borderTopColor === 'rgb(' + BRAND + ']' || cs.borderBottomColor === 'rgb(' + BRAND + ')') && r.width * r.height < 20000) {
      brandViolations.push({ where: label(el), kind: '细边框 ' + bw + 'px', size: Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const pseudo of ['::before', '::after']) {
      const pcs = getComputedStyle(el, pseudo);
      if (pcs.content === 'none' || pcs.display === 'none') continue;
      if (pcs.backgroundColor === 'rgb(' + BRAND + ')') {
        const ph = parseFloat(pcs.height) || el.getBoundingClientRect().height * 0.1;
        if (ph <= 3) brandViolations.push({ where: label(el) + pseudo, kind: '伪元素细条 ' + Math.round(ph) + 'px' });
      }
    }
  }

  /* ---------- 5. 色彩普查 ---------- */
  const paint = new Map();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const solid = parseColor(cs.backgroundColor);
    if (!solid || solid.a < 0.99) continue;
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    const key = hex(solid);
    paint.set(key, (paint.get(key) || 0) + area);
  }
  const viewport = innerWidth * innerHeight;
  const census = [...paint.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([c, a]) => ({ c, pct: Math.round((a / viewport) * 100) }));

  /* ---------- 4. 禁用态 ---------- */
  const disabledLook = [];
  const seenDis = new Set();
  for (const host of document.querySelectorAll('[disabled], [aria-disabled="true"]')) {
    if (!visible(host)) continue;
    /*
     * 跳过「视觉隐藏」的原生控件：dtd 的 Radio 把 <input> 压到 opacity:0，
     * 可见的圆点是旁边那个手绘 span；Select 的搜索 input 同理。
     * 量一个用户根本看不见的节点的对比度没有意义——它要看得见才是 bug。
     */
    if (parseFloat(getComputedStyle(host).opacity) < 0.05) continue;
    /*
     * 量「真正承载文字的那个节点」：组件库的禁用弱化色常挂在宿主 <button> 上，
     * 文字在它里面的 <span> 中。宿主自己也可能被我们的修复改了色，
     * 而文字节点仍是 rgba 弱化——只查宿主会把「已修好」误报成「依旧读不出」，
     * 反过来只查文字又会漏掉占位符输入框（文字节点就是 input 自己）。
     */
    const inner = host.querySelector('span, div');
    const textEl = inner && (inner.textContent || '').trim() ? inner : host;
    const cs = getComputedStyle(textEl);
    /* 空的 input/textarea 上可见的文字是 ::placeholder 伪元素自己的着色，
       「登录开通后可用」这类禁用说明必须按它量，而不是按 input 的 color。 */
    const isPlaceholderHost = (host.matches('input,textarea') && host.placeholder) || (textEl.matches('input,textarea') && textEl.placeholder);
    const effCs = isPlaceholderHost ? getComputedStyle(textEl, '::placeholder') : cs;
    const sig = label(host) + (textEl !== host ? ' › ' + label(textEl) : '') + (isPlaceholderHost ? ' › ::placeholder' : '');
    if (seenDis.has(sig)) continue;
    seenDis.add(sig);
    const fg = parseColor(effCs.color);
    const cands = fg ? bgCandidates(host) : [];
    let ratio = null;
    for (const cand of cands) {
      const rr = contrast(over({ ...fg, a: fg.a * cand.op }, cand.c), cand.c);
      if (ratio === null || rr < ratio) ratio = rr;
    }
    disabledLook.push({ el: sig, fg: hex(fg), alpha: fg ? fg.a : null, ratio: ratio === null ? null : +ratio.toFixed(2), opacity: getComputedStyle(host).opacity, cursor: getComputedStyle(host).cursor });
  }

  return { contrastFails, brandViolations, census, disabledLook, title: document.title };
})()`;

// hover/focus 需要多次 CDP 往返，单独一轮
/*
 * 候选 = 「语义上可交互的元素」而不是「computed cursor 是 pointer 的元素」。
 *
 * 两版教训：
 *   第一版按 cursor 收集，把 svg/path/卡片标题这些子元素也收了进来，报了 14~18 条假缺陷；
 *   第二版改成「向上找最近的 pointer 祖先」，但 cursor 是**继承属性**——
 *   链接里的每个后代都算 pointer，于是又停在了最深处的 path 上。
 * 结论：cursor 样式根本不携带「谁挂了事件」的信息，只能按元素身份收集：
 * a/button/role=button/tabindex，加上组件库里绑 onClick 的分段项，
 * 以及本项目自绘的可点卡片与宫格。
 */
const HOVER_TARGETS = String.raw`(() => {
  const sigOf = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const SEL = 'a[href], button, [role="button"], [role="menuitem"], [tabindex]:not([tabindex="-1"]), .dtm-segment-item, .portal-appcard, .portal-grid__tile';
  const INTERACTIVE = 'a[href], button, [role="button"], [role="menuitem"], .dtm-segment-item';
  const seen = new Set();
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    /*
     * 豁免：指向当前页面 / 已经是当前选中项的控件。点了不跳、本来就是所选，
     * 给它加悬停态反而是欺骗。这类「合法死悬停」统一在这里挡，而不是事后从报告划掉
     * ——否则下一个跑审计的人会把它们当真缺陷修掉。涵盖：
     *   - aria-current="page" 的链接；
     *   - 移动端分段筛选的已选中项（dtm-segment-item-selected）；
     *   - 桌面端菜单的已选中项（dtd-menu-item-selected，rc-menu 点已选是 no-op）。
     */
    if (el.getAttribute('aria-current') === 'page') continue;
    if (el.classList.contains('dtm-segment-item-selected')) continue;
    if (el.classList.contains('dtd-menu-item-selected')) continue;
    /*
     * 豁免：禁用按钮。demo 里所有写意图按钮都是 disabled（P0 阶段的既定语义），
     * 「禁用态悬停零反馈」是正确行为——给它加 hover 底色反而暗示「可以点」。
     * 移动端 mobile 库用 aria-disabled，桌面端 desktop 库用原生 disabled，两边都挡掉。
     */
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (r.top > innerHeight - 8 || r.bottom < 8) continue; // 只测首屏内的（滚出去的重来太贵）
    /*
     * 中心点裁决：悬停反馈永远发生在「指针正下方的那个交互根」上。
     * 取中心命中的元素，向上找最近的交互祖先——只有它恰好是本候选时才测：
     *   - 菜单 ul 的中心命中的是某个 menuitem → 该测的是 li，ul 自己不配悬停态；
     *   - 浮层/遮罩后面的按钮，中心命中的是遮罩 → 根本测不到，跳过（误报来源）；
     *   - 遮罩自己的中心命中自己，但遮罩不在交互名单里 → 跳过（遮罩是点掉用的，
     *     给它悬停态没有意义）。
     */
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || hit === document.body) continue;
    if (hit.closest(INTERACTIVE) !== el) continue;
    const sig = sigOf(el);
    if (seen.has(sig)) continue;
    seen.add(sig);
    const idx = out.length;
    el.setAttribute('data-qc-hover', String(idx));
    out.push({ sig, idx, x: cx, y: cy });
    if (out.length >= 22) break;
  }
  return out;
})()`;

/*
 * 按 data-qc-hover 标记直读目标元素本身的计算样式。
 * 不再用 elementFromPoint——那正是前两版误报的根源（命中的是后代不是宿主）。
 */
const readState = (idx) => `(() => {
  const el = document.querySelector('[data-qc-hover="${idx}"]');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { sig: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''), color: cs.color, bg: cs.backgroundColor, bgi: cs.backgroundImage, shadow: cs.boxShadow, border: cs.borderTopColor, transform: cs.transform, opacity: cs.opacity };
})()`;

const FOCUS_SWEEP = (n) => `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { idx: ${n}, el: '(body)' };
  const cs = getComputedStyle(el);
  const sig = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  return { idx: ${n}, el: sig, text: (el.textContent || '').trim().slice(0, 14), outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, shadow: cs.boxShadow };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextId = 1;
function send(ws, method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJson(ws, expression) {
  const { result } = await send(ws, 'Runtime.evaluate', { expression, returnByValue: true });
  return result.value;
}

async function main() {
  const filter = process.argv[2];
  const pages = filter ? PAGES.filter(([n]) => n.includes(filter)) : PAGES;
  const profile = mkdtempSync(join(tmpdir(), 'dsh-state-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: 'ignore' },
  );

  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) ?? null;
    } catch { target = null; }
  }
  if (!target) { chrome.kill(); throw new Error('未能连上 Chrome 调试端口'); }

  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error('ws error'));
  });
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  let failContrastTotal = 0, failBrandTotal = 0, deadHover = 0, noFocus = 0;

  for (const [name, url, w, h, prep] of pages) {
    await send(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
    await send(ws, 'Page.navigate', { url });
    await sleep(1500);
    if (prep) { await send(ws, 'Runtime.evaluate', { expression: prep }); await sleep(600); }

    const r = await evalJson(ws, PROBE);

    console.log(`\n══════ ${name} ══════`);

    if (r.contrastFails.length) {
      console.log(`  【对比度不达标 ${r.contrastFails.length} 处】`);
      r.contrastFails.forEach((f) => console.log(`    ${String(f.ratio).padStart(5)} < ${f.need}  ${f.el}  ${f.fg} 上 ${f.bg}${f.via.startsWith('gradient') ? '(' + f.via + ')' : ''}  ${f.fs}/${f.fw}  "${f.text}"`));
      failContrastTotal += r.contrastFails.length;
    }
    if (r.brandViolations.length) {
      console.log(`  【品牌色违规 ${r.brandViolations.length} 处】`);
      r.brandViolations.forEach((v) => console.log(`    ${v.kind}  ${v.where}  ${v.text ?? ''} ${v.size ?? ''}`));
      failBrandTotal += r.brandViolations.length;
    }

    /* hover：移入前后逐项比对；死 affordance = 全等 */
    const targets = await evalJson(ws, HOVER_TARGETS);
    const dead = [];
    for (const t of targets) {
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
      await sleep(120);
      const before = await evalJson(ws, readState(t.idx));
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: t.x, y: t.y });
      await sleep(300);
      const after = await evalJson(ws, readState(t.idx));
      if (!before || !after) continue;
      const changed = Object.keys(before).filter((k) => k !== 'sig').some((k) => before[k] !== after[k]);
      if (!changed) dead.push(after.sig);
    }
    if (dead.length) {
      console.log(`  【悬停无反馈 ${dead.length} 处】可交互元素移入后自身样式零变化：`);
      dead.forEach((d) => console.log(`    ${d}`));
      deadHover += dead.length;
    }
    const anyHover = await evalJson(ws, `matchMedia('(any-hover: hover)').matches`);
    if (!anyHover) console.log('  ! 本环境 any-hover:hover 不成立，所有 hover 规则未生效 —— 悬停结论不可信');
    // 清掉标记，避免影响下一页
    await send(ws, 'Runtime.evaluate', { expression: `document.querySelectorAll('[data-qc-hover]').forEach((e) => e.removeAttribute('data-qc-hover'))` });

    /* 键盘焦点：真实 Tab 走 12 站 */
    await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
    await send(ws, 'Runtime.evaluate', { expression: 'document.body.focus()' });
    const stops = [];
    for (let i = 1; i <= 12; i++) {
      await send(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      await sleep(100);
      const s = await evalJson(ws, FOCUS_SWEEP(i));
      stops.push(s);
    }
    const invisibleFocus = stops.filter((s) => s.el && s.el !== '(body)' &&
      (s.outline === '0px none rgb(0, 0, 0)' || s.outline.endsWith('none rgb(0, 0, 0)') || /0px none/.test(s.outline)) &&
      (s.shadow === 'none' || !s.shadow));
    if (invisibleFocus.length) {
      console.log(`  【焦点环不可见 ${invisibleFocus.length} 处】`);
      invisibleFocus.forEach((s) => console.log(`    #${s.idx} ${s.el} "${s.text ?? ''}" outline=${s.outline}`));
      noFocus += invisibleFocus.length;
    }

    if (r.disabledLook.length) {
      console.log(`  【禁用态观感】`);
      r.disabledLook.forEach((d) => console.log(`    ${d.el}  fg=${d.fg}  对比 ${d.ratio ?? '?'}  opacity=${d.opacity}  cursor=${d.cursor}${d.ratio !== null && d.ratio < 2.5 ? '  ← 过灰，几乎读不出' : ''}`));
    }
    console.log(`  【色彩普查】${r.census.map((c) => `${c.c}:${c.pct}%`).join('  ')}`);
  }

  console.log('\n════════════ 汇总 ════════════');
  console.log(`  对比度不达标：${failContrastTotal}（必须 0）`);
  console.log(`  品牌色违规：${failBrandTotal}（必须 0）`);
  console.log(`  悬停无反馈：${deadHover}（必须 0）`);
  console.log(`  焦点环不可见：${noFocus}（必须 0）`);
  const pass = failContrastTotal === 0 && failBrandTotal === 0 && deadHover === 0 && noFocus === 0;
  console.log(pass ? '\n  判定：通过' : '\n  判定：不通过');

  ws.close();
  chrome.kill();
  await sleep(200);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
  process.exitCode = pass ? 0 : 1;
}

main().catch((err) => { console.error('审计失败：', err); process.exitCode = 1; });