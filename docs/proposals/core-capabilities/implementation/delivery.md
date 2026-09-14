# 当前交付对账

## 当前事实

首批二次开发的目标、验收、实施规格和计划已完成文档交付，其原评审发现已闭合。
P0 的 records/admission 修订稿正在复核，检查器仍有一项隔离问题，见 [review.md](review.md)。用户已授权按完整工作包
自驱实施；P0 的共享接口设计、原生锁探针和包检查器 TDD 已派发。尚无本批已接受
产品交付或 OpenRouter 请求；A01–A32 尚未通过，M1/M2 均未交付。

| 对象 | 已有事实 | 对本批的含义 |
|---|---|---|
| D-005/D-007/D-008 | 运行时/组合/核心契约已接受并登记精确版本 | 是实施约束，不是实现通过证据 |
| D-009 与 `f55e3e0` | 14 个实际职责包及公开消费已落地 | 是二次开发源码起点，不需要重新建单一 baseline 包 |
| `63b4a95` 的布局交付记录 | 对绑定源码的既有构建/源测试/形式与产物消费结果 | 保留原验证范围，不移用为本批新行为 GREEN |
| 本工作包 | 两个交付点、32 项验收及 P0–P5 安排 | 供派发固定版本；新路径都是计划，不表述为现有成员 |

## 实施状态

| 任务 | 状态 | 实现/验收证据 | 下一项输入 |
|---|---|---|---|
| P0 | in_progress | 锁探针已接受；work-data 已开始 TDD；records/admission 修订复核中，检查器 K1/K3 闭合、K2 仍修复 | 共享边界实现、剩余接口修订复核和 HUB 检查器验收 |
| P1 | planned | 未执行 | P0 的记录/协调接口与真实锁证据 |
| P2 | planned | 未执行 | P1 的真实共同门与记录提供者；交付本地预算 owner |
| P3 / M1 | planned | 未执行 | P2 当前权限/真实预算/Session/活体，以及 P1 执行账本前提 |
| P4 | planned | 未执行；用户已指定凭据入口与两个测试模型 | M1 组合、实际路由/价格和受限冒烟配置；离线部分可按依赖提前 |
| P5 / M2 | planned | 未执行 | 最终组合版本及全部本批验收证据 |

P0 的原生文件锁前提已验收，正式 writer/恢复仍未实现；P4 的待答编码路由兼容性、
真实 OpenRouter 环境仍待测量。未验证部分不能被记为通过。

本次已核对现有检查器只允许 baseline/DSH 来源，以及安装默认禁用脚本的事实；
适配已安排到 P0；HUB 的检查器和安装行为仍是实施起点。开发指南、包索引和当前架构
已纠正仍将 fork 建立写作下一步或仅介绍 agent 基线的过时投影。

## 当前执行 wave

HUB 为 `design/dsh-core-adoption`；本 wave 起点 `e11cc69` 已包含当时 main 全部提交。
最初三个 spoke 从该 HUB 起点创建；work-data 在子集固定后从 `9de28b2` 创建。
位置都在主检出根的 `.worktrees/` 下。

| 工作 | 执行者与实际句柄 | 独立工作树 | 写入归属与下一关 |
|---|---|---|---|
| P0 共享接口稿 | `/root/p0_interfaces`，已交修订；复核 `/root/review_first_batch` | `dsh-p0-interfaces` | `199af4c` 已提交 I1–I5 处置，独立复核中；除下述 work-data 子集外尚未接受或合入 HUB |
| P0 真实锁探针（accepted） | infrastructure-developer，`/root/p0_lock_probe`，已结束 | `dsh-p0-lock-probe`，已退役 | `f712e025` 经 `04b8dbf` 整合，HUB 全新目录实际复验通过；范围及限制见下文 |
| P0 包检查器 | verification-developer，`/root/p0_package_checks` | `dsh-p0-package-checks` | `f0defde` 的 K1/K3 独立复核闭合；K2 的 TMPDIR 仓库内反例已返修，尚未接受或合入 HUB |
| P0 work-data 实现 | kernel-developer，`/root/p0_work_data` | `dsh-p0-work-data` | 消费下述已固定子集，独占数据包与专属证据；TDD 实施中 |

未标 accepted 的行只表示派发事实。主调度拥有 HUB 整合、根配置、此工作包和最终
验收；worker 的本地提交、测试绿灯与运行结束均须经端点核验后才能接受。
共享数据契约自身已派发实现；records/admission 消费者尚未派发，不使用兄弟
任务未落定的类型或临时约定启动联合实现。
接口出现正式规格反例时先修设计或发布流程，不放宽验收。
具体反例与处置归[本轮评审](review.md#p0-共享接口实施稿)。当前是可自主修订的
实施输入和检查器缺陷，没有改变 M1/M2 范围，也不需要用户替作者选更弱的保证。

本次采用当前会话实际提供的 native collaboration 角色和句柄。外部 `ccm` CLI
inventory 与配额查询不覆盖该 native 执行面，不能移用其外部 CLI 的准入或额度
结论。调度账本在 HUB 的 `tmp/dsh-first-batch.board.json`，仅经 `ccm` 更新；
native 句柄活性以 collaboration 的实际运行状态为准，持久交付事实以本页及证据为准。
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
同稿的包名/默认公开入口/自有来源元数据只作为该数据包的装配约束；其余
records/admission 内容继续是未接受候选，不能凭此提前实施。

该子集消费 data.agent-runtime-identity/core-work v1，覆盖全部 DTO、真实 Schema
资源、Checked、严格 JSON 解析/拷贝/规范编码。它无 records、admission、Cordis
或业务状态依赖；产品实现、TDD 和独立产物验证仍待交付，不计为 A30/A31 完成。
共享数据作者只拥有 `packages/core/work-data/` 及其专属证据；根安装/锁和 HUB
整合仍由主调度负责。后续 records 作者须消费该包已在 HUB 验证的真实公开产物。

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
