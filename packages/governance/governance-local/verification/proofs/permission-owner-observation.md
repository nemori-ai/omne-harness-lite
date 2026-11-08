# 权限捕获的原资格观察

行为承诺归 [SPEC GL-26](../../SPEC.md#gl-26-受保护的当前权限读取)。原请求形状归 [operation-schema.ts](../../src/operation-schema.ts)，比较归 [permission-operation.ts](../../src/permission-operation.ts)。这是条件安全性论证，不是模型检查器的穷尽证明。

## 模型与前提

令 P 为原权限请求，W 为具名外域 qualification，B 为包含 P/W/目标/来源计划的原请求摘要。C 是 project 选择的 SQL 组合，E 是保存的 execution，F 是最终 SQL 封套。Governance 不判断 W 的领域真伪。受信应用必须通过原拥有者取得 W，并在 C 中组合原拥有者的当前性检查。摘要抗碰撞、SqlStorage 原子性和材料目录可信是前提。

## 原观察不替换

accept 保存包含 W 的原 command，B 覆盖它。project 只获得这份已固定 command 的复制，不持有活 context。返回的 C 与命令在 await 前经 schema 解析成为独立快照。E 和 F 使用同一 C；原 stage 校验二者一致并拒绝同阶段输入替换。最终写者从原 command 取得 W，与当前事实中的 qualification 做完整比较。因此成功终态不能使用 W′≠W 的当前事实。

回调返回后修改其对象，不改变已解析的 C/F。恢复重放原 stage，不重新运行 project 或取一个新的 W。如果原 owner 在捕获事务内拒绝 Current(W)，整个捕获回滚，不能保存 current。只有当应用确实将 owner 检查接入 C 时，最后这条结论才覆盖真实动作；保管机制单测不证明该接线存在。

## 可执行反例与边界

- [permission-operation.spec.ts](../../tests/permission-operation.spec.ts)：在真实 Worker 上接受原观察，然后提供另一修订；终态写者拒绝，原操作保持 submitted 且 result=null。
- [permission-reader.spec.ts](../../tests/permission-reader.spec.ts)：同一读取器选择同域两个已登记组合；执行记录与原封套保持所选组合及原观察；微任务在回调返回后篡改组合和命令也不能改变已固定执行。
- 原请求重传、seal 在先、缺 Identity 持有及来源保管的既有反例继续有效。

这些测试的动作拥有者是具名夹具。它们证明保管、绑定及组合选择，不证明 Agent/Tool/Session 生产事实已进入权限捕获。真实 owner 接线及关闭重装配的完整接受由应用验证负责。current 是一次读取的结果，不是后续执行的许可。
