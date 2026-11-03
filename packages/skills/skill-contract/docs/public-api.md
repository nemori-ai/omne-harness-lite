# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。本文件不手写第二套签名。

## 导出入口

| 入口 | 调用者 | 源码 |
| --- | --- | --- |
| `@omne-harness/skill-contract` | 调用方与端口实现方 | [src/index.ts](../src/index.ts) |
| `@omne-harness/skill-contract/provider` | 端口实现方 | [src/provider.ts](../src/provider.ts) |
| `@omne-harness/skill-contract/testing` | 端口实现方的测试，不依赖测试框架 | [src/testing.ts](../src/testing.ts) |

公开根不导出 `SkillRef`、`PackageLocator` 与 `sealSnapshot`，见 [SPEC「入口」](../SPEC.md#入口)。

## 定义索引

| 定义 | 源码 | 行为条款 |
| --- | --- | --- |
| 值与品牌：`SkillName`、`PackagePath`、`EntryDigest`、`PackageDigest`、`AssetVersion`、`SafeReason`、`MediaType`、`PackageEntry`、`SkillPackageSnapshot`、`PackageLocator`、`SkillManifest`、`ManifestValue`、`ScriptDeclaration`、`SettingDeclaration`、`SettingCategory`、`SkillDeclaration`、`SkillDefinition`、`DeclaredProjection`、`ScriptIdentity`、`SkillMaterialBasis`、`SkillRef`、`StandIn`、`SourceLayer`、`Bytes` | [src/values.ts](../src/values.ts) | [值与品牌](../SPEC.md#值与品牌) |
| 守卫与规范化：`isSkillName`、`isPackagePath`、`toPackagePath`、`isSafeReason`、`isAssetVersion`、`isControlFile` | [src/names.ts](../src/names.ts) | [值与品牌](../SPEC.md#值与品牌) |
| `computeDigest`、`isPackageDigest` | [src/digest.ts](../src/digest.ts) | [内容摘要](../SPEC.md#内容摘要) |
| `inferMediaType` | [src/media.ts](../src/media.ts) | [媒体类型](../SPEC.md#媒体类型) |
| `sealSnapshot`、`SnapshotDefect` | [src/snapshot.ts](../src/snapshot.ts) | [快照](../SPEC.md#快照) |
| `parseSkillPackage` | [src/parse/package.ts](../src/parse/package.ts) | [检查 Skill 包](../SPEC.md#检查-skill-包) |
| `projectAssetBody`、`skillBodyContract` | [src/project.ts](../src/project.ts)、[src/contract.ts](../src/contract.ts) | [`skill` 类别端口](../SPEC.md#skill-类别端口) |
| 失败：`SkillFailure`、`GateFailure`、`DescribeFailure`、`PinFailure`、`ListFailure`、`ReadFailure`、`ExportFailure`、`UnsupportedWhat`、`InspectFailure`、`InspectRejectionCode` | [src/failures.ts](../src/failures.ts) | [拒绝次序](../SPEC.md#拒绝次序)、[读取的形状规则](../SPEC.md#读取的形状规则) |
| 服务接口与结果值：`PackageInspection`（在 `./provider`）、`SkillCatalog`、`SkillAccess`、`CatalogEntry`、`CatalogQuery`、`MaterialState`、`SkillDescription`、`ReadTarget`、`ByteRange`、`ReadContent`、`ReadResult`、`ResourceListing`、`ExportedEntry`、`SkillExport` | [src/services.ts](../src/services.ts) | [读取的形状规则](../SPEC.md#读取的形状规则) |
| 端口：`SkillPackageSource`、`SourceFailure`、`SkillResolution`、`Resolution`、`CatalogResolution`、`SkillReadCheck`、`ReadVerdict`、`Reply` | [src/ports.ts](../src/ports.ts) | [需求端口](../SPEC.md#需求端口) |
| 套件与替身 | [src/testing-source.ts](../src/testing-source.ts)、[src/testing-resolution.ts](../src/testing-resolution.ts)、[src/testing-read-check.ts](../src/testing-read-check.ts) | [符合性套件](../SPEC.md#符合性套件) |
