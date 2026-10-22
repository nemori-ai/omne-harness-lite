# @omne-harness/modality 行为规格

本文件拥有 `@omne-harness/modality` 在公开类型以外的必要行为。公开形状与运行时校验归 [src/index.ts](src/index.ts)，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。本成员没有状态、资源或异步行为，下面的义务都是纯函数的输入输出关系。

## 范围与依据

本成员定义「有哪几种模态」和「一个媒体类型属于哪种模态」。它不定义哪个消费者支持哪些模态，也不定义任何消费者的准入规则。

依据如下。

- 统一语言 [UL-modality](../../../.meta_harness/design/ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality)：模态恰有四种，块上的模态由它的媒体类型决定。含义没有改变。
- 统一语言 [UL-media-type](../../../.meta_harness/design/ubiquitous_language/terms/record-and-context.md#ul-media-type--媒体类型--media-type)：媒体类型落在四种模态之一，块就是那一种。落在四种之外，块不属于任何模态。含义没有改变。
- 请求上下文 [RQ-04](../../context/request-context-contract/SPEC.md#rq-04-模态与可追溯表示)：实际媒体类型决定内容模态。
- Model 契约的「模态投影与实际表示」一节写明模态由内容媒体类型识别。Model 契约不在本轨道上，这里只用文字提及，不写链接。
- 原语义拥有者确认：Model 主干会话于 2026-10-19 确认含义一致，没有冲突条款。
- 本文件的对照表是 [#397](https://github.com/nemori-ai/omne-harness-lite/issues/397) 新写明的规则。已接受正文只给了原则，没有给对照。对照表由 PanQiWei 随 #397 接受。其中「全部 `audio/*` 都是 `voice`」是 PanQiWei 于 2026-10-19 的裁定。统一语言以后另做一处小改动指向本表。

根入口是本成员唯一的公开入口。本成员 `dependencies` 为空，不导入任何其他成员。

## 结果与不变量

### 四种模态

`Modality` 恰有四个字面量：`text`、`image`、`voice`、`video`。`MODALITIES` 按这个顺序列出它们，是冻结数组。

名字用 `voice`，不用 `audio`。统一语言、Model 契约和内容块的块种类都用 `voice`。

文件、思考和工具调用不是模态。本成员不提供块种类到模态的映射。块种类归内容块拥有者，文件块的模态由它的媒体类型决定。

模态与支持范围分开。本成员只说有哪几种模态。某个消费者支持哪几种，由消费者自己声明。例如 Model 的本阶段交付范围不含视频，但视频仍是一种模态。词表不含 `video` 会让 `video/mp4` 变成「不是模态」，按统一语言就成了「任何模型都读得了」，含义错误。

### 判定模态

`judgeModality(value)`：

- 值不是字符串，返回 `{ rejected: 'type' }`。
- 字符串不恰好等于四个字面量之一，返回 `{ rejected: 'modality' }`。`audio`、`speech`、`Text`、空串都在此列。不做大小写折叠，不做别名映射。
- 否则返回 `{ ok: <该模态> }`。

`judgeModalities(value)`：

- 值不是数组，返回 `{ rejected: 'type', index: null }`。
- 按下标顺序检查元素，遇到第一个出错的元素就停止，`index` 是它的下标。元素不是字符串，原因是 `type`。元素不是已知模态，原因是 `modality`。元素与前面某个元素相同，原因是 `duplicate`，`index` 指后出现的那个。稀疏数组的空位按 `undefined` 处理，原因是 `type`。
- 全部合法，返回 `{ ok: <新的冻结数组> }`，顺序与输入相同。结果不是输入数组本身，之后改输入数组不影响结果。
- 空数组合法。是否要求非空是消费者的政策。例如 Model 档案要求非空，Tool 省略时按文本处理。本成员不替它们判断。

### 判定媒体类型

`judgeMediaType(value)` 先看类型，再看文法，最后看顶层类型。

- 值不是字符串，返回 `{ rejected: 'type' }`。
- 字符串必须合乎 RFC 9110 第 8.3.1 节的 `media-type` 文法：`type "/" subtype parameters`。第 5.6.6 节给出 `parameters = *( OWS ";" OWS [ parameter ] )` 与 `parameter = parameter-name "=" parameter-value`。`type`、`subtype` 与参数名是第 5.6.2 节的 token，即一个或多个 `tchar`。参数值是 token 或第 5.6.4 节的 `quoted-string`。`=` 两侧不许有空白。`OWS` 是第 5.6.3 节的零个或多个空格或水平制表符，只在分号两侧出现。分号后面可以没有参数，所以 `image/png;`、`image/png ;`、`image/png;;`、`image/png; ;a=b`、`image/png;a=b;` 都合文法，规范形式都是 `image/png`。不合文法返回 `{ rejected: 'media-type' }`。下列都不合文法：空串、开头的空白、引号外不与分号相邻的空白（如 `image/png ` 与 `image/png;a=b ` 末尾的空白）、空的 `type` 或 `subtype`、缺斜杠、多于一个斜杠、`type`、`subtype` 或参数里的非法字符、缺 `=` 或缺值的参数、`=` 两侧的空白、引号不成对的参数。
- RFC 9110 的文法按八位字节写成。JS 字符串按 UTF-16 码元对应：码元 U+0000–U+00FF 按同值的八位字节判断，其中 U+0080–U+00FF 是 `obs-text`，只在 `quoted-string` 里合法，可以直接出现，也可以跟在反斜杠后面。U+0100 及以上的码元在任何位置都不合文法。
- 合法时，规范形式是小写的 `type/subtype`，参数全部丢弃，没有空白。返回 `{ ok: { mediaType: <规范形式>, modality } }`。
- `modality` 只看顶层类型，对照见下表。

| 顶层类型 | `modality` | 说明 |
| --- | --- | --- |
| `text` | `text` | 全部 `text/*`，如 `text/csv`、`text/plain` |
| `image` | `image` | 全部 `image/*`，含 `image/svg+xml` |
| `audio` | `voice` | 全部 `audio/*`，含音乐与 MIDI（PanQiWei 2026-10-19 裁定） |
| `video` | `video` | 全部 `video/*` |
| 其他（`application`、`font`、`model`、`multipart`、`message` 等） | `null` | 不属于任何模态。`application/pdf` 是 `null` |

判定不看内容，不看扩展名。`x-` 前缀、vendor 前缀和 `+suffix` 没有特殊含义：`image/svg+xml` 的顶层是 `image`，所以是 `image`；`application/vnd.example+png` 的顶层是 `application`，所以是 `null`。

`isCanonicalMediaType(value)`：`judgeMediaType(value)` 成功，且规范形式与输入的码点完全相同，才是 `true`。其他情况（包括值不是字符串）是 `false`。

规范化与 `isCanonicalMediaType` 的分工：`judgeMediaType` 接受带参数或大写的写法并给出规范形式，用于「读到什么就识别什么」。`isCanonicalMediaType` 用于「必须已经是规范形式」的场合，例如 Model 转换件的键。这类键按精确相等匹配，不经规范化。

### 求缺失的模态

`missingModalities(required, available)` 返回 `required` 中不在 `available` 里的模态。结果按 `MODALITIES` 的顺序排列，每个模态至多一次，是冻结数组。全部满足时是空数组。两个参数都不被修改。

这一步只做集合差。合法的转换能否补足缺口，归各消费者。

## 所有权、失败与生命周期

本成员不持有身份、状态或资源，没有生命周期、取消、并发或恢复问题。判定函数对普通值不抛出异常，不合格的输入以 `rejected` 值返回。读取输入时，输入自身的 getter 或 Proxy 抛出的错误原样传出，本成员不吞掉它，例如 `judgeModalities` 读数组的 `length` 或元素时。引擎资源耗尽同样原样传出：单个带引号的参数值有数百万个码元时，JavaScript 引擎的正则回溯栈可能耗尽并抛出 `RangeError`。实际的媒体类型远短于这个量级，本成员不另设长度上限。`missingModalities` 的参数是类型化的 `Modality` 列表。调用方先用 `judgeModalities` 判定，再传入。

本成员不规定消费者的拒绝措辞、失败词汇或处置。没有外部副作用。

## 不含项

下列内容不在本成员，也不由本成员的函数暗示。

- 历史模态投影：会话记录是来源，请求上下文把它投影给 Model，Model 与档案声明的输入模态比较。
- Model 转换件的键、选择和同键唯一规则。
- Model 的初始文本约束，它是 Model 的准入规则。
- Tool 结果块的集合。
- 块种类到模态的组合，以及块的种类与它的媒体类型所推出的模态不一致时怎么办。这些归内容块拥有者。本成员是叶子，不依赖内容块。内容块以后可以用本成员实现组合函数。

## 组合与验证

### 消费者

| 消费者 | 用法 | 状态 |
| --- | --- | --- |
| Model 契约 | 档案输入输出模态、转换件模态键、媒体类型识别。档案声明用支持子集，要求、投影、转换件键用完整 `Modality` | Model 主干会话于 2026-10-19 同意在 #381 或其后续采用 |
| Tool 契约 | 工具定义的参数模态与结果模态改用 `readonly Modality[]` 和 `judgeModalities`。既有定义里的 `audio`、`speech` 按拒绝处理，不静默映射 | Tool 主干的后续卡 |
| 会话、代理、基础设施 | 需要时按公开入口导入 | 未来 |

当前轨道上没有生产调用点。公开入口由本成员测试消费。

### 验收对照

C1。公开面与上文一致：六个运行时导出和类型 `Modality`、`ModalityJudgment`、`ModalitiesJudgment`、`MediaTypeJudgment`。由 [tests/public-entry.spec.ts](tests/public-entry.spec.ts) 与 [tests/modality-types.spec-d.ts](tests/modality-types.spec-d.ts) 检查。

C2。模态判定、列表判定与 `missingModalities` 的行为由 [tests/modality.spec.ts](tests/modality.spec.ts) 检查。

C3。媒体类型的文法、规范形式与对照表由 [tests/media-type.spec.ts](tests/media-type.spec.ts) 检查。其中有每个 `tchar` 在四种 token 位置上的表驱动用例、空参数位、水平制表符作 `OWS`、`obs-text`，以及对抗输入的耗时上限。

C4。`dependencies` 为空，只有 `.` 入口，构建产物不导入任何模块，由 [tests/public-entry.spec.ts](tests/public-entry.spec.ts) 检查。

未覆盖：没有消费者在本轨道上调用本成员，组合行为留给消费者各自的验证。
