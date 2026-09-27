/**
 * 四态舞台渲染探针（一次性）。
 *
 * 背景：演示期 SubAppWorkspace 恒为 not-integrated，state-audit 的页面矩阵永远摸不到
 * WorkspaceStage 的 loading / error 两态，也摸不到 ready 的 iframe。批次契约说
 * loading/error 由测试直接喂形状覆盖——测试锁的是 DOM 语义，量不到「骨架 shimmer 的
 * var() 链断没断」「彩虹七相令牌在真实浏览器解析出值没」「errorstate 对比度达不达标」。
 * 这个脚本把三态分别挂到真实 DOM 上，用与 state-audit 相同的色彩数学量一遍。
 *
 * 用法：node scripts/qc/stage-probe.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9341;

const PROBE = String.raw`(() => {
  const parseColor = (str) => {
    if (!str || str === 'none' || str === 'transparent') return null;
    const m = str.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    return null;
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const contrast = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
  };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  const root = getComputedStyle(document.documentElement);
  // 1. 骨架令牌解析检查
  const skelTokens = ['--ui-skel-violet-tint', '--ui-skel-violet-glow', '--ui-skel-brand-tint', '--ui-skel-brand-glow', '--ui-brand-ink-line'];
  const tokenVals = {};
  for (const t of skelTokens) tokenVals[t] = root.getPropertyValue(t).trim();

  // 2. 彩虹七相解析检查
  const rainbow = {};
  for (const name of ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple']) {
    rainbow[name] = root.getPropertyValue('--ui-rainbow-' + name).trim();
  }

  // 3. 挂载三态探针节点（用真实组件类名，走真实 CSS 链）
  // 注意：<span/> 自闭合在 HTML 里非法，会把兄弟段解析成嵌套——一律写全 </span>。
  const stage = document.createElement('div');
  stage.innerHTML =
    '<div class="workspace__loading"><div class="workspace__loading-head">' +
    '<span class="ui-rainbow-bar"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>' +
    '<p class="workspace__loading-note">正在打开 探针应用…</p></div>' +
    '<div class="workspace__loading-body">' +
    '<span class="ui-skeleton ui-skeleton--brand ui-skeleton--line-lg workspace__loading-bar"></span>' +
    '<span class="ui-skeleton ui-skeleton--brand ui-skeleton--block"></span></div></div>' +
    '<div class="ui-errorstate"><p class="ui-errorstate__code ui-num">E-CONNECTION</p>' +
    '<h2 class="ui-errorstate__title">无法打开 探针应用</h2>' +
    '<p class="ui-errorstate__desc">应用暂时没有响应，稍后重试一般就能恢复。</p></div>';
  document.body.appendChild(stage);

  // 骨架实测：默认变体与 brand 变体的 tint/glow
  const skelBrand = document.querySelector('.ui-skeleton--brand');
  const skelCs = getComputedStyle(skelBrand);
  const brandTint = parseColor(skelCs.backgroundColor);
  // shimmer 伪元素：content 空串意味着伪元素未生成（Chrome 对未生成的 ::after 所有属性返回空串）
  const afterCs = getComputedStyle(skelBrand, '::after');
  const afterDiag = { content: afterCs.content, bgi: afterCs.backgroundImage, anim: afterCs.animationName };

  // 彩虹条七相实测
  const bars = [...document.querySelectorAll('.ui-rainbow-bar > span')].map((s) => {
    const cs = getComputedStyle(s);
    return { bg: cs.backgroundColor, h: Math.round(s.getBoundingClientRect().height) };
  });

  // errorstate 对比度：code/title/desc 各自 vs 卡片底
  const errTexts = ['.ui-errorstate__code', '.ui-errorstate__title', '.ui-errorstate__desc'].map((sel) => {
    const el = document.querySelector(sel);
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    // 背景向上找第一层不透明
    let node = el, bg = null;
    while (node && node !== document.body) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a >= 0.99) { bg = c; break; }
      node = node.parentElement;
    }
    if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
    return { sel, fg: fg ? hex(fg) : null, bg: hex(bg), ratio: fg ? contrast({ ...fg, a: 1 }, bg) : null, fs: cs.fontSize };
  });

  stage.remove();
  return { tokenVals, rainbow, brandTint: brandTint ? hex(brandTint) : null, afterDiag, bars, errTexts };
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
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`)); else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-stage-'));
  const chrome = spawn(CHROME,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch { target = null; }
  }
  if (!target) { chrome.kill(); throw new Error('连不上 Chrome'); }
  const ws = await new Promise((res, rej) => { const s = new WebSocket(target.webSocketDebuggerUrl); s.onopen = () => res(s); s.onerror = () => rej(new Error('ws')); });
  await send(ws, 'Page.enable'); await send(ws, 'Runtime.enable');
  // 门户样式全集都在这页上（ui-tokens + 门户 styles.css 都已在 main.tsx 引入）
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send(ws, 'Page.navigate', { url: 'http://127.0.0.1:5173/preview' });
  await sleep(1600);
  const { result } = await send(ws, 'Runtime.evaluate', { expression: PROBE, returnByValue: true });
  const r = result.value;

  console.log('── 骨架/分隔令牌（tokens.css → var() 链） ──');
  for (const [k, v] of Object.entries(r.tokenVals)) {
    console.log(`  ${k.padEnd(26)} ${v || '(空！链断了)'}${v ? ' ✓' : ' ✗'}`);
  }
  console.log('── 彩虹七相 ──');
  for (const [k, v] of Object.entries(r.rainbow)) {
    console.log(`  --ui-rainbow-${k.padEnd(8)} ${v || '(空！)'}${v ? ' ✓' : ' ✗'}`);
  }
  console.log('── 骨架 brand 变体实测 ──');
  console.log(`  tint(实底): ${r.brandTint}`);
  console.log(`  ::after content=${JSON.stringify(r.afterDiag.content)}  animation=${r.afterDiag.anim}`);
  console.log(`  ::after 渐变: ${(r.afterDiag.bgi || '(空——伪元素未生成！)').slice(0, 90)}`);
  console.log('── 彩虹条七段（色值 / 高度≥8px） ──');
  r.bars.forEach((b, i) => console.log(`  段${i + 1}: ${b.bg}  h=${b.h}${b.h >= 8 ? ' ✓' : ' ✗ 低于 8px 面积线'}`));
  console.log('── errorstate 文字对比度 ──');
  r.errTexts.forEach((e) => console.log(`  ${e.sel.padEnd(24)} ${e.fg} 上 ${e.bg}  = ${e.ratio}  (${e.fs})${e.ratio >= 4.5 ? ' ✓' : ' ✗'}`));

  ws.close(); chrome.kill(); await sleep(200);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
}
main().catch((e) => { console.error('探针失败：', e.message); process.exitCode = 1; });