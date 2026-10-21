# examples

本目录承载面向真实公开入口的使用示例。

## 允许的内容

可运行的示例代码与说明。

## 边界

示例只用公开入口，并写明运行前提。示例不代替测试或规格。

## 维护

公开入口变化时，同步示例并确认它仍能编译。`facility-set.spec-d.ts` 导入本目录的示例，示例与公开入口不一致时类型测试失败。

## 本包事实

本目录有一个示例：[shell-needs.ts](shell-needs.ts)。它演示一个命令行工具包怎样：

1. 写下自己的环境声明：需要 `command` 与 `terminal`，需要确认进程隔离，能在 `host_machine`、`session_sandbox` 与 `tenant_sandbox` 三种绑定层工作。
2. 从声明推出执行者的设施类型 `FacilitySet`，执行者取不到声明没有点名的 `files`。
3. 把 schema 的采用身份与声明值一起存进工具定义。
4. 在一个终端里执行一段脚本，读取流式输出与终局。

落在宿主机时，`command` 与 `terminal` 由同一个宿主提供者提供；这两项的宿主提供者现在只有设计，没有实现，见 [execution-environment-host-local 的宿主命令与终端机制](../../execution-environment-host-local/docs/architecture.md#宿主命令与终端机制设计未实现)。

运行前提：示例只依赖本成员的公开入口。它是类型层面的示例，由本包的类型测试编译核对；它没有提供者，不能单独运行出真实结果。取得真实设施需要机制成员与提供者成员，见[使用与定位](../docs/context.md#使用方式)。具名维护者由负责人指定。
