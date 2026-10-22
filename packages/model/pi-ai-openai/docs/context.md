# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。它覆盖独立消费与适用的 Harness 接入，引用系统架构与真实消费者，不成为新的架构源。

## 使用方式

装配方创建家族并交给传输，示例见 [README_ZH.md“使用”](../README_ZH.md#使用)。

- 依赖：本包、pi-ai-transport 与 tokenizer-tiktoken。本包自带 js-tiktoken 依赖，只用它的 o200k 秩数据。
- 配置：tokenizer 资源、解码器限额与估算余量都由装配方给出，本包没有默认值。
- 档案：`officialOpenAiProfiles` 给出纯数据的档案定义。档案的身份、修订与范围归 Model 的档案维护。
- 释放：家族与绑定没有需要释放的资源。传输按家族表的规则调用 `release`。

## 消费者与定位

```mermaid
flowchart LR
  Assembly[发行装配] -->|createOpenAiFamily| OpenAI[pi-ai-openai]
  Assembly -->|composeFamilies| Transport[pi-ai-transport]
  OpenAI -->|bindChatCompletions| Transport
  OpenAI -->|o200k 秩数据| Tik[tokenizer-tiktoken]
  OpenAI -. 类型 .-> Contract[model-contract]
```

`pi-ai-anthropic` 的联调用例与跨家族示例以开发依赖消费本包。计划中的消费者是发行装配，它还没有消费本包。本包的示例见 [examples/README.md](../examples/README.md)。本包在模型组中的位置见[组架构“成员与新增条件”](../../docs/architecture.md#成员与新增条件)。
