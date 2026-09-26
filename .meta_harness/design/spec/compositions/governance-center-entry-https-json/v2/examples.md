> HT2候选样例。此处测试构建显式将protocolVersion字符串"2"映射到https-json/2；该映射是样例前提。固定错误和公开health字节继承HT1，新登录列表字节重新生成。

# 规范实例：本传输上的字节

属于 `composition.governance-center-entry-https-json` v2（候选）的规范实例，是本版的规范工件之一。
§1～§5 是完整的线上字节，**入口层 T-2 固定字节快照以它们为来源**；§6 是请求体的读法与重复成员落到哪一种答复；§7 是体的写出规则的逐例。
答复的形状与成员以入口契约的 [Schema](../../governance-center-entry/v2/governance-center-entry.schema.json) 为准，本页不另立定义。

**两种写法，同一串字节：**

- **转义文本**：代码块里的 `\r\n` 是 CR LF 两个字节（`0D 0A`）；代码块里的**换行只为排版，不是字节**；除 `\r\n` 之外，§1～§5 的转义文本里没有别的转义，其余字符就是它们的 UTF-8 字节。
- **十六进制**：小写，每行 32 个字节；空白与换行只为排版，去掉之后就是那串字节。
- 每一份都写明总字节数、头部（到空行为止）与体各多少字节，以及整串字节的 SHA-256，供核对。
- 这些是 **HTTP 报文这一层**的字节（[S-11](contract.md#s-11-答复的外形)）：TLS 记录与传输分段怎样切不在内。

**值只是占位。**沿用入口契约 [examples](../../governance-center-entry/v1/examples.md) 占位值的：治理中心标识 `3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60`、版本 `0.1.0`、§4 第一项的列表句柄 `b8f71176…0dd8e` 与时刻 `2026-09-23T08:00:00Z`、§5 的 `startedAt` 与五项部署参数的取值、§6 的两个出示物与各标识。
**本页新增的**：§4 第二项的列表句柄 `c3ff21f9…f87aa` 与它的时刻 `2026-09-23T08:00:00.25Z`（为示范秒的小数部分）、§2 请求里的主机名 `center.example.invalid`，以及 §6、§7 为示范读法与写法构造的请求体与值。
§1、§3 是**任何中心上都一样**的固定字节；§2 的答复、§4、§5 随值而变，变的只是体里的值与 `Content-Length` 那一行，形状不变。

## 1. `version-mismatch`

[S-13](contract.md#s-13-四种入口答复的固定字节)；**跨协议版本不改**（[S-18](contract.md#s-18-跨协议版本不改的两样在本传输上)）。客户端认出它的办法：体逐字节等于 `"version-mismatch"` 这 18 个字节（[S-17](contract.md#s-17-客户端怎样读答复) 第 2 步）。

总 133 字节 = 头部 115 + 体 18；SHA-256 `cb89af19eb9dee5daac89acb4e2093c752948006e1a83b2eef76dc9ee66fcd27`。

```text
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
Cache-Control: no-store\r\n
Content-Length: 18\r\n
Connection: close\r\n
\r\n
"version-mismatch"
```

```text
485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a2061
70706c69636174696f6e2f6a736f6e0d0a43616368652d436f6e74726f6c3a20
6e6f2d73746f72650d0a436f6e74656e742d4c656e6774683a2031380d0a436f
6e6e656374696f6e3a20636c6f73650d0a0d0a2276657273696f6e2d6d69736d
6174636822
```

## 2. 公开体检的请求与答复

**请求**（[S-9](contract.md#s-9-公开体检的请求在本传输上的形状)）：客户端一律用 `POST`、以 `Content-Length` 成帧（[S-6](contract.md#s-6-只看请求体)）；路径与其余头中心都不看，这里的 `/`、`Host`、`Content-Type` 只是实例；**不改的是请求体**——恰有一个 `operation` 成员、值为 `composition.governance-center-entry/v1#S-18` 的 JSON 对象。下面是最短的那一种。

总 160 字节 = 头部 101 + 体 59；SHA-256 `1bf21973b666f3f054b76be27d98c624ab7b28bb7f0e6eba5ea728d8ff14812a`。

```text
POST / HTTP/1.1\r\n
Host: center.example.invalid\r\n
Content-Type: application/json\r\n
Content-Length: 59\r\n
\r\n
{"operation":"composition.governance-center-entry/v1#S-18"}
```

```text
504f5354202f20485454502f312e310d0a486f73743a2063656e7465722e6578
616d706c652e696e76616c69640d0a436f6e74656e742d547970653a20617070
6c69636174696f6e2f6a736f6e0d0a436f6e74656e742d4c656e6774683a2035
390d0a0d0a7b226f7065726174696f6e223a22636f6d706f736974696f6e2e67
6f7665726e616e63652d63656e7465722d656e7472792f763123532d3138227d
```

**答复**（[S-15](contract.md#s-15-公开体检答复)）：状态行、四个头及其次序、体的三个成员及其次序**跨协议版本不改**；一次运行期间整份字节不变。

总 197 字节 = 头部 115 + 体 82；SHA-256 `a65cd12d84ffd1ef7927690bda37c20fd87f429c4db4115d60c8b6fd9917ba16`。

```text
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
Cache-Control: no-store\r\n
Content-Length: 82\r\n
Connection: close\r\n
\r\n
{"reachable":true,"centerId":"3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60","version":"0.1.0"}
```

```text
485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a2061
70706c69636174696f6e2f6a736f6e0d0a43616368652d436f6e74726f6c3a20
6e6f2d73746f72650d0a436f6e74656e742d4c656e6774683a2038320d0a436f
6e6e656374696f6e3a20636c6f73650d0a0d0a7b22726561636861626c65223a
747275652c2263656e7465724964223a22336639633165306137623264346336
6538663061316232633364346535663630222c2276657273696f6e223a22302e
312e30227d
```

## 3. 另三种入口答复

[S-13](contract.md#s-13-四种入口答复的固定字节)；在同一个协议版本之内逐字节不变（[S-19](contract.md#s-19-随协议版本演化的部分换传输)）。

### 3.1 `login-state-rejected`

总 137 字节 = 头部 115 + 体 22；SHA-256 `a2957026d3c970025bd8e868e12b6d0e97465136b43762c546e44c735a524793`。

```text
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
Cache-Control: no-store\r\n
Content-Length: 22\r\n
Connection: close\r\n
\r\n
"login-state-rejected"
```

```text
485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a2061
70706c69636174696f6e2f6a736f6e0d0a43616368652d436f6e74726f6c3a20
6e6f2d73746f72650d0a436f6e74656e742d4c656e6774683a2032320d0a436f
6e6e656374696f6e3a20636c6f73650d0a0d0a226c6f67696e2d73746174652d
72656a656374656422
```

### 3.2 `unavailable`

总 128 字节 = 头部 115 + 体 13；SHA-256 `64a5b5280d3576c03a796d9cf5092dba09780572db9ba13b09be23b2d26c80c1`。

```text
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
Cache-Control: no-store\r\n
Content-Length: 13\r\n
Connection: close\r\n
\r\n
"unavailable"
```

```text
485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a2061
70706c69636174696f6e2f6a736f6e0d0a43616368652d436f6e74726f6c3a20
6e6f2d73746f72650d0a436f6e74656e742d4c656e6774683a2031330d0a436f
6e6e656374696f6e3a20636c6f73650d0a0d0a22756e617661696c61626c6522
```

### 3.3 `invalid-input`

总 130 字节 = 头部 115 + 体 15；SHA-256 `58e9d580311df16917e862f74dd97301ea41f06caec6315400a0e74fc46165d1`。

```text
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
Cache-Control: no-store\r\n
Content-Length: 15\r\n
Connection: close\r\n
\r\n
"invalid-input"
```

```text
485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a2061
70706c69636174696f6e2f6a736f6e0d0a43616368652d436f6e74726f6c3a20
6e6f2d73746f72650d0a436f6e74656e742d4c656e6774683a2031350d0a436f
6e6e656374696f6e3a20636c6f73650d0a0d0a22696e76616c69642d696e7075
7422
```

## 4. 一份路由结果答复

[S-14](contract.md#s-14-路由结果答复)：`capability.account-identity/v3#S-37`返回两项有效登录。五个成员按EC2 LoginStateListItem书写次序；时刻无零小数尾缀，第二项保留`.25`。样例读取时点假定两项均有效，不把读取后最终活动回填到本次列表里。

总628字节 = 头部116 + 体512；SHA-256 `b604606b951f849c95e821673d96a315b556895454ed8aee88c7c3291d546deb`。

```text
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
Cache-Control: no-store\r\n
Content-Length: 512\r\n
Connection: close\r\n
\r\n
{"result":[{"loginStateHandle":"b8f7117646179c7f8f923b56e9735b1a337d0cf67c7a5d63d3d2f4896ec0dd8e","issuedAt":"2026-09-23T08:00:00Z","lastActivityAt":"2026-09-23T08:00:00Z","absoluteExpiresAt":"2026-09-23T16:00:00Z","idleExpiresAt":"2026-09-23T09:00:00Z"},{"loginStateHandle":"c3ff21f9237e63ee18a0748b3d2b963355c7a77e9269c186325ad75abccf87aa","issuedAt":"2026-09-23T08:00:00.25Z","lastActivityAt":"2026-09-23T08:00:00.25Z","absoluteExpiresAt":"2026-09-23T16:00:00.25Z","idleExpiresAt":"2026-09-23T09:00:00.25Z"}]}
```

```text
485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a
206170706c69636174696f6e2f6a736f6e0d0a43616368652d436f6e7472
6f6c3a206e6f2d73746f72650d0a436f6e74656e742d4c656e6774683a20
3531320d0a436f6e6e656374696f6e3a20636c6f73650d0a0d0a7b227265
73756c74223a5b7b226c6f67696e537461746548616e646c65223a226238
663731313736343631373963376638663932336235366539373335623161
333337643063663637633761356436336433643266343839366563306464
3865222c226973737565644174223a22323032362d30392d32335430383a
30303a30305a222c226c61737441637469766974794174223a2232303236
2d30392d32335430383a30303a30305a222c226162736f6c757465457870
697265734174223a22323032362d30392d32335431363a30303a30305a22
2c2269646c65457870697265734174223a22323032362d30392d32335430
393a30303a30305a227d2c7b226c6f67696e537461746548616e646c6522
3a2263336666323166393233376536336565313861303734386233643262
393633333535633761373765393236396331383633323561643735616263
636638376161222c226973737565644174223a22323032362d30392d3233
5430383a30303a30302e32355a222c226c61737441637469766974794174
223a22323032362d30392d32335430383a30303a30302e32355a222c2261
62736f6c757465457870697265734174223a22323032362d30392d323354
31363a30303a30302e32355a222c2269646c65457870697265734174223a
22323032362d30392d32335430393a30303a30302e32355a227d5d7d
```

## 5. 运维面的完整体检答复

[S-21](contract.md#s-21-运维面的答复)：本机套接字 `governance-center-ops.sock`（[S-20](contract.md#s-20-运维面的承载)）上，对任何能成帧的请求都是这个形状；十个成员与 `deploymentParameters` 的五项都按 `FullHealthReply` 的书写次序。它随读取的时刻变化，不是固定字节。

总 554 字节 = 头部 116 + 体 438；SHA-256 `3e2f3380a3e1a3b0205da3fb6e79af945c725234f34d73d797d1b3670f6c6f62`。

```text
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
Cache-Control: no-store\r\n
Content-Length: 438\r\n
Connection: close\r\n
\r\n
{"reachable":true,"centerId":"3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60","version":"0.1.0","startedAt":"2026-09-23T08:00:00Z","storageReachable":true,"deploymentKeyPresent":true,"deploymentKeyComplete":true,"clockSane":true,"defectCount":0,"deploymentParameters":{"unactivatedRetention":604800000,"invitationTtlDefault":1209600000,"affiliationRequestTtlDefault":1209600000,"copyNoticeTtlDefault":604800000,"sharingInvitationTtlDefault":604800000}}
```

```text
485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a2061
70706c69636174696f6e2f6a736f6e0d0a43616368652d436f6e74726f6c3a20
6e6f2d73746f72650d0a436f6e74656e742d4c656e6774683a203433380d0a43
6f6e6e656374696f6e3a20636c6f73650d0a0d0a7b22726561636861626c6522
3a747275652c2263656e7465724964223a223366396331653061376232643463
366538663061316232633364346535663630222c2276657273696f6e223a2230
2e312e30222c22737461727465644174223a22323032362d30392d3233543038
3a30303a30305a222c2273746f72616765526561636861626c65223a74727565
2c226465706c6f796d656e744b657950726573656e74223a747275652c226465
706c6f796d656e744b6579436f6d706c657465223a747275652c22636c6f636b
53616e65223a747275652c22646566656374436f756e74223a302c226465706c
6f796d656e74506172616d6574657273223a7b22756e61637469766174656452
6574656e74696f6e223a3630343830303030302c22696e7669746174696f6e54
746c44656661756c74223a313230393630303030302c22616666696c69617469
6f6e5265717565737454746c44656661756c74223a313230393630303030302c
22636f70794e6f7469636554746c44656661756c74223a363034383030303030
2c2273686172696e67496e7669746174696f6e54746c44656661756c74223a36
30343830303030307d7d
```

## 6. 请求体的读法与重复成员

[S-7](contract.md#s-7-请求体怎样读成信封)、[S-8](contract.md#s-8-重复成员)、[S-9](contract.md#s-9-公开体检的请求在本传输上的形状)、[S-6](contract.md#s-6-只看请求体)。本节的答复都假定中心在应答、`accepted_protocol_versions` 含 `"2"` 而不含 `"0-obsolete"`（取值不归本契约）。
为了读着方便，表里用四个简写，代回原值就是请求体的原文：

- `P` = `"lsp_q8Jf3kQ2vXw9pLr7TzA0mYc4Nd6Hb5Ue1GsW"`：一个出示物。「P 有效」「P 已撤销」分两种情形写。
- `Q` = `"lsp_Zt5Rn0aB7cD2eF9gH4iJ6kL1mN3oP8qS0uVx"`：另一个出示物（从没签发过）。
- `R27` = `"capability.organization-governance/v2#S-27"`（我的租户，经第 ② 步，载荷为空对象）；`R23` = `"capability.organization-governance/v2#S-23"`（发出邀请）；`R15` = `"capability.account-identity/v3#S-15"`（登录，免认人）。
- `HC` = `"composition.governance-center-entry/v1#S-18"`（公开体检的路由标识）。

| # | 请求体 | 答复 | 依据 |
|---|---|---|---|
| 1 | 空（零字节） | `version-mismatch` | S-7 第 3 级 |
| 2 | 字节 `EF BB BF`，接着 `{"protocolVersion":"2","presentedLoginState":P,"operation":R27,"payload":{}}` | `version-mismatch`——BOM 不被跳过；去掉这三个字节就是一份合格信封 | S-7 第 2 级 |
| 3 | `{"protocolVersion":"`，字节 `FF`，`"}` | `version-mismatch` | S-7 第 1 级：非法 UTF-8 |
| 4 | `{"protocolVersion":"2","presentedLoginState":"lsp_`，字节 `ED A0 80`，`x","operation":R27,"payload":{}}` | `version-mismatch`——原始字节里的代理码点编码是非法 UTF-8 | S-7 第 1 级 |
| 5 | `{"protocolVersion":"2","presentedLoginState":"lsp_\uD800x","operation":R27,"payload":{}}` | `login-state-rejected`——转义写出的孤立代理码点照常读成字符串，由出示物那一步判它表示层不合格；**与第 4 行的答复不同**，是因为这一份请求体是合法的 UTF-8 JSON | S-7「JSON 值的读法」；EC S-5 |
| 6 | `[{"protocolVersion":"2"}]` | `version-mismatch` | S-7 第 4 级 |
| 7 | `"version-mismatch"` | `version-mismatch` | S-7 第 4 级：顶层是字符串 |
| 8 | `{"protocolVersion":"2","presentedLoginState":P,"operation":R27,"payload":{}} {}` | `version-mismatch` | S-7 第 3 级：值之后还有别的字符 |
| 9 | `{"protocolVersion":"2","protocolVersion":"2","presentedLoginState":P,"operation":R27,"payload":{}}` | `version-mismatch`——两份值相同也不取其一 | S-8；EC S-4 |
| 10 | `{"protocolVersion":"2","presentedLoginState":P,"operation":R27,"operation":R27,"payload":{}}` | `invalid-input`，认人没有发生——`operation` 还原后就是 `operation` | S-7、S-8；EC S-4 |
| 11 | `{"protocolVersion":"2","presentedLoginState":P,"presentedLoginState":Q,"operation":R27,"payload":{}}` | `login-state-rejected`，P 有效也一样——「多个出示物」，不取其一 | S-8；EC S-4、S-11 |
| 12 | `{"protocolVersion":"2","presentedLoginState":P,"presentedLoginState":Q,"operation":R15,"payload":{"loginIdentifier":"ada@example.invalid","credential":"correct horse battery staple"}}` | 与不带出示物的同一个登录请求答复相同——免认人的路由不看出示物，也不看它的重复 | S-8；EC S-10 |
| 13 | `{"protocolVersion":"2","presentedLoginState":P,"operation":R27,"payload":{},"payload":{}}` | P 有效 ⇒ `invalid-input`；P 已撤销 ⇒ `login-state-rejected`（认出人之后才看载荷） | S-8；EC S-4 |
| 14 | `{"protocolVersion":"2","presentedLoginState":P,"operation":R23,"payload":{"expectedTenant":{"organization":"org_kf22","account":"acc_7f3c91"},"invitedAccount":"acc_91ab40","role":"member","role":"superAdministrator"}}` | P 有效 ⇒ `invalid-input`；P 已撤销 ⇒ `login-state-rejected`——载荷里面的重复与 `payload` 重复同一步 | S-8「某个成员的值的里面」 |
| 15 | `{"protocolVersion":"2","presentedLoginState":P,"operation":R23,"payload":{"expectedTenant":{"organization":"org_kf22","account":"acc_7f3c91"},"invitedAccount":"acc_91ab40","offerTtl":9007199254740990.5}}` | P 有效 ⇒ `invalid-input`——它不是整数。先舍入到双精度浮点的实现会读成 `9007199254740990` 而放过它 | S-7「数按精确数值判」；EC S-17 注 3 |
| 16 | 同上，`"offerTtl":1e3` | 数值表示合格：`offerTtl`就是1000；仅在P现读身份等于expectedTenant且授权通过时交给领域，否则按EC2 S51/S13收场 | 同上 |
| 17 | `{"operation":HC,"protocolVersion":"0-obsolete","x":1,"x":2}` | 公开体检答复——其余成员与它们的重复一概不看 | S-9；EC S-18 |
| 18 | `{"operation":"composition.governance-center-entry\/v1#S-18"}` | 公开体检答复——`\/` 还原后就是 `/` | S-7、S-9 |
| 19 | `{"operation":HC,"operation":HC}` | `version-mismatch`——`operation` 不能被唯一确定，不是公开体检请求；按信封从 ① 起判，缺 `protocolVersion` | S-9 |
| 20 | `{"protocolVersion":"2","operation":R27,"payload":{}}`，另在请求头里带 `Authorization: Bearer lsp_q8Jf3kQ2vXw9pLr7TzA0mYc4Nd6Hb5Ue1GsW` | `login-state-rejected`——头里的东西不是出示物，这个请求没带出示物 | S-6 |

## 7. 体的写出规则逐例

[S-12](contract.md#s-12-体的写出规则)。左列是一个值，右两列是它在体里写出的字节。

| 值 | 写出（文本） | 写出（十六进制） |
|---|---|---|
| 字符串：`a`、`"`、`b`、`\`、`c` 五个字符 | `"a\"b\\c"` | `22 61 5c 22 62 5c 5c 63 22` |
| 字符串：U+0009 | `"\t"` | `22 5c 74 22` |
| 字符串：U+0007 | `"\u0007"` | `22 5c 75 30 30 30 37 22` |
| 字符串：U+001F | `"\u001f"`（小写） | `22 5c 75 30 30 31 66 22` |
| 字符串：U+00E9（é） | 原样 | `22 c3 a9 22` |
| 字符串：`/` | `"/"`，不转义 | `22 2f 22` |
| 字符串：U+2028 | 原样 | `22 e2 80 a8 22` |
| 字符串：U+007F | 原样 | `22 7f 22` |
| 字符串：孤立代理码点 U+D800 | `"\ud800"`（小写） | `22 5c 75 64 38 30 30 22` |
| 时间点：2026-09-23 08:00:00 UTC（也就是 16:00:00+08:00 那一刻） | `"2026-09-23T08:00:00Z"`——不写 `.000`，不写 `+08:00` | — |
| 时间点：同上再过 250 毫秒 | `"2026-09-23T08:00:00.25Z"` | — |
| 时间点：同上再过 123 毫秒 | `"2026-09-23T08:00:00.123Z"` | — |
| 整数：零 | `0` | `30` |
| 对象：`TenantId`，组织 `org_kf22`、账号 `acc_7f3c91` | `{"organization":"org_kf22","account":"acc_7f3c91"}`——按 `data.identity-values` v1 Schema 的书写次序，无空白 | — |
| 对象：读组织的返回，没有上级 | `{"organization":"org_kf22","organizationKind":"team"}`——`parentOrganization` 缺席就不写，不写 `null` | — |
