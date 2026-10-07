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

完整请求、OpenedOrder、Publication、ReferenceLifecycle、RecoveryTiming、AckLifecycle/AckProgress 继续归精确 RT12 的验证资源。尚未迁移的性质和公平性前提仍有效，不在这里复制另一份模型。

正式提供者与 Session 组合还须验证真实主体、共享池、来源逆序保有、迟到结果/费用、ACK 与无 Agent 进展。模型或本探针通过不能关闭这些实际实现义务。

## 默认重试历史

当前算法模型唯一维护于 `models/RetryHistory.tla`，配正配置与 DispatchCount 负控。模型只有有限的失败历史/结论、发出次数、阶段及 h/n；验证本件结论计数与续接不占重试数。它不证明原失败主体真实性、授权、物理停止、HTTP、费用或任意自定义重试的终止性。此资源接续原实际执行登记，旧冻结版本只供未迁契约导航，不维护为第二算法源。

从仓库根执行（JAVA_BIN、TLA2TOOLS_JAR 指向已安装工具）：

```sh
"$JAVA_BIN" -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 1 -metadir tmp/tlc/runtime-retry -config packages/core/model-request-runtime/verification/models/RetryHistory.cfg packages/core/model-request-runtime/verification/models/RetryHistory.tla
"$JAVA_BIN" -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 1 -metadir tmp/tlc/runtime-retry-negative -config packages/core/model-request-runtime/verification/models/validity-check/RetryHistory_DispatchCount.cfg packages/core/model-request-runtime/verification/models/RetryHistory.tla
```

正配置应通过；负配置必须违反 CountsOwnConclusions，超时/解析/工具错误不算负控。原历史输入不删，源码/配置字节与成立前提保持。

## 综合模型的保留与实际验证

| 精确 RT12 模型                                                         | 公共性质及保留原因                                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| FinalPlan、UsageCalibration                                            | 固定输入、计量及校准同时含 Anchor/Send/恢复；仍由未迁真实来源和提供者组合消费                  |
| PendingReply                                                           | Pending 值交接、处分和 Commit 的共同关系，不能只验证值构造                                     |
| Settlement、Publication、ReferenceLifecycle、OpenedOrder、AckLifecycle | 完整原批、未知写、执行/消费者双寿命、开口栅栏与 ACK 提交/清理；真实日志/Storage/写方组合仍有效 |
| ContentGate、Adaptation、AdaptationBinding、RecoveryTiming             | 首内容准入、精确版本保有及恢复时序；实现与实际在途来源尚未全部改接正式 Service                 |

这些综合资源继续只保留原位置，[精确入口](../../../../.meta_harness/design/spec/capabilities/model-request-runtime/v12/formal/README.md)给出规模和配置。公开性质不能统一称为 provider 私有，也不复制整套模型。本次接口迁移须复验受影响正/负配置及实际旧提供者；最终正式提供者/协调验收另验证真实来源、双 Session 和无 Agent 进展。
