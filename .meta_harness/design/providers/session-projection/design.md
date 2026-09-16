# Session 投影提供者设计映射

目标是从已校验的完整提交前缀构建 Session 范围的派生视图。语义依据见[Session v1](../../spec/capabilities/session/v1/contract.md)、[Run v1](../../spec/capabilities/run/v1/contract.md)和[消息流 v1](../../spec/capabilities/message-stream/v1/contract.md)；三者当前均为 candidate。来源是[旧提供者设计](../../../../packages/session/projection/design.md)，其曾接受的最小施工映射及当前 `/baseline` 源码不构成本目标实现的符合性证据；来源哈希和实际结果记在[验证记录](verification.md)。

## 能力到 Cordis 的投影

| 契约责任 | 目标提供与权威边界 | 当前实现状态 |
|---|---|---|
| SE-10 状态贡献 | `SessionProjectionPlugin` 候选默认入口提供 `omneSessionProjection`，按 Session scope、`stateKey`、Schema/input/reducer 版本、贡献 owner 和 generation 管理确定性 reducer；Run driver 用 `run.driver_position`、`kind: projection` 登记（RN-07） | 仅有 `ctx.sessionProjections` baseline registry；不是目标服务或精确注册契约 |
| SE-03、SE-10、SE-20 受限读面 | 本包实现同一完整 fold 水位上的 `history`、`changes`、`snapshot`、列表/队列/运行视图；`omneSession` 的读面取得适配器，按当前权威授权裁剪后才返回 | baseline 只有按内存 `Session` event seq 的快照/监听，没有 CC commitPosition 的授权读面 |
| CC-01、CC-06 完整性 | 只消费 DR/CC 确认的同一协调域完整 committed batch 和可发布恢复基线；完整覆盖水位由输入前缀证明，不能从 reducer 已运行推断 | 目标未装配 |
| MS-11、MS-12、MS-22 消费 | 向消息流提供授权后按原 commitPosition 分组的补齐与全量快照；MessageStream 只投递提示并消费本服务，不代替 fold 或授权 | 目标未装配；[消息流映射](../message-projection/design.md)另管传输 |

`SessionProjectionPlugin`/`omneSessionProjection` 是目标接口名称，公开签名要由实施与受限消费端共同核定。没有必要保留 baseline registry 的 API 或其 `SessionSeq` 编码；按新契约直接重构，以一个服务兑现所需语义。Run driver 贡献的状态是 Run 事实的派生值；投影失效不改变 Run 当前状态、epoch 或占位。

## 依赖、作用域与绑定

| 消费的保证 | 目标输入和绑定 | 缺席、撤回或旧引用 |
|---|---|---|
| Session SE-10/SE-20 | required `omneSession`：受限贡献登记、Session 元数据与当前读权；目标插件还 required `omneDiagnostics`。普通查询通过 Session 读面暴露，不给调用方原始 reader | Session 或授权 resolver 不可用时查询 unavailable；`Context` 服务可见不授予披露权 |
| DR/CC 完整前缀与恢复发布 | 经 Session/恢复宿主注入同一 coordinationDomain、完整 `commitPosition{domain,seq}`、输入类型版本和 owner generation；实现可通过受限 DR reader 取得事实，不能自行发行提交水位 | 缺提交批、坏前缀、旧 generation 或未发布联合基线则不能宣称 `completeTo`；不默认空 |
| Run RN-07/08 | Run driver 在 Session 的贡献面登记 `run.driver_position`，输入是 Run/Step/等待的已提交事实；reducer 版本供重取兼容性核对 | reducer 缺席/不兼容则视图 unavailable；新 Run 执行资格由 Run/恢复门决定，本包不代裁决 |
| M/HD/Tools/EH 的贡献 | 各 owner 提供可 fold 输入与自身的可见性规则；投影按同一 `asOf` 调用，`requests`、`calls`、attempt disposition、续跑计数不移转到本包成为权威 | 某个全量快照必需贡献缺失则该快照 unavailable；不能借缺席推断无请求、无调用或无正文 |

作用域至少绑定 tenant、SessionRef、coordinationDomain 与提供者 generation。`stateKey` 在其声明的 scope 唯一；同 scope/key 冲突拒绝，不能因为版本号相同就让不同 reducer 函数共享首个实现。注册时保存精确 owner/schema/input/reducer 版本；撤回只释放本代贡献，旧 disposer 不可删除新代注册。对已有耐久事实的解析兼容性按 SE-10/SE-11 检查，缺解析器即保持 unavailable。

## 折叠、缓存与受限查询

投影从可核实的原提交顺序折叠，按完整 commit batch 原子推进；同一批的 history、正文引用、`attemptStateUpdates` 和其他派生状态不得拆成两个安装水位。`completeTo` 只到所有必要输入都完整 fold 的最末批；`floor` 是可服务下界。`changes(after,to)` 的 `latest` 在调用开始固定为具体 `resolvedTo`；本次 `coveredThrough` 不超过 `resolvedTo`、请求的具体 `to` 和本代 `completeTo`。隐藏批可以固定编码为空组或由覆盖水位跨过，不产生对象级占位或存在性判断。分页只在完整批边界切；超页大小的单批独占一页。

`snapshot(session, principal, replacementToken)` 在同一 `asOf` 返回获准完整集合、collection-level coverage/floor/visibilityVersion，以及 history、attemptStates、queue、requests、calls；不接收客户端猜测的 attempt identity。`changes` 和 `history` 均在请求时通过 Session 和贡献 owner 的**当前**读权裁剪，撤权后旧缓存不得继续披露。`visibilityVersion` 由 Session 读面拥有，只在授权投影定义变化时换代；隐藏业务提交可推进 `asOf` 而不改变它。客户端的 snapshot 原子 CAS、完整批安装和 cursor 规则分别由 SE-10/MS-11/12 消费，不由投影服务猜测安装成功。

M 的 durable current disposition 和 `attempt.closing.pending` observation 在同一批折成完整 `attemptStateUpdates`：closing pending 即使没有 terminal revision，仍给 `in_progress{pendingReason:outcome_unresolved}`；durable business unknown 给 `settled_without_message{outcome:unknown}`，后续 revision 更新同一 attempt，不能重复语义关闭。缺失条目、无权或 retention 过期只给集合级结果；本地旧草稿缺席不证明业务 outcome。历史正文身份和顺序按 SE-03 的原 `eventId`/ordinal 派生，本包不另发号或建第二条耐久历史流。

checkpoint 仅是可丢弃的 fold 加速物，至少绑定 tenant/SessionRef、`stateKey`、reducer/schema/input 版本、来源 generation 与完整水位。水位越界、Session 错配、版本不符、坏 schema 或缩短的事实尾部使 fold 缓存失效；授权版本变化使已裁剪的输出缓存失效，原始 fold 仍须经过当前授权才能返回。无法取得重建所需前缀时保持 unavailable，不把空缓存作为空集合。缓存行不能取得写入 Session、Run、M 等权威事实的权力。

## 装载、并发与失败

| 资源或贡献 | 本代拥有者与可用时点 | 撤除与失败收口 |
|---|---|---|
| `omneSessionProjection`、Session 受限查询适配 | 同一插件 generation；验证前缀、贡献版本、授权入口和初始 fold 后才可供受限消费 | 先封本代新查询；在途读返回前复核当前披露资格，撤权或换代后明确失败，不让晚到结果跨 generation 安装 |
| reducer 登记、变化订阅 | 各贡献 owner 的精确 registration；投影 provider 纳管订阅和折叠任务 | 撤回本代登记与订阅，停止新输入并等待任务实际静止；保留原权威事实，相关视图 unavailable |
| 派生缓存与重建任务 | 投影 provider；缓存只在输入版本、generation 和完整水位一致时可使用 | 可丢弃缓存；部分初始化失败也释放已取得资源，不恢复全局旧快照覆盖其他贡献 |

插件 apply 时捕获实际 Fiber 与本次 generation；使用前复核当前挂载、Session/tenant scope、贡献和授权，不能把插件外壳仍存在当作当前可用。重建期间查询返回 rebuilding/unavailable；坏前缀、缺贡献、读权 resolver 失败和取消都不能转成默认空结果。投影失联不撤销已提交事实、Run 或其他合法读面，MessageStream 需报告自身源不可用或要求重取。

## 交接与旧设计差异

原设计有效保留的是：Run driver 位置只能派生、stateKey/版本约束、缓存可弃重建、受限查询适配、按插件 generation 管资源。新 v1 扩展到完整 CC commit batch、`completeTo/floor`、`changes/snapshot`、M disposition 与 closing pending、授权集合不干扰和原批原子安装；baseline 的 event seq/`onChanged` 不是这些协议的替身。产品接口、恢复宿主和端到端验证缺口见[验证记录](verification.md)，实现前需与[Session](../session-session/design.md)、[Run driver](../agent-run-driver/design.md)和[消息流](../message-projection/design.md)的消费者对齐。
