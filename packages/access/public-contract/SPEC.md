# 系统公开契约行为规格

本页拥有治理消息的字段、`outcome`、操作名，以及同一输入的可见结果。身份和授权的业务事实仍归 identity 与 authorization。本页固定治理消息版本和治理操作名。它不决定传输协议，也不决定治理以外的 SDK 覆盖范围。

SDK 和服务端接入使用本页的结果表。它们不另写一套结果含义。

## 共同消息

请求和响应都是一个 JSON 对象。公开契约用 `packages/common/json-text` 的严格读取。注释、尾逗号和重复键都不是本协议的合法消息。

本协议只接受一个协议版本，文本为 `governance-public/1`。以后增加版本必须改本页。调用者发送另一个版本时，整份消息得到 `protocol-rejected`。本地和远程可以使用不同的传输适配。适配变化不改变租户、授权、登录或完成的含义。本页不定义中心标识。

请求字段：

| 字段 | 要求 |
| --- | --- |
| `protocolVersion` | 字符串。唯一合法值是 `governance-public/1`。 |
| `messageId` | 调用者生成的字符串。只用于把响应对应到这次发送。它不是去重键。 |
| `operation` | 下文字段「操作」中的名字。 |
| `loginProof` | 下表为「必填」时必须是服务端能核验的不透明字符串。诊断输出不能包含它。密码学形式归登录提供者。下表为「禁止」时不能出现。 |
| `actingTenant` | 下表为「必填」时必须是已解析的租户标识，并且等于该登录的当前选择。下表为「禁止」时不能出现。它不是目标组织。 |
| `body` | 该操作的对象。没有额外输入时是空对象。可省略的 `body` 字段只在下表列出。 |

响应使用同一个 `protocolVersion` 和同一个 `messageId`。`outcome` 取下节的对外结果。`body` 只放该结果允许公开的字段。

`messageId` 不把「签发登录」变成只签发一次。同一次业务重试是否产生新事实，由该操作自己的规则决定。

## 重复的 protocolVersion

`json-text` 在根对象见到第二个 `protocolVersion` 时返回 `duplicate-key`，路径为空，键名为 `protocolVersion`。它不选择第一个值或第二个值。

服务端接入把这个读取结果映射为 `protocol-rejected`。业务成员不被调用。没有注册、登录、授权或写入。响应不包含账号是否存在，也不包含哪一个版本「生效」。

其他 `duplicate-key`、语法失败、空输入、非法 UTF-8 和预算失败同样是 `protocol-rejected`，同样没有业务效果。它们与重复的 `protocolVersion` 使用同一个对外结果。内部诊断可以保留 `json-text` 的 `kind` 和键名。

单个 `protocolVersion` 不是 `governance-public/1` 时，也是 `protocol-rejected`。服务端不协商版本，不按旧协议继续。

这些协议拒绝发生在身份核验和授权判断之前。

信封字段按操作闭合。

| 操作 | `loginProof` | `actingTenant` | 可省略的 `body` 字段 |
| --- | --- | --- | --- |
| `public-health`、`register-and-activate`、`issue-login` | 禁止 | 禁止 | 无 |
| `revoke-login`、`replace-credential`、`query-own-valid-logins`、`query-current-tenant`、`query-own-memberships`、`query-received-invitations` | 必填 | 禁止 | 无 |
| `issue-member-invitation`、`open-affiliation-request` | 必填 | 必填 | `duration` |
| `query-organization-members` | 必填 | 必填 | `includeRemoved` |
| `accept-member-invitation`、`reject-member-invitation`、`withdraw-member-invitation`、`create-organization`、`leave-organization`、`remove-member`、`change-member-role`、`switch-current-tenant`、`query-organization`、`query-issued-invitations`、`accept-affiliation-request`、`reject-affiliation-request`、`withdraw-affiliation-request`、`release-affiliation`、`query-received-affiliation-requests`、`query-issued-affiliation-requests`、`query-affiliation-request`、`judge-admission`、`submit-authorization-expression`、`withdraw-authorization-expression` | 必填 | 必填 | 无 |

`disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 不进入这张表。

## 判断次序

服务端接入按下面的次序处理一份已经完成传输保护的消息。前一步已经给出终端结果时，不再做后面的步骤。

1. 严格 JSON 读取。失败则 `protocol-rejected`。不读取账号库。
2. 操作名是 `disable-subject`、`restore-subject`、`end-subject` 或 `reopen-after-media-loss` 时，立刻返回 `stage-not-provided` 和空 `body`。忽略其余字段。不核验登录。不读取账号库。版本不是 `governance-public/1`，或其他操作名不在本页，则 `protocol-rejected`。
3. 按上表检查封闭字段。类型不符、表外字段、禁止字段出现、未列入可省略清单的缺字段，都是 `protocol-rejected`。可省略字段可以不出现。这一步仍不读取账号库。必填 `loginProof` 缺失或空字符串不在这一步拒绝。`leave-organization` 的 `body` 若出现目标成员字段，也是 `protocol-rejected`。
4. 上表要求登录证明时，把缺失、空字符串、未签发、已撤销，以及不是本部署签发的证明，交给 identity。对外是同一份 `denied`。时间或权威登录记录不可得时，identity 返回 `basis-unavailable`。服务端接入不改写这两个结果，也不另持一份登录表。传输保护不证明调用者是谁。裸账号标识、证书、地址、旧连接和调用者自报的授权结果都不是当前登录。
5. 发起者账号只取这份证明核验出的账号。`body` 里的账号、组织和租户都是目标。
6. 上表要求行事租户时，核对该值等于该登录的当前选择。不等则 `denied`，响应不包含实际选择。行事租户所属组织与目标组织不同，本身不是冲突。
7. 按该操作的当前资格做业务判断。判断使用提交时的事实。对象按公开契约要求隐藏时，先返回 `not-visible`。这包括该对象同时没有跨租户授予的情况。对象可见且没有跨租户授予时，结果是 `denied`。
8. 通过后提交业务效果。服务端已经返回的终端 `outcome` 不是 `unknown`。响应没有到达调用者时，调用者保持 `unknown`。

注册和签发登录禁止登录证明。它们不使用第 4 步。凭据结果见各操作。

## 对外结果

调用者只能依赖 `outcome` 和该结果列出的 `body`。内部诊断可以更细，但不能从 SDK 或普通错误文本读到。

| outcome | 调用者可以知道的 | 不能从该结果推出的 |
| --- | --- | --- |
| `succeeded` | 该操作的成功条件已经成立 | 其他登录、其他成员或后续动作已经获准 |
| `no-change` | 核验通过，目标状态没有新的变化 | 调用者因此获得新资格 |
| `denied` | 本次不获准 | 是明确禁止、无权、登录失效，还是跨租户未授予 |
| `not-visible` | 与目标不存在使用同一表现 | 目标是否存在，或属于哪个账号 |
| `uniform-auth-failure` | 登录未签发 | 账号不存在、未激活，还是凭据错误 |
| `not-loginable` | 这次没有报告账号可登录 | 标识是否占用，或开通条件哪一条失败 |
| `basis-unavailable` | 现在不能得出允许 | 把它当成已知无权或已知冲突 |
| `need-decision` | 要等待原决定请求的一次答复 | 等待已经批准、拒绝，或将会超时批准 |
| `unknown` | 提交结果尚未认回 | 效果没有发生，或可以安全地自动再做一次 |
| `conflict` | 调用者有权看见的预期状态已经变了 | 调用者看不见的对象因此被确认存在 |
| `protocol-rejected` | 消息不被接受 | 任何业务事实 |
| `stage-not-provided` | 本阶段不提供该操作 | 主体是否存在，或删除、创建已经代替该操作 |

`need-decision` 的 `body` 只含原决定请求的标识。等待超时、连接断开和实例丢失不产生人的答复，也不写成批准或拒绝。答复的交付仍归人工交互的拥有者。本页不定义答复消息。

`no-change` 在邀请和隶属的重复处置上，`body` 携带已经形成的那一个终结。它不表示这次又写了一次。

## 未知、重复、重试、缓存和列表

调用者在收到终端响应之前，把可能已经提交的操作保持为 `unknown`。连接断开、超时和响应丢失都是 `unknown`。它们不是 `succeeded`，也不是「没有发生」。

SDK 只在传输适配报告「请求字节没有发出」时自动再送一次。适配不能证明这一点时，SDK 不自动再送。调用者可以自己发起一次新调用。新调用遵守该操作自己的重复规则。

SDK 不缓存准入允许、登录证明或凭据。它不提供 `prefer-copy`。客户端应用可以保存屏幕投影。投影失败不改变已经返回的 `succeeded`。清掉投影不把 `unknown` 变成成功或没有发生。下一次调用仍以该次服务端结果为准。本协议不设缓存时限。

这些治理操作都不刷新登录的空闲计时。失败请求、`public-health` 和仅完成认证也不刷新。成功业务访问的报告不是本表中的操作。identity 的 ID-11 仍要求公开形状定义该报告。本规格不补这个操作。

每一份名单都适用同一条完整性规则。成功时 `completeness` 在 `body` 里，紧挨名单数组，值为 `complete`，数组给出全部当前项。不可用时 `outcome` 是 `basis-unavailable`，`body` 没有该数组，也没有 `completeness`。任一项的状态无法在读取时判定时，整份名单不可用。不丢项，不把不可用改成空名单，也不把待处理改成过期。本协议不按页返回名单。历史登录不在「查询本人有效登录」里。

| 名单 | 数组名 | 每一项 |
| --- | --- | --- |
| 有效登录 | `logins` | `loginId`、`issuedAt`、签发时冻结的 `maxDeadline` 与 `idleDeadline` |
| 本人成员资格 | `memberships` | `organizationId`、`tenantId`、`role` |
| 组织成员 | `members` | `accountId`、`role`。`includeRemoved` 为 false 时只有当前有效成员。为 true 时只有已解除成员 |
| 成员邀请 | `invitations` | `invitationId`、`state`、`expiresAt`、`organizationId`、`invitedAccountId` |
| 隶属请求 | `affiliationRequests` | `requestId`、`state`、`expiresAt`、`superiorOrganizationId`、`subordinateOrganizationId` |

并发控制核对调用者有权看见的预期状态。本协议不另造整数版本号。预期状态在提交时核对。调用者无权看见目标时返回 `not-visible`，不返回 `conflict`。

## 操作

下面每项都对应授权规格操作表中的一行，或该行已经写出的终结方式。消费许可不是独立的客户端消息。动作的拥有者在执行该动作时消费。客户端不能发送消费消息来增加或扣掉许可。

### `register-and-activate`

不带登录证明。`body` 含登录标识和凭据材料。凭据材料只出现在这次请求里。

留存期内，同一登录标识和同一凭据接续原来的未激活注册。激活完成时，账号、唯一个人组织和个人租户共同成立，返回 `succeeded`。`body` 含三个标识。不含登录证明。成功不表示已经登录。不同凭据不能认领该记录。账号已经激活时返回 `not-loginable`，不覆盖原账号。已判定到期的未激活记录不复活。此后同一标识的注册是新的一次。

其他条件不足或依据不可得也是 `not-loginable`。回执丢失是 `unknown`。认回用一次新的 `issue-login`。那里的 `succeeded` 表示账号已经可以登录。`uniform-auth-failure` 不证明激活没有发生。重复注册失败也不能证明此前没有激活。

SDK 不自动再送。

### `issue-login`

不带既有登录证明。`body` 含登录标识和凭据材料。

成功时签发一份新的独立登录。`body` 含登录标识、签发时间、该登录的当前租户，以及只返回这一次的登录证明。登录证明是不透明字符串。诊断输出不能包含它。最长有效期和空闲期限在签发时按当时的部署配置冻结。同一账号的另一次成功登录是另一份登录，不合并。

时间或期限依据不可得时，直接返回 `basis-unavailable`，不签发。这个选择不经过「凭据已经匹配」的分支。账号不存在、未激活和凭据错误都是 `uniform-auth-failure`。两个结果不同，但 `basis-unavailable` 不能被用来确认凭据是对的。

丢失回执后的再次调用是一次新的签发，可以再产生一份登录。调用者不能假定两次只产生一份。若调用者还持有另一份有效登录，可以用有效登录名单里的标识撤销那份没有交还证明的登录。查询结果不包含可拿来冒充登录的材料。SDK 不自动再送。

### `revoke-login`

需要有效的本人登录。`body` 含目标登录标识。目标必须属于同一账号。

成功时，目标登录已经失效。其他登录保持。退出登录不注销账号，不解除成员，也不终结组织或租户。

发起登录无效是 `denied`。目标不存在或属于其他账号是 `not-visible`。依据不可得是 `basis-unavailable`，不执行撤销。

已经通过核验的重复撤销是 `no-change`。发起登录已经失效时，不能再取得资格。清除客户端显示不是撤销成功。

SDK 不自动再送。`unknown` 之后，调用者用另一份仍有效的登录查询或再次撤销来认回。查询结果不包含可拿来冒充登录的材料。

### `replace-credential`

需要本人有效登录，并在 `body` 中出示当前凭据和新凭据。管理员、主机运维或只持有登录证明不能代替当前凭据。

成功时，新凭据和本账号全部旧登录失效共同成立，包括发起这次操作的登录。不签发新登录。不改变角色、成员、租户或历史归属。响应不含凭据。

新凭据和全部旧登录失效同一次提交。中途崩溃对调用者保持 `unknown`。恢复后不能留下新凭据仍搭配旧登录有效。认回用新凭据做一次 `issue-login`。那里的 `succeeded` 表示更换已经成立。旧凭据得到的 `uniform-auth-failure` 或 `basis-unavailable` 都不证明更换没有发生。再次 `replace-credential` 是一次新的更换。SDK 不自动再送。进程崩溃、操作系统崩溃或断电后的恢复不复活旧凭据或旧登录。

### `create-organization`

需要有效登录。默认团队方案中，已激活账号可以创建团队组织。`body` 含非空名称和所采用的治理模型标识。

成功时，组织、创建者租户和初始治理共同成立。默认团队方案还包括首位超级管理员。`body` 含组织标识和创建者租户标识。模型来源不可用时是 `basis-unavailable`。模型被拒绝时是 `denied`。两条都不创建组织，也不改用默认团队方案。不返回可用的组织标识。`unknown` 之后，调用者用调用前的本人成员资格快照对照 `query-own-memberships`。多出来的组织才算这次创建已经成立。再次调用是另一次创建。

个人组织由注册开通。本操作不创建第二个人组织，也不邀请他人加入个人组织。名称不参与去重。同名可以是不同组织。本操作没有创建键。

回执丢失是 `unknown`。SDK 不自动再送。

### 成员邀请

`issue-member-invitation`、`accept-member-invitation`、`reject-member-invitation` 和 `withdraw-member-invitation` 共同实现操作表中的「发出并接受成员邀请」。

发出要求当前模型下的发起资格。默认团队由本组织当前有效超级管理员发起。其他已采用模型按 identity ID-12 核验发起资格。个人组织不接受该操作，对外是 `denied`。`body` 含被邀请账号的登录标识。标识不能解析成已激活账号时，缺失和未激活使用同一个 `not-visible`。不先按标识查询再决定是否授权。成功时邀请处于待处理。`body` 含邀请标识和发出时固定的到期时刻。`body` 可以带授权范围内的时长。超出范围是 `denied`，不建立邀请。省略时长时，使用提交当时该部署配置里的成员邀请默认时长。不携带角色。默认团队的接受结果是普通成员。其他已采用模型的接受角色沿 identity ID-12。邀请载荷不写角色。

接受、拒绝和撤回的 `body` 含邀请标识，以及预期状态 `open`。行事租户是调用者的当前选择，可以是个人租户。邀请所属组织从邀请记录读取。两者不同不是冲突。

判定按这个次序，先命中的结果生效。

1. 调用者看不见这份邀请，或邀请未找到。结果是 `not-visible`。
2. 接受或拒绝的行动者不是被邀请账号。撤回的行动者不是该模型规定的发出方。默认团队的发出方是发出组织的当前有效超级管理员。结果是 `denied`，邀请不变。
3. 邀请已经过期、已经终结，或预期状态已经不是 `open`。有权看见的调用者得到 `no-change`。`body` 携带已经形成的那一个终结。不再写第二个终结。
4. 接受时被邀请账号已经是有效成员。结果是 `no-change`。角色不变，租户不变。该邀请在同一次提交里形成与此一致的一个终结。
5. 接受成功时，稳定租户和接受终结在同一次提交里成立。默认团队的角色是普通成员。其他已采用模型的角色沿 identity ID-12。不恢复旧管理员权。

无资格的其他情况是 `denied`。依据不可得是 `basis-unavailable`。回执丢失是 `unknown`。SDK 不自动再送。角色变更不通过重复邀请完成。

### `query-own-valid-logins`

需要有效登录。`body` 为空对象。不带目标账号。调用者只能查询证明所标识的本账号。

成功时，`body.logins` 含该账号每一份当前有效登录的标识、签发时间，以及签发时冻结的最长期限和空闲期限。`completeness` 为 `complete`。不含登录证明、凭据或历史登录。发起这次查询的有效登录必须出现在名单里。服务端若只能给出空名单，对外是 `basis-unavailable`，没有登录数组。

发起登录无效是 `denied`，且没有登录数组。名单无法完整读出时是 `basis-unavailable`，没有登录数组。

这是读操作。它不签发、不撤销、不刷新空闲计时，也不写入业务事实。SDK 不自动再送。调用者没有可信答复时是 `unknown`。调用者可以自己再查询。

### 退出、移除和调整角色

`leave-organization`、`remove-member` 和 `change-member-role` 实现操作表中的「退出组织、移除成员、调整角色」。

`leave-organization` 不带目标成员。目标固定为登录证明上的账号。请求里若出现目标成员字段，按封闭字段拒绝。个人组织上的退出是 `denied`，成员不变。

`remove-member` 和 `change-member-role` 的行动者必须具有该组织已采用模型规定的处置资格。默认团队的这个资格是当前有效超级管理员。`body` 含组织标识、目标成员标识，以及调用者看到的当前角色。调整角色还含目标角色。目标不是本人时，退出规则不适用。提交时如果当前角色已经不同，有权看见该成员的调用者得到 `conflict`，成员资格不变。无权看见时是 `not-visible`。

两位管理员并发移除或降级对方不能都成功。失败的一方返回 `denied`，即使请求里的预期角色仍与提交前看到的角色相同。最后一位超级管理员的具体原因只留在内部。对外仍是 `denied`。

成功只改变身份领域的资格事实。它不承诺其他业务的工作已经停止。回执丢失是 `unknown`。SDK 不自动再送。退出和移除都不删除租户或资源。

### `switch-current-tenant`

需要有效登录。`body` 含目标租户标识。`actingTenant` 仍是切换前的当前选择。

成功只改变这一份登录之后的请求所选租户。既有对象归属不变。响应含新的当前租户。目标就是当前选择时，是 `no-change`，选择不变。

无资格或依据不可得时，原选择保持。前者是 `denied`，后者是 `basis-unavailable`。两者都不返回实际选择。显式行事租户与当前选择冲突是 `denied`，不进入业务，也不返回实际选择。回执丢失是 `unknown`。认回时调用 `query-current-tenant`。该操作禁止行事租户，只凭登录证明返回这一份登录的当前选择。SDK 不自动再送。

### `release-affiliation`

需要上级组织当前有处置资格的人。默认团队是该上级的当前有效超级管理员。`body` 含已生效隶属的标识，以及调用者看到的状态 `effective`。

成功时解除该隶属。下级身份解除是 `denied`。同一人管理双方时，仍必须以上级身份行事。具有上级处置资格的人对已经解除的同一隶属再次解除，得到 `no-change`。默认团队的这个资格是上级组织的当前有效超级管理员。这个 `no-change` 表示该隶属已经解除。未知标识是 `not-visible`。状态已变且调用者有权看见时是 `conflict`。回执丢失是 `unknown`。SDK 不自动再送。

### 隶属请求

`open-affiliation-request`、`accept-affiliation-request`、`reject-affiliation-request` 和 `withdraw-affiliation-request` 实现「处理隶属请求」。

打开请求的 `body` 含上级组织和下级组织。个人组织不能参与，对外是 `denied`。可以带授权范围内的时长。超出范围是 `denied`，不建立请求。省略时长时，使用提交当时该部署配置里的隶属请求默认时长。这个默认时长与成员邀请的默认时长分开。接收方处理前，发起组织已经不存在则该请求失效。有权看见的调用者得到 `no-change`，`body.state` 为 `invalid`。无权看见的调用者得到 `not-visible`。失效不能建立关系，之后也不能被接受、拒绝或撤回覆盖。目标组织不存在时，请求过期。有权看见的调用者得到 `no-change`，`body.state` 为 `expired`。下级身份解除已生效隶属时是 `denied`。已采用模型规定的上级处置资格才可以解除。默认团队的这个资格是上级组织的当前有效超级管理员。

双方确认后，接受成功只建立隶属。不新建租户，不授予权限。每组织至多一个上级，不能自隶属或形成环。会造成环或第二个上级的提交返回 `denied`，`body` 为空，不建立关系。

预期状态是 `pending`。已经终结时，有权看见的调用者得到 `no-change`，`body` 携带已经形成的那一个终结。回执丢失是 `unknown`。查询不可用时不把关系写成未建立或已解除，对外是 `basis-unavailable`。SDK 不自动再送。

### `judge-admission`

需要该次判断所要求的可信身份和行事范围。`body` 含资源、动作、生效参数，以及判断所需的范围标识。不含调用者自报的允许结论。

成功的对外结果不是单一的 `succeeded`。它是下面四个之一。

| 业务结果 | outcome | body |
| --- | --- | --- |
| 允许 | `succeeded` | 本次动作准入通过。不含可复用的许可秘密。 |
| 拒绝 | `denied` | 空对象 |
| 需要决定 | `need-decision` | 原决定请求标识 |
| 依据不可得 | `basis-unavailable` | 空对象 |

本操作的可信主体就是登录证明上的账号。请求里再写一个主体是封闭字段之外的字段，返回 `protocol-rejected`。不从 `body` 读取行动者，也不伪造登录。

对象按公开契约要求隐藏时，先返回 `not-visible`。这包括该对象同时没有跨租户授予的情况。披露表要求隐藏对象与不存在使用同一表现。对象可见且没有跨租户授予时，结果是 `denied`。明确禁止不被批准覆盖，对外仍是 `denied`。

`need-decision` 的等待超时不写成批准、拒绝或终局。SDK 不缓存这次允许，也不自动再送。调用者稍后再次判断是一次新的当前判断。

### 授权表达与撤回

`submit-authorization-expression` 和 `withdraw-authorization-expression` 实现操作表中的表达与撤回。消费不是客户端操作。

表达的 `body` 含原表达、动作、对象和生效参数。含义不能确定时不扩大范围，对外是 `basis-unavailable`，不保存成允许。单次批准只覆盖明确动作。

撤回的 `body` 含原表达标识。成功时留下撤回事实，并保留原表达。无资格是 `denied`。提交结果未知时，对外是 `unknown`。该结果不把原表达改成已撤回，也不把未知写成已经生效。读取故障不把原表达写成已撤回，对外是 `basis-unavailable`。

表达已经写入、持久设置尚未更新时，结果是 `succeeded`。`body` 写明持久设置尚未因此更新。持久规则的写入本身失败、表达也没有作为持久设置生效时，结果是 `basis-unavailable`。写入结果未知是 `unknown`。`basis-unavailable` 和 `unknown` 都不报告规则已经生效。已消费的许可不能复用。重复提交同一决定不增加许可，有权调用者得到 `no-change`。SDK 不自动再送。

## 当前读面

这些读操作把 identity 已经保存的当前事实读出来。它们不写入新的业务事实。名单遵守上面的完整性规则。角色和效力只是这次读到的投影，不是下一次写入的许可。读面的行动者按已采用治理模型核验。下面默认团队的超级管理员，就是该模型里的当前有效超级管理员。

### `public-health`

不带登录证明，也不带行事租户。`body` 为空对象。

成功时，`body` 只有 `protocolVersion` 为 `governance-public/1`。它表示对端按本协议作了回答。它不表示登录有效，也不表示治理写入可用。不读取账号库。不刷新空闲计时。SDK 不自动再送。连接失败不是 `basis-unavailable`。调用者没有可信答复时是 `unknown`。

### `query-current-tenant`

需要有效登录。`body` 为空对象。

成功时返回这一份登录的当前租户。从未切换时，返回该登录所属方案规定的初始选择。默认个人方案的初始选择是个人租户。读不到当前选择时是 `basis-unavailable`，不编造个人租户。登录无效是 `denied`。SDK 不自动再送。

### `query-own-memberships`

需要有效登录。`body` 为空对象。

成功时只返回调用者自己的当前有效成员资格。每一项含组织标识、租户标识和角色。不含其他账号。`completeness` 为 `complete`。无法完整读出时是 `basis-unavailable`，没有数组。SDK 不自动再送。

### `query-organization`

需要有效登录，以及该组织的当前有效成员资格。`body` 含组织标识。

成功时返回组织标识、持久名称、种类，以及上级组织标识。没有上级时不编造上级。名称按保存的原文返回。调用者看不见该组织时是 `not-visible`。不返回成员名单。SDK 不自动再送。

### `query-organization-members`

需要有效登录。行事租户必须等于当前选择，但它不必是 `body` 里那个组织的租户。成员资格按 `body` 的组织单独核对。`body` 含组织标识。`includeRemoved` 省略时为 false。

false 时，任何当前有效成员得到该组织当前有效成员和角色。true 时，只有具有该读资格的人得到已解除成员，数组里没有当前有效成员。默认团队的这个资格是当前有效超级管理员。没有该资格的人把 true 送入时是 `denied`，并且没有成员数组。不改成只返回有效成员。看不见该组织时是 `not-visible`。SDK 不自动再送。

### `query-invitation`

需要有效登录。`body` 含邀请标识。

被邀请账号，或发出组织里具有该读资格的人，可以得到该邀请的当前终结状态、到期时刻和双方标识。默认团队的这个资格是当前有效超级管理员。其他人是 `not-visible`。未找到也是 `not-visible`。状态无法判定时是 `basis-unavailable`，不把未判定说成待处理或过期。SDK 不自动再送。

### `query-received-invitations`

需要有效登录。`body` 为空对象。

成功时只返回调用者自己收到的成员邀请。没有跨账号的超级管理员入口。`completeness` 为 `complete`。SDK 不自动再送。

### `query-issued-invitations`

需要有效登录。调用者必须具有 `actingTenant` 所属组织上该读面的模型资格。默认团队的这个资格是当前有效超级管理员。`body` 为空对象。

成功时返回该组织发出的成员邀请。个人组织没有这个读面，对外是 `denied`。普通成员是 `denied`，没有数组。SDK 不自动再送。

### `query-received-affiliation-requests`

需要有效登录。调用者必须具有 `actingTenant` 所属组织上该读面的模型资格。默认团队的这个资格是当前有效超级管理员。`body` 为空对象。

成功时返回该组织收到的隶属请求。普通成员是 `denied`，没有数组。SDK 不自动再送。

### `query-issued-affiliation-requests`

需要有效登录。调用者必须具有 `actingTenant` 所属组织上该读面的模型资格。默认团队的这个资格是当前有效超级管理员。`body` 为空对象。

成功时返回该组织发出的隶属请求。发出方要用它在 `unknown` 之后认回撤回或打开是否成立。普通成员是 `denied`，没有数组。SDK 不自动再送。

### `query-affiliation-request`

需要有效登录。`body` 含隶属请求标识。

只有请求两端组织里具有该读资格的人可以读取。默认团队的这个资格是当前有效超级管理员。其他人，以及未找到，都是 `not-visible`。状态无法判定时是 `basis-unavailable`。SDK 不自动再送。

## 本阶段不提供的操作

下列名字先于封闭字段和登录核验。服务端立刻返回 `stage-not-provided` 和空 `body`。忽略其余字段。不核验登录证明。不查询主体是否存在。

| operation | 对外结果 |
| --- | --- |
| `disable-subject` | `stage-not-provided` |
| `restore-subject` | `stage-not-provided` |
| `end-subject` | `stage-not-provided` |
| `reopen-after-media-loss` | `stage-not-provided` |

旧备份中的角色不授予访问。坏的 `body` 和坏的登录证明都不改变 `stage-not-provided`。

任何其他 `operation` 都是 `protocol-rejected`。

## 三个成员

公开契约拥有本文件中的字段、`outcome`、操作名和重复时的可见后果。它可以引用 identity 已公开的标识纯值。它不引用服务端存储类型、Cordis 类型或 server-entry 的类型。

SDK 依赖公开契约，以及调用者提供的传输适配接口。它不依赖 server-entry。它不依赖服务器存储包。安装闭包以 SDK 发布产物的依赖清单为准。源码能编译不能代替该清单。

服务端接入依赖公开契约，并把已经通过协议检查的请求交给 identity 与 authorization 的公开入口。它不改写允许和拒绝。它不把存储对象放到公开响应里。

```text
client application -> sdk -> public-contract
server-entry -> public-contract
server-entry -> identity and authorization public entries
public-contract does not import sdk or server-entry
sdk does not import server-entry
```

调用形状如下。`messageId` 由调用者生成，下面的值只是占位。

```ts
import { governanceOperation } from "@omne/access-public-contract";

export function revokeOwnLogin(proof: string, targetLoginId: string): unknown {
  return governanceOperation({
    protocolVersion: "governance-public/1",
    messageId: "caller-generated",
    operation: "revoke-login",
    loginProof: proof,
    body: { targetLoginId },
  });
}
```

`revoke-login` 禁止行事租户。服务端接入先做严格 JSON 读取，再进入判断次序。两端对同一个 `outcome` 使用本页的同一解释。

## 这些输入的结果

缺 `loginProof` 只有 `denied`。留存期内同标识同凭据的接续在激活完成时是 `succeeded`。已经激活后再注册是 `not-loginable`。陌生账号接受邀请是 `not-visible`。过期邀请返回已有的过期终结，不写成新的接受。`query-current-tenant` 不带行事租户，并能返回当前选择。`issue-login` 的 `basis-unavailable` 不来自凭据已匹配的分支。四个阶段外操作在坏 `body` 和坏证明下都是 `stage-not-provided`。

重复 `protocolVersion` 的读取结果由 json-text 的 `duplicate-key` 表示。本页把该结果映射为 `protocol-rejected`。json-text 不选择一个版本。

## 仍不在本页决定

- 成功业务访问如何报告。identity ID-11 继续拥有该公开形状。这些治理操作不代替那份报告。
- 人工决定的答复消息。需要决定时只返回原请求标识。
- Session 的公开接入。
- 传输协议、登录证明的密码学形式、存储和页大小。
- 资产确认时刻。它归资产读面，不是这些治理消息。
