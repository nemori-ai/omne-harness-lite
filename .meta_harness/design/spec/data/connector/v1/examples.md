# 规范实例：合法与非法

属于 `data.connector` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`connector.schema.json`](connector.schema.json) 的四个定义项在这里各有一组正反实例，
非法的一律注明**拒绝值**与**被哪一条挡住**。

**怎么读这些表**：每节开头的「校验对象」给出该节全部实例要拿去求值的 `$defs`。
每张表第一列是实例（JSON 内联代码）；第二列是 **Schema 这一关**的预期（`通过`／`拒绝`）；
第三列是按 [S-18](contract.md#s-18-表示层拒绝值) 定出的**拒绝值**（合法的写 `—`）；第四列是依据条款。
**这个格式也是机检格式**——第 1～5 节逐节按「校验对象」把第一列喂给 Draft 2020-12 校验器、拿第二列比对，不另抄一份清单。
**第三列不参与 Schema 机检**：Schema 只说通过与否，拒绝值的名字与优先级是契约的规则。**第 6～9 节不参与机检**。

**三条读法上的边界：**

- **`通过` 只说形状合规。**会话存不存在、进不进得去、附件可不可读、两份信封是不是同一件事——都不是本契约的判定，见[第 6 节](#6-形状合法判定不归本契约的)。
- **示例里的标识串只是占位**：`ses_`、`obj_`、`slack:` 这样的前缀不表示任何规则；外部标识的词法归外部那一侧。
- **除[第 5 节](#5-几处违例同时出现时取哪个拒绝值)外，每个非法实例只违反一条规则**，拒绝值因此不需要优先级就能定；第 5 节专门演示优先级。

下文反复出现的来源标识，在实例里一律原样写全：`{"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}`。

## 1. SourceIdentity

**校验对象**：`$defs/SourceIdentity`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}` | 通过 | — | [S-3](contract.md#s-3-来源标识) |
| `{"channel": "mailbox:ops@example.invalid", "externalAccount": "ops@example.invalid"}` | 通过 | — | [S-3](contract.md#s-3-来源标识)：两个分量的字面值相同也合法；本系统不解析它们 |
| `{"channel": "", "externalAccount": "U07BOT9QX"}` | 拒绝 | `channel_empty` | [S-3](contract.md#s-3-来源标识)：渠道恰是空串 |
| `{"channel": "  ", "externalAccount": "U07BOT9QX"}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-来源标识)：首尾是空白——**不裁剪成空串再报 `channel_empty`**（[S-19](contract.md#s-19-表示层拒绝不是判定也不修补)） |
| `{"channel": " slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-来源标识)：按 `data.identity-values/v1#S-31`，禁止首尾空白 |
| `{"channel": "slack:T024BE7LD/C0ALERTS\n", "externalAccount": "U07BOT9QX"}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-来源标识)：**这一条是 `$` 的回归用例**——pattern 以 `(?![\s\S])` 收尾，理由同 `data.identity-values/v1#S-31` |
| `{"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": ""}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-来源标识)：只有渠道为空有自己的拒绝值 |
| `{"channel": "slack:T024BE7LD/C0ALERTS"}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-来源标识)：两个分量都必填 |
| `{"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX", "tenant": {"organization": "org_7fd2", "account": "acc_31"}}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-来源标识)：成员闭合；**来源标识不承载归属** |

**相等判定的两个用例**（不是 Schema 校验，机检不覆盖）：

| A | B | 相等？ | 依据 |
|---|---|---|---|
| `{"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}` | `{"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "u07bot9qx"}` | **否** | [S-3](contract.md#s-3-来源标识)：逐码点，不折叠大小写 |
| `{"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}` | `{"channel": "slack:T024BE7LD/C0DEPLOY", "externalAccount": "U07BOT9QX"}` | **否** | [S-3](contract.md#s-3-来源标识)：同一个外部账号接两处渠道，是两个来源 |

## 2. DeliveryTarget

**校验对象**：`$defs/DeliveryTarget`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"kind": "session", "session": "ses_4c1e"}` | 通过 | — | [S-4](contract.md#s-4-投递目标) |
| `{"kind": "Session", "session": "ses_4c1e"}` | 拒绝 | `target_unknown` | [S-4](contract.md#s-4-投递目标)、[S-17](contract.md#s-17-判别式闭合)：大小写不同也是另一个值，**不被当成 `session`** |
| `{"kind": "thread", "session": "ses_4c1e"}` | 拒绝 | `target_unknown` | [S-17](contract.md#s-17-判别式闭合)：本版只有一支（按线程分会话见 G-3） |
| `{"session": "ses_4c1e"}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-投递目标)：`kind` 缺席——判别不出，不当作 `session` |
| `{"kind": "session"}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-投递目标)：`session` 必填 |
| `{"kind": "session", "session": ""}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-投递目标)：`SessionRef` 不合 `data.messages` v1 的形状 |
| `{"kind": "session", "session": "ses_4c1e", "agentDefinition": {"category": "agent_definition", "name": "ops-assistant"}}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-投递目标)：成员闭合；**新建会话的规则本版没有**（G-3），不为它预留成员 |
| `"ses_4c1e"` | 拒绝 | `malformed` | [S-4](contract.md#s-4-投递目标)：投递目标是判别式对象，不是一个裸的会话指认 |

## 3. ConnectorDefinition

**校验对象**：`$defs/ConnectorDefinition`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "target": {"kind": "session", "session": "ses_4c1e"}}` | 通过 | — | [S-1](contract.md#s-1-连接件正文)：**本版的那一个连接件定义**——一个告警频道的连接件，默认投进 `ses_4c1e` |
| `{"source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "target": {"kind": "session", "session": "ses_4c1e"}, "credential": "cred_5a0e"}` | 拒绝 | `malformed` | [S-2](contract.md#s-2-鉴权绑定不在正文里)：**正文不带凭据引用**；不被丢掉那个成员后收下（规范场景 [S-23](contract.md#s-23-正文里写了凭据)） |
| `{"source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "target": {"kind": "thread", "session": "ses_4c1e"}}` | 拒绝 | `target_unknown` | [S-4](contract.md#s-4-投递目标) |
| `{"source": {"channel": "", "externalAccount": "U07BOT9QX"}, "target": {"kind": "session", "session": "ses_4c1e"}}` | 拒绝 | `channel_empty` | [S-3](contract.md#s-3-来源标识) |
| `{"source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 拒绝 | `malformed` | [S-1](contract.md#s-1-连接件正文)：`target` 必填，**不补成任何默认目标** |
| `{"source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "target": {"kind": "session", "session": "ses_4c1e"}, "name": "ops-alerts"}` | 拒绝 | `malformed` | [S-1](contract.md#s-1-连接件正文)：正文里没有名字字段——身份只在 `AssetDefinition.capability` |
| `{"source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "target": {"kind": "session", "session": "ses_4c1e"}, "processAs": {"organization": "org_7fd2", "account": "acc_31"}}` | 拒绝 | `malformed` | [S-1](contract.md#s-1-连接件正文)、[S-13](contract.md#s-13-两项权限)：权限的值在配值上，不在正文里 |

## 4. InboundEnvelope

**校验对象**：`$defs/InboundEnvelope`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "text": "prod-api 的 5xx 比例超过 2%，请看一下", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 通过 | — | [S-5](contract.md#s-5-入站信封)：**第一条入站信封**——只有文本 |
| `{"externalId": "1727081707.002300", "receivedAt": "2026-09-23T09:15:07Z", "text": "/compact 把上午的讨论压一下", "attachments": [{"storage": "attachments", "key": "obj_5f2c", "mediaType": "image/png", "bytes": 20480, "name": "5xx.png"}], "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 通过 | — | [S-5](contract.md#s-5-入站信封)、[S-10](contract.md#s-10-信封里的文本不是命令)：**第二条入站信封**——文本带一张图；**以 `/` 开头照样只是内容**（规范场景 [S-22](contract.md#s-22-外面送来的斜杠开头的话)） |
| `{"externalId": "1727081760.002500", "receivedAt": "2026-09-23T09:16:00Z", "attachments": [{"storage": "attachments", "key": "obj_91aa", "mediaType": "application/pdf", "name": "incident.pdf"}], "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 通过 | — | [S-5](contract.md#s-5-入站信封)：只有附件也是一条外部消息 |
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 拒绝 | `envelope_empty` | [S-5](contract.md#s-5-入站信封) 第 1 条：既无文本也无附件 |
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "text": "", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-入站信封) 第 2 条：**空串不是缺席**——「没有文本」只有一种写法 |
| `{"externalId": "1727081760.002500", "receivedAt": "2026-09-23T09:16:00Z", "text": "见附件", "attachments": [], "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-入站信封) 第 2 条：空数组不是缺席 |
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "text": "prod-api 的 5xx 比例超过 2%，请看一下", "source": {"channel": "", "externalAccount": "U07BOT9QX"}}` | 拒绝 | `channel_empty` | [S-3](contract.md#s-3-来源标识) |
| `{"receivedAt": "2026-09-23T09:14:02.318Z", "text": "prod-api 的 5xx 比例超过 2%，请看一下", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-externalid-是同一件事的说法)：`externalId` 必填，**受理不替它现铸一个** |
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23", "text": "prod-api 的 5xx 比例超过 2%，请看一下", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 拒绝 | `malformed` | [S-7](contract.md#s-7-receivedat-不是次序也不是身份)：一个日期不是一个时刻 |
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "text": "prod-api 的 5xx 比例超过 2%，请看一下", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "tenant": {"organization": "org_7fd2", "account": "acc_31"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-信封不带归属)：信封不带租户身份 |
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "text": "prod-api 的 5xx 比例超过 2%，请看一下", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "target": {"kind": "session", "session": "ses_9b20"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-信封不带归属)：**外部内容选不了会话** |
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "text": "prod-api 的 5xx 比例超过 2%，请看一下", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "wake": false}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-送进来的就要被处理)：没有「收下但不处理」 |
| `{"externalId": "1727081707.002300", "receivedAt": "2026-09-23T09:15:07Z", "text": "/compact", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "command": true}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-信封里的文本不是命令)：信封里没有「这是命令」的成员 |
| `{"externalId": "1727081707.002300", "receivedAt": "2026-09-23T09:15:07Z", "attachments": [{"storage": "attachments", "key": "obj_5f2c", "mediaType": "Image/PNG"}], "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-表示层拒绝值)：嵌着的 `AttachmentRef` 不合 `data.content-blocks` v1（媒体类型只许小写）；**不替它改写，也不丢掉这一个留下其余** |

**「同一件事」的三个用例**（不是 Schema 校验，机检不覆盖；[S-6](contract.md#s-6-externalid-是同一件事的说法)）：

| 信封 A 的 `(source, externalId)` | 信封 B 的 `(source, externalId)` | 连接件断言同一件事？ | 依据 |
|---|---|---|---|
| 上面那个来源标识，`"1727081642.001900"`；`receivedAt` 为 `09:14:02.318Z` | 同一个来源标识，`"1727081642.001900"`；`receivedAt` 为 `09:14:09Z`（一次重投） | **是** | `receivedAt` 不参与（[S-7](contract.md#s-7-receivedat-不是次序也不是身份)） |
| 上面那个来源标识，`"1727081642.001900"` | 渠道换成 `slack:T024BE7LD/C0DEPLOY`，`"1727081642.001900"` | **否** | 相等范围是同一个来源标识：外部标识往往只在一个渠道内唯一 |
| 上面那个来源标识，`"msg-A1"` | 同一个来源标识，`"MSG-A1"` | **否** | 逐码点，不折叠大小写 |

## 5. 几处违例同时出现时取哪个拒绝值

**校验对象**：各行第四列注明。Schema 一列恒为「拒绝」；第三列按 [S-18](contract.md#s-18-表示层拒绝值) 的次序 `target_unknown > channel_empty > envelope_empty > malformed` 取。

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"source": {"channel": "", "externalAccount": "U07BOT9QX"}, "target": {"kind": "thread"}, "credential": "cred_5a0e"}` | 拒绝 | `target_unknown` | `$defs/ConnectorDefinition`：三处违例（目标认不出、渠道为空、多出成员），取最高的那个 |
| `{"kind": 7}` | 拒绝 | `target_unknown` | `$defs/DeliveryTarget`：`kind` 不是字符串也算「出现了但不是 `session`」，高于 `session` 缺席的 `malformed` |
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "source": {"channel": "", "externalAccount": "U07BOT9QX"}}` | 拒绝 | `channel_empty` | `$defs/InboundEnvelope`：说不出从哪来，高于没有内容 |
| `{"externalId": "1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "tenant": {"organization": "org_7fd2", "account": "acc_31"}}` | 拒绝 | `envelope_empty` | `$defs/InboundEnvelope`：没有内容，高于多出成员 |
| `{"externalId": " 1727081642.001900", "receivedAt": "2026-09-23T09:14:02.318Z", "text": "", "source": {"channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX"}, "wake": false}` | 拒绝 | `malformed` | `$defs/InboundEnvelope`：三处都是剩余项；**`text: ""` 不算「没有内容」**，所以不是 `envelope_empty` |

## 6. 形状合法、判定不归本契约的

**不参与机检。**下列每一份值**表示层都通过**；它们会不会被拒、被怎样处理，是别的 owner 的判定。
**判据是两者可区分**：把其中任何一行报成本契约的拒绝值，就把一次判定记成了表示层拒绝（[S-19](contract.md#s-19-表示层拒绝不是判定也不修补)）。

| 情形 | 本契约 | 谁判、判出什么 |
|---|---|---|
| 投递目标 `{"kind": "session", "session": "ses_4c1e"}`，而 `ses_4c1e` 不存在 | 通过 | 受理：[送不进任何会话的，在受理这一步具名拒绝](contract.md#s-4-投递目标)；**不是 `target_unknown`** |
| 同上，`ses_4c1e` 已被归档 | 通过 | 受理；归档那一刻队列怎么办，PF-014 §9.2 仍未决 |
| 同上，处理身份访问不了 `ses_4c1e`（它属于另一个租户） | 通过 | 受理：与「能不能访问这个会话」是同一个判断，**跨租户默认拒绝** |
| 处理身份判不出来（[G-4](contract.md#十已知缺口)） | 通过 | 受理：**不放行、不补身份**（[S-13](contract.md#s-13-两项权限)） |
| 第 4 节第一条信封，一分钟后同一个 `(source, externalId)` 又交来一次 | 两次都通过 | 受理：去重（[S-6](contract.md#s-6-externalid-是同一件事的说法)；PF-014 §6.3） |
| 第 4 节第二条信封，`text` 以 `/compact` 开头 | 通过 | 受理：原样当内容，**不识别、不触发**（[S-10](contract.md#s-10-信封里的文本不是命令)） |
| 附件引用指向的字节读不到 | 通过 | 存储的 owner（`data.content-blocks` v1 的 G-1）；**不得据此删掉这个引用** |
| 来源标识写的是 `U07BOT9QX`，而鉴权绑定实际认的是另一个账号 | 通过 | 本契约判不了——凭据不呈现；由谁核见 [G-5](contract.md#十已知缺口) |
| 两个租户身份的两份持有，来源标识完全相同 | 两份都通过 | 不冲突：来源标识不是身份、不指认归属（[S-3](contract.md#s-3-来源标识)） |

## 7. 放进资产记录之后

**不参与机检**：`data.asset-model` v1 的 connector 那一支本版仍是不透明壳，它的 Schema 收任何 `body`；
把 `body` 换成对 [`ConnectorDefinition`](#3-connectordefinition) 的 `$ref` 是[一项对齐](../verification.md#对齐义务)。对齐之后，第 3 节的那一个连接件定义在资产记录里的正文长这样：

```json
{
  "category": "connector",
  "body": {
    "source": { "channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX" },
    "target": { "kind": "session", "session": "ses_4c1e" }
  }
}
```

它的身份在记录的 `capability` 上，例如 `{"category": "connector", "name": "ops-alerts"}`；**要同时接同一服务的另一个账号，就另立一份 name 不同的记录**（[S-12](contract.md#s-12-鉴权绑定那一项)）。

## 8. 推出的属性声明

**不参与机检**：[S-11](contract.md#s-11-推出规则) 是一条规则，不是本 Schema 的定义项；产出的形状归 `data.asset-model` v1 的 `AttributeDeclaration`。
从第 3 节那一个连接件定义，**本版推得出的只有下面两项**：

```json
[
  {
    "item": "source",
    "kind": "setting",
    "category": "placement_identity",
    "domain": { "kind": "open", "schema": { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/connector/v1/connector.schema.json#/$defs/SourceIdentity" } },
    "default": { "channel": "slack:T024BE7LD/C0ALERTS", "externalAccount": "U07BOT9QX" }
  },
  {
    "item": "target",
    "kind": "setting",
    "category": "placement_identity",
    "domain": { "kind": "open", "schema": { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/connector/v1/connector.schema.json#/$defs/DeliveryTarget" } },
    "default": { "kind": "session", "session": "ses_4c1e" }
  }
]
```

**这不是这份连接件的全部属性项**：`credential` 的「未绑」取值（G-2）与两项权限（G-4）都没有表示，**整组声明本版判不出来**；
消费者读到这两项之后**停在缺口**，不得把它们当成全部，也不得替另外三项补值。`disabled` 由 `data.asset-model` 保留，不在推出的这一组里。

## 9. 一份信封落成的那一条消息

**不参与机检，是示意**：落成它的是受理那一方（[S-9](contract.md#s-9-信封落成一条用户消息)）；`id`、`createdAt`、块的 `id` 与 `visibility` 由那一方写。
第 4 节第二条信封里**文本那一部分**落成的块长这样——逐字相同，**没有 `origin`**：

```json
{ "id": "b_1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "/compact 把上午的讨论压一下" }
```

那张图落成哪一类块，本版没有答案（[G-6](contract.md#十已知缺口)）；**无论哪一类，里面的引用都是 `{"storage": "attachments", "key": "obj_5f2c", …}` 原样那一个**。
`externalId`、`receivedAt`、`source` 都不在这条消息上。
