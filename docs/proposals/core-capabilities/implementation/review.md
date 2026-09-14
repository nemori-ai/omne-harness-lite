# 首批工作包评审

评审对象为本目录的目标、验收、实施规格、计划和事实状态。独立评审检查本批
是否能按实际依赖开工、已开放路径是否完整兑现现有契约，以及真实提供者/TDD/
文档对账是否有可判断结果；不把未实施或后续批次自动算作设计缺陷。

## 首轮评审与处置

architecture-reviewer 独立只读检查修订
`4e63b547d02fc350dc146be12751c76e023b3bce` 相对 `570000a` 的六份工作包及相关导航；
依据原需求消费范围、D-005/D-007/D-008/D-009 和精确 v1。受审 HUB 已包含 main。
评审没有运行测试、探针或形式工具，没有改文件或接受设计。

| 发现 | 依据与触发后果 | 本轮处置 |
|---|---|---|
| R1：M1 缺少真实预算参与者，阻断 | P3 要按 TL-07/BG-03 联合预算准入，但 owner 原安排在 P4；首个批准工具可能只能绕过或用替身 | BG-01–04 最小真实 owner 前移 P2；M1 执行 A26 本地子场景；文件夹具明确零直接计费依据，P4 只接入模型价格/计量 |
| R2：单次调用观察/停止未落到应用与验收 | PF-003.C1–C3、TL-09/12 已纳入；应用仅列 Run 控制，可能只能停整个 Run | M1 应用列出 call/list/get/inspect/帧订阅/精确 stop；A16 验证双调用只停其一及终态竞争，A20 验证真实读面/订阅/撤权 |
| R3：持久授权和设置管理缺少直接验收 | AU-01/02 与 PF-006 已开放，但预置 grant/模式即可通过原 A03/A11 | A03 实际 grant/amend/revoke、授予边界和重启；A11 实际 set/clear/readEffective、来源回落、冲突和生效边界；相关 TG 定义/权益管理也加入 A02/A03 |

共同准入的位置/水位、一次决定、墓碑、独立接续和 deferred receipt 的文字映射，
首轮未发现与正式 v1 的直接冲突。第二、三项是设计交付缺口，不是尚未编写的
实现错误。评审没有提出必须代选的新产品政策，也没有要求扩展到排除的完整功能。

作者另据 `tools/package-checks/src/check.mjs`、`pnpm-workspace.yaml` 与根
package.json 核对：当前检查器限制 baseline/DSH 来源，安装禁用脚本、build
未聚合 apps。这些实施障碍已安排在 P0/应用接入时处理并保留检查强度；本次
没有修改检查器或安装环境。文件锁的 advisory 信任前提已显式说明。

## 修订复核

同一独立评审者核对 `f6df75bbd950d58bfe109c9e4a92876998debfc8` 相对首轮修订，
确认 R1–R3 的原缺口均已闭合，检查器/原生依赖适配前移未引入明显新矛盾。
复核提出两个局部消歧：保存覆盖与有效值不能要求相等；unknown 调用不能一概
等同于强停 Run 必须一直 stopping。

作者在 `00f7fb7369ccb51d4929d0a8cfb477ea1cde203b` 明确二者分别恢复/重新求值，
并把 stopping 条件限定为 force_stop 后无法证明安全停止/隔离的 Run。
评审者再次只读核对该微小 diff，确认两处已闭合，**本次范围内无剩余阻断发现**。

这次复核仍未运行检查、探针或形式工具，没有接受设计或实现。原生锁、路由
兼容性和真实模型环境保持未验证；A01–A32 保持待实施，既有 Cordis API 映射
本轮没有重新核验。文档实际检查由作者执行，证据归[交付对账](delivery.md)。

## P0 共享接口实施稿

独立 architecture-reviewer `/root/review_first_batch` 评审
`979d80f39f9da11031845f6e2112567299443ed2` 的 `shared-interfaces.md`，比较
`e11cc69`。稿件在 `impl/dsh-p0-interfaces`，尚未接受或进入 HUB；范围限
work-data/records/admission 的共同输入及 data/DR/CC v1、A05–08/A30/A31。
下列问题均已发回作者修订，依赖未决 records/admission 接口的产品实施尚未放行。

| ID | 必须修订的缺口与反例 | 状态 |
|---|---|---|
| I1 | publications/uses 未与 opaque commit 的记录 owner 形成完整、去重且不可变的对应；提交后修改列表或漏预算 publication，可能 committed 后提前 ready | `199af4c` 修订复核中 |
| I2 | thenable 检查仅在外层 enter；内部 publishLogical/publishDurable/retainAt 的 void 返回可忽略 async，导致发布未完成就放行 | `199af4c` 修订复核中 |
| I3 | conflict/rejected 的原操作结果绑定、耐久保存与 lookup/restart 没定义；首次 revision 冲突后同输入重试可能变成功，违反 DR-02 | `199af4c` 修订复核中 |
| I4 | 业务不可持完整 writer，却只有 writer 暴露 prepareOperation/prepare；缺乏真实、受限的准备端口 | `199af4c` 修订复核中 |
| I5 | acquire 已持锁后恢复/epoch 同步失败且 release 失败，无残留清理 owner/状态/重试出口 | `199af4c` 修订复核中 |

共享身份/Schema、规范输入比较、双视图、普通撤权顺序及单 journal epoch/连续
前缀恢复主方案未发现直接冲突。评审没有运行复现、测试或形式工具，不把设计
反例表述为未编写实现的已发生缺陷。修订可以简化接口，不要求通用状态中心。
作者须固定修订与实际探针结果后，由同一评审者复核处置。

同一评审者进一步确认 `979d80f` 第 56–234 行的 work-data 子集已在其评审范围内，
未发现剩余阻断，也不依赖 I1–I5 的最终决定。作者实际逐字核对当前修订的
「共享值、完整 DTO 与 Schema 消费」整节与该版本相同。主调度据此单独固定
该子集为实施输入；数据包的真实 Schema/JSON/类型/产物检查仍待实施验收。
这不接受 records/admission 稿件，也不放行它们的消费者。

## P0 包检查器实施复核

独立 architecture-reviewer `/root/review_package_layout` 只读核对 `effd764`
（实现 `2000c27`）相对 `e11cc69` 的检查器、测试与证据，范围限 A30/A31 的
P0 检查职责。该分支尚未进入 HUB，也未因 worker 的绿色结果获接受。

| ID | 已确认问题 | 状态 |
|---|---|---|
| K1 | 同一成员多个 exports 使用重复 import binding；默认入口与 baseline 共存会 strict tsc 失败，原真实夹具只覆盖单入口 | `f0defde` 每入口唯一 binding、真实 TS2300 RED/GREEN 经独立复核闭合 |
| K2 | consumer 移入 repo/tmp 后，Node/tsc 可沿祖先 node_modules 借到仓库依赖；ignore-workspace 与根包 realpath 检查不提供仓库外隔离 | `f0defde` 默认 OS 临时目录仍受 TMPDIR 覆盖；仓库内 TMPDIR 反例及真正触达污染行为的 RED 已返修 |
| K3 | 这批固定 DSH 来源的 manifest.license 可改为与已核对 MIT 原件不一致的声明而通过 | `f0defde` 的 MIT 一致性修复及反例经独立复核闭合 |

该次复核已解压原始证据，确认三项声明哈希、format-patch 与 `0587fa2` 的 diff
一致，日志支持 12/12 及 14 个独立与组合消费者成功。K2 的旧 RED 停在缺少
createArtifactScratch 函数，未测到祖先污染；绿色默认环境也不能覆盖被检仓库
内 TMPDIR。作者须针对该已有入口补足实际路径保证和有效反例，不能以换路径
名称代替隔离。上述证据核对没有运行测试或接受实现。

新自有包默认 private/UNLICENSED；按实际许可声明支持其它来源不属于本轮缺陷，
检查器也不授予新许可。原生选择性构建路径的 fixture 通过不代表未来产品 native
依赖已实际加载，仍须在根依赖接入后运行完整隔离消费。整合者在修订复核后再
执行 HUB 验证并接受相应 P0 范围，不移用为全部 A30/A31 已完成。
