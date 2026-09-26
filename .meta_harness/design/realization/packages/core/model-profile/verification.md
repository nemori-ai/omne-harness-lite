# model-profile 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.model-profile/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/model-profile` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**185 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 12 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/model-profile/verification.md`](../../../../spec/data/model-profile/verification.md#证据义务)（按条款列）。
本页只登记**落在本节点上的那一部分**；目录的写路径与运行时的写入纪律归模型档案目录与模型请求运行时。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| S-24、S-25 表示层校验与拒绝值次序 | `examples.md` 正反实例逐条过judge；第6节四条、第10节一条次序回归；Schema副本同字节 | **已通过**：185/185中155fixture、`M-FIRST`、`SCHEMA-BYTES`；[具名JSON](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/vitest.json)、[输入audit](../../../../record/evidence/2026-09-26-tests-core-values/audit.json) | 本节点；不证明真实接收／写入路径 |
| S-18 `max_output_exceeds_profile`（Schema之外） | 档案与建档内容各一正一反 | **已通过**：`S18-ModelProfile`／`S18-ModelProfileContent`、`EXACT-LIMIT-*`；[原log](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/test.log)；显式断言Schema放行而完整judge拒绝 | 本节点；上游输出上限来源与发出留痕归runtime |
| S-28 建档内容M12 | 带registration／updatedAt即malformed，含listed | **已通过**：`EX-10-*`含规范次序例；[原JSON](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/vitest.json) | 本节点纯输入判定；真实建档／清单invalidInput且无写入归目录 |
| S-14 引用值精确匹配 | 名字对而scope／origin不对即不匹配 | **已通过**：`S14-MATCH`／`S14-SCOPE`、`TYPE-S13`与[HUB公开consumer](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-model-profile-consumer-runtime.log) | custom分支显式给目录scope；boolean只答给定行是否匹配，三种目录收场未由本模块证明 |
| Modality唯一定义 | type与Schema都取content-blocks | **已通过**：`TYPE-MODALITY-NUMBERS`／`EX-5.3-*`与153项[audit](../../../../record/evidence/2026-09-26-tests-core-values/audit.json) | 本节点 |
| M36精确数字、参数与快照公开形状 | 原数字字面核整数、值域、跨字段关系，Schema视图不丢语义；快照只形状不重judge | **已通过**：`EXACT-INTEGER-ORACLE`固定seed20260926的64样本、`EXACT-PARAM*`／`EXACT-EXPONENT`／`EXACT-SNAPSHOT`与[JSON](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/vitest.json) | 有限数值与模块形状；每个外部JSON边界和原样快照写入归对应owner |

**不在本节点**：撞名、在册转移、`updatedAt`、只发往允许的一家、不静默丢改、快照原样、缺席不补值等规范场景（模型档案目录与模型请求运行时）。

**公开面静态前提**：`core-pure-imports`规则已交付，[本次HUB24规则扫描](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-purity-scan.log)对model-profile／asset-model真实源码无违反；本包还实际消费独立公开dist声明与runtime。扫描只支持该修订和登记语法范围，不替代消费者行为保证。

## 实际执行

运行[`2026-09-26-tests-core-values`](../../../../record/evidence/2026-09-26-tests-core-values/README.md)：实现`cd67215b`、HUB merge`735ee728`；
作者[build](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/build.log)／[typecheck](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/typecheck.log)／[test](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/test.log)
与[HUB包原log](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-model-profile-hub.log)各退出0，**185/185**、3文件、0失败／跳过。
Node24.18.0／pnpm10.28.1／Vitest4.1.11／TypeScript6.0.3／Ajv8.20.0；155个冻结fixture参与，seed20260926的64个BigInt样本在一个测试内，不计成64独立测试。
HUB先install产生dirtylock，实际锁与稍后aa7c3d33同字节；后续W1证据／锁提交不改产品，不称全程固定HEAD。

HUB在aa7c3d33独立执行作者同字节[consumer](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/model-profile-consumer/consumer.mts)与[tsconfig](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/model-profile-consumer/tsconfig.json)，
strict、skipLibCheck=false，[types原log](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-model-profile-consumer-types.log)和[runtime原log](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-model-profile-consumer-runtime.log)各0；类型stdout为空也不代替退出码，主调度实际exec结果另登记。
当时只有3导航文件dirty，末尾才提交633b2019，产品／工具／配置未变。
作者初始smoke原log保留，但新包写入与它并行发生，不作固定基线或本包验收；34阶段外skip不混入本包零skip。
17原件与153输入逐hash核对，Schema副本及规范冻结相符；[逐项覆盖与owner](../../../../record/evidence/2026-09-26-tests-core-values/coverage.md)。本次通过不提升最终接受状态。

## 覆盖缺口

- 本模块声称的形状／词表／精确匹配／表示层面已有本次证据；空绑定表是无formal task，不表示无实现。
- S-3同格判重原子性、S-10/11写入与时间、S-14三种读取收场与S-13持久／授权归目录及持有owner；未在本包演练。
- S-5/6实际出站供应商、S-17无补值、S-21处置留痕、S-27打开调用时原样复制及每一处JSON传递归runtime／adapter。未访问OpenRouter或真实模型。
- 数值oracle、纯性语法scan与外部dist消费者均是有界检查，不代表所有数值／交错／消费者符合。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
