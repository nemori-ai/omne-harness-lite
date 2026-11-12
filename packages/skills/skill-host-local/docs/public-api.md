# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。本文件不手写第二套签名。

## 导出入口

| 入口                                    | 调用者                                        | 源码                              |
| --------------------------------------- | --------------------------------------------- | --------------------------------- |
| `@omne-harness/skill-host-local`        | 装配 Skill 服务的宿主，以及需要目录来源的测试 | [src/index.ts](../src/index.ts)   |
| `@omne-harness/skill-host-local/cordis` | 装配 Cordis 的宿主                            | [src/cordis.ts](../src/cordis.ts) |

根入口的运行时导出只有 `createDirectorySource`。`./cordis` 的运行时导出只有插件 `skillPlugin`；三个服务子类与两个端口适配器不导出。`DirectoryFs` 只是类型。内部模块 `walk.ts` 与默认接缝 `nodeFs` 不导出。

## 定义索引

| 定义                                                     | 源码                                                             | 行为条款                                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `createDirectorySource`                                  | [src/directory-source.ts](../src/directory-source.ts)            | [定位](../SPEC.md#locator)、[快照](../SPEC.md#snapshot)、[读条目](../SPEC.md#open)、[失败映射](../README.md#behavior) |
| `DirectoryFs`                                            | [src/fs.ts](../src/fs.ts)                                        | [文件系统接缝](../SPEC.md#seam)                                                                                       |
| `skillPlugin`                                            | [src/cordis.ts](../src/cordis.ts)                                | [Cordis 插件](../SPEC.md#cordis-插件)、[Cordis 说明](cordis.md)                                                       |
| 端口 `SkillPackageSource` 与 `SourceFailure`（来自契约） | [skill-contract/src/ports.ts](../../skill-contract/src/ports.ts) | [需求端口](../../skill-contract/SPEC.md#ports)                                                                        |
