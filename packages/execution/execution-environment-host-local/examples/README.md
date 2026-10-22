# examples

本目录承载面向真实公开入口的使用示例。

## 允许的内容

可运行的示例代码与说明。

## 边界

示例只用公开入口，并写明运行前提。示例不代替测试或规格。

## 维护

公开入口变化时，同步示例并确认它仍能运行。

## 本包事实

现在为空。装配与使用的写法片段在[使用与定位](../docs/context.md#使用方式)里。[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 的第一个测试走完了一次完整组合：装载服务、`filesFacilityPlugin` 与 `hostFilesPlugin`，解析宿主层落点，获取租约，用 `hostObjectToken` 点名一个文件并读取。可运行示例可以沿这条路径写，只用公开入口，并让它随包的 `typecheck` 编译。
