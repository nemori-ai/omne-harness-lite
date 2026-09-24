# 规范实例：合法与非法

属于 `data.model-profile` v1 的规范实例，是**本版的规范工件之一**，不是说明材料：
[`model-profile.schema.json`](model-profile.schema.json) 的每个定义项在这里有正反实例，
每个拒绝值至少一条反例，非法的一律注明**得到哪一个拒绝值、被哪一条挡住**。

**怎么读**：

- 每节开头的「校验对象」给出该节实例要拿去求值的 `$defs`，以及文档的种类（[契约 S-24](contract.md#s-24-表示层校验是一次纯计算)）。
- 表的列是：实例 ｜ 预期（`通过`／`拒绝`）｜ 拒绝值（按[契约 S-25](contract.md#s-25-拒绝值闭合一次恰一个)的表与次序）｜ 依据。
- **第 2 节的反例是在某条正例上改一处**：「A：`providers` → `[]`」读作「取正例 A，把 `providers` 换成 `[]`，其余不动」；
  「A：＋`parameters`」读作「在正例 A 上加这个成员」；「A：−`inputConstraints`」读作「删掉这个成员」。
  **这个写法也是机检格式**：取正例、按一处改动生成文档、求值、比对后两列。
- **「预期」一列是整个表示层校验的结果**，不只是 Schema：`max_output_exceeds_profile` 那几行 **Schema 放行、表示层拒绝**，
  表里单独注明（[契约 S-18](contract.md#s-18-档案参数的输出上限)）。

**两条读法上的边界：**

- **`通过` 只说表示合法。**它不表示路由名没被占（[S-3](contract.md#s-3-撞名判定同一范围内唯一)，见[第 7 节](#7-判定撞名拒建不是-schema-实例)）、
  不表示引用解析得到（[S-14](contract.md#s-14-引用只精确解析不跨层)），更不表示谁能用它。
- **示例里的路由名、供应商名与身份值都是占位。**`vendor-a/chat-large`、`provider-x` 不是任何真实目录里的条目，
  也不是对词法的承诺（[G-2](contract.md#十已知缺口)）；`org_7fd2c1`、`acc_91ab40` 的形状归 `data.identity-values`。

## 1. 三条正例

**校验对象**：`$defs/ModelProfile`（种类：`ModelProfile`）。三条都**通过**。

### 正例 A：官方档案

```json
{
  "routeName": "vendor-a/chat-large",
  "origin": "official",
  "providers": ["provider-x", "provider-y"],
  "allowFallback": true,
  "inputModalities": ["text", "image"],
  "outputModalities": ["text"],
  "maxInputTokens": 200000,
  "maxOutputTokens": 64000,
  "inputConstraints": { "maxImageBytes": 5242880 },
  "registration": "listed",
  "updatedAt": "2026-09-23T08:00:00Z"
}
```

- 它在出厂默认层（[S-4](contract.md#s-4-profileorigin)）；**不含凭据**（[S-22](contract.md#s-22-凭据价格与实际用了哪条都不在档案上)），凭据在装配阶段配置。
- 指向它的引用只带路由名（[S-13](contract.md#s-13-modelprofileref)）：`{"origin": "official", "routeName": "vendor-a/chat-large"}`——
  能这样写，是因为官方档案全在出厂默认层这一格、同一格里路由名不重复（[S-3](contract.md#s-3-撞名判定同一范围内唯一)）；
  别的格里即使有一条同名的自建档案，官方引用也只在官方档案里解析（[S-14](contract.md#s-14-引用只精确解析不跨层)）。
- 没有 `parameters`：本档案一项都不给（[S-17](contract.md#s-17-缺席即不带没有人补值)）。

### 正例 B：租户层的自建档案，带请求参数

```json
{
  "routeName": "vendor-b/coder-7b",
  "origin": "custom",
  "providers": ["provider-z"],
  "allowFallback": false,
  "inputModalities": ["text"],
  "outputModalities": ["text"],
  "maxInputTokens": 32000,
  "maxOutputTokens": 8192,
  "inputConstraints": {},
  "registration": "listed",
  "updatedAt": "2026-09-20T02:30:00+08:00",
  "parameters": {
    "reasoningEffort": "low",
    "temperature": 0.2,
    "topP": 0.95,
    "seed": 42,
    "maxOutputTokens": 4096,
    "stopSequences": ["</answer>"],
    "frequencyPenalty": 0,
    "presencePenalty": 0.5,
    "extra": { "top_k": 40 }
  }
}
```

指向它的引用（它在租户 `(org_7fd2c1, acc_91ab40)` 的租户层）：

```json
{
  "origin": "custom",
  "scope": { "layer": "tenant", "tenant": { "organization": "org_7fd2c1", "account": "acc_91ab40" } },
  "routeName": "vendor-b/coder-7b"
}
```

- `inputConstraints: {}`：档案记载上游对内容**没有**额外限制（[S-9](contract.md#s-9-inputconstraints)）。
- `parameters.maxOutputTokens` 4096 ≤ 档案的 8192（[S-18](contract.md#s-18-档案参数的输出上限)）。
- `extra.top_k` 是上游私有的项，统一词表没有它，只能进 `extra`（[S-19](contract.md#s-19-extra)）。

### 正例 C：组织层的自建档案，已撤回

```json
{
  "routeName": "vendor-c/vision-mini",
  "origin": "custom",
  "providers": ["provider-x", "provider-y"],
  "allowFallback": false,
  "inputModalities": ["text", "image", "video"],
  "outputModalities": ["text"],
  "maxInputTokens": 128000,
  "maxOutputTokens": 4096,
  "inputConstraints": { "maxImageBytes": 1048576 },
  "registration": "withdrawn",
  "updatedAt": "2026-08-01T00:00:00Z"
}
```

指向它的引用（它在组织 `org_7fd2c1` 的组织层）：

```json
{
  "origin": "custom",
  "scope": { "layer": "organization", "organization": "org_7fd2c1" },
  "routeName": "vendor-c/vision-mini"
}
```

- **已撤回的档案仍是一份合法文档，仍读得出**；这个引用仍解析到它（[S-10](contract.md#s-10-registration)、[S-14](contract.md#s-14-引用只精确解析不跨层)）。
  它**可以恢复在册**：恢复之后 `registration` 回到 `"listed"`，其余成员一个不变，这个引用解析到的仍是同一条。
- `allowFallback: false` 而列表有两家**合法**：只发往第一家，第二家保留在档案上（[S-6](contract.md#s-6-允不允许回退)）。

## 2. ModelProfile 的反例

**校验对象**：`$defs/ModelProfile`（种类：`ModelProfile`）。每行在一条正例上改一处。

| 实例 | 预期 | 拒绝值 | 依据 |
|---|---|---|---|
| A：`routeName` → `""` | 拒绝 | `route_name_empty` | [S-2](contract.md#s-2-routename) |
| A：−`routeName` | 拒绝 | `malformed`（M2） | [S-25](contract.md#s-25-拒绝值闭合一次恰一个)：缺必填成员报 `malformed`，不报 `route_name_empty` |
| A：`routeName` → `null` | 拒绝 | `malformed`（M4） | 同上：`null` 不是一个空路由名 |
| A：`routeName` → `" vendor-a/chat-large"` | 拒绝 | `malformed`（M7） | [S-2](contract.md#s-2-routename)：首尾不得是空白，否则一个空格就绕过 [S-3](contract.md#s-3-撞名判定同一范围内唯一) |
| A：`routeName` → `"vendor-a/chat-large\n"` | 拒绝 | `malformed`（M7） | [S-2](contract.md#s-2-routename)：**`$` 的回归用例**——用 `$` 收尾的 pattern 在 Python 下会放它通过 |
| A：`routeName` → `"﻿vendor-a/chat-large"`（前导 U+FEFF） | 拒绝 | `malformed`（M7） | [S-2](contract.md#s-2-routename)：**`\s` 的回归用例**——U+FEFF 在显式空白集合里 |
| A：`origin` → `"builtin"` | 拒绝 | `malformed`（M5） | [S-4](contract.md#s-4-profileorigin)：恰两值 |
| A：`providers` → `[]` | 拒绝 | `providers_empty` | [S-5](contract.md#s-5-providername-与允许的供应商)：非空 |
| A：`providers` → `"provider-x"` | 拒绝 | `malformed`（M4） | [S-5](contract.md#s-5-providername-与允许的供应商)：有序列表，不是一个名字 |
| A：`providers` → `["provider-x", "provider-x"]` | 拒绝 | `malformed`（M6） | [S-5](contract.md#s-5-providername-与允许的供应商)：无重复——同一家不能在「逐家去试」里出现两次 |
| A：`providers` → `["", "provider-y"]` | 拒绝 | `malformed`（M6） | [S-5](contract.md#s-5-providername-与允许的供应商)：供应商名非空 |
| A：`allowFallback` → `"true"` | 拒绝 | `malformed`（M4） | [S-6](contract.md#s-6-允不允许回退)：布尔 |
| A：`inputModalities` → `[]` | 拒绝 | `modalities_empty` | [S-7](contract.md#s-7-modality-与两组模态) |
| A：`outputModalities` → `[]` | 拒绝 | `modalities_empty` | [S-7](contract.md#s-7-modality-与两组模态) |
| A：`inputModalities` → `["text", "file"]` | 拒绝 | `modality_unknown` | [S-7](contract.md#s-7-modality-与两组模态)：**文件不是一种模态** |
| A：`inputModalities` → `["text", "voice"]` | 拒绝 | `modality_unknown` | [S-7](contract.md#s-7-modality-与两组模态)：token 是 `audio`，词条英文 voice 不是 token |
| A：`inputModalities` → `["image"]` | 拒绝 | `input_text_missing` | [S-7](contract.md#s-7-modality-与两组模态)：收得下的模态必含 `text`——否则有 transcript 的块它也读不了 |
| A：`outputModalities` → `["image"]` | 通过 | —— | [S-7](contract.md#s-7-modality-与两组模态)：「必含 `text`」只约束收得下的那一组 |
| A：`inputModalities` → `["text", "Text"]` | 拒绝 | `modality_unknown` | [S-7](contract.md#s-7-modality-与两组模态)：不做「最接近」映射 |
| A：`inputModalities` → `["text", "text"]` | 拒绝 | `malformed`（M6） | [S-7](contract.md#s-7-modality-与两组模态)：集合，无重复 |
| A：`inputModalities` → `["image", "text"]` | 通过 | —— | [S-7](contract.md#s-7-modality-与两组模态)：次序没有含义，与正例 A **是同一个集合** |
| A：`maxInputTokens` → `0` | 拒绝 | `malformed`（M8） | [S-8](contract.md#s-8-两个上限)：至少一 |
| A：`maxOutputTokens` → `1.5` | 拒绝 | `malformed`（M4） | [S-8](contract.md#s-8-两个上限)：整数 |
| A：−`inputConstraints` | 拒绝 | `malformed`（M2） | [S-9](contract.md#s-9-inputconstraints)：「没有限制」要写 `{}` 明说，缺席会把「没记」读成「没有」 |
| A：`inputConstraints` → `{"maxImageBytes": 0}` | 拒绝 | `malformed`（M8） | [S-9](contract.md#s-9-inputconstraints) |
| A：`inputConstraints` → `{"maxImageBytes": 5242880, "maxAudioSeconds": 60}` | 拒绝 | `constraint_unknown` | [S-9](contract.md#s-9-inputconstraints)：未登记的键即拒，不忽略；加一条是新版本 |
| B：`inputConstraints` → `{"maxImageBytes": 5242880}` | 通过 | —— | [S-9](contract.md#s-9-inputconstraints)：挂在不收 `image` 的档案上**不是非法值**，只是用不上 |
| A：`registration` → `"deleted"` | 拒绝 | `registration_unknown` | [S-10](contract.md#s-10-registration)：撤回不是删除 |
| A：`registration` → `"disallowed"` | 拒绝 | `registration_unknown` | [S-10](contract.md#s-10-registration)：「这个范围不允许」是求值结果，不是在册状态 |
| A：`registration` → `"Listed"` | 拒绝 | `registration_unknown` | [S-10](contract.md#s-10-registration) |
| A：`registration` → `false` | 拒绝 | `malformed`（M4） | [S-10](contract.md#s-10-registration)：不是布尔 |
| A：`updatedAt` → `"2026-09-23"` | 拒绝 | `malformed`（M11） | [S-11](contract.md#s-11-updatedat)：日期不是时间点 |
| A：＋`"credential": "sk-or-…"` | 拒绝 | `malformed`（M3） | [S-22](contract.md#s-22-凭据价格与实际用了哪条都不在档案上)：凭据挂在范围上 |
| A：＋`"pricing": {"inputPerMillion": 3}` | 拒绝 | `malformed`（M3） | [S-22](contract.md#s-22-凭据价格与实际用了哪条都不在档案上)：价格不在档案上 |
| A：＋`"scope": {"layer": "organization", "organization": "org_7fd2c1"}` | 拒绝 | `malformed`（M3） | [S-1](contract.md#s-1-档案的身份所在范围与路由名)：所在范围不是记录的成员，与引用成对交出 |
| A：＋`"enabled": true` | 拒绝 | `malformed`（M3） | [S-1](contract.md#s-1-档案的身份所在范围与路由名)：档案不是资产，没有启用／禁用标记 |
| A：＋`"parameters": {}` | 拒绝 | `malformed`（M10） | [S-17](contract.md#s-17-缺席即不带没有人补值)：档案上「一项都不给」只有一种写法——缺席 |
| A：＋`"parameters": {"temperature": 2.5}` | 拒绝 | `parameter_out_of_range` | [S-16](contract.md#s-16-各项的取值域) |
| A：＋`"parameters": {"temperature": "0.2"}` | 拒绝 | `malformed`（M4） | [S-16](contract.md#s-16-各项的取值域)：类型不对是 `malformed`，不是越界 |
| A：＋`"parameters": {"reasoningEffort": "extreme"}` | 拒绝 | `parameter_out_of_range` | [S-16](contract.md#s-16-各项的取值域)：五档闭合 |
| A：＋`"parameters": {"maxOutputTokens": 0}` | 拒绝 | `parameter_out_of_range` | [S-16](contract.md#s-16-各项的取值域)：先于第 8 行的跨字段比较命中 |
| A：＋`"parameters": {"maxOutputTokens": 64000}` | 通过 | —— | [S-18](contract.md#s-18-档案参数的输出上限)：等于档案上限可以 |
| A：＋`"parameters": {"maxOutputTokens": 64001}` | 拒绝 | `max_output_exceeds_profile` | [S-18](contract.md#s-18-档案参数的输出上限)。**Schema 放行、表示层拒绝**——只跑 Schema 的实现会漏掉这一行 |
| B：`maxOutputTokens` → `2048` | 拒绝 | `max_output_exceeds_profile` | [S-18](contract.md#s-18-档案参数的输出上限)、[S-12](contract.md#s-12-各属性何时定能不能改)：把档案上限改到低于参数值，改完的文档过不了。**所以上游收紧到这里时档案不改**，差额由 adapter 在发出时按「改了值再发出」处理并留痕（[S-21](contract.md#s-21-不静默丢也不静默改)）。**Schema 放行、表示层拒绝** |
| A：＋`"parameters": {"top_k": 40}` | 拒绝 | `malformed`（M3） | [S-15](contract.md#s-15-modelrequestparameters-是一份词表)：上游私有的项只能进 `extra` |
| A：＋`"parameters": {"timeoutMs": 30000}` | 拒绝 | `malformed`（M3） | [S-16](contract.md#s-16-各项的取值域)：词表里没有时限（PF-013 §6.17） |
| A：＋`"parameters": {"extra": {}}` | 拒绝 | `malformed`（M10） | [S-17](contract.md#s-17-缺席即不带没有人补值)、[S-19](contract.md#s-19-extra) |
| A：＋`"parameters": {"extra": {"temperature": 0.3}}` | 拒绝 | `malformed`（M10） | [S-19](contract.md#s-19-extra)：统一项只有一种写法 |
| A：＋`"parameters": {"extra": {"top_p": 0.9}}` | 通过 | —— | [S-19](contract.md#s-19-extra)：**Schema 管不到**——它不知道 `top_p` 是 `topP` 的上游拼法。识别它的是 adapter，收场是 [G-9](contract.md#十已知缺口) |

## 3. ModelProfileRef

**校验对象**：`$defs/ModelProfileRef`（种类：`ModelProfileRef`）。自建那一支 `scope` 的形状由 `data.identity-values/v1` 的 `ScopeLayerIdentity` 判。

| 实例 | 预期 | 拒绝值 | 依据 |
|---|---|---|---|
| `{"origin": "official", "routeName": "vendor-a/chat-large"}`（正例 A 的引用） | 通过 | —— | [S-13](contract.md#s-13-modelprofileref)：官方那一支只带路由名，前提是 [S-3](contract.md#s-3-撞名判定同一范围内唯一) |
| 正例 B 的引用 | 通过 | —— | [S-13](contract.md#s-13-modelprofileref) |
| 正例 C 的引用 | 通过 | —— | [S-13](contract.md#s-13-modelprofileref)：已撤回的档案照样可被引用 |
| `{"routeName": "vendor-b/coder-7b", "scope": {"layer": "tenant", "tenant": {"account": "acc_91ab40", "organization": "org_7fd2c1"}}, "origin": "custom"}` | 通过 | —— | [S-13](contract.md#s-13-modelprofileref)：成员次序不参与相等，与正例 B 的引用**是同一个引用** |
| `{"origin": "official", "routeName": ""}` | 拒绝 | `route_name_empty` | [S-2](contract.md#s-2-routename) |
| `{"origin": "custom", "scope": {"layer": "tenant", "tenant": {"organization": "org_7fd2c1", "account": "acc_91ab40"}}, "routeName": ""}` | 拒绝 | `route_name_empty` | [S-2](contract.md#s-2-routename) |
| `{"routeName": "vendor-a/chat-large"}` | 拒绝 | `malformed`（M2） | [S-13](contract.md#s-13-modelprofileref)：`origin` 必填，**缺它不表示「官方」** |
| `{"scope": {"layer": "tenant", "tenant": {"organization": "org_7fd2c1", "account": "acc_91ab40"}}, "routeName": "vendor-b/coder-7b"}` | 拒绝 | `malformed`（M2） | [S-13](contract.md#s-13-modelprofileref)：`origin` 必填，带了 `scope` 也不替它推出「自建」 |
| `{"origin": "custom", "routeName": "vendor-b/coder-7b"}` | 拒绝 | `malformed`（M2） | [S-13](contract.md#s-13-modelprofileref)：自建那一支 `scope` 必填，**缺它不表示「当前租户」，也不退成官方引用** |
| `{"origin": "official", "scope": {"layer": "organization", "organization": "org_7fd2c1"}, "routeName": "vendor-a/chat-large"}` | 拒绝 | `malformed`（M3） | [S-13](contract.md#s-13-modelprofileref)：官方那一支不带范围分量，两支互斥 |
| `{"origin": "builtin", "routeName": "vendor-a/chat-large"}` | 拒绝 | `malformed`（M5） | [S-13](contract.md#s-13-modelprofileref)、[S-4](contract.md#s-4-profileorigin)：恰两值 |
| `{"origin": "custom", "scope": {"layer": "factoryDefault"}, "routeName": "vendor-a/chat-large"}` | 拒绝 | `malformed`（M9） | [S-13](contract.md#s-13-modelprofileref)：出厂默认层没有身份值，本契约不自行补上；指向官方档案用官方那一支 |
| `{"origin": "custom", "scope": {"layer": "tenant", "tenant": {"organization": "org_7fd2c1"}}, "routeName": "vendor-b/coder-7b"}` | 拒绝 | `malformed`（M9） | [S-13](contract.md#s-13-modelprofileref)：租户身份缺一个分量，不得用「当前登录账号」补齐 |
| `{"origin": "custom", "scope": {"layer": "organization", "tenant": {"organization": "org_7fd2c1", "account": "acc_91ab40"}}, "routeName": "vendor-b/coder-7b"}` | 拒绝 | `malformed`（M9） | [S-13](contract.md#s-13-modelprofileref)：判别式与载荷对不上 |
| `{"origin": "custom", "scope": {"organizationId": "org_7fd2c1", "tenantId": null}, "routeName": "vendor-c/vision-mini"}` | 拒绝 | `malformed`（M9） | [S-13](contract.md#s-13-modelprofileref)：两个可空字段那种压平形状 |
| `{"origin": "custom", "scope": null, "routeName": "vendor-c/vision-mini"}` | 拒绝 | `malformed`（M9） | [S-13](contract.md#s-13-modelprofileref)：`null` 不是一个范围 |
| `"vendor-b/coder-7b"` | 拒绝 | `malformed`（M1） | [S-13](contract.md#s-13-modelprofileref)：一个引用不是一个裸名字。**反过来，「用哪个模型」那项设置与切换事实记的正是这样一个 `RouteName`**，按 [S-2](contract.md#s-2-routename) 校验，不按本节的 `ModelProfileRef`（[S-14](contract.md#s-14-引用只精确解析不跨层)） |

**表示合法不等于解析得到**（[S-14](contract.md#s-14-引用只精确解析不跨层)）：`{"origin": "custom", "scope": {"layer": "organization", "organization": "org_7fd2c1"}, "routeName": "vendor-b/coder-7b"}`
形状上完全合法，但 `vendor-b/coder-7b` 那一条在租户层，**所在范围对不上就是「查无此条」**，不会顺着名字解析到租户层那一条。

## 4. ModelRequestParameters（独立值）

**校验对象**：`$defs/ModelRequestParameters`（种类：`ModelRequestParameters`）。独立值里没有档案可比，
[S-18](contract.md#s-18-档案参数的输出上限) 不适用（与档案怎样配对是 [G-8](contract.md#十已知缺口)）。

| 实例 | 预期 | 拒绝值 | 依据 |
|---|---|---|---|
| `{}` | 通过 | —— | [S-17](contract.md#s-17-缺席即不带没有人补值)：独立值里 `{}` 是「一项都没有」 |
| `{"reasoningEffort": "none"}` | 通过 | —— | [S-17](contract.md#s-17-缺席即不带没有人补值)：`none` 是一个取值，不同于缺席 |
| `{"reasoningEffort": "max"}` | 通过 | —— | [S-16](contract.md#s-16-各项的取值域)；上游没有这一档时按 [S-21](contract.md#s-21-不静默丢也不静默改) 留痕，不静默换成 `high` |
| `{"reasoningEffort": "minimal"}` | 拒绝 | `parameter_out_of_range` | [S-16](contract.md#s-16-各项的取值域)：五档闭合，上游自己的档名不是本词表的取值 |
| `{"temperature": 0}` | 通过 | —— | [S-16](contract.md#s-16-各项的取值域)：闭区间下端 |
| `{"temperature": 2}` | 通过 | —— | [S-16](contract.md#s-16-各项的取值域)：闭区间上端 |
| `{"temperature": -0.1}` | 拒绝 | `parameter_out_of_range` | [S-16](contract.md#s-16-各项的取值域) |
| `{"topP": 1}` | 通过 | —— | [S-16](contract.md#s-16-各项的取值域) |
| `{"topP": 0}` | 拒绝 | `parameter_out_of_range` | [S-16](contract.md#s-16-各项的取值域)：下端开区间 |
| `{"seed": -7}` | 通过 | —— | [S-16](contract.md#s-16-各项的取值域)：任意整数 |
| `{"seed": 1.5}` | 拒绝 | `malformed`（M4） | [S-16](contract.md#s-16-各项的取值域)：类型不对 |
| `{"maxOutputTokens": 1000000}` | 通过 | —— | [S-18](contract.md#s-18-档案参数的输出上限)：独立值不比档案上限 |
| `{"stopSequences": ["END", "</answer>"]}` | 通过 | —— | [S-16](contract.md#s-16-各项的取值域) |
| `{"stopSequences": []}` | 拒绝 | `parameter_out_of_range` | [S-16](contract.md#s-16-各项的取值域)：「没有停止串」的写法是缺席 |
| `{"stopSequences": [""]}` | 拒绝 | `parameter_out_of_range` | [S-16](contract.md#s-16-各项的取值域) |
| `{"stopSequences": "END"}` | 拒绝 | `malformed`（M4） | [S-16](contract.md#s-16-各项的取值域) |
| `{"frequencyPenalty": -2, "presencePenalty": 2}` | 通过 | —— | [S-16](contract.md#s-16-各项的取值域)：两端闭区间 |
| `{"presencePenalty": 2.01}` | 拒绝 | `parameter_out_of_range` | [S-16](contract.md#s-16-各项的取值域) |
| `{"extra": {"top_k": 40, "provider_hint": {"x": 1}}}` | 通过 | —— | [S-19](contract.md#s-19-extra)：值是任意 JSON |
| `{"extra": {"": 1}}` | 拒绝 | `malformed`（M10） | [S-19](contract.md#s-19-extra)：键非空 |
| `{"extra": {"seed": 7}}` | 拒绝 | `malformed`（M10） | [S-19](contract.md#s-19-extra)、[S-20](contract.md#s-20-项与项名)：否则项名 `seed` 指两样东西 |
| `{"extra": {}}` | 拒绝 | `malformed`（M10） | [S-17](contract.md#s-17-缺席即不带没有人补值) |
| `{"top_k": 40}` | 拒绝 | `malformed`（M3） | [S-15](contract.md#s-15-modelrequestparameters-是一份词表)：未登记的成员即拒，不当作 `extra` |
| `{"temperature": null}` | 拒绝 | `malformed`（M4） | [S-17](contract.md#s-17-缺席即不带没有人补值)：不带一项的写法是缺席，不是 `null` |

## 5. 单项定义

**校验对象**：各节标题所列的 `$defs`。这些定义单独被别的契约 `$ref` 时，拒绝值按它所在文档的种类判；这里只给形状上的通过与拒绝。

### 5.1 RouteName

| 实例 | 预期 | 依据 |
|---|---|---|
| `"vendor-a/chat-large"` | 通过 | [S-2](contract.md#s-2-routename) |
| `"a"` | 通过 | [S-2](contract.md#s-2-routename)：最短的合法路由名是一个非空白码点 |
| `"vendor a/chat"` | 通过 | [S-2](contract.md#s-2-routename)：**中间**的空白不受本条限制；词法归上游 |
| `"Vendor-A/Chat-Large"` | 通过 | [S-2](contract.md#s-2-routename)：与 `vendor-a/chat-large` **是两个名字**（逐码点相等）；只差大小写不算撞名（[S-3](contract.md#s-3-撞名判定同一范围内唯一)） |
| `""` | 拒绝 | [S-2](contract.md#s-2-routename) |
| `"vendor-a/chat-large "` | 拒绝 | [S-2](contract.md#s-2-routename)：尾随空白 |
| `12345` | 拒绝 | [S-2](contract.md#s-2-routename)：字符串 |

### 5.2 ProviderName

| 实例 | 预期 | 依据 |
|---|---|---|
| `"provider-x"` | 通过 | [S-5](contract.md#s-5-providername-与允许的供应商) |
| `""` | 拒绝 | [S-5](contract.md#s-5-providername-与允许的供应商)：非空 |
| `["provider-x"]` | 拒绝 | [S-5](contract.md#s-5-providername-与允许的供应商)：一家是一个字符串 |

### 5.3 Modality、Registration、ProfileOrigin、ReasoningEffort

| 校验对象 | 通过 | 拒绝 | 依据 |
|---|---|---|---|
| `$defs/Modality`（`data.content-blocks` 的定义，本契约 `$ref`） | `"text"`、`"image"`、`"audio"`、`"video"` | `"file"`、`"voice"`、`"Text"`、`null` | [S-7](contract.md#s-7-modality-与两组模态) |
| `$defs/Registration` | `"listed"`、`"withdrawn"` | `"deleted"`、`"disallowed"`、`"relisted"` | [S-10](contract.md#s-10-registration)：恢复在册回到的就是 `"listed"`，没有第三个取值 |
| `$defs/ProfileOrigin` | `"official"`、`"custom"` | `"builtin"`、`"customized"` | [S-4](contract.md#s-4-profileorigin)：`customized` 是资产那一套的说法，不在这里 |
| `$defs/ReasoningEffort` | `"none"`、`"low"`、`"medium"`、`"high"`、`"max"` | `"minimal"`、`"xhigh"`、`""` | [S-16](contract.md#s-16-各项的取值域) |

### 5.4 InputConstraints

| 实例 | 预期 | 依据 |
|---|---|---|
| `{}` | 通过 | [S-9](contract.md#s-9-inputconstraints)：一条都没有 |
| `{"maxImageBytes": 1}` | 通过 | [S-9](contract.md#s-9-inputconstraints) |
| `{"maxImageBytes": 1048576.5}` | 拒绝 | [S-9](contract.md#s-9-inputconstraints)：整数 |
| `{"maxImageBytes": null}` | 拒绝 | [S-9](contract.md#s-9-inputconstraints)：没有这条限制的写法是不写这个键 |

## 6. 多处违规时的次序

**校验对象**：`$defs/ModelProfile`。一份文档命中多条时取 [S-25](contract.md#s-25-拒绝值闭合一次恰一个) 表中最先命中的那一个——两个实现须报同一个值。

| 实例 | 预期 | 拒绝值 | 依据 |
|---|---|---|---|
| A：`routeName` → `""`，且 −`updatedAt` | 拒绝 | `malformed`（M2） | 结构不完整先于一切具体原因 |
| A：`providers` → `[]`，且 `registration` → `"deleted"` | 拒绝 | `providers_empty` | 第 3 行先于第 7 行 |
| A：`inputModalities` → `["image", "file"]` | 拒绝 | `input_text_missing` | 第 5 行先于第 6 行：缺 `text` 与未知 token 同时命中，报缺 `text` |
| A：`inputConstraints` → `{"maxAudioSeconds": 60}`，且 ＋`"parameters": {"maxOutputTokens": 64001}` | 拒绝 | `max_output_exceeds_profile` | 第 9 行先于第 10 行 |

## 7. 判定：撞名拒建（不是 Schema 实例）

**这一节不是表示层校验**：每一行的拟建档案**都通过表示层校验**，被拒是因为要读别的记录（[S-3](contract.md#s-3-撞名判定同一范围内唯一)、[S-26](contract.md#s-26-表示层拒绝与判定分开)）。
它是规范场景，由拥有建档操作的能力（`capability.model-profile-directory` v1）演练，状态见[验证入口](../verification.md#证据义务)。

**已有的档案**：正例 A（官方，在册）、正例 B（租户 `(org_7fd2c1, acc_91ab40)` 的租户层，在册）、正例 C（组织 `org_7fd2c1` 的组织层，已撤回）。
**隶属关系**：组织 `org_t3a9` 的上级是 `org_7fd2c1`。**本节的判定一次也不读它**——列在这里只为说明隶属关系不参与撞名判定。
下表各行都是**在上面三条已有档案上单独做的一次**，行与行之间不累积；行内另写了前提的，按行内。

| 拟建 | 结果 | 依据 |
|---|---|---|
| 租户 `(org_7fd2c1, acc_91ab40)` 在自己那层建 `vendor-a/chat-large` | **建出** | 与正例 A（官方）同名，但不在同一格：两条并存；官方引用只解析到官方那一条，自建引用带着这一格（[S-13](contract.md#s-13-modelprofileref)、[S-14](contract.md#s-14-引用只精确解析不跨层)） |
| 同一租户在自己那层再建 `vendor-b/coder-7b` | `route_name_taken` | 撞同一格里的名字（正例 B） |
| 组织 `org_7fd2c1` 在组织层建 `vendor-b/coder-7b` | **建出** | 组织层与它某个租户的租户层不是同一格；**这一读法待产品负责人确认**（[G-13](contract.md#十已知缺口)） |
| 组织 `org_7fd2c1` 在组织层建 `vendor-c/vision-mini` | `route_name_taken` | 撞同一格里一条**已撤回**的档案（正例 C）：要再用这个名字，是把正例 C **恢复在册**，不是另建（[S-10](contract.md#s-10-registration)） |
| 组织 `org_t3a9` 在组织层建 `vendor-c/vision-mini` | **建出** | 不在同一格；它的上级是 `org_7fd2c1` 这件事不参与判定 |
| 系统发布一条新的官方档案 `vendor-b/coder-7b` | **建出** | 出厂默认层那一格里没有这个名字；与正例 B 并存 |
| 正例 A 被撤回之后，系统再发布一条官方档案 `vendor-a/chat-large` | `route_name_taken` | 同一格（出厂默认层）里已撤回的行仍占着名字；上游把它重新上架，走的是把正例 A 恢复在册（`capability.model-profile-directory` v1 清单装入的「恢复」处置） |
| 租户 `(org_7fd2c1, acc_91ab40)` 在自己那层建 `Vendor-B/Coder-7B` | **建出** | 只差大小写不算同名：逐码点比较，不做大小写折叠与相似字判定 |
| 任一行，判定时读不到那一格的已有档案 | **明确失败**（值名归能力） | S-3 九件事第 4 行：**不得当作「未被占」** |
| 两个请求**并发**在租户 `(org_7fd2c1, acc_91ab40)` 那一格建 `vendor-d/new` | **恰一个成功**，另一个 `route_name_taken` | S-3 九件事第 3 行：同一格里，判定读到的名字与写入同一提交 |
| 租户 `(org_7fd2c1, acc_91ab40)` 在自己那层建 `vendor-d/next`，与系统发布官方档案 `vendor-d/next` **并发** | **两个都建出** | 不在同一格，互不相干 |
| 两个请求**并发**建 `vendor-d/other`，一个在组织 `org_7fd2c1` 的组织层、一个在它的租户 `(org_7fd2c1, acc_91ab40)` 的租户层 | **两个都建出** | 不在同一格（读法待产品负责人确认，[G-13](contract.md#十已知缺口)） |

## 8. 转移不是形状：撤回与恢复在册

**这一节同样不是 Schema 实例。**把正例 C 的 `registration` 改回 `"listed"`，得到的文档**表示上完全合法**——
它和一条在册的档案长得一样，而这正是正例 C **恢复在册之后**的样子：恢复是一次**转移**（[S-10](contract.md#s-10-registration)），由维护档案的能力写下，
表示层看不出、也不需要看出一条档案是新建的还是恢复的。
**表示层之外要守的是**：恢复的是**同一行**（不另起一行、身份分量不变、其余成员不变、`updatedAt` 不动）；除撤回与恢复在册之外，在册状态**没有别的写路径**；行不删。
它们的证据形式是静态检查与场景，登记在[验证入口](../verification.md#证据义务)。

## 9. ModelProfileSnapshot

**校验对象**：`$defs/ModelProfileSnapshot`（[S-27](contract.md#s-27-modelprofilesnapshot档案在某一刻的副本)）。它是值，不是一份档案文档：不参与 [S-25](contract.md#s-25-拒绝值闭合一次恰一个) 的拒绝值次序，这里只给形状上的通过与拒绝。

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"providers": ["provider-z"], "allowFallback": false, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 32000, "maxOutputTokens": 8192, "parameters": {"temperature": 0.2}, "updatedAt": "2026-09-20T02:30:00+08:00"}` | 通过 | 正例 B 在那一刻的副本 |
| `{"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}` | 通过 | `parameters` 缺席：那一刻档案一项都不给 |
| `{"providers": ["provider-z"], "allowFallback": false, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 32000, "maxOutputTokens": 8192}` | 拒绝 | `updatedAt` 必带：快照要说得出记载是哪一刻的 |
| `{"routeName": "vendor-b/coder-7b", "providers": ["provider-z"], "allowFallback": false, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 32000, "maxOutputTokens": 8192, "updatedAt": "2026-09-20T02:30:00+08:00"}` | 拒绝 | 不带路由名：指认哪一条档案靠成对交出的引用 |
| `{"providers": ["provider-z"], "allowFallback": false, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 32000, "maxOutputTokens": 8192, "registration": "listed", "updatedAt": "2026-09-20T02:30:00+08:00"}` | 拒绝 | 不带在册状态 |
| `{"providers": [], "allowFallback": false, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 32000, "maxOutputTokens": 8192, "updatedAt": "2026-09-20T02:30:00+08:00"}` | 拒绝 | 取值域与档案同名成员相同：`providers` 非空 |
