# session-log v3 规范实例

这些是输入与预期，不是执行结果。`s`、`T`、`R`、`r`、`m` 和 `kr/km` 都是示意值，不规定业务键编码。每次 `append` 均显式给 `fence` 和 `condition`。条目记为 `⟨tenant, run?, attempt?, payload, dedupeKey?, readKeys⟩`；共享身份、无损 JSON、键和批内校验沿[契约 S-6～S-19](contract.md#s-6-条目与它的壳)。本文中的 Run 事实仅由示例写方生产和识别，不代表生产 Run 终结表示已定型。

## 成功、空日志与三操作

| 步骤 | 调用或事实 | 预期 |
|---|---|---|
| 1 | 从未追加的 `s`：`readSince(s, 0)` | `entries=[]; tail=0`，是成功事实 |
| 2 | `append(s, [⟨T, —, —, {x:1}, k, {k}⟩], unfenced, tailEquals{tail:0})` | `positions=[1]; tail=1`，整批提交并定下租户 T |
| 3 | `append(s, [⟨T, —, —, {x:2}, k2, {}⟩, ⟨T, —, —, {x:3}, k3, {k}⟩], unfenced, unconditional)` | `positions=[2,3]; tail=3`；不要求尾相等，其他判定仍在 |
| 4 | `readByKey(s,k)` | 位置 1、3，尾 3；局部筛选结果不构成完整前缀 |
| 5 | `readSince(s,1)` | 位置 2、3，尾 3。与步骤 2 后已合法取得的完整前缀 1 合并，才能构成完整前缀 1..3 |
| 6 | `readSince(s,3)`／`readSince(s,9)` | 两者条目为空，实际尾均为 3；后者不是完整前缀证明 |
| 7 | `append(s,[合法条目],unfenced,tailEquals{tail:999})` | `tailChanged{tail:3}`，未来尾是合法形状，不是 invalidInput |
| 8 | 无判重键、无业务唯一性要求、无先前未知追加：`append(s,[⟨T,—,—,{x:4},—,{}⟩],unfenced,tailEquals{tail:2})` | `tailChanged{tail:3}`，确认本次零写；无需补造业务身份或认回键 |
| 9 | 步骤 8 后合法完整重读到 3，重构同类无键批，`append(s,[⟨T,—,—,{x:4},—,{}⟩],unfenced,tailEquals{tail:3})`，期间无追加 | 成功，位置 4；若期间再次改变尾则仍 tailChanged，不保证“重交就是又一条” |
| 10 | 同类无键调用曾收到 unavailable，随后一次旧尾调用收到 tailChanged | 只确认后一次零写，前次仍未知；没有自动认回或幂等重试保证 |

依据：[S-7](contract.md#s-7-日志位置与尾位置)、[S-13](contract.md#s-13-提交与持久)、[S-18](contract.md#s-18-readbykey按读取键读)、[S-19](contract.md#s-19-readsince从某个位置往后读)、[S-32～S-34](contract.md#s-32-显式追加条件)。

## 正常响应、边界写方和无关写方

前提：日志已经有 `R` 尝试 1 的合法开始和原发出 `r`；结算者 P 已从一次完整读取获尾 2，并构造原发出尝试 1 的不晚响应。以下各支独立运行。

| 交错 | P 的追加 | 预期与恢复 |
|---|---|---|
| 没有中途写方 | `append(s,[响应 r],unfenced,tailEquals{tail:2})` | 成功；响应内容按提交前事实正确 |
| 边界写方以 `fenced{R,2}, unconditional` 先写尝试 2 | 同上 | `tailChanged{tail:3}`，P 本次零写；认回未发现 r 且无未决旧写者，完整重读到 3，以原 r、原发出尝试 1 构造 late 响应，`unfenced,tailEquals{tail:3}` 才能提交 |
| 边界写方在仍为尝试 1 时提交真实 Run 终结 | 同上 | 同样尾冲突；仅用尝试栅栏无法识别该交错。重读后 late，由消费者解释终结 |
| 入站／runner 等无关写方 `unfenced,unconditional` 追加普通条目 | 同上 | 即使不影响 late 也冲突；重读事实不变，可仍构造不晚响应。不能以“无关”跳过比较 |
| P 先成功，之后才写尝试 2 或终结 | 追加已完成 | 原响应不改为 late，历史提交事实保持 |

所有冲突只重建未提交批，不再次发模型请求、不改变 ResponseId、不把结算改成 fenced。正常无回复、中断、宿主撤除的结算都适用；对账入口还须始终依据原发出 attempt，而非当前追加条目壳的新 attempt。依据：[S-33～S-36](contract.md#s-33-尾改变与判定顺序)；这些业务准则的拥有者及必要版本迁移见[传播表](consumer-impact.md)。

## 独立回复整批与撤除结算竞争

双方使用同一稳定响应 r 的判重键 kr，读取键可认回原批。回复方另持稳定消息 m、键 km。二者从完整前缀读到尾 2。

| 次序 | 操作 | 必须观察到 |
|---|---|---|
| 回复方先到 | `append(s,[消息 m(km), persisted 响应 r(kr)],unfenced,tailEquals{tail:2})`；撤除方随后 `append(s,[interrupted 响应 r(kr)],unfenced,tailEquals{tail:2})` | 前者整批成功，后者 `alreadyRecorded{keys:{kr}}`，优先于 `tailChanged`。按 kr/km 认回先到的完整批；不得以新 interrupted 值覆盖 persisted |
| 撤除方先到 | 先提交单条 interrupted 响应，回复方再交同一完整批 | 回复方 `alreadyRecorded`，**消息 m 一并零写**，不能先落消息再补响应 |
| 边界先到 | 双方旧尾都尚未提交时出现尝试 2／Run 终结 | 两次都是 tailChanged；重读重建后争同一 kr，最多一方留下响应；消息仍只能随自己获胜的响应同批 |
| 只命中部分未知键 | 任意候选批的一部分键已有条目 | alreadyRecorded 仅列真实撞键；消费者按稳定身份检查整批，不能把“一部分存在”冒充“本次全部候选已提交” |

依据：[S-8](contract.md#s-8-判重键)、[S-13](contract.md#s-13-提交与持久)、[S-17](contract.md#s-17-append追加一批条目)、[S-22](contract.md#s-22-回执丢失与结果未知)、[S-35](contract.md#s-35-条件冲突后的责任与进展)。

## 零写、优先级和无损数

| 输入或并存条件 | 预期 |
|---|---|
| 空日志，合法 T1 批，`tailEquals{tail:1}` | `tailChanged{tail:0}`；随后 T2 批以 `tailEquals{tail:0}` 成功，位置从 1 起，证明前次没有初始化租户、占键或留位置洞 |
| tenant 不同、旧 fenced attempt、键已在、尾不同同时成立 | tenantMismatch；除去租户冲突则 attemptSuperseded；再改 unfenced 则 alreadyRecorded；再换为从未用过的键则 tailChanged |
| 请求畸形且以上判定冲突同时成立 | invalidInput 在一切判定之前 |
| 判重所需权威状态读不到，猜测的尾可能不同 | unavailable；不得越过不可得的先行判定返回 tailChanged |
| 抽象尾 `9007199254740993`，请求同值 | 比较相等；输入 `9007199254740992` 则 tailChanged，不能先转浮点让二者相等。此例是边界 oracle，不要求为测试预建数千万亿条日志 |
| payload 含大整数、精确小数，合法追加后读回 | 原样、数无损；条件能力不解析或修正 payload |

## 全部失败值及缺席

| 值 | 反例 |
|---|---|
| invalidInput | 缺 session、tenant、fence、condition、必需 payload 或 readKeys；空批；run/attempt 只给其一；非整数／负 attempt；批内租户不同、判重键重复、读取键重复；键空串；带 position；非法 JSON／重复 JSON 成员；fenced 的条目归属不合；condition 未知分支、额外成员、tail 缺席／负数／小数；readByKey 缺 key；readSince 缺 after／after<0。已合法的大于实际尾不在此列 |
| tenantMismatch | 日志已定 T1，合法 T2 批 |
| attemptSuperseded | R 的尝试 2 已有条目，以 fenced{R,1} 交尝试 1 批 |
| alreadyRecorded{keys} | 批内至少一个判重键在已提交日志中；返回实际撞键集合，整批不写 |
| tailChanged{tail} | 全部先行判定通过，tailEquals 仍与实际尾不同 |
| unavailable | 任一所需权威判定、完整读取或确认写入不可得；读不返回空，追加不声称零写 |

依据：[S-15～S-19](contract.md#s-15-缺席时的默认答案)、[S-32/S-33](contract.md#s-32-显式追加条件)。

## 未知回执与恢复

| 场景 | 正确行为 | 禁止推断 |
|---|---|---|
| 完整回复批已提交，回执丢失，随后无关追加改变尾 | 以 kr/km 合法认回同一完整原批；旧尾重试判重优先，原值不变 | 新尾变了，所以原批没写 |
| 旧追加尚在途，先按键读得缺席，之后旧追加提交 | 保留未知；先落实旧写者实际停止／隔离，再作权威恢复读取 | 缺席读证明永远没有，另铸 r 或 m |
| 未知后新调用收 attemptSuperseded／tenantMismatch | 它只否定新调用；合法认回原批，权限不足时明确失败并保留责任 | 新拒绝证明旧操作没写，或允许绕过租户授权认回 |
| 确认旧写者已静止，权威恢复读确认原批未提交 | 重新完整读，按原身份和当前事实重建未提交批，以新 tailEquals 提交 | 自动改 fenced、重发已经发出的模型动作 |
| 回执未知且读不可用／结果不完整 | unknown 责任仍归原消费者，不能返回已结算 | unavailable = 零写 |

[S-22/S-23](contract.md#s-22-回执丢失与结果未知)、[S-35](contract.md#s-35-条件冲突后的责任与进展)。这不取代 RT3 对 unknown opened、旧网络资源实际停止与模型重发资格的规定。

## 旧五类模型与六条真实场景保留

原判重并发、栅栏并发、易失判重、陈旧拒绝可达、重复拒绝可达的模型义务仍在；对应普通写的 condition 显式为 unconditional。停机重排、栅栏、回复批、租户、稠密读取和不可用的真实场景见[契约 S-26～S-31](contract.md#s-26-判重停机重排不多一条)。新条件不削减旧场景；正式执行状态见[验证入口](../verification.md)。
