# 同日志解释的纯层

本包实现 [FR-01 至 FR-07](../SPEC.md#fr-01) 的 Session 类型、决定、投影与归约校验。共同日志提供者仍须取得真实原材料、执行原协议解码、完成前缀准备并串行发布。纯函数不证明一个调用者同时伪造的完整一致快照，也不提供持久化或跨进程保证。

## 输入与失败

[history-values.ts](../src/history-values.ts) 定义可信根、完整输入目录、原执行与 attempt、批次和读取材料。`historyIndex` 来自同根原日志；`reads` 只能补充它已有的原事实。空数组不证明未知关系不存在。根位置、Session 修订、执行修订与事件序号分别核验，整数文本按精确十进制处理。

`decide` 在后继首条输入与全部 SE38 路径核对相应输入范围。`projectSessionLog` 保存真实 head 回执与原事件来源，逐项检查同次观察中的登记、等待和结果。`reduce` 用相同本域校验拒绝矛盾的新协议批次，不发布临时状态。已提交副作用必须在原快照中成立，读取材料不能代替它们。原事件重放仍核对来源与固定身份，但不重新施加旧等待或旧控制进度。

同日志批次同时核验后果与执行进度。每项后果须有匹配原执行的进度行，推进范围内须有全部适用后果。缺任一项则隔离整批。entries/results 对账保持已有事件序号，不虚构新 cursor。归约在同批临时状态中核对调用的原 SE15 与原事件 Run；旧 call 分支遵循相同约束。

缺少必要原材料返回 `unavailable`；错域先返回 `denied`。输入字段错误返回具体 `invalid`，固定绑定冲突回显本次 `observation.operation`。需要冲突身份却省略 operation 时返回 `unavailable`。新完整日志的矛盾在归约入口返回 `quarantined`。精确解释采用不匹配仍按原版本边界拒绝。

## 登记、控制与压缩

[call-values.ts](../src/call-values.ts) 区分真实 associated 调用与没有 invocation reference 的 Tool intent。原 Model purpose、固定请求和原 attempt 保持不变。取消后关联只转换原控制的核对目标，不恢复业务等待。

[work-entry-values.ts](../src/work-entry-values.ts) 定义原条目引用。归约从真实 `HistoryEntry.id` 保存首次 SE18、当前 SE22、原 SE24、当前 SE25 和关联条目。控制保存其原选择，责任完全结清后才退出压缩下界。`decide` 先核对 `compaction.open`，再调用原 Message 压缩判断。非消息不能伪装成 retained；未结责任期间可能没有合法的第二次压缩范围。

## 验证资源与提供者交接

- [frontier-behavior.spec.ts](../tests/frontier-behavior.spec.ts) 检查根与原事实、完整后果、操作身份、PM-02 的精确剩余集合、历史承接以及未关联责任。
- [frontier-release.spec.ts](../tests/frontier-release.spec.ts) 检查冻结取消、收束与归档的完整解除，以及普通取消和 active freeze 的原门槛。
- [work-entry-behavior.spec.ts](../tests/work-entry-behavior.spec.ts) 检查原控制引用、逐项漏下界、缺索引、非消息压缩、责任结清及旧事件重放。
- [same-log-integrity.spec.ts](../tests/same-log-integrity.spec.ts) 检查直接归约的跨 Run 拒绝、双向批次完整性、空事件对账及合法迟到认回。
- [history-source-isolation.spec.ts](../tests/history-source-isolation.spec.ts) 检查同文本身份在不同租户、不同 Session 的原事件、目录、前缀与根隔离。
- [testing-history-source.ts](../src/testing-history-source.ts) 是显式填入原事件与原受理的内存夹具。grant 与 attachment 由测试提供，不从 pending 或页长度产生。`observe` 从观察值取得显式 tenant/session，`admit(scope, input, admission)` 必须传同样的作用域。`read` 按 snapshot 的作用域读取，拒绝另一作用域的 Session 原日志。根位置和摘要只包含本作用域材料。它不证明 Agent 原协议归一。

服务提供者在纯归约后必须从新共同根更新可信历史索引；不能把前一次根或目录带入下一次提交。捕获 E 的全部前缀、共享隔离门、当前 grant、预算接续和最终共同根提交归 [AD-02](../../session-adapters/SPEC.md#ad-02)。本包用例不证明这些适配责任或完整组合已经实现。
