# 当前交付对账

## 当前事实

首批二次开发的目标、验收、实施规格和计划已完成文档交付，其原评审发现已闭合。
P0 共享接口、原生锁前提、检查器、work-data 与 records 已经评审、整合和复验，
见 [review.md](review.md)。用户已将本会话终点改为[最小运行基线](runtime-baseline.md)
与相应共享设施，交接后停止；两个共享目标包
已接受，接下来交付 diagnostics 和 P1 真实存储/准入。尚未发起 OpenRouter
请求；A01–A32 尚未完整通过，M1/M2 均未交付。

| 对象 | 已有事实 | 对本批的含义 |
|---|---|---|
| D-005/D-007/D-008 | 运行时/组合/核心契约已接受并登记精确版本 | 是实施约束，不是实现通过证据 |
| D-009 与 `f55e3e0` | 14 个实际职责包及公开消费已落地 | 是二次开发源码起点，不需要重新建单一 baseline 包 |
| `63b4a95` 的布局交付记录 | 对绑定源码的既有构建/源测试/形式与产物消费结果 | 保留原验证范围，不移用为本批新行为 GREEN |
| 本工作包 | 两个交付点、32 项验收及 P0–P5 安排 | 供派发固定版本；work-data/records 已有目标实现，其余新路径仍是计划 |

## 实施状态

| 任务 | 状态 | 实现/验收证据 | 下一项输入 |
|---|---|---|---|
| P0 | accepted | 锁前提、共享接口、检查器、work-data/records；HUB 已验证两个目标包与 16 包产物 | 提供 P1 的真实共享端口/codec 和锁测量依据，尚非真实 writer |
| P1 | in_progress | D1 候选 `3ca93e0`/证据 `5cecf7d` 已合入，HUB 50 项测试通过；后续 `a6ee977` 已闭合未知头和短写测量，write EIO 收口后的目录失败状态仍待修复。真实 writer/准入未实现 | 全部 D1 修复及新目录/锁/关闭故障在同一产物验收后，才并行实现 jsonl/admission |
| P2 | design_accepted | 治理与 AR/SR 施工交接及 `f98ac926` 提供者/应用映射已接受为基线施工输入；产品尚未实施 | P1 的真实共同门与记录提供者；交付本地预算等实际 owner |
| P3 基线 / 完整 M1 | design_accepted / deferred | `0a6e91e` 的 TL/LE 基线共同面及映射已接受；完整 HD 保留后续候选，产品未执行 | P2 当前权限/真实预算/Session/活体及 P1 执行账本产物 |
| 最小运行基线 | in_progress | P0 已接受，P1/P2/P3 的必要产品仍未齐备；基线尚未交付 | 真实 allow 链路、共享诊断/存储/本地预算、必要故障与独立消费，固定提交后停止 |
| P4 | deferred | 未执行；已知凭据入口与两个测试模型保留 | 超出本会话终点，等待用户后续规划 |
| P5 / M2 | deferred | 整批未执行；基线所需故障检查仍必须完成 | 不自动扩展为完整 M1/M2 验收 |

P0 的原生文件锁前提已验收，正式 writer/恢复仍未实现；P4 的待答编码路由兼容性、
真实 OpenRouter 环境仍待测量。未验证部分不能被记为通过。

本次已核对现有检查器只允许 baseline/DSH 来源，以及安装默认禁用脚本的事实；
检查器已在 P0 完成适配，真实 native 产品依赖已由 `ce73873` 接入，独立消费测量
已完成实际加载与共享缓存的判据修复并经 HUB 验收。开发指南、包索引和当前架构
已纠正仍将 fork 建立写作下一步或仅介绍 agent 基线的过时投影。

## 当前执行 wave

HUB 为 `design/dsh-core-adoption`；本 wave 起点 `e11cc69` 已包含当时 main 全部提交。
最初三个 spoke 从该 HUB 起点创建；work-data 在子集固定后从 `9de28b2` 创建。
位置都在主检出根的 `.worktrees/` 下。

| 工作 | 执行者与实际句柄 | 独立工作树 | 写入归属与下一关 |
|---|---|---|---|
| P0 共享接口稿（accepted） | `/root/p0_interfaces` 与独立复核 `/root/review_first_batch`，本任务均已结束 | `dsh-p0-interfaces`，已退役 | `8f4cfa9` 的 I1–I5 闭合，`33f39cb` 整合及 HUB 探针重跑通过，接受为施工输入 |
| P0 真实锁探针（accepted） | infrastructure-developer，`/root/p0_lock_probe`，已结束 | `dsh-p0-lock-probe`，已退役 | `f712e025` 经 `04b8dbf` 整合，HUB 全新目录实际复验通过；范围及限制见下文 |
| P0 包检查器（accepted） | verification-developer，`/root/p0_package_checks`；复核 `/root/review_package_layout`，本任务均已结束 | `dsh-p0-package-checks`，已退役 | `33a57a2` 的 K1–K3 闭合，`d95052c` 整合及 HUB 构建/13 项测试/14 独立与组合产物通过 |
| P0 work-data 实现（accepted） | kernel-developer，`/root/p0_work_data`；定点复核 `/root/review_first_batch`，本任务均已结束 | `dsh-p0-work-data`，已退役 | `18cad69` 经 `6e7f213` 整合，`728d665` 锁定依赖；D1/D2 闭合，HUB 91 项测试与 15 包产物通过 |
| P0 records 实现（accepted） | infrastructure-developer，`/root/p0_records`；独立复核 `/root/review_first_batch`，本任务均已结束 | `dsh-p0-records`，已退役 | `1a237da`/`c67eb4d` 经 `bbb4a3e` 整合、`c1783fd` 锁定；HUB 17 项测试及 16 包产物通过；独有资产与执行输出已保全 |
| diagnostics D1 实现（复核修复中） | infrastructure-developer `/root/diagnostics`；原 architecture-reviewer `/root/review_package_layout` 已完成本轮只读复核 | `dsh-diagnostics`，`5cecf7d` 经 `ff2e7dd` 合入；原作者继续处理新反例 | HUB 构建/类型/50 项测试与 457 份文档检查通过；关闭期间 write EIO、未知来源扫描及短写测量仍未闭合，见[复核](review.md#d1-目录产品的组合复核)，尚未接受 |
| D1 目录所有权修订（accepted） | 作者 `/root/observability_design` 与独立评审 `/root/review_package_layout` 已完成 | `dsh-diagnostics-directory` 已退役，设计迁移 `327735f` 经 `01998d3` 合入 | D-011 采用；HUB 复跑四个机制案例、接口/九份原证据一致；设计验收不抵扣目录产品验收 |
| Agent/Session 施工交接（accepted） | 作者 `/root/session_runtime_design` 与独立复核 `/root/review_package_layout` 本任务已结束 | `dsh-session-runtime-design`，已退役 | `cd16f1` 的 S-R1–S-R4 闭合，`4e67db6` 整合与 HUB 文档/哈希核验通过；装配映射与产品依赖仍须就绪 |
| TS/JS 自动格式化工具（accepted） | verification-developer，`/root/formatting`，已结束 | `dsh-formatting`，已退役 | `99a6988`/`c026140` 已整合，根锁 `d13d66b`；HUB `4a5031d` 的冻结安装和完整 16 包检查通过 |
| 格式化提示词投影（accepted） | `/root/observability_prompts`，本轮负责格式化认知约定，已结束 | `dsh-formatting-prompts`，已退役 | `47c60dd` 经 `635a690` 整合；HUB 五角色生成、408 文档与 12 提示词哈希核对通过 |
| SSE 组件前置测量（accepted） | verification-developer，`/root/p0_sse_probe`，已结束并释放 | `dsh-p0-sse-probe`，已退役 | `b05e57c` 经 `db106159` 整合，HUB 离线正常 12/12、负控仅 S05 失败；[证据与局限](evidence/p0-sse-probe/README.md#hub-复验与当前采用范围)，未发模型请求、不抵扣 A23/A24 |
| 规格与 Cordis 映射的维护交接 | `/root/governance_design` 已按用户新分工停止规则写入，主调度整理交接 | `dsh-mapping-governance`，从 `9954b12` 创建，保留未提交候选 | 规范与配套 skills 由另一会话统一收敛；[交接](../design-spec-maintenance-handoff.md)记录缺口、成因与未接受建议，候选不合入 HUB |
| TL/LE 基线施工交接（design accepted） | 作者 `/root/session_runtime_design` 与定点复核 `/root/review_first_batch` 本轮已结束 | `dsh-tool-decision-design` 已退役，`0a6e91e` 经 `23020cf` 合入 | T-R1/T-R2、reader 与 P2 共同面闭合；HUB 两组新机制逐字一致，基线设计接受见[施工入口](tool-decision-interfaces.md#接受与验证)。完整 HD 保留后续，产品未实现 |
| P2 提供者与装配映射（design accepted） | 作者 `/root/governance_design` 与独立复核 `/root/review_first_batch` 本轮已结束 | `dsh-runtime-provider-design` 已退役，`f98ac926` 经 `8ee3af6` 合入 | 七包及应用正文、原代次/批准历史消歧闭合；HUB 三组原机制与两组相邻机制复验通过，接受见[施工入口](runtime-provider-interfaces.md#接受与验证)；产品未实现 |
| 原生独立消费者测量（accepted） | 原生 verification-developer `/root/native_consumer_checks`，本轮已停写 | `dsh-native-consumer-checks` 已退役，`be9db75` 经 `6f54c75` 合入 | HUB 完整 `pnpm run check`、15 项工具测试（零跳过）、17 包/组合及实际原生加载通过，见[验收](evidence/native-consumer-checks/hub/README.md)；D1 产品仍待接受 |
| P1 提供者映射迁移（accepted） | 复用原生设计作者 `/root/governance_design`，本轮已停写 | `dsh-p1-provider-mapping` 已退役，`2c3aede7` 经 `6d4b87c` 合入，`6d9f47a` 接受 | 18 段正文/13 份原证据与全部迁移文件独立核验，HUB 455 份文档检查通过；已接受方案归属迁移，不是 P1 产品交付 |
| 旧系统租户与授权规则研究（进行中） | 原生 explorer `/root/tenant_auth_research` | `dsh-tenant-auth-research`，从 `ff2e7dd` 创建 | 只读 `omne-next` 固定 `6263fed`，提取语言无关规则、不变量和反例并对照当前设计；研究尚未交付，不自动改变当前契约 |

`e139342` 完成上述提供者设计接受、包/应用导航和 P1 组合测试载体写权安排，
HUB 文档检查 451 份通过。`ce73873` 随后锁定 `fs-ext@2.1.1`/`nan@2.28.0`，
根允许清单只列前者；真实冻结安装、成员原生编译与加载均成功，452 份文档检查
及受影响 manifest 格式检查通过。[原生接入证据](evidence/p1-diagnostics-hub/native-dependency/README.md)
保留先前根 rebuild 空成功/真实加载失败及修正结果。该提交没有合入 R1 产品修复，
不表示 D1 或独立消费者已经验收。

上述三个设计 spoke 的提交均已包含在 HUB，原作者/评审已结束且没有发现运行
进程以这些目录为 cwd。移除前按字节及 SHA-256 保全其独有临时资产至主检出
`tmp/dsh-first-batch-retired/<原工作树名>/`；各自 manifest 保存原路径、提交及
恢复位置，共保留 23/30/6 个文件。正式设计和原证据仍由 Git/HUB 持有，可重建
的 venv/缓存不保留；三个工作树及已合入分支随后按正常 Git 命令退役。历史报告
中的旧目录应通过该清单或固定 Git 对象恢复，不再视为当前可访问工作树。

P1 映射 spoke 随 `6d9f47a` 接受后退役：原生作者已停止，tracked 工作区干净，
ignored 资产仅为可重建 `.venv`/缓存，没有任务临时资产；源码及全部正式证据已
包含在 HUB，再按正常 Git 命令移除工作树及已合入分支。

可观测性工程品味与共享研发提示词已由 `51eaefb` 经 `7d3736c` 整合到 HUB，
五个角色的两端生成检查和文档检查通过，见[提示词证据](evidence/observability-prompts.json)。
提示词 spoke 已退役；其独有验证说明已按哈希保全到 HUB 的
`tmp/retired-worktrees/observability-prompts/verification.md`，其余生成副本与环境可重建。
这只交付认知约定，未交付 log/trace 产品设施。DSH、pi 和 OpenCode 固定源码研究
已完成；`/root/observability_design` 的 `99fc7a3` 经独立复核闭合三项发现，
HUB `9cd78a0` 合入后以新安装目录重跑 12+7 项机制探针。主调度依 D-010 接受
P1 施工输入；正式包已经消费接受后的 records 开始 TDD，完整工程观测查询仍归 P3。其它产品设计会话的
运行基线优先级见下文与[计划](plan.md#推进方式与交付点)。

未标 accepted 的行只表示派发事实。主调度拥有 HUB 整合、根配置、此工作包和最终
验收；worker 的本地提交、测试绿灯与运行结束均须经端点核验后才能接受。
共享数据与 records 目标包已验证；diagnostics 接着消费真实公共面，admission 尚未派发，
不使用兄弟任务未落定的类型或临时约定启动联合实现。
接口出现正式规格反例时先修设计或发布流程，不放宽验收。
具体反例与处置归[本轮评审](review.md)。共享接口、检查器、work-data/records 缺口已经闭合；
原 M1/M2 的行为标准不变；当前会话只交付上述基线子集，不降低其已承诺的保证。

本次采用当前会话实际提供的 native collaboration 角色和句柄。外部 `ccm` CLI
inventory 与配额查询不覆盖该 native 执行面，不能移用其外部 CLI 的准入或额度
结论。派发、联系与查看 agents 优先使用原生 collaboration 工具；调度账本在 HUB
的 `tmp/dsh-first-batch.board.json`，`ccm` 仅承接原生工具没有的持久任务记录，
不替代原生 agent 工具。句柄活性以实际运行状态为准，交付事实以本页及证据为准。

## 主分支指导同步

HUB 已通过 `8c72067` 合入 main `59139bb` 的架构指导、规格维护、计划指导与
独立 spec/plan reviewer 定义。合并时保留本批研发品味、日志与格式化约定，从
合并后的角色源重新生成冲突适配文件；八组角色一致性检查及 430 份 Markdown
检查通过。原始日志在 HUB `tmp/main-59139bb-hub-docs.log`。

`0703f6e` 已将包/app `design.md` 的长期归属、具体装载/撤除责任和按问题选择
评审角色写入推进计划，430 份文档检查通过。当前候选先闭合实际设计反例，再
落入所属正文；本次仅改变指导和派发输入，不把检查通过记为产品实现完成。
P2 的 TG/AU/BG 公共操作/事件/参与者设计已由 `/root/governance_design` 在
`dsh-governance-design` 从 `4253ee0` 交付，三项评审问题经 `058c77c` 修订并独立
复核闭合，HUB `01b7f3f` 整合后重跑 33 项设计示例；主调度接受其施工输入，
范围见下文。治理及 AR/SR spoke 已退役：原十份/九份资产从归档逐项读回核对，
相关作者与评审已结束并释放消费，进程 cwd/exe/fd 无引用；剩余仅可重建环境。
P2 产品仍等待 P1，设计探针不抵扣真实准入或恢复验收。
用户已指定从主检出根 `.env` 的 `OPENROUTER_API_KEY` 直接执行 A22，测试模型为
OpenAI gpt-5.6-terra 与 DeepSeek v4.1-flash。文件仅由测试进程加载，不打开或输出
内容，也不复制到证据、提交或提示词。当前尚未加载密钥或发起计费模型请求。
这份授权覆盖本批必要冒烟；用户未指定数值费用上限，不虚构已确认额度。主调度
在执行前固定合成测试数据、请求次数/输出上限及按实际路由价格计算的预算，
不无限重试或改用其他模型；需要明显扩大测试费用或范围时再返回用户。
已从 OpenRouter 公开页面核对模型标识
[`openai/gpt-5.6-terra`](https://openrouter.ai/openai/gpt-5.6-terra) 和
[`deepseek/deepseek-v4.1-flash`](https://openrouter.ai/deepseek/deepseek-v4.1-flash)。
这只确认公开目录身份，不证明本地凭据可用、具体路由或 A22 工具往返已通过。

## TS/JS 格式化工具交付

共享工具固定为本地 `prettier@3.9.6`，源提交 `99a6988`、作者证据 `c026140`；
根锁由 `d13d66b` 更新，未改变原有依赖版本。作者独立机械提交格式化 102 个
受维护文件；HUB `4a5031d` 再格式化在其基线之后整合的四个 records 文件。
Schema、JSONL 黄金数据、上游原件与 provenance 均不在机械修改范围。

[HUB 证据](evidence/formatting/hub-summary.json)记录冻结安装与 `pnpm check` 实际
通过：共享格式检查、临时 Git 的真实提交 hook、构建/严格类型/包测试、检查器
测试、16 个独立 tarball 与实际组合消费。初次 HUB 格式失败只涉及上述四个新增
records 文件，失败输出与完整复验日志均保留；原作者日志也已核对哈希。
这证明格式工具及本次机械改动的验证范围，不证明 M1/M2 或完整目标能力已实现。

命令与范围归[开发指南](../../../development.md)。agent 只对自己获准修改的文件
执行 `format:write`；提交检查读取 index 并保留部分暂存状态，CI 只检查不改提交。
编辑器配置显式使用工作区本地 Prettier。共享 Git hooks 未安装：当前 main 尚未
包含这些脚本，而 hooks 由全部 worktrees 共用；安装器已在独立 Git 实际验证，
以后从支持该工具的检出显式安装。没有宣称真实编辑器保存或 GitHub 托管 job 已运行。

顶层 AGENTS 和研发共享契约已投影格式化时机与获准文件边界，五角色的十份原生
定义同步生成，证据见[提示词记录](evidence/formatting-prompts.json)及上述 HUB 汇总。
这是提示词与生成一致性检查，不声明正在运行的宿主已经动态加载新正文。

## P2 治理施工输入

主调度接受[治理接口](governance-interfaces.md) 的 `058c77c07ff25e5b93d96b8de1fce63a7a1a2099`
作为 P2 TG-01/02/04/05、AU-01–06、BG-01–04 的实施选择。受审正文 SHA-256
为 `029dac10364e35115465b2ad2c7e1ce21583c5aaee864db19e918349359dd42b`；只更新本工作包
施工输入，不发布新 API 或原地修改正式 v1。创建输入的稳定去重身份、混合已知费用与
剩余预留、币种及预算归集身份三项已闭合，见[评审](review.md#p2-治理施工稿评审)。

[HUB 汇总](evidence/governance-design/hub-summary.json)与原始结果记录了 CPython 3.12.13
运行的 33 项设计示例，包括两个独立子进程的预置结果查询。它们只说明受限输入、
算术及政策示例一致；五项预算身份检查是条件断言，尚未经过实际 changeBudget。
这不是 TG/BG 产品、并发共同门、锁、fsync 或 DR 恢复验证。完整 author 十份资产
已按文件哈希保全，后续实施仍须真实 owner、认证/资源权威与 P1 组合的 TDD。

## P2 Agent/Session 施工输入

主调度接受 `session-runtime-interfaces.md@cd16f1` 的 AR/SR 施工交接范围：
四包职责、唯一激活/驱动、队列与控制、原 acquisition、设置写资格、引用清单、
TL/HD 同批交接及原 Step 接续。独立评审的四项问题已经闭合，HUB `4e67db6`
保持受审正文哈希并通过 411 份 Markdown 检查，九份原始资产已逐项保全，见
[接受证据](evidence/session-runtime-design/README.md)。原稿保留评审时身份。

接受不代表目标 TS API、真实恢复或 R0–R6 已完成；S01–S18 仍待实际产品验证。
用户指出的具体 Cordis service、dependencies、Fiber 所有权与装配映射缺口仍然
存在，先明确其长期维护归属，再按实际能力补齐。该缺口不阻止已经固定输入的
diagnostics 实施，也不能在后续插件消费者派发时被省略。

## P0 work-data 的固定实施输入

主调度接受 `979d80f39f9da11031845f6e2112567299443ed2` 中
`docs/proposals/core-capabilities/implementation/shared-interfaces.md` 的
「共享值、完整 DTO 与 Schema 消费」整节为 work-data 的实施输入。该节正文
（不含二级标题，保留首尾换行）的 SHA-256
为 `147f458a5402394ec3875c0142008f474192296e4e23b495010e8ceeaa0155a9`；
独立评审范围与未决依赖判断见[评审记录](review.md#p0-共享接口实施稿)。
同稿的包名/默认公开入口/自有来源元数据作为该数据包的装配约束。当时单独
固定子集是为了先推进无争议的共享数据；其余接口随后按下一节独立接受。

该子集消费 data.agent-runtime-identity/core-work v1，覆盖全部 DTO、真实 Schema
资源、Checked、严格 JSON 解析/拷贝/规范编码。它无 records、admission、Cordis
或业务状态依赖；其产品实现、TDD 和独立产物验证见下节，不计为完整 A30/A31。
共享数据作者只拥有 `packages/core/work-data/` 及其专属证据；根安装/锁和 HUB
整合仍由主调度负责。后续 records 作者须消费该包已在 HUB 验证的真实公开产物。

## P0 work-data 产品交付

主调度接受作者 `18cad69` 中产品 `eef1ba1` 的 work-data 增量。D1/D2 定点复核闭合，
HUB `6e7f213` 整合、`728d665` 锁定 Ajv 8.20.0 与 jsonc-parser 3.3.1；安装禁用脚本，
未改变原 14 包的依赖版本。[HUB 证据](evidence/p0-work-data/hub-summary.json)保留精确源码、
锁文件哈希与四份原始日志：15 包构建、work-data 类型检查与 91 项测试、15 个独立
tarball 消费及全包组合均通过，两份 Schema 源码/产物与冻结哈希一致。

默认公开入口提供 29 个 DataTypes、严格 JSON、不可变快照与规范编码。文本解析在
递归依赖前检查语法和容量，root-relative 实现深度上限 128 返回 Checked capacity；
copy/freeze/canonical 的迭代实现不受该文本 parser 的递归深度限制。选值依据和
RED/GREEN 归作者证据，不表述为任意 V8 环境的栈容量证明。

这使 records 可以开始消费真实数据包，但尚未实现持久 writer、准入、任何运行闭环
或完整 A30/A31。spoke 的产品和必要验证日志已进入 HUB，作者和 reviewer 均已结束；
确认工作树洁净、无进程 cwd/fd 引用，忽略资产仅为可重建 dist/node_modules 后已退役。

## P0 共享接口施工输入交付

主调度接受[共享接口](shared-interfaces.md)的 `8f4cfa9` 版本作为 P0/P1 施工输入。
HUB `33f39cb` 整合后，使用新依赖目录重跑原 Schema/DTO、声明/受限消费者编译、
内层同步守卫/快照、G01/G10 及九个使用责任机制探针，全部通过。
[设计验证证据](evidence/p0-shared-interfaces/README.md)保全脚本、锁、原始结果与
HUB 实际重跑版本/哈希。正式 Schema 未改；产品 JSON 边界、codec、writer、
准入和真实资源清理仍须按 TDD 实现，不能从设计可行性推导它们已经符合。
该 spoke 的作者和评审者均已结束，确认无驻留进程，17 份独有探针资产逐项校验
后保全于上述正式证据；其余 node_modules、Python 环境与缓存可重建，工作树已退役。

## P0 包检查器交付

主调度接受 `33a57a2` 经 HUB `d95052c` 整合后的 P0 检查职责交付。
[实际结果](evidence/p0-package-checks/hub-summary.json)及原始压缩日志记录：
14 包构建、13/13 测试、14 个独立 tarball 消费和全包组合均通过。自有来源、
多入口、apps 夹具、真实源码依赖与许可、仓库外及全局解析隔离均按固定范围验证。
该检查器交付时的根 workspace 尚无产品 apps 或 work-data 成员；后者随后已按上节
执行实际 15 包产物验证，apps 仍待接入。
原生 fs-ext 选择性构建规则已支持，但当前产品未依赖它，实际 addon 加载仍归 P1。
该 spoke 的作者与评审者已结束，确认无驻留进程；原始证据已进入 HUB，临时目录
为空，其余仅为可重建安装与 Python 缓存，工作树已退役。

## P0 records 产品交付

主调度接受 `1a237da` 与证据 `c67eb4d`，HUB `bbb4a3e` 合入后在 `c1783fd`
只新增 records 锁 importer，没有升级既有依赖。实际通过 16 包构建、records
类型检查和 17 项测试、16 个独立 tarball 及 16 包组合消费，结果归
[HUB 证据](evidence/p0-records/hub-summary.json)。默认入口只提供 DR 端口/实施值
与严格单行 codec；writer、跨行恢复、锁产品接入、授权和准入仍属于后续阶段。

深度 129 的编码/解码不对称已实际 RED/GREEN，并经独立定点复核闭合。原作者
13 份实际 tool 输出及 5 份消费者/产物已保全；初期未提交的 stub 不能精确重建，
不能以摘要冒称完整历史源码。深度回归可从修复前版本加测试 diff 重现。

## P1 观测施工输入

[D-010](../../../decisions/D-010-shared-diagnostics.md) 接受一个 diagnostics 包、
五项精确库依赖、受限日志/trace 面和本地有界输出。jsonl/admission 的 factory
增加必需 Diagnostics 注入；records/work-data 的数据、端口和格式保持不变。
[HUB 证据](evidence/observability-design/README.md)保全 38 份作者资产及实际重跑。
输出时机、低流量刷出、Promise 生命周期三项设计发现已闭合；P1 的 O01–O10
尚未由产品实现验证，P2 桥和 P3 查询保留各自的验证门，不计为 A28 通过。
设计 spoke 已退役：38 份原始资产的路径/哈希与正式归档逐项相同，作者与评审
均已结束，进程 cwd/fd 无引用；剩余只有可重建环境。产品锁尚未安装所选诊断库。

## 供其他设计会话消费的边界

最小节点的具体行为、子场景与交接材料归[运行基线](runtime-baseline.md)，当前
未交付。Agent/Session 施工接口设计提前并行，产品仍按真实共享实现的依赖推进。

用户后续设计依赖最小 Agent/Session/工具闭环，因此优先贯通真实记录与准入、
Agent 活体、Session 输入/Run、工具定义装载及一次受控调用。交接须有真实装配
和固定公开包版本；它是本会话最终交付点。Session/Run/call 的重启认回、已完成
文件效果不重复及未知执行不盲重发，仍是当前硬门；只有超出基线的完整 M1/M2
审批、恢复与模型场景留待新规划。当前尚未取得该可运行闭环，不能宣称 TS 目标 API 已可用。

现在可并行进行语言无关设计，消费已接受的
[Agent 活体](../../../../spec/capabilities/live-agent/v1/contract.md)、
[Session/Run](../../../../spec/capabilities/session-run/v1/contract.md)、
[工具生命周期](../../../../spec/capabilities/tools/v1/contract.md)及其精确
数据依赖；接受身份以[catalog](../../../../spec/catalog.json)为准。
共享接口只固定 P0/P1 的实施边界，不代替尚未交付的能力包公开 API。
其他会话遇到语义反例应回传设计和规格所有者，不以 fork 的 baseline 行为反推产品契约。

## P0 原生锁前提交付

已接受 `f712e025ab724bfa0f846be83029430f41350279` 的探针交付；HUB 整合版本
`04b8dbf5f3490b2cd17435b8ebf5a0b9fbe0e0ae` 使用自身全新安装目录重跑同一
SHA-256 的脚本，[实际复验记录](evidence/p0-lock-probe/hub-summary.json)保存
源码版本、命令、构建、具体进程/inode、四类锁场景、七处同步和精确记录往返；
受管子进程最终为 0。六份编译器归档均与[固定哈希](evidence/p0-lock-probe/toolchain.json)
一致，工具链仅解包到任务 tmp，未修改宿主系统。

实际采用输入与限制归[探针说明](evidence/p0-lock-probe/README.md)：
`fs-ext@2.1.1`、Node `v24.18.0`、pnpm `10.28.1`、Linux/ext4；默认 g++ 9.4
真实失败，GCC 10.5 成功。依赖脚本默认禁用后只显式构建 fs-ext，并实际加载 addon。
本结果只接受 P0 可行性前提，不将 probe-only JSON 行改称 `core-journal/1`，
也不接受 A06/A07/A30/A31 的完整产品符合性或断电保证。

该整合后的 `make docs-check BASELINE=e11cc69` 通过 393 个 Markdown，
`git diff --check` 通过；根产品配置/锁文件、发布规格与需求未修改。
原生编译器与产品安装步骤在 P1 接入实际依赖时再更新开发入口。

锁探针 spoke 在确认执行者已结束、无存活探针进程且没有消费者后退役。
其必要临时资产保全在 HUB 的 `tmp/retired-worktrees/dsh-p0-lock-probe-assets.tar`，
SHA-256 为 `9964a2007769621ca6abf3547ed795269658ebbaebba8edb2841cb2fe68b9f3c`；
退役前 `tar --compare` 逐项核对通过。被排除的依赖缓存、构建输出与临时 Python
环境可重建，GCC 解包根已有 HUB 独立副本。正式证据仍在本工作包内，旧日志的
spoke 路径保留为原运行身份，不再表示该工作树仍存在。

## 设计文档交付证据

设计修订 `4e63b54` 经首轮评审；`f6df75b` 处理预算依赖、单次工具读控和实际
授权/设置管理验收；`00f7fb7` 消除设置有效值与未知停止结果的两处歧义。
最终独立只读复核确认这些发现已闭合；随后只更新评审/交付状态与验证记录。

[检查记录](evidence/checks.json)保存文档检查、32 个验收身份核对、需求基线
比较、产品/工具/配置/冻结输入未改的检查及所覆盖文档哈希。它只支持本次文档
交付，不支持尚未执行的 A01–A32 或真实提供者保证。

## 维护方式

每次交付在本页更新当前状态，链接对应源码/规格/测试与[计划要求的文档对账](plan.md#每次交付的文档对账)。
历史交付证据按其原修订保存；这里指向最近适用证据，不复制日志或维护第二份验收清单。
任务状态、单项验收和里程碑接受分别判断；未决/未知保留责任，不能被“已合入”覆盖。
