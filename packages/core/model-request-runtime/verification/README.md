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
