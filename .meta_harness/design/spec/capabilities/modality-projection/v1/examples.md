# 规范实例：投影、兼容、登记与转换

属于 `capability.modality-projection` v1 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：第 1～4 节走投影与兼容，第 5～7 节走登记与一次转换，第 8～9 节走一条消息与一次替换，第 10 节是一个消费者怎么用本契约。

**两条读法上的边界：**

- **标识串只是占位**：`b1`、`c_ocr`、`T_A` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）。块的完整形状以 `data.content-blocks` v1 为准，这里只写到判定用得着的成员。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `P_text` | 一份档案，`inputModalities = [text]` |
| `P_vision` | 一份档案，`inputModalities = [text, image]` |
| `P_omni` | 一份档案，`inputModalities = [text, image, audio, video]` |
| `T_A` | 会话所属的租户身份（`TenantId`） |
| `c_asr`、`c_ocr`、`c_kf`、`c_mp4` | 四件转换件的不透明引用 |
| 「登记完」 | 系统装配层已宣告它这一份声明全部登记完毕（[S-17](contract.md#s-17-登记转换件-registerconverter) ④）；**除非某行另说，都已登记完** |
| 标注 `(T,T)` | `visibility = { toHuman: true, toModel: true }`，其余同理 |

## 1. 语音块：没登记就挡，登记了就不挡，事后登记不回头

规范场景 [S-30](contract.md#s-30-没登记就挡登记了就不挡事后登记不回头)。两个部署：`D0` 的登记表是空的；`D1` 在 `{kind: modality, modality: audio}` 上登记了 `c_asr`。
各有一个新会话收到一条用户消息，只装一个语音块 `v1`（`audio/wav`，`(T,T)`）。

| 步 | 在哪 | 调用 / 观察 | 预期 | 依据 |
|---|---|---|---|---|
| 1 | `D0` | `convert(v1, T_A)` | `noConverter`——**不是失败** | [S-10](contract.md#s-10-一个块落在哪个键上)、[S-18](contract.md#s-18-转换一个块-convert) ⑤ |
| 2 | `D0` | 那条消息 | 交回 `observed`，**原样落盘**，`v1` 没有 transcript | [S-20](contract.md#s-20-一条消息在落盘之前的转换全有或全无) ⑤ |
| 3 | `D0` | `project(L)` | `{audio}` | [S-5](contract.md#s-5-模态投影是对会话日志的一次折叠) |
| 4 | `D0` | `compatible(P_text, {audio})` · `compatible(P_omni, {audio})` | `{ blocked: [audio] }` · `{ ok }` | [S-16](contract.md#s-16-兼容判定-compatible) |
| 5 | `D1` | `convert(v1, T_A)` | 转成了：`renderings = [{ producedBy: system, blocks: [文本块 "今天下午三点开会"] }]`，`transcript = "今天下午三点开会"` | [S-11](contract.md#s-11-一次合法的转换产出) |
| 6 | `D1` | 那条消息 | 交回 `rewrite`，`v1` 挂上两个成员后落盘；**`v1` 的其余成员一个字节不变** | [S-20](contract.md#s-20-一条消息在落盘之前的转换全有或全无) ④⑤ |
| 7 | `D1` | `project(L)` | `∅`——`v1` 带着 transcript，派生块不计。**这是算出来的空集，不是顶替** | [S-5](contract.md#s-5-模态投影是对会话日志的一次折叠) |
| 8 | `D1` | `compatible(P_text, ∅)` | `{ ok }`——纯文本档案仍是合法目标（另两项另算） | [S-16](contract.md#s-16-兼容判定-compatible) |
| 9 | `D0` | 换一份系统装配，在 `{modality: audio}` 上登记 `c_asr`；**对第 1～3 步那个会话重读** `project(L)` | 仍是 `{audio}`；`P_text` 仍被挡；日志里 `v1` 仍没有 transcript | [S-3](contract.md#s-3-本契约明确不承诺什么)「不回头补」、[S-6](contract.md#s-6-只增不减可以逐条并进去重算必得同一答案) 单调 |

> 施工简报把这一例写成「语音块进来 → 被挡 → 转换出 transcript → 不再挡」。**同一个块做不到**：
> 它落盘时没有 transcript 就永远没有，投影只增不减。所以拆成两个部署对照，第 9 步证明「事后登记不回头」。

## 2. 文件块两键都命中，取媒体类型键

规范场景 [S-31](contract.md#s-31-文件块两键命中取媒体类型键)。登记表：`{modality: video} → c_kf`，`{media_type: video/mp4} → c_mp4`，`{media_type: image/png} → c_ocr`。

| 块 | 候选键（依次） | 落到 | 预期 | 依据 |
|---|---|---|---|---|
| 文件块，`attachment.mediaType = video/mp4` | `{media_type: video/mp4}`，`{modality: video}` | `c_mp4` | **只调 `c_mp4`**；`renderings` 恰一份 | [S-10](contract.md#s-10-一个块落在哪个键上)（主线裁定 S1-g） |
| 文件块，`video/mp4;codecs=avc1` | 同上（**去掉参数再比**） | `c_mp4` | 同上 | [S-10](contract.md#s-10-一个块落在哪个键上)、[S-8](contract.md#s-8-转换件的键) |
| 文件块，`video/webm` | `{media_type: video/webm}`，`{modality: video}` | `c_kf` | 媒体类型键没登记，落到模态键 | [S-10](contract.md#s-10-一个块落在哪个键上) |
| **图块**，`image/png` | `{modality: image}` | — | `noConverter`：**媒体类型键只管文件块**，`c_ocr` 不接图块 | [S-10](contract.md#s-10-一个块落在哪个键上) |
| 文件块，`image/png` | `{media_type: image/png}`，`{modality: image}` | `c_ocr` | 转 | [S-10](contract.md#s-10-一个块落在哪个键上) |
| 文件块，`text/csv` | `{media_type: text/csv}`（模态是 `text`，**没有模态键**） | — | `noConverter` | [S-8](contract.md#s-8-转换件的键)、[S-10](contract.md#s-10-一个块落在哪个键上) |
| 文件块，`application/pdf` | `{media_type: application/pdf}`（无模态） | — | `noConverter`；它**不进投影**（无模态） | [S-5](contract.md#s-5-模态投影是对会话日志的一次折叠) |

## 3. 只给人看的块，与工具结果里的图

规范场景 [S-32](contract.md#s-32-只给人看的块不改变合法目标)。登记表为空。

| 步 | 落进日志的 | `project(L)` | `compatible(P_text, ·)` | 依据 |
|---|---|---|---|---|
| 1 | 一条工具说过程的消息，装一张图 `(T,F)` | `∅` | `{ ok }` | [S-5](contract.md#s-5-模态投影是对会话日志的一次折叠) 的 `counted`（主线裁定：只计给模型看的块）；`data.messages/v1#S-13` |
| 2 | 一条工具消息，工具结果块 `(T,T)` 里嵌一张图 `(T,T)` | `{image}` | `{ blocked: [image] }` | 嵌在工具结果里的块算 |
| 3 | 另一条工具消息，工具结果块 `(T,F)` 里嵌一张图 `(T,T)` | 不因这一条变 | — | 合取：容器不给模型，里面那块也不给（`data.content-blocks/v1#S-5`） |
| 4 | 一条压缩记录，名单点了第 2 步那张图 | **仍含 `image`** | 仍被挡 | 投影看块上那一位、**不看名单**——它不是「此刻模型可读」（[S-5](contract.md#s-5-模态投影是对会话日志的一次折叠)、[S-6](contract.md#s-6-只增不减可以逐条并进去重算必得同一答案)） |

## 4. 一份日志逐块手算

`L` 依次是下面九条消息（登记表与投影无关，投影只看块上已有的东西）：

| 消息 | 块（标注） | 这一块算不算、算成什么 |
|---|---|---|
| `m1` 用户 | `b1` 文本 `(T,T)`；`b2` 图 `image/png` `(T,T)`，无 transcript | `b1` → `text`；`b2` → `image` |
| `m2` 模型回复 | `b3` 思考 `(F,T)`；`b4` 完整工具调用 `(T,T)` | 都是 `text` |
| `m3` 工具说过程 | `b5` 图 `(T,F)` | 不算（`toModel` 为假） |
| `m4` 工具 | `b6` 工具结果 `(T,T)`，里面：`b6a` 图 `(T,T)` 带 transcript；`b6b` 文件 `video/mp4` `(T,T)` 无 transcript | `b6` 是容器，无模态；`b6a` 不算（有 transcript）；`b6b` → `video` |
| `m5` 压缩记录 | `b7` 文本摘要 `(T,T)`；名单 `[(m1, b2)]` | `b7` → `text`；**名单不让 `b2` 退出** |
| `m6` 用户 | `b8` 文件 `application/pdf` `(T,T)` | 不算（无模态） |
| `m7` 用户 | `b9` 语音 `(T,T)` 带 transcript，派生表示里有一块图 `(F,T)` | `b9` 不算；**派生表示里那块图不算** |
| `m8` 工具 | `b10` 工具结果 `(T,F)`，里面 `b10a` 图 `(T,T)` 无 transcript | 不算（合取） |
| `m9` 模型回复 | `b11` 没长完的工具调用 `(F,F)` | 不算 |

| 前缀 | `project` | `compatible(P_text, ·)` | `compatible(P_vision, ·)` | `compatible(P_omni, ·)` |
|---|---|---|---|---|
| `m1` | `{text, image}` | `{ blocked: [image] }` | `{ ok }` | `{ ok }` |
| `m1..m4` | `{text, image, video}` | `{ blocked: [image, video] }` | `{ blocked: [video] }` | `{ ok }` |
| `m1..m5` | 同上——**压缩之后不变小** | 同上 | 同上 | 同上 |
| `m1..m9` | `{text, image, video}` | 同上 | 同上 | 同上 |

**逐条并入必须得到同一张表**：从 `m1` 的答案开始，每追加一条只并上那一条自己的贡献（`m2` 贡献 `{text}`、`m3` 贡献 `∅`、`m4` 贡献 `{video}`……），
每一行都与整份重算相同（[S-6](contract.md#s-6-只增不减可以逐条并进去重算必得同一答案)、[S-37](contract.md#s-37-投影逐条并入与整份重算相同)）。

## 5. 兼容判定的边

| 调用 | 预期 | 依据 |
|---|---|---|
| `compatible(P_text, {text})` | `{ ok }`——**文本从不被挡** | [S-7](contract.md#s-7-模态兼容) |
| `compatible(P_vision, {image, audio})` | `{ blocked: [audio] }`；`[audio]` 与 `[audio]` 之外的任何次序都等价 | [S-16](contract.md#s-16-兼容判定-compatible) ⑤ |
| `compatible(一份 inputModalities = [image] 的档案, ·)` | `invalidInput`，原因 `input_text_missing`（**原名，取自 `data.model-profile/v1#S-25`**） | [S-13](contract.md#s-13-输入不合形状收成-invalidinput) |
| `compatible(P_text, {file})` | `invalidInput`：`file` 不是模态 | [S-16](contract.md#s-16-兼容判定-compatible) ⑥ |
| 日志读不到，调用方拿 `∅` 去调 `compatible(P_text, ∅)` | **这次调用本身就违约**：投影不知道时不得调（结果 `{ ok }` 会把每个模型都放成合法目标） | [S-12](contract.md#s-12-缺席时的默认答案) |
| 一份 `maxImageBytes` 很小的 `P_vision` 遇上 `{image}` | `{ ok }`——**大小上限不归兼容判定** | [S-7](contract.md#s-7-模态兼容) |

## 6. 登记

| 调用（同一份系统装配里依次） | 预期 | 依据 |
|---|---|---|
| `registerConverter({kind: modality, modality: image}, c_ocr)` | 成功 | [S-17](contract.md#s-17-登记转换件-registerconverter) |
| `registerConverter({kind: modality, modality: image}, c_ocr2)` | **`keyTaken`，装配失败**——不是「后者覆盖前者」 | [S-17](contract.md#s-17-登记转换件-registerconverter) ③⑥⑦ |
| `registerConverter({kind: modality, modality: image}, c_ocr)`（**同一件**再登一次） | **`keyTaken`**——不论是不是同一件 | 同上 |
| `registerConverter({kind: media_type, mediaType: "image/png"}, c_png)` | 成功——与上面的模态键**不是同一个键** | [S-8](contract.md#s-8-转换件的键) |
| `registerConverter({kind: modality, modality: text}, c_x)` | `invalidInput`：模态键不收 `text` | [S-8](contract.md#s-8-转换件的键) |
| `registerConverter({kind: media_type, mediaType: "application/pdf;version=1.7"}, c_pdf)` | `invalidInput`：媒体类型键不带参数。**不截掉参数后登记** | [S-8](contract.md#s-8-转换件的键)、[S-13](contract.md#s-13-输入不合形状收成-invalidinput) |
| `registerConverter({kind: media_type, mediaType: "Application/PDF"}, c_pdf)` | `invalidInput`：不是规范形式。**不改成小写后登记** | 同上 |
| `registerConverter({kind: extension, name: "ocr"}, c_ocr)` | `invalidInput`：`kind` 集合闭合 | [S-8](contract.md#s-8-转换件的键) |
| `registerConverter({kind: modality, modality: image})`（没给 `converter`） | `invalidInput` | [S-17](contract.md#s-17-登记转换件-registerconverter) ⑧ |

## 7. 转换一个块：每个结果一个实例

规范场景 [S-35](contract.md#s-35-转换件违约的五种样子) 在此。登记表：`{modality: image} → c_ocr`；`img` 是一个图块 `image/png` `(T,T)`，引用形状。
「`c_ocr` 交回」一列是故障注入下它交回的东西。

| # | 输入 | `c_ocr` 交回 | 预期 | 判定次序 |
|---|---|---|---|---|
| 1 | 一个文本块，`T_A` | — | `invalidInput`：不是转换件的输入。**不是 `noConverter`** | 1 |
| 2 | 一个已带 `renderings` 与 `transcript` 的图块，`T_A` | — | `invalidInput` | 1 |
| 3 | `img`，**没给 `tenant`** | — | `invalidInput`；不从「当前会话」补 | 1 |
| 4 | 媒体类型写成 `Image/PNG` 的图块 | — | `invalidInput`，原因 `malformed`（原名，取自 `data.content-blocks/v1#S-26`） | 1 |
| 5 | `img`，**系统装配尚未宣告登记完** | — | `converterFailed`。**不是 `noConverter`** | 2 |
| 6 | `img`，登记表是空的、已登记完 | — | `noConverter` | 3 |
| 7 | `img`，`c_ocr` **起不来** | — | `converterFailed`（主线裁定 C-7）。**不是 `noConverter`** | 4 |
| 8 | `img`，引用所指的字节**读不到** | — | `converterFailed`；不当作空图 | 4 |
| 9 | `img` | `{ renderings: [{ system, [文本块 "一张柱状图"] }], transcript: "一张柱状图" }` | 转成了 | — |
| 10 | `img` | 同上，但 `transcript: ""` | `transcriptMissing` | 5 |
| 11 | `img` | `{ renderings: [...] }`，没有 `transcript` | `transcriptMissing` | 5 |
| 12 | `img` | 没有 `transcript`，**且**派生表示里有一个文件块 | `transcriptMissing`——次序 5 先于 6 | 5 |
| 13 | `img` | `{ transcript: "一张柱状图" }`，**没有 `renderings`** | `converterFailed`：只交 transcript 非法（主线裁定 S1-g） | 6 |
| 14 | `img` | 派生表示里有一个文件块 | `converterFailed` | 6 |
| 15 | `img` | 派生表示里是一个**图块** | `converterFailed`：要的是**别的**模态 | 6 |
| 16 | `img` | **两份**派生表示 | `converterFailed`：只出一份 | 6 |
| 17 | `img` | 派生块缺了 `visibility` 的一位 | `converterFailed`：派生块同样要合块的形状。**不补那一位** | 6 |

**10～17 必须同跑**：只跑第 9 行，一个把任何产出都照单全收的实现也会全过；而 10～17 每一行都**不得被「修好」之后通过**（不补 transcript、不删掉那个文件块、不只留第一份）。

## 8. 一条消息：全有或全无

规范场景 [S-33](contract.md#s-33-转换件不可用时不落原样)、[S-34](contract.md#s-34-一块转不成整条不落盘)。登记表：`{modality: image} → c_ocr`。

| # | 消息（产生者） | 发生了什么 | 转换那一件交回 | 日志里 | 依据 |
|---|---|---|---|---|---|
| 1 | 用户：文本 ＋ `img1` ＋ `img2` | `c_ocr` 对 `img1` 转成了，对 `img2` 交回空 transcript | `veto`，`reason` 点到 `img2` 与 `transcriptMissing`，**不转述图里的内容** | **没有这条消息，也没有 `img1` 的派生表示** | [S-20](contract.md#s-20-一条消息在落盘之前的转换全有或全无) ③⑥ |
| 2 | 用户：只有文本 | **转换这一侧整个不可用** | `observed` | 照常落盘 | [S-22](contract.md#s-22-没有转换件输入的消息不依赖转换这一侧) |
| 3 | 用户：文本 ＋ `img1` | 同上 | 按否决处置 | 没有这条消息；投影没变 | [S-21](contract.md#s-21-转换件不可用即转换失败) |
| 4 | 工具：工具结果块里嵌 `img1` | 转成了 | `rewrite`：派生属性挂在**嵌着的那张图**上，工具结果块自己不动 | 带派生属性落盘 | [S-20](contract.md#s-20-一条消息在落盘之前的转换全有或全无) ①④ |
| 5 | 工具说过程：`img1` `(T,F)` | `c_ocr` 起不来 | 按否决处置——**本版按字面也转只给人看的块** | 没有这条过程消息 | [S-20](contract.md#s-20-一条消息在落盘之前的转换全有或全无) ①；**这一行的结论等 [G-1](contract.md#十一已知缺口)** |
| 6 | 模型回复：文本 ＋ 模型产出的一张图 | 转成了 | 应交回 `rewrite`——**但按主线裁定 D-5 那一格对模型回复只开否决**，这一行**本版走不通** | — | [S-20](contract.md#s-20-一条消息在落盘之前的转换全有或全无)；[G-2](contract.md#十一已知缺口) |

否决之后按产生者走哪一路（第 1、3 行是用户消息：拒绝这次请求并告知发送方）**不归本契约**，归 `capability.loop-extension-runner`。

## 9. 替换不经过「没登记」

规范场景 [S-36](contract.md#s-36-替换不经过没登记)。时间自上而下；带图的消息不断送进来。

| 时刻 | 系统装配 | 登记表对 `{modality: image}` 的答 | 这时落盘的带图消息 |
|---|---|---|---|
| t0 | 第一份声明：`c_ocr`，已登记完 | 有（`c_ocr`） | 带 `c_ocr` 的产出落盘 |
| t1 | 开始换成第二份声明（同一个键登记 `c_ocr2`） | **答不出** | **被否决**（`converterFailed`）——**不是原样落盘** |
| t2 | 第二份声明登记完 | 有（`c_ocr2`） | 带 `c_ocr2` 的产出落盘 |
| t1 上正在进行的那一次 `c_ocr` 转换 | — | — | 要么以 `c_ocr` 的合法产出落盘，要么 `converterFailed`；**不拼、不收成 `noConverter`**（[S-28](contract.md#s-28-替换与撤除时在途的转换)） |

**绝不能观察到**：t1 前后任何一条带图的消息，那张图以「没有 transcript」落盘。

## 10. 一个消费者怎么用：工具结果那一端

资产注册表重算工具可用性时，工具**结果那一端**（[PF-006 §6.11](../../../../product/PF-006-tools-and-skills/design.md#两端的差别在候选提供者不在规则)）。
工具 `screenshot` 声明结果里会有 `image`；有效模型是 `P_text`。

| 登记表 | 注册表做的事 | 预期 | 依据 |
|---|---|---|---|
| `{modality: image} → c_ocr` | `image ∉ P_text.inputModalities` ⇒ 查登记 `{modality: image}` | 「有」⇒ 这一项满足，`screenshot` 可用 | [S-19](contract.md#s-19-查登记服务面名待账本) |
| 空 | 同上 | 「无」⇒ 不满足，`screenshot` 不可用（同名替换件那一套归注册表） | 同上 |
| 尚未登记完 | 同上 | 「答不出」⇒ **按不满足处理**，不当「有」 | [S-19](contract.md#s-19-查登记服务面名待账本) ⑥ |
| 只有 `{media_type: image/png} → c_png` | 同上 | 「无」——**只在一种媒体类型上有兜底，不等于这一种模态有兜底** | [S-19](contract.md#s-19-查登记服务面名待账本) 末段 |

**调用那一端不经本契约**：工具 `sketch-edit` 的参数里要一张图，`P_text.outputModalities = [text]` 不含 `image`——注册表拿两份数据自己比，只有有效模型满足得了（PF-006 §6.11）。
**只用 [S-16](contract.md#s-16-兼容判定-compatible) 答不了结果那一端**：它不知道转换件。
