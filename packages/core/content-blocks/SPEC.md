# Content blocks：调用拒绝的表示

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 并实施第二阶段。
本页接续 AR-1；公开类型与当前 Schema 拥有形状。本次只修订调用拒绝的表示，未迁条款、旧规范实例和 retained Schema 的验证义务保持。

拒绝调用有正式的 before_action 拒绝依据，但没有工具执行。它以 denied 的 ToolResultBlock 表达，不能进入 ExecutionOutcome、执行账或后台执行完成提醒。

拒绝回复保留 callId、拒绝类别、原原因和正式结论引用。admission 的六种原因必须分别保留；extension_veto 和 admission_unavailable 分开表达。不得伪造成 failed、unavailable 或 interrupted。拒绝块不能带 offloaded。

模型可见的拒绝说明由协调拥有者写进 blocks；仅有结构化 reason 不保证模型收到说明。此包校验表示，不签发授权，也不证明所引用结论真实存在。

当前 Schema 的公开 URI 保持。当前资源由本成员维护，旧冻结资源只约束未改部分与历史输入。迁移测试校验具名变化及其余形状未变，原规范实例继续运行；不更新历史冻结散列来消除差异。

## JSON 公开边界

本节按共享机制投影的限定采用
接续 README 的 JSON 承诺；不修订上面的调用拒绝语义。

readJsonStrict 拒绝解码后重名成员。普通安全整数字面量使用 number，
小数、指数、不安全整数及负零以 LosslessNumber 保留数字原文。
不能用 Number(source) 代替精确边界或相等判断。

copyJsonValue 返回自己拥有的独立深冻结 JSON 副本，拒绝非 JSON 值、访问器、循环及非 JSON 属性。
复制不调用普通 getter 或 toJSON；这不是 Proxy trap 不执行用户代码的保证。
writeJsonLossless 对非 JSON 值抛 TypeError，不静默省略无效输入。
无损读取及写入要求运行时支持 JSON.parse 的 source 和 JSON.rawJSON；缺失时不能宣称无损。

OpaqueJsonValue 只用于不透明交换。复制其表示不保留领域品牌，
包装、读取或成功校验不授予领域内容检查、租户访问或业务授权。
本节不把 index 的重导出解释成全部内部文件都属于公共 contract 层。
