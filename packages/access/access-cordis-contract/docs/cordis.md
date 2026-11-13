# Cordis 集成

## 集成入口

`./cordis` 导出抽象 `Service` `AccessRegistryService`，服务名 `accessRegistry`，并把 `accessRegistry` 加进 Cordis `Context` 的类型。提供者是服务端接入 `./cordis` 的 `AccessRegistryProvider`，由服务端应用的装配装上：`apps/harness-server` 的 `server-entry` 行在自己的作用域里装它，并把它的登记表交给入口。

## 生命周期与清理

`mount` 用 `this.ctx.effect(...)` 绑在调用者的作用域上：在服务方法里，`this.ctx` 是调用者的作用域。效应的收回函数返回一个 Promise，Cordis 4.0.4 卸载时等它，所以卸载在挂着的贡献排空之后才完成。效应的 setup 抛出的 `AccessAssemblyError` 同步传给调用者。这三条在服务端接入的 `tests/registry-cordis.spec.ts` 里用真实的 Cordis 验证。
