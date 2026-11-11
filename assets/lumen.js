/**
 * Lumen · 环境驱动的连续主题
 *
 * 一个连续标量 t ∈ [0,1) 代表一天中的时刻，派生整套 CSS 变量。
 * 组件不认识"白天/黑夜"，只读 --bg / --surface / --ink / --accent / --chart-*。
 *
 * 关键设计：文字色**不插值**。
 * 在浅色与深色之间线性插值文字色，中途必然经过中灰，而中灰文字在任何背景上
 * 都不合格。因此 ink 用「按背景亮度离散切换」：只在背景亮度跨过 0.179 的那一刻
 * 翻转，而该点黑/白文字的对比度恰好相等（约 4.58:1），翻转本身不损失可读性。
 *
 * 用法：
 *   import { createThemeEngine } from './lumen.js';
 *   const engine = createThemeEngine();
 *   engine.set(0.3);          // 07:12 金色时刻
 *   engine.beginDrag();        // 拖动时关闭过渡
 *   engine.endDrag();
 */

/* ---------- 颜色工具 ---------- */

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** CSS 颜色只接受整数通道；插值会产出小数，必须取整，否则部分引擎判为无效值 */
const rgbStr = ([r, g, b]) =>
  `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;

const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

/** WCAG 相对亮度 */
export const relLum = ([r, g, b]) => {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** 对比度 */
export const contrast = (a, b) => {
  const [l1, l2] = [relLum(a), relLum(b)];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * 文字色不插值，也**不用固定灰**——固定灰在中亮度背景上必然塌掉。
 * 做法：朝"黑"或"白"方向，按目标对比度二分反解出一个颜色。
 * 这样任意背景上都能稳定拿到 12 / 7 / 4.6 三档。
 */
/**
 * 纯黑与纯白是唯一的两个"全亮度覆盖"锚点：
 * 任何背景亮度 L 下，取其一都至少有 4.58:1（L=0.179 处两方向恰好相等）。
 * 用略带色的锚点会留下一个两边都够不到 4.5 的真空带，因此求解器用纯黑白，
 * 只在不需要拉满对比度时回到品牌色。
 */
const PURE_DARK = [0, 0, 0];
const PURE_LIGHT = [255, 255, 255];
const BRAND_DARK = [0x14, 0x15, 0x18];
const BRAND_LIGHT = [0xf2, 0xf3, 0xf6];

const TARGET_CONTRAST = { ink: 12, ink2: 7, ink3: 4.6 };

/**
 * 在 bg 与 anchor 之间二分，找到刚好达到 target 对比度的颜色。
 * 目标不可达时返回 anchor 本身（调用方已知上限）。
 */
function solveInk(bg, anchor, target) {
  if (contrast(anchor, bg) <= target) return anchor.slice();
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrast(mix(bg, anchor, mid), bg) < target) lo = mid;
    else hi = mid;
  }
  return mix(bg, anchor, hi);
}

/**
 * 为给定背景计算三档文字色，以及描边色。
 *
 * 方向：哪一侧（纯黑/纯白）对比度更高就用哪一侧。
 * 取色：先用品牌色锚点解出目标对比度；若品牌锚点达不到目标，
 *       改用纯黑/纯白兜底——这保证任意背景都至少拿到 4.5:1。
 */
export function inkFor(bg) {
  const toBlack = contrast(PURE_DARK, bg);
  const toWhite = contrast(PURE_LIGHT, bg);
  const bgIsLight = toBlack >= toWhite;

  const pure = bgIsLight ? PURE_DARK : PURE_LIGHT;
  const brand = bgIsLight ? BRAND_DARK : BRAND_LIGHT;

  const pick = (target) => {
    const viaBrand = solveInk(bg, brand, target);
    if (contrast(viaBrand, bg) >= target - 0.01) return viaBrand;
    // 品牌锚点够不到，退回纯色锚点。纯色锚点的上限 = max(toBlack, toWhite)
    return solveInk(bg, pure, target);
  };

  const ink = pick(TARGET_CONTRAST.ink);
  const ink2 = pick(TARGET_CONTRAST.ink2);
  const ink3 = pick(TARGET_CONTRAST.ink3);

  return {
    mode: bgIsLight ? 'light' : 'dark',
    ink,
    ink2,
    ink3,
    // 实际达到的对比度，供自检与降级判断
    ratios: {
      ink: contrast(ink, bg),
      ink2: contrast(ink2, bg),
      ink3: contrast(ink3, bg),
    },
    /** 该背景是否处在"深不深浅不浅"的危险区（最优方向也 <5:1） */
    risky: Math.max(toBlack, toWhite) < 5,
    stroke: bgIsLight ? [0x14, 0x12, 0x10] : [0x96, 0xa0, 0xdc],
    strokeAlpha: bgIsLight ? 0.10 : 0.18,
  };
}

/* ---------- 锚点 ---------- */

/**
 * 背景与强调色是连续插值的。
 * 文字色（ink / ink2 / ink3）不在这里——它们由 inkFor() 按对比度反解。
 */
export const ANCHORS = {
  // 小时
  at: [0, 5.2, 6.4, 6.88, 7.0, 12, 17.6, 18.8, 19.40, 19.55, 20.2, 24],
  values: {
    bg: [
      [0x0b, 0x0d, 0x14], // 00  深夜
      [0x0e, 0x10, 0x1e], // 05  将晓
      [0x1a, 0x1c, 0x32], // 06  破晓，仍暗
      [0x1f, 0x21, 0x3a], // 06.88 仍在暗侧（紧邻翻转点）
      [0xb9, 0xa7, 0x9e], // 07  金色时刻 —— 背景在 7 分钟内跨过中灰带
      [0xec, 0xeb, 0xe7], // 12  正午
      [0xea, 0xe1, 0xd8], // 17  午后偏暖
      [0xc9, 0xb2, 0xa6], // 19  暮色
      [0xc2, 0xac, 0xa2], // 19.40 仍在亮侧
      [0x33, 0x2e, 0x40], // 19.55 入夜 —— 9 分钟内跨回暗侧
      [0x2a, 0x26, 0x38], // 20
      [0x0b, 0x0d, 0x14], // 24  深夜
    ],
    bg2: [
      [0x14, 0x18, 0x26], [0x18, 0x1a, 0x2c], [0x24, 0x26, 0x42], [0x2a, 0x2c, 0x4a],
      [0xc9, 0xb6, 0xac], [0xf4, 0xf3, 0xf0], [0xf2, 0xea, 0xe2], [0xd6, 0xbe, 0xb2],
      [0xce, 0xb8, 0xae], [0x3a, 0x34, 0x46], [0x33, 0x2e, 0x40], [0x14, 0x18, 0x26],
    ],
    accent: [
      [0x6e, 0x7b, 0xff], [0x8a, 0x74, 0xf0], [0xb0, 0x86, 0xa0], [0xb8, 0x86, 0x92],
      [0xc8, 0x7a, 0x2e], [0xc4, 0x86, 0x12], [0xc4, 0x76, 0x20], [0xb0, 0x5e, 0x38],
      [0xa8, 0x62, 0x44], [0x98, 0x76, 0xc0], [0xa0, 0x72, 0xd8], [0x6e, 0x7b, 0xff],
    ],
    chart1: [
      [0x7c, 0x8b, 0xff], [0x93, 0x82, 0xf2], [0xb4, 0x8c, 0xd0], [0xb0, 0x88, 0xb8],
      [0xb8, 0x74, 0x2c], [0xb8, 0x7a, 0x10], [0xb8, 0x6e, 0x22], [0xa6, 0x58, 0x38],
      [0x9e, 0x5c, 0x42], [0x92, 0x6e, 0xbe], [0xa6, 0x76, 0xda], [0x7c, 0x8b, 0xff],
    ],
    chart2: [
      [0x5a, 0xc8, 0xfa], [0x6a, 0xb6, 0xf0], [0x8e, 0xa8, 0xe0], [0x96, 0xa0, 0xd0],
      [0x9c, 0x5a, 0x28], [0x96, 0x54, 0x10], [0x98, 0x56, 0x1e], [0x8c, 0x46, 0x30],
      [0x86, 0x4a, 0x38], [0x74, 0x84, 0xc8], [0x6c, 0x8c, 0xd8], [0x5a, 0xc8, 0xfa],
    ],
    chart3: [
      [0x9b, 0x7b, 0xff], [0xa0, 0x7e, 0xf4], [0xb0, 0x8c, 0xe0], [0xa8, 0x88, 0xc8],
      [0x86, 0x44, 0x1c], [0x7c, 0x3e, 0x0c], [0x80, 0x42, 0x16], [0x78, 0x36, 0x2a],
      [0x74, 0x3a, 0x30], [0x80, 0x6a, 0xb8], [0x8a, 0x6a, 0xc8], [0x9b, 0x7b, 0xff],
    ],
    warmth: [
      [0], [0.02], [0.10], [0.22], [0.72], [1], [0.92], [0.66], [0.56], [0.22], [0.14], [0],
    ],
  },
};

/* ---------- 插值 ---------- */

function sampleAt(t) {
  const time = (((t % 1) + 1) % 1) * 24;
  const at = ANCHORS.at;
  let i = 0;
  while (i < at.length - 2 && time >= at[i + 1]) i += 1;

  const span = at[i + 1] - at[i] || 1;
  const k = Math.min(1, Math.max(0, (time - at[i]) / span));

  const out = {};
  for (const [key, series] of Object.entries(ANCHORS.values)) {
    out[key] = mix(series[i], series[i + 1], k);
  }
  return out;
}

/* ---------- 阶段 ---------- */

export function phaseOf(t) {
  const h = (((t % 1) + 1) % 1) * 24;
  if (h < 4.5 || h >= 21.5) return 'midnight';
  if (h < 6.4) return 'dawn';
  if (h < 8.5) return 'golden';
  if (h < 17.5) return 'day';
  return 'dusk';
}

const PHASE_LABEL = {
  midnight: 'Midnight',
  dawn: 'Dawn',
  golden: 'Golden hour',
  day: 'High noon',
  dusk: 'Dusk',
};

export const phaseLabel = (t) => PHASE_LABEL[phaseOf(t)];

export const clockLabel = (t) => {
  const totalMin = Math.round((((t % 1) + 1) % 1) * 24 * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/* ---------- 环境派生量 ---------- */

export function ambient(t) {
  const time = (((t % 1) + 1) % 1) * 24;

  const elevation = Math.sin(((time - 6) / 24) * Math.PI * 2) * 55;

  const dayness = Math.max(0, Math.sin(((time - 6) / 24) * Math.PI * 2));
  const kelvin = Math.round(2400 + dayness * 4100);
  const lux = Math.round(dayness * 1100);

  const sunset = 18.6;
  const sunrise = 6.4;
  const left = time < sunrise ? sunrise - time : time < sunset ? sunset - time : 24 - time + sunrise;

  return {
    elevation: Math.round(elevation * 10) / 10,
    kelvin,
    lux,
    daylight: left,
    dayness,
  };
}

/* ---------- 引擎 ---------- */

export function createThemeEngine(root = document.documentElement) {
  let raf = 0;
  let dragging = false;
  let current = 0.5;
  let pending = null;

  function apply(t) {
    current = ((t % 1) + 1) % 1;
    const s = sampleAt(current);
    const ink = inkFor(s.bg);
    const style = root.style;

    style.setProperty('--bg', rgbStr(s.bg));
    style.setProperty('--bg-2', rgbStr(s.bg2));
    style.setProperty('--ink', rgbStr(ink.ink));
    style.setProperty('--ink-2', rgbStr(ink.ink2));
    style.setProperty('--ink-3', rgbStr(ink.ink3));
    style.setProperty('--stroke', `rgb(${ink.stroke.join(' ')} / ${ink.strokeAlpha})`);

    style.setProperty('--accent', rgbStr(s.accent));
    style.setProperty('--chart-1', rgbStr(s.chart1));
    style.setProperty('--chart-2', rgbStr(s.chart2));
    style.setProperty('--chart-3', rgbStr(s.chart3));

    const warmth = Math.min(1, Math.max(0, s.warmth[0]));
    style.setProperty('--warmth', warmth.toFixed(3));
    // 正午实卡要够实（.86），深夜才降到半透（.46）——反过来会让白天的文字浮在背景上
    style.setProperty('--surface-alpha', (0.46 + 0.40 * warmth).toFixed(3));
    style.setProperty('--blur-amt', `${Math.round(14 - 8 * warmth)}px`);

    root.dataset.phase = phaseOf(current);
    root.dataset.ink = ink.mode;
    root.style.background = rgbStr(s.bg);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = rgbStr(s.bg);

    root.dispatchEvent(new CustomEvent('lumen:change', {
      detail: { t: current, phase: phaseOf(current), ink: ink.mode, ratios: ink.ratios, risky: ink.risky, vars: s },
    }));
  }

  return {
    get t() { return current; },
    get dragging() { return dragging; },
    get vars() { return sampleAt(current); },
    phase() { return phaseOf(current); },
    ambient() { return ambient(current); },
    set(t) {
      // 同步应用。这里只有几次 setProperty，开销可忽略；
      // 不能放进 rAF——后台标签页里 rAF 不触发，主题会完全失效。
      apply(t);
    },
    setNow() {
      const d = new Date();
      this.set((d.getHours() + d.getMinutes() / 60) / 24);
    },
    beginDrag() { dragging = true; root.dataset.dragging = ''; },
    endDrag() { dragging = false; delete root.dataset.dragging; },
  };
}

/* ---------- 天空窗绑定 ---------- */

export function bindSkyOrb(orb, track, engine) {
  const tFromX = (clientX) => {
    const r = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const paint = (t) => {
    orb.style.setProperty('--x', `${(t * 100).toFixed(3)}%`);
    orb.setAttribute('aria-valuenow', String(Math.round(t * 240) / 10));
  };

  orb.addEventListener('pointerdown', (e) => {
    // 指针捕获在部分环境（合成事件、已释放的 pointerId）会抛错。
    // 它只是"拖出元素外仍能收到 move"的增强，失败不该中断拖动本身。
    try { orb.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    engine.beginDrag();
    const t = tFromX(e.clientX);
    engine.set(t);
    paint(t);
  });

  orb.addEventListener('pointermove', (e) => {
    if (!engine.dragging) return;
    const t = tFromX(e.clientX);
    engine.set(t);
    paint(t);
  });

  const stop = () => { if (engine.dragging) engine.endDrag(); };
  orb.addEventListener('pointerup', stop);
  orb.addEventListener('pointercancel', stop);
  orb.addEventListener('lostpointercapture', stop);
  // 指针在元素外释放时也要收尾，否则会一直处于 dragging
  window.addEventListener('pointerup', stop);

  orb.addEventListener('keydown', (e) => {
    const cur = Number(orb.getAttribute('aria-valuenow')) || 0;
    let next = null;
    if (e.key === 'ArrowLeft') next = cur - 1;
    else if (e.key === 'ArrowRight') next = cur + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 23.9;
    if (next == null) return;
    e.preventDefault();
    const t = (((next % 24) + 24) % 24) / 24;
    engine.set(t);
    paint(t);
  });

  paint(engine.t);
  return { paint };
}
