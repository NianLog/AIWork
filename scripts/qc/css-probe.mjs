/**
 * 一次性 DOM/CSS 探针（临时工具）。
 *
 * 用途：当审计脚本报告「某元素被裁」但看不出是谁把它压扁时，
 * 直接问浏览器「这条属性最终生效的是哪份样式表的哪条规则」。
 * 这里用 CSS.getMatchedStylesForNode 拿到逐条命中的 CSS 规则及来源文件。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9334;
const URL = process.argv[2] ?? 'http://127.0.0.1:5174/preview/apps';
const SELECTOR = process.argv[3] ?? '.dtd-notice-bar';
const WIDTH = Number(process.argv[4] ?? 390);
const PROPS = (process.argv[5] ?? 'height,min-height,padding,overflow').split(',');

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
  const profile = mkdtempSync(join(tmpdir(), 'dsh-probe-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) ?? null;
    } catch {
      target = null;
    }
  }
  if (!target) {
    chrome.kill();
    throw new Error('未能连上 Chrome 调试端口');
  }

  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error('ws error'));
  });

  await send(ws, 'Page.enable');
  await send(ws, 'DOM.enable');
  await send(ws, 'CSS.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: 844,
    deviceScaleFactor: 1,
    mobile: WIDTH < 768,
  });
  await send(ws, 'Page.navigate', { url: URL });
  await sleep(2200);

  const { root } = await send(ws, 'DOM.getDocument', { depth: -1 });
  const { nodeId } = await send(ws, 'DOM.querySelector', { nodeId: root.nodeId, selector: SELECTOR });
  if (!nodeId) throw new Error(`没找到 ${SELECTOR}`);

  const matched = await send(ws, 'CSS.getMatchedStylesForNode', { nodeId });
  console.log(`# ${SELECTOR} @ ${WIDTH}px  (${URL})`);
  for (const entry of matched.matchedCSSRules ?? []) {
    const props = entry.rule.style.cssProperties.filter((p) => PROPS.includes(p.name) && !p.disabled);
    if (props.length === 0) continue;
    const origin = entry.rule.origin;
    const file = entry.rule.styleSheetId ? `sheet#${entry.rule.styleSheetId}` : 'inline';
    console.log(`\n  ${entry.rule.selectorList.text}   [${origin} ${file}]`);
    props.forEach((p) => console.log(`     ${p.name}: ${p.value}${p.implicit ? '  (implicit)' : ''}`));
  }

  const computed = await send(ws, 'CSS.getComputedStyleForNode', { nodeId });
  console.log('\n  生效值：');
  computed.computedStyle
    .filter((p) => PROPS.includes(p.name))
    .forEach((p) => console.log(`     ${p.name}: ${p.value}`));

  const box = await send(ws, 'DOM.getBoxModel', { nodeId });
  console.log(`\n  盒子：w=${box.model.width} h=${box.model.height}`);

  const { object } = await send(ws, 'DOM.resolveNode', { nodeId });
  const shape = await send(ws, 'Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: `function () {
      const walk = (el, depth) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
        const line = '  '.repeat(depth) + el.tagName.toLowerCase() + cls +
          ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + ']' +
          ' scroll=' + el.scrollHeight + '/' + el.clientHeight +
          ' h=' + s.height + ' maxh=' + s.maxHeight + ' ov=' + s.overflow;
        const kids = Array.from(el.children).map((c) => walk(c, depth + 1));
        return [line, ...kids].join('\\n');
      };
      return walk(this, 0);
    }`,
    returnByValue: true,
  });
  console.log('\n  结构：\n' + shape.result.value);

  ws.close();
  chrome.kill();
  await sleep(200);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
}

main().catch((err) => {
  console.error('探针失败：', err.message);
  process.exitCode = 1;
});