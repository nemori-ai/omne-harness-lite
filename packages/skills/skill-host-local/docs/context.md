# 使用与定位

## 使用方式

- 宿主装配 Skill 服务时，建一个目录来源，作为 `SkillPackageSource` 交给 `@omne-harness/skill` 的 `createPackageInspection(source)` 或 `createSkillAccess(ports)`。
- 测试可以给出自己的 `DirectoryFs`，制造真实环境中难以制造的文件系统拒绝。
- 包定位由 `SkillResolution` 的实现给出，不取自读取的调用方。

最小示例见 [README.md](../README.md#usage) 与 [examples/](../examples/index.md)。

## 消费者与定位

本包是 Skill 能力组的本地宿主成员，组内位置见[组入口「成员与依赖」](../../README.md#成员与依赖)。它实现 `@omne-harness/skill-contract` 声明的需求端口 `SkillPackageSource`。消费者是 `@omne-harness/skill`，经端口使用本来源，不认识本包。本包不依赖 `@omne-harness/skill`、Cordis 或任何调用方。
