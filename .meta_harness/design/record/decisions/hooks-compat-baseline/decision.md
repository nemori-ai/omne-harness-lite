# D-033：hooks 兼容层的起点——fork DSH hook-protocol 无运行时的一半，其余自写

- **当前状态：已接受，起点与 fork 边界；带一个预先认可的翻盘判据。**
  **未接受**：拓展点协议、兼容层契约、导入报告的形状、G1–G11 任何一项；fork 与任何实现都还不存在。
- **来源提案**：[`proposals/hooks-compat-baseline`](../../proposals/hooks-compat-baseline/README.md)，HUB `panqiwei/assets-runtimes` 提交 `b12d927`——
  [必须保留的性质 P1–P10](../../proposals/hooks-compat-baseline/design.md#必须保留的性质)、
  [四个候选与推荐 A](../../proposals/hooks-compat-baseline/alternatives.md#推荐与仍待区分的事项)、
  [交接缺口 G1–G11](../../proposals/hooks-compat-baseline/design.md#交接缺口)。
- **来源研究**：[loop-extension-hooks-compat](../../../../research/loop-extension-hooks-compat/research.md)（首轮 2026-09-23；
  四个无运行时文件的规模按[钉住副本](../../../../research/loop-extension-hooks-compat/notes/dsh-hook-protocol.md)计：361 行源码、51 例测试）。
- **需求与方法前提**：[PF-012](../../../product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点) rev 9 §5.8、
  [PF-002](../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension) rev 13 Loop Extension、
  [PF-008](../../../product/PF-008-human-in-the-loop/README.md) rev 5、[PF-005](../../../product/PF-005-execution-environments-and-sandboxes/README.md) rev 5；
  [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)（Agent Loop 由本项目定义；选定复用的 DSH 组件以 fork 自维护）。
- **实际接受依据**：2026-09-23，产品负责人（`panqiwei`）对 G1 七份复用提案逐项裁决，对本提案原话
  **「选 A 先吧；几个G等协议起草时一起讨论裁决」**。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| 兼容层起点：A fork `hook-protocol` 无运行时一半、B fork DSH 两个桥、C 全自研、D 只做离线转换 | **接受 A**（原话「选 A 先吧」） | **fork 边界**：DSH `c291e79` `hook-protocol` 的 `matcher`、`codec`、`merge`、`detached` 四个文件与 `HookOutput` 类型，剥掉对 `dsh-session` 的类型扩展；**自写**：runner（经本项目执行环境接缝，不继承 DSH「执行器拒绝 → 非阻断结果、永不抛」的放行方向）、导入、以研究 §五为唯一权威的方言映射表、经本项目拓展点协议的结论交付。**不取**：`runner`、`events`、`invariant` 与两个桥 | fork 尚未做；三处漂移（matcher 精确集、codec 按方言分支、merge 的 `defer` 档与改写字段）尚未改 |
| A 与 C 的区分实验 | **保留**（「先」的读法：实验出结果前以 A 为起点） | 在钉住副本上做完四处立刻要改的事后量改动行数；**超过一半即改选 C**——这条判据由提案写出、随 A 一起被接受 | **实验未跑**；按提案归实施计划第一步，不阻塞协议设计。结果达到判据时，以**新决定**记录改选 C，取代本决定这一项范围 |
| B、D 的可取之处 | 随 A 的描述作为起草输入 | 提案把它们写成 A、C 都要有的要求：注入的上下文标来源、不冒充用户；只有上下文的 hook 不短路后续；非法 matcher 让整份配置导入失败；导入报告那一半 | 是起草输入，不是另行接受的条款；落进哪份契约归协议与兼容层起草 |
| 映射项 G1–G11 | **推迟**（原话「几个G等协议起草时一起讨论裁决」） | 本决定不裁任何一项 | 提案建议 G1、G2、G4、G7 在协议起草**前**交出；产品负责人的安排是在协议起草**时**一并讨论——以产品负责人的安排为准。提案对这四项的判断（直接决定兼容层能导入什么、导入后是否安全）不变，只是交出时点移到协议起草时 |

## 理由与保留前提

**理由**（取自[提案推荐](../../proposals/hooks-compat-baseline/alternatives.md#推荐与仍待区分的事项)，产品负责人未另述理由）：
B 被 SYS-KERNEL 与位置不对齐排除（两个桥依赖 DSH 的 agent、tools、llm、session 包，而 Agent Loop 由本项目定义）；
D 译得了声明、译不了每一次调用。A 与 C 在性质兑现与长期漂移负担上相同，差别只在起步：A 白拿 361 行与 51 例测试里编码的边角。
提案自承**这份收益是一次性的、幅度不大，推荐的把握有限**——「先」字与保留的区分实验对应的就是这一点。

**保留前提：**

- **fork 视作自有模块，不假设与上游同步**：DSH 的基线已落后于两家宿主，上游 DSH 不是两家协议的跟进来源；fork 来历按 [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel) 记录。
- **兼容层站在拓展点协议之上**：协议（阶段 3/4）尚未起草，四个候选都要等它；本决定不定协议的任何部分。
- **宿主版本**：兼容声明钉哪一版 Claude Code、哪一版 Codex 是 G11，归实施计划；宿主升级时按研究包的版本 token 复核，研究结论变了回来复核本决定。
- **会让 B 或 D 重新上桌的证据**沿用[提案](../../proposals/hooks-compat-baseline/alternatives.md#推荐与仍待区分的事项)（本项目采用 DSH 的 agent loop 与 tools 拦截面；或决定不支持 command handler），目前都看不到；翻盘走新决定。
- 提案用的「兼容层」「导入报告」是描述性说法，**不是统一语言词条**；进规格要当概念用时，先由词表 owner 立词。

## 取代与影响

不取代任何决定。

| 受影响拥有者/消费者 | 应更新的引用、契约、地图或映射 | 所需产物/责任与闭合条件 |
|---|---|---|
| 拓展点协议（阶段 3/4） | 起草时一并讨论裁决 G1–G11 | **未起草**。其中 G1（定档依据）、G2（`ask`/`defer`）、G4（不可用与报错的分界）、G7（只观察档照样执行任意命令）是提案标出的、直接决定导入范围与安全的四项；各项 owner 见[提案交接缺口](../../proposals/hooks-compat-baseline/design.md#交接缺口) |
| 兼容层的提供者设计与 fork | 以本决定为起点，回链本决定与提案 | **未起草、未 fork**；区分实验归实施计划第一步 |
| [proposals 索引](../../proposals/README.md#当前主题) `hooks-compat-baseline` 行 | 「候选／接受边界」改为已由本决定接受 | **已完成**（与本决定同批） |

**明确不表示：**

- 任何契约被接受；拓展点协议、兼容层契约、导入报告形状已经存在；
- fork 已经做出，或任何 runner、导入器、映射表已经实现；
- 区分实验已经跑过，或 A 一定比 C 省事——那正是实验要回答的；
- G1–G11 任何一项已裁，或研究列出的未知（宿主是否真按文档执行各字段等）已闭合；
- DSH `hook-protocol` 以外的任何 DSH 包被选为复用组件；
- 提案里的作者推荐构成接受——接受依据只有产品负责人的原话。

返回[本 topic 入口](README.md)。
