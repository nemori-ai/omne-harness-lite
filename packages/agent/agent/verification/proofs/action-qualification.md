# 原动作资格的局部安全性

本证明对应 [成员契约](../../SPEC.md#原动作资格读取)及 `createAgentActionQualification`。这是条件式手写证明，不是整个 C3b 的实现接受，也不是机器检查或活性证明。

## 对象与前提

令请求 x 为 tenant、execution、完整 attachment、action、passage、原调用、有效参数和 Tool 采用的元组。原 Journal 在读取资格成立后返回快照 S、修订 r、历史依据 h。令 M 为该快照 step 与 batch.source 指定的原 received entry 及材料，D 为可信 Tool 描述结果。

前提：Journal 负责租户隔离和原执行读取；同一执行中影响快照资格的变更推进修订，修订不能复用。原 received 材料按其证据保持原内容；Tool 描述来源履行其受信装配契约。调用方不能仅凭自报字段成为这些来源。身份编码由原身份成员拥有。

## 全化判定

定义谓词 P(S,x)：执行与完整 attachment 相同；状态为 advancing、reconciling 或 waiting；恰有一个原 action；其判断为 pending 或 waiting，passage 与有效参数相同，尚无 Tool call。

定义 O(M,x)：共享原结果读取器在指定 step 找到 batch.source 的 Model 结果，材料绑定合法且能形成完整回复，其中对应 callId 的 tool_call 与 x 的原调用完整相同。定义 T(D,x)：可信描述返回 tool，精确 Tool 采用与 x 相同。

Q(x) 按顺序读取原来源。读取失败保留原失败；位置错配返回 denied；缺少描述或外部异常返回 unavailable；仅当 P、O、T 同时成立时返回观察 (x,r,h)。输入定位在首个 await 前复制，因此调用方随后修改原对象不会改变本次 Q 的 x。Q 不写入许可或业务状态。Q 的结果覆盖已校验契约输入和依赖失败；它不承诺无响应的依赖一定结束。

## 安全性论证

1. 不混用动作。唯一成功出口在 P、O、T 之后。action、passage、attachment、有效参数、原调用或采用任一不匹配都会在成功出口之前退出。
2. 不把表面相等当作来源。P 来自原 Journal，O 来自原 received/material，T 来自可信 Tool 描述。请求自身的副本只用于比较，不能制造来源。
3. 不在读取失败后继续探查。Journal 失败分支先于材料读取，不能通过资格读口越过原访问拒绝。
4. 不自动授予。返回类型不含 allow 或可发起调用的令牌。waiting 判断可以证明原动作位置，不能证明答复或许可成立。

## 与提交的组合义务

原 Agent 采用 a 是上述同一个快照 S 的 checkpoint.definition。成功观察还携带 a 的副本，既不接受调用者传入 a，也不为取得 a 再次读取 Journal。因此扩展后的观察为 (x,a,r,h)，a 与 r 来自同一次 load。x.definition 是 Tool 采用，与 a 不可互换。后续按 a 读取不可变定义的权限上界，仍须由捕获事务核回 r；本字段不自行建立上界读取或允许结果。

令 F(x,r) 为原持久拥有者在实际捕获事务中的只读核验：tenant 与 execution 归属正确，当前修订等于 r。若原拥有者满足前述单调修订和材料稳定性，Q 成功且 F 成功，则 Q 所检查的快照事实没有被中间变更替换。Tool 发行、当前权限及运行来源有各自独立的当前性义务，F 不替代它们。

反例：Q 读取 pending 后，另一推进将动作改为 denied；若消费者不核 r，旧观察仍可被使用。Q 单独不能排除此执行。当前读口实现不证明 F 已装配；同事务核验及竞争验证归后续持久拥有者与捕获适配。

## 实现守护

- `tests/action-qualification.spec.ts` 使用真实 Agent loop 和内存原 Journal，覆盖有效待判、位置及调用错配、原访问拒绝、材料异常、描述缺席、跨 await 输入变化及判断结束后的拒绝。身份及 Tool 描述是测试替身。
- 应用 `tests/rows/authorization/agent-action-qualification-sql.spec.ts` 使用实际 Session Journal 与 SQLite Worker，提交原 received/material 和待判动作，验证新 Journal 实例重读及参数变更后的拒绝与修订变化。外部 Model、Session 访问和 Tool 描述为具名夹具；它不验证 capture、完整宿主重启或实际 Tool 发起。
- 原 `loop-tools.spec.ts` 保持共享读取器在 coordinator 的行为回归。

运行：`pnpm --filter @omne-harness/agent exec vitest run tests/action-qualification.spec.ts tests/loop-tools.spec.ts --mode fast --typecheck.enabled=false`；应用运行上述 SQL 文件。单次输出留任务 tmp。
