# 规范实例：合法与非法

属于 `composition.governance-center-entry` v1（候选）的规范实例，是本版的规范工件之一：
[`governance-center-entry.schema.json`](governance-center-entry.schema.json) 的每个定义项在这里各有一组正反实例。

**怎么读这张表**：每节开头的「校验对象」给出该节实例要拿去求值的 `$defs`；每张表第一列是实例（JSON 内联代码），
第二列是 **Schema 这一关**的预期（`通过`／`拒绝`），第三列是依据条款。这个格式也是机检格式——
[验证入口](../verification.md#实际执行)记录的自检逐节按「校验对象」把第一列喂给校验器、拿第二列比对，不另抄一份清单。

**三条读法上的边界：**

- **`通过` 只说形状合规。**判定次序、身份推导、补授权、映射、逐字相同都不在 Schema 的能力范围内；它们的证据在[形式工件](formal/README.md)与[验证入口](../verification.md)。
- **信封「拒绝」不等于 `invalid-input`。**不合形状时答哪一种，由 [S-10](contract.md#s-10-判定次序) 按不合的是哪个成员决定；信封一节多给一列「线上答复」。
- **标识串只是占位。**`LoginStateId` 的具体词法归 `data.identity-values` v1，示例里的 `lgs_` 前缀不承诺任何规则；
  `GovernanceCenterId` 与列表句柄的十六进制表示是本契约的定名（[S-27](contract.md#s-27-governancecenterid-的形状与相等)、[S-9](contract.md#s-9-列表句柄)）。

## 1. GovernanceCenterId

**校验对象**：`$defs/GovernanceCenterId`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60"` | 通过 | [S-27](contract.md#s-27-governancecenterid-的形状与相等)：32 个小写十六进制字符 |
| `"00000000000000000000000000000000"` | 通过 | S-27：形状只管表示；全零是否会被铸出归随机数，不归形状 |
| `"3F9C1E0A7B2D4C6E8F0A1B2C3D4E5F60"` | 拒绝 | S-27：大写不是规范形式，相等不做大小写折叠 |
| `"3f9c1e0a-7b2d-4c6e-8f0a-1b2c3d4e5f60"` | 拒绝 | S-27：带分隔符不是规范形式 |
| `"3f9c1e0a7b2d4c6e"` | 拒绝 | S-27：不足 128 位 |
| `"3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60 "` | 拒绝 | S-27：带空白不是合法值 |
| `""` | 拒绝 | S-27 |

## 2. 列表句柄

**校验对象**：`$defs/LoginStateHandle`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b"` | 通过 | [S-9](contract.md#s-9-列表句柄)：64 个小写十六进制字符 |
| `"lgs_3c7e11"` | 拒绝 | S-9：一个 `LoginStateId` 不是句柄；反过来，句柄当出示物用在第 ② 步被判「从没签发过」 |
| `"9B1D5E0F3A7C2B4D6E8F0A1C3E5B7D9F1A3C5E7B9D1F3A5C7E9B1D3F5A7C9E1B"` | 拒绝 | S-9：比较逐字符，大写不是交换表示 |
| `"9b1d5e0f"` | 拒绝 | S-9：长度不对 |

## 3. 请求信封

**校验对象**：`$defs/Envelope`

| 实例 | 预期 | 依据 | 线上答复（[S-10](contract.md#s-10-判定次序)） |
|---|---|---|---|
| `{"protocolVersion": "1", "presentedLoginState": "lgs_3c7e11", "operation": "capability.organization-governance/v1#S-27", "payload": {}}` | 通过 | [S-4](contract.md#s-4-请求信封)：四个成员；没有载荷项时是空对象 | 往下走第 ② 步 |
| `{"protocolVersion": "1", "operation": "capability.account-identity/v1#S-15", "payload": {"loginIdentifier": "ada@example.invalid", "credential": "correct horse battery staple"}}` | 通过 | S-4：出示物可以缺席；登录不看它 | 往下走第 ③ 步 |
| `{"protocolVersion": "1", "operation": "capability.account-identity/v1#S-15", "payload": {}}` | 拒绝 | S-4、[S-17](contract.md#s-17-路由表封闭每条路由的九件事从哪读)：载荷按 `operation` 判别到登录的载荷，缺登录标识与凭据 | `invalid-input`（免认人路由，不用查就判） |
| `{"protocolVersion": "1", "presentedLoginState": "lgs_3c7e11", "operation": "capability.organization-governance/v1#S-22", "payload": {"organization": "org_kf22", "tenant": {"organization": "org_kf22", "account": "acc_7f3c91"}}}` | 拒绝 | S-17：载荷成员封闭，多了一个 | 认出人之后 `invalid-input`；已撤销的出示物 ⇒ `login-state-rejected` |
| `{"protocolVersion": "1", "operation": "capability.organization-governance/v1#S-27", "payload": {}}` | 通过 | S-4：形状上出示物可缺席 | `login-state-rejected`（[S-11](contract.md#s-11-认人)：没带，不用查） |
| `{"presentedLoginState": "lgs_3c7e11", "operation": "capability.organization-governance/v1#S-27", "payload": {}}` | 拒绝 | S-4：缺 `protocolVersion` | `version-mismatch`（[S-10](contract.md#s-10-判定次序) ①，出示物一眼都不看） |
| `{"protocolVersion": "", "operation": "capability.organization-governance/v1#S-27", "payload": {}}` | 拒绝 | [S-8](contract.md#s-8-协议版本与跨版本不变的两样) | `version-mismatch` |
| `{"protocolVersion": "1", "presentedLoginState": "lgs_3c7e11", "operation": "capability.account-identity/v1#S-17", "payload": {}}` | 拒绝 | [S-24](contract.md#s-24-有意不投影)：S-17 不作为一条路由 | `invalid-input`（①′） |
| `{"protocolVersion": "1", "presentedLoginState": "lgs_3c7e11", "operation": "capability.organization-governance/v1#S-53", "payload": {}}` | 拒绝 | S-24：清除个人组织没有路由 | `invalid-input`（①′） |
| `{"protocolVersion": "1", "presentedLoginState": "lgs_3c7e11", "operation": "capability.account-identity/v1#S-18", "payload": {}}` | 拒绝 | S-24：读账号没有路由 | `invalid-input`（①′） |
| `{"protocolVersion": "1", "presentedLoginState": "lgs_3c7e11", "operation": "capability.organization-governance/v1#S-23", "payload": {}, "actingTenant": {"organization": "org_kf22", "account": "acc_7f3c91"}}` | 拒绝 | S-4：表外成员；[S-12](contract.md#s-12-身份推导)：本版没有「以哪个租户身份行事」这一格 | `invalid-input`（①′）——表示层收场，**不是**对 [G-2](contract.md#十三已知缺口) 的回答 |
| `{"protocolVersion": "1", "presentedLoginState": "lgs_3c7e11", "operation": "capability.organization-governance/v1#S-27", "payload": {}, "requestedAt": "2026-09-23T10:00:00Z"}` | 拒绝 | S-4：时间不进信封 | `invalid-input`（①′） |
| `{"protocolVersion": "1", "presentedLoginState": ["lgs_3c7e11", "lgs_9a0b22"], "operation": "capability.organization-governance/v1#S-27", "payload": {}}` | 拒绝 | [S-5](contract.md#s-5-出示物)：恰好一个 | `login-state-rejected`（多个，不用查） |
| `{"protocolVersion": "1", "presentedLoginState": "", "operation": "capability.organization-governance/v1#S-27", "payload": {}}` | 拒绝 | S-5：表示层不合格的出示物 | `login-state-rejected`（出示物是身份，不是输入） |
| `{"protocolVersion": "1", "presentedLoginState": "", "operation": "capability.account-identity/v1#S-15", "payload": {}}` | 拒绝 | S-5 | 登录不看出示物：按载荷判（[S-19](contract.md#s-19-免认人的两条路由注册登录)） |
| `{"protocolVersion": "1", "presentedLoginState": "lgs_3c7e11", "operation": "capability.organization-governance/v1#S-27"}` | 拒绝 | S-4：`payload` 必需 | 属于「载荷」那一步，认出人之后才看：登录状态有效 ⇒ `invalid-input`；已撤销 ⇒ `login-state-rejected` |
| `{"protocolVersion": "1", "presentedLoginState": "lgs_3c7e11", "operation": "capability.organization-governance/v1#S-27", "payload": null}` | 拒绝 | S-4：`payload` 是对象 | 同上 |

## 4. 公开体检的请求

**校验对象**：`$defs/PublicHealthRequest`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"operation": "composition.governance-center-entry/v1#S-18"}` | 通过 | [S-18](contract.md#s-18-公开体检) |
| `{"operation": "composition.governance-center-entry/v1#S-18", "protocolVersion": "0-obsolete", "presentedLoginState": "lgs_3c7e11"}` | 通过 | S-18：其余成员一律忽略——版本对不上照样读得到，带的登录状态不被看 |
| `{"operation": "capability.organization-governance/v1#S-27"}` | 拒绝 | S-18：不是公开体检 |
| `{}` | 拒绝 | S-18 |

## 5. 四种入口答复

**校验对象**：`$defs/EntryAnswer`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"version-mismatch"` | 通过 | [S-6](contract.md#s-6-四种入口答复) |
| `"login-state-rejected"` | 通过 | S-6 |
| `"unavailable"` | 通过 | S-6 |
| `"invalid-input"` | 通过 | S-6 |
| `"not-authorized"` | 拒绝 | [S-7](contract.md#s-7-答复集合闭合)：四值封闭；AI S-16 的 `not-authorized` 在线上映射成 `login-state-rejected`（[S-14](contract.md#s-14-失败映射)） |
| `"storage-unavailable"` | 拒绝 | S-14：映射成 `unavailable`，不原样上线 |
| `"unauthorized"` | 拒绝 | S-7：没有第五个值 |

## 6. 路由结果：具名失败

**校验对象**：`$defs/RouteFailure`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"failure": "notAuthorized"}` | 通过 | [S-13](contract.md#s-13-补授权)：补授权不过；[S-22](contract.md#s-22-组织治理读路由与补授权) |
| `{"failure": "interrupted"}` | 通过 | [S-19](contract.md#s-19-免认人的两条路由注册登录)：注册的 `interrupted` 原样呈现，不改写成 `unavailable` |
| `{"failure": "login-state-not-found"}` | 通过 | [S-20](contract.md#s-20-登录状态的两条路由撤销列出)：句柄匹配不到 |
| `{"failure": "identifier-or-credential-rejected"}` | 通过 | S-19：三种登录失败逐字相同 |
| `{"failure": "notOwnTenant"}` | 通过 | [S-23](contract.md#s-23-当前租户身份的两条路由) |
| `{"failure": "identifier-held-by-expired-record"}` | 拒绝 | S-19：结构上到不了本组合 |
| `{"failure": "loginStateNotValid"}` | 拒绝 | [S-14](contract.md#s-14-失败映射)：映射成 `login-state-rejected` |
| `{"failure": "unavailable"}` | 拒绝 | S-14：判不了是入口答复，不是一个路由结果 |
| `{"failure": "invalidInput"}` | 拒绝 | S-14：表示层不合格是入口答复 `invalid-input` |
| `{"failure": "organizationIsNotPersonal"}` | 拒绝 | [S-24](contract.md#s-24-有意不投影)：S-53 不投影，它的失败值不上线 |
| `{"failure": "notAuthorized", "reason": "not a member"}` | 拒绝 | S-14：不加原因 |

## 7. 路由结果：成功

**校验对象**：`$defs/RouteSuccess`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"result": "registered"}` | 通过 | [S-19](contract.md#s-19-免认人的两条路由注册登录) |
| `{"result": "ok"}` | 通过 | [S-20](contract.md#s-20-登录状态的两条路由撤销列出)、[S-21](contract.md#s-21-组织治理写路由) |
| `{"result": {"organization": "org_kf22", "account": "acc_7f3c91"}}` | 通过 | [S-23](contract.md#s-23-当前租户身份的两条路由)：当前租户身份查询返回一个 `TenantId`，按 `data.identity-values` v1 的规范形式原样给出（[S-17](contract.md#s-17-路由表封闭每条路由的九件事从哪读) 的成员名规则） |
| `{"result": "ok", "failure": "notAuthorized"}` | 拒绝 | [S-7](contract.md#s-7-答复集合闭合)：一个答复只属于一类 |
| `{}` | 拒绝 | S-7 |

## 8. 客户端一面的答复

**校验对象**：`$defs/ClientFaceReply`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"login-state-rejected"` | 通过 | [S-7](contract.md#s-7-答复集合闭合)：入口答复 |
| `{"result": "ok"}` | 通过 | S-7：路由成功 |
| `{"failure": "wouldFormACycle"}` | 通过 | S-7：路由具名失败 |
| `{"error": "unavailable"}` | 拒绝 | S-7：没有第四类 |
| `"ok"` | 拒绝 | S-7：成功必须包在 `result` 里，不与入口答复同形 |

## 9. 公开体检答复

**校验对象**：`$defs/PublicHealthReply`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0"}` | 通过 | [S-18](contract.md#s-18-公开体检)：恰此三样 |
| `{"reachable": false, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0"}` | 拒绝 | S-18：`reachable` 只说中心在应答；不在应答时来者什么都得不到，不是一个答复 |
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "storageReachable": false}` | 拒绝 | S-18：完整体检的项不在公开体检里 |
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "accounts": 12}` | 拒绝 | S-18：不含任何治理事实 |
| `{"reachable": true, "version": "0.1.0"}` | 拒绝 | S-18：标识是那三样之一 |

## 10. 部署参数

**校验对象**：`$defs/DeploymentParameters`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000}` | 通过 | [S-26](contract.md#s-26-完整体检)：五项齐全（数值只是占位，产品不出厂任何数） |
| `{"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000}` | 拒绝 | S-26：五项缺一不可 |
| `{"unactivatedRetention": 0, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000}` | 拒绝 | S-26：一个时长是正数 |
| `{"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000, "creationKeyRetention": 86400000}` | 拒绝 | S-26：技术参数不是部署参数 |

## 11. 完整体检答复

**校验对象**：`$defs/FullHealthReply`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "startedAt": "2026-09-23T08:00:00Z", "storageReachable": false, "deploymentKeyPresent": true, "deploymentKeyComplete": true, "clockSane": true, "defectCount": 0, "deploymentParameters": {"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000}}` | 通过 | [S-26](contract.md#s-26-完整体检)：数据所在够不着时 `storageReachable` 为 `false`，中心仍在应答 |
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "startedAt": "2026-09-23T08:00:00Z", "storageReachable": true, "deploymentKeyPresent": true, "deploymentKeyComplete": true, "clockSane": false, "defectCount": 3, "deploymentParameters": {"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000}}` | 通过 | S-26：本次启动以来记过三次缺陷、钟此刻不可信；两件事各有一项，不合并 |
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "startedAt": "2026-09-23T08:00:00Z", "storageReachable": true, "deploymentKeyPresent": false, "deploymentKeyComplete": true, "clockSane": true, "defectCount": 0, "deploymentParameters": {"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000}}` | 拒绝 | S-26：密钥两项是启动时载入的结果；缺了中心本来起不来 |
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "startedAt": "2026-09-23T08:00:00Z", "storageReachable": true, "deploymentKeyPresent": true, "deploymentKeyComplete": true, "clockSane": true, "defectCount": 0}` | 拒绝 | S-26：部署参数是完整体检的一项 |
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "startedAt": "2026-09-23T08:00:00Z", "storageReachable": true, "deploymentKeyPresent": true, "deploymentKeyComplete": true, "clockSane": true, "deploymentParameters": {"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000}}` | 拒绝 | S-26：`defectCount` 是十项之一，缺了就说不出中心自身出没出过故障 |
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "startedAt": "2026-09-23T08:00:00Z", "storageReachable": true, "deploymentKeyPresent": true, "deploymentKeyComplete": true, "clockSane": true, "defectCount": -1, "deploymentParameters": {"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000}}` | 拒绝 | S-26：`defectCount` 是非负整数 |
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "startedAt": "2026-09-23T08:00:00Z", "storageReachable": true, "deploymentKeyPresent": true, "deploymentKeyComplete": true, "clockSane": true, "defectCount": 0, "deploymentKey": "k-0f9e8d7c", "deploymentParameters": {"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000}}` | 拒绝 | S-26、[S-29](contract.md#s-29-秘密不进任何输出)：恰此十项；夹带部署密钥的值被挡住 |
| `{"reachable": true, "centerId": "3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60", "version": "0.1.0", "startedAt": "2026-09-23T08:00:00Z", "storageReachable": true, "deploymentKeyPresent": true, "deploymentKeyComplete": true, "clockSane": true, "defectCount": 1, "lastDefect": {"route": "capability.organization-governance/v1#S-27"}, "deploymentParameters": {"unactivatedRetention": 604800000, "invitationTtlDefault": 1209600000, "affiliationRequestTtlDefault": 1209600000, "copyNoticeTtlDefault": 604800000, "sharingInvitationTtlDefault": 604800000}}` | 拒绝 | S-26：缺陷的细节只在工程记录里，体检只给计数 |

Schema 挡得住体检里多出的成员；答复与工程记录里的秘密仍由 [S-29](contract.md#s-29-秘密不进任何输出) 与规范场景 [S-46](contract.md#s-46-规范场景输出里搜不到秘密) 守。

## 12. 登录成功的返回

**校验对象**：`$defs/LoginResult`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"loginState": "lgs_3c7e11", "loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b"}` | 通过 | [S-19](contract.md#s-19-免认人的两条路由注册登录)：出示物与它的列表句柄 |
| `{"loginState": "lgs_3c7e11"}` | 拒绝 | S-19：缺句柄，客户端就无从在列表里认出自己、也无从退出 |
| `{"loginStateId": "lgs_3c7e11", "loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b"}` | 拒绝 | S-19：成员名是 `loginState` |
| `{"loginState": "lgs_3c7e11", "loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b", "account": "acc_7f3c91"}` | 拒绝 | S-19：返回恰此两样，不夹带账号 |
| `{"loginState": "", "loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b"}` | 拒绝 | `data.identity-values` v1 S-12：空串不是身份值 |

## 13. 登录状态列表的一项

**校验对象**：`$defs/LoginStateListItem`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b", "issuedAt": "2026-09-23T08:00:00Z"}` | 通过 | [S-20](contract.md#s-20-登录状态的两条路由撤销列出) |
| `{"loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b", "issuedAt": "2026-09-23T08:00:00Z", "loginState": "lgs_3c7e11"}` | 拒绝 | S-20、[S-9](contract.md#s-9-列表句柄)：列表不含 `LoginStateId` |
| `{"loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b"}` | 拒绝 | S-20：每一项都带签发时间 |
| `{"loginStateHandle": "lgs_3c7e11", "issuedAt": "2026-09-23T08:00:00Z"}` | 拒绝 | S-9：一个 `LoginStateId` 不是句柄 |

## 14. 各路由的载荷与成功返回

每条路由两张表：载荷（`Payload_<路由>`）与成功返回（`Result_<路由>`）。成员名与出处见契约 [S-17 的命名表](contract.md#路由的线上成员命名表)。
载荷「拒绝」在线上是 `invalid-input`——经第 ② 步的路由在认出人之后才判（[S-10](contract.md#s-10-判定次序)）。
下文 `T` 这个租户身份写全是 `{"organization": "org_kf22", "account": "acc_7f3c91"}`，只为读着方便，实例里都写全。

### 14.1 注册 `composition.account-registration/v1#S-8`

**校验对象**：`$defs/Payload_AR_S8`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"loginIdentifier": "ada@example.invalid", "credential": "correct horse battery staple"}` | 通过 | 登录标识、凭据材料 |
| `{"loginIdentifier": "ada@example.invalid"}` | 拒绝 | 凭据材料必需 |
| `{"loginIdentifier": " ada@example.invalid", "credential": "correct horse battery staple"}` | 拒绝 | `data.identity-values` v1 S-31：标识禁止首尾空白 |

**校验对象**：`$defs/Result_AR_S8`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"registered"` | 通过 | 该组合 S-4、S-5 |
| `"interrupted"` | 拒绝 | 另三个终结结果走 `{ failure }`，不是成功返回（[S-19](contract.md#s-19-免认人的两条路由注册登录)） |

### 14.2 登录 `capability.account-identity/v1#S-15`

**校验对象**：`$defs/Payload_AI_S15`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"loginIdentifier": "ada@example.invalid", "credential": "correct horse battery staple"}` | 通过 | ① 登录标识、凭据材料 |
| `{"loginIdentifier": "ada@example.invalid", "credential": "correct horse battery staple", "rememberMe": true}` | 拒绝 | 成员封闭 |

**校验对象**：`$defs/Result_AI_S15`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"loginState": "lgs_3c7e11", "loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b"}` | 通过 | S-19 |
| `"lgs_3c7e11"` | 拒绝 | 返回是出示物连同它的句柄，不是一个裸的 `LoginStateId` |

### 14.3 撤销 `capability.account-identity/v1#S-16`

**校验对象**：`$defs/Payload_AI_S16`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b"}` | 通过 | 目标经句柄指认（[S-20](contract.md#s-20-登录状态的两条路由撤销列出)） |
| `{}` | 拒绝 | 句柄必需；缺席**不是**「退出自己」 |
| `{"loginState": "lgs_3c7e11"}` | 拒绝 | 线上不收目标的 `LoginStateId` |

**校验对象**：`$defs/Result_AI_S16`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"ok"` | 通过 | ⑤ `ok` |
| `true` | 拒绝 | ⑤ 是字符串 `"ok"` |

### 14.4 列出登录状态 `capability.account-identity/v1#S-37`

**校验对象**：`$defs/Payload_AI_S37`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{}` | 通过 | 唯一输入是出示物 |
| `{"account": "acc_7f3c91"}` | 拒绝 | 本操作不接受 AccountId |

**校验对象**：`$defs/Result_AI_S37`

| 实例 | 预期 | 依据 |
|---|---|---|
| `[{"loginStateHandle": "9b1d5e0f3a7c2b4d6e8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b", "issuedAt": "2026-09-23T08:00:00Z"}]` | 通过 | S-20 |
| `[]` | 拒绝 | 成功调用必含调用方自己那一个；空列表是缺陷，入口答 `unavailable` |

### 14.5 创建团队组织 `capability.organization-governance/v1#S-21`

**校验对象**：`$defs/Payload_OG_S21`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{}` | 通过 | 创建键可选；创建者推导 |
| `{"creationKey": "team-setup-2026-09-23"}` | 通过 | 带创建键才能安全重发 |
| `{"creator": "acc_7f3c91"}` | 拒绝 | 载荷里没有「以谁的身份」这一格（S-12） |

**校验对象**：`$defs/Result_OG_S21`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"org_kf22"` | 通过 | ⑤ `OrganizationId` |
| `{"organization": "org_kf22"}` | 拒绝 | ⑤ 是一个值就直接给那个值 |

### 14.6 读组织 `capability.organization-governance/v1#S-22`

**校验对象**：`$defs/Payload_OG_S22`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"organization": "org_kf22"}` | 通过 | ① |
| `{}` | 拒绝 | 组织必需 |

**校验对象**：`$defs/Result_OG_S22`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"organization": "org_kf22", "organizationKind": "team"}` | 通过 | 无上级 ⇒ 成员不出现 |
| `{"organization": "org_kf22", "organizationKind": "team", "parentOrganization": "org_33e1"}` | 通过 | 有上级 |
| `{"organization": "org_kf22", "organizationKind": "team", "parentOrganization": null}` | 拒绝 | 不写 `null` |

### 14.7 发出邀请 `capability.organization-governance/v1#S-23`

**校验对象**：`$defs/Payload_OG_S23`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"invitedAccount": "acc_91ab40"}` | 通过 | 角色与时长缺席 ⇒ 领域取默认 |
| `{"invitedAccount": "acc_91ab40", "role": "superAdministrator", "offerTtl": 604800000}` | 通过 | 指定角色与这一份的时长 |
| `{"invitedAccount": "acc_91ab40", "offerTtl": 0}` | 通过 | 线上只约束「是整数」；非正由领域判，得 `invalidOfferDuration` |
| `{"invitedAccount": "acc_91ab40", "offerTtl": "7d"}` | 拒绝 | 不是整数 ⇒ `invalid-input` |
| `{"invitedAccount": "acc_91ab40", "issuer": {"organization": "org_kf22", "account": "acc_7f3c91"}}` | 拒绝 | 发起者推导，不在载荷里 |

**校验对象**：`$defs/Result_OG_S23`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"inv_5d2a"` | 通过 | ⑤ `InvitationId` |
| `{"invitation": "inv_5d2a"}` | 拒绝 | 单值不包对象 |

### 14.8 撤回邀请 `capability.organization-governance/v1#S-24`

**校验对象**：`$defs/Payload_OG_S24`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"invitation": "inv_5d2a"}` | 通过 | ① |
| `{"invitationId": "inv_5d2a"}` | 拒绝 | 成员名是 `invitation` |

**校验对象**：`$defs/Result_OG_S24`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"ok"` | 通过 | ⑤ |
| `"withdrawn"` | 拒绝 | ⑤ 是 `ok` |

### 14.9 接受邀请 `capability.organization-governance/v1#S-25`

**校验对象**：`$defs/Payload_OG_S25`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"invitation": "inv_5d2a"}` | 通过 | ① |
| `{"invitation": "inv_5d2a", "account": "acc_91ab40"}` | 拒绝 | 接受者推导 |

**校验对象**：`$defs/Result_OG_S25`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"organization": "org_kf22", "account": "acc_91ab40"}` | 通过 | ⑤ `TenantId` |
| `{"organization": "org_kf22"}` | 拒绝 | `TenantId` 两个分量都必需 |

### 14.10 成员资格判定 `capability.organization-governance/v1#S-26`

**校验对象**：`$defs/Payload_OG_S26`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"tenant": {"organization": "org_kf22", "account": "acc_7f3c91"}}` | 通过 | ① |
| `{"tenant": {"organization": "org_kf22"}}` | 拒绝 | `TenantId` 不压平、不缺分量 |

**校验对象**：`$defs/Result_OG_S26`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"standing": "effective", "role": "member"}` | 通过 | ⑤ `MembershipStanding` |
| `{"standing": "ineffective"}` | 通过 | 同上 |
| `{"failure": "unavailable"}` | 拒绝 | 判不出来是入口答复 `unavailable`，不是成功返回 |

### 14.11 我的租户 `capability.organization-governance/v1#S-27`

**校验对象**：`$defs/Payload_OG_S27`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{}` | 通过 | AccountId 推导 |
| `{"account": "acc_7f3c91"}` | 拒绝 | 同上，不收 |

**校验对象**：`$defs/Result_OG_S27`

| 实例 | 预期 | 依据 |
|---|---|---|
| `[{"organization": "org_kf22", "account": "acc_7f3c91"}]` | 通过 | ⑤ |
| `[]` | 拒绝 | 已激活的账号不可能一个有效租户都没有；空列表是缺陷 |

### 14.12 调整角色 `capability.organization-governance/v1#S-28`

**校验对象**：`$defs/Payload_OG_S28`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"targetTenant": {"organization": "org_kf22", "account": "acc_91ab40"}, "role": "superAdministrator"}` | 通过 | ① 目标 TenantId、目标角色 |
| `{"targetTenant": {"organization": "org_kf22", "account": "acc_91ab40"}}` | 拒绝 | 目标角色必需 |

**校验对象**：`$defs/Result_OG_S28`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"ok"` | 通过 | ⑤ |
| `"promoted"` | 拒绝 | ⑤ 是 `ok` |

### 14.13 解除成员 `capability.organization-governance/v1#S-29`

**校验对象**：`$defs/Payload_OG_S29`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"targetTenant": {"organization": "org_kf22", "account": "acc_91ab40"}}` | 通过 | ① |
| `{"targetTenant": {"organization": "org_kf22", "account": "acc_91ab40"}, "role": "member"}` | 拒绝 | 成员封闭 |

**校验对象**：`$defs/Result_OG_S29`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"ok"` | 通过 | ⑤ |
| `false` | 拒绝 | ⑤ 是 `ok` |

### 14.14 发出隶属请求 `capability.organization-governance/v1#S-30`

**校验对象**：`$defs/Payload_OG_S30`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"recipientOrganization": "org_33e1", "direction": "recipientAsParent"}` | 通过 | ① 接收方、方向 |
| `{"recipientOrganization": "org_33e1", "direction": "recipientAsChild", "offerTtl": 1209600000}` | 通过 | 带这一份的时长 |
| `{"recipientOrganization": "org_33e1", "direction": "parent"}` | 拒绝 | 方向取值封闭 |
| `{"recipientOrganization": "org_33e1"}` | 拒绝 | 方向必需 |

**校验对象**：`$defs/Result_OG_S30`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"aff_81c0"` | 通过 | ⑤ `AffiliationRequestId` |
| `""` | 拒绝 | 不透明标识非空 |

### 14.15 撤回隶属请求 `capability.organization-governance/v1#S-31`

**校验对象**：`$defs/Payload_OG_S31`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"affiliationRequest": "aff_81c0"}` | 通过 | ① |
| `{"affiliationRequestId": "aff_81c0"}` | 拒绝 | 成员名是 `affiliationRequest` |

**校验对象**：`$defs/Result_OG_S31`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"ok"` | 通过 | ⑤ |
| `null` | 拒绝 | ⑤ 是 `ok` |

### 14.16 接受隶属请求 `capability.organization-governance/v1#S-32`

**校验对象**：`$defs/Payload_OG_S32`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"affiliationRequest": "aff_81c0"}` | 通过 | ① |
| `{"affiliationRequest": "aff_81c0", "acceptor": {"organization": "org_33e1", "account": "acc_7f3c91"}}` | 拒绝 | 接受者推导 |

**校验对象**：`$defs/Result_OG_S32`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"ok"` | 通过 | ⑤ |
| `"accepted"` | 拒绝 | ⑤ 是 `ok` |

### 14.17 解除隶属 `capability.organization-governance/v1#S-33`

**校验对象**：`$defs/Payload_OG_S33`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"childOrganization": "org_33e1"}` | 通过 | ① 下级组织 |
| `{"parentOrganization": "org_kf22"}` | 拒绝 | 指认的是下级 |

**校验对象**：`$defs/Result_OG_S33`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"ok"` | 通过 | ⑤ |
| `"noSuchAffiliation"` | 拒绝 | 失败值走 `{ failure }` |

### 14.18 上级链／有共同上级 `capability.organization-governance/v1#S-34`

**校验对象**：`$defs/Payload_OG_S34`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"organizations": ["org_33e1"]}` | 通过 | 一个 ⇒ 求上级链 |
| `{"organizations": ["org_33e1", "org_kf22"]}` | 通过 | 两个 ⇒ 求有共同上级 |
| `{"organizations": []}` | 拒绝 | 至少一个 |
| `{"organizations": ["org_33e1", "org_kf22", "org_5b77"]}` | 拒绝 | 至多两个 |

**校验对象**：`$defs/Result_OG_S34`

| 实例 | 预期 | 依据 |
|---|---|---|
| `["org_kf22"]` | 通过 | 上级链，不含自己 |
| `[]` | 通过 | 个人组织的上级链是空序列 |
| `true` | 通过 | 有共同上级 |
| `"org_kf22"` | 拒绝 | 上级链是序列 |

### 14.19 层身份 `capability.organization-governance/v1#S-35`

**校验对象**：`$defs/Payload_OG_S35`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"tenant": {"organization": "org_kf22", "account": "acc_7f3c91"}}` | 通过 | ① |
| `{"organization": "org_kf22"}` | 拒绝 | 输入是 `TenantId` |

**校验对象**：`$defs/Result_OG_S35`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"organizationLayer": {"layer": "organization", "organization": "org_kf22"}, "tenantLayer": {"layer": "tenant", "tenant": {"organization": "org_kf22", "account": "acc_7f3c91"}}}` | 通过 | ⑤ 组织级、租户级 |
| `{"organizationLayer": {"layer": "tenant", "tenant": {"organization": "org_kf22", "account": "acc_7f3c91"}}, "tenantLayer": {"layer": "organization", "organization": "org_kf22"}}` | 拒绝 | 两层放反：每一格的判别式固定 |

### 14.20 当前租户身份查询 `capability.organization-governance/v1#S-36`

**校验对象**：`$defs/Payload_OG_S36`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{}` | 通过 | LoginStateId 就是出示物 |
| `{"loginState": "lgs_3c7e11"}` | 拒绝 | 出示物在信封里，不在载荷里 |

**校验对象**：`$defs/Result_OG_S36`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"organization": "org_kf22", "account": "acc_7f3c91"}` | 通过 | ⑤ `TenantId`，规范形式 |
| `"org_kf22"` | 拒绝 | 不压平成组织 |

### 14.21 切换当前租户身份 `capability.organization-governance/v1#S-37`

**校验对象**：`$defs/Payload_OG_S37`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"targetTenant": {"organization": "org_33e1", "account": "acc_7f3c91"}}` | 通过 | ① 目标 TenantId |
| `{}` | 拒绝 | 目标必需 |

**校验对象**：`$defs/Result_OG_S37`

| 实例 | 预期 | 依据 |
|---|---|---|
| `"ok"` | 通过 | ⑤ |
| `{"switched": true}` | 拒绝 | ⑤ 是 `ok` |

### 14.22 读邀请 `capability.organization-governance/v1#S-55`

**校验对象**：`$defs/Payload_OG_S55`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"invitation": "inv_5d2a", "callerIdentityKind": "account"}` | 通过 | 被邀请的人读 |
| `{"invitation": "inv_5d2a", "callerIdentityKind": "tenant"}` | 通过 | 发出它的组织的超管读 |
| `{"invitation": "inv_5d2a"}` | 拒绝 | 判别式必需，入口不替它猜 |
| `{"invitation": "inv_5d2a", "callerIdentityKind": "account", "account": "acc_91ab40"}` | 拒绝 | 只带判别式，身份值推导 |

**校验对象**：`$defs/Result_OG_S55`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"invitation": "inv_5d2a", "issuerOrganization": "org_kf22", "invitedAccount": "acc_91ab40", "role": "member", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}, "offerState": "pending"}` | 通过 | ⑤ |
| `{"invitation": "inv_5d2a", "issuerOrganization": "org_kf22", "invitedAccount": "acc_91ab40", "role": "member", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}}` | 拒绝 | 不得返回缺了派生状态的结果（OG S-55 ⑧） |
| `{"invitation": "inv_5d2a", "issuerOrganization": "org_kf22", "invitedAccount": "acc_91ab40", "role": "member", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}, "offerState": "cancelled"}` | 拒绝 | 派生状态四值（`data.offer-expiry` v1 S-7） |

### 14.23 读隶属请求 `capability.organization-governance/v1#S-56`

**校验对象**：`$defs/Payload_OG_S56`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"affiliationRequest": "aff_81c0"}` | 通过 | ① |
| `{"affiliationRequest": "aff_81c0", "callerIdentityKind": "tenant"}` | 拒绝 | 这一条没有判别式，调用方 TenantId 推导 |

**校验对象**：`$defs/Result_OG_S56`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"affiliationRequest": "aff_81c0", "issuerOrganization": "org_kf22", "recipientOrganization": "org_33e1", "direction": "recipientAsParent", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}, "offerState": "pending"}` | 通过 | ⑤ |
| `{"affiliationRequest": "aff_81c0", "issuerOrganization": "org_kf22", "direction": "recipientAsParent", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}, "offerState": "pending"}` | 拒绝 | 读一份隶属请求要带接收方组织 |

### 14.24 列出账号收到的待接受邀请 `capability.organization-governance/v1#S-57`

**校验对象**：`$defs/Payload_OG_S57`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{}` | 通过 | 缺席 ⇒ 只要 `pending` 的 |
| `{"includeConcluded": true}` | 通过 | 连已终结的一起要 |
| `{"includeConcluded": "yes"}` | 拒绝 | 开关是布尔 |
| `{"onlyPending": true}` | 拒绝 | 开关名是 `includeConcluded` |

**校验对象**：`$defs/Result_OG_S57`

| 实例 | 预期 | 依据 |
|---|---|---|
| `[{"invitation": "inv_5d2a", "issuerOrganization": "org_kf22", "invitedAccount": "acc_91ab40", "role": "member", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}, "offerState": "expired"}]` | 通过 | 每项同读邀请 |
| `[]` | 通过 | 没有收到的邀请 |
| `[{"affiliationRequest": "aff_81c0", "issuerOrganization": "org_kf22", "recipientOrganization": "org_33e1", "direction": "recipientAsParent", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}, "offerState": "pending"}]` | 拒绝 | 这里的项是邀请 |

### 14.25 列出组织发出的邀请与隶属请求 `capability.organization-governance/v1#S-58`

**校验对象**：`$defs/Payload_OG_S58`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{}` | 通过 | 缺席 ⇒ 只要 `pending` 的 |
| `{"includeConcluded": 1}` | 拒绝 | 开关是布尔 |

**校验对象**：`$defs/Result_OG_S58`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"invitations": [{"invitation": "inv_5d2a", "issuerOrganization": "org_kf22", "invitedAccount": "acc_91ab40", "role": "member", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}, "offerState": "pending"}], "affiliationRequests": []}` | 通过 | ⑤ 两段 |
| `{"invitations": []}` | 拒绝 | 两段都在，空段写空序列 |

### 14.26 列出组织成员 `capability.organization-governance/v1#S-59`

**校验对象**：`$defs/Payload_OG_S59`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"includeIneffective": true}` | 通过 | 连无效的一起要（这一档的授权由领域判） |
| `{"includeConcluded": true}` | 拒绝 | 成员名单的开关叫 `includeIneffective` |

**校验对象**：`$defs/Result_OG_S59`

| 实例 | 预期 | 依据 |
|---|---|---|
| `[{"tenant": {"organization": "org_kf22", "account": "acc_7f3c91"}, "role": "superAdministrator", "effective": true}]` | 通过 | ⑤ 成员关系记录的三样 |
| `[{"tenant": {"organization": "org_kf22", "account": "acc_7f3c91"}, "role": "member", "standing": "effective"}]` | 拒绝 | 名单上的一格不是一次 `MembershipStanding` 判定 |

### 14.27 列出组织收到的隶属请求 `capability.organization-governance/v1#S-60`

**校验对象**：`$defs/Payload_OG_S60`

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"includeConcluded": false}` | 通过 | 显式只要 `pending` 的 |
| `{"recipientOrganization": "org_kf22"}` | 拒绝 | 接收方就是调用方自己的组织，推导 |

**校验对象**：`$defs/Result_OG_S60`

| 实例 | 预期 | 依据 |
|---|---|---|
| `[{"affiliationRequest": "aff_81c0", "issuerOrganization": "org_33e1", "direction": "recipientAsChild", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}, "offerState": "withdrawn"}]` | 通过 | ⑤ |
| `[{"affiliationRequest": "aff_81c0", "issuerOrganization": "org_33e1", "recipientOrganization": "org_kf22", "direction": "recipientAsChild", "offerTiming": {"issuedAt": "2026-09-22T09:00:00Z", "expiresAt": "2026-09-29T09:00:00Z"}, "offerState": "pending"}]` | 拒绝 | 这一条的项不列接收方 |

## 15. 按路由核对答复

**校验对象**：`$defs/Exchange`

`Exchange` 把请求的 `operation` 与它的答复放在一起，线上没有这个对象（[S-17](contract.md#s-17-路由表封闭每条路由的九件事从哪读)）。它只按路由收窄**成功返回**；具名失败按全集核对，不按路由收窄。

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"operation": "capability.organization-governance/v1#S-27", "reply": {"result": [{"organization": "org_kf22", "account": "acc_7f3c91"}]}}` | 通过 | 我的租户的成功返回 |
| `{"operation": "capability.organization-governance/v1#S-27", "reply": {"result": "ok"}}` | 拒绝 | `"ok"` 是别的路由的返回 |
| `{"operation": "capability.organization-governance/v1#S-28", "reply": {"result": "ok"}}` | 通过 | 调整角色的成功返回 |
| `{"operation": "capability.organization-governance/v1#S-28", "reply": "login-state-rejected"}` | 通过 | 入口答复对每条路由同形 |
| `{"operation": "capability.organization-governance/v1#S-28", "reply": {"failure": "wouldLeaveNoSuperAdministrator"}}` | 通过 | 具名失败 |
| `{"operation": "capability.account-identity/v1#S-15", "reply": {"result": "lgs_3c7e11"}}` | 拒绝 | 登录的返回是 `{ loginState, loginStateHandle }` |
| `{"operation": "composition.governance-center-entry/v1#S-18", "reply": {"result": "ok"}}` | 拒绝 | 公开体检不走信封 |
