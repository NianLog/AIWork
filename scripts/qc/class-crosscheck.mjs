/**
 * 类名交叉核对（临时工具）。
 *
 * 起因：`.admin-explain__list` 这类选择器写在 CSS 里，而 JSX 用的是
 * `.admin-explain__item` —— 死规则静默失效，页面上就是「这里没样式」。
 * 靠肉眼比两份文件不可靠，让脚本比。
 *
 * 只处理我们自己写的 CSS（ui-tokens 与两个应用的 styles.css）；组件库的 dtd-* /
 * dtm-* 类名由第三方维护，不在核对范围内。
 *
 * 用法：node scripts/qc/class-crosscheck.mjs [--verbose]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const VERBOSE = process.argv.includes('--verbose');

const CSS_FILES = [
  'packages/ui-tokens/tokens.css',
  'packages/ui-tokens/base.css',
  'packages/ui-tokens/components.css',
  'apps/portal/src/styles.css',
  'apps/admin/src/styles.css',
];

/** 递归收集 .tsx / .ts 源码 */
function collectSources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectSources(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

/** 从 CSS 里抽出所有我们自己的类名（去掉组件库前缀与伪类/伪元素） */
function cssClasses(text) {
  const found = new Set();
  // 去掉注释，避免把注释里提到的类名当成规则
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /\.(-?[_a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(stripped))) {
    const cls = m[1];
    if (/^(dtd|dtm|ant)-/.test(cls)) continue;
    found.add(cls);
  }
  return found;
}

/**
 * 从 TSX 里抽出 className 中出现的类名。
 *
 * 难点在 `className={`portal-tab${active ? ' is-active' : ''}`}` 这类模板字符串：
 * 花括号里是 JS 表达式而不是类名，必须先整段剔除再分词，否则 `$`、`:`、`'` 会被
 * 当成类名的一部分，把真正的类名挤掉（第一版脚本就因此漏报了 ui-enter、ui-badge--outline）。
 *
 * 剔除之后还要单独扫一遍模板表达式里的字符串字面量——`' is-active'` 这种条件类名
 * 只在表达式里出现，正则剔掉表达式就再也找不到它们了。
 */
function jsxClasses(text) {
  const found = new Set();
  const re = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    // 模板表达式里的字符串字面量：条件类名的唯一来源
    if (m[3]) {
      for (const lit of m[3].matchAll(/'([^']*)'|"([^"]*)"/g)) {
        for (const t of (lit[1] ?? lit[2] ?? '').split(/\s+/)) if (t) found.add(t);
      }
    }
    const cleaned = raw.replace(/\$\{[^}]*\}/g, ' ');
    for (const token of cleaned.split(/[\s'"`{}()?:+]+/)) {
      if (token && !/[$.]/.test(token)) found.add(token);
    }
  }
  return found;
}

const jsx = new Set();
for (const app of ['apps/portal/src', 'apps/admin/src', 'packages/ui-tokens']) {
  const dir = join(ROOT, app);
  try {
    for (const file of collectSources(dir)) {
      for (const cls of jsxClasses(readFileSync(file, 'utf8'))) jsx.add(cls);
    }
  } catch { /* 目录不存在就跳过 */ }
}

// packages/ui-tokens 里没有 tsx，类名只出现在 CSS 与文档中；用 README/注释里的说明补齐不了，
// 所以只把「两端源码里出现的类名」当作存在的类名来源。
let deadTotal = 0;
console.log('===== CSS 里定义、但源码里从未出现的类名（死规则） =====');
for (const rel of CSS_FILES) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  const dead = [...cssClasses(text)].filter((c) => !jsx.has(c)).sort();
  if (dead.length) {
    console.log(`\n  ${rel}  (${dead.length})`);
    console.log('    ' + dead.join('  '));
    deadTotal += dead.length;
  }
}
if (!deadTotal) console.log('  （无）');

console.log('\n===== 源码里用、但任何 CSS 都没定义的类名（无样式） =====');
const defined = new Set();
for (const rel of CSS_FILES) {
  for (const c of cssClasses(readFileSync(join(ROOT, rel), 'utf8'))) defined.add(c);
}
const undefined_ = [...jsx].filter((c) => !defined.has(c) && !/^(dtd|dtm|ant)-/.test(c)).sort();
// 状态类（is-active 之类）与工具类由调用方在 CSS 里定义，这里一并报出来供人判断
if (undefined_.length) {
  console.log('  ' + undefined_.join('  '));
} else {
  console.log('  （无）');
}

if (VERBOSE) {
  console.log(`\n全部 JSX 类名：${jsx.size} 个；全部 CSS 类名：${defined.size} 个`);
}