# Cordis 集成

本包是 `cordis-module` 变体：`./cordis` 导出插件工厂 `createAssetsAccessPlugin`，根入口不导入 Cordis。

## 适用性

适用。插件只 `inject` 接入的登记表 `accessRegistry`，在自己的作用域里用 `defineAccessPlugin` 挂上 `assets/v1` 的贡献。装上即开放协议，卸下即撤下（RFC-0015 I-4、I-5、I-15）。

## 依赖与提供

- 注入：`accessRegistry`。
- 提供：无。
- 装配给的输入：`principals(ctx)` 在插件装上时构造一次主体端口；`settings(ctx)` 每次调用现取设置读写面，取不到时调用答 `basis-unavailable`，协议不撤下。读写面的服务键归应用，本包不认识。
- 配置：无。

## 撤除

撤除随作用域：登记表的贡献撤回，在途调用的信号中止。本包没有别的副作用要收回。
