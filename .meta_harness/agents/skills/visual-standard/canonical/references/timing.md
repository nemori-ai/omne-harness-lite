# 时长

> 什么时候读：要定界面的一个动用哪个时长与曲线；要定形的一笔写多久、停多久、干多久；要加随性；要处理减弱动效之前。
> 形的状态笔各自的时长在[状态](states.md)，一程的时长在[移动与座位](seats-and-journeys.md)，墨框的时长在[墨框与告知笺](ink-bubble.md)。这一份是界面的钟、形的通用时长与随性。

## 1. 界面的一只钟

界面只有这些动效 token；别的时长或曲线过不了动效门（M2）。下表与 `packages/frontend/ui-kit/src/styles/tokens.css` 声明的动效 token 一一相同：名字、值与次序都照它。`tokens.css` 增删或改一个动效 token 时，同一次改动改这张表。

| token | 值 | 用在哪 |
| --- | --- | --- |
| `--omne-motion-feedback` | 120ms | 悬停、按下、颜色的回应；形被打断时墨干掉 |
| `--omne-motion-state` | 180ms | 选中的移动、开关、箭头、悬停离开、落定 |
| `--omne-motion-enter` | 240ms | 浮层进入、内容到达 |
| `--omne-motion-exit` | 140ms | 浮层离开 |
| `--omne-motion-layout` | 300ms | 面板、视图变化、展开、侧栏折叠、图标滑进姿态 |
| `--omne-motion-ease` | cubic-bezier(0.2, 0.8, 0.2, 1) | 状态变化 |
| `--omne-motion-ease-enter` | cubic-bezier(0.16, 1, 0.3, 1) | 进入与移动 |
| `--omne-motion-ease-exit` | cubic-bezier(0.4, 0, 1, 1) | 离开 |
| `--omne-motion-ease-glide` | cubic-bezier(0.61, 1, 0.88, 1) | 图标自己的动，去与回（I8） |
| `--omne-motion-glyph-swing` | 480ms | 无 |
| `--omne-motion-ease-swing` | cubic-bezier(0.34, 1.56, 0.64, 1) | 无 |
| `--omne-motion-glyph-stagger` | 160ms | 无 |
| `--omne-motion-sketch-stagger` | 60ms | 无 |
| `--omne-motion-ordinal` | 0 | 无（它不是时长：一项在序列里的位置，乘一个笔距） |
| `--omne-motion-activity` | 1.5s | 活动标记一圈：三滴墨轮流写，相隔三分之一（L2） |
| `--omne-motion-shimmer` | 1.4s | 无 |
| `--omne-motion-ease-loop` | linear | 一切循环：循环匀速，从不缓动 |
| `--omne-motion-spirit-flow` | 2.6s | 无 |
| `--omne-motion-spirit-dwell` | 2000ms | 无 |

「用在哪」写「无」的 token：`tokens.css` 里还在，本技能没有规则用它们，成员不得读它们。它们的去留归共用件；删掉一个时，同一次改动删掉这张表的那一行。

公布的关键帧只有这几个（M12）：

| 关键帧 | 用在哪 |
| --- | --- |
| `omne-fade-up` | 唯一的到达 |
| `omne-presence-enter`、`omne-presence-exit`、`omne-overlay-enter`、`omne-overlay-exit` | 浮层的进出（M9） |
| `omne-loading-write`、`omne-loading-dry` | 活动标记的写与干（L2） |
| `omne-code-edge` | 代码面的滚动边：跟滚动位置走，不跟钟走 |
| `omne-shimmer-text` | 无 |

形不用 CSS 动画：它的时长在 `src/ink/` 的具名常量里，不在 CSS 里。

## 2. 形的通用时长

下面几张表里的数都在 `packages/frontend/ui-kit/src/ink/` 的具名常量里。「出处」一栏的路径都相对 super-assistant `83c1616f` 的 `desktop/src/renderer/src/`。

### 2.1 写

| 常量 | 数（ms） | 守住什么 | 出处 |
| --- | --- | --- | --- |
| `WRITE.mark` | 200；合口那一笔 × 1.4 = 280 | 一个点、一短笔写得出又不拖 | `spirit/body.ts` |
| `WRITE.circle` | 620（落下时 ±10%，见第 4 节） | 写一个圆：回家、一程落下 | `spirit/body.ts` |
| `WRITE.rewrite` | 520 | 在自己的痕上重写一遍 | `spirit/body.ts` |
| `WRITE.working` | 1300 × 0.86–1.16 | 在做事时写一圈 | `spirit/body.ts` |
| `WRITE.workingRest` | 650 × (0.45 + 1.65·r²) | 两圈之间的停，多半短、偶尔长 | `spirit/body.ts`；随性见第 4 节 |

### 2.2 干

| 常量 | 数（ms） | 守住什么 | 出处 |
| --- | --- | --- | --- |
| `WRITE.dry` | 260；合口那一笔 156 | 状态笔干去，匀速淡 | `spirit/body.ts` |
| `WRITE.interrupt` | 120，就是 `--omne-motion-feedback` | 被打断时画出去的墨干掉：从不让人等 | `spirit/body.ts` |
| `WRITE.leftDry` | 2200 | 一程出发处留下的圆慢慢干去 | `spirit/body.ts` |
| 重写的旧圆 | 130 里淡成 0.18 的痕；新圆写完后 260 里干去 | 重写读得出是「在旧迹上再写」 | `spirit/body.ts` |

一程留下的墨先干得快、后面拖着慢：不透明度按 (1 − u)² 走。状态笔匀速淡去。

## 3. 数不出来的循环

- 唯一会重复的是「在做事」时的重写：每一遍是新写的，两遍之间的停每次不同，做完就停。
- 所有的等都从一个范围里抽，所以它不像一只钟。
- 为什么：数得出来的节拍是机器（转圈、闪烁、呼吸灯）。一只手写字，不会每 1.3 秒一模一样。

## 4. 随性的范围

| 常量 | 范围 | 守住什么 | 出处 |
| --- | --- | --- | --- |
| `TRAVEL_CASUAL.bow` | 一程的弯，两头各自 ±40% | 控制点在窗口里；起点终点一点不差 | `spirit/travel.ts` |
| `TRAVEL_CASUAL.reach` | 起笔、落笔前笔往前送 ±20% | 同上 | `spirit/travel.ts` |
| `TRAVEL_CASUAL.time` | 一程的时长 ±12%，夹在 420–950 ms × 1.9 | 远近都从容，不急 | `spirit/travel.ts` |
| `BODY_CASUAL.landing` | 落下写的圆 620 ±10% | — | `spirit/body.ts` |
| `THINK_CASUAL` | 两圈之间 650 × (0.45 + 1.65·r²)，r 均匀：290–1370 ms，中位约 560；一圈 × 0.86–1.16；第一圈在开始后 240–620 | 不成拍子：停不用 ±% 的匀抽，±15% 的停三四遍之后就数得出拍子，读成转圈 | `spirit/doing-ink.ts` |
| `BACKGROUND_CASUAL` | 两圈之间 2800–6400 ms，均匀；第一圈在开始后 600–1400 | 后台在跑时形不静，但比在想轻得多 | 来源 `ink-motion` 的 `working-states.md` |

- 抽的范围是 `src/ink/` 里的一个具名常量；它守住什么写在本技能的表里。随机只从一个随性的来源取，测试能换成种子。减弱动效下是设计值。
- **判断**（来源没有写成规则）：新行为照这个量级松：时长 ±10–15%，形状（弯、送）±20–40%。终点和人在读的东西永远不松。

## 5. 减弱动效

写和干瞬间完成，不走一程、直接在终点，随性全是设计值。每个状态留一个静的、和别的分得开的记号，状态在它就在，状态走了它就回原样；减弱动效的开关换了，按当前的状态重新放。每个状态留什么，见[状态](states.md)的表。
