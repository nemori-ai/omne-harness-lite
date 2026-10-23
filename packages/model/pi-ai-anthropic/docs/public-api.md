# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口 | 源码 | 导出 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/pi-ai-anthropic` | [index.ts](../src/index.ts) | 运行时值 `createAnthropicFamily`、`officialAnthropicProfiles`、`anthropicTokenizerResources`、`TokenizerResourceError`、`ANTHROPIC_RECORDS`、`ANTHROPIC_OWNER`；类型 `AnthropicFamilyConfig`、`OfficialProfilesInput`、`MeterMargin`、`AnthropicRecord` | 发行装配；本包的示例 |

- [public-entry.spec.ts](../tests/public-entry.spec.ts) 核对运行时导出的集合。
- `package.json` 只声明 `.` 一个导出入口。`files` 含 `dist` 与 `resources/tokenizers`，所以发布产物带有词表文件。
- 规则表、计量器、组件采用与 `claudeRanksOf` 不导出，测试从源码路径读取它们。

## 定义索引

| 类型或值 | 定义 | 行为条款 |
| --- | --- | --- |
| `createAnthropicFamily`、`AnthropicFamilyConfig` | [family.ts](../src/family.ts) | [SPEC“家族与取得”](../SPEC.md#家族与取得) |
| `officialAnthropicProfiles`、`OfficialProfilesInput` | [profiles.ts](../src/profiles.ts) | [SPEC“官方档案”](../SPEC.md#官方档案) |
| `anthropicTokenizerResources`、`TokenizerResourceError` | [tokenizer.ts](../src/tokenizer.ts) | [SPEC“词表资源”](../SPEC.md#词表资源) |
| `ANTHROPIC_RECORDS`、`AnthropicRecord` | [records.ts](../src/records.ts)、[record.ts](../src/record.ts) | [SPEC“记录”](../SPEC.md#记录) |
| `MeterMargin` | 定义在 pi-ai-transport 的 [measurement.ts](../../pi-ai-transport/src/chat-completions/measurement.ts)，本包经 [meter.ts](../src/meter.ts) 转导 | [pi-ai-transport SPEC“共用计量规则”](../../pi-ai-transport/SPEC.md#共用计量规则)；本包的余量用法见 [SPEC“计量”](../SPEC.md#计量) |
| `ANTHROPIC_OWNER` | [owner.ts](../src/owner.ts) | [SPEC“记录”](../SPEC.md#记录) |

`PiFamily` 与引擎类型见 [pi-ai-transport 公开接口](../../pi-ai-transport/docs/public-api.md)。档案、计量与 tokenizer 类型见 [model-contract 公开接口](../../model-contract/docs/public-api.md)。`TiktokenResources` 见 [tokenizer-tiktoken](../../tokenizer-tiktoken/SPEC.md)。
