# @omne-harness/assets-protocol 行为规格

本文件拥有本包在公开类型以外的约定。公开形状归 `src/` 的公开定义。

## 范围与依据

本包是公开协议 `assets/v1` 的协议契约，纯数据，只依赖共同契约 `@omne-harness/public-contract`。依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 第 7 节「协议与拥有者」（`assets/v1` 归资产与规则，是设置的四个操作）、「操作怎样分进去」「目标租户放在消息体里」，与第 9 节「设置的操作与答复」「设置读写面的契约」。操作的业务含义归资产与规则；消息的外层、固定结果与规则叶子的读写归共同契约。

## 结果与不变量

<a id="ap-1"></a>**AP-1 操作表。** 协议名 `assets`，主版本 1，四个操作，没有观察：

| 操作 | 身份要求 | 效果 | 体上限 | 读写面的方法 |
| --- | --- | --- | --- | --- |
| `list-settings` | 登录 | 只读 | 小 | `list` |
| `describe-setting` | 登录 | 只读 | 小 | `describe` |
| `set-setting` | 登录 | 提交 | 小 | `set` |
| `clear-setting` | 登录 | 提交 | 小 | `clear` |

四个操作都不算业务访问，不带登录证明。

<a id="ap-2"></a>**AP-2 目标租户在消息体里。** 每个操作的消息体带 `tenant`。管道只识别登录；接入插件凭登录与这个租户向身份换主体。

<a id="ap-3"></a>**AP-3 消息体。** 字段取自读写面的输入：

| 操作 | 消息体 |
| --- | --- |
| `list-settings` | `tenant`；`asset`（可省，`category` 可省、`name`）；`after`（上一页的 `next`，首页为 null）；`limit`（1 到 100） |
| `describe-setting` | `tenant`、`asset`、`item` |
| `set-setting` | `tenant`、`asset`、`item`、`operation`（原操作的身份）、`expectedRevision`（读到的修订号，十进制文本）、`value` |
| `clear-setting` | `tenant`、`asset`、`item`、`operation`、`expectedRevision` |

`value` 三选一，按 `kind` 分：`ordinary` 带 JSON 值 `value`；`permission` 只带挑选 `pick`，不收允许集合；`secret` 带秘密原文 `secret`。

<a id="ap-4"></a>**AP-4 结果集。** 管道加的 `protocol-rejected`、`basis-unavailable`、`denied` 四个操作都有，`unknown` 只在两个提交类操作上。各自另有：

| 操作 | 结果 |
| --- | --- |
| `list-settings` | `succeeded`：`items`、`next`、`completeness`（`complete` 或 `partial`）；`not-visible`；`conflict` |
| `describe-setting` | `succeeded`：`item`；`not-visible`；`conflict` |
| `set-setting`、`clear-setting` | `succeeded`：新的 `revision`；`no-change`；`not-visible`；`invalid`；`conflict`；`not-writable`：`reason`（`locked`、`out-of-bound`、`prohibited-above`、`not-a-source`） |

除 `succeeded` 与 `not-writable` 外，这些结果的响应体是空对象。

<a id="ap-5"></a>**AP-5 一项的视图。** 每一项都带 `asset`（`category` 与 `name`）、`item`、`revision`、`declaration`（`title`、`purpose`、`appliesAt`、`clearEffect`），再按 `kind` 分三种：

- `ordinary`：`valueSchema`、`default`、`own`、`effective`（`value` 与来源层 `source`，来源可为 null）、`lockedBy`、`editable`。`default`、`own`、`effective.value` 是「未设置」或「一个值」。
- `permission`：`choices`、`default`、`own`（本层的挑选，可为 null）、`effective`（一档的值与来源层、被主动禁止、或共同的允许集合是空的）、`bound`（共同的允许集合，没有任何一层加锁时为 null）、`editable`。
- `secret`：`own` 与 `official` 的状态（未配置、可用、已撤销、读不出），`editable`。视图里没有秘密的值。

`editable` 是「可以」或「不可以」带原因（`locked`、`not-a-source`、`prohibited-above`）。

## 所有权、失败与生命周期

本包不持有状态，不导入 Cordis 与存储。消息体上限只是名字，数字是部署配置。线上的名字 `list-settings`、`describe-setting`、`set-setting`、`clear-setting` 沿用原公开契约里同名的四个设置操作。在同一个主版本里只能加操作；改已有操作的形状要新的主版本。

## 组合与验证

| 条款 | 用例 |
| --- | --- |
| AP-1 | `tests/operations.spec.ts`「assets/v1」 |
| AP-2、AP-3 | `tests/operations.spec.ts`「bodies」 |
| AP-4、AP-5 | `tests/operations.spec.ts`「answers」与「answers the outcomes of §9」 |

用例经 `dist` 导入本包；改了 `src` 先 `pnpm run build`。
