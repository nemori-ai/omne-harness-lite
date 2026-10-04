# model-response MR8 恢复时序实施增量

2026-09-28，rev 1，**提供者映射 candidate，未接受、未实施验证**。节点仍为 `packages/core/model-response`（provider）；源码同路径。继承 [v7-design](v7-design.md) 的纯模块、当前唯一根/schema、精确依赖与无运行兼容安排，只投影 MR8 必需差异。基线 `7a5810eb` 已有根 MR7 的 judge/Pending 和完整 Schema 图，不再按旧稿中的“尚无源码”读取。未重新执行领域双盲或增加产品选择。

## 精确采用输入与四层状态

已核 catalog 中 baseline `omne-harness-lite-design-2026-09-15` 的 `data.model-response/8`（MR8）与 `capability.model-request-runtime/9`（RT9）均 accepted；[D104](../../../../record/decisions/model-recovery-timing-adoption/decision.md) 只接受规范，不自动采用本提供者映射。MR8 语义依赖仍为 CA2/CB3/MS6/MP5/LC6/OE1/IV1，RT9 是消费者责任坐标，不反向成为本 data 包依赖。产品依据按 MR8 引用继承；本增量不重开、不裁决原产品来源未裁项及 L1/L2 恢复交接事项。

| 已冻结输入 | SHA-256 |
|---|---|
| [MR8 contract](../../../../spec/data/model-response/v8/contract.md) | `34b78e9c55df99fa8ea3756c98010914fae92a56375a429316e7fdafb966fe13` |
| [MR8 Schema](../../../../spec/data/model-response/v8/model-response.schema.json) | `4378aa6a11ec5775565a90cf6269eeff76ebe76356110ef301f0bfc04fda1da3` |
| [MR8 examples](../../../../spec/data/model-response/v8/examples.md) | `b60980e124e1eff02ad78932f3e39385d28b9a5dd06b5fb2b4f81b26df910fbf` |
| [RT9 contract](../../../../spec/capabilities/model-request-runtime/v9/contract.md) | `3ae5ee1843a31cb229a11c77a35c2bdc66e51100953322be0febed1ef37e64fb` |

四层：**语义已接受**（[精确清单](../../../../record/decisions/model-recovery-timing-adoption/acceptance.json)）；**可实施路径候选**见下表，须主线采用；**新增绑定 0**，原 binding 不换版本；**实际实现验证尚无本增量结果**。[既有有限证据](../../../../record/evidence/2026-09-28-formal-model-recovery-timing/README.md) 是 10 个 Schema 边界与 RecoveryTiming 一正四负 TLC，不证明生产 judge 优先级、真实恢复或消费者编译。

## 契约责任到公开实现

本表 S- 均指 MR8；公开函数名字已存在，下列修改方案为候选。

| ID／责任 | 公开面／Cordis 贡献 | 实现与采用版本 | 证据义务／边界 |
|---|---|---|---|
| R8-P1：S-17/S-26 | `Timing`、`ModelResponse`、`validate`；无 Cordis 贡献 | 根 `src/types.ts` 的 Timing.sentAt 必填 `string \| null`（字符串按 OE1 Instant）；完整 `schema/model-response.schema.json` 换 MR8 原字节/$id，19 defs 清单不扩展 | V8-1/2；null 不得等价 undefined/缺字段 |
| R8-P2：S-17/S-27 | `judgeModelResponse` | `schema.ts` 的私有成员视图允许 Timing.sentAt:null；非 interrupted 的 null 留在共用 ResponseFactsConstraints 的跨字段条件，judge-kernel 原具名优先级之后才 malformed | V8-3；不能在成员层按 outcome 抢先拒绝 |
| R8-P3：S-39/S-27 | `PendingModelResponse`、`judgePendingModelResponse` | Pending 必须明确收窄 timing.sentAt 为实际 Instant；其 `properties.timing.allOf` 保留在私有成员视图中，null 在成员形状阶段 malformed | V8-2/3；Pending interrupted 也不放宽 |
| R8-P4：S-9/S-11/S-16/S-17/S-19/S-24 | 根完整响应值；无 IO 或恢复构造器 | 不从 null 改 usage/cost/parameters/firstTokenAt，不根据 null 推断 send 次数或重试资格；原精确数、多值头、适配绑定、快照、S-40 shape-only 均保留 | V8-4；可信来源与锚点由 RT9 写方验证 |

### 类型和判定路径

`Timing` 为通用表示，sentAt 可空；持久响应的 complete/truncated/failed 分支必须通过分支内 timing 收窄为 string，interrupted 分支才允许 null。Pending 复用原回复联合时同样显式保持 string，不因基础 Timing 扩域而放宽。不得把整个联合压平为无条件可选字段、靠类型断言消除编译错误，或让 null 进入所有回复构造器。

纯 judge 沿原顺序：严格无损快照 → outcome_unknown → dispatch_zero → cause_unknown → 其余成员形状 → 原具名跨字段拒绝 → 无专名跨字段 malformed。`Timing` 独立 validate 可以接受 null；它没有 outcome，不能擅自推定 interrupted。持久根不合法 null 的拒绝属于最后跨字段阶段；例如 complete 同时无 reply、sentAt:null，先 reply_missing。Pending null 属于成员层，叠加 ending 错配仍先 malformed；但 unknown outcome、dispatch_zero、cause_unknown 仍优先。

完整原 Schema 不编辑以配合 judge。私有成员视图仍只延后既有根/Pending 的顶层 allOf 和 Failure.dependentRequired，不能递归剥离 Pending timing 内的 allOf；否则会把投影成员错误推迟到错误阶段。有效 interrupted + null 仍须遵守原 initiator、reply、delivered、firstTokenAt 等联合约束。

S-17 的**真实时刻来源与先后比较由写入者兑现**；本 data judge 不新增时钟、锚点读取或时间排序策略。null 时不参与 sentAt 时间比较，但已知 firstTokenAt 与 endedAt 仍须有序，交给 RT9 codec/写方。S-27 的新增跨字段职责仅为 outcome 对 null 的限定，不能把所有时序写方责任吸收到 core。

## 精确资源、构建与消费者

沿既有 `createSchemaRuntime`/锁定 Ajv 与固定完整图，无新 resolver、依赖或 Schema 网络读取。22 份规范资源只将 MR7 替换为 MR8，其余保持：CA2、CB2/3、IV1、OE1、MP2/5、MS2/3/6、LC2/3/6、AM2/3、TD2/3、SP2、connector2、mcp2、slash2。另有私有成员阶段资源，不作为规范资源计数。原资源的递归引用和必要旧 Schema 子入口沿各 owner 公开资源承载，不是旧格式执行兼容。MP6 是其他消费者的采用，不允许把 MR8 冻结 `$ref` 中 MP5 静默替换为 MP6；若依赖根已迁移，应取 owner 的精确 Schema 公共入口。类型字段相同不代替 Schema `$id` 闭包验证。

| 当前消费点（基线实际存在） | 所需迁移／验证 owner |
|---|---|
| 本包 types/schema/judge-kernel 与测试 | 根/schema 采用 MR8；19 defs 全部编译，当前正反与多错误优先级回归；删除替代实现，不提供 `/v8`、猜版或 MR7 fallback |
| runtime `types.ts`、`invoke.ts`、`response-construction.ts` | 通用持久 Timing 扩域不能让普通独立 invoke 或 Pending 返回 null；真实发送路径用候选局部精确类型/判定收窄，所有原时刻比较调用严格编译；不填恢复时间躲类型错误 |
| runtime `log-codec-value.ts`、`log-codec-settlement.ts` | 当前捕获/识别接受合法 interrupted null；其 timingOrdered 仅在 sentAt 非空时比较它，已知首 token 与结束仍比较；值相等/encode/decode 不把 null 缺省化 |
| runtime `service-reconcile.ts`、`service-dispatch.ts`、`anchored-invocation.ts` | 沿 RT9/D104 的真实锚点、来源事实与恢复责任产生时序；替换“只能等到原 sentAt 才恢复”路径及锚点/取消时间冒充实际 sentAt 的构造。它们的写方映射与行为实现归 runtime owner，本节点不定义恢复算法 |
| demo、session-log-jsonl 的 model-data 测试、tools/core-verification 及所有声明消费者 | 根类型/schema 编译；真实日志 current capture/reopen 对合法 null 不降级，不恢复旧响应格式；统计/展示不能把 null 读成零 send/零费用；已有有限闭环证据不自动升级 MR8 |
| 本包 README/README_ZH | 同步说明 Timing 与 Pending 的区别，以完整合法 interrupted/null 和 Pending 实际时间示例展示公开判定；原文代码用实际制品编译执行，不把 Schema ok 说成来源已证 |

## 状态、存储、装卸与取舍

仍是无领域状态、无配置/密钥/IO 的纯模块。存储要求 **0 项**，受管装载贡献 **0 项**，撤除责任 **0 项**；不新增 plugin、fiber、service、store、后台工作或同提交协调。固定 Schema 编译错误暴露为导入/构建缺陷，不吞成业务 malformed；同步函数不拥有在途 HTTP。Cordis 采用依据沿 [D025](../../../../record/decisions/cordis-adoption-version/decision.md)，本包不使用其 API，无新增 basis 主张。

| 选择 | 落选方最强论证 | 本方弱点与置信度 |
|---|---|---|
| 通用 Timing 扩域、按响应分支/Pending 收窄 | 所有 Timing 都放宽可减少类型修改 | 需修正调用者的假设；可在类型层及时发现 null 泄漏。高 |
| 现有两阶段判定保留，null 条件放其指定层 | 完整 Schema 一次校验实现最简 | 两阶段须用混合错误反例防止顺序漂移；S-27 明确要求此成本。高 |
| 真值与恢复继续归写方 | core 自动查锚点或补时刻能让调用更省事 | 纯接收不能证明来源，正确使用依赖外部验收；避免重复 owner。高 |

归装配的身份、时钟、可信事实保管、实际停止及共同日志提交仍归 RT9 runtime/host/日志写方；本节点不关闭这些外部义务，不更改产品来源未裁项。详细验收见 [V8 义务](verification.md#v8-恢复时序实施候选)。
