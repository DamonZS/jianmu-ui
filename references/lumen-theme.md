# Lumen · 环境驱动的连续主题

> 拖动顶部圆窗里的太阳，整个界面从午夜蓝连续过渡到正午白，中间经停金色时刻。

这不是深色模式开关。深色模式只有两个离散状态；Lumen 是**一个连续标量驱动整套视觉**。

**这份文档的核心结论来自实测，不是推演。** 第一版设计（所有颜色线性插值）在对比度验证中当场失败，下面第五节完整记录了失败与修正。照着抄第五节的结论，不要沿用直觉。

---

## 一、核心约束

1. **组件不认识"白天"和"黑夜"**。组件只读 `--bg / --surface / --ink / --accent / --chart-*`。任何 `isNight ? ... : ...` 都是错的。
2. **一个源状态**：`t ∈ [0,1)`，代表一天中的时刻。
3. **背景与强调色连续插值；文字色不插值**。这是全文最重要的一条，理由见第五节。
4. **数值不随主题变**。变的是光和材质，不是事实。
5. **任意 t 上，正文对比度 ≥ 4.5:1**。不是"大致没问题"，是逐点验证过的。

---

## 二、状态链

```
t  (0..1)                    ← 唯一可交互状态：拖动 / 自动播放 / 跟随真实时间
 └─► time = t * 24           ← 0–24 点
      ├─► phase             ← midnight / dawn / golden / day / dusk（只用于标签与装饰）
      ├─► 背景插值           → --bg --bg-2 --accent --chart-1..3 --warmth
      └─► 文字反解           → --ink --ink-2 --ink-3 --stroke
```

两条支路是分开的。背景走插值，文字走**求解**。

### 2.1 五个阶段

| phase | time 区间 | 语义 | 视觉 |
|---|---|---|---|
| `midnight` | 21:30–04:30 | 深夜 | 近黑蓝，紫色光晕，冷色图表 |
| `dawn` | 04:30–06:24 | 破晓 | 深蓝 → 蓝紫，低对比 |
| `golden` | 06:24–08:30 | 金色时刻 | 暖灰底，琥珀强调，烟熏玻璃卡 |
| `day` | 08:30–17:30 | 正午 | 亮底实白卡，橙金强调 |
| `dusk` | 17:30–21:30 | 暮色 | 亮 → 深，橙红降为紫 |

`phase` 只用于显示标签、主题色和是否渲染星光/雾气。**不用于选色**。

---

## 三、锚点

背景、强调色、图表色、`--warmth` 走锚点插值。

```js
export const ANCHORS = {
  at: [0, 5.2, 6.4, 6.88, 7.0, 12, 17.6, 18.8, 19.40, 19.55, 20.2, 24],
  values: {
    bg: [
      [0x0b,0x0d,0x14], [0x0e,0x10,0x1e], [0x1a,0x1c,0x32], [0x1f,0x21,0x3a],
      [0xb9,0xa7,0x9e], [0xec,0xeb,0xe7], [0xea,0xe1,0xd8], [0xc9,0xb2,0xa6],
      [0xc2,0xac,0xa2], [0x33,0x2e,0x40], [0x2a,0x26,0x38], [0x0b,0x0d,0x14],
    ],
    // bg2 / accent / chart1..3 / warmth 同长度，见 assets/lumen.js
  },
};
```

### 为什么有 6.88 / 19.40 / 19.55 这几个奇怪的时间点

它们是**故意的**。背景亮度在 0.10–0.30 之间时，黑字和白字都够不到 4.5:1，这是物理限制。唯一的出路是让背景**快速跳过**这段亮度区间，而不是在上面停留。

原名只有 `[6.4, 7.2]` 和 `[18.8, 20.2]` 两个锚点，插值后在中灰带停留了 55 分钟（6.74–7.08、19.14–19.72），实测对比度掉到 4.13–4.22。加密集锚点把停留压缩到 7–9 分钟后，全时段达标。

> 改锚点时不要"优化掉"这几个点。删掉任何一个，危险窗口就会重新打开。

### 3.1 三个视觉锚点（供设计参考，非实现值）

| 变量 | midnight (00) | golden (07) | noon (12) |
|---|---|---|---|
| `--bg` | `#0B0D14` | `#B9A79E` | `#ECEBE7` |
| `--bg-2` | `#141826` | `#C9B6AC` | `#F4F3F0` |
| `--accent` | `#6E7BFF` | `#C87A2E` | `#C48612` |
| `--chart-1` | `#7C8BFF` | `#B8742C` | `#B87A10` |
| `--warmth` | `0` | `0.72` | `1` |

- `--warmth` 同时控制三件事：卡片实心度、模糊半径、内发光强度。
- 暖光段（`--warmth` 0.4–0.9）卡片呈"烟熏玻璃"：低不透明度 + 强描边。

---

## 四、实现

完整可运行版本在 `assets/lumen.js`（约 370 行，无依赖），配套样式在 `assets/lumen.css`。**直接复用这两个文件，不要照文档重写。** 以下是关键结构。

### 4.1 插值

```js
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

function sampleAt(t) {
  const time = ((t % 1) + 1) % 1 * 24;
  const at = ANCHORS.at;
  let i = 0;
  while (i < at.length - 2 && time >= at[i + 1]) i += 1;
  const k = Math.min(1, Math.max(0, (time - at[i]) / (at[i + 1] - at[i] || 1)));
  const out = {};
  for (const [key, series] of Object.entries(ANCHORS.values)) {
    out[key] = mix(series[i], series[i + 1], k);
  }
  return out;
}
```

### 4.2 文字求解（核心）

```js
const PURE_DARK  = [0, 0, 0];
const PURE_LIGHT = [255, 255, 255];
const BRAND_DARK  = [0x14, 0x15, 0x18];   // 品牌墨黑
const BRAND_LIGHT = [0xf2, 0xf3, 0xf6];
const TARGET = { ink: 12, ink2: 7, ink3: 4.6 };

/** 在 bg 与 anchor 之间二分，找到刚好达到 target 对比度的颜色 */
function solveInk(bg, anchor, target) {
  if (contrast(anchor, bg) <= target) return anchor.slice();
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrast(mix(bg, anchor, mid), bg) < target) lo = mid;
    else hi = mid;
  }
  return mix(bg, anchor, hi);
}

export function inkFor(bg) {
  const toBlack = contrast(PURE_DARK, bg);
  const toWhite = contrast(PURE_LIGHT, bg);
  const bgIsLight = toBlack >= toWhite;

  const pure  = bgIsLight ? PURE_DARK  : PURE_LIGHT;
  const brand = bgIsLight ? BRAND_DARK : BRAND_LIGHT;

  const pick = (target) => {
    const viaBrand = solveInk(bg, brand, target);
    if (contrast(viaBrand, bg) >= target - 0.01) return viaBrand;
    return solveInk(bg, pure, target);   // 品牌锚点够不到，退回纯黑白兜底
  };

  return {
    mode: bgIsLight ? 'light' : 'dark',
    ink:  pick(TARGET.ink),
    ink2: pick(TARGET.ink2),
    ink3: pick(TARGET.ink3),
    ratios: { /* 实际值，供自检 */ },
  };
}
```

**为什么必须用纯黑白兜底**：品牌墨黑 `#141518` 的亮度是 0.008，纯白是 1。二者之间存在一个亮度真空带——背景落在 0.161–0.207 时，品牌色两方向都够不到 4.5（最低掉到 4.18）。纯黑/纯白是唯一能在**所有**背景亮度上都给出 ≥4.58:1 的一对锚点。先把品牌色解出来，够不到目标才退让，这样既能保持品牌调性，又不会在任何时刻破防。

### 4.3 应用

```js
function apply(t) {
  const s = sampleAt(t);
  const ink = inkFor(s.bg);

  style.setProperty('--bg', rgbStr(s.bg));
  style.setProperty('--ink', rgbStr(ink.ink));
  style.setProperty('--ink-2', rgbStr(ink.ink2));
  style.setProperty('--ink-3', rgbStr(ink.ink3));

  const warmth = clamp(s.warmth[0], 0, 1);
  style.setProperty('--warmth', warmth.toFixed(3));
  style.setProperty('--surface-alpha', (0.46 + 0.40 * warmth).toFixed(3));
  style.setProperty('--blur-amt', `${Math.round(14 - 8 * warmth)}px`);

  root.dataset.phase = phaseOf(t);
  root.dataset.ink = ink.mode;
  metaThemeColor.content = rgbStr(s.bg);
}
```

### 4.4 三条实现陷阱（都是实测踩到的）

**① 颜色通道必须取整。**
插值产生小数，`rgb(41.39 42.19 44.50)` 在严格解析下是无效值，整条声明被丢弃。

```js
const rgbStr = ([r, g, b]) =>
  `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
```

**② 不要用 `requestAnimationFrame` 应用主题。**
后台标签页里 rAF 不触发。把 `apply` 放进 rAF，等于主题在无焦点时完全失效——实测表现为"拖了没反应"，而控制台没有任何报错，极难定位。`apply` 只有几次 `setProperty`，同步执行即可。rAF 只用于合并连续的拖动事件，且必须保证有一个同步出口。

**③ `--surface-alpha` 的方向别搞反。**
初版写成 `0.78 - 0.60 * warmth`（正午最透）。结果正午实卡只有 0.18，文字浮在背景上。正确是 `0.46 + 0.40 * warmth`：正午 0.86（够实），深夜 0.46（半透）。

---

## 五、失败记录：为什么文字不能插值

这是整份文档最重要的一节。第一版设计看起来完全合理，实测当场失败。

### 5.1 直觉做法

背景从深夜 `#0B0D14` 插到正午 `#ECEBE7`；文字从浅色 `#E7E9F0` 插到深色 `#141518`。两套颜色同步过渡，感觉天衣无缝。

### 5.2 实测结果

按 WCAG 公式逐点计算（每 18 秒一个采样，共 4800 点）：

```
t      时间    阶段       ink/bg   ink2/bg  ink3/bg
0.150  04:00   midnight   15.02    7.83     3.78
0.250  06:00   dawn        5.40    3.44     2.28   ← 不合格
0.300  07:00   golden      4.04    2.63     1.63   ← 不合格
0.375  09:00   day         9.97    4.76     2.24
0.850  20:00   dusk        2.82    1.89     1.40   ← 不合格
```

金色时刻 4.04:1，傍晚 2.82:1。**完全不可读**。

### 5.3 原因

文字色在明暗之间插值时，中途必然经过**中灰**。而中灰文字在任何背景上对比度都极低——它离背景太近。这是几何必然，不是取色不当。

```
      浅字 ──────► 中灰 ──────► 深字
                 ↑
            到这里等于没有文字
```

### 5.4 修正

**文字色不插值，改为按背景实时求解**：以当前背景为起点，朝黑或朝白方向二分，解出刚好达到目标对比度的颜色。

- 背景变亮时，文字自动变深；背景变暗时，自动变浅。
- 过渡不是"渐变色"，而是"始终保持可读"。
- 观感上，文字确实会随光变化，但绝不出现灰糊的中间态。

### 5.5 修正后

```
采样 4800 点（每 18 秒）
  最低 ink = 4.63   ink2 = 4.63   ink3 = 4.60
  不合格: 无
  中灰危险区（最优方向 <5:1，但仍达标）: 5 点
```

三档文字在一天中任何时刻都合格，最差点距 4.5 安全线仍有 0.10 余量。

### 5.6 可复用的教训

> **凡是要在"浅底深字"和"深底浅字"之间过渡，文字色都不能线性插值。**
> 背景可以连续变，文字必须始终满足对比度约束。这两件事不能用同一种方式处理。

这条适用于任何主题系统，不限于 Lumen。

---

## 六、天空窗组件

现成样式在 `assets/lumen.css`：`.sky` `.sky-window` `.sky-gradient` `.sky-hills` `.sky-track` `.sky-orb` `.sky-caption`，以及 `.glass-card` 和 `.ambient-row`。拖动与键盘绑定用 `lumen.js` 的 `bindSkyOrb(orb, track, engine)`。下面的规格用于理解和改动，不用于从零重写。

```
        ╭──────────────────────────────╮
       ╱   渐变天空 · 山线 · 太阳/月亮     ╲
      │         ● ← 可拖动指针             │
      ╰──────────────────────────────────╯
              Golden hour · 07:01
```

| 元素 | 规格 |
|---|---|
| 窗框 | 高 160–200，宽 60–80%，上沿大圆角 `120px 120px 24px 24px`，2px 金属边 |
| 天空渐变 | 由 `--bg` 派生，两端各偏移亮度 ±12% |
| 山线 | 两层 SVG，后层 `opacity: .5`，前层 `.85` |
| 天体 | 24–32 圆，日光加 32px 外发光，月光用冷色柔光 |
| 手柄 | 24，`cursor: grab`；触摸 `touch-action: none` |
| 标签 | 12px，`--ink-2`，居中 |

### 交互

- 指针拖动：`pointerdown` → 捕获 → `pointermove` 更新 → `pointerup` 收尾。
- **`setPointerCapture` 要包 try/catch**：在合成事件或已释放的 pointerId 上会抛错，而它在处理器第一行，一抛就整段中断，表现为"完全拖不动"。
- 在 `window` 上也挂一个 `pointerup`，防止指针在元素外释放后一直卡在 dragging。
- 键盘：`←/→` 调 1 小时，`Home`/`End` 到两端，同步 `aria-valuenow`。

```js
orb.addEventListener('pointerdown', (e) => {
  try { orb.setPointerCapture(e.pointerId); } catch { /* 增强项，失败不阻断 */ }
  engine.beginDrag();
  ...
});
```

---

## 七、配套展示组件

Lumen 不只是背景。**环境参数本身是内容**——这排组件把主题状态显式化。

### 7.1 四联指标

```
Sun elevation      Lux at desk      Colour temp      Daylight
+55.0°             1,100 lx         6,500 K          6h 36m
在地平线上          桌面照度          冷 · 日光         距日落
```

- 四张卡等宽横排，间距 12。
- 标签 11/`--ink-3`，数值 28–32/500/等宽，第三行 11 补充说明。
- 数值必须与 `t` 相关：仰角 `sin((t-0.25)*2π)`，色温 2400K→6500K 钟形，照度同钟形峰值 1100 lx。

### 7.2 全天曲线

钟形曲线 + 当前时刻竖线 + 实心指示点，柱子按强调色染色，当前那根更高更亮。

### 7.3 活动流

每行：图标 14 + 主文本 13 + 副文本 12/`--ink-3` + 时间 11。顶部 `live ●`，呼吸 2s，`prefers-reduced-motion` 下静止。

---

## 八、接到后台界面的三种方式

Lumen 适合**展示型**页面，不适合**长时间操作型**后台。

### 接法 A · 仅落地页（推荐）
登录或首页用 Lumen，进后台后固定为当前时段对应的静态主题。用户看不到切换入口，但产品有延续感。

### 接法 B · 跟随真实时间
每小时重算 `t = now.hours / 24`，自动昼夜过渡。对比度已按 24 小时验证过，可用；但需覆盖全部时段的视觉回归。

### 接法 C · 用户可调
设置里放时间滑块（复刻天空窗），持久化。最灵活，用暖光段规则兜住中间态。

> **不要**做成"深色/浅色"两档开关。那样就退化成普通双主题，丢掉了它唯一的价值：连续。

---

## 九、验收

| 检查 | 方法 | 本项目的实测值 |
|---|---|---|
| 全时段对比度 | 每 18 秒采样，算 `--ink`/`--bg` 比值 | 最低 4.63（ink）、4.60（ink3） |
| 组件无主题分支 | `grep -r "isNight\|isDark\|phase ===" src/` | 应为 0 |
| 过渡无档位 | 拖动 0→1 录屏，看是否有可见跳变 | 无 |
| 拖动跟手 | 拖动时 `data-dragging` 存在 | — |
| 后台标签页可用 | 切到别的标签再切回，主题应已更新 | 修 rAF 后正常 |
| 键盘可达 | 聚焦手柄后 `←/→/Home/End` 生效 | — |
| 减少动效 | `prefers-reduced-motion` 下无过渡 | — |
| theme-color 同步 | 每次 apply 后检查 meta | — |
| 图表跟随 | 切到 golden 段后系列色变暖 | — |

### 验证脚本（可直接跑）

```js
import { ANCHORS, inkFor } from './lumen.js';

const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
function sample(t) {
  const time = t * 24, at = ANCHORS.at;
  let i = 0;
  while (i < at.length - 2 && time >= at[i + 1]) i += 1;
  const k = Math.min(1, Math.max(0, (time - at[i]) / (at[i + 1] - at[i] || 1)));
  const o = {};
  for (const [key, s] of Object.entries(ANCHORS.values)) o[key] = mix(s[i], s[i + 1], k);
  return o;
}

let worst = { ink: 99, ink2: 99, ink3: 99 }, bad = 0;
for (let h = 0; h < 24; h += 0.005) {
  const r = inkFor(sample(h / 24).bg);
  for (const k of ['ink', 'ink2', 'ink3']) worst[k] = Math.min(worst[k], r.ratios[k]);
  if (r.ratios.ink < 4.5 || r.ratios.ink2 < 4.5 || r.ratios.ink3 < 3.0) bad += 1;
}
console.log('最低对比度', worst, '不合格点数', bad);
// 期望：{ ink: 4.63, ink2: 4.63, ink3: 4.60 }  不合格点数 0
```

改动锚点或求解参数后必须重跑。低于期望就是引入了回归。
