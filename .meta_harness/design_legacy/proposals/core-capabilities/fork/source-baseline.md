# 语言无关的源基线

本页记录固定上游 `c291e7961a515f6d7af9304e7fd1d257929aef26` 的观察，
不登记为目标规格。选取文件由包的 provenance 保存并与官方 archive 核对；
后续专题的精确切片说明在这里链接。D-008 的产品类型不由这些源类型取代。

| 源机制 | 状态、生命周期、失败边界与裁剪 |
|---|---|
| 模型消息、流和有限媒体辅助 | [LLM 与媒体](llm-source.md) |
| Session、派生投影与持久化接口/校验 | [Session 与存储](session-source.md) |
| 普通文件读写、同步与截回 | [JSONL 文件原语](jsonl-source.md) |
| 动态 prompt 贡献、Schema DSL 与 native 工具调用 | [Prompt 与工具](tools-source.md) |
| 上下文及 assistant 流投影 | [Loop 切片](loop-source.md) |

活动入口与当前验证见[布局交付](package-layout-delivery.md)，首次导入的历史结果见
[原交付记录](delivery.md)；源码和原件对应关系由[各职责包](../../../../packages/README.md)
自己的 provenance.json 维护。

## 公共支撑与 scope

品牌辅助只在类型层区分基础值，运行时不改变字符串或数字，不分配身份。
值辅助验证／复制可无损 JSON 化的值、比较其内容、递归冻结；无法表示的值
用显式失败结果返回，不将 undefined 或特殊对象悄悄转换成普通 JSON。
超时辅助计算受限时间、组合 abort 来源、启动 deadline/idle 观察并释放计时器；
它通知取消原因，实际停止工作由消费者负责。

scope 将对象身份绑定到一个受管上下文，并建立可检查无环的父链。贡献读取
沿当前 scope 及祖先查找，路由按 carrier 与登记 scope 过滤。条目表区分
命名项／匿名项，保留稳定顺序与精确删除身份；由贡献者上下文拥有撤回动作。
关闭 scope 等待其真实生命周期结束，旧释放不能删除后来登记项。该源机制
是运行时可见性，不承担租户权限、永久数据或安全执行隔离。

唯一 scope 实现归 `core/scope`，agent 和其他能力统一消费
`@omne-harness-lite/scope/baseline`。不能另外复制同源 Symbol/WeakMap：它会形成两套无法共享
父链和标签的活动状态。既有 agent 源基线的 registry/factory/initiator 语义不变。

上述源行为由固定源码和所保留测试支撑；D-008 另要求精确持久身份、当前授权、
耐久交接和执行权。源测试通过不表明这些目标已经实现。
