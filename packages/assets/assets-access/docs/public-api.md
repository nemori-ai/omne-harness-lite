# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口 | 内容 | 调用者 |
| --- | --- | --- |
| `@omne-harness/assets-access` | 贡献与端口的类型，不导入 Cordis | 用例与别的宿主 |
| `@omne-harness/assets-access/cordis` | 插件工厂 `createAssetsAccessPlugin` | 应用装配的一行 |

## 定义索引

| 导出 | 种类 | 定义位置 | 条款 |
| --- | --- | --- | --- |
| `createAssetsContribution` | 函数：四个处理函数 | [src/contribution.ts](../src/contribution.ts) | [SPEC.md](../SPEC.md#aa-1) 到 [AA-5](../SPEC.md#aa-5) |
| `AssetsContributionInput` | 类型：贡献读的两个端口 | [src/contribution.ts](../src/contribution.ts) | [SPEC.md](../SPEC.md#aa-2) |
| `TargetTenantPrincipals` | 端口：为目标租户换主体 | [src/ports.ts](../src/ports.ts) | [SPEC.md](../SPEC.md#aa-1) |
| `TenantSettingsPort` | 端口：租户层设置读写面，输入与结果的类型都在它的签名里 | [src/ports.ts](../src/ports.ts) | [SPEC.md](../SPEC.md#aa-4) |
| `createAssetsAccessPlugin`、`AssetsAccessPluginInput` | Cordis 插件与装配给的输入 | [src/cordis.ts](../src/cordis.ts) | [cordis.md](cordis.md) |
