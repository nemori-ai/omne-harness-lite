# 规范实例：合法与非法

属于 `data.identity-values` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`identity-values.schema.json`](identity-values.schema.json) 的每个定义项在这里各有一组正反实例，
非法的一律注明**被哪一条挡住**。

**怎么读这张表**：每节开头的「校验对象」给出该节所有实例要拿去求值的 `$defs`；
每张表第一列是实例（JSON 内联代码），第二列是 **Schema 这一关**的预期（`通过` / `拒绝`），
第三列是依据条款。**这个格式也是机检格式**——
[验证入口](../verification.md#结果与反例)记录的自检就是逐节按「校验对象」把第一列喂给校验器、
拿第二列比对，**不另抄一份清单**。

**两条读法上的边界：**

- **`通过` 只说形状合规。**它**不表示**任何条款成立——
  [S-16～S-30](contract.md#五隔离义务) 一条也不在 Schema 的能力范围内，
  [S-6](contract.md#s-6-tenantid-无生灭路径) 这类「没有这条写路径」也不是形状能表达的。
  Schema 管得到什么，逐条列在[契约第七节](contract.md#schema-管得到什么)。
- **示例里的标识串只是占位。****具体词法未定**（[G-04](contract.md#十已知缺口)），
  实例**不得被读成对词法的承诺**——不要从 `acc_` / `org_` 这样的前缀推出任何规则。

## 1. AccountId

**校验对象**：`$defs/AccountId`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"acc_7f3c91"` | 通过 | [S-1](contract.md#s-1-accountid)：非空字符串即可，形状不承诺更多 |
| `"01J9Q0ZK4M7Q2S"` | 通过 | [S-1](contract.md#s-1-accountid)：不透明，形状不限定编码族 |
| `"a"` | 通过 | [S-31](contract.md#s-31-不透明标识的交换表示)：最短的合法标识就是一个非空白码点 |
| `""` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值)：空串不是身份值 |
| `null` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值)：`null` 不是身份值 |
| `12345` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：交换表示是字符串；数字会引入大小关系，而标识只有相等 |
| `{"value": "acc_7f3c91"}` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：标识是标量，不是记录 |
| `" acc_7f3c91"` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：禁止首尾空白——相等是逐码点精确相等，不裁剪 |
| `"acc_7f3c91 "` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：同上，尾部空白同样非法 |
| `"acc_7f3c91\n"` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：U+000A 在那个显式空白集合里。**这一条是 `$` 的回归用例**——Python 的 `$` 匹配到「末尾换行之前」，用 `$` 收尾的 pattern 会**放它通过**，而 JavaScript 会拒。本版 pattern 以 `(?![\s\S])` 收尾，两边都拒 |
| `"﻿acc_7f3c91"` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：U+FEFF 在那个显式空白集合里。**这一条是 `\s` 的回归用例**——ECMA-262 的 `\s` 含 U+FEFF、Python 的不含，用 `\S` 写的 pattern 会在 Python 下**放它通过**。本版 pattern 用显式否定字符类，两边都拒 |

## 2. OrganizationId

**校验对象**：`$defs/OrganizationId`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"org_kf22"` | 通过 | [S-3](contract.md#s-3-organizationid) |
| `"org_7fd2c1"` | 通过 | [S-3](contract.md#s-3-organizationid)：个人组织与团队组织**共用同一个标识空间**，形状上无从分辨 |
| `""` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值) |
| `null` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值) |
| `" org_kf22 "` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：禁止首尾空白 |

## 3. LoginStateId

**校验对象**：`$defs/LoginStateId`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"lgs_3c7e11"` | 通过 | [S-9](contract.md#s-9-loginstateid)：满足「彼此可分辨」的最小形状 |
| `""` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值) |
| `true` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：交换表示是字符串 |

## 4. 登录标识 · Login Identifier

**校验对象**：`$defs/LoginIdentifier`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"ada@example.invalid"` | 通过 | [S-2](contract.md#s-2-登录标识不是-accountid)：[它是对外的名字](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)，形状上不限定是否邮箱 |
| `"ada"` | 通过 | [S-2](contract.md#s-2-登录标识不是-accountid) |
| `""` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值) |
| `" ada@example.invalid"` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：禁止首尾空白 |

> **Schema 拦不住的那一半**：一个合法的登录标识被**当作 AccountId 存进持久记录**，形状上完全通过，
> 却违反 [S-2](contract.md#s-2-登录标识不是-accountid)。这一条只能由[静态检查](../verification.md#静态检查义务)拒绝。

## 5. OrganizationKind

**校验对象**：`$defs/OrganizationKind`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"personal"` | 通过 | [S-4](contract.md#s-4-organizationkind) |
| `"team"` | 通过 | [S-4](contract.md#s-4-organizationkind) |
| `"Personal"` | 拒绝 | [S-32](contract.md#s-32-判别式集合闭合)：枚举区分大小写，不做「最接近」映射 |
| `"individual"` | 拒绝 | [S-32](contract.md#s-32-判别式集合闭合)：未知取值一律拒绝，不当作缺省 |
| `"personal-with-invite"` | 拒绝 | [S-4](contract.md#s-4-organizationkind)：「可邀请」不是 kind 的变体，personal 的不可邀请是结构性禁止 |
| `null` | 拒绝 | [S-32](contract.md#s-32-判别式集合闭合)：没有「未定的变体」 |
| `{"kind": "personal", "invitable": false}` | 拒绝 | [S-4](contract.md#s-4-organizationkind)：`invitable` 是从 `personal` 推出来的，不另立标志位 |

## 6. TenantRole

**校验对象**：`$defs/TenantRole`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"superAdministrator"` | 通过 | [S-8](contract.md#s-8-tenantrole) |
| `"member"` | 通过 | [S-8](contract.md#s-8-tenantrole) |
| `"super_administrator"` | 拒绝 | [S-8](contract.md#s-8-tenantrole)：正式取值是 `superAdministrator`；另一种拼写会让同一个角色在两处对不上 |
| `"owner"` | 拒绝 | [S-8](contract.md#s-8-tenantrole)：本版恰两个取值 |
| `"admin"` | 拒绝 | [S-8](contract.md#s-8-tenantrole)：只读、审核一类中间角色本版不设 |
| `["superAdministrator", "member"]` | 拒绝 | [S-8](contract.md#s-8-tenantrole)：单值，不是集合——一个租户在其组织内只持一个 |
| `null` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：不存在「没有角色的成员」，无角色由 `ineffective` 表达 |

## 7. TenantId

**校验对象**：`$defs/TenantId`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"organization": "org_kf22", "account": "acc_7f3c91"}` | 通过 | [S-5](contract.md#s-5-tenantid-的构成与相等)、[S-7](contract.md#s-7-tenantid-的规范序列化形式) |
| `{"account": "acc_7f3c91", "organization": "org_kf22"}` | 通过 | [S-7](contract.md#s-7-tenantid-的规范序列化形式)：成员顺序不参与判定，与上一行**是同一个值** |
| `{"organization": "org_kf22"}` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值)：两个分量均必需，**不得用「当前登录账号」补齐**——不完整的身份不是「部分身份」 |
| `{"account": "acc_7f3c91"}` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值)：同上，**不得用「当前组织」补齐** |
| `{"organization": "org_kf22", "account": ""}` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值)：空串分量 |
| `{"organization": "org_kf22", "account": null}` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值)：`null` 分量 |
| `{"organization": " org_kf22 ", "account": "acc_7f3c91"}` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：分量禁止首尾空白 |
| `{"organization": "org_kf22", "account": "acc_7f3c91", "role": "member"}` | 拒绝 | [S-5](contract.md#s-5-tenantid-的构成与相等)：角色不进身份；[S-7](contract.md#s-7-tenantid-的规范序列化形式)：不得有附加成员 |
| `{"organization": "org_kf22", "account": "acc_7f3c91", "standing": "effective"}` | 拒绝 | [S-5](contract.md#s-5-tenantid-的构成与相等)：成员资格不是身份的分量 |
| `{"organization": "org_kf22", "account": "acc_7f3c91", "active": true}` | 拒绝 | [S-5](contract.md#s-5-tenantid-的构成与相等)：「此刻有没有效」是 [MembershipStanding](contract.md#s-10-membershipstanding)，不是身份 |
| `"org_kf22:acc_7f3c91"` | 拒绝 | [S-7](contract.md#s-7-tenantid-的规范序列化形式)：规范形式只有一种（记录）。**本版没有标量形式**，见 [G-05](contract.md#十已知缺口) |
| `{"tenantId": "tnt_0099"}` | 拒绝 | [S-5](contract.md#s-5-tenantid-的构成与相等)：不另铸标识 |

**结构相等的三个用例**（相等判定，不是 Schema 校验，机检不覆盖）：

| A | B | 相等？ | 依据 |
|---|---|---|---|
| `{"organization":"org_kf22","account":"acc_7f3c91"}` | `{"account":"acc_7f3c91","organization":"org_kf22"}` | **是** | [S-5](contract.md#s-5-tenantid-的构成与相等) 按分量相等，[S-7](contract.md#s-7-tenantid-的规范序列化形式) 按成员名匹配 |
| `{"organization":"org_kf22","account":"acc_7f3c91"}` | `{"organization":"org_kf22","account":"ACC_7F3C91"}` | **否** | [S-31](contract.md#s-31-不透明标识的交换表示)：逐码点精确相等，不折叠大小写 |
| 解除成员关系**前**的 `{"organization":"org_kf22","account":"acc_7f3c91"}` | 重新加入**后**的同一对 | **是** | [S-5](contract.md#s-5-tenantid-的构成与相等)、[S-6](contract.md#s-6-tenantid-无生灭路径)：回来的是同一个租户 |

## 8. MembershipStanding

**校验对象**：`$defs/MembershipStanding`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"standing": "effective", "role": "superAdministrator"}` | 通过 | [S-10](contract.md#s-10-membershipstanding)：`effective` 必带角色 |
| `{"standing": "effective", "role": "member"}` | 通过 | [S-10](contract.md#s-10-membershipstanding) |
| `{"standing": "ineffective"}` | 通过 | [S-10](contract.md#s-10-membershipstanding)：从未建立，或已被解除 |
| `{"standing": "effective"}` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：没有「有效但角色未知」——不带角色的 `effective` 无法用于任何准入判定 |
| `{"standing": "ineffective", "role": "member"}` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：带角色的「无效」会被下游读成有效 |
| `{"standing": "unavailable"}` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：**「读不到」不是效力的第三个取值**——它是读面的失败，见下一节 |
| `{"standing": "unknown"}` | 拒绝 | [S-32](contract.md#s-32-判别式集合闭合)：闭合枚举遇未知取值一律拒绝，**不得降级为 `ineffective`** |
| `{"standing": "invalid"}` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：正式取值是 `ineffective`，另一种拼写会让同一件事在两处对不上 |
| `{"standing": "ineffective", "reason": "storage down"}` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：把一次「读不到」表达成了一次效力判定，正是 [S-19](contract.md#s-19-不可用即明确失败) 要挡住的折叠 |
| `{"standing": "error", "message": "db down"}` | 拒绝 | [S-32](contract.md#s-32-判别式集合闭合)：自造取值等于让每个消费者各判一套 |
| `true` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：不得压成布尔——压成布尔就必然把读面的失败折进某一侧 |
| `false` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：同上 |
| `null` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：失败不是「空」；空值会被下游按「没有」处理而放行或静默回退 |

## 9. MembershipStandingResult

**校验对象**：`$defs/MembershipStandingResult`

成员资格判定的结果：**要么是一个效力值，要么以「不可用」失败**。两支形状互斥，消费者分不掉。读面 `capability.organization-governance/v1#S-26` 的返回是闭合和 `invalidInput | MembershipStandingResult`，本类型只是右项。

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"standing": "effective", "role": "member"}` | 通过 | [S-10](contract.md#s-10-membershipstanding)：判出来了，效力有效 |
| `{"standing": "ineffective"}` | 通过 | [S-10](contract.md#s-10-membershipstanding)：判出来了，效力无效 |
| `{"failure": "unavailable"}` | 通过 | [S-10](contract.md#s-10-membershipstanding)：**这一次判不出来**。消费者据 [S-19](contract.md#s-19-不可用即明确失败) 明确失败，不得视作 `ineffective` |
| `{"standing": "unavailable"}` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：失败不是一个 `standing` 取值——写成这样就又能被一次 `switch` 折进效力那一侧 |
| `{"failure": "unavailable", "standing": "ineffective"}` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：两支互斥，**不得同时给**——那等于把失败读成了一个已做出的判定 |
| `{"failure": "timeout"}` | 拒绝 | [S-32](contract.md#s-32-判别式集合闭合)：失败取值闭合，**刻意不带原因**——带上原因会诱使消费者按原因分支，而唯一正确的消费方式是失败 |
| `{"failure": "unavailable", "reason": "storage down"}` | 拒绝 | 同上：额外字段同样被拒 |
| `null` | 拒绝 | [S-10](contract.md#s-10-membershipstanding)：空值会被下游按「没有」处理而放行或静默回退 |

## 10. ScopeLayerIdentity

**校验对象**：`$defs/ScopeLayerIdentity`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"layer": "organization", "organization": "org_kf22"}` | 通过 | [S-11](contract.md#s-11-scopelayeridentity)：组织级 |
| `{"layer": "tenant", "tenant": {"organization": "org_kf22", "account": "acc_7f3c91"}}` | 通过 | [S-11](contract.md#s-11-scopelayeridentity)：租户级 |
| `{"layer": "session", "session": "ses_41"}` | 拒绝 | [S-11](contract.md#s-11-scopelayeridentity)：这一格由那个会话充当（词条已定），但它的**标识表示**是缺口 [G-01](contract.md#十已知缺口)，**Schema 拒绝它而不是给一个占位值** |
| `{"layer": "session"}` | 拒绝 | [S-11](contract.md#s-11-scopelayeridentity)：去掉载荷也构造不出来——缺的是「用什么标识表示它」 |
| `{"layer": "factoryDefault"}` | 拒绝 | [S-11](contract.md#s-11-scopelayeridentity)：出厂默认那一格由系统充当，**没有一个身份对象占它**；不得铸一个「平台租户」 |
| `{"layer": "workspace", "path": "/srv/proj"}` | 拒绝 | [S-11](contract.md#s-11-scopelayeridentity)：工作区不是一重身份；[S-34](contract.md#s-34-语义身份与实现地址分开)：路径是地址，更不是身份 |
| `{"layer": "account", "account": "acc_7f3c91"}` | 拒绝 | [S-11](contract.md#s-11-scopelayeridentity)：账号不充当任何一格，它的求值是恒等的 |
| `{"layer": "tenant", "organization": "org_kf22"}` | 拒绝 | [S-11](contract.md#s-11-scopelayeridentity)：租户级携带的是完整的 TenantId |
| `{"layer": "organization", "organization": "org_kf22", "parent": "org_g1"}` | 拒绝 | [S-11](contract.md#s-11-scopelayeridentity)：上级组织不进这两层 |
| `{"layer": "tenant", "tenant": {"organization": "org_kf22", "account": "acc_7f3c91", "role": "member"}}` | 拒绝 | [S-5](contract.md#s-5-tenantid-的构成与相等)：载荷里的 TenantId 同样不含角色 |

## 11. HandoffWarrant

**校验对象**：`$defs/HandoffWarrant`

[交接凭证](contract.md#s-35-交接凭证-handoff-warrant)**不是身份值**，但它的交换表示与不透明标识同形，
所以这一节的正反实例与第 1 节同形——**这正是要演示的事**：
Schema 在这里只拦得住形状，**六条性质一条也拦不住**。

| 实例 | 预期 | 依据 |
|---|---|---|
| `"whf_2a91c07e"` | 通过 | [S-35](contract.md#s-35-交接凭证-handoff-warrant) 性质 1：非空字符串即可，形状不承诺更多 |
| `"w"` | 通过 | [S-31](contract.md#s-31-不透明标识的交换表示) 同形：最短的合法值就是一个非空白码点 |
| `""` | 拒绝 | [S-12](contract.md#s-12-缺席与空值都不是身份值)：空串不是一份凭证 |
| `null` | 拒绝 | [S-35](contract.md#s-35-交接凭证-handoff-warrant)：缺席的凭证按[核实不过](contract.md#九缺席与恢复)收场，**不是**一个合法取值 |
| `"whf_2a91c07e\n"` | 拒绝 | [S-31](contract.md#s-31-不透明标识的交换表示)：与标识同一个空白集合、同一个绝对结尾断言 |
| `{"account": "acc_7f3c91", "nonce": "2a91c07e"}` | 拒绝 | [S-35](contract.md#s-35-交接凭证-handoff-warrant) 性质 1：**不透明**。绑定字段的形状归 realization，**Schema 刻意不给结构**——给了结构就等于邀请核实方去解析它 |

> **这一节的「通过」尤其不代表任何东西。**
> `"whf_2a91c07e"` 通过，只说明它是个合法字符串；
> 它是不是**由产出方签发**、是不是**绑定这个 AccountId**，
> Schema 一件也判不出来——[六条性质](contract.md#六条性质)全在 Schema 之外。
> **一份自己编的字符串在这一关与一份真凭证完全无从分辨**，
> 这正是 [S-35](contract.md#它是一条契约承诺不是一层安全机制)
> 把「不可伪造」写成**契约承诺**而不是留给实现自由发挥的原因。

## 12. Schema 挡不住、但同样非法的

**本节不参与机检**——没有「校验对象」。它们形状上一概合法，
只能由[静态检查](../verification.md#静态检查义务)或[消费者核对场景](contract.md#消费者核对场景)拒绝。
列在这里，是为了让[「校验通过不表示条款成立」](contract.md#s-33-表示层校验与判定分开)有具体例子，
而不是一句免责声明。

| 做了什么 | 违反 |
|---|---|
| 用 Cordis 的 `Fiber.uid` 充当 AccountId | [S-1](contract.md#s-1-accountid)：不来自运行时对象 |
| 把登录标识当作 AccountId 存进持久记录 | [S-2](contract.md#s-2-登录标识不是-accountid) |
| 比较两个标识时先做大小写折叠或 Unicode 规范化 | [S-31](contract.md#s-31-不透明标识的交换表示)：逐码点精确相等 |
| 从 `org_` 前缀推断这是个组织、按前缀分组统计 | [S-1](contract.md#s-1-accountid)/[S-3](contract.md#s-3-organizationid)：不透明，不得解析 |
| 实现一条「租户被删除」的清理路径 | [S-6](contract.md#s-6-tenantid-无生灭路径) |
| 解除成员关系时把持有记录的 TenantId 置空 | [S-26](contract.md#s-26-成员无效使租户级持有不可达但不销毁) |
| 把读面的「不可用」失败当作 `ineffective` 拒绝掉 | [S-19](contract.md#s-19-不可用即明确失败)：那是**失败**，不是「你不是成员」 |
| 遇到「不可用」回退到个人范围，或返回空集 | [S-19](contract.md#s-19-不可用即明确失败) |
| 拿一份**说不出失效条件**的缓存代替现读 | [S-27](contract.md#s-27-每道准入现读) |
| 判定函数的入参里含 `cwd`、`process.getuid()` 或存储路径 | [S-21](contract.md#s-21-判定依据的构成封闭) |
| 账号记录的类型里出现 `linkedAccounts` / `primaryAccountId` | [S-24](contract.md#s-24-账号记录不含跨账号关联字段) |
| 某张层事实表的主键里含 AccountId 或 LoginStateId | [S-29](contract.md#s-29-层事实只以显式身份值为键) |
| 某访问函数的身份参数带默认值，或在函数体内现取当前租户身份 | [S-17](contract.md#s-17-身份参数没有默认值)、[S-28](contract.md#s-28-当前租户身份在创建那一刻捕获) |
| 把 TenantId 编码成标量后，解析它取回分量来作判定 | [S-7](contract.md#s-7-tenantid-的规范序列化形式)、[S-34](contract.md#s-34-语义身份与实现地址分开) |

## 13. 隔离义务的规范场景

**本节不参与机检**，也不是 Schema 的范围。它是 [S-16～S-30](contract.md#五隔离义务) 的验收面；
**各场景尚未执行**，状态与证据归[验证入口](../verification.md)。

**编号 `IS-1`～`IS-10`（Isolation Scenario），本节是它们的唯一定义处。**
**不要与 [`contract.md` 第八节](contract.md#消费者核对场景)的 `CS-1`～`CS-10` 混读**：
那一组是**消费者路径的走查**（某个 owner 照着本契约能不能把事办成），
本节这一组是**隔离义务的演练脚本**（怎么做、通过判据是什么）。
**两组证据不互相顶替**，各自登记在[验证入口](../verification.md#证据义务)。

| # | 场景 | 怎么做 | 通过判据 |
|---|---|---|---|
| **IS-1** | **六路径同判**（[S-20](contract.md#s-20-六条路径同一判定)） | 取一个租户级对象，用另一个租户的身份分别走**读、写、覆盖、删除、订阅、清理**六条路径 | **六条全部被拒**。只要有一条通过（特别是订阅与后台清理），S-20 不成立 |
| **IS-2** | **缺席即拒绝**（[S-18](contract.md#s-18-缺席即拒绝)） | 构造一次**不带身份**的调用，**在身份的输入位置**上 | **失败**。返回空集合、返回默认范围的结果、或成功，均为反例。**合法缺席不算反例**：official 资产的作者字段缺席不是输入位置，见 [S-12](contract.md#s-12-缺席与空值都不是身份值) |
| **IS-3** | **物理位置不构成资格**（[S-22](contract.md#s-22-路径是地址不是钥匙)） | 同一宿主机、同一 OS 用户，以租户 A 挂目录 D 建立持有，再以租户 B 挂同一个 D | B **看不到** A 在 D 上的资产与配值；两边是两份工作区 |
| **IS-4** | **不可用不回退**（[S-19](contract.md#s-19-不可用即明确失败)） | 把成员资格依据置为不可读，再发起一次受租户约束的操作 | **明确失败**，且与「真的无效」是不同的结果值（读面给的是 `{"failure": "unavailable"}`，不是一个效力值）。成功并返回个人范围的东西，是最危险的那个反例 |
| **IS-5** | **不可达不销毁**（[S-26](contract.md#s-26-成员无效使租户级持有不可达但不销毁)） | 解除成员关系，检查持有记录，再重新加入 | 解除**没有触发任何删除、迁移或改键**；重新加入后原样可用，**不需要一次恢复动作** |
| **IS-6** | **现读**（[S-27](contract.md#s-27-每道准入现读)） | 解除成员关系，立即发起下一道准入 | **被拒**。放行即说明某处拿旧结论当授权 |
| **IS-7** | **创建那一刻捕获**（[S-28](contract.md#s-28-当前租户身份在创建那一刻捕获)） | 在租户 T1 下创建一个会话，切换当前租户身份到 T2，复核该会话的归属与计量 | **仍然是 T1**。跟着变即反例 |
| **IS-8** | **无跨账号通路**（[S-24](contract.md#s-24-账号记录不含跨账号关联字段)） | 检查账号记录的字段集合 | **不存在**指向另一个账号的字段或「同一人」标记 |
| **IS-9** | **不冒充隔离**（[S-23](contract.md#s-23-不得冒充隔离)） | 对每个声称隔离的接口问「判定在哪一行」，再把那层 isolate 标签、过滤器或前缀**去掉**重跑 | **逐个答得出实施位置**，且去掉之后同一次调用**仍不返回跨租户数据**。答不出或返回了，按未隔离处理 |
| **IS-10** | **跨边界重验**（[S-30](contract.md#s-30-跨边界须重新验证)） | 构造一条只带 TenantId、不带授权依据的消息投给接收边界 | **被拒**。直接按该租户执行即反例。**单机装配下这条不会被触发**，须在跨进程演化时补做 |

> **归属身份的持久形状**（[S-16](contract.md#s-16-按归属层显式携带身份值)）在这十条里**没有独立演练**：
> 它是一次**形状核对**，不是一次运行时演练——检查对象的持久形状里存的是不是
> 一个带判别式的 `ScopeLayerIdentity`，而不是两个可空的身份列。
> 它归[静态检查](../verification.md#静态检查义务)，**不在本表**。
