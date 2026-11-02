# runtime-context-cordis 的机制流程

本页给出本成员的三条机制级流程。每条有一张时序图和一张「失败与责任交接」表。行为以 [SPEC](../SPEC.md) 和 [Cordis 说明](cordis.md)为准，图只投影它们。

登记协议与唤醒事件的定义归 [runtime-context-cordis-contract 的流程](../../runtime-context-cordis-contract/docs/flows.md)。机制内部的发布、读取与关闭归 [runtime-context 的流程](../../runtime-context/docs/flows.md)。图中的「插件」是本成员的具体子类所在的插件 fiber。

## 流程

### F-RCP01 装载与卸载

依据：[性质 1、5、6、8](../SPEC.md#结果与不变量)、[IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6)、[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)。

```mermaid
sequenceDiagram
  participant A as 装配者
  participant F as 插件 fiber
  participant S as 服务实例
  participant M as 机制实例
  A->>F: 在某个 isolate 标签下装载插件与配置
  F->>F: 等 runtimeContextTrust 到场，否则 PENDING
  F->>F: 静态 Config 校验配置
  alt 配置错误
    F-->>A: fiber FAILED，不提供服务
  else 同一标签下已有提供者
    F-->>A: provide 失败，不覆盖
  else 正常
    F->>S: 构造子类，以 runtimeContext 登记
    S->>M: 调用 createRuntimeContext，交入两个原端口、上限、onChange 与诊断出口
    F-->>A: 服务可用
  end
  A->>F: 卸载插件，或信任提供者换代
  F->>S: 运行撤除 effect
  S->>M: close()
  M->>M: 拒绝新请求，结束读者，取消在途等待
  M->>M: 在 settleBoundMs 内等全部在途操作结算
  M->>M: 释放全部表与读取缓存
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 配置校验 | 配置合法才继续 | 配置错误时 fiber `FAILED`，装配者修正配置 |
| 登记服务 | 一个标签下一份 | 重复装载失败。要两份实现时由装配者分到不同标签 |
| 信任键缺席 | 插件停在 PENDING，不建立机制 | 装配者在受信子树提供 `runtimeContextTrust` |
| 没有存储端口 | 服务照常加载 | `persisted` 供给块在生产者重新发布前读到缺项 |
| 卸载 | 一个 effect 调用机制的 `close()`，五步在机制的一个函数里 | 重复关闭返回同一次关闭 |
| 卸载时在途操作 | 在途等待被取消，操作在上界内结算为关闭、未知或缺项，不答成功 | 撤除开始后到达的调用答关闭 |
| 卸载时在途发布 | 拒收（`closed`） | 生产者在新的提供者上重新登记并发布 |
| 新的机制实例 | 全部作用域围栏关闭，等同于进程重建 | 持有者用恢复会话恢复每个作用域并重新签发资格 |

### F-RCP02 生产者插件卸载后登记撤除

依据：[性质 3](../SPEC.md#结果与不变量)、[IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13)、[RC-07](../../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复)。

```mermaid
sequenceDiagram
  participant PF as 生产者插件 fiber
  participant S as 服务实例
  participant M as 机制实例
  participant R as 读者
  PF->>S: registerProducer(主体, 租户, 块键, 生产者身份, 块声明)
  S->>S: 第一次 await 之前取调用方 this.ctx
  S->>M: 登记，机制新取代际 n
  alt 调用方 fiber 已卸载
    S->>M: 立即撤除第 n 代
    S-->>PF: 拒收（closed）
  else 调用方仍在
    S->>PF: 调用方 ctx.effect(撤除函数)
  end
  PF->>PF: 插件卸载或插件体重跑
  opt 插件体重跑
    PF->>S: 新 fiber 以同一身份再登记
    S->>M: 登记，机制新取代际 n+1，替换第 n 代
  end
  PF->>S: 运行第 n 代的撤除函数
  S->>M: 拒绝第 n 代新操作，在 settleBoundMs 内等第 n 代在途供值结算
  S->>M: 撤除第 n 代登记；已被替换时不改动
  R->>M: 读取该块
  M-->>R: 缺项，不是旧值
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 登记 | 效应落在生产者插件的 fiber 上 | 生产者 fiber 已在卸载时，`effect` 抛 `INACTIVE_EFFECT`。本插件立即撤除这次登记并答拒收（`closed`），不抛出，槽空出 |
| 撤除 | 拒绝本代新操作，在上界内等本代在途供值，再只撤除本代登记 | 几步在机制句柄的同一个 `dispose` 里。显式撤除与 fiber 卸载共用一次 |
| 插件体重跑的交错 | 新一代先登记、旧一代后撤除时，新一代的登记仍在 | 本成员的测试覆盖这种交错 |
| 卸载之后读取 | 缺项 | 依赖该块的动作按自己的契约处置 |
| 本插件已先关闭 | 生产者的撤除函数在机制实例关闭后运行 | 句柄的 `dispose` 立即返回，不抛出 |

### F-RCP03 唤醒到达作用域监听者

依据：[性质 4](../SPEC.md#结果与不变量)、[IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12)、[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)。

```mermaid
sequenceDiagram
  participant M as 机制实例
  participant S as 服务实例
  participant LA as 作用域 A 的监听者
  participant LB as 作用域 B 的监听者
  M->>S: onChange(A, 视图修订)
  S->>S: ctx.emit(带 filter 的派发对象, changed, A, 视图修订)
  S-->>LA: 同步调用
  Note over S,LB: filter 读监听者 ctx 的作用域标记，B 不匹配
  alt 监听者抛出
    S-->>M: 异常回到机制的出口保护
    M->>M: 记诊断 change-outlet-failed，写入不回滚
  end
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 变化出口回调本插件 | 视图修订前进后，机制同步调用 `onChange(scope, revision)` | 派发抛错时机制只记诊断，不回滚写入。使当前值失效也前进修订，同样经这条路 |
| 过滤 | 派发方按监听者 ctx 上属性键 `scope` 的标记过滤，只到达作用域 A 的监听者 | 全局监听者不经过过滤。载荷只有作用域引用与视图修订，不带块键 |
| 监听者抛出 | 只记录诊断 | 排在抛出者后面的监听者这一轮不被调用，下一次读取承接 |
| 不建运行对象 | 不建 fiber，不建 isolate | 无 |

## 失败与生命周期

| 情形 | 结果 | 责任方 | 依据 |
| --- | --- | --- | --- |
| 配置错误 | fiber `FAILED` | 装配者 | [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) |
| 重复装载 | 第二份失败 | 装配者 | [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) |
| `bind` 取不到 intercept 配置，或类不一致 | 访问核对之后答 `callerMismatch` | 消费者插件改用对象形式 `inject` 声明正确的类 | 性质 2 |
| 插件卸载 | 机制按五步关闭 | 本插件 | 性质 6 |
| 本插件卸载后 | `inject` 了服务的插件卸载或重跑 | 各依赖方 | [plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md) |
| 进程失败或信任提供者换代 | 新机制实例从空开始 | 持有者用恢复会话重建，沿 runtime-context 的顺序 | [runtime-context SPEC](../../runtime-context/SPEC.md#所有权失败与生命周期) |
| 运行 disposer | 不撤回已交出的变化材料或外部效果 | 外部效果的拥有者 | 性质 6 |
