# @omne-harness/tokenizer-tiktoken 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包是 `ModelTextTokenizer` 的 tiktoken 引擎 adapter。它封装 js-tiktoken 的初始化与文本计数，供家族成员的计量器构造 tokenizer。

本包依据下列已接受的正文：

- `ModelTextTokenizer`、`TokenizerDefinition`、`TokenizationSegment` 与 `TokenizationFailure` 的形状归 [model-contract](../model-contract/docs/public-api.md)。计数的共同规则归 [model-contract SPEC“分词与完整请求计量”](../model-contract/SPEC.md#分词与完整请求计量)。本文件不改变这些规则，只写明本引擎怎样兑现它们。
- 成员职责、资源与计量分工归[组架构“Tokenizer 的资源与计量分工”](../docs/architecture.md#tokenizer-的资源与计量分工)。词表、特殊 token 表与模板归家族成员。本包不收录任何厂商词表。
- 引擎依赖是 `js-tiktoken`，版本由仓库目录钉在 `1.0.21`（`pnpm-workspace.yaml` 的 `catalog`）。升级须另有依据。

本包不做下列事情：

- 不计量完整请求，不渲染模板，不处理媒体或回放。这些归家族成员的计量器。
- 不判断请求可否发出，不读档案，不取得凭据。
- 不提供加载本地任意路径或下载词表的入口。

## 结果与不变量

<a id="初始化"></a>
### 初始化

`createTiktokenTokenizer(resources)` 只在调用时核对一次资源。三项核对都成立时，它返回 `ok` 中的 tokenizer。任一项不成立时，它返回 `unavailable`，`diagnostic` 说明是哪一项。这就是“版本失配”的定义。

1. 实现：`definition.implementation.revision` 必须等于本模块实际加载的 js-tiktoken 包的版本。本包从该包自己的 `package.json` 读取版本。
2. 词表：`definition.vocabulary.digest` 必须等于 `ranks` 的规范 JSON 的 SHA-256。
3. 配置：`definition.configuration.digest` 必须等于 `specialTokens` 的规范 JSON 的 SHA-256。

核对按上面的顺序进行，第一项不成立时就返回。核对不成立时，本包不得换用另一套编码，不得用同名的其他版本补齐，也不得用字符倍率估算。

<a id="规范-json"></a>
规范 JSON 的写法：

- 没有空白。
- 对象的键按 UTF-16 码元排序。
- 字符串按 `JSON.stringify` 的写法。
- 数只能是非负安全整数，按十进制写出。
- `ranks` 的规范 JSON 是对象 `{"bpeRanks":…,"patStr":…,"specialTokens":{…}}`，只含这三个键。

对这些值，这个写法与 RFC 8785（JCS）相同。摘要是规范 JSON 的 UTF-8 字节的 SHA-256，写成 64 位小写十六进制。比较区分大小写。

如果 `ranks.specialTokens` 或 `specialTokens` 中有一个 id 不是非负安全整数，该值没有规范 JSON 形式。这时初始化返回 `unavailable`。

`definition.adoption` 不参加核对。本包不核对 `implementation` 的 `owner`、`name` 与 `digest`，也不核对 `vocabulary` 与 `configuration` 的 `owner`、`name` 与 `revision`。这些值由家族成员给出并负责。

初始化成功时，tokenizer 的 `definition` 是传入定义的冻结副本。

<a id="计数"></a>
### 计数

`count(segments)` 是纯计算。它不读文件，不读当前工作目录，不访问网络。

1. `text` 段按普通文本编码。文本中形似特殊 token 的文字（例如 `<|endoftext|>`）按普通文本计，不激活特殊 token，也不被拒绝。
2. 相邻的 `text` 段先连接成一段，再编码。分段计数不能相加。
3. `special-token` 段只查初始化时传入的 `specialTokens` 表。查到时，该段计 1。查不到时，`count` 返回 `unsupported-token`，`name` 是该段的名字。词表 `ranks.specialTokens` 中有该名字，不使它成为可用的特殊 token。
4. 特殊 token 表只看自有键。`toString`、`__proto__` 等原型上的名字不是特殊 token。
5. `text` 段的文本不是良构的 Unicode（例如有孤立的代理码元）时，`count` 返回 `invalid`。本包不替换字符，不做规范化、去空白或大小写转换。
6. 空序列计 `"0"`。空文本计 0。
7. 成功的结果是 `{ tokens }`，`tokens` 是非负十进制整数串，没有前导零。

`count` 遇到第一个失败就返回，不计其余段。

## 所有权、失败与生命周期

调用方拥有传入的资源对象。初始化把特殊 token 表的键复制成内部集合，并用 `ranks` 构造 js-tiktoken 引擎。之后调用方修改传入的对象，不改变任何计数。

tokenizer 没有需要释放的资源：没有文件句柄、套接字、计时器或后台工作。它被丢弃时由垃圾回收释放内存。共享 tokenizer 的关闭责任归装配它的家族成员。

js-tiktoken 的版本在每个进程中读取一次，在第一次初始化时读取，之后复用。`count` 不读取它。

失败的分类：

- 契约规定的失败值只有 `unavailable`（初始化）以及 `unsupported-token` 与 `invalid`（计数）。
- 找不到 js-tiktoken 的 `package.json` 时，初始化返回 `unavailable`。
- 读取清单遇到“文件不存在”以外的错误，或清单不是合法 JSON 时，初始化抛出原错误。
- 核对成立后，js-tiktoken 构造引擎时抛出的错误原样抛出。核对成立表示资源就是家族采用的那一份，这类错误是家族资源的缺陷。

## 组合与验证

本包消费 model-contract 的 tokenizer 类型与 `@omne-harness/operation-result` 的 `Outcome`，以及 js-tiktoken `1.0.21` 的 `js-tiktoken/lite` 入口。

每项义务的持续验证见 [tests/README.md](tests/README.md)：

| 义务 | 验证 | 前提与未覆盖 |
| --- | --- | --- |
| [初始化](#初始化)的三项核对 | `initialization.spec.ts`（快层） | 摘要常量在本包以外独立算出 |
| [规范 JSON](#规范-json) 的写法 | 两份词表的摘要常量与 Python 独立算出的值一致 | 只覆盖字符串、非负整数与对象 |
| [计数](#计数)的各条规则 | `count.spec.ts`（快层），用 o200k 与合成词表 | o200k 的计数与完整 js-tiktoken 编码器比较 |
| 发布后资源读取 | `published.spec.ts`（慢层）：构建产物在子进程与临时目录中初始化并计数，结果与源码一致 | 需要先构建本包 |

未覆盖：

- Anthropic 的 `claude.json` 由 `pi-ai-anthropic` 迁入并验证，不在本包测试。
- 家族成员给出的采用值是否与厂商实际的 tokenizer 一致，由家族成员验证。本地精确分词不证明上游计量精确。
- `count` 不读文件、不访问网络，由源码结构保证，没有运行时探测。
