# 使用与定位

## 使用方式

- 装配方实现或选用三个端口（`SkillReadCheck`、`SkillResolution`、`SkillPackageSource`），用 `createSkillAccess({ readCheck, resolution, source })` 造服务，交给调用方。调用方每次显式给出访问上下文与作用域。
- 来源或资产登记一侧用 `createPackageInspection(source)` 检查一个包，得到 `SkillDefinition` 或第一个拒绝原因。
- 两个工厂没有初始化与释放责任。端口的生命周期归集成方。

最小示例见 [README.md「Usage」](../README.md#usage)。

## 消费者与定位

本包是 Skill 能力组的通用实现成员，组内位置见[组入口「成员与依赖」](../../README.md#成员与依赖)。它消费 `@omne-harness/skill-contract` 的公开根、`./provider` 与（只在测试里）`./testing`。

```text
调用方（会话、Agent、MCP 入口……）
        │ SkillAccess / PackageInspection（契约接口）
        ▼
@omne-harness/skill ──端口──► SkillReadCheck、SkillResolution（集成方实现）
        │                       SkillPackageSource（@omne-harness/skill-host-local 等）
        ▼
@omne-harness/skill-contract
```

本包不点名调用方，不认识 `skill-host-local`，不依赖 Cordis。装配到 Cordis 的插件归 `skill-host-local` 的插件部分与 Skill 的 Cordis 契约，见 [cordis.md](cordis.md)。
