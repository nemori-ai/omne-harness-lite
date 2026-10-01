# 恢复任务与作用域留存的实施补充

2026-09-28，revision 1，candidate，待窄评和技术采用。接续 [D-105](../../../../record/decisions/model-recovery-timing-provider-adoption/decision.md) 采用的 [v12](v12-recovery-timing-design.md)，不改其冻结字节、MR8/RT9、十三操作或恢复授权。持续消费者是本节点的恢复实现与 runtime 组合；失效事件是实现的所有权与关闭方式变化。

## 已有责任与具体持有

v12 要求失败不遗弃原任务或事实，[v10](v10-owner-assembly-design.md) 要求组合只在各组件实际释放后释放。`scope.close()` 是恢复准入及其资源的最终退出，不能在尚需用该 scope 的 binding/owner 认回未知写入时调用。仅 await coordinator.close 或 append task.stopped 不证明耐久结果已知。

`createRuntimeReconcile` 直接改为返回 `{reconcile, close}`，同其他组件由 `createModelRuntime` 持有并纳入全部组件的 close；当前消费者同批迁移，不保留旧签名。它的闭包持有每次 enter 所得 scope 及该 scope 上未完成的读、控制追加、响应 coordinator/target，不建新持久日志、注册服务或 Cordis fiber。登记在首次异步工作之前完成；enter 尚未返回时也属于该组件的在途工作，关闭后迟到的 scope 仍必须收口，不得发起新的业务追加。

正常分支在本次任务实际停止且结果确定后关闭 scope。任一未知、停止失败、scope.close 抛错均保留原引用，返回 unavailable，可由后续 reconcile 或组件 close 重试收口。同一会话尚有未决原 scope 时不能再次 enter 另一个重承载者；其他会话仍沿各自准入。并发 close 共用正在进行的尝试；成功释放只记一次，失败不能缓存成永久释放或重新开放已关闭准入。

## 两种写入复用现有构件

**意图存在、无在途 dispatched**：按 RT9 S-33 原表构造 `model_call_ended`，调用已有 `appendControlRecord`。未知收据由现有 `UnknownAppendTracker.keep` 保存原 key/binding/owner/registration/task；tracker 必须归上述持久闭包里的 scope，而不是调用栈局部变量。用现有实际停止及权威完整前缀读取认回；已存在原结束记录时不重复追加，同键冲突/不可解释前缀仍 unavailable。只有停止且权威认回结果确定后才归还 registration。确知缺席与认回已有记录区分，缺席不宣称业务已结束；普通 reconcile 可沿原 S-33 继续，close 只结束资源责任，不替用户触发新的模型请求或新的业务追加。

**dispatched 存在、缺完整响应批**：保留原 coordinator、target 和 scope；使用现有 coordinator 与同一日志完整批判定，不复制结算协议。响应任务 completion 返回 unavailable 或 coordinator.close 完成，都不能清除未知写者事实。实际停止后从原绑定完整前缀认回已存在批，或确认不存在；完整原批优先、不得重构覆盖。前缀读取失败、旧 writer 未停、owner 未决或不具备合法读取权时继续留存。与控制追加一样，资源释放须有真实停止和确定的耐久观察，业务结果由 S-33 决定。此补充不添加解除旧 owner 未决标志的布尔接口。

控制追加 tracker 的认回读取复用仍持有的原 registration，在原 append actual stopped 后通过它的 start('read', ...) 执行 readSettlementPrefix，并跟踪这次读取至 actual stopped，结果确定后才 release。不得持有原配额又 acquire 第二份配额：concurrent=1 是合法配置，不能因此永久卡住认回。原 registration 只由这条留存责任恰一次释放，读取辅助不得自动 release。同一登记的认回读取串行；并发 close 共用一次读取/释放尝试，上一读取未 actual stopped 或停止失败时保留它并返回 unavailable，不能叠加新读取。读取失败但已经停止可在后次 close 重试；只有 append 与全部认回读取都 actual stopped 且耐久观察可判才 release。原 binding 的代际和读取合法性检查不省略。响应 coordinator 仍按其既有登记与停止协议执行；其停止后需要的读面按原 scope 的合法 owner 取得，不把控制追加的保留配额规则套成新的 coordinator 协议。

读任务的停止失败同样由组件保留其 registration/task/scope，不能在 finally 抛错后丢失句柄。关闭先拒绝新 reconcile、请求现有任务停止，等待实际停止和所需原绑定认回，最后才调用 scope.close；各 scope 独立收口，一项失败不跳过其他项。未全部确认时返回 unavailable，宿主继续持有整个组合。

## 边界与验收

原 scope 的 enter 仍由真实宿主证明停止及唯一恢复权；本补充不提供该动作，不将测试 scope 升为生产实现，不关闭 L1/L2、withRun/G-28。scope 不可继续读取时只保留责任并返回 unavailable，不换一个 binding 猜结果。无新时限/重试默认，沿显式 contention/scheduler；恢复全路径零 plan/send。

实施须验证：

1. 真实 JSONL 结束记录已提交但收据未知，首次 unavailable 后原 scope/registration 保留；实际停止、读回原记录后恰一次释放，零重复追加。
2. 响应批相同故障，原 batch/ResponseId/时间/账保持原值；coordinator.close 单独完成不提前 scope.close。
3. held stopped、失败或不可读前缀使 close unavailable；恢复读取后再次 close 可 released，其他 scope 已正常释放。
4. close 与 enter 迟到、响应追加及读任务竞争：无新业务追加、无丢失 task、scope.close 恰一次；同会话未决 scope 不发生第二个 enter。
5. 现有正常/冷恢复/原完整批优先/整体无部分成功场景保持；独立函数及统一 runtime 消费同一组件。README/README_ZH 同批迁移真实公开面，新增绑定0，实证另记。
6. concurrent=1 下未知控制追加停止后可沿原登记读回并唯一释放；并发 close 不启动两个读者；读任务本身 held/失败时保持原登记，不把停止请求或 completion 当实际停止。
