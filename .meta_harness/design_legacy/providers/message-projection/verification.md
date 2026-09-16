# MessageStream provider 验证边界

当前只有 projection registry/fork 与 agent-loop stream 构造原语；MessageStream service、durable disposition
projection、active callback/snapshot、transport/SSE 和 client reducer 均不存在。符合性需注入 listener effective/callback
乱序mutation、compact fold、empty→live竞争、terminal-before-listener、unknown revision、retention、generation/visibility、
overflow、client crash和旧撤回器。Cursor模型不覆盖这些并发性质。

新结构链静态验收还须覆盖：durable business unknown 与无 receipt `outcome_unresolved` 的两个 reducer
分支；无 terminal revision 的 closing batch 仍产生完整 attemptStateUpdate；snapshot 无 guessed-identity 输入且
hidden/absent/expired 无逐项 oracle；完整嵌套 dispositionRef；M marker 到
E 控制帧的唯一映射。Active handoff 的进展测试只在有限发布、最终公平且容量至少
`2 * (MaxChunks + 1)` 时成立；该数值只是当前有限模型配置，不是生产 sizing 契约。小容量反复 overflow
是允许的非进展 trace，仍须保持 safety 与 durable 独立进展。generation 验收还须证明 M marker 与 E 控制帧
是两个协议对象间的唯一对应映射。

Round2 必验 hidden-only no-frame 对账推进、state-only closing 批、事实末帧先于正文/状态、`to=p11` 且全局 completeTo=p12 的 bounded response，以及历史分页完整批边界。

Round3 验证 full 首次/过期/visibility 换代三种入口均先 snapshot CAS，再 changes；none 的有效
cursor 可直接 changes。空 cursor 或旧 visibility 调 changes 必须拒绝/重取，客户端安装状态与 cursor 不回退。
