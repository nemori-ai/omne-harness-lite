# Cordis 集成

本文件说明本包的 Cordis 集成：适用性、集成入口、依赖注入、服务与事件、启动、撤除与资源清理责任。绑定只从 `src/cordis.ts` 导出。共同集成规则引用仓库的 IC 约定，不在本文件复制。

## 集成入口

`./cordis` 导出 `connectionPlugin`（装上服务 `connection`，类 `ConnectionService`，`@owner packages/access/client-assembly`）与 `defineProtocolClient`（依赖 `connection`，在协议开放期间提供 `protocol:<名字>/v<主版本>`，值是 SDK 客户端核心的 `ClientOf`）。连接的订阅循环是它作用域上的一个效应，卸载时中止并等它收场。协议客户端的服务用 `ctx.reflect.provide` 提供，注销在先标记之后。行为见 [SPEC.md](../SPEC.md)。

## 生命周期与清理

<!-- documentation:placeholder -->

待补：启动、撤除与资源清理的责任，以及外部副作用的处理。
