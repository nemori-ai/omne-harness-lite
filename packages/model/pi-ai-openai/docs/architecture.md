# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

| 模块 | 职责 | 持有的状态 |
| --- | --- | --- |
| `index.ts` | 根入口，转导工厂、档案函数、资源函数、记录与类型 | 无 |
| `owner.ts` | 包名常量 `OPENAI_OWNER` | 无 |
| `record.ts` | 记录类型：引擎的记录加上档案、规则名与计量数据 | 无 |
| `records.ts` | 12 条记录与 tokenizer 定义，纯数据 | 无 |
| `rules.ts` | 四个 hook 的规则表与 `hooksOf` | 无 |
| `images.ts` | 三条图片补丁规则 | 无 |
| `adoptions.ts` | 记录派生的组件采用与计数依据 | 无 |
| `meter.ts` | token 输入的写法与 `measure` | 每个计量器持有记录、tokenizer 与余量 |
| `tokenizer.ts` | 从 js-tiktoken 取 o200k 秩数据，组成 tokenizer 资源 | 无 |
| `profiles.ts` | 官方档案 | 无 |
| `family.ts` | `createOpenAiFamily` 与 `acquire` | 每个家族持有一次初始化的 tokenizer 结果 |

依赖方向：`family.ts` 依赖 `records.ts`、`rules.ts`、`meter.ts`；`meter.ts` 依赖 `images.ts` 与 `adoptions.ts`；`records.ts` 只依赖类型。外部依赖：model-contract（只用类型与校验函数）、pi-ai-transport 的根入口（`defineFamily`、`recordAdoption`）与 `./chat-completions`（`bindChatCompletions` 与类型）、tokenizer-tiktoken、json-text、operation-result，以及 js-tiktoken 的 `ranks/o200k_base`。本包不导入其他家族包。

`adoptions.ts`、`profiles.ts`、`family.ts`、`meter.ts` 中的测量部分，以及 `rules.ts` 中的用量算术，与 `pi-ai-anthropic` 的同名模块几乎相同。两个家族包互不导入，所以各持一份。这些模块是 #468 的清理候选。本文件不承诺合并的方式。

## 关键机制与理由

**记录是唯一清单。** 档案、采用、指纹与夹具都从 `OPENAI_RECORDS` 派生。全包不写型号计数。加一个型号只加一条记录、一行指纹与一组夹具。

**组件采用由记录派生。** 表示、计量、模板、投影、媒体变换、回放与证据的采用都是 `<记录名>#<组件>`，修订与摘要取记录的修订与摘要。记录中的规则名与数据都在摘要内，所以记录变化时这些采用一起变化，并且能精确解析回一条记录。代价：规则的代码不在摘要内，靠规则名的修订号与夹具保护。

**规则按表选取。** 规则表用 `satisfies Record<string, …>` 检查，规则名的类型是表的 `keyof typeof`。记录写错规则名时编译失败。`hooksOf` 把表项赋给带记录参数的函数类型，所以不需要记录的规则也可以写成无参函数。

**推理强度原样写出。** 封存件把请求的强度原样写入 `reasoning.effort`。网关词表含 `none` 与 `max`，所以每条记录把它公布的每个强度映射为同名的网关值，不写近似值。Astra 不公布 `none`，它的记录把 `none` 映射为 `unsupported`。记录尚未发布，所以这次映射直接写在修订 1 中。

**用量诊断由规则给出。** 只有家族知道用量项之间的算术，所以 `usage` 规则同时返回用量项与 `usage-inconsistent` 诊断。引擎只把诊断转成事实，不解释用量。

**计量看见的就是发出的形状。** `represent` 只读引擎交给它的投影，与 `encode` 使用同一投影。token 输入不含图片数据与密文：图片留占位，加密项只留数量。`measure` 对整份 token 输入的 JSON 计数一次，不分段相加。

**加密推理没有估算。** 契约不允许按密文长度分词，也不允许为满足上限而去掉它。所以带加密项的请求返回具名的 `unavailable`。这与封存件“完整输出组之外没有估算”的结果一致。完整输出组的计量与校准不迁入。

**图片尺寸来自媒体计量事实。** 本包不解码 data URL，不依赖 image-size。token 输入中的第 n 张图片对应表示中第 n 个图片事实。引擎当前给出的表示没有媒体事实，所以带内联图片的请求返回 `image-measurement-missing`。媒体读取与完整请求计量的组合归父卡 4.3 与 4.4。

**tokenizer 每个家族初始化一次。** o200k 秩数据约 2.3 MB，初始化要算一次摘要并构造引擎。家族在第一次取得时初始化，结果（包括失败）复用。tokenizer 没有需要释放的资源，所以绑定的 `release` 为空操作。

## 验证与维护

机制与验证的对应见 [SPEC“组合与验证”](../SPEC.md#组合与验证)。

- 记录或规则行为变化时，新增修订或规则名，补夹具与指纹。不得原地修改。
- 升级 js-tiktoken 时，tokenizer 定义的实现采用与词表摘要随之变化，所有记录须新增修订。
