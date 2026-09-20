# data.agent-runtime-identity v1

## 身份含义

本契约只定义跨运行时边界复用的身份值，不定义租户成员关系、Agent Definition
资产或 Session 的完整记录。行为消费者引用本精确版本。

- **ARI-1**：`tenantId` 是租户权威分配的非空不透明字符串。它不是自然人全局
  身份，也不是授权凭证。`sessionId` 是 Session 权威分配、在所属租户内不复用的
  非空不透明字符串；逻辑删除后也不能分给另一会话。运行时不另造 Session ID。
- **ARI-2**：`SessionRef = {tenantId, sessionId}`；两字段共同相等才指向同一会话。
  不要求不同租户的 sessionId 不同。标识逐字精确比较，不能自行大小写折叠、裁剪、
  Unicode 归一化或用有歧义的字符串拼接代替元组。
- **ARI-3**：`AgentRef = {tenantId, sessionId, incarnationId}`。incarnationId 由运行时
  权威在每次激活尝试时新分配，在同一 SessionRef 的所有生命期（含进程重启、
  准备失败）内不复用。实现可使用适当的持久分配或带启动身份的唯一值；单独的
  进程内递增数不能兑现此要求。AgentRef 相等须三个字段全部相等。
- **ARI-4**：SessionRef 表示长期关联，AgentRef 表示一次运行时生命期。重新激活
  同一 Session 必须产生新 AgentRef；旧 AgentRef 不自动解析成新实例。
  Run、模型请求、工具工作、Definition 身份均不能拿 incarnationId 代替。
- **ARI-5**：身份是可传输的数据。AgentHandle、Context、授权依据、工作许可及
  注册撤销能力是另外的受约束能力，不能由知道或反序列化 AgentRef 获得。

结构由 [Schema](schema.json) 约束；分配、唯一性、来源可信性和授权由行为边界
兑现，JSON 校验不能证明它们。此版本不约定对外 HTTP/RPC 格式或 ID 编码算法。
