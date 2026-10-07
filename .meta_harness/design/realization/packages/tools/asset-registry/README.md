# asset-registry

## 工作区接入的适用范围

新增工作区来源的承接位置仍是 design.md 的 A-2 输入读面缺口。现有 v2 S-23 的候选校验／提交失败不换表及 S-24② 的“工作区沿用上次装配或 reload 内容”已符合本轮规则；不能把 A-2 的“现取”实现成每次尝试重读工作区文件。输入模型变更后再复核精确依赖与组装，当前不重做 reload 协议。

依据：[现行 reload 契约及输入边界](../../../../spec/capabilities/asset-registry/README.md)。

## v3 候选增量（2026-09-27）

- 路径仍为 `packages/tools/asset-registry`；**尚未建包**。新增 [v3-design.md](v3-design.md)，旧已接受 design.md 不改。
- 契约坐标：`(omne-harness-lite-design-2026-09-15, capability.asset-registry, 3)`，catalog candidate；显式采用 AE4、manifest3，并消费同一实际版本的根正文来源。

| 分层状态 | 本版事实 |
| --- | --- |
| 语义接受 | 无本版接受；v2 已接受事实保持原范围，本候选待独立评审 |
| 可实施范围 | AR3-1～AR3-7 已列投影；S-16/S-23/S-24/S-31/S-50 的已确认 C16 根失配映射已投影，普通二次读不到分支保留。AR3-G2 真实现读、AR3-G3 固定根读取面/选版构件与失败原因交接仍待对应 owner 实现和验证；其他缺口见增量设计 |
| 绑定与证据 | **0 条绑定**；没有本版实现测试。新增 VE-1～VE-13 与原 S-36～S-47/N-1～N-10 并存，不用候选结构自检提升证据 |
| 实际验证 | **尚无产品验证**。没有真实 registry/manifest/输入源组合、并发、日志顺序或重启验收 |

本版区分每表历史 E1、最近已提交 E2 和实时输入；reuse 保留 E1/O1。SQL 清单与会话 JSONL 分别提交，失败先落日志再收窄表。lookup/list 按类别及 within 分支读取，运行内技能不重判、工具不偷偷换成新正文。详见 [增量设计](v3-design.md)与 [验证义务](verification.md#v3-候选增量)。

## v2 已接受设计与历史状态

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.asset-registry · v2`（[契约](../../../../spec/capabilities/asset-registry/v2/contract.md)，状态 `accepted`，已接受、已冻结；设计依据 PF-002 rev 20、PF-006 rev 19、PF-004 rev 12）
- 源码位置：`packages/tools/asset-registry`——**尚未建包**。第一层 `tools` 由 D-059 拍板（tools 取候选 C，注册表归 `tools`）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是四个纯函数（`buildSnapshots`、`computeAvailability`、`buildReport`、`findInSnapshot`，候选名）；**Cordis 服务面** `assetRegistry` 组合它们并承担换表串行、先记清单再生效、报告所依快照的留存——这几条函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber，必需 inject 装配清单与时钟，不 inject 存储**（它没有自己的表：[S-18](../../../../spec/capabilities/asset-registry/v2/contract.md#s-18-快照不持久装配清单是唯一权威)「快照不持久，装配清单是唯一权威」）。
  求值与资产形状**纯 import**（D-059 assets 取候选 B：`core/asset-evaluation`、`core/asset-model` 是纯模块），不 inject；asset-model 判定对象所用的正文端口也只取 `core/asset-evaluation` 导出的 `defaultBodyContracts`、不自组（D-060 §八 M51）——这取代了 capability-split-tools 草图里「inject 资产求值」那一格。
  据点读面（求值输入、版本正文、会话事实）、MCP 桥、模态转换登记、提供者自报都是**调用时现取的可选依赖**，缺席按契约 [S-32](../../../../spec/capabilities/asset-registry/v2/contract.md#s-32-依赖的提供者不可用) 收场

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**设计已接受**（2026-09-26，D-062；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：本节点声称兑现的条款逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)：S-5～S-34 的全部操作与规矩。**尚未建包、没有一行源码**。
  **整个节点受阻于装配清单的提供者**：契约的每个换表操作以「记进装配清单」为提交点；装配清单 2026-09-25 起**接口已定**（`capability.assembly-manifest` v2，R-M1～R-M9 逐条对到它的条款），真承接者 PF-004 未到（契约 G-1），最小提供者节点 [`assembly-manifest-store`](../../assets/assembly-manifest-store/README.md) 已立（accepted、尚未建包）——本节点必需 inject 它，所以**在最小提供者装上之前本插件停在 `PENDING`，服务不出现**。
  2026-09-25 修订波（公开面，D-063）：design 新开「公开面」一节（建快照、算可用性、组报告、在给定快照里找——四个纯函数公开，服务面组合它们）；装配清单改指接口契约的条款；`EvaluationRef` 的权威归 `capability.assembly-manifest/v2#S-8`（N-37 ③）。处置见 [verification](verification.md#修订波2026-09-25-公开面)。
  另受阻：据点读面（求值输入、版本正文、会话事实）**没有 provider 节点**（缺口 A-2，归装配）；提供者自报与「有效模型」没有读面（契约 G-6），本批凡声明了这些项的工具与技能一律是替换件。装配清单与据点读面按 D-060 §八 M43 本程不补。
  2026-09-25 随契约修复波 3 对齐：`fill` 的过时重试答 `invalidInput{evaluationSuperseded}`（M34，原 A-5 闭合）；`within = run{report}` 只在报告所依的快照里找（M35，原 A-6 闭合），由此带来的留存义务以装配清单的历史换表记录承接（design 关键选择四、R-M9）；报告带 `attempt`（M46）；求值的 `compositionCycle`／`categoryUnsupported` 原样转交（M32、M45）；MCP 动作的 `stand_in{for: schema_unsupported}`（M37）；原 A-7 随 M33 闭合。受阻项在 [verification](verification.md#覆盖缺口) 登记。
  同日独立评审（N3）之后：正文端口只用 `core/asset-evaluation` 的 `defaultBodyContracts`（M51）；两处无测量的取舍排进 G5 放行后第一轮测量（A-8，AR-1）。处置逐条见 [verification 的独立评审](verification.md)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约本版不建形式工件（[S-35](../../../../spec/capabilities/asset-registry/v2/contract.md#s-35-本版选用哪些形式工件)：性质被建模方式吸收），没有可绑的 formal task；十二条规范场景与本节点自己的交错演练**一条都没有**
- 实际验证：**尚无**。没有源码、没有测试、没有集成运行

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 插件边界、为什么不 inject 存储、缓存怎样对着装配清单校验、换表怎样串行、装卸配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，获准采用的终态写回当前承诺拥有者；比较与接受过程留本工作树 tmp。

## 2026-09-27 本轮技术采用

D-074采用本轮增量设计；精确输入哈希另记，候选历史读数保留原字节。实际源码、符合性与组合证据另核，旧绑定不重标。

## v4 完整增量候选（2026-09-27）

新增 [v4-design.md](v4-design.md)，完整接续七操作与 AR4 S-51/S-52 的来源认回，旧设计、来源缺口稿及 bindings 保留原字节。节点仍为 `packages/tools/asset-registry`，尚未建包。

| 分层状态 | 本增量事实 |
| --- | --- |
| 语义接受 | D-079 已接受 AR4/MF4 和 MF4 provider；本节点 v4-design **candidate，未采用**，不借上游接受提升 |
| 可实施范围 | AR4-1～7 对应完整七操作、readHead(H)→readGiven(H)→完整 fill 用途核验→真实 STT/EIS 固定正文、reload CAS 全套重取及 refresh 固定 H。AR4-G3 所需受限历史正文端口待 source owner 增量设计/采用，旧报告及已不持有旧表正文的成功恢复仍是本批必交目标 |
| 绑定与证据 | **0 新绑定**，bindings.yaml 不改；[V4-1～15](verification.md#v4-完整增量的证据义务) 是未执行义务。MF3/EIS 各自组件通过不代证 AR4 来源认回/重开/并发链 |
| 实际验证 | 尚无本节点产品验证；静态文档检查只核文档结构，独立架构评审与采用归主线 |

原 OF-G1/2 的公共定位与观察范围已由 AR4/MF4 接受条款回答；其实现证据和 D-077 SI-G1 仍待真实组合关闭。来源/正文缺失应正确 unavailable，但不能用该拒绝路径替代本批成功恢复验收。新稿不建立来源旁表、不新增报告 head、不把 MF/EIS/JSONL 称为共同事务。

## 2026-09-27 历史读取增量技术采用

D-080精确采用本增量；上方候选状态保留该次成稿事实。源码与适用验证义务继续独立落实，真实成功恢复尚未验收，新增绑定0。

## 2026-10-03 Schema构造与消费补充

D-116技术采用：AM声明/manifest复用绑定owner，作者临时编译保持；AE发布捕获深冻结生产Schema，AE/evaluation-input-store/asset-registry三个默认owner首用构造分后续PR；MRR的固定图缺陷归相应MS/MR/CA构建失败，缺产物首次实际消费原抛。仅各自相关条款适用；本机制实施/验证尚待，不改变契约和原历史run。

## 2026-10-03 D-116 主体实施与有限验收

本包作为主体的受影响消费者已完成验证；默认判定器首次使用构造仍归后续 PR，本次未交付。实际源码坐标、输入复用及验证边界见主体原始运行与有限签收。本段仅更新以上已交付范围，不提升历史未验能力或后续默认装配的状态。


## 2026-10-03 D-116 默认 owner 实施与有限验收

三个默认判定owner均已改为首次实际使用时构造，成功后复用、失败原抛且可重试。AE发布五份深冻结生产Schema并捕获职责函数，三个消费者共享这份发布快照。显式工厂和作者临时编译保持。独立L2六标准、真实src/dist与SQLite业务基线对拍通过；九处旧身份断言按已接受复制边界迁移。实际运行与有限签收保留原失败、MRR一次未定因观察和验证范围，不提升本节点其他历史未验能力的状态。
