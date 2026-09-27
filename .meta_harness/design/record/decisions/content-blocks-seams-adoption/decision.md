# D-068 · 内容块无损数值与生产者铸号分工

2026-09-27，主线依据用户“自己设计和架构、交 Sol xhigh 实际编程、负责验收 review、决定是否接受”的授权，接受[提案 R2](../../proposals/content-blocks-implementation-seams/README.md)的 N-A＋I-B，范围限以下映射。用户没有新增产品政策；冻结 CB/AE/messages 等 v2 不变，catalog 身份与冻结资源不改。

## 采用与理由

content-blocks 继续是无状态纯模块。严格 codec 保留真正数值，具名拒绝按 JSON 值类型判；只有末位 Schema 判定使用当前 CB 专用的四类数值代表视图，原 Schema 原样由 Ajv 8.20.0 编译。成功输出保留原内容的冻结副本，不修改调用者输入、不泄露视图。选择理由与数值等价范围见提案；N-B 的无复制优势真实存在，但当前没有测量收益支持引入通用派生 Schema 引擎。若数值谓词增长或内存成本不成立，重新比较。

普通新消息、工具侧块与新增派生块继续沿既有随机生成器；pi 保留自身 b 加索引与确定性 CallId。交换词法始终由现有 S-31 约束，不能收紧为 26 字符。pi 哈希的合法输入成功路径精确编码和无界整数表示按 R2 固定，**不因此许可完整 pi 入口施工**。

## 精确取代范围

- 限定取代 D-060 M44 与 D-062 接受的 CB 节点中“所有生产者沿同一生成器”的普遍陈述：仅普通生产者成立，pi 有明确例外。CB 公开面／责任表／生成器选择／CB-1，messages 的 MessageId/BlockId 共用生成概括同步精化；接收、相等与唯一性范围不变。
- 补足 CB 严格 codec 到本地 judge 的桥接。D-062 接受的 Ajv、原 Schema 副本、固定拒绝次序、纯模块边界不变；其余 data 节点不能自动继承本私有视图。
- pi 只精化 T-13 的哈希编码和合法数字表示；原 fork、请求、生命周期、计费与失败边界不变。没有新增服务、插件、全局发号器或持久状态。
- 原接受文件与 R1 原件不覆盖。新的节点／候选输入 hash 见 [快照](provider-snapshot.json)，新需求技术视图归 PF-009 rev8 的局部 projection/v1。

## 评审、实施门与验证

R1 的 architecture/spec 两份独立意见及 R2 复核归[评审记录](../../proposals/content-blocks-implementation-seams/review.md)。R2 design SHA256 为 `2dde0ba100823fcfa6dc4f763760e0893d42c2a78395059ae0ad6632ff37feda`；两者未发现阻断 CB 独立实施的问题。主线接受选择，评审未代替采用或测试。

准许准备 CB 独立 codec／形状／judge 的施工与验收。NS-1～3、IS-1 的本模块部分须由实现测试兑现，模块级 `opaque`/arguments 无损不等于每跳无损。附件解引用、会话日志写入不变性、消息级查重、CallId 登记判重／恢复均在别处，不能把包存在写成整体保证。

**仍阻断对应消费者**：pi 非法 target 的 planRequest 收口；模型运行时的 CallId 判重键、碰撞与重放恢复；arrival-events/messages/model-profile/call-accounts 和工具作者 Schema 的无损数字到完整校验器映射；D-019 比较门。两条文本实测与一次开发探针工具往返都不能替代正式 pi 对照及运行时验收。本次无新产品代码、无绑定、无正式符合性运行。
