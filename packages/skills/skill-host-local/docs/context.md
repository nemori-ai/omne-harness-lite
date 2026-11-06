# 使用与定位

## 使用方式

- 宿主装配 Skill 服务时，建一个目录来源，作为 `SkillPackageSource` 交给 `@omne-harness/skill` 的 `createPackageInspection(source)` 或 `createSkillAccess(ports)`。
- 装配 Cordis 的宿主装载 `@omne-harness/skill-host-local/cordis` 的 `skillPlugin`（配置给 `{}`），取得 `skillPackageInspection`、`skillCatalog`、`skillAccess` 三个服务；两个端口 `skillReadCheck`、`skillResolution` 由别的领域提供，插件按调用现取。实际调用了缺席端口的那一步得到 `unknown`，操作按 [`skill` SPEC](../../skill/SPEC.md#stages) 的规则答复，不放行，也不交出受该端口保护的内容。
- 测试可以给出自己的 `DirectoryFs`，制造真实环境中难以制造的文件系统拒绝。
- 包定位由 `SkillResolution` 的实现给出，不取自读取的调用方。

最小示例见 [README.md](../README.md#usage) 与 [examples/](../examples/index.md)。

## 消费者与定位

本包是 Skill 能力组的本地宿主成员，组内位置见[组入口「成员与依赖」](../../README.md#成员与依赖)。它实现 `@omne-harness/skill-contract` 声明的需求端口 `SkillPackageSource`。消费者是 `@omne-harness/skill`，经端口使用本来源，不认识本包。`./cordis` 入口的 `skillPlugin` 把 `@omne-harness/skill` 的三个服务提供为 Cordis 服务，键与抽象类归 [skill-cordis-contract](../../skill-cordis-contract/docs/cordis.md)，见 [Cordis 说明](cordis.md)。根入口不依赖 Cordis，本包不认识任何调用方。
