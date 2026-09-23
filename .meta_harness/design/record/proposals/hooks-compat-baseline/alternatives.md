# 候选与取舍

## 选择对象与必要约束

见 [design.md](design.md#需要作出的选择)：兼容层（导入 + 运行时翻译）从什么起步。
必须保留 P1–P10（[性质表](design.md#必须保留的性质)）；可调整的是代码来源、fork 边界、导入与运行两半怎么分。
**本项目的拓展点协议不在选择范围内**，四个候选都站在它之上、都要等它。

事实基础（除特别注明外均出自[研究包](../../../../research/loop-extension-hooks-compat/research.md)，DSH `c291e79`）：

- `hook-protocol` 里 `matcher.ts`、`codec.ts`、`merge.ts`、`detached.ts` 与 `HookOutput` 类型没有运行时 import；
  `runner.ts` 依赖 `dsh-shell` 的执行器，`events.ts`、`invariant.ts` 依赖 `dsh-session`、`dsh-invariants`、`cordis`；
  `types.ts` 用 `declare module` 扩 `dsh-session` 的 `SessionEventMap`。
- 规模（本提案起草时对[钉住副本](../../../../research/loop-extension-hooks-compat/notes/dsh-hook-protocol.md)计数）：四个无运行时文件共 361 行源码，
  配套测试 matcher 9 例、codec 25 例、merge 12 例、detached 5 例；两个桥的源码 CC 482 行、Codex 413 行。
- 两个桥 import `dsh-agent`、`dsh-tools`、`dsh-llm`、`dsh-session`、`dsh-session-projection`（CC 另加 `dsh-subagent`），
  映射到 DSH 自己的拦截面；只覆盖 CC 7 个、Codex 5 个事件；`updatedInput` 不生效、`continue:false` 不执行、`stop_hook_active` 恒假。
- 相对今天的两家：matcher 精确集（CC 2.1.191/2.1.195 起含 `-`、空格、`,`）、codec（CC 2.1.248 起所有退出码读 JSON、坏 JSON 不当上下文）、
  merge（无 `defer` 档）各有一处漂移；事件基线 30/10，今天 33/12。
- 两家都在变；DSH 的基线已落后于两家——**上游 DSH 不是两家协议的跟进来源**。

## 候选

| 可识别候选及范围 | 如何兑现必要性质 | 差异、总负担及关键反例 | 当前证据与缺口 |
|---|---|---|---|
| **A. fork `hook-protocol` 无运行时的一半为起点**：`matcher`、`codec`、`merge`、`detached` 与 `HookOutput` 类型（剥掉 `dsh-session` 类型扩展）；**自写** runner（经本项目执行环境接缝）、导入、按研究 §五的方言映射表、结论交付（经本项目拓展点协议）。**不取** runner、events、invariant、两个桥 | P1 映射表自写，以研究 §五为唯一权威；P2 在 merge 上补改写字段与 `ask`/`defer` 的译法、把 `allow` 折成无意见；P3 导入时定档、运行时按档裁剪；P4 自写 runner 不继承 DSH「执行器拒绝 → 非阻断结果、永不抛」的放行方向；P5 merge 的决定折叠本就与顺序无关，可作「一个组折成一件」的内部折叠；P6 merge 已把首个 `continue:false` 粘成 `stop`，兼容层把它交给协议译成取消；P7、P10 经协议落条目；P8 runner 本就是接缝形状；P9 方言表按钉住版本分键 | **起步收益**：361 行已测过的边角（匹配全部的三种写法、字面精确与子串的区别、非法正则配置期报诊断、`hookEventName` 不符丢弃事件专属字段、按获胜档位拼理由、`continue:false` 粘住）连同 51 例测试。**立刻要付**：三处漂移与 codec 按方言分支（CC 全退出码读 JSON、Codex 只在 exit 0；PermissionRequest exit 2 两家含义不同），对应测试同步改；剥类型扩展；按 [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel) 记 fork 来历。**长期负担**：与 C 相同——两家各自漂移都由本项目按钉住版本重核；**不指望上游同步**。**关键反例**：若三处漂移加方言分支改掉了四个文件的大半，fork 就只剩名义，来历记录成了纯成本 | 研究结论与来源笔记；四个文件与测试的规模为本次计数。**区分实验未跑**（见下） |
| **B. fork DSH 两个桥**（`hooks-claude-code`、`hooks-codex`），补三处自认缺口，追到今天的事件清单 | 桥的每一条映射都落在 DSH 拦截面上（`agent/pre-step`、`tools/pre-execute`、`tools/post-execute`、`agent/turn-stopping`……），要兑现 P1 就得把它们逐条改写到本项目的十一个位置；P2、P6、P7 是桥自认没做的；P4 继承 DSH runner 的放行方向；P5 桥是串行，与瀑布同向但折叠在桥内 | **排除**。**反例一**（SYS-KERNEL）：两个桥依赖 DSH 的 agent、tools、llm、session 与 projection 包，而 Agent Loop 由本项目自行定义——保留这些依赖等于引入 DSH 的 loop，去掉它们则每一行映射都要重写，剩下的只有 `config.ts` 那一层配置解析。**反例二**（位置不对齐）：`agent/pre-step` 一个点跨了本项目「消息落盘之前」与「调模型之前」两个位置；DSH 拦截面不覆盖压缩前后、调模型之后、落终态之后、PermissionRequest。**反例三**：补齐 CC 26 个、Codex 7 个未覆盖事件与三处缺口之后，桥原有的实现几乎不剩。**可取的**只有设计经验，作为要求而非代码进 A 或 C：注入的上下文一律标来源、不冒充用户；只有上下文的 hook 不短路后续；非法 matcher 让整份配置导入失败而不是部分注册 | 研究「DSH 两个桥接只覆盖……」「与 DSH agent loop 紧耦合」两条结论 |
| **C. 全自研**：按研究映射表直接实现翻译器，不带 DSH 代码；两家配置文件原样读入 | 性质兑现方式与 A 完全相同，差别只在 matcher、codec、merge 从零写。「原样读入」**只能作为导入的输入成立**：运行时直接读仓库里的宿主配置即为工作区资产、一律只观察；读宿主机用户目录的配置没有租户持有者（[design.md](design.md#契约动作链与-cordis-投影)） | **与 A 的差别**：少一条 fork 来历与类型剥离，多写约 360 行并自己补齐 A 从测试里白拿的那些边角；长期漂移负担相同。**关键反例**：DSH 测试里编码的边角（尤其 CC 字面匹配与子串、`hookEventName` 不符的处理）靠重读文档再发现一次，漏掉就是静默的匹配偏差。**它在什么时候更好**：A 的区分实验显示 fork 部分大半要改 | 同 A；不依赖 DSH 副本 |
| **D. 只做一次性离线转换器**：把 `hooks.json` 转成本项目的拓展件声明，运行时不保留兼容层 | 声明那一半能兑现 P1、P3 与导入时的明示（P4 的报告部分）；**P2、P4 的运行部分、P6、P7、P10 无从兑现** | **排除**。**反例**：hook 的 handler 是外部程序，**每一次被调到**都要按宿主方言把负载写进 stdin、按退出码与 stdout 解码结论——离线转换只能译声明，译不了调用。想让转出来的拓展件真能跑，就得有一个运行时按方言编解码的通用执行件，那就回到了 A 或 C。即便 CC 的 `prompt`/`agent` handler 也要运行时的求值者，而 Codex 这两种今天解析后跳过。另一面，宿主协议一漂，运行时 I/O 就错、却没有一处可更新。**可取的**：它的导入报告正是 A、C 都必须有的那一半，已并入两者 | 研究「handler 实际可用」「command hook 以宿主用户权限起子进程」「协议都在变」各条 |

## 逐条性质对照（A 与 C 相同处合并）

| 性质 | A / C | B | D |
|---|---|---|---|
| P1 映射以研究 §五为准 | 自写方言表，研究是唯一权威 | 要把 DSH 拦截面上的映射全部改写 | 能（声明层） |
| P2 三动作 + 等人，`allow` 无意见 | 能；改写字段与 `ask`/`defer` 待 G2 | 桥自认缺改写与硬停 | 运行时无人兑现 |
| P3 定档 | 导入时定、运行时裁；依据待 G1 | 同左，但要另写 | 能（声明层） |
| P4 fail-closed 与明示 | 自写 runner，不继承放行方向；分界待 G4 | 继承 DSH runner「永不抛」 | 只能明示，运行时无人兑现 |
| P5 瀑布 | merge（或自写折叠）作组内折叠；排法待 G5 | 桥内串行折叠 | 声明可排序，运行时无人兑现 |
| P6 停住 → 被取消 | merge 已有 `stop`，交协议译 | 桥不执行 | 无 |
| P7 生效参数 | 交协议落条目 | 桥不生效 | 无 |
| P8 执行环境 | runner 走接缝；归属待 G6、G7 | DSH `ctx.shell` | 无 |
| P9 漂移跟进 | 按钉住版本重核本项目的表 | 另加跟 DSH 桥的差 | 漂移后静默失效 |
| P10 只经日志 | 交协议 | 依赖 DSH `hook/*` 与 turn | 无 |

## 推荐与仍待区分的事项

**推荐 A**，边界就是四个无运行时文件加 `HookOutput` 类型；runner、导入、方言映射表、结论交付全部自写，
fork 按 SYS-KERNEL 视作自有模块，**不假设与上游同步**。

**理由**：B 与 D 各被硬反例排除（B 撞 SYS-KERNEL 与位置不对齐，D 译不了每一次调用）。
A 与 C 在性质兑现与长期漂移负担上相同，差别只在起步：A 白拿 361 行与 51 例测试里编码的边角，
C 要从文档重新发现它们。研发品味「满足规格时优先复用成熟实现」在这里成立，**但收益是一次性的、幅度不大**，推荐的把握因此有限。

**会让选择翻向 C 的证据**（最小区分实验）：在钉住副本上完成四处立刻要改的事——matcher 精确集对齐 CC 现行规则、
codec 按方言分支（CC 全退出码读 JSON、坏 JSON 报错不当上下文；PermissionRequest exit 2 两家含义不同）、merge 加 `defer` 档与改写字段、
剥掉 `dsh-session` 类型扩展——然后量四个文件与测试的改动行数。**超过一半**，fork 已是名义，改选 C。
实验归实施计划的第一步，**不阻塞协议设计**。

**会让 B 重新上桌的证据**：本项目决定采用 DSH 的 agent loop 与 tools 拦截面。与 SYS-KERNEL 相抵，现在看不到。

**会让 D 重新上桌的证据**：本项目决定不支持 command handler，只接受可在导入时完全静态翻译的 hook。两家今天都没有这种 handler。

**无论选谁都要另定的**：[design.md 交接缺口 G1–G11](design.md#交接缺口)。其中 G1（定档依据）、G2（`ask`/`defer`）、G4（不可用与报错的分界）、
G7（只观察的 hook 照样执行任意命令）直接决定兼容层能导入什么、导入后是否安全，**应在协议起草前交给各自的 owner**。
