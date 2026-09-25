/**
 * 最终配色核验（临时工具，算完即删）。
 *
 * 前两步的结论：
 *   1. #ED7D33 上的白字只有 2.77:1 —— 永不达 AA，所以品牌橙只做「非文字载体」
 *      （图标、描边、选中条、色块、图表），以及 ≥24px 大字；
 *   2. 钉钉原警示橙 #FF9200 与品牌橙 OKLab 距离 0.066 —— 品牌一旦用橙，
 *      警示色必须换色相，否则「品牌」与「警示」分不出来；
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
  brand: '#ed7d33',
  brandStrong: '#a64a12',
  brandText: '#a64a12',
  brandSoft8: tint('#ed7d33', 0.08),
  brandSoft12: tint('#ed7d33', 0.12),
  success: '#0f7b45',
  successSoft: tint('#0f7b45', 0.08),
  warning: '#8a6100',
  warningSoft: tint('#8a6100', 0.08),
  danger: '#c0342f',
  dangerSoft: tint('#c0342f', 0.08),
  info: '#2563a8',
  infoSoft: tint('#2563a8', 0.08),
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
const brandOnWhite = contrast(P.brand, P.surfaceCard);
const brandInk = '#2e1408';
console.log(`  ! #ED7D33 纯色在白底 = ${fmt(brandOnWhite)}:1  → 达不到图形所需的 3:1`);
console.log('    ⇒ 所以 #ED7D33 只允许出现在「大面积色块」上（顶栏品牌条、hero、图标瓦片底、');
console.log('      渐变的浅端）。这类载体靠面积与色相被识别，不承载信息、不镶细线，');
console.log('      WCAG 1.4.11（非文字对比）不适用；');
console.log('      所有「细线 / 小图标 / 文字」一律取 brandStrong（同色相压暗），保证 ≥4.5:1。');
check('白字 on #ED7D33（仍不达，故不采用）', '#ffffff', P.brand, 3);
check(`brandInk ${brandInk} on #ED7D33 色块上的文字`, brandInk, P.brand, 4.5);

console.log('\n===== D. 语义色与品牌色的 OKLab 距离（需 > 0.12）=====');
for (const [name, hex] of Object.entries({
  成功: P.success, 警示: P.warning, 危险: P.danger, 信息: P.info, 强调: P.accent,
})) {
  const d = delta(P.brand, hex);
  const ok = d > 0.12;
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(6)} ${hex}  Δ=${d.toFixed(3)}`);
}
console.log('  对照：钉钉原警示 #FF9200 Δ=0.066、原危险 #FF5219 Δ=0.079 —— 都不够，这就是必须换色的原因');

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
console.log(failures === 0 ? '  全部合规（上面唯一标 ✗ 的是刻意留作反例的白字 on #ED7D33）' : `  有 ${failures} 项不达标，需要调整`);
console.log('\n粘贴进 tokens.css：');
console.log(`  --ui-brand:          ${P.brand};
  --ui-brand-strong:   ${P.brandStrong};
  --ui-brand-text:     ${P.brandText};
  --ui-brand-soft:     ${P.brandSoft12};
  --ui-brand-soft-weak:${P.brandSoft8};
  --ui-tone-success:   ${P.success} / ${P.successSoft};
  --ui-tone-warning:   ${P.warning} / ${P.warningSoft};
  --ui-tone-danger:    ${P.danger} / ${P.dangerSoft};
  --ui-tone-info:      ${P.info} / ${P.infoSoft};
  --ui-tone-accent:    ${P.accent} / ${P.accentSoft};`);