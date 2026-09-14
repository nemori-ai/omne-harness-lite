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
修订，待复核；其它主体/资源当前门、HD 同批消费和定义引用分工未发现新阻断。
未运行测试、编译或形式工具，候选尚未接受，P2 产品仍等待 P1。

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
