# connector 实现设计

契约：[`data.connector` v1](../../../../spec/data/connector/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)。
信封与附件的块形状取自 [content-blocks](../content-blocks/README.md)，`SessionRef` 取自 [messages](../messages/README.md)。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。资产治理、求值、连接件接入端、受理各自 `import` | 契约没有操作与提交点 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**；`connectorBodyContract`（asset-model 端口的那一份）是普通值 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**。信封**不带归属**（S-8）：本模块的信封类型里没有任何租户、持有、会话或处理身份成员，归属由接入端在交接里显式携带——那是交接协议的事（契约 G-5），不在本模块 | S-8 |
| 存储 | **无** | — |

### 装配给 vs 协议给

[第六节](../../../../spec/data/connector/v1/contract.md#六装配给与协议给)五行里，本节点只在「表示层校验在每个接收边界重做」一行出力（`judgeEnvelope`、`judgeConnector` 两个纯入口）；
信封与归属的绑定、`externalId` 取自外部、附件解引用、选不了目标与身份，归接入端、交接协议与受理。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/connector/v1/contract.md#s-1-连接件正文)～[S-10](../../../../spec/data/connector/v1/contract.md#s-10-信封里的文本不是命令) 正文、来源、投递目标、信封、`externalId`、`receivedAt`、不带归属、落成用户消息、文本不是命令 | 类型 `ConnectorDefinition`、`SourceIdentity`、`DeliveryTarget`、`InboundEnvelope` | 信封类型里**没有**任何归属成员；「落成一条用户消息」的投影归受理 | V-1；SC-1（信封文本不走斜杠识别）由类型分开：`recognize`（[slash-command](../slash-command/README.md)）只收交付面输入的类型 |
| [S-11](../../../../spec/data/connector/v1/contract.md#s-11-推出规则)～[S-13](../../../../spec/data/connector/v1/contract.md#s-13-两项权限) 推出规则 | `connectorBodyContract` 的推属性 | 两项权限的取值域在契约 G-4 上，整组声明判不出来 ⇒ 交回 `{ underivable }`（[asset-model 的端口允许这一支](../asset-model/design.md#正文契约的判定经端口注入不-import-正文包)）；**不交回前四项当作全部**，也不替两项权限补取值域 | S-11 末两条；asset-model SC-6 |
| [S-16](../../../../spec/data/connector/v1/contract.md#s-16-规范表示)～[S-19](../../../../spec/data/connector/v1/contract.md#s-19-表示层拒绝不是判定也不修补) 四个拒绝值、不修补 | `judgeConnector(value)`、`judgeEnvelope(value)` | — | V-2 |

### 推出规则：返回「推不出」，不返回前四项

| | 返回定得下来的前四项 | **返回 `underivable`（本节点选）** |
|---|---|---|
| 与契约 | 违反 S-11「不得把前三项当成连接件的全部属性项」 | 与 S-11「推不出是判不出来，不是没有这几项」同一读法 |
| 消费者看到的 | 求值得出一组残缺的属性项，设置页只长出四项 | 求值对连接件如实报「推不出」（与 `agent_definition` 同一条路） |

**落选方的最强论证**：前四项（含治理类的触发会话默认运行模式）是确定的，交出去能让设置页先有东西可配。**它输给契约原话**：S-11 明写消费者停在缺口。**本方弱点**：本版连接件的属性项一项也用不了，连带触发会话的默认运行模式也配不了，直到 G-4 闭合。置信度：**高**（契约原话）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.asset-model` v1、`data.messages` v1、`data.content-blocks` v1、`data.offer-expiry` v1、`data.identity-values` v1 | [asset-model](../asset-model/README.md)、[messages](../messages/README.md)、[content-blocks](../content-blocks/README.md)、已实现的 offer-expiry 与 identity-values | 随包版本 | 静态 import |
| 被消费 | 资产治理、asset-evaluation、连接件接入端、受理 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个）；推不出 ⇒ `{ underivable }`。**都不抛异常**。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-4](../../../../spec/data/connector/verification.md#静态检查义务)全部约束消费者（受理、接入端、资产正文写路径）。本节点只以类型形状配合：信封类型不带归属成员（SC-2 的前提）、正文类型不带凭据与目标（SC-4 的前提）。规则**尚无**。

## 实施缺口与消费者影响

契约的已知缺口（第十节，G-4、G-5、G-7、G-10 未决）不重抄。本节点自己的：

- **CN-1 推出规则等 G-4**：本版交回 `underivable`；G-4 闭合、契约出新修订后改为交回六项。受阻消费者：asset-evaluation（连接件的属性项）、设置页。owner：PF-002 的 owner（契约 G-4），本节点随契约对齐。
- **CN-2 端口的组合根**：见 [asset-model AM-5](../asset-model/design.md#实施缺口与消费者影响)。
