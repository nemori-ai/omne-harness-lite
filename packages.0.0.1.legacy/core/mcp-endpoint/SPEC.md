# MCP endpoint 行为承诺

类型及必要校验拥有形状，本页拥有默认2的描述、快照、声明与接纳规则。本包无 IO、连接、OAuth 迁移或动作执行，实际桥和持有治理负责这些效果。

## 端点与动作

stdio command 是程序，不是 shell；args 不插值、不展开，作者 env 缺席不隐式补表，完整进程环境归桥。command 至少含一个不属 identity-values 固定空白集合的码点，否则 command_empty。URL 仅作句法检查：小写 http／https，无 fragment／userinfo；URL 必须绝对且有合法主机，整串无空白或控制字符，主机禁 /、?、#、反斜杠；非法即 url_invalid，不 trim、补 scheme 或删 userinfo 再收。允许 http，不声称阻止秘密 query、args 或 env。

身份只在能力标识；登记端点名字时收窄，不改写或截断。动作名串拼接只前向，跨端点仍可能碰撞，不能拆串反推来源。对端动作不另有能力身份，费用归端点。

动作 snapshot 属具体持有，不属于正文。fetched 是全部分页拿完且原次序不改；not_fetched 不等已知空。descriptor 扩展原样保存，inputSchema 仅判对象、不编译修补；完整性由桥证明，部分分页不能称 fetched。

## 绑定与声明

OAuth binding 只属于租户持有，revoked 终态须新 id 重发起；renew 不改 state／since。binding 可呈现，凭据引用不可；合法形状不授迁移资格。credential 无 default，缺席无法连接，续期／失效不自动改配值；发行方和原持有由真正写面核。非凭据引用值归治理 valueOutOfDomain，不造新 MCP 失败。

四固定声明只依正文：connectionTarget 是 placement_identity，域引用 McpTransport，default=transport；credential 同类，域引用 Asset Model CredentialRef，无 default；connectTimeout／callTimeout 是 preference，域为正 Duration，default 分别取 timeouts.connect／call。不产保留项或 governance；execute:<remoteName> 为 permission，域 [forbid,auto,ask]，default 原样取 permissions.execute.default；逐动作原名产生，只有显式 fetched 才产生。全部返回保自有 actionSnapshotKind，不因未知快照丢固定项，不按数组长度推知识；未提供时 marker 值为 undefined，不丢其成员。

execute 配值按动作名字，不按 descriptor 内容；动作消失保配值，重现恢复原配值，读面不能清理。同名换内容保配值是现行行为，不从内容变化默认再次确认。

工作区只能配两项超时偏好且不加锁；目录自带端点无 credential 来路，要鉴权就连不上。execute 一律 ask，usableBy 为挂载工作区的租户本人，不采用作者权限 default；stdio 逐件默认禁用，须租户显式启用。上述效果归求值消费者；纯描述判断不能证明已授权或连接成功。

## 接纳、验证与边界

先 malformed M1／M2，再 transport_unknown → command_empty → url_invalid → snapshot_missing_time → name_not_projectable → name_reserved_sequence，再其余 malformed；kind 类型错仍 transport_unknown，不把优先级压成末尾一个 malformed。

规范输入核 URL／stdio、完整分页知识、原 descriptor、声明 marker、名字和首拒绝。固定 Schema 图构建生成、首次实际消费加载，缺资源／定义／生成物原抛，不降级或回退。真实连接、发行方、分页全量、凭据保密与撤权另由桥和治理验证。settings 页快照选择、同名碰撞、动作换内容是否再确认及外网明文政策仍归真正拥有者限定。

## 跨边界消费责任

OAuth id 在每节点不可猜且部署范围唯一，不用进程内自增号替代；每个接收边界重验描述、快照及绑定形状／原归属。真实授权和持久状态不因连接同进程存在就已成立。

connect 超时覆盖进程拉起、握手直到分页动作清单全部拿齐，不在握手完成时提前停止计时；call 超时从发出计到答复。真实桥消费者拥有计时／取消，纯 Duration 值不证明已按该边界运行。
