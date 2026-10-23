# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口 | 源码 | 导出 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/tokenizer-tiktoken` | [index.ts](../src/index.ts) | 运行时值 `createTiktokenTokenizer`；类型 `TiktokenRanks`、`TiktokenResources` | 家族成员的计量器 |

- 根入口只有一个运行时导出。[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对这一点。
- `package.json` 只声明 `.` 一个导出入口，没有 `./cordis` 或 `./testing`。
- 本包不转导 model-contract 或 operation-result 的任何名字。

## 定义索引

| 类型或值 | 定义 | 行为条款 |
| --- | --- | --- |
| `createTiktokenTokenizer` | [tokenizer.ts](../src/tokenizer.ts) | [SPEC“初始化”](../SPEC.md#初始化)、[“计数”](../SPEC.md#计数) |
| `TiktokenRanks`、`TiktokenResources` | [resources.ts](../src/resources.ts) | [SPEC“初始化”](../SPEC.md#初始化)、[“规范 JSON”](../SPEC.md#规范-json) |

返回值的类型 `ModelTextTokenizer`、`TokenizationFailure`，以及 `TokenizerDefinition`、`TokenizationSegment` 的定义见 [model-contract 公开接口](../../model-contract/docs/public-api.md)。`Outcome` 归 `@omne-harness/operation-result`。
