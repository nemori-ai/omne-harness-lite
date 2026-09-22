# 规范实例：合法与非法

属于 `data.identity-values` v1 的规范场景。每组给出**合法实例**与**非法实例**，
非法的一律注明**被哪一条挡住**。示例里的标识串只是占位——
**具体词法未定**（[缺口 G-ID-LEXICAL](contract.md#十已知缺口)），实例不得被读成对词法的承诺。

## 1. AccountId / OrganizationId / LoginStateId（S-1、S-3、S-11）

**合法**

```json
"acc_7f3c91"
"01J9Q0ZK4M7Q2S"
"a"
```

**非法**

| 实例 | 被哪一条挡住 |
|---|---|
| `""` | S-1：非空 |
| `null` | S-1：类型是字符串 |
| `{ "value": "acc_7f3c91" }` | S-1：标识是标量，不是记录 |
| `12345` | S-1：类型是字符串 |

**不是 Schema 能挡住、但同样非法的**（由静态检查与提供者设计承担）：

- 用 Cordis 的 `Fiber.uid` 充当 AccountId ——违反 S-1「不来自运行时」；
- 把登录标识当作 AccountId 存进持久记录 ——违反 S-2；
- 比较时先做大小写折叠 ——违反 S-1 的「按字节精确相等」。

## 2. OrganizationKind（S-4、S-5）

**合法**：`"personal"` · `"team"`

**非法**

| 实例 | 被哪一条挡住 |
|---|---|
| `"Personal"` | S-4：枚举值区分大小写，恰两个取值 |
| `"individual"` | S-4：不在取值域内 |
| `"personal-with-invite"` | S-4/S-5：「可邀请」不是 kind 的变体，personal 的不可邀请是结构性禁止 |

## 3. TenantId（S-6、S-7、S-8、S-9）

**合法**

```json
{ "organization": "org_kf22", "account": "acc_7f3c91" }
```

```json
{ "account": "acc_7f3c91", "organization": "org_kf22" }
```

> 第二个与第一个**是同一个值**：S-9 的规范形式按**成员名**匹配，成员顺序不参与相等判定。

**非法**

| 实例 | 被哪一条挡住 |
|---|---|
| `{ "organization": "org_kf22" }` | S-9：两个成员均必填 |
| `{ "organization": "org_kf22", "account": "" }` | S-1：account 非空 |
| `{ "organization": "org_kf22", "account": "acc_7f3c91", "role": "member" }` | **S-7**：租户身份不含角色；S-9：不得有附加成员 |
| `{ "organization": "org_kf22", "account": "acc_7f3c91", "active": true }` | **S-8/S-12**：「此刻有没有效」不是身份的一部分，它是 MembershipStanding |
| `"org_kf22:acc_7f3c91"` | **S-9**：规范形式只有一种（记录）。标量键编码本版不定义，见缺口 G-TENANT-KEY |
| `{ "tenantId": "tnt_0099" }` | **S-6**：不另铸标识 |

**结构相等的两个用例**

| A | B | 相等？ | 依据 |
|---|---|---|---|
| `{"organization":"org_kf22","account":"acc_7f3c91"}` | `{"account":"acc_7f3c91","organization":"org_kf22"}` | **是** | S-6 结构相等，S-9 按成员名匹配 |
| `{"organization":"org_kf22","account":"acc_7f3c91"}` | `{"organization":"org_kf22","account":"ACC_7F3C91"}` | **否** | S-1 按字节精确相等，不折叠大小写 |
| 解除成员关系**前**的 `{"organization":"org_kf22","account":"acc_7f3c91"}` | 重新加入**后**的同一对 | **是** | **S-8**：回来的是同一个租户 |

## 4. TenantRole（S-10）

**合法**：`"superAdministrator"` · `"member"`

**非法**

| 实例 | 被哪一条挡住 |
|---|---|
| `["superAdministrator", "member"]` | S-10：单值，不是集合 |
| `"owner"` / `"admin"` / `"viewer"` | S-10：本版恰两个取值；只读、审核一类中间角色本版不设 |
| `null` | S-10：不存在「没有角色的成员」，无角色由 MembershipStanding 的 `invalid` 表达 |

## 5. MembershipStanding（S-12）

**合法**

```json
{ "standing": "valid", "role": "superAdministrator" }
```

```json
{ "standing": "invalid" }
```

```json
{ "standing": "unavailable" }
```

**非法**

| 实例 | 被哪一条挡住 | 为什么要紧 |
|---|---|---|
| `{ "standing": "valid" }` | S-12：`valid` 必须携带角色 | 不带角色的 `valid` 无法用于任何准入判定 |
| `{ "standing": "invalid", "role": "member" }` | S-12：`invalid` 必须不携带角色 | 带角色的「无效」会被下游读成有效 |
| `{ "standing": "unavailable", "role": "member" }` | 同上 | 判定都没做出来，哪来的角色 |
| `true` / `false` | S-12：三值不得压成布尔 | 压成布尔就必然把 `unavailable` 折进某一侧 |
| `null` | S-12：`unavailable` 不是「空」 | 空值会被下游按「没有」处理而放行或静默回退 |
| `{ "standing": "error", "message": "db down" }` | S-12：取值域恰三个 | 自造第四个取值等于让每个消费者各判一套 |

**不是 Schema 能挡住、但同样非法的**：

- 把 `unavailable` 当作 `invalid` 拒绝掉 ——违反 S-12/S-22：那是**失败**，不是「你不是成员」；
- 遇到 `unavailable` 就回退到个人范围 ——违反 **S-22**；
- 拿一份**说不出失效条件**的缓存代替现读 ——违反 **S-23**。

## 6. ScopeLayerIdentity（S-13）

**合法**

```json
{ "layer": "organization", "organization": "org_kf22" }
```

```json
{ "layer": "tenant", "tenant": { "organization": "org_kf22", "account": "acc_7f3c91" } }
```

**非法**

| 实例 | 被哪一条挡住 |
|---|---|
| `{ "layer": "session", "session": "ses_41" }` | **S-13**：会话级层身份本版无表示（缺口 G-SESSION-LAYER）。**Schema 拒绝它，而不是给一个占位值** |
| `{ "layer": "factoryDefault" }` | S-13：出厂默认层归系统，没有身份值，不是「身份带来的」那两层之一 |
| `{ "layer": "workspace", "path": "/srv/proj" }` | **S-13 + S-18**：工作区不是一重身份；**路径更不是身份**——它是地址，不是钥匙 |
| `{ "layer": "account", "account": "acc_7f3c91" }` | S-13：账号不占一格，它的求值是恒等的 |
| `{ "layer": "tenant", "organization": "org_kf22" }` | S-13：租户级携带的是完整的 TenantId |
| `{ "layer": "organization", "organization": "org_kf22", "parent": "org_g1" }` | S-13：上级组织不进这两层 |

## 7. 隔离义务的规范场景

Schema 管不到这些，**它们是 S-14～S-26 的验收面**。各场景**尚未执行**。

| 场景 | 怎么做 | 通过判据 |
|---|---|---|
| **六路径同判**（S-16） | 取一个租户级对象，用另一个租户的身份分别走**读、写、覆盖、删除、订阅、清理**六条路径 | **六条全部被拒**。只要有一条通过（特别是订阅与后台清理），S-16 不成立 |
| **缺席即拒绝**（S-15） | 构造一次**不带身份**的调用 | **失败**。返回空集合、返回默认范围的结果、或成功，均为反例 |
| **物理位置不构成资格**（S-18） | 同一宿主机、同一 OS 用户，以租户 A 挂目录 D 建立持有，再以租户 B 挂同一个 D | B **看不到** A 在 D 上的资产与配值；两边是两份工作区 |
| **不可用不回退**（S-22） | 把成员资格依据置为不可读，再发起一次受租户约束的操作 | **明确失败**。成功并返回个人范围的东西，是最危险的那个反例 |
| **现读**（S-23） | 解除成员关系，立即发起下一道准入 | **被拒**。放行即说明某处拿旧结论当授权 |
| **创建那一刻捕获**（S-24） | 在租户 T1 下创建一个会话，切换当前租户身份到 T2，复核该会话的归属与计费 | **仍然是 T1**。跟着变即反例 |
| **无跨账号通路**（S-20） | 检查账号记录的字段集合 | **不存在**指向另一个账号的字段或「同一人」标记 |
| **不冒充隔离**（S-19） | 对每个声称隔离的接口问「判定在哪一行」 | **逐个答得出实施位置**。答不出的，按未隔离处理 |
