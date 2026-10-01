# model-response MR9 输入校准值映射

2026-09-29，revision 1，**candidate，未接受、未实施验证**。节点及源码路径均为 `packages/core/model-response`，kind 为 provider。本增量接续 [v8](v8-design.md) 及 [D104](../../../../record/decisions/model-recovery-timing-adoption/decision.md)，保留已实现的纯值包边界；不新建 plugin、fiber、service、计量器或存储。前身基线为 `0fb8cefd`；本版公开签名、文件落点均为候选，不是现有 API 声明。

## 输入与采用门

已核 [catalog](../../../../registry/catalog.json)：baseline `omne-harness-lite-design-2026-09-15` 的 `data.model-response/9`（MR9）和 `capability.model-request-runtime/10`（RT10）均为 candidate、acceptance 为 null。本节点只拥有 MR9 的表示及单响应关系判定，RT10 只定位消费者责任，不反向成为 core 的运行依赖。施工方向为 [U0 C](../../../../record/proposals/model-input-usage-calibration/design.md) 与[施工简报（已外置）](../../../../record/evidence/2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件)。下列 SHA 识别本次读入快照，不表示接受或冻结发布。

| 输入 | SHA-256 |
|---|---|
| [MR9 contract](../../../../spec/data/model-response/v9/contract.md) | `fc4fe5f8092f1abff7efa6b27a228f7321575c5de8205c58de8ee8106ad3ebda` |
| [MR9 Schema](../../../../spec/data/model-response/v9/model-response.schema.json) | `f282244688fa9442787b94f11c02444923843c8d8ae471d323e42792c8ee457c` |
| [RT10 contract](../../../../spec/capabilities/model-request-runtime/v10/contract.md) | `add7ff23a73a6ad5a749f40f6707f408f60d33b6032080ad6ba4751f10d5695c` |

需求 rev 沿 MR9：PF-013/15、PF-009/8、PF-004/13、PF-012/15、PF-001/23、PF-011/4、PF-010/6；不重开产品选择。MR9 精确依赖仍为 CA2/CB3/MS6/MP5/LC6/OE1/IV1；MP6 的估算政策由 runtime 消费，本包不私换 Schema 引用为 MP6，也不新增 MP7。Cordis 采用版本沿 [D025](../../../../record/decisions/cordis-adoption-version/decision.md) 的 4.0.4；本包不使用 Cordis API，新增 basis 主张为 0。

四层状态：**语义接受无**；**可实施路径候选**，接受后才能实施；**新增绑定 0**，旧绑定不换标签；**本增量实际产品验证尚无**。既有规格/TLC 结果不是本包生产校验、持久性或真实 token 来源证明。

## 契约责任到公开实现

本表条款均指 MR9；所有行是待实施映射，不标已兑现。

| ID／契约责任 | 公开操作／Cordis 贡献 | 候选实现与版本 | 符合性依据或缺口 |
|---|---|---|---|
| R9-P1：S-41/S-43、S-39 | 六个共享类型、`ModelResponse`、`PendingModelResponse`、`validate`；无 Cordis 贡献 | `src/types.ts` 及当前根/schema 采用 MR9；两完整表示的共有事实必含 `inputCalibration`；25 个 `$defs` 精确清单 | V9-1/2；不以 optional、旧值补全或自动 unavailable 躲迁移 |
| R9-P2：S-41～S-44、S-27 | 既有 `judgeModelResponse` / `judgePendingModelResponse` | `judge-kernel.ts` 保留现有顺序，在既有具名跨成员拒绝之后执行新增关系校验；`schema.ts` 仍区分成员与完整 Schema | V9-3/4；Schema ok 不代表跨值关系 ok，更不代表真实来源已证 |
| R9-P3：S-41～S-44 | 候选 `copyInputCalibration`，共享 readonly 值交接 | 新 `src/input-calibration.ts` 复用严格无损 JSON 边界与原精确数算法；从未知外部值制作独立自有快照 | V9-5；片段校验不替代完整 response judge 或固定提供者来源核验 |
| R9-P4：S-45、S-9/S-19/S-21 | 当前根值承载与无损 JSON 组合；无日志 codec/service | runtime 的日志 codec 消费同一共享类型与两个 judge，原 payload 完整保存；本包不调用当前 meter 重建旧事实 | V9-6/G9-2；原批耐久和保密来源判断归 runtime/transport |
| R9-P5：S-26/S-39/S-45 | 当前唯一根/schema、公开制品与双语说明 | MR8→MR9 直接迁移所有当前消费者，不建 `/v9` 执行子面或猜版 fallback | V9-1/7；保留契约归档和必要精确 Schema 资源不表示运行兼容 |

## 共享类型与值交接

**字段唯一权威是 MR9 Schema 的六个同名 `$defs`**。本节只规定 TypeScript 投影和公开归属，transport/runtime 直接 import 类型，不再声明同字段 DTO。既有 `ModelAdaptationBinding` 从 model-profile 公开入口引用；计数用既有 `JsonNumber`，由运行校验保证非负整数，不强转 JS number。全部对象成员为 readonly，数组及嵌套配置同样只读；readonly 本身不证明深冻结或来源可信。

| 根导出候选类型 | 精确表示投影及关闭条件 |
|---|---|
| `CountingBasis` | `$defs/CountingBasis`：binding 使用已有共享类型，其余 model/provider 和五个 Revision 字段逐字保持 Schema 的必填 string；非空由 validate 兑现，不制造任意版本默认值 |
| `RequestInputEvidence` | `$defs/RequestInputEvidence` 判别联合；known 的 projectionRevision、prefixBoundary、prefixDigest、inputEnvelopeDigest、countingBasis 全部必填；unavailable 仅 kind/reason，reason 沿 Schema 闭合集合 |
| `ObservationProvenance` | 同名定义；fieldPaths 为 readonly 非空字符串序列，运行校验唯一性；三个可选上游原事实保持缺席与已给原值的区别 |
| `ObservedInput` | 同名三分支联合；from_usage 无 tokens，upstream_total 有 JsonNumber tokens，两者均有 provenance；unavailable 仅 kind/reason。不得在两已知分支附第二份总量 |
| `OutputGroupEvidence` | 同名 known/unavailable 联合；known 自有必填 projectionRevision，source/completeness/usageRef 保持闭合字面量，blockDigests 为 readonly string[]；空与重复均可表示，关系另判 |
| `InputCalibration` | 恰含三个必填成员，类型分别为 RequestInputEvidence/ObservedInput/OutputGroupEvidence；没有估算总量、margin、trusted、tenant、log 或可变锚字段 |

`requestInput: unavailable` 与 `outputGroup: known` 是合法类型组合，后者的 projectionRevision 不能从前者推导或省略。两者 known 时版本相等是值关系，不用泛型假装已经证明。`ModelResponse` 和 Pending 引用同一个 `InputCalibration`；Pending 仍沿 MR8 的实际 sentAt 和原收场限制，不因计量字段放松。

候选公开签名：

```ts
export function copyInputCalibration(value: unknown):
  | { readonly ok: InputCalibration }
  | { readonly rejected: 'malformed' }
```

此函数用于 transport 返回的可变外部对象进入 runtime 自有调用事实的边界：严格无损快照、片段完整 Schema 校验、片段自身两处 projectionRevision 相等检查、递归冻结后返回；保留原字段、数组顺序/重复及精确数字，不补值、不规范化来源、不计算摘要、不修改来值。输入可变对象与输出不得共享可变引用；使用原严格 JSON 边界拒绝 accessor、非 JSON 值及循环，不执行 getter。片段内部可判的是 requestInput 与 countingBasis 的版本相等，以及两 known 组的版本相等；binding 与 route、观察与 usage、输出 source 与内容均需完整响应，不能在这里验证。没有完整事实时不返回一个“已认证校准”类型。

这里的 codec 是已有 `content-blocks` 公开严格无损 JSON 读写与本包值校验的组合，不新增同义 parse/stringify API。完整 response 的捕获、encode/decode、原批比较归 runtime 的日志 codec；runtime 可用上述 copy 取得片段所有权，但提交前仍调用完整 judge。对 JSON 数值保真指不发生精度损失；不承诺重新编码后的空白、对象键顺序或等值数字词法与源字节相同。原批恢复必须保留原批值/原存储字节，由其 owner 验证，不能拿一次重新编码宣称原字节未变。

## 判定次序与关系校验

保留 S-27：严格无损快照 → outcome_unknown → dispatch_zero → cause_unknown → 其余成员形状 → 全部既有具名跨成员拒绝 → 无专名跨成员 malformed。新增字段缺失、未知判别值、未知 reason、额外字段及非法摘要先是成员 malformed。完整 Schema 的跨成员条件仍留在完整阶段；不把 outputGroup source 条件提前到成员阶段抢走 reply_missing 等拒绝。

R9-P2 在最后关系阶段以精确 JSON 相等和 CA2 精确数运算落实：

1. known request 的完整 binding 等于 route.adaptation；外层 projectionRevision 等于 basis 同名字段；known output 与 known request 的 projectionRevision 相等。对象键换序不改变相等，数组顺序与重复有意义，整数邻值不得因浮点舍入合并。
2. from_usage 要求三个互斥输入分项均已知、source 为 upstream；upstream_total 至少一项 unknown，所有已知分项之和不超过 tokens；不得把含缓存 total 再加一次 cache。unavailable/inconsistent_usage 可保留完整且相互矛盾的原上游事实，不重写 usage 来通过判定。
3. provenance 中已给的 upstreamRequestId/upstreamModel/servingProvider 与 route 同名已给事实逐项相等；缺席不从本地 route 补。model/provider 的映射兼容和实际上游范围属于固定适配提供者，不由 core 用字符串相等猜测。
4. known output 的 source 分别对应 reply、delivered 或两者均不存在；digest 数量等于实际内容块数量，none 必须空；空 complete reply 沿原规范允许。摘要的格式、序列保留和数量可纯判；真正逐块摘要是否对应原字节需固定 projectionRevision 解释器，在 transport/runtime 验证，core 不临时调用 tokenizer/网络/provider 注册表。reply.response 仍沿既有值/写方责任，不新增历史读取。

所有关系失败只返回既有 malformed，不增加拒绝码；失败是写入事实不合法，不重判模型调用结局。`validate(def, value)` 保留现有 `SchemaValidation` 的 Schema-only 语义，不偷换成关系/来源认证。单独合法 `InputCalibration` 在插入完整响应后可能被 judge 拒绝，这是职责分层，不是 fallback。Schema 资源缺失/编译失败是构建或初始化缺陷，不能吞成业务 malformed。

## 依赖、资源与装卸

MR9 替换规范图中的 MR8，保留现有 22 份精确资源闭包：CA2、CB2/3、IV1、OE1、MP2/5、MS2/3/6、LC2/3/6、AM2/3、TD2/3、SP2、connector2、mcp2、slash2 及当前 MR9；新增六个 defs 不新增外部资源。使用既有 createSchemaRuntime/锁定依赖，所有资源走其 owner 的公开入口，无网络 resolver、私有路径或新第三方依赖。私有成员阶段资源不作为规范资源计数。

本模块无服务、配置、密钥、时钟、业务状态、异步任务、事件及外部 IO；存储要求 **0 项**，装载贡献 **0 项**，撤除义务 **0 项**。同步调用只处理显式值；固定 Schema 初始化成功后可用，失败直接暴露，不进入自动重试。没有可被卸载取消的本包在途模型请求。跨进程只需无损值传递，不新增进程内锁或状态缓存。

S-45 的跨 owner 同提交对象是**既有 session-log 原 batch：同 response payload 内的 inputCalibration 与本次应提交的 reply**，由 runtime/回复写方共同进入 SL3 的同一追加边界；core 不另写第二个对象，也不宣称只读 response 再写校准记录具有原子性。存储不可用/unknown、重送原批和分支授权读取的要求归 RT10/SL3 提供者。身份核实、凭据、时钟、真实停止与日志装配归 runtime/宿主装配 owner；本任务不新建正式 app，未有生产装配验收不提升为已完成。

## 选择与取舍

| 选择 | 落选方的最强论证 | 本方弱点与置信度 |
|---|---|---|
| 共享值留在纯 core，行为留在 model 两节点 | 每个 adapter 自带 DTO 可独立快速开发 | 需同步迁移公共类型；消除同义形状分叉且不制造 fiber。高 |
| 两阶段 judge 加纯关系校验，validate 不改语义 | 单次 Schema validate 的代码最少 | 需要混合错误反例维护次序与两阶段资源一致；MR9 S-44 明确要求。高 |
| 一个窄 copy 公共面，日志 codec 留给 runtime | 消费者各自深拷贝无需新增导出 | 多一个公开函数，但跨 owner 边界可复用相同精确值与所有权规则；不得扩成第二套完整 codec。中，须由实际 transport/runtime 消费验收 |
| 无旧格式执行兼容，历史工件照原坐标保存 | 保留旧 decoder 可继续读取旧 demo 数据 | 当前消费者需一次迁移，旧值明确拒绝；符合当前格式破坏性演进，不用兼容层隐藏遗漏。高 |

## 消费者、文档与验收

实施顺序：接受 MR9/RT10 及本映射 → 本包当前类型/资源/关系判定和 copy → transport/runtime 同批迁移 → 实际 pack 与组合验收。具体候选文件布局可在不改公开面和职责的前提下调整。

transport 负责观察读取、摘要及 φ/δ 的真实依据；runtime 负责 PlanInput、授权历史来源、固定发送、完整响应 codec、Pending 到持久值与原批恢复。两节点直接消费六个类型和完整 judge，不复写同义校准定义；demo、日志测试、core-verification 当前 fixture 和所有类型消费者必须补真实明确分支，不能批量默认 unavailable 掩盖事实采集缺失。

源码包 README/README_ZH 必须同步说明：六个类型与 required 字段；copy 的所有权和局部校验边界；validate 与 judge 的区别；完整 known/from_usage、input unavailable + output known、missing_usage 以及 Pending 示例；旧格式明确拒绝和无来源证明的限制。示例用实际制品严格编译/执行。验收及 G9 缺口见 [verification](verification.md#mr9-输入校准值映射候选)。
