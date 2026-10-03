# 研究

本家族拥有核实事实、版本化观察、推断与局限，**不拥有方案选择**：结论写到「这条事实让什么变得不可能、
什么要额外付出代价」为止，该怎么设计归 [record/proposals](../design/record/proposals/README.md)
与 [record/decisions](../design/record/decisions/README.md)。
每个持续维护的主题是一个子目录信息包，先读其 README，再按当前问题展开。

## 新建或接续主题

- 新主题从本地 [topic 模板包](.templates/topic/README.md) 开始，复制为 `<topic>/`；只带三个必需文件——入口和 `research.md + evidence.md`，模板包里其余的是可选件，按下节的轴触发了再复制。
- 接续已有主题先读该主题入口，保留有效正文、精确来源和实际状态，只补本次缺口。
- 研究问题与来源证据分开；为推进手头一步顺手查的碎片放任务 `tmp/`，不占一个 topic。
- 第二轮核对同一个 topic 时，不要原地覆盖上一轮的说法：按[演进事件词](#演进事件词)记一条，正文才改。

## 准入门槛与停止条件

- **设计者要求做的调查一律落在这里留档**，不要求当场指名消费者：提出调查时就带着未来设计的目的，
  消费者常比研究晚出现——那时回来补「消费者」字段即可，不能因为此刻指不出消费者就不建包。
- 留在任务 `tmp/` 的只有一类：为推进手头某一步顺手查的东西（确认一个 API 名、核对一处拼写），
  本身不构成一个独立的调查问题。
- 落在哪都要给全：精确调查对象与版本、取得方式、实际观察、局限。
  来源不可核实时只记录待验证命题，不能用推断填事实。

命名、裁剪与跨家族引用遵循 [信息包约定](../design/README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。
模板内的相对链接按复制到 `<topic>/` 之后的位置写，在 `.templates/` 原位不解析。

## 最小形态与两条升格轴

一个 topic 的必需文件只有三个：`README.md`（入口与导航）、`research.md`（现在该信什么）、
`evidence.md`（来源与可复核观察）。其余全部按需出现——空的演进记录比没有演进记录更糟，
它会诱人往里塞"首次创建"这类噪音。

三条轴互相独立，各自触发不同的可选件。它们不是一条从小到大的梯子：
首轮的长调查只走篇幅轴，单轮多来源只走来源轴，多轮短调查只走时间轴。

| 轴                                                   | 触发信号                                                                                                                                | 触发后新增                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **时间轴**：这个 topic 被第二次核对了吗              | 第二轮调查开始；或某条结论要正式改变状态                                                                                                | `changelog.md`                                                                                                     |
| **篇幅轴**：这一轮的完整论证，收敛成结论之后还剩什么 | 本轮论证过程比结论本身多得多，或后人需要还原"当时到底看了什么、怎么推的"                                                                | `reports/YYYY-MM-DD-<slug>.md`，**首轮同样适用**——一轮报告在它产生时就该落盘，不等第二轮                           |
| **来源轴**：证据记录多到单文件难以导航               | 证据来自多个需要分别核对的来源，单个 `evidence.md` 已经读不动；或要并列比较多个可独立成包的对象；或有需要脱离原仓库独立复核的字节级证据 | `notes/<来源>.md`（`evidence.md` 退为索引）；`<子主题>/` 各自成完整信息包；原件加 `provenance.json` + `SHA256SUMS` |

升格是现场判断，不在建包时预先规划：第二轮真的发生了再建 `changelog.md`，
证据真的读不动了再拆 `notes/`。一个 topic 永远停在三个文件是正常状态，不是没做完。
但**别把长报告拖到第二轮再补**——收敛成结论的那一刻，原貌就只剩记忆了。

## 演进事件词

`changelog.md` 的每条记录取且只取一个事件词。两问定词：

1. **原结论在它当时依据的对象版本下成立吗？** 不成立 → `推翻`；成立、只是对象换了版本后不再适用 → `版本失效`。
2. **原结论仍成立，这次变化改变了什么？** 补了此前没覆盖的方面 → `补充`；方向不变、细节或边界表述被替换 → `修正`；观察本身没错、曾默认成立的推广不成立 → `收窄`；实际重新核对过、一字未变 → `复核未变`。

| 事件词   | 含义                                                                     | 对 `research.md` 的处理                                 |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| 补充     | 新增此前未覆盖的方面，已有结论的真值不变                                 | 旧结论不动，另起一条                                    |
| 修正     | 方向仍成立，细节、边界或机制表述被替换                                   | 换成新表述；旧表述篇幅值得留档时先入 `reports/` 快照    |
| 收窄     | 原观察没错，但曾默认成立的推广不成立                                     | 加限定语，被排除的范围写进那条记录                      |
| 版本失效 | 原结论在其对象版本下当时成立，对象换版本后不再适用；原结论不算错         | 旧结论标「适用至 {{版本}}」，新结论另起一条             |
| 推翻     | 原结论在当时的对象版本下就不成立——误读来源、漏掉反例、假设未经检验就采信 | 删除该结论；`reports/` 快照（有则）保留原文并标取代状态 |
| 复核未变 | 实际重新核对过（重读源码、重跑探针、复读文档），结论一字未变             | 只刷新「最近核对」，正文不动                            |

`版本失效` 与 `推翻` 这一刀必须守住：前者是世界变了，下游重测即可；后者是当时就看错了，
下游要回头查所有基于它的推理。分不清就回到第一问——能不能具体指出原结论依赖的哪个假设、
哪一步推理在当时就不成立；指不出来就不是推翻。

`复核未变` 值得单记一条：它让「还没人复核过」与「复核过仍成立」可区分，
否则读者只能看日期猜。还没核对过、或来源已不可访问的结论不用事件词表达——
在 `research.md` 那条结论上标「待核实」并写明原因，真正核实之后再按上表记一条。

## 升格为 basis 条目

一条结论讲的是**上游实际提供或不提供什么**，并且开始被多份设计反复依赖时，它的家不再是这里：
[basis/](../design/basis/README.md) 拥有这层读数，失效事件是上游换版本，而不是本次调查的范围。

**什么时候送**——三条都成立才送：

- 读数讲的是上游机制本身，不是本项目的采用选择、候选比较或产品判断；后三者分别归 record 与 product。
- 已经出现第二个独立消费者：本 topic 的「消费者」字段里有两份以上互不隶属的设计，或同一条读数在别的 topic 里被重新推导过一遍。
- 能指出稳定的 `symbols`。给不出 probe 也可以送，但条目按 [basis 准入](../design/basis/README.md#准入)登记为待核对主张，不得单独作为设计依据——这个降级由 basis 拥有，不在这里另立标准。

**怎么送**：

1. 按 [basis 条目模板](../design/basis/.templates/entry/entry.md) 建条目；`version` 与 `checked` 取这条结论「最近核对」的对象版本与日期，不填成升格当天。
2. 条目的证据表只写他人复核的最短路径。原始取证、失败的尝试、被推翻的假设留在本包的 `evidence.md` 与 `reports/` 里，条目引用即可——条目要薄到每次上游升级都值得重跑。
3. 回到 `research.md`，把这条结论改写成一行指向该条目：读数归那里，本处不再是权威。**不要删掉这一行**——删了，后来者会在这个 topic 里把同一条读数重新推导一遍，那正是 basis 要消灭的事。

升格不是结论发生了变化，不占演进事件词，也不记进 `changelog.md`；`research.md` 里那行指针与条目本身就是记录。
送出去之后，这条读数跟着上游版本走，由 basis 的 probe 给信号；本包只有在重新调查同一问题、产生新的研究结论时才继续演进。

## 当前主题

- [PF-021 前置调查：omne-next 的日程与日历](omne-next-schedule-calendar/README.md)：原始诉求、十六份核心需求、后续修正与实现边界；上游 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，取证 2026-09-27，消费者 PF-021。

- [治理中心恢复提供者](governance-recovery-providers/README.md)：Litestream v0.5.17 的同步接口、同机文件副本探针及应用恢复边界；未采用。

### 上游与模型

- [TypeSafe Jev：结构化决策模型的能力与边界](typesafe-jev/README.md) — `jev-1.13.0`，取证 2026-09-19 两轮（主张核查；机制、训练与用途），消费者待出现
- [实时语音通话：能力、链路与证据强度](realtime-voice-calling/README.md) — `gpt-live-1` 与整条语音链路，取证 2026-09-19，消费者待出现

### 方法论与思想体系

- [Robert C. Martin 整洁之道体系的当前版本：代码、架构、敏捷、工艺与 agent 时代言论](clean-code-doctrine-current/README.md) — Clean Code 2e `9780135398579`（样章钉字节）/ blog.cleancoder.com（止于 2023-01）/ X 原帖 2025-03 → 2026-09-30（FixTweet 逐条取回，主会话复核 44 条）/ GitHub `unclebob` 快照 2026-09-30（swarm-forge `f4f5fbca`、negative-test-experiment、uml-viewer）/ 两段视频本地转写；独立批评 28 条、实证 45 条；二十条结论 + 演变表，取证 2026-09-30，消费者待出现

### 评估与优化方法

- [评估设计与爬山优化：哪些做法有独立证据，哪些只是厂商自述](eval-design-and-hillclimbing/README.md) — Anthropic 博客 2026-09-28 版（钉字节）/ `anthropics/skills@8a1541c4` 的 claude-api `build-eval` 与 `hillclimb` 正文，对照学术文献与同行工程实践 42 条（其中 24 条主会话逐句复核）；未运行技能，取证 2026-09-29，消费者待出现

### 同类 harness 横向调研

- [四个 agent harness 怎么设计「会话」](agent-harness-session-design/README.md) — DSH `c291e796` / Claude Code `2.1.278` / Codex `0.154.0` / Pi `3390bd9`，取证 2026-09-20，消费者 PF-015
- [六个 agent harness 怎么做 CLI 与 TUI](agent-harness-cli-tui/README.md) — 上述四家 + Cursor `2026.08.04` 与 Kimi Code `0.31.0`，取证 2026-09-21，消费者待出现
- [debugger 子代理：一方现状、社区做法、失败模式与取证手段](agent-debugger-subagents/README.md) — 八家产品的官方文档与源码（2026-09-22 当日线上版本，未钉 commit）+ 社区 22 条 + 论文与规范 21 条，取证 2026-09-22，消费者为前端调试子代理的角色设计

### 租户领域第二程（2026-09-23）

- [客户端与自托管控制面之间怎样互相确认身份：业界做法](client-center-mutual-trust-practices/README.md) — RFC 6750／8705／9449、kubeconfig、Vault、OpenSSH、Syncthing、PostgreSQL libpq，取证 2026-09-23，消费者 D-029 与 `apps/cli`

### 资产、工具运行时与模型请求运行时一程（2026-09-23 起）

- [资产持有与分层求值的同行先例与反例](asset-holding-and-evaluation-peers/README.md) — DSH `c291e796` / Codex `5c5308f` / omne-next `6263fed` / Claude Code `2.1.280`，取证 2026-09-23，消费者为块 A 的架构读数
- [工具执行运行时的来源：DSH jobs 与 minimal-runtime local-execution](tool-execution-runtime-sources/README.md) — DSH `c291e796` / 本仓库 `feat/minimal-runtime@d79484d`，取证 2026-09-23，消费者为提案「工具运行时基线」（待出现）
- [MCP 客户端的复用：DSH mcp-client 与 Codex rmcp-client](mcp-client-reuse/README.md) — DSH `c291e796`（SDK 锁 1.29.0）/ Codex `5c5308f`（形状参照），取证 2026-09-23；第二轮同日补同行封装的坑与依赖（pi-mcp-adapter、LangChain、OpenAI Agents、Vercel、Claude Agent SDK / Claude Code，另补 Codex `codex-mcp`），消费者为提案[「MCP 客户端采用」](../design/record/proposals/mcp-client-adoption/README.md)
- [Skill 规格的参考来源：omne-next、DSH 与本机 SKILL.md 实例](skill-spec-sources/README.md) — omne-next `6263fed`（含两套校验实测）/ DSH `c291e796` / 本机 Claude Code `2.1.280` 实例；第二轮加 Agent Skills 开放格式原文 `69ef37e`（`sources/` 钉字节，skills-ref 实跑）与 Codex `5c5308f` 扩展盘点，取证 2026-09-23 两轮，消费者为提案「Skill 规格采用」
- [连接件与斜杠命令的形状起点：omne-next 与 DSH](connector-and-slash-command-sources/README.md) — omne-next `6263fed`（多处只有设计无实现）/ DSH `c291e796`，取证 2026-09-23，消费者为提案「Connector 与 Slash Command 形状起点」（待出现）
- [工具定义形状的三源对照：DSH、omne-next 与 minimal-runtime](tool-definition-shape-sources/README.md) — DSH `c291e796` / omne-next `6263fed` / 本仓库 `feat/minimal-runtime@d79484d`，PF-006 §5.3 逐条对照，取证 2026-09-23，消费者为提案「工具定义基线」（待出现）
- [模型请求传输的来源：pi-ai 与 minimal-runtime 的现状](model-request-transport-sources/README.md) — pi `3390bd9`（0.86.1）/ 本仓库钉的 0.85.1 + 补丁 / minimal-runtime `d79484d`，D-019 比较门逐项现状，取证 2026-09-23（离线），消费者为块 C 的架构读数与「模型传输比较门」补记（待出现）
- [Loop 拓展点与两家 hooks 的兼容层：Claude Code、Codex 与 DSH hook-protocol](loop-extension-hooks-compat/README.md) — Claude Code 文档 2026-09-23 抓取（`sources/` 钉字节）+ 本机 `2.1.280` 实例 / Codex `5c5308f` / DSH `c291e796`，两家事件→PF-012 十一位置映射全表，取证 2026-09-23，消费者为提案「hooks 兼容层基线」（待出现）
- [消息数据模型与流协议的起点：DSH llm、DSH 会话格式、pi-ai 与 minimal-runtime](message-model-and-stream-sources/README.md) — DSH `c291e796` / pi `3390bd9` / minimal-runtime `d79484d`，PF-009/010/012/013 条款逐行三源对照（五种判定），取证 2026-09-23，消费者为提案「消息与流基线」（待出现）
- [主流 AI 助手产品里与「连接件」相近的功能：完整产品设计是什么样](connector-products/README.md) — Anthropic（Claude.ai Connectors／Claude Code channels、routines、in Slack／Claude Tag／Cowork）与 OpenAI（ChatGPT connectors／plugins、应用事件触发的 scheduled tasks、API connectors 与 webhooks）2026-09-24 线上文档，参照 Slack Events API／GitHub Webhooks／Zapier／IFTTT 的事件目录与订阅范式；help.openai.com 不可访问只记待验证，取证 2026-09-24，消费者为 PF-002 连接件「事件类型目录与订阅」方向的产品裁决（待出现）
- [斜杠命令的识别与解析：五个来源怎么认、怎么分、怎么留痕](slash-command-parsing-sources/README.md) — Codex `5c5308f`（TUI 取自同 SHA 克隆，未钉字节）/ Claude Code `2.1.280` 文档字节 + 本机实测 / DSH `c291e796` / omne-next `6263fed` / pi `3390bd9`（只作对照），取证 2026-09-23，消费者为提案「斜杠命令识别与解析基线」（待出现）

- [TypeScript 里「可配置重试策略」的现成库：cockatiel、p-retry 与同类](ts-retry-policy-libraries/README.md) — `cockatiel@4.0.0` / `p-retry@8.0.1` / `retry@0.13.1` / `exponential-backoff@3.1.3` / `async-retry@1.3.3` / `ts-retry-promise@0.8.1` / `@lifeomic/attempt@3.1.0` / `promise-retry@2.0.1`，参照 `tenacity@9.1.4` 与 `effect@3.22.2`；tarball 源码钉字节、Node `v24.18.0` 探针实测，取证 2026-09-25，消费者为 D-063 R-6 的落点（MRR 节点 P-5、契约 G-8、W-10b，待出现）

- [收工钩子：Claude Code 与 Codex CLI 在 agent 收工点能做什么、不能做什么](host-stop-hooks/README.md) — Claude Code `2.1.287` 与 Codex CLI `0.159.0` 的钩子文档（原文钉字节，主会话逐句核对了入正文的引文）/ Codex 源码 `rust-v0.159.0`（仅转述）；没有实际注册并触发过钩子，取证 2026-10-01，消费者为[宿主钩子的源](../agents/hooks/README.md)

### 架构判断辅助与 Cordis 集成约定（2026-10-02）

- [哪些方法与工具能辅助架构判断](architecture-judgment-aids/README.md) — 方法文献 97 条（主线抽核 2 篇原文）/ dependency-cruiser 18.5.0、LikeC4 1.59.4 等工具本机试用 / 本仓库主线 `6f3cefa39` 读数（装配边 32 对中 14 对同时是 import 边，更正原始调研稿），取证 2026-10-02，消费者为 #53／#46 合并方案
- [DeepSeek Harness 在 Cordis 之上的集成约定](dsh-cordis-integration-conventions/README.md) — DSH `639ed015`（归档钉字节，约定表 17 行逐行核出处）；本仓库所装 Cordis 4.0.4 即 DSH vendor 的 fork，取证 2026-10-02，消费者为 #53／#46 合并方案的集成约定

迁入前的历史索引见 [`legacy_backup/`](legacy_backup/README.md)，那里是存底，不按本页规则接续。

每个 topic 入口标明调查对象、版本与范围；先沿当前判断进入对应 topic，再按其阅读地图取得证据与局限。

判断方法按需读 `harness-design-handbook` skill 的「设计选择」。
返回 [系统设计链](../design/README.md)。

[Docker 停止与重启](governance-docker-runtime/README.md)：Engine29.1.3/Compose2.40.3的有限机制观察，原始脚本与正负对照归档；不是部署采用或产品验收。

[2026-09-26 core 规格实施一致性观察](core-spec-conformance-2026-09-26/README.md)：固定CB2/SA2的两个反例与静态消费者影响；不接受新版本或实现。

[DSH AgentRegistry 的活引用与生命周期边界](dsh-agent-registry-reference/README.md)：固定官方修订的服务、引用、登记及拆卸读数；不构成 Agent 原语采用。

[图片与空文本段的 OpenRouter 接受性](empty-text-part-acceptance/README.md)：2026-10-02 的 31 路由、97 请求有限观察；完整脱敏请求与离线复核入口已保全，消费者为 D-115 与 pi-ai-transport 窄修复。

[固定Schema编译开销](fixed-schema-compile-cost/README.md)：Ajv8.20/Node24.21原研究及2026-10-03有限探针、26图构造捕获；全路径性能未量。
