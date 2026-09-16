# Message Stream v1 验证范围

| 范围 | 当前证据 | 未覆盖 |
|---|---|---|
| MS-01～MS-19 | Cursor 窄抽象；ChangesDelivery 与 SnapshotReducer 有限模型检查授权 changes、完整安装、hidden-only 水位、full snapshot CAS 和可恢复读取失败；AuthorizationNoninterference 检查猜测身份观察 | 真实 projection、授权、传输、客户端事务与页面分批 |
| MS-20～MS-24 | 规范场景及 MessageDelivery、DispositionRecovery、ActiveHandoff 有限模型分别检查事实提示、耐久处置与 active 交接；JointProjectionRecovery 联合检查单 attempt 下 M/Session 投影与客户端安装的有限交错 | 多 attempt/epoch、完整 active 队列与源恢复、真实 provider/client、媒体耐久和源代次实现测试 |

本候选登记的 10 项新增正配置已由 TLC 2.19 在固定有限域执行，18 项受控变异按目标失败；独立
GPT-6 Astra 对 exact model `4e897850`、证据 `e1d8aa8` 和文本 `480c7057` 的 Git blobs 重新执行
28 项并核对哈希，结论为有限范围 PASS。完整配置、原始日志、状态数、action coverage 与假设见
[模型说明](v1/formal/README.md)和[新位置的原始证据](../../../evidence/formal-2026-09-16/message-stream-28/run-report.json)。旧 Cursor 两项仅保留
其窄范围登记，不借用旧日志作为这套新协议的结果。当前只有 projection registry/fork 与 agent-loop
构造原语；没有消息流 host、transport/SSE endpoint 或符合性声明。

独立 ActiveHandoff 检查发现小容量会真实 overflow-resubscribe：有界进展只在有限发布、最终公平执行及
buffer 至少容纳 `2 * (MaxChunks + 1)` 两代最坏重叠时声明。这个数值仅是当前有限模型域的配置前提，
不是生产 buffer sizing 契约；持续生产、反复 overflow 与容量不足不在 liveness 承诺内，这些 trace 仍须
保持 safety 且不得阻塞 durable channel。

新增 ChangesDelivery 有限模型覆盖 hidden-only 无帧推进、state-only closing、事实提示先到而正文缺失、
具体 `to` 上界不越界；SnapshotReducer 覆盖初始空快照、授权换代、三重 CAS 与读取失败恢复。
[JointProjectionRecovery](v1/formal/JointProjectionRecovery.tla) 进一步在同一有限状态机检查
增量、快照、M 处置与 Session 授权投影的竞态；旧快照 `asOf` 落后已安装游标的反例实际可达。
这些检查仍不证明墙钟有界轮询、任意记录批/分页、真实 retention 或事务存储。

Round3 游标入口检查：MS-07 的 cursor 代表授权视图已完整安装前缀；MS-08 增量 changes 与 MS-12
全量 snapshot CAS 均可合法推进。`resync:full/resumable:null` 时禁止先 changes，snapshot 安装得到
asOf/visibility 后才接增量；`resync:none` 只用有效旧 cursor。覆盖首次、保留期掉出与授权换代。
