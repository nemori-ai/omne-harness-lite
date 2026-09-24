# 规范实例：合法与非法

属于 `data.content-blocks` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`content-blocks.schema.json`](content-blocks.schema.json) 的定义项在这里各有一组正反实例，
非法的一律注明**拒绝值**与**被哪一条挡住**。

**怎么读这些表**：每节开头的「校验对象」给出该节全部实例要拿去求值的 `$defs`。
每张表第一列是实例（JSON 内联代码）；第二列是 **Schema 这一关**的预期（`通过`／`拒绝`）；
第三列是按 [S-26](contract.md#s-26-表示层拒绝值) 定出的**拒绝值**（合法的写 `—`）；第四列是依据条款。
**这个格式也是机检格式**——逐节按「校验对象」把第一列喂给 Draft 2020-12 校验器、拿第二列比对，不另抄一份清单。
**第三列不参与 Schema 机检**：Schema 只说通过与否，拒绝值的名字与优先级是契约的规则。

**三条读法上的边界：**

- **`通过` 只说形状合规。**[S-3](contract.md#s-3-blockid) 的消息内唯一、[S-10](contract.md#s-10-语音块与图块) 的两处媒体类型逐字相同、
  [S-5](contract.md#s-5-嵌套的块按合取取用)、[S-22](contract.md#s-22-落盘之后整块不变)、[S-23](contract.md#s-23-块不携带租户身份) 都不在 Schema 的能力范围内——见[第 14 节](#14-schema-挡不住但同样非法的)。
- **示例里的标识串只是占位**，[词法未定](contract.md#八已知缺口)（G-4）；不要从 `b_`、`call_`、`obj_` 这样的前缀推出任何规则。
- **除[第 12 节](#12-几处违例同时出现时取哪个拒绝值)外，每个非法实例只违反一条规则**，拒绝值因此不需要优先级就能定；第 12 节专门演示优先级。

下文反复出现的几个片段，在实例里一律原样写全：
标注两位都真 `{"toHuman": true, "toModel": true}`，只给模型 `{"toHuman": false, "toModel": true}`，两边都不给 `{"toHuman": false, "toModel": false}`。

## 1. Visibility

**校验对象**：`$defs/Visibility`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"toHuman": true, "toModel": true}` | 通过 | — | [S-4](contract.md#s-4-两个标注)：绝大多数块 |
| `{"toHuman": true, "toModel": false}` | 通过 | — | [S-4](contract.md#s-4-两个标注)：工具执行中的过程 |
| `{"toHuman": false, "toModel": true}` | 通过 | — | [S-4](contract.md#s-4-两个标注)：给模型的设定 |
| `{"toHuman": false, "toModel": false}` | 通过 | — | [S-4](contract.md#s-4-两个标注)：没长完的工具调用 |
| `{"toHuman": true}` | 拒绝 | `visibility_missing` | [S-4](contract.md#s-4-两个标注)：缺一位。**不补成 `false`，也不补成 `true`** |
| `{}` | 拒绝 | `visibility_missing` | [S-4](contract.md#s-4-两个标注)：两位都缺 |
| `{"toHuman": null, "toModel": true}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-两个标注)：位在，但不是布尔值——那不是「缺」 |
| `{"toHuman": "yes", "toModel": true}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-两个标注) |
| `{"toHuman": true, "toModel": true, "toAudit": true}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-两个标注)：恰两位，不多一位 |
| `true` | 拒绝 | `malformed` | [S-4](contract.md#s-4-两个标注)：两个标注不得压成一个布尔 |

## 2. MediaType

**校验对象**：`$defs/MediaType`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `"image/png"` | 通过 | — | [S-7](contract.md#s-7-媒体类型的规范形式) |
| `"audio/pcm;rate=24000"` | 通过 | — | [S-7](contract.md#s-7-媒体类型的规范形式)：参数原样携带；模态仍是 `audio`（[S-6](contract.md#s-6-模态由媒体类型判定)） |
| `"text/plain;charset=UTF-8"` | 通过 | — | [S-7](contract.md#s-7-媒体类型的规范形式)：参数名小写，**参数值大小写保留** |
| `"application/vnd.openxmlformats-officedocument.wordprocessingml.document"` | 通过 | — | [S-7](contract.md#s-7-媒体类型的规范形式)：type 不在四种之内——合法，只是没有模态 |
| `"Image/PNG"` | 拒绝 | `malformed` | [S-7](contract.md#s-7-媒体类型的规范形式)：只许小写。**接收方不替它改写**（[S-27](contract.md#s-27-表示层拒绝不是判定也不修补)） |
| `"image/png; charset=binary"` | 拒绝 | `malformed` | [S-7](contract.md#s-7-媒体类型的规范形式)：参数前后不带空白 |
| `"text/plain;charset=\"utf-8\""` | 拒绝 | `malformed` | [S-7](contract.md#s-7-媒体类型的规范形式)：不带引号串——同一个值不许有两种写法 |
| `"text/plain;Charset=utf-8"` | 拒绝 | `malformed` | [S-7](contract.md#s-7-媒体类型的规范形式)：参数名只许小写 |
| `"image/*"` | 拒绝 | `malformed` | [S-7](contract.md#s-7-媒体类型的规范形式)：是一个具体的媒体类型，不是通配 |
| `"png"` | 拒绝 | `malformed` | [S-7](contract.md#s-7-媒体类型的规范形式)：没有 subtype |
| `"image/png\n"` | 拒绝 | `malformed` | [S-7](contract.md#s-7-媒体类型的规范形式)：**这一条是 `$` 的回归用例**——pattern 以 `(?![\s\S])` 收尾，不用 `$`，理由同 `data.identity-values/v1#S-31` |
| `""` | 拒绝 | `malformed` | [S-7](contract.md#s-7-媒体类型的规范形式) |

## 3. AttachmentRef

**校验对象**：`$defs/AttachmentRef`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png", "bytes": 20480}` | 通过 | — | [S-21](contract.md#s-21-attachmentref) |
| `{"storage": "attachments", "key": "obj_91aa", "mediaType": "video/mp4", "name": "demo.mp4"}` | 通过 | — | [S-21](contract.md#s-21-attachmentref)：`name` 是给人看的，不是身份 |
| `{"storage": "attachments", "key": "tenants/org_7fd2c1/obj_77", "mediaType": "application/pdf"}` | 通过 | — | [S-21](contract.md#s-21-attachmentref)：**形状通过，不表示可以从键里读出组织**——地址不是身份（`data.identity-values/v1#S-34`），见[第 14 节](#14-schema-挡不住但同样非法的) |
| `{"storage": "attachments", "key": "obj_5f2c"}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-attachmentref)：`mediaType` 必填，**不按扩展名或字节补** |
| `{"key": "obj_5f2c", "mediaType": "image/png"}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-attachmentref)：`storage` 必填 |
| `{"storage": "attachments", "key": " obj_5f2c", "mediaType": "image/png"}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-attachmentref)：按 `data.identity-values/v1#S-31`，禁止首尾空白 |
| `{"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png", "bytes": -1}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-attachmentref)：`bytes` ≥ 0 |
| `{"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png", "name": ""}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-attachmentref)：`name` 给出就非空 |
| `{"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png", "url": "https://example.invalid/x.png"}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-attachmentref)：成员集合闭合；URL 不是本契约的引用形状 |

**相等判定的三个用例**（不是 Schema 校验，机检不覆盖）：

| A | B | 相等？ | 依据 |
|---|---|---|---|
| `{"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}` | `{"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png", "bytes": 20480, "name": "chart.png"}` | **是** | [S-21](contract.md#s-21-attachmentref)：只看 `(storage, key)` |
| `{"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}` | `{"storage": "attachments", "key": "OBJ_5F2C", "mediaType": "image/png"}` | **否** | [S-21](contract.md#s-21-attachmentref)：逐码点，不折叠大小写 |
| `{"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}` | `{"storage": "offload", "key": "obj_5f2c", "mediaType": "image/png"}` | **否** | [S-21](contract.md#s-21-attachmentref)：不同存储里同名的键不是同一份 |

## 4. CapabilityId

**校验对象**：`$defs/CapabilityId`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"category": "loop_extension", "name": "image-describer"}` | 通过 | — | [S-20](contract.md#s-20-派生表示的产出者与能力标识) |
| `{"category": "tool", "name": "read_file"}` | 通过 | — | [S-20](contract.md#s-20-派生表示的产出者与能力标识) |
| `{"category": "converter", "name": "image-describer"}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-派生表示的产出者与能力标识)、[S-25](contract.md#s-25-判别式与枚举闭合)：类别恰八个；转换件本版不是资产，没有自己的类别 |
| `{"category": "tool"}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-派生表示的产出者与能力标识)：身份是类别**加** name |
| `{"category": "tool", "name": ""}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-派生表示的产出者与能力标识) |
| `"tool:read_file"` | 拒绝 | `malformed` | [S-20](contract.md#s-20-派生表示的产出者与能力标识)：两个分量，不拼成一个串 |

## 5. 文本块

**校验对象**：`$defs/ContentBlock`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "帮我看看这个仓库的 README"}` | 通过 | — | [S-8](contract.md#s-8-文本块与来路标记) |
| `{"id": "b2", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": ""}` | 通过 | — | [S-8](contract.md#s-8-文本块与来路标记)：可以是空串 |
| `{"id": "b3", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "--dry-run src/", "origin": {"kind": "slash_command_args", "command": "review"}}` | 通过 | — | [S-8](contract.md#s-8-文本块与来路标记)：人敲命令时附带的参数，另成一块 |
| `{"id": "b4", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "# 代码评审\n逐个文件读……", "origin": {"kind": "skill_body", "command": "review", "skill": "code-review"}}` | 通过 | — | [S-8](contract.md#s-8-文本块与来路标记)：② 型展开的 skill 正文，逐字 |
| `{"id": "b4a", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "请按下面的清单逐项检查 src/ 的改动", "origin": {"kind": "slash_command_expansion", "command": "checklist"}}` | 通过 | — | [S-8](contract.md#s-8-文本块与来路标记)：① 型展开模板得到的文字 |
| `{"id": "b4b", "kind": "text", "visibility": {"toHuman": true, "toModel": false}, "text": "/review --dry-run src/", "origin": {"kind": "slash_command_record", "command": "review"}}` | 通过 | — | [S-8](contract.md#s-8-文本块与来路标记)：留痕块是带来路的文本块，`text` 是人敲的原文；标注由受理一方定 |
| `{"id": "b5", "kind": "text", "text": "hi"}` | 拒绝 | `visibility_missing` | [S-4](contract.md#s-4-两个标注) |
| `{"id": "b6", "kind": "text", "visibility": {"toHuman": true}, "text": "hi"}` | 拒绝 | `visibility_missing` | [S-4](contract.md#s-4-两个标注)：缺一即拒 |
| `{"id": "b7", "kind": "Text", "visibility": {"toHuman": true, "toModel": true}, "text": "hi"}` | 拒绝 | `kind_unknown` | [S-25](contract.md#s-25-判别式与枚举闭合)：区分大小写，不做「最接近」映射 |
| `{"id": "b8", "visibility": {"toHuman": true, "toModel": true}, "text": "hi"}` | 拒绝 | `malformed` | [S-1](contract.md#s-1-七类块)：`kind` 缺席不是「不在集合里的取值」，是缺必填成员 |
| `{"kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "hi"}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-blockid)：`id` 必填 |
| `{"id": "", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "hi"}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-blockid)：按 `data.identity-values/v1#S-31` 非空 |
| `{"id": "b9", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "hi", "modality": "text"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-模态由媒体类型判定)：块上不存模态 |
| `{"id": "b10", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "hi", "renderings": [{"producedBy": "system", "blocks": [{"id": "b10r", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "hi"}]}], "transcript": "hi"}` | 拒绝 | `malformed` | [S-2](contract.md#s-2-块底座)：文本块不是转换件的输入，不带派生属性 |
| `{"id": "b11", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "hi", "origin": {"kind": "user_typed"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-文本块与来路标记)、[S-25](contract.md#s-25-判别式与枚举闭合)：来路标记恰四种；**缺席才是「没有断言」** |
| `{"id": "b12", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "hi", "origin": {"kind": "skill_body", "skill": ""}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-文本块与来路标记)：名字给出就非空 |
| `{"id": "b13", "kind": "slash_command_record", "visibility": {"toHuman": true, "toModel": false}, "text": "/review"}` | 拒绝 | `kind_unknown` | [S-1](contract.md#s-1-七类块)、[S-8](contract.md#s-8-文本块与来路标记)：留痕**不是第八类块**，是文本块上的来路 |

## 6. 思考块

**校验对象**：`$defs/ContentBlock`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "b20", "kind": "thinking", "visibility": {"toHuman": false, "toModel": true}, "text": "先看目录结构，再读入口文件", "opaque": {"signature": "EqQBCgIYAh"}}` | 通过 | — | [S-9](contract.md#s-9-思考块与不透明数据) |
| `{"id": "b21", "kind": "thinking", "visibility": {"toHuman": false, "toModel": true}, "text": "", "opaque": "gAAAAABo9x"}` | 通过 | — | [S-9](contract.md#s-9-思考块与不透明数据)：上游只给了不透明数据 |
| `{"id": "b22", "kind": "thinking", "visibility": {"toHuman": true, "toModel": true}, "text": "……", "opaque": null}` | 通过 | — | [S-9](contract.md#s-9-思考块与不透明数据)：`null` 是一个值，**与缺席是两件事**，原样保留 |
| `{"id": "b23", "kind": "thinking", "visibility": {"toHuman": true, "toModel": true}, "text": "……"}` | 通过 | — | [S-9](contract.md#s-9-思考块与不透明数据)：没有不透明数据 |
| `{"id": "b24", "kind": "thinking", "visibility": {"toHuman": true, "toModel": true}, "opaque": "gAAAAABo9x"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-思考块与不透明数据)：`text` 必填（可以是空串，但不能缺） |
| `{"id": "b25", "kind": "thinking", "visibility": {"toHuman": true, "toModel": true}, "text": "……", "signature": "EqQBCgIYAh"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-思考块与不透明数据)：上游的东西只放进 `opaque`，不在块上另开成员 |
| `{"id": "b26", "kind": "reasoning", "visibility": {"toHuman": true, "toModel": true}, "text": "……"}` | 拒绝 | `kind_unknown` | [S-1](contract.md#s-1-七类块)：正式取值是 `thinking` |

## 7. 语音块与图块

**校验对象**：`$defs/ContentBlock`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "b30", "kind": "voice", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "audio/wav", "data": {"inline": "UklGRiQAAABXQVZF"}}` | 通过 | — | [S-10](contract.md#s-10-语音块与图块)：内联形状 |
| `{"id": "b31", "kind": "voice", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "audio/pcm;rate=24000", "data": {"storage": "attachments", "key": "obj_a1", "mediaType": "audio/pcm;rate=24000"}}` | 通过 | — | [S-10](contract.md#s-10-语音块与图块)：引用形状，两处逐字相同 |
| `{"id": "b32", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"inline": "iVBORw0KGgo="}}` | 通过 | — | [S-10](contract.md#s-10-语音块与图块)：内联形状，带填充 |
| `{"id": "b33", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png", "bytes": 20480}}` | 通过 | — | [S-10](contract.md#s-10-语音块与图块)：引用形状 |
| `{"id": "b34", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "video/mp4", "data": {"storage": "attachments", "key": "obj_91aa", "mediaType": "video/mp4"}}` | 拒绝 | `modality_mismatch` | [S-10](contract.md#s-10-语音块与图块)：图块装视频。**不改归文件块**——视频该装进文件块，那是产生者的事 |
| `{"id": "b35", "kind": "voice", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"inline": "iVBORw0KGgo="}}` | 拒绝 | `modality_mismatch` | [S-10](contract.md#s-10-语音块与图块) |
| `{"id": "b37", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "Image/PNG", "data": {"inline": "iVBORw0KGgo="}}` | 拒绝 | `malformed` | [S-7](contract.md#s-7-媒体类型的规范形式)、[S-10](contract.md#s-10-语音块与图块)：非规范写法不判模态，**不是** `modality_mismatch` |
| `{"id": "b38", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"inline": "iVBORw0KGgo=", "storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-语音块与图块)：恰为两种形状之一，不能两样都给 |
| `{"id": "b39", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"inline": ""}}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-语音块与图块)：内联字节非空 |
| `{"id": "b40", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"inline": "iVBORw0K\nGgo="}}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-语音块与图块)：base64 不含换行 |
| `{"id": "b41", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": "iVBORw0KGgo="}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-语音块与图块)：内联要写成 `{"inline": …}`，形状才可判别 |
| `{"id": "b42", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "data": {"inline": "iVBORw0KGgo="}}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-语音块与图块)：`mediaType` 必填，**不从字节嗅探** |
| `{"id": "b43", "kind": "video", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "video/mp4", "data": {"storage": "attachments", "key": "obj_91aa", "mediaType": "video/mp4"}}` | 拒绝 | `kind_unknown` | [S-1](contract.md#s-1-七类块)：**视频不另立块**，装在文件块里 |

## 8. 文件块

**校验对象**：`$defs/ContentBlock`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "b50", "kind": "file", "visibility": {"toHuman": true, "toModel": true}, "attachment": {"storage": "attachments", "key": "obj_91aa", "mediaType": "video/mp4", "name": "demo.mp4"}}` | 通过 | — | [S-11](contract.md#s-11-文件块)：模态是 `video`（[S-6](contract.md#s-6-模态由媒体类型判定)） |
| `{"id": "b51", "kind": "file", "visibility": {"toHuman": true, "toModel": true}, "attachment": {"storage": "attachments", "key": "obj_77", "mediaType": "application/pdf", "name": "spec.pdf"}}` | 通过 | — | [S-11](contract.md#s-11-文件块)：没有模态，只是一个引用 |
| `{"id": "b52", "kind": "file", "visibility": {"toHuman": true, "toModel": true}}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-文件块)：`attachment` 必填 |
| `{"id": "b53", "kind": "file", "visibility": {"toHuman": true, "toModel": true}, "attachment": {"storage": "attachments", "key": "obj_77", "mediaType": "application/pdf"}, "content": "JVBERi0xLjcK"}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-文件块)：**引用，不是内容** |
| `{"id": "b54", "kind": "file", "visibility": {"toHuman": true, "toModel": true}, "attachment": {"storage": "attachments", "key": "obj_91aa", "mediaType": "video/mp4"}, "mediaType": "video/mp4"}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-文件块)：文件块的媒体类型只在 `attachment` 上，不在块上再存一份 |

## 9. 工具调用块

**校验对象**：`$defs/ContentBlock`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "b60", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_01", "tool": "read_file", "arguments": {"path": "README.md"}}` | 通过 | — | [S-12](contract.md#s-12-完整的工具调用) |
| `{"id": "b61", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": false}, "complete": true, "callId": "call_09", "tool": "ping", "arguments": null}` | 通过 | — | [S-12](contract.md#s-12-完整的工具调用)：`arguments` 是任意 JSON 值；完整调用四种标注组合都合法 |
| `{"id": "b62", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": false}, "complete": false, "callId": "call_02", "tool": "write_file", "rawArguments": "{\"path\": \"out.t"}` | 通过 | — | [S-13](contract.md#s-13-半截的工具调用) |
| `{"id": "b63", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": false}, "complete": false, "rawArguments": ""}` | 通过 | — | [S-13](contract.md#s-13-半截的工具调用)：`callId`、`tool` 还没到就缺席，原始串可以是空的 |
| `{"id": "b64", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": false}, "complete": false, "rawArguments": "{\"pa"}` | 拒绝 | `incomplete_call_visible` | [S-13](contract.md#s-13-半截的工具调用)：**不被改成 `false` 后接受** |
| `{"id": "b65", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": false, "rawArguments": "{\"pa"}` | 拒绝 | `incomplete_call_visible` | [S-13](contract.md#s-13-半截的工具调用) |
| `{"id": "b66", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_01", "tool": "read_file", "rawArguments": "{\"path\": \"README.md\"}"}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-完整的工具调用)：带原始串却没标 `unparseable`——两者同现才是「解析不了」那一种 |
| `{"id": "b66a", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_18", "tool": "read_file", "rawArguments": "{\"path\": \"a.md\"", "unparseable": true}` | 通过 | — | [S-12](contract.md#s-12-完整的工具调用)：收齐了却解析不了——登记、不执行、宿主接一条 `failed` 结果 |
| `{"id": "b66b", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_18", "tool": "read_file", "rawArguments": "{\"path\": \"a.md\"", "unparseable": true, "arguments": {"path": "a.md"}}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-完整的工具调用)：解析不了就没有 `arguments`，**不替它猜一个** |
| `{"id": "b66c", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_18", "tool": "read_file", "unparseable": true}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-完整的工具调用)：`unparseable` 与 `rawArguments` 同现，缺原文不行 |
| `{"id": "b66d", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_18", "tool": "read_file", "rawArguments": "{", "unparseable": false}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-完整的工具调用)：`unparseable` 只有 `true` 这一个取值 |
| `{"id": "b67", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "tool": "read_file", "arguments": {}}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-完整的工具调用)：`complete` 必填，**缺席不当 `true`** |
| `{"id": "b68", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "tool": "read_file", "arguments": {}}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-完整的工具调用)：`callId` 必填 |
| `{"id": "b69", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": false}, "complete": false, "rawArguments": "{\"pa", "arguments": {"pa": null}}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-半截的工具调用)：半截的参数**不解析**，一个解析结果出现在这里就是违反 |
| `{"id": "b70", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": "true", "callId": "call_01", "tool": "read_file", "arguments": {}}` | 拒绝 | `malformed` | [S-25](contract.md#s-25-判别式与枚举闭合)：`complete` 是布尔判别，不是字符串 |

## 10. 工具结果块

**校验对象**：`$defs/ContentBlock`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "b80", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": [{"id": "b80a", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "# README ……"}]}` | 通过 | — | [S-15](contract.md#s-15-工具结果块) |
| `{"id": "b82", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_04", "outcome": "backgrounded", "reason": {"code": "backgrounded_by_preemption", "text": "用户插队，这次执行转到后台继续"}, "blocks": [{"id": "b82a", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "已转后台，跑完会通知"}]}` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格) |
| `{"id": "b83", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_05", "outcome": "interrupted", "reason": {"code": "human_declined", "text": "插队时它正停在问人那一步，已中断"}, "blocks": []}` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格)：人拒绝回复落在**被中断**，不是等不到应答 |
| `{"id": "b84", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_06", "outcome": "failed", "reason": {"code": "abnormal_interruption", "text": "工具执行异常中断"}, "blocks": []}` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格)：异常中断落在**失败** |
| `{"id": "b85", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_07", "outcome": "failed", "blocks": [{"id": "b85a", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "ENOENT: README.md 不存在"}]}` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格)：普通失败不带 `reason` |
| `{"id": "b86", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_08", "outcome": "unavailable", "blocks": [{"id": "b86a", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "这个工具现在用不了"}]}` | 通过 | — | [S-17](contract.md#s-17-六种收场) |
| `{"id": "b87", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_10", "outcome": "no_answer", "blocks": []}` | 通过 | — | [S-17](contract.md#s-17-六种收场)：`blocks` 可以是空数组 |
| `{"id": "b88", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_11", "outcome": "completed", "blocks": [{"id": "b88a", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "前 200 行……（共 18203 行，已卸载）"}], "offloaded": {"storage": "attachments", "key": "obj_off_1", "mediaType": "text/plain", "bytes": 912345}}` | 通过 | — | [S-15](contract.md#s-15-工具结果块)：`blocks` 是那条带摘要的占位 |
| `{"id": "b89", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_12", "outcome": "completed", "blocks": [{"id": "b89a", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_13", "outcome": "completed", "blocks": []}]}` | 通过 | — | [S-15](contract.md#s-15-工具结果块)：结果里可以再嵌结果 |
| `{"id": "b90", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": [{"id": "b90a", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_14", "tool": "rm", "arguments": {}}]}` | 拒绝 | `call_in_result` | [S-16](contract.md#s-16-结果里不发起调用) |
| `{"id": "b91", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": [{"id": "b91a", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_13", "outcome": "completed", "blocks": [{"id": "b91b", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": false}, "complete": false, "rawArguments": ""}]}]}` | 拒绝 | `call_in_result` | [S-16](contract.md#s-16-结果里不发起调用)：**深一层也拒**，半截的调用同样算 |
| `{"id": "b92", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "blocks": []}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-工具结果块)：`outcome` 缺席，**从不当作 `completed`** |
| `{"id": "b93", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "cancelled", "blocks": []}` | 拒绝 | `malformed` | [S-17](contract.md#s-17-六种收场)：收场恰六种，**不降级为 `failed`** |
| `{"id": "b94", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_04", "outcome": "backgrounded", "blocks": []}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：占位必带原因 |
| `{"id": "b95", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_05", "outcome": "interrupted", "blocks": []}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：占位必带原因 |
| `{"id": "b96", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_06", "outcome": "failed", "reason": {"code": "user_interrupted", "text": "用户叫停"}, "blocks": []}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：用户叫停落在被中断，**不改格** |
| `{"id": "b97", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_05", "outcome": "interrupted", "reason": {"code": "backgrounded_auto", "text": "超时转后台"}, "blocks": []}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：配错格 |
| `{"id": "b98", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "reason": {"code": "user_interrupted", "text": "……"}, "blocks": []}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：完成不带原因 |
| `{"id": "b99", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_05", "outcome": "interrupted", "reason": {"code": "run_cancelled", "text": "运行被取消"}, "blocks": []}` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格)：运行被取消而它还在前台——**不借** `user_interrupted` |
| `{"id": "b99a", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_19", "outcome": "backgrounded", "reason": {"code": "backgrounded_at_start", "text": "发起时就在后台，跑完会通知"}, "blocks": []}` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格) |
| `{"id": "b99b", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_20", "outcome": "interrupted", "reason": {"code": "terminated_by_agent", "text": "已被 agent 停掉"}, "blocks": []}` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格)：**这是后台那段执行收场提醒里的结果块，不是占位**——`call_20` 的占位早在转后台时写下（原因 `backgrounded_*`）；`terminated_by_agent` 只落在这里 |
| `{"id": "b99e", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_21", "outcome": "interrupted", "reason": {"code": "foreground_timeout", "text": "前台跑到上限，这个工具不许转后台"}, "blocks": []}` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格)：前台超时——**不借** `user_interrupted` |
| `{"id": "b99f", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_21", "outcome": "backgrounded", "reason": {"code": "foreground_timeout", "text": "……"}, "blocks": []}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：`foreground_timeout` 只配被中断；允许后台的到点转后台，原因是 `backgrounded_auto` |
| `{"id": "b99c", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_05", "outcome": "backgrounded", "reason": {"code": "run_cancelled", "text": "运行被取消"}, "blocks": []}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：`run_cancelled` 只配被中断 |
| `{"id": "b99d", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_19", "outcome": "interrupted", "reason": {"code": "backgrounded_at_start", "text": "……"}, "blocks": []}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：配错格 |
| `{"id": "b9a", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_05", "outcome": "interrupted", "reason": {"code": "user_interrupted", "text": ""}, "blocks": []}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-工具结果块)：原因要说清，`text` 非空 |
| `{"id": "b9b", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed"}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-工具结果块)：`blocks` 必填（可以是空数组，不能缺） |

## 11. 派生表示与 transcript

**校验对象**：`$defs/ContentBlock`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "b100", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b100r", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "一张柱状图，横轴为月份"}]}], "transcript": "一张柱状图，横轴为月份"}` | 通过 | — | [S-19](contract.md#s-19-派生表示与-transcript)、[S-5](contract.md#s-5-嵌套的块按合取取用)：派生块只给模型，人那一侧看原图 |
| `{"id": "b101", "kind": "file", "visibility": {"toHuman": true, "toModel": true}, "attachment": {"storage": "attachments", "key": "obj_91aa", "mediaType": "video/mp4"}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b101r1", "kind": "image", "visibility": {"toHuman": false, "toModel": true}, "mediaType": "image/jpeg", "data": {"storage": "attachments", "key": "obj_kf1", "mediaType": "image/jpeg"}}, {"id": "b101r2", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "00:00 至 00:12 演示登录流程"}]}], "transcript": "一段 12 秒的登录演示"}` | 通过 | — | [S-19](contract.md#s-19-派生表示与-transcript)：一份派生表示可以有几块、几种模态 |
| `{"id": "b102", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_15", "outcome": "completed", "blocks": [{"id": "b102a", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_c3", "mediaType": "image/png"}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b102r", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "一张折线图"}]}], "transcript": "一张折线图"}]}` | 通过 | — | [S-2](contract.md#s-2-块底座)：派生属性挂在结果里那张图上，不挂在工具结果块上 |
| `{"id": "b103", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b103r", "kind": "file", "visibility": {"toHuman": false, "toModel": true}, "attachment": {"storage": "attachments", "key": "obj_d1", "mediaType": "application/pdf"}}]}], "transcript": "一张图"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-派生表示与-transcript)：派生表示不能是文件块 |
| `{"id": "b104", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b104r", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": true}, "complete": true, "callId": "call_16", "tool": "zoom", "arguments": {}}]}], "transcript": "一张图"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-派生表示与-transcript)：派生块只能是文本、图、语音。**不是 `call_in_result`**——派生表示不是结果 |
| `{"id": "b105", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b105r", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "一张图"}]}]}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-派生表示与-transcript)：有派生表示却没有 transcript |
| `{"id": "b106", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}, "transcript": "一张图"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-派生表示与-transcript)：有 transcript 却没有派生表示——两样同有同无 |
| `{"id": "b107", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}, "renderings": [], "transcript": "一张图"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-派生表示与-transcript)：`renderings` 给出就非空 |
| `{"id": "b108", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b108r", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "一张图"}]}], "transcript": ""}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-派生表示与-transcript)：transcript 非空 |
| `{"id": "b109", "kind": "voice", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "audio/wav", "data": {"inline": "UklGRiQAAABXQVZF"}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b109r", "kind": "image", "visibility": {"toHuman": false, "toModel": true}, "mediaType": "image/png", "data": {"inline": "iVBORw0KGgo="}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b109s", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "声谱图"}]}], "transcript": "声谱图"}]}], "transcript": "一段语音"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-派生表示与-transcript)：派生块自己不再带派生属性 |
| `{"id": "b110", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}, "renderings": [{"producedBy": "image-describer", "blocks": [{"id": "b110r", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "一张图"}]}], "transcript": "一张图"}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-派生表示的产出者与能力标识)：产出者本版恒为字面量 `system`，不是一个裸名字 |
| `{"id": "b111", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png"}, "renderings": [{"producedBy": {"category": "loop_extension", "name": "image-describer"}, "blocks": [{"id": "b111r", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "一张图"}]}], "transcript": "一张图"}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-派生表示的产出者与能力标识)：**本版转换件不是资产**，没有能力标识那一支 |

## 12. 几处违例同时出现时取哪个拒绝值

**校验对象**：`$defs/ContentBlock`。本节每个实例**故意同时违反两条**，演示 [S-26](contract.md#s-26-表示层拒绝值) 的优先级。

| 实例 | Schema | 拒绝值 | 同时违反了什么 |
|---|---|---|---|
| `{"id": "p1", "kind": "video", "text": "hi"}` | 拒绝 | `kind_unknown` | `kind` 不在集合里 ＋ 缺 `visibility` ⇒ 前者优先 |
| `{"id": "p2", "kind": "tool_call", "complete": false, "rawArguments": ""}` | 拒绝 | `visibility_missing` | 缺 `visibility`——半截调用的标注判不了真假，所以**不是** `incomplete_call_visible` |
| `{"id": "p3", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": [{"id": "p3a", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": false, "rawArguments": "{"}]}` | 拒绝 | `incomplete_call_visible` | 结果里有调用（`call_in_result`）＋ 那个半截调用标着可见 ⇒ 前者（`incomplete_call_visible`）优先 |
| `{"id": "p4", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "blocks": [{"id": "p4a", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_17", "tool": "rm", "arguments": {}}]}` | 拒绝 | `call_in_result` | 结果里有调用 ＋ 缺 `outcome`（`malformed`）⇒ 前者优先 |
| `{"id": "p5", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_91aa", "mediaType": "video/mp4"}}` | 拒绝 | `modality_mismatch` | 引用里的媒体类型是视频（`modality_mismatch`）＋ 两处媒体类型不逐字相同（`malformed`）⇒ 前者优先 |
| `{"id": "p6", "kind": "voice", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "video/webm", "data": {"inline": "GkXfow=="}, "caption": "录音"}` | 拒绝 | `modality_mismatch` | 媒体类型不是语音 ＋ 多出成员 `caption`（`malformed`）⇒ 前者优先 |

## 13. 三个闭合枚举与内联字节

**校验对象**：各行第一列标注的 `$defs`（本节格式比别节多一列在最前，其余三列含义不变）。

| 校验对象 | 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|---|
| `$defs/ExecutionOutcome` | `"completed"` | 通过 | — | [S-17](contract.md#s-17-六种收场) |
| `$defs/ExecutionOutcome` | `"no_answer"` | 通过 | — | [S-17](contract.md#s-17-六种收场) |
| `$defs/ExecutionOutcome` | `"Completed"` | 拒绝 | `malformed` | [S-25](contract.md#s-25-判别式与枚举闭合) |
| `$defs/ExecutionOutcome` | `"timeout"` | 拒绝 | `malformed` | [S-17](contract.md#s-17-六种收场)：超时不是第七种收场；等待到头是 `no_answer` |
| `$defs/ExecutionOutcome` | `null` | 拒绝 | `malformed` | [S-15](contract.md#s-15-工具结果块)：没有「未知收场」 |
| `$defs/PlaceholderReason` | `"backgrounded_by_user"` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格) |
| `$defs/PlaceholderReason` | `"abnormal_interruption"` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格) |
| `$defs/PlaceholderReason` | `"backgrounded"` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：原因不是收场，转后台细分为三个原因 |
| `$defs/PlaceholderReason` | `"run_cancelled"` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格)：补的三行之一 |
| `$defs/PlaceholderReason` | `"terminated_by_agent"` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：**不是占位原因**，是后台那段执行收场的提醒上写的原因；它只在工具结果块的 `reason.code` 里合法（第 10 节 `b99b`），不在 `PlaceholderReason` 里 |
| `$defs/PlaceholderReason` | `"foreground_timeout"` | 通过 | — | [S-18](contract.md#s-18-占位原因与它落在哪一格)：前台超时（原 G-7 闭合） |
| `$defs/PlaceholderReason` | `"interrupted_by_timeout"` | 拒绝 | `malformed` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：前台超时的取值名是 `foreground_timeout`，**不收近义的另一个名字** |
| `$defs/Modality` | `"audio"` | 通过 | — | [S-6](contract.md#s-6-模态由媒体类型判定)：对应词条的「语音 Voice」 |
| `$defs/Modality` | `"voice"` | 拒绝 | `malformed` | [S-6](contract.md#s-6-模态由媒体类型判定)：`voice` 是块的类型，模态的 token 是 `audio` |
| `$defs/Modality` | `"file"` | 拒绝 | `malformed` | [S-6](contract.md#s-6-模态由媒体类型判定)：文件不是一种模态 |
| `$defs/Modality` | `"none"` | 拒绝 | `malformed` | [S-6](contract.md#s-6-模态由媒体类型判定)：「无模态」不是第五个取值 |
| `$defs/InlineBytes` | `"iVBORw0KGgo="` | 通过 | — | [S-10](contract.md#s-10-语音块与图块)：共用的编码规则 |
| `$defs/InlineBytes` | `"iVBORw0KGgo"` | 拒绝 | `malformed` | [S-10](contract.md#s-10-语音块与图块)：带填充，长度是四的倍数 |
| `$defs/InlineBytes` | `"iVBORw0K Ggo="` | 拒绝 | `malformed` | [S-10](contract.md#s-10-语音块与图块)：不含空白 |

## 14. Schema 挡不住，但同样非法的

**本节不参与机检**——没有「校验对象」。它们形状上一概通过 Schema，只能由接收边界的校验、实现的静态检查或规范场景拒绝。
列在这里，是为了让[「校验通过不表示条款成立」](contract.md#s-27-表示层拒绝不是判定也不修补)有具体例子。

| 做了什么 | 违反 | 在哪里挡 |
|---|---|---|
| 一条消息里两块 `id` 都是 `"b1"`，其中一块在工具结果的 `blocks` 里 | [S-3](contract.md#s-3-blockid)——`malformed` | 看得见整条消息的接收边界 |
| 图块写 `"mediaType": "image/png"`，引用里写 `"mediaType": "image/jpeg"` | [S-10](contract.md#s-10-语音块与图块)——`malformed` | 接收边界 |
| 接收边界把缺失的 `visibility` 补成 `{"toHuman": false, "toModel": false}` 后落盘 | [S-4](contract.md#s-4-两个标注)、[S-27](contract.md#s-27-表示层拒绝不是判定也不修补) | 接收边界的实现 |
| 接收边界把 `"Image/PNG"` 改写成 `"image/png"` 后接受 | [S-7](contract.md#s-7-媒体类型的规范形式)、[S-27](contract.md#s-27-表示层拒绝不是判定也不修补) | 接收边界的实现 |
| 压缩时把一个已落盘块的 `toModel` 从 `true` 改成 `false` | [S-22](contract.md#s-22-落盘之后整块不变) | 日志写路径 |
| 转换件事后给一个已落盘的图块补上 transcript | [S-22](contract.md#s-22-落盘之后整块不变) | 日志写路径 |
| 工具结果块标着给模型，组装时把它里面一块标着 `"toModel": false` 的文本也给了模型 | [S-5](contract.md#s-5-嵌套的块按合取取用) | PF-010 的组装 |
| 某一层把 `opaque` 里的整数 `9007199254740993` 读成双精度再写回 | [S-9](contract.md#s-9-思考块与不透明数据) | 每一跳的实现 |
| 日志层为了「展示签名」把 `opaque` 解出来改写 | [S-9](contract.md#s-9-思考块与不透明数据) | 每一层的实现 |
| 从工具结果的文字里读到 `Error:` 就当它是 `failed` | [S-15](contract.md#s-15-工具结果块) | 读者的实现 |
| 用 `user_interrupted` 表示「这一次运行被取消而它还在前台」 | [S-18](contract.md#s-18-占位原因与它落在哪一格)：该用 `run_cancelled` | 写入方 |
| 前台那次调用的占位（`ToolMessage` 里的结果块）写 `outcome: "interrupted"`、`reason.code: "terminated_by_agent"` | [S-18](contract.md#s-18-占位原因与它落在哪一格)：这个原因只落后台执行收场提醒的结果块——agent 只能掐已转后台的执行，占位早已写下；**块自己看不出是哪一段**，Schema 放行 | 写入方（工具执行运行时；哪条消息装哪一段归 `data.messages`） |
| 图块的派生表示里放了一张图（原块与派生块都是 `image` 模态） | [S-19](contract.md#s-19-派生表示与-transcript)——`malformed` | 接收边界 |
| 为了「再试一次」去解析一个标了 `unparseable` 的调用的 `rawArguments`，或执行它 | [S-12](contract.md#s-12-完整的工具调用) | 流装配、宿主与执行运行时的实现 |
| 受理连接件送来的信封时，把一个 `image/png` 的附件引用落成文件块 | [S-34](contract.md#s-34-只给了引用的附件落成哪一类块) | 落块那一方的规范场景 |
| 为了「猜」调用意图去解析半截调用的 `rawArguments` | [S-13](contract.md#s-13-半截的工具调用) | 流装配与组装的实现 |
| 一份会话日志里两个完整的工具调用块 `callId` 相同 | [S-14](contract.md#s-14-callid) | 登记调用的一方 |
| 按 `AttachmentRef.key` 的前缀 `tenants/org_7fd2c1/` 判断它归哪个组织 | [S-21](contract.md#s-21-attachmentref)、`data.identity-values/v1#S-34` | 静态检查 |
| 块被复制进另一个租户的会话后，那边凭块里的引用读到了字节 | [S-23](contract.md#s-23-块不携带租户身份) | 存储 owner 的现判（[G-1](contract.md#八已知缺口)） |

## 15. 起草者逐条自核

**这是手核，不是机检。**本节记录起草者把上面每一行拿契约条款逐条对过的结论；
**第二列（Schema 一关）的机检结果不写在这里**，在[验证入口](../verification.md#本地自检)——那是版本外、可更新的证据；本节只陈述每节有几行、各核了什么。

| 节 | 通过 | 拒绝 | 核了什么 |
|---|---|---|---|
| 1 Visibility | 4 | 6 | 四种组合都通过；缺位 → `visibility_missing`，位在但非布尔、多一位、压成布尔 → `malformed` |
| 2 MediaType | 4 | 8 | 通过的四个都小写、参数紧挨、值为 token；拒绝的各违反一处：大写、空白、引号、参数名大写、通配、缺 subtype、尾随换行、空串 |
| 3 AttachmentRef | 3 | 6 | 必填三项、`bytes` ≥ 0、`name` 非空、闭合成员、`storage`／`key` 的首尾空白；另三条相等用例只看 `(storage, key)` |
| 4 CapabilityId | 2 | 4 | 八类闭合；两个分量都必填 |
| 5 文本块 | 6 | 11 | 每个拒绝实例只动一处；`b8` 缺 `kind` 按 [S-26](contract.md#s-26-表示层拒绝值) 定为 `malformed` 而非 `kind_unknown` |
| 6 思考块 | 4 | 3 | `opaque` 缺席与 `null` 都通过且是两种状态 |
| 7 语音块与图块 | 4 | 9 | base64 实例逐个数过：`UklGRiQAAABXQVZF` 16 字符、`iVBORw0KGgo=` 12 字符以 `=` 收尾，都是完整的四字组；`b34`／`b35` 的块与引用媒体类型逐字相同，**只**违反模态；`b37` 不判模态 |
| 8 文件块 | 2 | 3 | 文件块无自己的 `mediaType` |
| 9 工具调用块 | 5 | 10 | 半截调用的两个拒绝实例只动标注；`b67` 缺 `complete` 两个形状都不匹配；解析不了的那一种（`b66a`）与三个只动一处的反例 |
| 10 工具结果块 | 13 | 14 | 每个通过实例的 `reason` 与收场对上 [S-18](contract.md#s-18-占位原因与它落在哪一格) 的落格表；拒绝实例每行只违反一格 |
| 11 派生表示 | 3 | 9 | 通过实例的派生块都是文本或图、都不再带派生属性，且 transcript 与 renderings 同在 |
| 12 优先级 | 0 | 6 | 每行写明同时违反的两条，拒绝值按 `kind_unknown > visibility_missing > incomplete_call_visible > call_in_result > modality_mismatch > malformed` 取 |
| 13 枚举与内联字节 | 8 | 11 | 取值与契约的闭合集合逐字对过；`terminated_by_agent` 不在 `PlaceholderReason` 里；`InlineBytes` 三行 |

**合计参与机检的 158 行：通过 58、拒绝 100**（2026-09-24 按实际行数重数；`terminated_by_agent` 移出 `PlaceholderReason` 让第 13 节一行由通过翻为拒绝）。第 3 节的相等用例表与第 14 节不在其内。
第 7 节的编号从 `b35` 跳到 `b37`：`b36` 这个位置的实例（图块写 `image/png`、引用写 `video/mp4`）同时违反两条，
不合「每行只违反一条」，放在第 12 节作 `p5`。
