# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、定义索引，以及输入输出与失败行为的定位。精确类型归公开源码，行为条款归契约与组页，本包 [SPEC.md](../SPEC.md) 只写实现加上的部分。本文件不手写第二套签名。

## 导出入口

| 入口 | 调用者 | 源码 |
| --- | --- | --- |
| `@omne-harness/skill` | 装配方：造三个服务并交给调用方 | [src/index.ts](../src/index.ts) |

只有一个入口。三段函数在 `src/access/` 内，不公开。

## 定义索引

| 定义 | 源码 | 行为条款 |
| --- | --- | --- |
| `createPackageInspection(source)` → `PackageInspection` | [src/inspection.ts](../src/inspection.ts) | 契约 [检查 Skill 包](../../skill-contract/SPEC.md#parse)；组页 [检查与发现](../../docs/architecture.md#检查与发现)；本包 [检查](../SPEC.md#inspect) |
| `createSkillCatalog(ports)` → `SkillCatalog<P, S>`；`ports` 只取 `readCheck` 与 `resolution` | [src/catalog.ts](../src/catalog.ts) | 契约 [目录的匹配规则](../../skill-contract/SPEC.md#catalog-search)、[端口答复的统一处置](../../skill-contract/SPEC.md#port-answer-closed)；组页 [检查与发现](../../docs/architecture.md#检查与发现)；本包 [目录](../SPEC.md#catalog) |
| `createSkillAccess(ports)` → `SkillAccess<P, S>` | [src/access/service.ts](../src/access/service.ts) | 契约 [读取的形状规则](../../skill-contract/SPEC.md#read-shape)；组页 [读取](../../docs/architecture.md#读取)、[失败种类](../../docs/architecture.md#失败种类)；本包 [三段](../SPEC.md#stages)、[无披露](../SPEC.md#no-disclosure)、[正文与范围](../SPEC.md#body) |
| `SkillPorts<P, S>` | [src/ports.ts](../src/ports.ts) | 契约 [需求端口](../../skill-contract/SPEC.md#ports)；本包 [映射](../SPEC.md#mapping) |

接口与结果值（`PackageInspection`、`SkillCatalog`、`CatalogEntry`、`CatalogQuery`、`SkillAccess`、`SkillDescription`、`ReadResult`、`ResourceListing`、`SkillExport`、各失败联合）归 `@omne-harness/skill-contract`，见[契约的公开接口导航](../../skill-contract/docs/public-api.md)。
