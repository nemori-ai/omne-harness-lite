# 模型请求与Session事实的集成边界

模型请求的十五操作、失败和费用责任归[公共SPEC](../SPEC.md)。`ModelRuntimeOperations`归本包纯根，`ModelRuntimeService`归`./cordis`；提供者实现同一公开接口。`createModelRuntime`保留独立调用能力，不要求调用方使用Cordis。

Session事实用于证明原准入、归因和终结，不接管模型发送、重试、首token、凭据、响应或结算。具名接缝与生命周期归[运行时集成](runtime-integration.md)。完整Session准入、生产历史、G28与保管/ACK装配的兑现由对应拥有者负责；接口存在不认证生产来源。

## 事实与副作用的拥有者

- 原调用归因以历史issued证明和原固定输入核实。不能只认最新attempt，也不能用用户提交的start事实认证。模型计划只消费Session已组装的固定messages与完整profile/tools/参数，不重新扫描所有Session上下文，不在transport按字符串删attempt消息。
- G28终结由Session唯一终态事实/同prefix端口提供。原withRun批次保留真实tail条件和原late值，迟到保存不重算费用归属；来源未知为unavailable，不能猜测未终结。
- prepareCall后的open/dispatch须使用原子issued端口，对齐原已出门锚点和唯一execution owner claim。重复证明仅供查询，不能授权第二次发送；当前授权和原位置证明都必需。
- 模型执行池与原ACK custody按其生命周期接续，不因Agent scope撤除而取消。Session保管凭证只有在完整原Pending及必要引用可靠保存后，才可映到acknowledgeCall的接受条件；它不写replyDisposition或最终费用。

## 同提交接缝的理由

模型提供者的`OriginalIssueParticipant`在协调者给出的同实例unit中暂存原已出门及唯一执行claim，不独立commit或IO。统一提交后由原执行拥有者发送。该窄端口及准入桥是明确construction输入：Session不读模型私有表，独立模型核心不反向依赖Session类型。其他提供者须给出等价原子准入证据。

已出门、dispatch序号、first-token、恢复和费用语义仍由公共SPEC约束。ACK适配归模型拥有者，不能把不同确认条件压成一个布尔ACK。demo/reference适配只说明已知局部事实，不表示完整生产宿主已兑现。

操作的身份、授权、幂等、提交、通知和在途共用规则归[Session共用规则](../../session-runtime/adr/shared-operation-rules.md)。源码、公开承诺与实际组合证据分别说明自身范围，不从目录存在推断实现完成。
