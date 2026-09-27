/**
 * 配色推导（临时工具，算完即删）。
 *
 * 目的：品牌色定成 #ED7D33 后，需要机械地算出其余颜色，而不是靠眼睛挑。
 * 算三件事：
 *   1. WCAG 对比度：品牌橙上的白字到底够不够；不够就给出「压暗到多少才够」；
 *   2. 语义色（成功 / 警示 / 危险 / 信息）与品牌色在 OKLab 里的感知距离，
 *      避免「警示色跟品牌色分不清」；
 *   3. 12% 淡色底（钉钉的 *_3_color 惯例）以及它与对应深色文字的组合对比度。
 *
 * 用法：node scripts/qc/palette.mjs
 */

// ---------- sRGB / 线性 / 相对亮度 ----------
const srgbToLinear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** 12% 淡色底：把颜色按 alpha 混到白底上（钉钉 *_3_color 的做法） */
function tint(hex, alpha, base = '#ffffff') {
  const c = hexToRgb(hex);
  const bg = hexToRgb(base);
  const mixed = c.map((v, i) => v * alpha + bg[i] * (1 - alpha));
  return '#' + mixed.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

// ---------- OKLab：感知距离 ----------
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
const oklabDistance = (a, b) => {
  const [l1, a1, b1] = hexToOklab(a);
  const [l2, a2, b2] = hexToOklab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
};

// ---------- 候选色 ----------
const WHITE = '#ffffff';
const NEAR_BLACK = '#171a1d';

const BRAND = '#ed7d33';
const BRAND_DEEP = '#c96a26';   // 暂定 hover/active 基准
const BRAND_DARK = '#a8500f';   // 暂定「纯文字链接」用

console.log('===== 1. 品牌橙 #ED7D33 的对比度 =====');
console.log(`  白字 on #ED7D33          : ${contrast(WHITE, BRAND).toFixed(2)}:1  (AA 正文要 4.5，大字要 3.0)`);
console.log(`  近黑字 on #ED7D33        : ${contrast(NEAR_BLACK, BRAND).toFixed(2)}:1`);
console.log(`  #ED7D33 on 白底(作文字)  : ${contrast(BRAND, WHITE).toFixed(2)}:1`);
console.log(`  白字 on #C96A26          : ${contrast(WHITE, BRAND_DEEP).toFixed(2)}:1`);
console.log(`  白字 on #A8500F          : ${contrast(WHITE, BRAND_DARK).toFixed(2)}:1`);
console.log(`  #A8500F on 白底          : ${contrast(BRAND_DARK, WHITE).toFixed(2)}:1`);

// 求「白字达到 4.5:1」所需的压暗程度（保持色相，只调亮度）
function darkenUntil(hex, target, against = WHITE) {
  let best = null;
  for (let k = 1; k >= 0.2; k -= 0.005) {
    const [r, g, b] = hexToRgb(hex).map((v) => v * k);
    const cand = '#' + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    if (contrast(cand, against) >= target) best = { hex: cand, ratio: contrast(cand, against), k };
  }
  return best;
}
console.log('\n  白字达 4.5:1 需压暗到 :', JSON.stringify(darkenUntil(BRAND, 4.5)));
console.log('  白字达 3.0:1 需压暗到 :', JSON.stringify(darkenUntil(BRAND, 3)));

console.log('\n===== 2. 语义色与品牌色的感知距离（OKLab，>0.10 才不容易混）=====');
const semantic = {
  '成功 绿': '#0f9d58',
  '警示 琥珀': '#d99a00',
  '危险 红': '#e5484d',
  '信息 蓝': '#2b7fd4',
  '强调 青': '#0f8b9c',
  '原警示橙(钉钉)': '#ff9200',
  '原危险红(钉钉)': '#ff5219',
};
for (const [name, hex] of Object.entries(semantic)) {
  const d = oklabDistance(BRAND, hex);
  const flag = d < 0.08 ? '  ← 与品牌色过近，会混淆' : d < 0.12 ? '  ← 偏近，留意' : '';
  console.log(`  ${name.padEnd(16)} ${hex}  Δ=${d.toFixed(3)}${flag}`);
}

console.log('\n===== 3. 语义色淡底 + 深字组合 =====');
for (const [name, hex] of Object.entries(semantic)) {
  const bg = tint(hex, 0.12);
  const bg16 = tint(hex, 0.16);
  console.log(
    `  ${name.padEnd(16)} ${hex}  12%底=${bg}  深字在该底上=${contrast(hex, bg).toFixed(2)}:1` +
    `   16%底=${bg16} 深字对比=${contrast(hex, bg16).toFixed(2)}:1`,
  );
}

console.log('\n===== 4. 品牌淡底（各处浅色高亮用）=====');
for (const a of [0.08, 0.1, 0.12, 0.16]) {
  const bg = tint(BRAND, a);
  console.log(`  alpha ${a}  → ${bg}   品牌深字 #A8500F 在其上 ${contrast(BRAND_DARK, bg).toFixed(2)}:1   品牌本身上 ${contrast(BRAND, bg).toFixed(2)}:1`);
}

console.log('\n===== 5. 正文灰阶在两种表面上的对比度 =====');
const surfaces = { '卡片 #ffffff': '#ffffff', '页面 #f4f5f7': '#f4f5f7', '深面 #eceef1': '#eceef1' };
const textTones = { 'strong #171a1d': '#171a1d', 'body #4a5157': '#4a5157', 'muted #7c848b': '#7c848b', 'subtle #878f95': '#878f95' };
for (const [sn, sh] of Object.entries(surfaces)) {
  const row = Object.entries(textTones)
    .map(([tn, th]) => `${tn.split(' ')[0]}=${contrast(th, sh).toFixed(2)}`)
    .join('  ');
  console.log(`  on ${sn.padEnd(14)} ${row}`);
}