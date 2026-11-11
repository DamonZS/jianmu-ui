# jianmu-ui

B 端界面设计语言 skill。从 67 张后台/大屏截图 + Lumen 环境主题蒸馏而来。

## 是什么

一套可执行的判断标准，不是图片集。用来设计或改造：

- 后台管理界面（ERP、审批、运营）
- 数据看板、监控大屏、驾驶舱
- AI 工作台

## 用法

把整个目录放进 `~/.claude/skills/` 或项目的 `.claude/skills/`，然后说：

```
用 jianmu-ui 设计一个订单管理后台
```

技能会先按 `references/interview.md` 提问（族 / 骨架 / 密度 / 主题 / 交付物），
确认后按规范落地，最后走 `references/checklist.md` 自检。

## 结构

| 文件 | 内容 |
|---|---|
| `SKILL.md` | 主入口：四步工作流 + 三条原则 |
| `references/interview.md` | 6 组提问，按轮次发放 |
| `references/skeleton.md` | 4 种页面骨架，精确到像素 |
| `references/components.md` | 18 个组件：解剖 / 尺寸 / 状态 / 反例 |
| `references/charts.md` | 图表选型、数字排版、深浅差异、可达性 |
| `references/lumen-theme.md` | 环境驱动连续主题（含实测失败记录） |
| `references/checklist.md` | 交付自检 + 一票否决项 |
| `assets/tokens.css` | 三族完整 token，可直接引入 |
| `assets/lumen.js` | 主题引擎，无依赖，约 370 行 |
| `assets/lumen.css` | 天空窗 + 玻璃卡样式 |
| `design/source-analysis.md` | 67 张截图的原始分析 |

## 三个族

| 族 | 特征 | 适用 |
|---|---|---|
| A · 玻璃工作台 | 柔光渐变底 + 3D 主视觉 + 半透明卡，低密度 | AI 产品、个人工作台 |
| B · 管理台 | 实白卡 + 紧凑网格 + 常驻导航，高密度 | ERP、审批、运营 |
| C · 监控大屏 | 近黑底 + 发光描边 + 3D 场景，远距可读 | 指挥中心、产线、机房 |

## 一条硬结论

做连续主题时，**文字色绝不能跟背景一起线性插值**——明暗之间必然经过中灰，
而中灰文字在任何背景上都不可读（本项目实测最低 2.82:1）。

背景可以连续变，文字必须按当前背景实时求解。详见 `references/lumen-theme.md` 第五节
的失败数据与修正方案。

## 验证

`assets/lumen.js` 的对比度已逐点验证：4800 个采样点（每 18 秒），
最低 4.63（ink）/ 4.60（ink3），全部达标。脚本在 `lumen-theme.md` 第九节，改动后请重跑。

## 不做

- 移动版后台（B 族在 <768 给桌面提示或降级为只读列表）
- 实时 WebGL（除非确认性能预算）
- 复刻某个具体产品的界面

## 协议

[MIT](LICENSE) © 2026 DamonZS
