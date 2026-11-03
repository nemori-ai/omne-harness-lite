# 使用与定位

## 使用方式

- 调用方从公开根取值、失败、服务接口与纯函数。调用方显式给出访问上下文与作用域。
- 端口实现方从 `./provider` 取端口与 `sealSnapshot`，并用 `./testing` 的套件证明自己合规。
- 资产一侧把 `skillBodyContract()` 登记到类别注册表。

最小示例见 [README.md](../README.md#usage)。

## 消费者与定位

本包是 Skill 能力组的纯契约成员，组内位置见[组入口「成员与依赖」](../../README.md#成员与依赖)。组内消费者是 `@omne-harness/skill`（三个应用服务）与 `@omne-harness/skill-host-local`（目录来源）。本包不依赖 Cordis、Tool 或任何调用方的成员，也不点名调用方。
