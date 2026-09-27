/**
 * 全页面截图（视觉审查用，一次性工具）。
 *
 * 与 spacing-audit 的几何量测互补：几何查得出重叠与溢出，查不出「颜色脏、层次乱、
 * 组件观感廉价」。这个脚本把每个页面在真实 Chrome 里拍下来，供人（或视觉模型）逐张审。
 *
 * 支持三类交互，保证「状态」也被拍到而不是只拍默认态：
 *   - eval：导航后执行一段 JS（点开口、打开抽屉）
 *   - hover：把鼠标停在某个选择器中央（悬停态）
 *   - tabs：按 N 次 Tab（键盘焦点环 + 跳过导航显形态）
 *
 * 输出目录：OS 临时目录下的 dsh-shots，不进仓库。
 * 用法：node scripts/qc/shoot.mjs [名称片段过滤]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
const OUT = join(tmpdir(), 'dsh-shots');

const P = 'http://127.0.0.1:5173';
const A = 'http://127.0.0.1:5174';

const SHOTS = [
  // ---------- 门户 ----------
  { name: 'p-workbench-lg', url: `${P}/preview`, w: 1440, h: 900 },
  { name: 'p-workbench-sm', url: `${P}/preview`, w: 390, h: 844 },
  { name: 'p-workbench-sm-scroll', url: `${P}/preview`, w: 390, h: 844, scroll: 640 },
  { name: 'p-market-lg', url: `${P}/preview/market`, w: 1440, h: 900 },
  { name: 'p-market-lg-tabs3', url: `${P}/preview/market`, w: 1440, h: 900, tabs: 3 },
  { name: 'p-market-lg-hover', url: `${P}/preview/market`, w: 1440, h: 900, hover: '.portal-appcard' },
  { name: 'p-market-sm', url: `${P}/preview/market`, w: 390, h: 844 },
  { name: 'p-market-sm-scroll', url: `${P}/preview/market`, w: 390, h: 844, scroll: 700 },
  { name: 'p-status-lg', url: `${P}/preview/status`, w: 1440, h: 900 },
  { name: 'p-status-sm', url: `${P}/preview/status`, w: 390, h: 844 },
  { name: 'p-login-lg', url: `${P}/login`, w: 1440, h: 900 },
  { name: 'p-login-sm', url: `${P}/login`, w: 390, h: 844 },
  { name: 'p-workspace-lg', url: `${P}/apps/ai-image-gen`, w: 1440, h: 900 },
  { name: 'p-workspace-sm', url: `${P}/apps/ai-image-gen`, w: 390, h: 844 },
  { name: 'p-workspace-missing', url: `${P}/apps/nope`, w: 1440, h: 900 },
  { name: 'p-404-lg', url: `${P}/missing`, w: 1440, h: 900 },
  { name: 'p-drawer-lg', url: `${P}/preview/market`, w: 1440, h: 900, eval: `document.querySelector('.portal-appcard__name').click()` },
  { name: 'p-drawer-sm', url: `${P}/preview/market`, w: 390, h: 844, eval: `document.querySelector('.portal-appcard__name').click()` },
  // ---------- 后台 ----------
  { name: 'a-apps-lg', url: `${A}/preview/apps`, w: 1440, h: 900 },
  { name: 'a-apps-lg-hover', url: `${A}/preview/apps`, w: 1440, h: 900, hover: '.dtd-table-tbody tr:nth-child(2)' },
  { name: 'a-users-lg', url: `${A}/preview/users`, w: 1440, h: 900 },
  { name: 'a-roles-lg', url: `${A}/preview/roles`, w: 1440, h: 1400 },
  { name: 'a-orgs-lg', url: `${A}/preview/organizations`, w: 1440, h: 1100 },
  { name: 'a-publish-lg', url: `${A}/preview/publish`, w: 1440, h: 1300 },
  { name: 'a-publish-lg-scroll', url: `${A}/preview/publish`, w: 1440, h: 900, scroll: 800 },
  { name: 'a-login-lg', url: `${A}/login`, w: 1440, h: 900 },
  { name: 'a-apps-sm', url: `${A}/preview/apps`, w: 390, h: 844 },
  { name: 'a-apps-sm-drawer', url: `${A}/preview/apps`, w: 390, h: 844, eval: `document.querySelector('.admin-header__navtoggle').click()` },
  { name: 'a-404-lg', url: `${A}/missing`, w: 1440, h: 900 },
];

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
  const filter = process.argv[2];
  const shots = filter ? SHOTS.filter((s) => s.name.includes(filter)) : SHOTS;
  mkdirSync(OUT, { recursive: true });

  // profile 目录每次唯一，避免与之前的审计实例冲突
const profile = mkdtempSync(join(tmpdir(), 'dsh-shoot-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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

  for (const s of shots) {
    await send(ws, 'Emulation.setDeviceMetricsOverride', {
      width: s.w, height: s.h, deviceScaleFactor: 2, mobile: s.w < 768,
    });
    await send(ws, 'Page.navigate', { url: s.url });
    await sleep(1500);

    if (s.eval) {
      await send(ws, 'Runtime.evaluate', { expression: s.eval });
      await sleep(600); // 等浮层/抽屉的入场动画走完
    }
    if (typeof s.tabs === 'number') {
      for (let i = 0; i < s.tabs; i++) {
        await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await sleep(120);
      }
      await sleep(200);
    }
    if (s.hover) {
      const { result } = await send(ws, 'Runtime.evaluate', {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(s.hover)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
        returnByValue: true,
      });
      if (result.value) {
        await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: result.value.x, y: result.value.y });
        await sleep(350); // 等 hover 过渡（--ui-dur-base 约 150~200ms）
      } else {
        console.log(`  ! ${s.name}: hover 目标不存在 ${s.hover}`);
      }
    }
    if (s.scroll) {
      await send(ws, 'Runtime.evaluate', { expression: `window.scrollTo(0, ${s.scroll})` });
      await sleep(250);
    }

    const { data } = await send(ws, 'Page.captureScreenshot', { format: 'png' });
    const file = join(OUT, `${s.name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`  ✓ ${s.name}.png`);
  }

  ws.close();
  chrome.kill();
  await sleep(200);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
  console.log(`\n输出目录：${OUT}`);
}

main().catch((err) => { console.error('截图失败：', err.message); process.exitCode = 1; });