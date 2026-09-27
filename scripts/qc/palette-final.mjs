/**
 * 最终配色核验（临时工具，算完即删）。2026-09-28 品牌换蓝后重跑：
 * P 调色板与 brandInk 已随 tokens.css 更新（蓝版），C 段叙事按蓝系反转。
 *
 * 前两步的结论（橙时代定下的地基，换蓝后仍成立的部分）：
 *   1. 橙时代 #ED7D33 白字仅 2.77:1，立下「品牌主色不做文字」的规矩；蓝版反转：
 *      #2563EB 白字 5.17:1 达 AA，品牌色块上的文字取白（--ui-brand-ink）；
 *   2. 语义色整体换相是橙时代的决策（#FF9200 与品牌橙 Δ 0.066）；换蓝后语义色
 *      与品牌蓝的 OKLab 距离只增不减（D 段实测为证），保留为独立谱系；
 *   3. 旧的 muted #A9AEB3（2.24:1）与 subtle #878F95（3.28:1）都不达 AA。
 *
 * 这一步把手工定下的色板逐对核验，输出「哪些组合合规、哪些不许用」。
 * 这是给 tokens.css 的验收依据，也是 DDE 笔记里要留的证据。
 */

const srgbToLinear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
};
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const tint = (hex, alpha, base = '#ffffff') => {
  const c = hexToRgb(hex);
  const bg = hexToRgb(base);
  return '#' + c.map((v, i) => Math.round((v * alpha + bg[i] * (1 - alpha)) * 255).toString(16).padStart(2, '0')).join('');
};
function hexToOklab(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const delta = (a, b) => {
  const [l1, a1, b1] = hexToOklab(a);
  const [l2, a2, b2] = hexToOklab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
};

const P = {
  brand: '#2563eb',
  brandStrong: '#1d4ed8',
  brandText: '#1d4ed8',
  brandSoft8: '#f6f9fe',   /* 与 tokens.css --ui-brand-soft-weak 同值（硬编码消除计算漂移） */
  brandSoft12: '#eff4fd',  /* 与 tokens.css --ui-brand-soft 同值 */
  success: '#0f7b45',
  successSoft: tint('#0f7b45', 0.08),
  warning: '#8a6100',
  warningSoft: tint('#8a6100', 0.08),
  danger: '#c0342f',
  dangerSoft: tint('#c0342f', 0.08),
  info: '#0e7490',
  infoSoft: tint('#0e7490', 0.08),
  accent: '#0b727f',
  accentSoft: tint('#0d7c8c', 0.08),
  textStrong: '#171a1d',
  textBody: '#4a5157',
  textSoft: '#616870',
  surfaceCard: '#ffffff',
  surfacePage: '#f4f5f7',
  surfaceDeep: '#eceef1',
};

const fmt = (r) => r.toFixed(2).padStart(5);
let failures = 0;
function check(label, fg, bg, need) {
  const r = contrast(fg, bg);
  const ok = r >= need;
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(42)} ${fg} on ${bg} = ${fmt(r)}:1  (需 ${need})`);
  return r;
}

console.log('===== A. 正文灰阶 × 三种表面（全部需 4.5:1）=====');
for (const [tn, th] of Object.entries({ strong: P.textStrong, body: P.textBody, soft: P.textSoft })) {
  for (const [sn, sh] of Object.entries({ 卡片: P.surfaceCard, 页面: P.surfacePage, 深面: P.surfaceDeep })) {
    check(`${tn} on ${sn}`, th, sh, 4.5);
  }
}
console.log('  （重构前的 muted #a9aeb3 = 2.24:1、subtle #878f95 = 3.28:1，均不达 —— 故废弃这两档）');

console.log('\n===== B. 语义色文字 × 自身淡底（需 4.5:1）=====');
for (const [name, fg, bg] of [
  ['成功', P.success, P.successSoft],
  ['警示', P.warning, P.warningSoft],
  ['危险', P.danger, P.dangerSoft],
  ['信息', P.info, P.infoSoft],
  ['强调', P.accent, P.accentSoft],
]) {
  check(`${name}字 on ${name}淡底8%`, fg, bg, 4.5);
  check(`${name}字 on 卡片白`, fg, P.surfaceCard, 4.5);
}

console.log('\n===== C. 品牌色组合 =====');
check('brandStrong 白字底色', '#ffffff', P.brandStrong, 4.5);
check('brandText 在白底', P.brandText, P.surfaceCard, 4.5);
check('brandText 在 品牌淡底12%', P.brandText, P.brandSoft12, 4.5);
check('brandText 在 品牌淡底8%', P.brandText, P.brandSoft8, 4.5);
const brandInk = '#ffffff';
console.log(`  · #2563EB 纯色在白底 = ${fmt(contrast(P.brand, P.surfaceCard))}:1 ≥ 3:1，作图形与色块本身达标`);
console.log('    ⇒ 令牌纪律不因达标而放松：文字 / 细线 / 小图标仍一律取 brandStrong（#1D4ED8，');
console.log('      白底 6.64:1）——单一「深一档做前景」规则，避免两档蓝同屏打架；');
console.log('      品牌色块（顶栏品牌条、登录 hero）上的文字取白（--ui-brand-ink，5.17:1）；');
console.log('      深墨在蓝底仅 2.85:1 不可用——这是与橙时代正反互换的关键差异。');
check('白字 on 品牌蓝 #2563EB（达标，采用为 brand-ink）', '#ffffff', P.brand, 4.5);
check(`brandInk ${brandInk}（白）on 品牌蓝色块上的文字`, brandInk, P.brand, 4.5);

console.log('\n===== D. 语义色与品牌色的 OKLab 距离（需 > 0.12）=====');
for (const [name, hex] of Object.entries({
  成功: P.success, 警示: P.warning, 危险: P.danger, 信息: P.info, 强调: P.accent,
})) {
  const d = delta(P.brand, hex);
  const ok = d > 0.12;
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(6)} ${hex}  Δ=${d.toFixed(3)}`);
}
console.log('  （历史对照：橙时代 #FF9200 与品牌橙 Δ=0.066 逼出了语义色换相；蓝版下各语义色距离只增不减）');

console.log('\n===== E. 应用图标瓦片（装饰件，图标形状与底色需 ≥3:1）=====');
const TILES = { violet: '#7c5cf0', cyan: '#0e9aad', emerald: '#12a150', amber: '#856100', rose: '#d9455c', slate: '#6e7b87' };
for (const [name, hue] of Object.entries(TILES)) {
  const bg = tint(hue, 0.12);
  for (const [k, v] of Object.entries({ 原始色: hue, 压暗一档: '#' + hexToRgb(hue).map((x) => Math.round(x * 0.72 * 255).toString(16).padStart(2, '0')).join('') })) {
    const r = contrast(v, bg);
    const ok = r >= 3;
    if (!ok && k === '压暗一档') failures += 1;
    console.log(`  ${ok ? '✓' : '·'} ${name.padEnd(8)} ${k} ${v} on ${bg} = ${fmt(r)}:1  Δ(品牌)=${delta(P.brand, v).toFixed(3)}`);
  }
}

console.log('\n===== 结论 =====');
console.log(failures === 0 ? '  全部合规（2026-09-28 换蓝版：品牌族 / 语义色 / 瓦片色调逐对过线）' : `  有 ${failures} 项不达标，需要调整`);
console.log('\n（tokens.css 即事实源，本工具只做核验——曾打印粘贴建议块，与实际值漂移后已删。）');