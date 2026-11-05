# 公开接口导航

本文件导航本包的公开边界。精确类型与运行时校验在源码里，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。

## 导出入口

| 入口                                  | 源码                                  | 调用者           | 运行时导出                                                                                                                 |
| ------------------------------------- | ------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@omne-harness/mcp-contract`          | [src/index.ts](../src/index.ts)       | 调用方与实现方   | 品牌守卫、纯函数与两个原因常量 `OUTPUT_CHECK_FAILED`、`STRUCTURED_CONTENT_MISSING`，见 `tests/public-entry.spec.ts` 的列表 |
| `@omne-harness/mcp-contract/provider` | [src/provider.ts](../src/provider.ts) | 端口的实现方     | 无，只有类型                                                                                                               |
| `@omne-harness/mcp-contract/testing`  | [src/testing.ts](../src/testing.ts)   | 端口实现方的测试 | 五个套件、五个内存替身、两张样本表、`runConformanceCase`、`isNotApplicable`、`NotApplicable`                               |

## 定义索引

| 定义                                                                     | 源码                                      | SPEC 条款          |
| ------------------------------------------------------------------------ | ----------------------------------------- | ------------------ |
| 品牌与守卫                                                               | [brands.ts](../src/brands.ts)             | V1–V3              |
| 组合值、`Untrusted`                                                      | [values.ts](../src/values.ts)             | V4、K1–K3          |
| `parseEndpointBody`、`launchesLocalCommand`、`mcpEndpointBodyContract`   | [endpoint.ts](../src/endpoint.ts)         | E1–E6              |
| `completeListing`、`digestDefinition`                                    | [listing.ts](../src/listing.ts)           | C1–C4              |
| `mergeListing`、`markUnavailable`、`actionPermissionItems`               | [catalog.ts](../src/catalog.ts)           | C5–C8              |
| `classifyOutcome`                                                        | [classify.ts](../src/classify.ts)         | O1–O6              |
| `toContentBlocks`                                                        | [content.ts](../src/content.ts)           | D1–D5              |
| `boundInstructions`                                                      | [instructions.ts](../src/instructions.ts) | S3                 |
| `peerAccountOf`、`catalogKeyOf`、`connectionKeyOf`                       | [keys.ts](../src/keys.ts)                 | K1–K3              |
| 结局、拒绝与失败                                                         | [outcomes.ts](../src/outcomes.ts)         | R1–R6              |
| `OUTPUT_CHECK_FAILED`、`STRUCTURED_CONTENT_MISSING`（`violates` 的原因） | [outcomes.ts](../src/outcomes.ts)         | O1–O3              |
| 五个需求端口                                                             | [ports.ts](../src/ports.ts)               | AV、UE、CU、PL、CS |
| 传输端口                                                                 | [transport.ts](../src/transport.ts)       | T1–T6              |
| 五个服务接口                                                             | [services.ts](../src/services.ts)         | S1–S8              |
