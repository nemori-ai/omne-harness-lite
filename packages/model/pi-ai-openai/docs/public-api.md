# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口 | 源码 | 导出 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/pi-ai-openai` | [index.ts](../src/index.ts) | 运行时值 `createOpenAiFamily`、`officialOpenAiProfiles`、`openAiTokenizerResources`、`OPENAI_RECORDS`、`OPENAI_OWNER`；类型 `OpenAiFamilyConfig`、`OfficialProfilesInput`、`MeterMargin`、`OpenAiRecord` | 发行装配；跨家族示例 |

- [public-entry.spec.ts](../tests/public-entry.spec.ts) 核对运行时导出的集合。
- `package.json` 只声明 `.` 一个导出入口。
- 规则表、计量器与组件采用不导出，测试从源码路径读取它们。

## 定义索引

| 类型或值 | 定义 | 行为条款 |
| --- | --- | --- |
| `createOpenAiFamily`、`OpenAiFamilyConfig` | [family.ts](../src/family.ts) | [SPEC“家族与取得”](../SPEC.md#家族与取得) |
| `officialOpenAiProfiles`、`OfficialProfilesInput` | [profiles.ts](../src/profiles.ts) | [SPEC“官方档案”](../SPEC.md#官方档案) |
| `openAiTokenizerResources` | [tokenizer.ts](../src/tokenizer.ts) | [SPEC“计量”](../SPEC.md#计量) |
| `OPENAI_RECORDS`、`OpenAiRecord` | [records.ts](../src/records.ts)、[record.ts](../src/record.ts) | [SPEC“记录”](../SPEC.md#记录) |
| `MeterMargin` | 定义在 pi-ai-transport 的 [measurement.ts](../../pi-ai-transport/src/chat-completions/measurement.ts)，本包经 [meter.ts](../src/meter.ts) 转导 | [pi-ai-transport SPEC“共用计量规则”](../../pi-ai-transport/SPEC.md#共用计量规则)；本包的余量用法见 [SPEC“计量”](../SPEC.md#计量) |
| `OPENAI_OWNER` | [owner.ts](../src/owner.ts) | [SPEC“记录”](../SPEC.md#记录) |

`PiFamily` 与引擎类型见 [pi-ai-transport 公开接口](../../pi-ai-transport/docs/public-api.md)。档案、计量与 tokenizer 类型见 [model-contract 公开接口](../../model-contract/docs/public-api.md)。
