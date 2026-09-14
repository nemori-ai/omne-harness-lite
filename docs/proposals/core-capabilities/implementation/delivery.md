# 当前交付对账

## 当前事实

首批二次开发的目标、验收、实施规格和计划已完成文档交付，其原评审发现已闭合。
P0 共享接口、原生锁前提、检查器、work-data 与 records 已经评审、整合和复验，
见 [review.md](review.md)。用户已授权按完整工作包自驱实施；两个共享目标包
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
| P1 | planned | 观测设施 D-010 施工输入已接受，产品未实现 | P0 真实 records 与 diagnostics D1 交付，再并行实现 jsonl/admission |
| P2 | planned | 未执行 | P1 的真实共同门与记录提供者；交付本地预算 owner |
| P3 / M1 | planned | 未执行 | P2 当前权限/真实预算/Session/活体，以及 P1 执行账本前提 |
| P4 | planned | 未执行；用户已指定凭据入口与两个测试模型 | M1 组合、实际路由/价格和受限冒烟配置；离线部分可按依赖提前 |
| P5 / M2 | planned | 未执行 | 最终组合版本及全部本批验收证据 |

P0 的原生文件锁前提已验收，正式 writer/恢复仍未实现；P4 的待答编码路由兼容性、
真实 OpenRouter 环境仍待测量。未验证部分不能被记为通过。

本次已核对现有检查器只允许 baseline/DSH 来源，以及安装默认禁用脚本的事实；
检查器已在 P0 完成适配，真实 native 产品依赖尚未接入。开发指南、包索引和当前架构
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
| P0 records 实现（accepted） | infrastructure-developer，`/root/p0_records`；独立复核 `/root/review_first_batch`，本任务均已结束 | `dsh-p0-records`，待资产核对后退役 | `1a237da`/`c67eb4d` 经 `bbb4a3e` 整合、`c1783fd` 锁定；HUB 17 项测试及 16 包产物通过 |
| Agent/Session 施工接口设计 | `/root/session_runtime_design` | `dsh-session-runtime-design`，从 `de39a86` 创建 | 只写 AR/SR 施工稿与探针；独立评审后固定，产品依赖仍须真实就绪 |
| TS/JS 自动格式化 | verification-developer，`/root/formatting` | `dsh-formatting`，从 `de39a86` 创建 | 共享 Prettier 配置/命令、编辑/提交/CI 接入与机械格式；根锁由 HUB 更新 |

可观测性工程品味与共享研发提示词已由 `51eaefb` 经 `7d3736c` 整合到 HUB，
五个角色的两端生成检查和文档检查通过，见[提示词证据](evidence/observability-prompts.json)。
提示词 spoke 已退役；其独有验证说明已按哈希保全到 HUB 的
`tmp/retired-worktrees/observability-prompts/verification.md`，其余生成副本与环境可重建。
这只交付认知约定，未交付 log/trace 产品设施。DSH、pi 和 OpenCode 固定源码研究
已完成；`/root/observability_design` 的 `99fc7a3` 经独立复核闭合三项发现，
HUB `9cd78a0` 合入后以新安装目录重跑 12+7 项机制探针。主调度依 D-010 接受
P1 施工输入；正式包仍等待 records 后按 TDD 实现，完整工程观测查询仍归 P3。其它产品设计会话的
运行基线优先级见下文与[计划](plan.md#推进方式与交付点)。

未标 accepted 的行只表示派发事实。主调度拥有 HUB 整合、根配置、此工作包和最终
验收；worker 的本地提交、测试绿灯与运行结束均须经端点核验后才能接受。
共享数据与 records 目标包已验证；diagnostics 接着消费真实公共面，admission 尚未派发，
不使用兄弟任务未落定的类型或临时约定启动联合实现。
接口出现正式规格反例时先修设计或发布流程，不放宽验收。
具体反例与处置归[本轮评审](review.md)。共享接口、检查器、work-data/records 缺口已经闭合；
没有改变 M1/M2 范围，也不需要更弱的保证。

本次采用当前会话实际提供的 native collaboration 角色和句柄。外部 `ccm` CLI
inventory 与配额查询不覆盖该 native 执行面，不能移用其外部 CLI 的准入或额度
结论。调度账本在 HUB 的 `tmp/dsh-first-batch.board.json`，仅经 `ccm` 更新；
native 句柄活性以 collaboration 的实际运行状态为准，持久交付事实以本页及证据为准。
P2 的 TG/AU/BG 公共操作/事件/参与者设计已由 `/root/governance_design` 在
`dsh-governance-design` 从 `4253ee0` 交付候选 `8b75f30`，正在独立评审；P2 产品
仍等待 P1；创建幂等、混合预算预留与币种门三项评审问题已由 `058c77c` 修订，待复核。
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
和固定公开包版本；它是 M1 内的中间交付点，不省略 M1/M2 的后续审批、恢复与
模型验收。当前尚未取得该可运行闭环，不能宣称 TS 目标 API 已可用。

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
