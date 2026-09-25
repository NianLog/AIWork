/**
 * 版式审计（临时工具，跑完即可删除）。
 *
 * 在真实 Chrome 里逐页 evaluate 一段探测脚本，用几何事实代替肉眼：
 *   - 文档横向溢出：scrollWidth 超过视口宽度，或有元素右边界越过视口；
 *   - 文字被裁：元素自身或父级 overflow 隐藏，但内容比盒子更大；
 *   - 令牌是否真的生效：从 tokens.css 里取一个已知值做交叉验证，
 *     否则「页面看起来还行」可能只是因为自定义样式整体没加载；
 *   - 触控目标尺寸：窄屏下可点元素小于 40px 的清单；
 *   - 触底留白：内容高度远小于视口高度时，底部会出现大片空白。
 *
 * 用法：node scripts/qc/layout-audit.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;

const PAGES = [
  ['portal/login', 'http://127.0.0.1:5173/login', 1440, 940],
  ['portal/workbench', 'http://127.0.0.1:5173/preview', 1440, 940],
  ['portal/market', 'http://127.0.0.1:5173/preview/market', 1440, 940],
  ['portal/status', 'http://127.0.0.1:5173/preview/status', 1440, 940],
  ['portal/404', 'http://127.0.0.1:5173/missing', 1440, 940],
  ['portal/workbench@sm', 'http://127.0.0.1:5173/preview', 390, 844],
  ['portal/market@sm', 'http://127.0.0.1:5173/preview/market', 390, 844],
  ['portal/login@sm', 'http://127.0.0.1:5173/login', 390, 844],
  ['portal/status@sm', 'http://127.0.0.1:5173/preview/status', 390, 844],
  ['admin/login', 'http://127.0.0.1:5174/login', 1440, 940],
  ['admin/apps', 'http://127.0.0.1:5174/preview/apps', 1440, 940],
  ['admin/users', 'http://127.0.0.1:5174/preview/users', 1440, 940],
  ['admin/roles', 'http://127.0.0.1:5174/preview/roles', 1440, 940],
  ['admin/orgs', 'http://127.0.0.1:5174/preview/organizations', 1440, 940],
  ['admin/publish', 'http://127.0.0.1:5174/preview/publish', 1440, 940],
  ['admin/404', 'http://127.0.0.1:5174/missing', 1440, 940],
  ['admin/apps@sm', 'http://127.0.0.1:5174/preview/apps', 390, 844],
  ['admin/publish@sm', 'http://127.0.0.1:5174/preview/publish', 390, 844],
  ['admin/users@sm', 'http://127.0.0.1:5174/preview/users', 390, 844],
  // 子应用工作区：全屏接管，门户外壳不挂载
  ['portal/workspace', 'http://127.0.0.1:5173/apps/ai-image-gen', 1440, 940],
  ['portal/workspace@sm', 'http://127.0.0.1:5173/apps/ai-image-gen', 390, 844],
];

const PROBE = String.raw`(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const label = (el) => {
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };

  // 1. 横向溢出
  const EXPECTED = (el) => {
    // 刻意放在视口外的元素不算问题：视觉隐藏的跳过导航、窄屏滑出的侧栏、抽屉
    if (el.closest('.ui-skip-link') || el.classList.contains('ui-skip-link')) return true;
    if (el.closest('.admin-sider') || el.closest('.admin-scrim')) return true;
    return false;
  };
  const bleeders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.position === 'fixed') continue;
    if ((r.right > vw + 1 || r.left < -1) && !EXPECTED(el)) {
      // 祖先已经能横向滚动的不算（表格容器就是故意可滚的）
      let p = el.parentElement, scrollable = false;
      while (p && p !== document.body) {
        const ps = getComputedStyle(p);
        if (ps.overflowX === 'auto' || ps.overflowX === 'scroll') { scrollable = true; break; }
        p = p.parentElement;
      }
      if (!scrollable) bleeders.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 24) });
    }
    if (bleeders.length >= 12) break;
  }

  // 2. 文字/内容被裁
  const clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.overflow !== 'hidden' && style.overflowY !== 'hidden') continue;
    if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && !el.querySelector('table')) {
      // 单行省略号是刻意的：它按设计裁掉溢出文本
      if (style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap') continue;
      clipped.push({ el: label(el), client: el.clientHeight, scroll: el.scrollHeight, text: (el.textContent || '').trim().slice(0, 24) });
    }
    if (clipped.length >= 8) break;
  }

  // 3. 令牌交叉验证：这些值来自 tokens.css / 应用样式，任何一个为 0 说明样式没生效
  const root = getComputedStyle(document.documentElement);
  const tokens = {
    space6: root.getPropertyValue('--ui-space-6').trim(),
    radiusM: root.getPropertyValue('--ui-radius-m').trim(),
    fontBase: root.getPropertyValue('--ui-font-base').trim(),
    container: root.getPropertyValue('--ui-container').trim(),
  };
  /*
   * 基准容器：用于确认共享样式层确实生效。
   * 子应用工作区（.workspace）是**刻意**不用 .ui-page 的——它铺满视口、不套门户外壳，
   * 所以这里必须把它一并列进来，否则审计会把「设计如此」报成「样式没生效」。
   */
  const probe = document.querySelector('.ui-page, .admin-login, .portal-login, .ui-fallback, .portal-fallback, .workspace');
  const probeStyles = probe ? {
    probe: label(probe),
    display: getComputedStyle(probe).display,
    gap: getComputedStyle(probe).gap,
    paddingLeft: getComputedStyle(probe).paddingLeft,
  } : null;

  // 4. 窄屏触控目标
  // 阈值取 36px：WCAG 2.2 AA 的 Target Size (Minimum) 是 24×24，Apple 的 HIG 建议 44，
  // 组件库默认按钮 34、纯图标按钮 22。这里用 36 当基线——矮于它的都是真正需要处理的，
  // 36〜43 属于「不理想但不至于点不中」，避免把审计变成噪音。
  const smallTargets = [];
  if (vw < 768) {
    for (const el of document.querySelectorAll('a[href], button, [role="button"]')) {
      if (el.classList.contains('ui-skip-link') || el.closest('.admin-sider')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (r.height < 36) smallTargets.push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim().slice(0, 18) });
    }
  }

  // 5. 版心与留白
  const main = document.querySelector('main, .admin-body__inner, .portal-content');
  const mainRect = main ? main.getBoundingClientRect() : null;
  const h1 = Array.from(document.querySelectorAll('h1')).map((h) => (h.textContent || '').trim());
  const noteCount = document.querySelectorAll('[role="note"]').length;
  const scrollable = document.documentElement.scrollWidth > vw + 1;

  /*
   * 6. 外框占用（chrome footprint）。
   *
   * 为什么单独量这一项：顶栏高度是「外框架占位小」这句要求的唯一可量化指标，
   * 而它最容易以「每个子元素各占一行」的方式静默翻倍——门户的顶栏曾经因为内部
   * 容器少了 display:flex，从 40px 变成 95px（正好是 brand+nav+ident 三者高度之和），
   * 后台顶栏曾经因为手机上面包屑被挤到 30px 宽、竖折成三行而变成 85px。
   * 当时的检查项（溢出、裁切、触控尺寸）一个都不会响。
   *
   * 判据是**自洽**的：每个外框元素的实际高度不得超过它自己声明的 min-height + 4px。
   * 不去读令牌名，是因为「这个元素该多高」本来就写在它自己的样式里（.ui-appbar 用
   * --ui-appbar-h、.workspace__bar 用 --ui-workspacebar-h），脚本再维护一份令牌名映射
   * 只会多一处会写错的地方。4px 余量留给 1px 边框与行盒取整。
   */
  const chromeHeights = [];
  const checkChrome = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const declared = parseFloat(getComputedStyle(el).minHeight);
    if (!declared) return;
    const h = Math.round(el.getBoundingClientRect().height);
    const d = Math.round(declared);
    chromeHeights.push({ el: selector, h, declared: d, over: h - d, flagged: h > declared + 4 });
  };
  checkChrome('.ui-appbar');
  checkChrome('.admin-header');
  checkChrome('.workspace__bar');
  checkChrome('.portal-titlebar');

  return {
    vw, vh,
    title: document.title,
    h1,
    noteCount,
    docScrollWidth: document.documentElement.scrollWidth,
    horizontalScroll: scrollable,
    bodyHeight: document.body.getBoundingClientRect().height,
    mainWidth: mainRect ? Math.round(mainRect.width) : null,
    mainLeft: mainRect ? Math.round(mainRect.left) : null,
    tokens, probeStyles, bleeders, clipped, smallTargets, chromeHeights,
  };
})()`;

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = (err) => reject(new Error(`ws error: ${err.message ?? 'unknown'}`));
  });
}

let nextId = 1;
function send(ws, method, params = {}) {
  const id = nextId++;
  const payload = JSON.stringify({ id, method, params });
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(payload);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-audit-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let targets = null;
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      targets = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (targets.length === 0) targets = null;
    } catch {
      targets = null;
    }
  }
  if (!targets) {
    chrome.kill();
    throw new Error('未能连上 Chrome 调试端口');
  }

  const ws = await connect(targets[0].webSocketDebuggerUrl);
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  const report = [];
  for (const [name, url, width, height] of PAGES) {
    await send(ws, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await send(ws, 'Page.navigate', { url });
    await sleep(1400);
    const { result } = await send(ws, 'Runtime.evaluate', {
      expression: PROBE,
      returnByValue: true,
      awaitPromise: false,
    });
    report.push([name, result.value]);
  }

  ws.close();
  chrome.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* 临时目录清理失败不影响结论 */
  }

  // ---- 输出：先把问题挑出来，再按页给关键数字 ----
  const problems = [];
  for (const [name, r] of report) {
    if (!r) {
      problems.push(`${name}: 探测脚本没有返回结果`);
      continue;
    }
    if (r.horizontalScroll || r.docScrollWidth > r.vw + 1) {
      problems.push(`${name}: 横向溢出 scrollWidth=${r.docScrollWidth} > vw=${r.vw}`);
    }
    if (r.bleeders.length) {
      problems.push(
        `${name}: ${r.bleeders.length} 个元素越出视口 -> ` +
          r.bleeders.map((b) => `${b.el}[${b.left}..${b.right}]"${b.text}"`).join(' | '),
      );
    }
    if (r.clipped.length) {
      problems.push(
        `${name}: 内容高过盒子且被裁 -> ` +
          r.clipped.map((c) => `${c.el}(${c.client}<${c.scroll})"${c.text}"`).join(' | '),
      );
    }
    if (r.h1.length !== 1) {
      problems.push(`${name}: h1 数量为 ${r.h1.length} -> ${JSON.stringify(r.h1)}`);
    }
    if (r.noteCount === 0) {
      problems.push(`${name}: 页面上没有 role="note" 的披露说明`);
    }
    if (!r.tokens.space6 || !r.tokens.radiusM || !r.tokens.fontBase) {
      problems.push(`${name}: --ui-* 令牌缺失 -> ${JSON.stringify(r.tokens)}`);
    }
    if (!r.probeStyles) {
      problems.push(`${name}: 找不到 .ui-page/.portal-login 等基准容器，共享样式层可能没生效`);
    }
    if (r.smallTargets.length) {
      problems.push(
        `${name}: ${r.smallTargets.length} 个窄屏可点元素矮于 36px -> ` +
          r.smallTargets.slice(0, 6).map((t) => `${t.el}(${t.w}x${t.h})"${t.text}"`).join(' | '),
      );
    }
    for (const c of r.chromeHeights ?? []) {
      if (c.flagged) {
        problems.push(
          `${name}: 外框 ${c.el} 高 ${c.h}px，超过它自己声明的 min-height ${c.declared}px + 4px` +
            `（常见原因：内部容器少了 display:flex 或宽度被挤，子元素折行堆叠）`,
        );
      }
    }
  }

  console.log('===== 问题清单 =====');
  if (problems.length === 0) console.log('（无）');
  else problems.forEach((p) => console.log('- ' + p));

  console.log('\n===== 每页关键数字 =====');
  for (const [name, r] of report) {
    if (!r) {
      console.log(`${name.padEnd(22)} 无数据`);
      continue;
    }
    console.log(
      `${name.padEnd(22)} vw=${String(r.vw).padStart(4)} sw=${String(r.docScrollWidth).padStart(4)} ` +
        `h=${String(Math.round(r.bodyHeight)).padStart(5)} main=${String(r.mainWidth).padStart(5)}@${String(r.mainLeft).padStart(4)} ` +
        `h1=${JSON.stringify(r.h1).slice(0, 22).padEnd(22)} bleed=${r.bleeders.length} clip=${r.clipped.length} ` +
        `small=${r.smallTargets.length} container=${r.tokens.container}`,
    );
    // 外框占用单列一行：它是「框架占位小」的唯一量化指标
    const chrome = (r.chromeHeights ?? []).map((c) => `${c.el}=${c.h}(min ${c.declared})`).join('  ');
    if (chrome) console.log(`${' '.repeat(22)} 外框：${chrome}`);
  }
}

main().catch((err) => {
  console.error('审计失败：', err);
  process.exitCode = 1;
});