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
`e11cc69`。初审稿件位于 `impl/dsh-p0-interfaces`，当时尚未接受或进入 HUB；范围限
work-data/records/admission 的共同输入及 data/DR/CC v1、A05–08/A30/A31。
下列问题均已发回作者修订，依赖未决 records/admission 接口的产品实施尚未放行。

| ID | 必须修订的缺口与反例 | 状态 |
|---|---|---|
| I1 | publications/uses 未与 opaque commit 的记录 owner 形成完整、去重且不可变的对应；提交后修改列表或漏预算 publication，可能 committed 后提前 ready | `8f4cfa9` 的集合/快照/真实性及 ExactUse 单次交接、释放失效已闭合 |
| I2 | thenable 检查仅在外层 enter；内部 publishLogical/publishDurable/retainAt 的 void 返回可忽略 async，导致发布未完成就放行 | `199af4c` 文档层面闭合 |
| I3 | conflict/rejected 的原操作结果绑定、耐久保存与 lookup/restart 没定义；首次 revision 冲突后同输入重试可能变成功，违反 DR-02 | `199af4c` 文档层面闭合 |
| I4 | 业务不可持完整 writer，却只有 writer 暴露 prepareOperation/prepare；缺乏真实、受限的准备端口 | `199af4c` 文档层面闭合 |
| I5 | acquire 已持锁后恢复/epoch 同步失败且 release 失败，无残留清理 owner/状态/重试出口 | `199af4c` 文档层面闭合 |

共享身份/Schema、规范输入比较、双视图、普通撤权顺序及单 journal epoch/连续
前缀恢复主方案未发现直接冲突。评审没有运行复现、测试或形式工具，不把设计
反例表述为未编写实现的已发生缺陷。修订可以简化接口，不要求通用状态中心。
作者须固定修订与实际探针结果后，由同一评审者复核处置。

对 `199af4c` 的定点复核剩余反例：原票据尚未耐久时重复 submit，不能用
not_admitted 释放原票据已经持有的 pin；不同 operation 不能共同占用同一次
取得的 ExactUse，已释放句柄也不能再提交。作者须补最小 claim/release 生命周期，
区分本次新取得的临时使用和已经移交的原责任。I2–I5 的闭合只指设计表达；
评审者未执行测试，真实 writer/发布/清理保证仍待产品实现验证。
作者已提交 `8f4cfa9`，在私有表明确单次 claim、原票据重试、释放中/失败/已释放
状态与清理边界。同一评审者完成定点复核，确认 I1 残余反例在文档层面闭合，
本次范围内没有新阻断。主调度在 `33f39cb` 整合并独立重跑可行性探针后接受
共享接口为施工输入，具体范围归[设计验证](evidence/p0-shared-interfaces/README.md)。
公开 API 与 work-data 正文未变；探针不代替正式 TDD 实现和真实资源验证。

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
| K2 | consumer 移入 repo/tmp 后，Node/tsc 可沿祖先 node_modules 借到仓库依赖；ignore-workspace 与根包 realpath 检查不提供仓库外隔离 | `33a57a2` 的五组有限隔离矩阵及有效 RED 已经独立复核闭合 |
| K3 | 这批固定 DSH 来源的 manifest.license 可改为与已核对 MIT 原件不一致的声明而通过 | `f0defde` 的 MIT 一致性修复及反例经独立复核闭合 |

该次复核已解压原始证据，确认三项声明哈希、format-patch 与 `0587fa2` 的 diff
一致，日志支持 12/12 及 14 个独立与组合消费者成功。K2 的旧 RED 停在缺少
createArtifactScratch 函数，未测到祖先污染；绿色默认环境也不能覆盖被检仓库
内 TMPDIR。作者须针对该已有入口补足实际路径保证和有效反例，不能以换路径
名称代替隔离。上述证据核对没有运行测试或接受实现。

`8842f63` 已通过真实路径拒绝仓库内 TMPDIR，新的 RED 在实际借用祖先包后
按隔离断言失败，修复及证据经独立复核。剩余边界是 scratch 位于 worktree
外却与它共享含 node_modules 的祖先，以及 NODE_PATH/Node 全局搜索。当前
消费路径的最终有限检查范围为：干净独立正控、仓库内 TMPDIR（含符号链接）、
共同祖先污染（含 node_modules 链接）、ESM/CJS/声明缺依赖负控、NODE_PATH
污染对照。所有消费编译/运行子进程统一禁用环境注入和全局搜索，保留所需
原生编译环境；不扩展成敌对主机沙盒。`ca559ee` 的实现已兑现该边界，但其
tsc preload 探针错误地限定 cwd，未命中实际编译目录；`33a57a2` 修正测量，
单行撤除实际 tsc 隔离时记录三个消费者的六个 preload 调用并变红，恢复后通过。
同一评审者确认本轮有限矩阵全部闭合，没有剩余阻断；未重跑测试或接受实现。

主调度在 HUB `d95052c` 整合后实际通过构建、13/13 checker 测试、14 个独立
tarball 及 14 包组合消费，范围与原始结果见[HUB 证据](evidence/p0-package-checks/hub-summary.json)。
这些产品仍为源基线，合成自有 package/app 夹具不表示已交付目标应用；真实
fs-ext 产品依赖尚未接入，不能将 native 选择规则测试当成 addon 加载验证。

## P0 work-data 实现复核

`/root/review_first_batch` 只读复核 `a8cd57e` 相对 `9de28b2`，依据已固定的数据
子集、两份 data v1 Schema 及 A30/A31 范围，发现一项必须修复的问题：
parseJson 在 jsonc-parser 完整递归建 AST 后才检查 maxDepth/maxNodes，深输入
可能先抛 RangeError，绕过 Checked/capacity。反例为两万层数组、100000 字节上限、
深度 8 和节点 32；评审确认检查顺序及第三方递归源码，未实际运行该反例。
作者已接回，须实际 RED/GREEN，不能用仅抑制 visitor 回调的 false 值代替中止解析。
本轮 DTO/Schema、数值、冻结、规范编码及产物范围未发现其它阻断；尚未接受实现。

`f586758` 在递归 parser 前加入 scanner 容量检查，原两个小限额的深数组场景
实际 RED/GREEN 闭合。定点复核仍发现两条路径：畸形 JSON 在期待逗号时可能
被预检跳过，却被容错 parser 继续递归；调用者允许两万层时，宿主自身的栈容量
仍未保护。作者继续修订。主调度明确 JsonLimits 是调用者允许的上限，不承诺
宿主支持任意深度；实现容量必须有依据、明确记录并返回 Checked capacity，
且不能产生后续公开编码必然崩溃的“已验证”值。不能仅写限制而放任 RangeError。

`eef1ba1` 对异常语法状态立即返回 Checked invalid_json，并在文本深度超过 128 时
返回 capacity；copy/freeze/canonical 保持迭代遍历。独立 reviewer 对该版本及仅含
证据的 `18cad69` 定点复核，确认 D1/D2 闭合，本范围无剩余阻断。主调度在 HUB
`728d665` 完成类型检查、91 项测试、15 包构建及独立/组合产物消费；其接受范围
限于 work-data，见[HUB 证据](evidence/p0-work-data/hub-summary.json)。

新自有包默认 private/UNLICENSED；按实际许可声明支持其它来源不属于本轮缺陷，
检查器也不授予新许可。原生选择性构建路径的 fixture 通过不代表未来产品 native
依赖已实际加载，仍须在根依赖接入后运行完整隔离消费。整合者在修订复核后再
执行 HUB 验证并接受相应 P0 范围，不移用为全部 A30/A31 已完成。

## P0 records 实现复核

`/root/review_first_batch` 对产品 `00a4b20`、证据 `316b896` 相对 `73ac35e`
独立只读评审，发现一项阻断：encode 使用迭代 copyJson 接纳深于 128 的对象，
decode 的 parseJson 却有文本深度 128 的实施上限。同 limits 可编码成功、随后
拒绝自己的输出。最小反例是 G01 的 outcome.result 包裹 127 层单元素数组，
maxDepth=256，其余原夹具容量足够。作者 `1a237da` 在编码返回前按同配置验证
实际 payload，RED 为 1 failed/16 passed，GREEN 为 17 passed；独立定点复核
确认原阻断闭合，本次范围没有新阻断。

ports、opaque 类型、依赖方向、单行主体/租户/counter 与 G01/G10 字面量的其余
检查未发现阻断。decoded DTO、Checked/issues 不可变；encode 的 Uint8Array
为调用者独占的新字节，不要求冻结元素。评审只读源码及证据，没有写文件或运行
测试。主调度在 HUB `c1783fd` 实际通过 17 项测试及 16 包独立/组合产物后接受
这一 P0 切片，证据见[HUB 汇总](evidence/p0-records/hub-summary.json)；不表示
A05–A08、真实 writer 或完整 TDD 历史源码均已验证。

## P2 治理施工稿评审

`/root/review_package_layout` 独立只读评审 `8b75f30` 相对 `4253ee0`，指出创建
去重依赖尚未分配的 tenantId、硬预算没有统一计入 unknown 的已知预留与本次
新增额，以及币种不匹配/更改预算归集身份尚未明确。原作者 `058c77c` 已定点
修订；独立只读复核确认三项在设计层面闭合，其它主体/资源当前门、HD 同批消费
和定义引用分工未发现新阻断。创建查重使用不含分配身份的原输入；已知费用与
剩余预留共同参与本次硬预算计算；对应币种的明确立场与全部匹配预算均须检查，
普通变更不得改写预算归集身份。

评审者未运行测试、编译或形式工具。主调度在 HUB `01b7f3f` 重跑 33 项受限
设计示例后接受施工输入，证据与限制见[交付对账](delivery.md#p2-治理施工输入)。
五项身份不可变检查仍只是条件断言，独立进程也只查询预写 fixture；P2 产品
与真实 P1 组合仍未通过，不能以这些结果宣称耐久恢复或预算 owner 已实现。

## P2 Agent/Session 施工稿评审

`/root/review_package_layout` 按 HUB `0e80245` 工作包和治理 `058c77c`，对
`746ce47` 作独立只读评审，发现以下四项施工交接缺口；原作者已交付 `a58bc7c`
定点修订。同一评审者在该轮确认 S-R2–S-R4 在设计层面闭合，S-R1 部分闭合；
后续 `cd16f1` 修订 proposed 到直接 deny 的接续交接，最终定点复核确认闭合。

| 编号 | 触发与后果 | 必须闭合的交接 |
|---|---|---|
| S-R1，高 | driver 取得 Step 后正常完成或抛错，没有受限提交入口结算 Step/Run 与剩余请求；q1 接续也未明确原 Step 身份 | 由 SR 裁决正常/失败/下一步输入及同批关系；守住原 CallRef.owner/Action，不能由应用补业务提交 |
| S-R2，高 | Session 只保存 DefinitionVersion，同版本多选用或移除后重选时无法认回原选用 | 持久保存 acquisition，向当前资格门提供原关系；不得静默借用另一份有效选用 |
| S-R3，重要 | owner 的读取、输入、控制权限没有明确涵盖 Session 设置写入，AU 无法解释 confirmation_mode 变更 | 明确设置写资格及当前检查；紧急控制者不能借控制权修改设置 |
| S-R4，重要 | TG 停用/移除选用时没有 SR 的 prepareReferences/checkReferences 提供者 | 固定引用项、修订和共同门；验证创建引用与停用交错，缺席提供者不等于空清单 |

这些分别关联 SR-08/09、HD-04、TG-05、AU-01、A03/A11 和 PF-010.C10。
其余受审四包依赖、唯一激活、退役/强停、旧 epoch 围栏与 TL 合法结果通道未见
直接阻断。现有作者文档检查通过 404 份 Markdown；评审未运行测试、探针或形式
工具，也不作接受决定。R0–R6、S01–S13 与真实产品组合仍是待执行验收。

`a58bc7c` 已明确原 Step/CallRef/Action 不换绑、唯一 DriverClaim、失败同批后果、
原 acquisition/设置权限与 ReferenceInventory。剩余 S-R1 的反例是：TL 已登记
proposed，driver 以 await_calls 交还 claim，此时尚未 allow/ask；随后当前门直接
deny。原稿只在 allow/ask 建 continuation，结果入口只唤醒已有关联，因此不能
解释谁接续已释放 claim 的原 Step。TL-07 允许该直接结算路径，修订须补足登记到
裁决间的接续责任，恢复后仍认回原 Action 且不得产生工具效果。此次为设计复核，
新增 S14–S17 也尚未实际执行。

`cd16f1` 的最终独立只读复核确认：TL proposed 与 SR 原 continuation 同批登记；
完整返回、裁决接续 ready 与 claim 释放同批。直接 deny 同批交付执行前拒绝、
AU 审计与 SR 原接续，不要求不存在的 executionEpoch。恢复按原耐久事实认回
adjudicate/consume_result，保持原 Step/CallRef/Action，丢通知不重造工具效果。
R2–R4 未受破坏，未发现新的阻断。S18 覆盖原反例，但真实组合尚未执行。
HUB 核对受审哈希并通过文档检查后，接受这一施工交接范围；具体 Cordis 插件
装配仍有独立设计义务，见[接受证据](evidence/session-runtime-design/README.md)。

## 可观测性 P1 候选评审

`/root/review_package_layout` 对 `design/dsh-observability@1c60feb` 的候选设计、
固定研究来源和 12 项可行性探针只读评审，六份顶层证据与 17 份来源哈希可核对。
候选尚未合入或接受；原作者继续处理以下范围内的发现：

| 编号 | 发现与实际依据 | 必须闭合的行为 |
|---|---|---|
| O-R1 | SonicBoom 4.2.1 超过 minLength 后在同一调用栈启动 fs.write，候选“门内仅入缓冲”与共享短门约束冲突 | 在门外才启动输出；超过阈值的实际探针不能在门内观测到 I/O |
| O-R2 | 固定 minLength=4096 且无运行中刷出机制，原探针只在 end 后读文件 | 单条低流量日志不依赖后续流量或关闭才能写出；明确健康可见性与失败状态 |
| O-R3 | within 为未决 Promise 增加 scope/结算观察，但无数量上限，关闭又等待这些观察完成 | 移除不必要观察或明确有界责任；保持 body 只执行一次及原返回/错误，停滞 Promise 不能令诊断记账无界增长 |

其余所审的单包保护职责、无环依赖、两处实施注入、身份/内容、普通诊断与耐久
审计边界及 Cordis 桥的 P2 停止条件未发现阻断。评审未运行产品实现，不构成
P1 设施、真实关闭/保留、P3 查询或 A28 通过；records 纯共享实现不依赖该候选。

`99fc7a3` 定点复核确认 O-R1–O-R3 设计层面闭合：真实输出只在外层门外启动；
minLength=0 与实际写进展/失败状态解决低流量触发；移除 scope/Promise 观察并
以关闭状态封闭晚到诊断，不把业务 body 结束归诊断 owner。HUB `9cd78a0` 实际
重跑原 12 项及新增 7 项探针通过，依据 [D-010](../../../decisions/D-010-shared-diagnostics.md)
接受 P1 施工选择。真实短门、写泵、停滞状态及完整换代关闭仍归产品 TDD。

## diagnostics D1 实现评审

独立 architecture-reviewer `/root/review_package_layout` 对固定 `66d92a9` 完成
只读评审；该版本产品源码与 `4b8125e` 相同。HUB 经 `4e0124d` 整合候选、
`4963b2c` 更新根锁、`46770b9` 机械格式化后，已实际通过现有完整产品检查、
17 包独立与组合产物消费，以及另行三 tarball 的真实文件/span/close 消费。
原始日志和消费者资产归[HUB 候选证据](evidence/p1-diagnostics-hub/README.md)。
这些检查尚未覆盖以下反例，**D1 未接受**。

| 编号 | 优先级与固定源码定位（`66d92a9`） | 反例及修订义务 |
|---|---|---|
| D1-R1 | 高；runtime.ts:258、853 | 创建时只按现存物理大小分配余额，后续各实例只累计自身；并存来源和 pending 可重复占用目录预算，并发创建可能超过文件数。验证真实共同字节/文件预算；需要共同 owner 或公共接口选择时先固定设计，不静默禁止已允许的新旧代共存 |
| D1-R2 | 高；runtime.ts:303、786 | active write EIO 后自动清理的 close 再 EIO，degraded 状态漏记重试责任；Sonic 已 destroyed，重复 close 永久等不到事件。实际测组合故障解除后认回并关闭原 fd |
| D1-R3 | 高；runtime.ts:821、975 | 旧文件扫描 FileHandle 关闭失败没有交给 degraded runtime，可能虚报 released。实际测扫描句柄未关闭时失败，责任可查、可重试且不能提前 closed |
| D1-R4 | 重要；runtime.ts:505、580 | 已结束 context 的 native 值仍持 SDK span、processor/runtime，活动表删除不足以证明释放。保留公开关联句柄时验证完整 span 可回收，同时保留父子身份关联 |
| D1-R5 | 重要；projection.ts:17、runtime.ts:518 | revoked Proxy 可在未保护的 Array.isArray 处抛错；end 提前标记完成导致活动 span 遗留。实际覆盖 log/scope/end、业务原结果/错误不变和关闭责任 |
| D1-R6 | 重要；runtime.ts:367 | buffer drop 只累积内存缺口，恢复后原件无 gap summary。真实延迟写恢复后检查有界原因/计数/质量摘要，摘要失败不得递归或触发重试风暴 |

这些分别对应 observability.md 的目录总预算、失败资源归属、仅保留身份、
被动失败及恢复摘要保证。评审者核对了源码与既有日志，没有运行新反例或作接受
决定。O01 真实业务短门、O07 宿主切换及 O09–O12 按原 D2/D3/P3 责任保留，
根锁集成也不属于本轮缺陷。

原 infrastructure-developer `/root/diagnostics` 已接回六项修订，spoke 在评审
结束后仅 fast-forward 到 `46770b9`，复用根锁和格式配置。须保存实际 RED/GREEN，
不改写旧证据；共同目录责任若要求变更公开接口，先返回具体候选。其余独立修复
继续执行。完整修订仍须独立复核和 HUB 验收后才开放 jsonl/admission 消费。

原作者随后交付 R2/R3/R5 的 `00dd6e7`、R4/R6 的 `b99752b`，实际定点 GREEN
分别为 3 项与 4 项；失败原件、GC 测量修正及摘要再次失败的测量保留在源码树
`evidence/p1-diagnostics/reviewer-remediation/`。最终测试机械格式化后固定
`1c0923f`，原评审者的定点只读复核已闭合 R2–R5；R6 又发现 close 先于
write 恢复时漏摘要的交错，作者随后修订。上述源码尚未整合为接受后的 D1。

R1 的 `fefb6c5` 已实际复现两项：旧来源写入挂起期间新来源扫描，恢复后各文件
各守自身上限，但目录为 3356 字节，超过 2400；两次创建在 fs.open 前均通过
准备，放行后 maxFiles=1 的目录出现两个 held 来源。它们是保持 RED 的当前
缺口，不以其失败否定其它独立修复的测量。原观测设计作者按 `82b2baf` 计划
另行固定显式目录 owner 和公共接口选择，受审后原实施者才能继续 R1。

## P3 工具、审批与执行施工稿评审

作者固定 `e6c0b8c5d1a7cc3b282c809498a241a66ad71b9d` 的六个候选/证据文件，
交由独立 architecture-reviewer `/root/review_first_batch` 只读审阅。作者尚有
两份未提交的相邻对齐草稿，评审统一读取固定 Git 内容，不混入工作区修订。
候选未整合或接受；D01–D12、新 TS 接口、完整 Cordis 与产品组合尚未执行。

主调度实际核对候选和四份作者资产 SHA-256，并在 HUB 的独立临时目录以相同
固定脚本重跑两个文件/进程窗口：效果前 SIGKILL 后目标不存在；文件/目录 sync
后、业务结果记录前 SIGKILL，目标保有 21 字节，而两组 marker 都只有
dispatch-intent。原始输出在 `tmp/p3-tool-decision-review/e6c0b8c-hub-result.json`，
只证明两个底层窗口，不证明真实 writer、停止墓碑、恢复或恰好一次。

已知待处理的共同面包括：P2 候选 `947885c` 使用受信 host options 注入恢复所需
reader，不提供冗余 records service；工具稿须按其最终受审公共面对齐。作者还
报告 Cordis 的 effect 清理可能晚于 Fiber 进入 UNLOADING，稿中依赖 effect
首段关门的突失窗口须结合固定原始证据核对；待审 host stamp 建议不是已接受
修复。评审将检查本族具体责任与公共冲突，相邻 P2 提供者的完整映射仍归其
独立作者，不要求双方重复定义。

原稿评审现已完成，作者正在修订两项：effect disposer 异步执行，不能作为旧
调用资格的同步撤销屏障；答复/结果/控制交付不能沿用仅属 adjudicate 阶段的
active claim 前提。前者须在最后门重检原操作代次和必要 provider 当前资格；
后者须核原绑定及当前接收/控制 owner，不能在 Agent 已释放时阻断合法终态。
修订与三个包内 design.md 的归属迁移完成后再接受，完整 HD 实现不成为本次
allow 基线的前置条件。

## D1 目录修订与 R6 定点复核

独立 architecture-reviewer `/root/review_package_layout` 已只读审阅固定
`d4cd27ed33df815179f57af398c8cb6b5444302a`。显式目录 owner、共同字节/slot
预留与稳定 flock 在本次范围未发现阻断；8 个来源文件另加一个零字节锁文件
是须明确接受的采用差异。所有子来源、准备和扫描静止后才关闭锁 fd，最后释放
未知与仍有活动写入的保有责任不同。四个机制案例不抵扣真实产品 R1 GREEN。

同轮核对 `4fa2c74f4816fe37850a812ca59032cb889d75fd`：结束流之前等待已知
待写恢复，让有限摘要先于结束标记；RED 确实观察到最终缺摘要，GREEN 覆盖
原关闭交错、正常恢复及摘要超限，D1-R6 定点缺口闭合。作者曾误报该提交的完整
SHA，主调度以实际 Git 解析结果纠正，本文只绑定这里列出的真实对象。

R2 证据仍只支持原 close 调用前注入失败、已知 fd 未关闭的情形。当前数字 fd
重试不能泛化到真实 close 结果未知，R1 接入必须处理这一资源身份前提。目录
设计需迁入所属包，实际 flock、owner shutdown、原生独立产物及 R1 的产品
RED→GREEN 仍待交付；只读评审未运行产品检查，也不作接受决定。

## P2 提供者映射评审

独立 architecture-reviewer `/root/review_first_batch` 已只读审阅固定
`5ffba4bb55aa9514ebd7f3c2b48f0d26fc9a8e18` 及其三组原始机制证据。
稳定 host、原 mount/link stamp 与最后门中的 Fiber 资格检查明确不依赖异步
disposer；required inject 无发现环，恢复同水位和部分失败保有边界基本自洽。
唯一 `omneAdmission` 与可信宿主注入 reader 的归属清楚。

须消歧第 199 行“一次决定不复活”：失效的是旧 DecisionFacts 私有候选/运行
句柄。未消费、未关闭的耐久批准仍由当前 HD owner 重建私有事实并重检，只能
用于原 Action；普通 AU/link 重载不自动撤销批准。这是施工文本歧义，尚非
已执行产品反例。D1 最终创建面、相邻 TL/HD/LE 签名及包/app 正文归属继续闭合；
三个探针不证明同步撤代、授权或完整产品组合已实现。

原评审者已定点复核 `f98ac92650beb46bb1e4bc993995e21800a300a2`：AU 私有候选
与耐久批准的区别已清楚，普通重载不自动取消批准；七包及应用中的真实 Fiber、
本次挂载代次与最后门规则和工具稿 `0a6e91e` 一致，reader 只经受信 host 输入，
没有新增第二状态权威或注入环。指定范围未发现新的迁移阻断，评审未运行测试。
主调度将两稿合入 HUB，D-011 的采用引用同次对齐；接受范围归各施工入口，
不会因技术设计接受而声称 P2 产品或完整 HD 已实现。

## 最小运行基线计划复核

固定 `1368c52` 交给 `/root/review_minimal_plan`，模型与 effort 按仓库角色配置
为 gpt-5.6-sol/xhigh。当前宿主不识别新 `plan-reviewer` 名称，因此实际使用
普通原生 agent 加完整生成指令；只读/no-delegation 是任务边界，没有声称继承
宿主未应用的原生只读配置。评审未写文件或运行产品检查。

发现和处置：缺少当前最小 wave 的具体产物/实现/组合责任，已在计划新增对应
安排，未交付前置明确保持关闭；交付页“恢复后置”的歧义已限定为超出基线的
完整场景，Session/Run/call 重启认回、已完成效果不重复和 unknown 不重发仍是
硬门；R1 与 R2–R6 当前状态已对账；各 P2/P3 owner 负责自身 diagnostics 接入，
最终验证 owner 负责跨链关联、内容裁剪、失败及关闭的真实组合。新 wave 的
前置产品提交待实际交付再绑定，不以设计提交冒充可消费产品。

评审确认完整 HD 和 P4/M2 未构成隐含前置，停止条件明确。计划修订不意味着
产品门已通过；本次四项处置已交原评审者定点复核，其他设计/规格不重复审计。

原评审者对 `e2190ad` 相对 `1368c52` 确认恢复范围、D1 对账、跨链观测责任
三项闭合，最小 wave 主体闭合，但发现 P1 的组合测试目录尚无可执行载体：
workspace 只发现产品包和现有工具，叶子 package/测试配置的写权原来无人承担。
计划现明确由 P1 verification-developer 创建最小叶子配置，整合者接根发现/
锁/检查入口并实际验证命令运行；P1 接受后才将叶子配置写权移交应用角色。
这是测试载体的责任修正，不提前创建业务应用，也不抵扣尚未执行的组合验收。

工具稿 `0a6e91e` 的 T-R1/T-R2 与 reader 公共面已由原 architecture-reviewer
定点确认闭合，三个包正文无发现新的迁移矛盾。HUB 核对来源与设计哈希并运行
其两组新机制探针，stdout 与作者逐字一致，结果见
[HUB 机制证据](evidence/provider-design-hub/README.md)。真实业务门和执行仍未实现。

## D1 目录产品的组合复核

原 architecture-reviewer `/root/review_package_layout` 只读核对产品
`3ca93e0f945bd95833cc25fed12fd042fa9c183e`，设计依据为 HUB `6d9f47a` 的
D-010/D-011 与包内正文；证据读至 `5cecf7d`，后者未修改产品源码或测试。
原 R1 的容量/slot 反例已闭合，R3–R6 未发现本轮组合回归，但仍有下列发现。

| 发现 | 固定源码依据与可区分场景 | 当前处置 |
|---|---|---|
| R2 关闭期间 write EIO | `runtime.ts:382–386,911,934–942` 在调用 `end()` 前就置 `streamCloseStarted`，将随后尚未发生实际 close 的 write EIO 当作 raw close unknown；截留写 callback、开始 close、再返回 EIO 时可能永久保有来源 fd/目录锁 | 原作者须先以真实 close 调用数和最终释放刻画 RED，再修复；保留真实 close 后 fd 复用哨兵测试 |
| R1 未知来源扫描 | `runtime.ts:1020–1063,1227–1250,1270–1271` 接纳匹配文件名但无法识别的头记录；`diagnostic-0000000000000000.jsonl` 内容 `x` 加换行可落成 complete/active，违背 D-011 的未知原件拒绝 | 区分身份可确认但无 clean end 与来源无法辨认；修正原测试不匹配的来源哈希，原件保持不变 |
| R1 短写测量失效 | `short-write-unknown-child.mjs:41–50` 假定 `fs.write` 的 buffer 签名；Sonic 默认使用 string 签名，夹具实际同步抛错，未执行目标写入，父测试却可由旧 start 记录满足大小断言 | 原作者须先让旧夹具因未发生目标 I/O 而 RED，再观察真实新增的部分字节和 EIO 阶段；原 GREEN 不计为短写覆盖 |

以上由源码与固定日志推导，评审者没有运行产品或测试；原作者已通过原生消息
接收具体场景，正在同一职责范围内验证和修复。HUB `ff2e7dd` 合入该候选后
实际构建、类型检查、50 项测试和 457 份文档检查通过；这些 GREEN 没有覆盖
上述反例，不能用来接受 D1。作者位于仓库 tmp 下的 tarball 消费也不单独证明
祖先依赖隔离；最终仓库外消费与完整组合仍由 HUB 验收。

原作者已在实际 Git 对象 `2f59c2fdcc02fb729dd98abbb815229b05641113` 固定
三项 RED：新增写入字节为零、未知头记录错误创建 owner、关闭期间 write EIO
后的实际 close 调用为零。主调度已读取该对象的原始输出，3 failed / 49 skipped，
这使上述源码推导成为可复现反例；修复与同版本回归仍待完成。

原评审者随后定点核对 `a6ee9778befea84514b3d5175cc110300d151a92`：未知头
拒绝与短写测量闭合；短写实际请求 348 字节、新增 174，原件从 216 增至 390，
退出后重扫认回实际 390 字节。`8162616` 的延长观察仍得到 closeCalls=0 且原 fd
可访问，排除了原泄漏只是清理延迟的解释；新修订已实际关闭该来源。

R2 同一场景尚有相邻状态缺口：`once(stream, "close")` 因 write EIO 拒绝时，
`finishClose` 无条件 `budget.unknown()` 将目录置 failed；后来真实 close 成功
仅更新子资源，目录仍永久拒绝下一来源。原作者须在原用例末尾观察 owner 状态
与真实再次创建，区分可确认收口的来源写失败和真正 raw-close unknown。该定点
复核已读 3/3 和 52/52 GREEN，没有运行测试或接受产品；剩余修复及最终产物
仍由原作者与 HUB 完成。
