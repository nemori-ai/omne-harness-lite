# 关键流程

## 流程

1. 接入插件依赖 `accessRegistry`，在自己的插件体里调 `ctx.accessRegistry.mount(contribution)`。
2. `mount` 在插件的作用域上建效应，效应同步调提供者的 `attach`：协议挂上，或抛 `AccessAssemblyError` 使插件失败。
3. 管道经提供者的 `enter` 找到处理函数，调用时把 `CallContext` 交给它（这一步在服务端接入）。
4. 插件卸载，Cordis 调收回函数：协议同步撤下，在途的收到中止；收回函数返回的 Promise 在最后一个 `leave` 时完成，卸载随之完成。

## 失败与生命周期

同名同主版本再挂时，第二个插件失败，第一份不动。撤下期间新的调用查不到表项；已经在途的按服务端接入的收场规则得到答复。见[服务端接入规格](../../server-entry/SPEC.md#收场与宽限)。
