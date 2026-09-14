# 首批实施选择与固定交付记录

本页保留各次接受的对象、依据、范围与原证据，供当前提供者设计和消费者追溯。
各节的实现/未验证陈述绑定该节所列提交，不作为滚动进度；当前产品覆盖归
[核心架构](../../../architecture/core-capabilities.md)，当前接口归成员设计。
任务状态、wave、agent 句柄、工作树退役和后续调度不由本页维护。

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

当前命令与范围归[开发指南](../../../development.md)。该次验证包含临时 Git 的
真实 hook 和部分暂存保护，没有宣称真实编辑器保存或 GitHub 托管 job 已运行。

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

该次接受不代表目标 TS API、真实恢复或 R0–R6 已完成；S01–S18 仍须实际产品验证。
后续 `f98ac926` 的提供者/装配映射已按[接受记录](runtime-provider-interfaces.md#接受与验证)
闭合该次尚缺的 Cordis 映射；当前正文沿[应用设计](../../../../apps/local-harness/design.md)进入。

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

该次交付使 records 可以消费真实数据包，未覆盖持久 writer、准入、运行闭环或完整 A30/A31。

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
该检查器交付时的根 workspace 尚无产品 apps 或 work-data 成员；后者随后按上节
完成实际产物验证。原生加载的后续测量见[独立消费者证据](evidence/native-consumer-checks/hub/README.md)。

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

## 设计文档交付证据

设计修订 `4e63b54` 经首轮评审；`f6df75b` 处理预算依赖、单次工具读控和实际
授权/设置管理验收；`00f7fb7` 消除设置有效值与未知停止结果的两处歧义。
最终独立只读复核确认这些发现已闭合；随后只更新评审/交付状态与验证记录。

[检查记录](evidence/checks.json)保存文档检查、32 个验收身份核对、需求基线
比较、产品/工具/配置/冻结输入未改的检查及所覆盖文档哈希。它只支持本次文档
交付，不支持尚未执行的 A01–A32 或真实提供者保证。
