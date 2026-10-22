# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

| 模块 | 职责 | 持有的状态 |
| --- | --- | --- |
| `index.ts` | 根入口，转导工厂、档案函数、资源函数、错误类、记录与类型 | 无 |
| `owner.ts` | 包名常量 `ANTHROPIC_OWNER` | 无 |
| `record.ts` | 记录类型：引擎的记录加上档案、规则名与计量数据 | 无 |
| `records.ts` | 4 条记录与 tokenizer 定义，纯数据 | 无 |
| `rules.ts` | 四个 hook 的规则表与 `hooksOf` | 无 |
| `images.ts` | 28 像素块图片规则与图片媒体类型 | 无 |
| `adoptions.ts` | 记录派生的组件采用与计数依据 | 无 |
| `meter.ts` | token 输入的写法与 `measure` | 每个计量器持有记录、tokenizer 与余量 |
| `tokenizer.ts` | 读取并核对 `claude.json`，组成 tokenizer 资源 | 无 |
| `profiles.ts` | 官方档案 | 无 |
| `family.ts` | `createAnthropicFamily` 与 `acquire` | 每个家族持有一次初始化的 tokenizer 结果 |

依赖方向：`family.ts` 依赖 `records.ts`、`rules.ts`、`meter.ts`；`meter.ts` 依赖 `images.ts` 与 `adoptions.ts`；`tokenizer.ts` 依赖 `records.ts`；`records.ts` 只依赖类型与 `images.ts` 的媒体类型常量。外部依赖：model-contract（只用类型与校验函数）、pi-ai-transport 的根入口（`defineFamily`、`recordAdoption`）与 `./chat-completions`（`bindChatCompletions` 与类型）、tokenizer-tiktoken、json-text 与 operation-result。本包不导入其他家族包。

## 关键机制与理由

**记录是唯一清单。** 档案、采用、指纹与夹具都从 `ANTHROPIC_RECORDS` 派生。全包不写型号计数。封存件把四个型号分别写在四个文件中，现行做法只写一次。

**前缀要求是记录数据。** 封存件在回放政策里列出需要签名前缀的型号。现行记录用 `replay.prefix` 表达它，引擎按记录执行降级，所以引擎不认识型号名。

**整组是一个部件。** Anthropic 只接受完整的签名思考组。所以 `seal` 把一次响应的全部推理项写成一个载荷，组中任何一项不可以回放时不产生部件。这与封存件把整组当作一个单位的做法一致。现行与封存件的不同是拒绝的位置：封存件在下一次计划时拒绝，现行解码器不产生部件，下一次编码时编解码器对没有部件的思考返回 `unsupported`。

**没有签名组的思考明确失败。** 编解码器在 `parts` 为空时收到的思考，可能是本家族消息的原生思考，也可能是 `adapter` 规则下的外来思考。两种输入相同，编解码器分不清。Anthropic 不接受未签名的思考，写成文本会改变消息的含义，丢弃会静默改变请求。所以编解码器返回 `unsupported`。

**参数子集按封存件，丢弃改为失败。** 封存件把 `temperature`、`top-p`、`seed` 与两个 penalty 静默丢弃，迁移清单要求改为明确失败。推理强度 `low` 至 `max` 原样写出。`none` 不在封存件公布的集合中，记录把它映射为 `unsupported`；前缀降级不经这个映射，它由引擎写 `reasoning.enabled: false`。

**停止序列的限额是本项目的提供值。** 封存件透传停止序列，没有数量或长度限额。契约要求按适配采用核对数量与长度，所以记录写了 16 项与 1024 个字符。这两个值不是上游公布的限额。

**用量诊断由规则给出。** 只有家族知道用量项之间的算术，所以 `usage` 规则同时返回用量项与 `usage-inconsistent` 诊断。引擎只把诊断转成事实，不解释用量。

**计量看见的就是发出的形状。** `represent` 只读引擎交给它的投影，与 `encode` 使用同一投影。token 输入与封存件的计数对象同形：消息与工具的 JSON，图片为 `[image]` 占位，没有缓存标记。`measure` 先做 NFKC 规范化，再对整份文本计数一次。tokenizer 不激活特殊 token，这一点与封存件不同，迁移清单要求如此。

**签名组没有估算。** 签名组不是可以分词的可见文本，契约也不允许为满足上限而去掉它。封存件用上游的输出量估算整组，那属于不迁入的完整输出组计量。所以带签名组的请求返回具名的 `unavailable`。

**图片尺寸来自媒体计量事实。** 本包不解码 data URL，不依赖 image-size。token 输入中的第 n 张图片对应表示中第 n 个图片事实。引擎当前给出的表示没有媒体事实，所以带内联图片的请求返回 `image-measurement-missing`。媒体读取与完整请求计量的组合归父卡 4.3 与 4.4。

**词表由装配方读取，家族不读文件。** `claude.json` 随包发布。`anthropicTokenizerResources` 读文件并核对 SHA-256，这与封存件在载入时核对摘要相同。家族只接受资源值，所以规则、计量与 `acquire` 都不读文件。`tokenizer.ts` 用相对模块的 URL 定位文件，`src` 与 `dist` 都在包根下一级，所以源码与发布产物读到同一个文件。

**tokenizer 每个家族初始化一次。** 初始化要算一次摘要并构造引擎。家族在第一次取得时初始化，结果（包括失败）复用。tokenizer 没有需要释放的资源，所以绑定的 `release` 为空操作。

## 验证与维护

机制与验证的对应见 [SPEC“组合与验证”](../SPEC.md#组合与验证)。

- 记录或规则行为变化时，新增修订或规则名，补夹具与指纹。不得原地修改。
- 升级 js-tiktoken 或替换 `claude.json` 时，tokenizer 定义随之变化，所有记录须新增修订。
- 本包的 `adoptions.ts`、`profiles.ts` 与 `family.ts` 与 OpenAI 家族的同名模块结构相同。两个家族包不得互相导入，所以共用部分只能移到 pi-ai-transport，这需要该成员的设计。
