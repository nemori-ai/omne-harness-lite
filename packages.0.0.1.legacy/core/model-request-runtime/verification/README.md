# 模型请求集成的机制验证

[目标边界](../adr/runtime-integration.md)区分业务承诺、调用方主体和资源保有。本目录只维护可复跑的机制资源，不保存一次运行报告。

## 调用方接收者

从仓库根执行：

```sh
node --experimental-strip-types packages/core/model-request-runtime/verification/models/caller-context.ts
```

本探针使用当前锁定 Cordis 的真实 Context、Service、plugin 和嵌套接收者。它检查两个独立调用 fiber 的主体绑定、跨 await 保持、返回门面的原主体撤权、重复调用、服务键撤除后原实例投影与未知主体拒绝。该原实例投影只检查方法接收者，不证明被撤来源的物理资源仍保有。

以下负控必须在具名主体断言失败并退出非零；解析、依赖或超时错误不是有效负控：

```sh
node --experimental-strip-types packages/core/model-request-runtime/verification/models/caller-context.ts shared-entry
node --experimental-strip-types packages/core/model-request-runtime/verification/models/caller-context.ts mutable-current
```

shared-entry 模拟共用入口的主体登记被另一个请求覆盖；mutable-current 模拟返回门面从全局当前主体读取资格。正控不得采用这两种行为。

主体是受控对象，撤权是受控变量。这不是生产认证、租户授权、SQL 同提交、原 writer 静止或 Session 整体恢复的验证。
Service 的接收者 Context 可以是追踪派生对象；探针按真实调用 fiber 定位受信登记，不依赖 Context 对象全等。该定位不授予权限。

## 现有业务模型与真实组合

完整请求、OpenedOrder、Publication、ReferenceLifecycle、RecoveryTiming及ACK模型归本包models；性质和公平性前提保持。

正式提供者与 Session 组合还须验证真实主体、共享池、来源逆序保有、迟到结果/费用、ACK 与无 Agent 进展。模型或本探针通过不能关闭这些实际实现义务。

## 默认重试历史

当前算法模型唯一维护于 `models/RetryHistory.tla`，配正配置与 DispatchCount 负控。模型只有有限的失败历史/结论、发出次数、阶段及 h/n；验证本件结论计数与续接不占重试数。它不证明原失败主体真实性、授权、物理停止、HTTP、费用或任意自定义重试的终止性。此资源接续原实际执行登记，不维护第二算法源。

从仓库根执行（JAVA_BIN、TLA2TOOLS_JAR 指向已安装工具）：

```sh
"$JAVA_BIN" -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 1 -metadir tmp/tlc/runtime-retry -config packages/core/model-request-runtime/verification/models/RetryHistory.cfg packages/core/model-request-runtime/verification/models/RetryHistory.tla
"$JAVA_BIN" -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 1 -metadir tmp/tlc/runtime-retry-negative -config packages/core/model-request-runtime/verification/models/validity-check/RetryHistory_DispatchCount.cfg packages/core/model-request-runtime/verification/models/RetryHistory.tla
```

正配置应通过；负配置必须违反 CountsOwnConclusions，超时/解析/工具错误不算负控。原历史输入不删，源码/配置字节与成立前提保持。

## 综合模型的保留与实际验证

| 精确 RT12 模型                                                         | 公共性质及保留原因                                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| FinalPlan、UsageCalibration                                            | 固定输入、计量及校准同时含 Anchor/Send/恢复；由实际来源和提供者组合持续消费                  |
| PendingReply                                                           | Pending 值交接、处分和 Commit 的共同关系，不能只验证值构造                                     |
| Settlement、Publication、ReferenceLifecycle、OpenedOrder、AckLifecycle | 完整原批、未知写、执行/消费者双寿命、开口栅栏与 ACK 提交/清理；真实日志/Storage/写方组合仍有效 |
| ContentGate、Adaptation、AdaptationBinding、RecoveryTiming             | 首内容准入、精确版本保有及恢复时序；仍须真实Service装配及在途来源组合验证                 |

这些综合资源唯一归本成员models目录，[协议模型](models/README.md)给出规模和配置。公开性质不能统一称为 provider 私有，也不复制整套模型。接口或组合变化须复验受影响正负配置及实际提供者；正式提供者与协调验收另验证真实来源、双Session和无agent进展。

## ACK 组合验证义务

当前承诺归 [SPEC](../SPEC.md)，账算法归 call-accounts。以下须实际组合验证，Schema／TLC 不能代替；某次执行状态与输出只写工作树 tmp。

| 场景 | 必须观察到 |
|---|---|
| 保存完整原值、ACK、无完整 Session 的重复小查询 | 独立确认；运行时继续清理；released 后旧 ref／同键小视图成功，无重发或全文重取 |
| 同调用两 consumer，仅一个有当前 ACK 权 | 当前权核验；旧 handle／read 不授 ACK 权，跨租户／撤权不泄存在，不等另一个 consumer 或处分 |
| 实际读取、闲置 handle、observer 队列并存 | 在读工作完成或明确结束；关闭未开始的全文交付，解除 idle／队列／缓存的大引用，consumer 自存副本保留 |
| 原 persisted writer 先／后赢及未知回执迟到 | ACK 键与 final 键独立；旧 writer 未实际停不释放；原账一致，final 优先且计一次，不造处分 |
| retiring／ACK 提交／确认／删除各界崩溃重开 | 未确认不删；unknown 认回完整原批；内容和删除状态原子恢复，不把 timeout／fence／Map 空当停止 |
| released 后合法处分及独立 persisted | settleReply 不授持久消息写权；核完整 retainedResult 身份／语义摘要／账；缺值 wrongPhase、改值 malformed、权限不可核 unavailable |
| final 首写及 unknown 后崩溃 | 完整原批先耐久；unknown 保留恢复责任；满足原确认／停止／无批／政策条件才清除，无第二 ACK 或 ready 复活 |
| 同键对象重排、等值数字、大整数、sourceVersions 变化 | 等值认回原采用事实与摘要；异值 creationConflict；不重读最新 profile，不以 binary64 合并大数 |
| 未知、已知零、失败 dispatch 和迟到补账 | 未知不补零；ACK 是原账非有效汇总；每个失败 ResponseId 单列，补账算法与归属不改 |
| 两调用共享外部内容 | 仅解除本调用清单／保留权；另一调用、consumer 副本不受损，真实外部 owner 配对，inline 不虚构 provider |

## 综合规范输入

[models](models/README.md)保存本能力的规范TLA及全部配对配置。模型是有限协议输入，不是执行记录；RetryHistory唯一源仍在本验证目录原算法位置。

## 独立调用的协议覆盖缺项

[独立调用目标](../../../../docs/architecture/runtime/model-runtime.md#独立调用)允许无隐式Session的合法消费者处理或可靠保存结果后ACK。十五操作现已归Session编排；独立invokeModel和执行池的存在仍不能单独证明完整的独立持久消费与ACK已承接。

模型公共契约及提供者拥有者须细化该独立协议、授权、结果保管、确认和恢复，并验证不创建隐式Session的完整消费路径。当前Session适配的模型与测试只覆盖各自范围，不授予用Session要求替代独立调用目标。此缺项不因本次导航迁移而关闭。

## Immutable history

`tests/model-log-history.spec.ts` compares the persistent history with the independent raw inspector across every partition of short histories and a seeded longer history. It checks old cuts, response order, duplicate keys, compaction forward references, exact UTF-8 byte counts and unexpected exceptions. Instrumented ordinary append checks count only suffix capture, shell validation and association visits. Provider publication and finite cut models are maintained by `packages/session/session-runtime-local/verification/history-cuts/`.
