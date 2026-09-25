/**
 * 间距 / 重叠审计（临时工具）。
 *
 * 起因：反馈「组件样式上下重叠、紧靠严重，几乎存在全部页面」。
 * 「重叠」是几何事实，不该靠肉眼猜——这个脚本把每个页面的垂直节奏量出来：
 *   - 同级元素里，后一个的顶边高于前一个的底边（gap < 0）→ 真重叠，一定是缺陷；
 *   - gap 在 0~4px 之间 → 紧靠，视觉上会粘成一块；
 *   - 找出造成负 gap 的元素自身的 margin / padding，定位到是哪条规则干的。
 *
 * 另外标出「负外边距」的使用点：`.ui-section__link { margin: -8px -4px }` 这类为了
 * 扩大触控区而加的东西，如果没算准就会把相邻元素吃掉。
 *
 * 用法：node scripts/qc/spacing-audit.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9335;

const PAGES = [
  ['portal/workbench', 'http://127.0.0.1:5173/preview', 390],
  ['portal/workbench@lg', 'http://127.0.0.1:5173/preview', 1440],
  ['portal/market', 'http://127.0.0.1:5173/preview/market', 390],
  ['portal/market@lg', 'http://127.0.0.1:5173/preview/market', 1440],
  ['portal/status', 'http://127.0.0.1:5173/preview/status', 390],
  ['portal/status@md', 'http://127.0.0.1:5173/preview/status', 900],
  ['portal/status@lg', 'http://127.0.0.1:5173/preview/status', 1440],
  ['portal/login', 'http://127.0.0.1:5173/login', 390],
  // 子应用工作区：全屏接管，不套门户外壳
  ['portal/workspace', 'http://127.0.0.1:5173/apps/ai-image-gen', 390],
  ['portal/workspace@lg', 'http://127.0.0.1:5173/apps/ai-image-gen', 1440],
  ['portal/workspace-missing', 'http://127.0.0.1:5173/apps/nope', 390],
  ['admin/apps', 'http://127.0.0.1:5174/preview/apps', 1440],
  ['admin/users', 'http://127.0.0.1:5174/preview/users', 1440],
  ['admin/roles', 'http://127.0.0.1:5174/preview/roles', 1440],
  ['admin/orgs', 'http://127.0.0.1:5174/preview/organizations', 1440],
  ['admin/publish', 'http://127.0.0.1:5174/preview/publish', 1440],
  ['admin/apps@sm', 'http://127.0.0.1:5174/preview/apps', 390],
  ['admin/login', 'http://127.0.0.1:5174/login', 1440],
  ['admin/login@sm', 'http://127.0.0.1:5174/login', 390],
];

const PROBE = String.raw`(() => {
  const label = (el) => {
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return el.tagName.toLowerCase() + cls;
  };
  const short = (s) => (s || '').trim().replace(/\s+/g, ' ').slice(0, 20);

  const overlaps = [];
  const tight = [];
  const negativeMargins = [];

  for (const parent of document.querySelectorAll('body *')) {
    const style = getComputedStyle(parent);
    if (style.display !== 'flex' && style.display !== 'block' && style.display !== 'grid') continue;

    // 只比较「同一父级下的同级块」，且在页面纵向排布的那些
    const kids = Array.from(parent.children).filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.height > 0 && r.width > 0 && s.position !== 'fixed' && s.position !== 'absolute'
        && s.display !== 'none' && s.visibility !== 'hidden';
    });
    if (kids.length < 2) continue;

    // 纵向排列（grid 多列时不用比；只比较前一个底边与后一个顶边）
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1].getBoundingClientRect();
      const b = kids[i].getBoundingClientRect();
      // 只在同一列（水平有重叠）时才比较纵向间距，避免把并排卡片误判成上下相邻
      const horizontallyOverlaps = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 8;
      if (!horizontallyOverlaps) continue;
      const gap = b.top - a.bottom;
      /*
       * DOM 顺序不等于视觉顺序：grid 自动排布会把宽度大的项整行占掉，
       * 于是「DOM 里的前一项」可能在视觉上位于后一项的下方或同一行，
       * 算出巨大的负 gap（publish 页的 .ui-field--full 就这样被误报成 -19px）。
       * 只有「前一项的顶边确实在后一项顶边之上」才谈得上上下相邻；
       * 容差 1px 是为了放过亚像素抖动，同时仍拦住同一行的相邻项。
       */
      if (a.top > b.top - 1) continue;
      const record = {
        parent: label(parent),
        prev: label(kids[i - 1]),
        next: label(kids[i]),
        gap: Math.round(gap * 10) / 10,
        nextMarginTop: getComputedStyle(kids[i]).marginTop,
        nextMarginBottom: getComputedStyle(kids[i]).marginBottom,
        nextPaddingTop: getComputedStyle(kids[i]).paddingTop,
        prevMarginBottom: getComputedStyle(kids[i - 1]).marginBottom,
        text: short(kids[i].textContent),
      };
      if (gap < -0.5) overlaps.push(record);
      else if (gap < 5) tight.push(record);
    }
  }

  // 负外边距的使用点：扩大触控区的常见手法，最容易造成重叠
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const m = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']
      .filter((k) => parseFloat(s[k]) < 0)
      .map((k) => k + ':' + s[k]);
    if (m.length) {
      const r = el.getBoundingClientRect();
      negativeMargins.push({ el: label(el), margins: m.join(','), size: Math.round(r.width) + 'x' + Math.round(r.height), text: short(el.textContent) });
    }
  }

  // 文字行盒紧贴：行高小于字号 1.25 倍时，中文会上下相碰
  const tightLines = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 0) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    const s = getComputedStyle(el);
    // 等宽数字（tabular-nums）里没有可碰的上下构件，行高可以收到 1.15；
    // 只统计真正的文字，否则这一栏会被表格里的版本号与日期刷满，盖掉真问题。
    if (s.fontVariantNumeric.includes('tabular-nums')) continue;
    const fs = parseFloat(s.fontSize);
    const lh = s.lineHeight === 'normal' ? fs * 1.2 : parseFloat(s.lineHeight);
    if (fs > 0 && lh < fs * 1.25) tightLines.push({ el: label(el), fontSize: s.fontSize, lineHeight: s.lineHeight, text: short(t) });
  }

  return {
    overlaps: overlaps.slice(0, 20),
    tight: tight.slice(0, 20),
    negativeMargins: negativeMargins.slice(0, 20),
    tightLines: tightLines.slice(0, 12),
    overlapCount: overlaps.length,
    tightCount: tight.length,
  };
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

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-space-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
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

  const summary = [];
  for (const [name, url, width] of PAGES) {
    await send(ws, 'Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await send(ws, 'Page.navigate', { url });
    await sleep(1300);
    const { result } = await send(ws, 'Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const r = result.value;
    summary.push({ name, overlaps: r.overlapCount, tight: r.tightCount, tightLines: r.tightLines.length });
    console.log(`\n===== ${name} =====  重叠 ${r.overlapCount} / 紧靠 ${r.tightCount}`);

    if (r.overlaps.length) {
      console.log('  【真重叠 gap<0】');
      r.overlaps.forEach((o) => console.log(
        `    ${o.gap}px  ${o.parent}  内  ${o.prev} → ${o.next}` +
        `  [next mt=${o.nextMarginTop} mb=${o.nextMarginBottom} pt=${o.nextPaddingTop} / prev mb=${o.prevMarginBottom}] "${o.text}"`));
    }
    if (r.tight.length) {
      console.log('  【紧靠 0~5px】');
      r.tight.slice(0, 8).forEach((o) => console.log(
        `    ${o.gap}px  ${o.parent}  内  ${o.prev} → ${o.next}  [next mt=${o.nextMarginTop} pt=${o.nextPaddingTop}] "${o.text}"`));
    }
    if (r.negativeMargins.length) {
      console.log('  【负外边距】');
      r.negativeMargins.forEach((m) => console.log(`    ${m.el}  ${m.margins}  ${m.size}  "${m.text}"`));
    }
    if (r.tightLines.length) {
      console.log('  【行高过紧 lh<1.25em】');
      r.tightLines.forEach((t) => console.log(`    ${t.el}  font=${t.fontSize} lh=${t.lineHeight}  "${t.text}"`));
    }
  }

  // 结论表：真重叠必须为 0，这是唯一可以判「红」的指标
  const totalOverlap = summary.reduce((n, s) => n + s.overlaps, 0);
  const totalTightLines = summary.reduce((n, s) => n + s.tightLines, 0);
  console.log('\n================ 汇总 ================');
  summary.forEach((s) => console.log(
    `  ${s.name.padEnd(26)} 重叠 ${String(s.overlaps).padStart(2)}  紧靠 ${String(s.tight).padStart(2)}  行高过紧 ${s.tightLines}`));
  console.log(`\n  真重叠合计：${totalOverlap}（必须为 0）`);
  console.log(`  行高过紧合计：${totalTightLines}（必须为 0）`);
  console.log(`  紧靠合计：${summary.reduce((n, s) => n + s.tight, 0)}（贴边/单元格属正常，需逐条看）`);
  console.log(totalOverlap === 0 && totalTightLines === 0 ? '\n  判定：通过' : '\n  判定：不通过');

  ws.close();
  chrome.kill();
  await sleep(200);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

main().catch((err) => { console.error('审计失败：', err.message); process.exitCode = 1; });