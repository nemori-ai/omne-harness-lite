# resources

本目录承载本包运行所需的非源码资源。

## 允许的内容

数据、模板、模型文件及其许可文件。

## 边界

每项资源写明来源、许可、读取方式与发布要求。资源是否随包发布由对应责任明确声明。

## 维护

资源更新时，同步来源与许可说明，以及读取它的代码。

## 本包事实

`tokenizers/anthropic-legacy/` 有三个文件，从封存件 `packages.0.0.1.legacy/model/pi-ai-transport/resources/tokenizers/anthropic-legacy/` 原样迁入：

- `claude.json`：旧 Claude BPE 词表，696615 字节，SHA-256 `58dad83d85e9cd57be209172449ebfbc395df2b455c11fe8b7e5b661e6f462ad`。来源是 anthropics/anthropic-tokenizer-typescript 的提交 `4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b`。Anthropic 称它对 Claude 3 以后的型号只是很粗的近似。
- `LICENSE`：上游许可证，SHA-256 `f8508be03f7b370f84fb8411b78cc36b5addaa185628d91b6ca09888d0487798`。上游仓库的 LICENSE 是 MIT 条款，其 package.json 声明 Apache-2.0。副本删去了末尾一个空行，条款不变。
- `provenance.json`：上游仓库、提交、两个文件的摘要与参考包 @anthropic-ai/tokenizer 0.0.4。

读取方式：`src/tokenizer.ts` 的 `anthropicTokenizerResources` 读取 `claude.json`，核对 SHA-256，不符时抛出 `TokenizerResourceError`。发布要求：`package.json` 的 `files` 含 `resources/tokenizers`，所以三个文件随包发布。
