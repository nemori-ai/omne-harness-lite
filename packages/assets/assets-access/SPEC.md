# @omne-harness/assets-access 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/` 的公开定义。

## 范围与依据

本包是资产与规则的接入插件：把 `assets/v1`（[`@omne-harness/assets-protocol`](../assets-protocol/SPEC.md)）的贡献挂上接入的登记表。依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 第 5 节「领域的接入插件怎么写」、第 7 节「目标租户放在消息体里」与「带目标租户的操作，主体由谁签发」、第 9 节「设置」（「设置的操作与答复」「设置读写面的契约」）。四个操作各对读写面的一个方法；业务规则在读写面里，本包只换主体、搬形状、映射结果。

## 结果与不变量

<a id="aa-1"></a>**AA-1 先换主体。** 四个操作都在消息体里带目标租户，身份要求是「登录」。处理函数先把登录与目标租户交给 `TargetTenantPrincipals.actingFor` 换主体，再做别的。它答 `denied` 或 `basis-unavailable` 时原样答出，不调读写面；它抛出时答 `basis-unavailable`。主体只由身份签发：登录的账号不是目标租户的账号时由它答 `denied`。

<a id="aa-2"></a>**AA-2 现取读写面。** 读写面在每次调用时现取。取不到时答 `basis-unavailable`，协议不撤下（RFC-0015 I-5）。

<a id="aa-3"></a>**AA-3 原样转交。** 主体、目标租户、资产、项、`after`、`limit`、`operation`、`expectedRevision` 原样交给读写面。`set-setting` 的值逐字段交出：普通项的 JSON 值从线上的值树换成普通值，权限项只交挑选，秘密项交秘密的原文。读写面给的视图逐字段写成契约的视图，普通项的 JSON 值从普通值换成值树；`revision` 原样带出。本包不补、不改、不合并任何字段。

<a id="aa-4"></a>**AA-4 结果的映射。** 读写面的每个结果对一个线上结果，不合并、不改名：

| 读写面的结果 | 出现在 | `assets/v1` 的结果 | 响应体 |
| --- | --- | --- | --- |
| `listed` | 列出 | `succeeded` | `items`、`next`、`completeness` |
| `described` | 查看 | `succeeded` | `item` |
| `written` | 设置、清除 | `succeeded` | `revision`：新的修订号 |
| `no-change` | 设置、清除 | `no-change` | 空 |
| `denied` | 四个 | `denied` | 空，不带原因 |
| `not-visible` | 四个 | `not-visible` | 空 |
| `invalid` | 设置、清除 | `invalid` | 空 |
| `conflict` | 四个 | `conflict` | 空。修订号不符、声明读后变过、同一个 `operation` 带不同输入都是它 |
| `not-writable` | 设置、清除 | `not-writable` | `reason`：`locked`（被上层锁定）、`out-of-bound`（越过上界）、`prohibited-above`、`not-a-source`（这一层不可配，秘密项也是它） |
| `unavailable` | 四个 | `basis-unavailable` | 空。读：读不出，不给残缺的当完整的。写：确定没有写 |
| `unknown` | 设置、清除 | `unknown` | 空。可能已经写了，调用者用同一个 `operation` 原样再送来认回 |

<a id="aa-5"></a>**AA-5 抛出。** 读写面的「列出」「查看」抛出答 `basis-unavailable`：没有提交任何东西。「设置」「清除」在调用开始之后抛出答 `unknown`：写可能已经交出去了，不写成成功或失败。

## 全化表

一个操作的状态只有一条轴：走到了哪一步。每一步的每种情形都有一个答复。

| 步 | 情形 | 列出、查看 | 设置、清除 |
| --- | --- | --- | --- |
| 换主体 | 签发 | 进下一步 | 进下一步 |
| 换主体 | 答 `denied` | `denied` | `denied` |
| 换主体 | 答 `basis-unavailable` 或抛出 | `basis-unavailable` | `basis-unavailable` |
| 取读写面 | 在树上 | 进下一步 | 进下一步 |
| 取读写面 | 不在 | `basis-unavailable` | `basis-unavailable` |
| 调读写面 | 答一个结果 | 按 AA-4 | 按 AA-4 |
| 调读写面 | 抛出 | `basis-unavailable` | `unknown` |

消息体不合契约时由管道答 `protocol-rejected`，处理函数不被调用。

## 所有权、失败与生命周期

插件只依赖登记表。挂上随插件的作用域，插件卸载即撤下。插件不持有状态，不缓存配值，不认回：认回是读写面对同一个 `operation` 答原来的结果（RFC-0015 §9 契约规定 3）。读写面在服务端应用里，本包不认识它的键；装配给一个现取它的函数。秘密项不在这一程：读写面对秘密项答不可读、不可写，本包照实带出。

## 组合与验证

| 条款 | 用例 |
| --- | --- |
| AA-1 | `tests/operations.spec.ts`「another account」「identity refuses」「identity throws」 |
| AA-2 | `tests/operations.spec.ts`「not on the tree」 |
| AA-3 | `tests/operations.spec.ts`「list」「describe」「set」「clear」的转交断言 |
| AA-4 | `tests/operations.spec.ts`「maps」各行 |
| AA-5 | `tests/operations.spec.ts`「throws」 |

用例里的读写面与身份端口是替身。端到端（真登录、设置一项、再查看读到新值）在服务端应用的行用例里跑。
