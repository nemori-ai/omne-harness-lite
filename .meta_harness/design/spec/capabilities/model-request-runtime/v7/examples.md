# 规范实例：走通的路径与每个失败值的反例

## v5 增量：同次响应头的交接与留存

这些是本候选的规范预期，**全部未执行**，不是测试报告。RT5-H1～H6 是本 topic 的验收分组，不是新操作、领域状态或失败值。完整 MR7 数据实例见 [MR7 examples](../../../data/model-response/v7/examples.md)；本契约没有另一个 Schema。以下函数场景均先满足 S-54 的完整合法输入、精确适配绑定和原政策参数；不靠缺省配置补齐。服务场景另外满足授权、完整前缀、原锚点和 S-17/S-68～S-73 的前提。

公共样本 `H` 是同次 send 已实际取得、已按显式 S-20 政策处理、成功留存的值：

```json
{
  "x-single": " a,b ",
  "x-many": ["second", "first", "second", ""],
  "x-one": ["only"],
  "x-empty-string": "",
  "x-empty-array": []
}
```

相等按 MR7 原值判：逐 key 的原串或原数组形状、数组逐元素顺序和重复均相同；不声明对象 key 的线序或 HTTP 原始行序。`x-single` 不能去空白或拆逗号，`x-one` 不能降成 string。另单独用已取得且已留存的 `{}`、未取得时缺席两种输入；两者不能互换。样本不是任何脱敏政策的默认值。

| 分组 / 场景 | 输入和执行路径 | 完整观察 oracle / 最小反例 |
|---|---|---|
| RT5-H1 / 原形 | S-58 公共结果带 `rawHeaders=H`；成功 `R` 只有不透明读取能力，不提供可读 `headers`；随后正常 complete | S-54 结果 `rawHeaders=H`，S-17 完整响应 `raw.headers=H`；其他字段按原结果。去空白、join、取首、去重、排序、空数组变缺席、单元素数组变串任一发生即失败 |
| RT5-H1 / 空与缺席 | 依次交 `rawHeaders={}`、完全缺 `rawHeaders`，其余合法输入相同；另让已发出但未取得头的失败结束 | 第一结果有空 map，第二和第三缺该属性。缺席时不得补 `{}`；已有空 map 不得当作没有留存 |
| RT5-H1 / 坏值 | 分别让不合规提供者交 null、数字、bool、数组根、嵌套对象，以及头值 `["ok",1]`、`[null]`、`[["x"]]` | 均不是合法端口输出或 MR7 完整响应值；不得强转、滤掉坏项或包装为合规 `rawHeaders`。这是提供者违约反例，本版没有为该违约新增恢复结果／失败代码 |
| RT5-H1 / 自有原值 | S-58 交出 H 后，原运输资源关闭；底层原容器被后续读操作改动，或调用者试图改动原数组 | 已交付结果及完整响应的 H 均不变；对哪个实现对象如何复制或冻结不作指定。类型上的 readonly 不能代证该性质 |
| RT5-H1 / 既有拒绝优先 | 非法调用输入同时带预取消；另测合法输入在 plan 前及 plan 后、send 前取消 | 非法先 `invalidInput`；合法走 `cancelledBeforeSend`、零 send，无 ModelInvocationResult、无 `rawHeaders`、无新 ResponseOutcome。服务已经写出的锚点仍按原规则收场 |
| RT5-H2 / HTTP 成功 | 真实 TLS 响应已取得 H，正文分别 complete、truncated，另测 JSON 与流两种既有读取面 | 同次 send 与 invoke 公共结果均保留 H；不要求用户从 R 取值。结果/usage/cost/上游事实沿原成功规则，原四 outcome 不扩充 |
| RT5-H2 / HTTP 失败 | 非 2xx 响应已取得 H，错误正文可正常读完；另在读错误正文时中断及显式取消 | 每支已发出的结果均带 H；HTTP 状态和故障来源不被改写。取消按原 interrupted，不能因没有完整错误正文退成无头的发送前分支 |
| RT5-H2 / 带内与读取故障 | HTTP 成功且有 H 后依次发生带内错误（有整数 code / 无 code）、流读取中断、解析失败；分别在首内容前/后发生 | 每支 H 均保留；原 S-18 对来源、inBand、状态缺席和首内容后故障分类仍成立。HTTP 成功码不能代填带内无 code；不把本地错误改归上游 |
| RT5-H2 / 门失败 | 已取得 H 后首内容门失败，装配曾准备内容但从未获准外显 | H 保留，blocks 空，门失败按既有本地 unrecognized；没有 firstTokenAt、snapshot 内容或 onAccepted。用“没有内容”删 H 是反例 |
| RT5-H2 / 取消竞态 | 取得 H 后取消与正常终局竞争；分别让取消先定和完成先定，再重复读 outcome、释放 R | 终局只定一次，胜出的原四值分支均保留 H；重复读不重发，资源释放不改 H。发 signal 不能当成实际停止；沿原停止证据核释放 |
| RT5-H3 / 只有头 | 服务器发头 H 后暂停正文；观测 beforeFirstContent 次数、snapshot、onAccepted、arrival、firstTokenAt、诊断及上下文 | 无新增内容/首 token，门调用仍为零；H 只沿结果边界交接，不产生 header arrival/observer。正文首内容到来时才按原门规则推进；诊断 detail 无完整 H |
| RT5-H3 / 无双源 | S-58 公共 H 与 R 内部故意设置另一私有值；S-59 也试图交另一值 | 合规调用者只消费公共 H；read 不产生第二权威、不覆盖 H。不得为两份值发明优先级、广播或回调；S-59 的不合规输出需被负控暴露 |
| RT5-H4 / 原函数与服务回归 | 按本文件原有成功、拒绝、失败、适配、门及结算全部场景重跑；请求参数、绑定、usage/cache/cost 各取可区分的已知零与未知值 | 十三服务操作九项、原守卫顺序、四 outcome、最多一次发送、无隐藏重试/重定向、实际停止均保持；头不能补金额、身份、参数或 upstream 实际值 |
| RT5-H5 / 完整响应同批 | S-54 H 交到合法服务；分别走 runtime 单响应和 persisted 回复方 msg+rsp 一次 append；关旧物理 writer 后 reopen | 读到符合 MR7 的完整响应，`raw.headers=H`，msg 与 rsp 原完整批、同次身份与账均保持。不得仅测孤立 map 序列化；两个真实写方都要覆盖 |
| RT5-H5 / 原批和未知 | 已存在 rsp 原批头为 H；迟到结算候选携带不同 H2；另按 V-8/V-9 置 response/opened unknown、迟到提交 | 原批 H 不变；unknown 仍强门，取消/新 fence 不证明原写方停止，不因取得头而放行普通响应或重发。只有既有权威恢复后才认回原批或重构未提交批 |
| RT5-H5 / 秘密哨兵 | 测试显式提供既有 S-20 三项政策值；上游头中含可识别测试哨兵，另有不敏感 H；检查 send/invoke 公共输出、全部响应写方、日志及 reopen | 敏感值按所给政策处理后才交出，禁止哨兵泄漏；非敏感原形保持。未给政策不能自选 redact/drop/pass 默认；Schema 合法不算此项通过 |
| RT5-H6 / 公开制品 | 从公开构件与 invoke 入口消费同一组合法及非法 literal，覆盖项目要求的双语消费者；不访问私有 R 或内部源码 | compiled 形状损坏、取消后丢 H、头当 token、仅旧 MR4 可接收等负控必须使相应断言失败；仅 TS 静态类型成功不算实现通过。core 公共接收与制品入口须先明确采用 |

RT5-H5 还须覆盖完整响应 raw.body 独立缺席／按原附件责任留存的两支。函数不为满足样例新造附件 IO；留存失败不阻止原响应收场，不借此主动丢已保留 H。可用原样本配合 MR7 全部合法终局与非法跨字段实例，不能用头合法盖过原回复／失败／身份拒绝。HTTP 库是否暴露每种空数组等值与 HTTP 线序不在本契约承诺内：真实运输负责其实际观测值；其余形状由公开端口 literal 场景覆盖，不伪造线上采集证据。

## v4 增量：结算竞争与恢复

以下都是待执行场景，结果是规范预期。`s/r/a1/a2/c/rsp/msg` 仅代表已合法取得的会话、Run、尝试、调用、ResponseId、MessageId；测试中的 Run 终结条目由场景驱动实际写出并提供其认法，不冒充生产认法。各场景的初始日志都是同一授权会话的稠密前缀，有真实 dispatched 锚点；金额/绑定/原参数用不同可辨值检查原样保留。除明确 unknown 的场景外，opened 已知且无潜在旧写者。

| 场景 | 操作与交错 | 必须观察到 | 不得观察到 |
|---|---|---|---|
| V-1 新尝试先提交 | A 从 tail=t 读得原 a1 当前、Run 未终结；B 写 a2 的开始；A 以 unfenced+tailEquals(t) 写响应 | tailChanged 只说明 A 这批零写，位置/键不占；策略允许后合法重读，仍用 rsp、原 a1 与原参数，late=true 整批提交 | 把归账壳的新 a2 当原发出尝试；将 tailChanged 归 upstream_unavailable；新增 send |
| V-2 同尝试 Run 终结先提交 | 与 V-1 相同，但 B 写原 Run 终结，不更换 attempt | 重读后 late=true；不能只查“更大 attempt” | 将 model_call_ended 认作 Run 终结；认不出生产终结时填 false |
| V-3 响应先提交 | A 在 Run/attempt 边界之前成功提交 late 缺席响应，B 后写边界 | 原批原值不变；之后读仍是该原响应，晚来的结算者认回 | 追改 late=true，补第二条账或调用上游 |
| V-4 两个结算者同 ResponseId | runtime 的单响应批与回复方 msg+rsp 批从同尾出发；分别跑两种提交顺序 | 单响应先胜：回复方同批零写，无 msg；回复批先胜：runtime 认回 rsp 及 msg 完整原批，不再写；始终一 rsp/一账 | 两方各加 owner 前缀让同 rsp 都写成功；败方仍有孤 msg |
| V-5 回复批不可拆 | persisted 方提交前注入崩溃/拒绝/丢回执；分别观察实际提交前/后 | 提交前二者都无；提交后二者都在且互相关联。ack 未知时不得先报 persisted；权威恢复后认原完整批 | 先 msg 后 rsp；碰撞后只补缺的一半；msg 更换 ID 后重交 |
| V-6 碰撞不是认回 | 注入仅有同 msg 键的无关/不符载荷，或 rsp 键指向不能认证的原值；append 得 alreadyRecorded | 本次零写；完整原批认不出即 unavailable，原责任保留，不改键、不补批 | 仅凭 keys 非空或数量相等就完成；把半批拼成权威响应 |
| V-7 noRun | 原调用没有 run/attempt；无关条目可在准备/提交间追加 | 显式 unfenced+unconditional，late 缺席；全批和共同身份保持，成功后才结算；unknown 仍按 V-8/V-9 | 虚构 Run 身份或 late=false；误要求 Run 尾谓词；丢失唯一主体约束 |
| V-8 先前 response unknown，后次尾冲突 | 第一次批 ack 丢失且物理 writer 仍可能写；后次尝试遭 tailChanged/tenantMismatch/attemptSuperseded | 后次仅 THIS 零写；未知责任、rsp/msg 不变。停全部旧写方并权威恢复后，有完整原批则认回，无原批才能按策略重构未提交批 | 后次拒绝证明第一次没写；旧 writer 未停就据旧尾缺席再次提交或放行模型重发 |
| V-9 opened unknown | opened 已提交丢 ack，或门等待取消后旧 append 才提交；分别让普通失败、interrupt 后续、host 撤除、reconcile、settleReply、外部回复进入结算 | 全部强门，不交内容/普通响应/失败主体/重发许可。实际停止网络、门、全部追加和结算者后，在 S-33 时机权威读回 opened，firstTokenAt 取原时刻；意图存在则优先 | Signal/outcome/卸载/fence 代替实际停止；零可见内容就填写无 firstTokenAt；在线另开恢复入口 |
| V-10 无关追加争用 | 无关业务反复写全本日志尾，但 Run 两件事实均不变 | 仍 tailChanged；每次策略允许后从合法前缀重构，原 late 值可不变；只能再交同一批身份 | 为减少冲突只比较 Run 局部尾；紧循环；拿返回冲突尾直接重交 |
| V-11 耗尽/取消/政策缺失 | 对 V-10 显式给零剩余预算或取消决策；另测必需策略未交 | dispatch/dispatchAgain 未结算则 unavailable、保持未完成；S-49 unavailable/reply_pending；S-33 unavailable/无部分结果。保留锚点/意图/owner；不新增领域状态 | 默填重试次数、用模型 default_retry_backoff；报告 settled/resumable/awaiting_decision 或重发 |
| V-12 interrupt 返回时点 | 先成功写意图并返回 phase，随后响应持续争用直至耗尽 | 既有成功返回不追改，后台仍有 owner，恢复沿 S-33；意图本身失败时 unavailable 且无 abort | 等待响应写好才返回意图成功；因后台未结算抹掉意图 |
| V-13 settleReply 处置竞争 | 同处置重交、另一合法处置先提交、非法 persisted 参数分别运行 | 完整同处置认回返原结果；不同合法原批 alreadyEnded；参数 persisted 为 invalidInput，均无新批 | 将合法已有不同处置改成 unavailable 或覆盖；写失败时把 reply_pending 改成故障 |
| V-14 非完整或非法前缀 | 按键筛选+tail、另一会话尾、断档缓存、没有全读权限或无法识别 Run 终结 | 相应推进 unavailable，不进入 append；不猜“没有 opened/Run 未终结”，原责任仍在 | RAF 两个独立 bool 与尾拼接；fixture/default 假授权替代读权 |
| V-15 host 释放与未结算 | host 停止后实际执行已停，结算因政策耗尽仍未写；另测仍有旧 append | 可释放的连接释放，未完成锚点及 S-33 责任保留；仍可能写的任务必须持有 owner 到实际收束 | 把关连接或卸载完成认作结算成功；遗弃旧 unfenced 写者 |

日志侧失败的输入分支另逐一运行，顺序不能被本能力改写：condition 缺席/额外成员先 invalidInput；合法请求 tenantMismatch 先于 attemptSuperseded，后者先于 alreadyRecorded，最后才判 tailChanged。必要判定不可得或写入未确认为 unavailable，不能跳过前项。原服务输入非法仍沿 S-14 与操作⑥；内部日志返回不直接扩成新的 runtime 失败值。普通锚点已知未提交与未知的原分支分别执行，不能将每个 unavailable 都按“已知未提交”记 unrecognized。

以上覆盖 S-68～S-73；完整旧成功/拒绝/失败实例继续适用。多值 headers 的本候选表达见 RT5-H1～H6；G-31 的正式采用／提供者／真实链未完成，不选拼接、取首或静默丢弃作为“通过条件”。

### 补充规范向量：未知回执与条件进展

下表是独立表达评审后的待执行向量，区分本实例未确认的处理责任与权威耐久事实；不增加命令身份、自动重放或恢复调度承诺。

| 场景与交错 | 必须观察到 | 不得观察到 | 依据 |
|---|---|---|---|
| 当前 M1，selectModel(M2) 确知未提交；分别令无其他切换、另一命令已提交 M3。另测 M2 已提交但回执丢失；以及旧写者未停、先读 M1 后才提交 M2 | 本次均 unavailable；确定未提交只保证本次没产生切换，前两支权威选中分别 M1/M3。已提交丢回执一支权威选中为 M2；读得 M2 不证明它来自本次未知命令。旧写者仍可能提交时，读 M1 不关闭未知；权威读取不可得仍 unavailable | 所有 unavailable 都保留 M1；将读得目标值当命令恰一次凭据；缺席读后自动重放；回滚已写切换 | S-9/S-27⑧/S-43/S-72 |
| releaseCall 的调用终结已提交，但回执丢失；与确知未提交一支分别运行 | 未确认时 unavailable、保留本实例处理责任；不能据本地旧阶段授予再发。权威认回 handed_up 后重复调用沿 S-32⑦ alreadyEnded；确知未提交只证明本次未产生终结 | unavailable 就保证没有耐久终结；未收束旧写者时据缺席读重新追加；本地 awaiting_decision 冒充权威可再发状态 | S-6/S-14/S-32⑦⑧/S-72 |
| settleReply 的完整响应批已提交但回执丢失；分别让重调提交相同处置、不同合法处置 | 原次 unavailable，保留本地 reply_pending 处理责任且不改既定收场；权威完整批认回后，同处置返回原结果、不同处置 alreadyEnded；没有第二响应或孤立消息 | 本地 reply_pending 推出耐久响应不存在；未知未闭合便再次追加；把未确认描述成回滚或新的领域阶段 | S-6/S-49⑦⑧/S-70/S-72 |
| 收场/宿主停止/重新承载先触发，但合法前缀不可得、争用政策预算内没有提交机会，或只保留 owner 而恢复从未实际调用；分别运行 | 依各操作保留 unavailable/未完成责任，不宣称已结算或可以重发。只有既有恢复实际调用且可执行、全部前提齐全并获得政策允许的真实提交机会，才能适用条件进展；义务仍未完成时如实保留 | 第一次触发即承诺成功；owner 留存等同未来获调度；从未执行恢复却声称有限时间内必有响应 | S-17/S-33/S-71/§八进展性质 |


## 继承 v3：正例与反例

所有标记均为占位，不是某个生产模型的认证。以下预期不代表已运行。

| 场景与输入 | 必须观察到 | 禁止观察到 | 条款 |
|---|---|---|---|
| runner 识别系统默认重试件；声明 name 为 `omne-official:default-retry`，位置为 `after_model_call`，维度为 `{ending:failure}` | 按能力标识 `{category:loop_extension,name:"omne-official:default-retry"}` 指认，算法与替换规则沿 S-35 | 以实现名或同位置的另一件认作系统默认件；给 `power` 写 `retry` 或 `record` | S-35、S-67；LC6 S-4/S-7/S-20 |
| C1 用 V1 打开；注册 V2；目录明确改成 V2；C1 先后发往允许的 A、B；另打开 C2 | C1 两次使用相同完整 V1，C2 使用 V2；两次「已出门」和对应响应快照保持绑定 | C1 第二次用 V2；仅保存版本名不保存配置值 | S-7、S-53、S-65.1 |
| 两份不同档案配置 revision 都叫 `r1`，values 分别为 X、Y | 每次用自己快照中的值；revision 在档案身份内解释 | 全局按字符串 `r1` 取配置导致串值 | S-53 |
| V1 首发未开口即退出；重启只注册 V2 | reconcile 仍用原记录追补并回 `resumable`；再次取得 V1 时 `unavailable`，无新增请求 | 对账自动联网、代换 V2、改写旧绑定、把缺实现说成模型下架 | S-33、S-53、S-65.2 |
| 独立 invokeModel 显式交入传输、快照、已解析工具定义、凭据、政策 | 一次 send，得到 ModelInvocationResult；无会话日志写入与目录读取 | 返回伪造 tenant/session/credentialScope；宣称自动耐久结算 | S-54 |
| 工具名数组代替已解析定义，或期待 invokeModel 从 report 解析 | `invalidInput`，零 send | 偷读全局资产目录或补当前 report | S-54、S-57 |
| beforeFirstContent pending 时反复 snapshot | 门前快照无内容；通过后同一位置流继续，门只成功一次 | 门前看见首内容；每个 delta 重复开门 | S-55 |
| 门抛错；另一次在门等待时 abort，随后门成功 | 抛错那次 local/unrecognized、无 firstTokenAt/内容；取消那次不因门迟到成功恢复输出 | 锚点未写先推内容；门错误变成 upstream_unavailable；abort 返回就宣称资源已停止 | S-55、S-56 |
| opened 已提交，beforeFirstContent 收 unavailable；函数 failed/unrecognized、无 firstTokenAt | 服务面 unavailable、未结算、零可见内容，无失败主体或 retry；旧追加/流实际收束且栅栏有效后在 S-33 时机权威读回 opened，追补 interrupted/runtime_lost，firstTokenAt 取锚点，终结且不重发 | 直接写无首 token 的 failed 响应，让 reconcile 因已有响应跳过；据函数无内容删 opened | S-15～S-17、S-33、S-55 |
| opened 回执未知，但实际未提交；恢复时旧追加已收束、栅栏有效，完整权威读取确认不存在，且无中断意图 | 恢复前一直 unavailable；S-33 按无 opened 行追补 interrupted/runtime_lost、无 firstTokenAt、resumable；只有调用方随后显式 dispatch 才可能续发 | 未读回就当未提交；恢复自动 HTTP；把未知直接结算成 unrecognized | S-17、S-33 |
| interrupt 意图已持久；取消在 opened 门等待期间，函数 interrupted 无 firstTokenAt，旧追加迟到提交或丢回执 | 原门不再放内容；先隔离，待实际静止及有效栅栏后权威读回；S-33 中断意图行优先，响应体 initiator 取意图、firstTokenAt 取 opened，没有虚构回复或 delivered | 把函数 timing 当耐久 timing；取消请求或 outcome 返回就当旧追加已停止；已有中断意图仍回 resumable | S-16、S-17、S-31、S-33、S-55 |
| 原追加仍可能提交，或读取只有不能证实包含其结果的旧尾；另一条无 Run 调用的旧属主尚未静止 | 继续 unavailable、未结算、零可见内容，拒绝续发；不按空读判无 opened | 用缓存 tail、空结果、attemptSuperseded 或本地取消标记证明未提交；双属主同时恢复 | S-17、S-33 |
| 系统停止时 opened 回执未知，无耐久中断意图；之后失去连续性并在 S-33 时机恢复，两支分别确知 opened 无/有 | 停止时先隔离；恢复按真实日志：无 opened 追补 interrupted/runtime_lost、resumable，有 opened 追补 interrupted/runtime_lost、锚点 firstTokenAt、调用终结；均不自动重发 | 把内存系统停止原因恢复成已持久 run_cancelled；新增中断意图；只因曾系统停止而禁止既有无 opened 恢复 | S-17、S-33、S-36 |
| 表示合法，取消在 plan 前或 plan 后 send 前成立 | `outcome = {cancelledBeforeSend: true}`，零 send，snapshot 无内容，无 sentAt、ModelInvocationResult 或 ModelResponse | 先发一次再“取消”；凭空记费用为零；把它加为第五个 ResponseOutcome | S-54、S-56、S-58 |
| 非法输入同时已取消；另一条有效输入规划拒绝已成立后再取消 | 前者 `invalidInput`；后者保留规划拒绝；每个句柄仅一终局 | 取消掩盖表示错误、后到取消覆盖已定拒绝 | S-54、S-56 |
| send 已开始后取消，即使尚不知触达上游 | 最终收场为 interrupted，保留已知发送事实与未知账；实际停止由 outcome 确认 | 改成 cancelledBeforeSend；把可能计费抹成零 | S-54、S-56 |
| 两会话有同名 callId；观察端口却归另一个会话或 dispatch | `invalidInput{observer_scope_mismatch}`，不向错误端口发内容；输入时能判的错在联网前拒绝 | 依靠观察者收到后自行过滤 | S-62 |
| 明确有界观察端口，消费者持续阻塞/抛错 | 满队列为 `rejected{buffer_full}`，抛错为 `rejected{consumer_failed}`；失败计数及位置可查，结算保持 | 内存无界增长、业务响应被丢、消费者错误变上游故障 | S-62、S-63 |
| “已出门”已持久，连接仍 queued；首内容时限到 | local/unrecognized，记录本地阶段；来源未知时同样不猜触达 | upstream_unavailable 引发错误换家判断 | S-18、S-21、S-65.6 |
| usage.cache_read_tokens 为 0、未知、正数三次；实际供应商一次缺席 | 三者分别保留，未知实际供应商保持缺席 | 将未知写零；用请求 provider 填 servingProvider；凭发送 cache_control 声称命中 | S-54、S-59、S-63 |
| 诊断 sink 失败，与“已开口”确知未提交两条路径 | 前者记录观测缺口但不改业务；后者阻止内容并收 local/unrecognized；回执未知另走 S-17 隔离 | 两种失败混成一种；无诊断又宣称全链路覆盖 | S-55、S-63 |
| 当前输入真实读取并纯求值，含两个时限而无 model；新会话尚无模型切换记录 | 该求值说明无锁；新会话仍须显式 selectModel 写真记录，随后可求有效模型 | 目录第一行、根属性或默认值自动产生初选；从历史 E 反推当前输入 | S-9、S-10、S-66、G-20 |
| 历史 manifest E 合法，但当前端口缺配置、真实源不可读、root/版本非法、缺时限或输入不一致 | unavailable，零 HTTP，无新锚点/响应/终结，来源诊断可辨 | 以旧 E、固定配置、伪改 root.version 或 fixture 顶替 | S-10、S-21、S-66、G-9 |
| C1 已打开；配值改 model 及两个时限而不 reload；再计算新 C2 basis 并让 C1 再发 | C2 basis 使用新 model；C1 原模型/适配绑定不变，但下一次发出使用当前两个时限 | 清单没 reload 就继续用旧配值；为 C1 重选模型 | S-7、S-21、S-66 |
| sessionTenancy 读得租户 T，端口却交 input.tenant=U；另一条源读取期间版本变化且无法一致核对 | 各为 unavailable，零 HTTP；不把 U 的内容用于 T | 调用方补租户、跨会话查同形源、拼接不同版本为成功 | S-66 |
| 捕获 standing=effective；本机当前权威/采用副本显示失效，或当前资格未知，或内部调用无权 | 各为 unavailable、零 HTTP；无新锚点/响应/终结 | 仅凭旧 captured effective 放行 | S-66 |
| 当前有效性及内部权限核实通过；捕获 standing 与当前 roles 有变化 | 捕获 standing 仅作会话求值配方，当前持有/配值现读；不以配方替代当前授权检查 | 逐请求向中心改写会话身份或 roles；跳过 AE4 PRE-3 | S-66 |
| 注册表固定根配方与现读 holding 选版不符 | C16 不满足，明确失败且零 HTTP | runtime 改 holding 为 pinned 或偷偷改根配方消除失配 | S-66 |
| 历史已有发出，恢复传入新 messages 缺工具结果；修正后再试 | 首次 invalidInput 且保持 resumable，无新发送/响应/终结；修正后重新 plan | 用“规划只会首发拒绝”绕过校验；把旧调用记为 undispatched | S-28、S-29、S-66 |
| 历史已有发出，恢复新消息含快照不支持的模态 | invalidInput{reason:modality_mismatch}，零 HTTP，保持 resumable；允许修正或显式 releaseCall | released{cause:modality_mismatch}、新响应体或抹去历史发出 | S-28、S-29、S-66 |

**函数与服务不能互相冒充的验收**：纯函数成功只能证明传输/内容门/结果投影；服务面验收还必须核租户归属、两条耐久锚点、ResponseId 判重及回复共同提交。反过来，服务面能运行也不能代替“无 Cordis/会话/存储即可独立调用”的验收。

**`retryDelay` 的规范向量（S-60）**：数值仅为测试输入，不是政策默认值；时长均沿同一单位，结果不取整。`u` 为明确输入的 uniformSample。

| 输入 | 预期 |
|---|---|
| base=10、max=100、factor=2、n=3、jitter=none；kind 依次 constant/linear/exponential；u=0 | 10 / 30 / 40 |
| D=40；full/half；u=0 | 0 / 20 |
| D=40；full/half；u=0.999 | 39.96 / 39.98；随 u 趋近 1 均趋近 40，但 u<1 时不等于 40 |
| base=0、max=100、factor=2、n=1；none/full/half，u=0.7 | D=0，三者均为 0 |
| exponential，base=10、max=25、factor=2、n=3、jitter=none、u=0 | 25；先截在 max，不给 40 |
| decorrelated，base=10、max=100、factor=2、n=1、previousDelay=10，u=0 / 0.999 | lo=10、hi=20；10 / 19.99，第一次 previousDelay 显式等于 base |
| decorrelated，base=10、max=25、factor=2、n=2、previousDelay=20，u=0 / 0.999 | lo=10、hi=25；10 / 24.985 |
| decorrelated，base=10、max=0、factor=2、n=1、previousDelay=10、u=0.7 | lo=hi=0，结果 0 |
| n=0、负/非有限时长、factor<1、u<0 或 u≥1、未知 kind/jitter、缺必需输入；decorrelated 第一次 previousDelay≠base | 各自 invalidInput{malformed}；没有等待、随机抽样、默认补值或发送副作用 |

服务面已写「已出门」后发生函数发送前取消时，服务面仍按自己的耐久锚点结算；不得因函数结果没有响应体而抹掉已发生的日志事实。

属于 `capability.model-request-runtime` v5 candidate 的规范工件。本契约**不附 Schema**，这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前七节各走通一条路径，第八节给每个失败值一个反例，第九、十节走同路由名的几行：一个名字一条，落到胜出行（PF-013 rev 12），第十一节走交回之后的收口与只读守卫。

**两条读法上的边界：**

- **标识串只是占位**：`c1`、`r_1`、`s1` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）；响应体只写与本节有关的成员。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| 会话 `s1` | 属于租户 `T = (O, A)`；当前 Run `run_1`、第 1 次尝试 |
| 档案 `M1` | 官方档案，在册；允许的供应商 `[A, B]`、允许回退；输入模态 `text` |
| 档案 `M2` | 官方档案，在册；允许的供应商 `[A]`、不允许回退；输入模态 `text`、`image` |
| 凭据 | `T` 的租户层配了一把 |
| 本据点传输能承载的模态 | `text`、`image`、`file`（没有 `audio`） |
| 选中模型 | `M1`（最后一条模型切换的记录记的名字）。**`M1`、`M2` 既指那一行档案，也指它的路由名**——除第 9、10 节外链上没有同名的别的行，名字与行一一对应 |
| 适配绑定 | 每份档案均有有效 `adaptation`，其 `definition.modelId` 与自己的路由名相等；实现与定义的精确版本可取得，配置值在对应档案内解释。前十一节未逐行重写此共同前置 |

## 1. 两家发出：第一家 429 未开口，第二家完成（场景 [S-41](contract.md#s-41-两家发出第一家-429-未开口第二家完成)）

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `effectiveModel(s1)` 得 `e1` | `e1 = { routeName: M1, profile: M1, selectedBy: session, selected: M1 }` | [S-26](contract.md#s-26-effectivemodel) |
| 2 | `openCall({ run: run_1, attempt: 1, session: s1, messages, target: M1, basis: e1, tools: [], … }, 宿主, 追加入口)`（没有拓展件改目标，不给 `targetChangedBy`） | `{ callId: c1, state: open }`；**日志里什么都没写** | [S-28](contract.md#s-28-opencall) ①④ |
| 3 | `dispatch(s1, c1, 尝试 1)` | 日志先出现「已出门」（第 1 次、`A`、`r_1`，带着绑定：`M1` 的引用与快照、实际发出的参数、`selectedBy: session`、`credentialScope` 为 `T` 的租户层；尝试 1 在条目壳上），然后请求出网；A 回 429；返回 `r_1`：`failed{upstream_unavailable}`、`statusCode: 429`、没有 `firstTokenAt`，**已写**；`c1` 在 `awaiting_decision` | [S-15](contract.md#s-15-两个锚点先写后行)、[S-29](contract.md#s-29-dispatch) ⑤ |
| 4 | 默认件读到策略类、下一家是 `B` ⇒ `retry { provider: B }` | —— | [S-35](contract.md#s-35-默认重试件可替换) |
| 5 | `dispatchAgain(s1, c1, { provider: B }, 尝试 1)` | 「已出门」（第 2 次、`B`、`r_2`）→ 出网 → 首 token 之前写「已开口」→ 内容交给观察者 → 收尾；返回 `r_2`：`complete`，带 `reply`，**交回、未写**；`c1` 在 `reply_pending` | [S-30](contract.md#s-30-dispatchagain)、[S-16](contract.md#s-16-首-token-判据) |
| 6 | 回复过了「消息落盘之前」，loop 把 `r_2`（`replyDisposition = persisted`）与回复消息一次提交写下 | 日志里：两条响应体、两份账、一条回复消息；`c1` 在 `complete` | [S-17](contract.md#s-17-结算一处按序幂等先到者赢) |

## 2. 开口之后断流：不重发（场景 [S-42](contract.md#s-42-开口之后断流不重发)）

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `openCall` → `c2`；`dispatch(s1, c2)` | 「已出门」→ 出网 →「已开口」→ 内容交出一半 → 连接断 | [S-15](contract.md#s-15-两个锚点先写后行) |
| 2 | （`dispatch` 返回） | `failed{interrupted_mid_reply}`、有 `firstTokenAt`、已交付的块在 `delivered`、没有 `reply`；**已写**；`c2` 在 `awaiting_decision` | [S-18](contract.md#s-18-成因按来源分类三类事实由守卫兑现)、[S-29](contract.md#s-29-dispatch) |
| 3 | 一件自定义重试件给 `retry { provider: B }`；runner 先问 `canDispatchAgain(s1, c2, { provider: B })` | **`{ refused: { why: already_spoke } }`**——哪怕 `B` 从没试过；直接调 `dispatchAgain(s1, c2, { provider: B })` 同样得 `retryRefused{already_spoke}` | [S-50](contract.md#s-50-candispatchagain)、[S-30](contract.md#s-30-dispatchagain) 守卫 1 |
| 4 | `releaseCall(s1, c2)` | 调用终结 `released`（不带 `cause`），`{ state: handed_up }`；上交条目与中断提醒由 loop 写 | [S-32](contract.md#s-32-releasecall) |

## 3. 停机：首 token 之前与之后

| 情形 | 日志里 `c3` 最后一次发出 | `reconcile(s1, 尝试 2)` 追补 | `c3` 随之 | 之后 |
|---|---|---|---|---|
| 首 token 之前停机 | 「已出门」（第 1 次、`A`、`r_5`，带着绑定）；无「已开口」；无响应体 | `r_5`：`interrupted{runtime_lost}`、没有 `firstTokenAt`、账全未知、`late: true`；**`route` 的有效模型、快照、`selectedBy`、`credentialScope` 取自那条「已出门」**（其间档案被改过也不变）；**参数三项同样取自它**：「已出门」上带着传输适配定下的 `parameterAdjustments`（例如 `[{ name: maxOutputTokens, requested: 8000, sent: 4096 }]`），`r_5` 照抄它，`route.parameters` 是合并之后那一组把 `maxOutputTokens` 换成 `4096` 的那一组（[S-33](contract.md#s-33-reconcile) ④） | `resumable` | `openCall({ callId: c3, session: s1, run: run_1, attempt: 2, … })`（绑定从「已出门」读）→ `dispatch(s1, c3, 尝试 2)`：第 **2** 次发出、发给 **`A`**、所在尝试 2 |
| 首 token 之后停机 | 「已出门」「已开口」；无响应体 | `r_5`：`interrupted{runtime_lost}`、`firstTokenAt` 取自「已开口」、账全未知、没有 `reply`、`late: true`；`route` 同上取自「已出门」 | `interrupted` | **不再发出**；`dispatch(s1, c3)` 得 `alreadyEnded`（调用已终结，先于 `retryRefused` 判）；中断提醒由 loop 补 |
| 用户叫停之后停机 | 「已出门」、中断意图（`user`）；无响应体 | `r_5`：`interrupted`、`initiator = user` | `interrupted` | **不是 `resumable`**（场景 [S-47](contract.md#s-47-用户叫停之后停机不再发出)） |
| 刚打开就被叫停、随即停机 | 只有中断意图（`user`）；一次都没发出 | 调用终结 `interrupted{initiator: user}` | `interrupted` | 意图是一条耐久记录，这次调用要有终态 |
| 不属于任何 Run 的调用（旁路提问）首 token 之前停机 | 同第一行 | 同第一行，但没有 `late`（它不属于任何运行） | `resumable` | 由会话重新承载时的 `reconcile(s1)`（不带尝试）收口 |

依据：[S-33](contract.md#s-33-reconcile) 对账表与 ②④。再对一次账：什么都不追补，返回同样的结果（⑦）。

## 4. 切换先落事实后生效（场景 [S-43](contract.md#s-43-切换先落事实后生效)）

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `c4` 正在 `M1` 上发出 | —— | —— |
| 2 | `selectModel(s1, M2)` | 模型切换的记录写下之后返回 `{ selected: M2 }` | [S-27](contract.md#s-27-selectmodel) ④ |
| 3 | `c4` 收场 | 它的 `route.profile` 仍是 `M1` | [S-7](contract.md#s-7-一次调用绑定了什么) |
| 4 | `effectiveModel(s1)` | `{ routeName: M2, profile: M2, selectedBy: session, selected: M2 }` | [S-9](contract.md#s-9-选中模型) |
| 5 | 再 `selectModel(s1, M2)` | `M2` 合法、与当前选中相同 ⇒ 不写新记录，返回 `{ selected: M2 }` | ⑦ |
| 6 | 上层把「用哪个模型」锁成 `M1`，`effectiveModel(s1)` | `{ routeName: M1, profile: M1, selectedBy: layer_lock, selected: M2 }`——**展示列表仍标 `M2` 为选中** |
| 7 | 上层锁成 `M2`（与选中相同），`effectiveModel(s1)` | `{ routeName: M2, profile: M2, selectedBy: layer_lock, selected: M2 }`——**被锁就是 `layer_lock`，不论锁定的名字与选中是否相同** | [S-26](contract.md#s-26-effectivemodel) ⑤ | [S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2 步 |

以上是成功路径。失败分支分别取新起点 M1：本次切换确知未提交且无其他切换，仍选 M1；其他命令已切 M3，则选 M3；本次 M2 已提交但回执丢失，返回 unavailable 也不能否认权威 M2。读到某个选中值不认定本次未知命令已提交，旧写者未停时读到 M1 也不证明它不会随后写成 M2；不自动重放。详见本页补充规范向量与 S-27⑧。

## 5. 已下架的档案（场景 [S-44](contract.md#s-44-已下架的档案)）

管理员撤回 `M1`，选中模型仍是 `M1`。

| 调用 | 预期 | 依据 |
|---|---|---|
| `legalTargets(s1)` | 不含 `M1` | [S-11](contract.md#s-11-合法目标集合) |
| `displayList(s1)` | `M1` 仍在，注记 `{ withdrawn }`、`selected: true`——没有胜出行，**不对它判模态与凭据**；其余合法目标各带 `legal` | [S-12](contract.md#s-12-展示列表) |
| `openCall(…)`（没有拓展件改目标） | `{ state: handed_up, undispatched: withdrawn }`；日志里一条调用终结记录；**没有响应体** | [S-28](contract.md#s-28-opencall) 出门前检查第 1 行 |
| `effectiveModel(s1)` | `{ profile: M1, … }`——**不替用户改选** | [S-9](contract.md#s-9-选中模型) |
| `selectModel(s1, M1)` | `notLegalTarget{because: [withdrawn]}`——与当前选中相同也不成功：先判合法、再判重复 | [S-27](contract.md#s-27-selectmodel) ⑦ |
| 随后 `M1` 恢复在册（经官方清单装入），用户什么都没做；`legalTargets(s1)` | 又含 `M1`；`displayList` 上 `M1` 注记 `{ legal }`、`selected: true` | [S-11](contract.md#s-11-合法目标集合)、`data.model-profile/v5#S-10` |
| 接着 `openCall(…)` | `{ state: open }`，有效模型仍是 `M1`；日志里没有新的模型切换的记录 | [S-9](contract.md#s-9-选中模型) |

## 6. 模态不兼容挡在算合法目标那一刻（场景 [S-45](contract.md#s-45-模态不兼容挡在算合法目标那一刻)）

会话里进来一张图（没有 transcript）。

| 调用 | 预期 | 依据 |
|---|---|---|
| `legalTargets(s1)` | 含 `M2`、不含 `M1`（`M1` 不收图） | [S-11](contract.md#s-11-合法目标集合) |
| `displayList(s1)` | `M1` 标 `{ modality_mismatch }`、`selected: true` | [S-12](contract.md#s-12-展示列表) |
| 会话里再进来一段语音（没有 transcript），档案 `M3` 声明收文本、图、语音 | `M3` **仍在**合法目标（合法目标只有三项）；选中 `M3` 之后 `openCall` 以 `undispatched{modality_mismatch}` 上交——本据点传输送不出语音，可发出的另一条前置不成立；**`M2` 此时也不在合法目标里**（它不收语音） | [S-11](contract.md#s-11-合法目标集合) 末段、[S-28](contract.md#s-28-opencall) 出门前检查第 3 行 |
| 另一个会话 `s3` 里同样一张图、**落盘之前**被转换件配上了 transcript；`legalTargets(s3)` | 含 `M1`——有 transcript 的块不进投影。**`s1` 里那张图不会事后补上 transcript**，`M1` 在 `s1` 里一直被挡 | [§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)、`capability.modality-projection/v2#S-6` |

## 7. 默认重试件：不允许回退的档案

选中模型换成 `M2`（不允许回退）。第一次发出 A 回 503。

| 步 | 预期 | 依据 |
|---|---|---|
| 默认件读到策略类，档案不允许回退 | 给一次 `retry { provider: A }`（同家）⇒ 第 2 次发出仍给 `A` | [S-35](contract.md#s-35-默认重试件可替换) 第 3 条 |
| 第 2 次发出 `A` 又回 503 | 默认件**不再给 `retry`**（同家至多一次），交回 ⇒ loop `releaseCall`，调用终结 `released`，上交 | 同上 |
| 一件自定义件给 `retry { provider: B }` | `retryRefused{provider_not_allowed}` | [S-30](contract.md#s-30-dispatchagain) 守卫 3 |
| 一件自定义件给 `retry { provider: A }` | 放行：第 2 次发出仍给 `A` | 同上 |

## 8. 每个失败值一个反例

| 失败值 | 调用 | 为什么 | 依据 |
|---|---|---|---|
| `invalidInput{malformed}` | `openCall({ run: run_1, session: s1, … })`（缺 `attempt`） | `run` 与 `attempt` 只给了一个 | [S-28](contract.md#s-28-opencall) ① |
| `invalidInput{malformed}` | `openCall({ …, target: M2, basis: e1 })`，`e1.routeName = M1`，没给 `targetChangedBy` | 目标变了却说不出是谁改的 | [S-28](contract.md#s-28-opencall) ③ |
| `invalidInput{malformed}` | `dispatchAgain(s1, c1, { provider: B, target: M2 })` | 计划里出现目标——换模型不是重试能做的 | [S-30](contract.md#s-30-dispatchagain) |
| `invalidInput{parameter_out_of_range}` | `openCall` 的 `parameters` 把 `temperature` 给成域外值 | 合并之后过不了参数校验；**不是一次上交** | [S-28](contract.md#s-28-opencall) 出门前检查第 5 行 |
| `unavailable` | `legalTargets(s1)`，作用域求值读不到 | 判不出来，**不返回空集** | [S-24](contract.md#s-24-legaltargets) ⑧ |
| `unavailable` | `interrupt(s1, c1, user)`，中断意图写不进 | **不发中止信号** | [S-31](contract.md#s-31-interrupt) ⑧ |
| `profileNotFound` | `selectModel(s1, "vendor/never")` | 这个名字在链上没有任何一行 | [S-27](contract.md#s-27-selectmodel) |
| `profileNotFound` | 选中模型那个名字的行在存储里丢了，`displayList(s1)` | 与 `effectiveModel`、`openCall` 同一个值；**不是 `unavailable`**，交付面不该据此重试 | [S-25](contract.md#s-25-displaylist) ⑧ |
| `notLegalTarget{because: [modality_mismatch]}` | 第 6 节的局面里 `selectModel(s1, M1)` | `M1` 不收图；`because` 恰一项 | [S-27](contract.md#s-27-selectmodel) |
| `callNotFound` | `interrupt(s1, c9, user)`，`c9` 是会话 `s9` 里的调用 | 这个 `callId` 不在 `s1` 里——**哪怕 `s9` 里有同名的 `c9`，也不串过去** | [S-5](contract.md#s-5-一次调用一次发出)、[S-14](contract.md#s-14-缺席时的默认答案与失败集合) |
| `alreadyEnded` | 第 1 节之后 `interrupt(s1, c1, user)` | `c1` 已在终态 | [S-31](contract.md#s-31-interrupt) |
| `alreadyEnded` | 第 1 节第 5 步之后、第 6 步之前（`c1` 在 `reply_pending`）`interrupt(s1, c1, user)` | 收场已定，中断改不了它 | [S-31](contract.md#s-31-interrupt) ② |
| `alreadyEnded` | 第 1 节之后 `dispatchAgain(s1, c1, { provider: A })` | 调用已终结——**不是 `retryRefused`**，已终结只有一个值 | [S-30](contract.md#s-30-dispatchagain) |
| `runtimeStopped` | 宿主停止中 `openCall(…)` | 不开新调用 | [S-36](contract.md#s-36-宿主停止与撤除) |
| `retryRefused{already_spoke}` | 见第 2 节第 3 步 | 开过口 | [S-30](contract.md#s-30-dispatchagain) 守卫 1 |
| `retryRefused{fact_class}` | 第一次发出上游回 401（`credential_unavailable`）之后 `dispatchAgain` | 重试没用；`canDispatchAgain` 同样答 `{ refused: { why: fact_class } }` | 守卫 2、[S-50](contract.md#s-50-candispatchagain) |
| `retryRefused{provider_not_allowed}` | 见第 7 节 | 不允许回退 | 守卫 3 |
| `wrongPhase{phase: in_flight}` | `dispatch` 在途时另一路又调 `releaseCall(s1, c1)` | 这次发出还没收场 | [S-32](contract.md#s-32-releasecall) |
| `wrongPhase{phase: awaiting_decision}` | 第 1 节第 3 步之后（`c1` 在 `awaiting_decision`）`settleReply(s1, c1, { vetoed: … })` | 没有交回的回复可收口 | [S-49](contract.md#s-49-settlereply) |
| `invalidInput{malformed}` | `settleReply(s1, c1, persisted)` | 落盘成消息的那一条只能由调用方与消息同一提交写 | [S-49](contract.md#s-49-settlereply) ③ |

**判定次序的回归例**：

- 一次开过口、此刻在 `awaiting_decision` 的调用上 `dispatch(s1, c2)` ⇒ **`retryRefused{already_spoke}`**，不是 `wrongPhase`（[S-30](contract.md#s-30-dispatchagain) 末条、[S-29](contract.md#s-29-dispatch) ⑥ 的次序）。
- 一次**没开口**、此刻在 `open` 的调用上 `dispatchAgain(s1, c, { provider: B })`，且快照不许回退 ⇒ **`wrongPhase{phase: open}`**，不是 `retryRefused{provider_not_allowed}`——守卫 2、3 只在 `awaiting_decision` 时求值（[S-30](contract.md#s-30-dispatchagain) ⑥）。
- 会话日志读不到时 `interrupt(s1, c1, user)` ⇒ **`unavailable`**，不先判出 `callNotFound`（[S-14](contract.md#s-14-缺席时的默认答案与失败集合) 末段）。
- `c1` 在 `reply_pending` 时 `settleReply(s1, c1, { vetoed: … })` ⇒ **成功**，不是 `alreadyEnded`——`alreadyEnded` 的「收场已定」那一分句不适用于 `settleReply`；同一刻 `interrupt(s1, c1, user)` 才得 `alreadyEnded`（[S-14](contract.md#s-14-缺席时的默认答案与失败集合) 失败值表）。

## 9. 同路由名按层覆盖：一个名字一条，落到胜出行（场景 [S-48](contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行)）

另一个会话 `s2` 属于租户 `U = (O, B)`；**`U` 没配自己那一把**，部署给出厂格配了 `K_F`。除 `M1`、`M2` 外，`O` 的组织层建了一条自建档案 `M1c`，**路由名与 `M1` 相同（记作 `r`）**、在册、输入模态 `text`。`s2` 的选中模型是 `r`。

| 调用 | 预期 | 依据 |
|---|---|---|
| `legalTargets(s2)` | `{ r, M2 的名字 }`——**`r` 一个元素**，胜出行是 `M1c` | [S-11](contract.md#s-11-合法目标集合) |
| `displayList(s2)` | `r` 一条：`ref = M1c`（主标：自建 · 组织层），注记 `{ legal, credential_missing }`（按 `M1c` 的来源问）；`covered = [{ ref: M1, 注记 { overridden_by{organization(O)} } }]`——官方那一行只作标注、选不了 | [S-12](contract.md#s-12-展示列表)、[S-25](contract.md#s-25-displaylist) |
| `effectiveModel(s2)` | `{ routeName: r, profile: M1c, selectedBy: session, selected: r }` | [S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步、[S-26](contract.md#s-26-effectivemodel) |
| 随后 `openCall(…)` | `{ state: handed_up, undispatched: credential_unavailable }`——**缺凭据不滤，不落到 `M1` 去用 `K_F`**；这是裁决写明的代价 | [S-10](contract.md#s-10-有效模型四步每步来源可查) 代价一段、[S-28](contract.md#s-28-opencall) 出门前检查第 4 行 |
| `U` 配上自己那一把之后再发一次 | `r` 不再带 `credential_missing`；发出的 `route.profile` 是 `M1c`、`route.credentialScope` 是 `U` 的租户层——组织层建的档案，成员调它用成员自己那一把 | [S-10](contract.md#s-10-有效模型四步每步来源可查)、[S-19](contract.md#s-19-凭据每次发出现取取值只交给传输适配) |

## 10. 三层同名、锁与已撤回的行

接第 9 节，`U` 已配自己那一把 `K_U`；`U` 又在自己那层建了一条 `M1t`，**路由名也是 `r`**、在册、输入模态 `text`。`s2` 的选中模型仍是 `r`。

| 调用 | 预期 | 依据 |
|---|---|---|
| `effectiveModel(s2)` | `{ routeName: r, profile: M1t, selectedBy: session, selected: r }`——租户层最具体；发出时 `route.profile = M1t`、`route.credentialScope` 是 `U` 的租户层 | [S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步 |
| `displayList(s2)` | `r` 一条：`ref = M1t`，注记 `{ legal }`；`covered` 是 `M1c`、`M1`，各带 `overridden_by{tenant(U)}` | [S-12](contract.md#s-12-展示列表) |
| `O` 把「用哪个模型」锁成 `r`，`s2` 另选了 `M2` 的名字 | `{ routeName: r, profile: M1t, selectedBy: layer_lock, selected: M2 的名字 }`——锁的是名字，供应商、参数、凭据取胜出的 `M1t` | [S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2、2′ 步 |
| 锁撤掉、选回 `r`；`U` 撤回 `M1t` 之后 `effectiveModel(s2)` | `{ routeName: r, profile: M1c, selectedBy: session, selected: r }`——**已撤回的 `M1t` 不参与**，组织层的 `M1c` 胜出；`openCall` 照常，**不是改选**（选中的仍是 `r`） | [S-9](contract.md#s-9-选中模型)、[S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步 |
| 同一时刻 `displayList(s2)` | `r` 一条：`ref = M1c`，注记 `{ legal }`；`covered` 是 `M1t`（注记 `{ withdrawn, overridden_by{organization(O)} }`）与 `M1`（注记 `{ overridden_by{organization(O)} }`） | [S-12](contract.md#s-12-展示列表) |
| `O` 也撤回 `M1c` | 下一次 `r` 落到官方 `M1`；`covered` 里 `M1t`、`M1c` 各带 `{ withdrawn, overridden_by{factory} }` | [S-10](contract.md#s-10-有效模型四步每步来源可查) |
| 官方清单也撤掉 `M1`（链上三行都撤回了） | `effectiveModel` 给出 `profile = M1t`（落点：链上同名都撤回时取最具体的那一行）；`openCall` 以 `undispatched{withdrawn}` 结束——**「已下架」说的是 `r` 这个名字**；列表上 `r` 一条、注记 `{ withdrawn }`，没有 `covered`（没有胜出行） | [S-10](contract.md#s-10-有效模型四步每步来源可查)、[S-12](contract.md#s-12-展示列表)；`capability.model-profile-directory/v5#S-17` 末段 |
| `U` 把 `M1t` 恢复在册 | 下一次 `effectiveModel` 给 `M1t`，`openCall` 照常 | [S-10](contract.md#s-10-有效模型四步每步来源可查)；`capability.model-profile-directory/v5#S-33` |

## 11. 交回之后的收口与只读守卫

接第 1 节第 5 步：`r_2` 带着回复交回，`c1` 在 `reply_pending`。

| 情形 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 回复过了「消息落盘之前」 | loop 把 `r_2`（`persisted`）与回复消息同一提交写下 | `c1` 在 `complete`；本能力什么都不写 | [S-17](contract.md#s-17-结算一处按序幂等先到者赢) |
| 回复被转换件否决 | `settleReply(s1, c1, { vetoed: { by: 模态转换件, reason } })` | 本能力写下 `r_2`：`complete`、`reply` 照记、`replyDisposition = { vetoed }`、不带 `failure`；`c1` 在 `complete`、**不再发出**；日志里没有回复消息 | [S-49](contract.md#s-49-settlereply) |
| 同上，再调一次 | `settleReply(s1, c1, { vetoed: … })`（同一个处置） | 返回同一个 ⑤，什么都不写 | [S-49](contract.md#s-49-settlereply) ⑦ |
| 压缩闭包里的那次调用 | `settleReply(s1, c7, { consumed: { by: compaction } })` | 写下 `replyDisposition = { consumed }` 的那一条；账照记 | [S-49](contract.md#s-49-settlereply) |
| 调用方没收口就停了宿主 | （宿主停止） | 撤除写 `r_2`：`interrupted{run_cancelled}`、没有 `reply`、回复的块进 `delivered` | [S-36](contract.md#s-36-宿主停止与撤除) |
| 另一次调用 `c8` 开口了、还在说，宿主（系统发起）停止 | （宿主停止，没有先 `interrupt`） | 本能力对 `c8` 那一次发出的装配状态调 `abandon`、不带缘由——**不交 `finish { reason: interrupted }`**；写下的响应体 `interrupted{run_cancelled}`、没有 `reply`、不带成因，交付过的块进 `delivered`；**没有** `AssistantMessage`（不是 `interrupted_by_user`） | [S-36](contract.md#s-36-宿主停止与撤除)、[S-51](contract.md#s-51-模型侧到达装配前提的承诺) 第 6 条；[D-060 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) |
| 进程丢了 | 新尝试的 `reconcile(s1, 尝试 2)` | 日志里是「已开口、无响应体」⇒ 追补 `interrupted{runtime_lost}`、不再发出 | [S-33](contract.md#s-33-reconcile) 第四行 |

**只读守卫**（`c5` 在 `awaiting_decision`，最近一次 `failed{upstream_unavailable}`，快照允许 `[A, B]`、允许回退）：

| 调用 | 预期 | 依据 |
|---|---|---|
| `canDispatchAgain(s1, c5, { provider: B })` | `{ allowed }`；什么都不写、调用状态不变 | [S-50](contract.md#s-50-candispatchagain) |
| `canDispatchAgain(s1, c5, { provider: C })` | `{ refused: { why: provider_not_allowed } }`——与 `dispatchAgain` 同一张表 | 同上、[S-30](contract.md#s-30-dispatchagain) 守卫 3 |
| 随后宿主进入停止，`dispatchAgain(s1, c5, { provider: B })` | `runtimeStopped`——**`{ allowed }` 只对那一刻成立** | [S-50](contract.md#s-50-candispatchagain) ⑦ |

## v6 增量：输入限额、未处分响应与重试历史

下列全部是规范场景，未开始真实执行；数值是有限测试向量，不是产品 cap 或政策初值。共有前提：明确模型/供应商计量单位、同一精确绑定、合法身份与可用原依赖。预发送拒绝同时观察 `新已出门=0、HTTP=0、新响应体=0、新调用终结=0`；旧已发出的账和记录保持。

| 场景 | 输入/交错 | 唯一可观察结果 |
|---|---|---|
| RT7-I1 | image 档案缺 maxImageBytes，本次只有文字；另例 maxInputTokens 或必需 upstream fact 缺失 | input_limit_missing；不能因本次无图绕过图片档案缺项，不能改变已确认模态 |
| RT7-I2 | upstream token/image 显式 unknown；项目 cap 完整，全部实测量恰等 cap | 通过该门；unknown 不改成 unbounded，不承诺上游必成功 |
| RT7-I3 | 正确编码图片解码量 N/N+1 与 cap N；含 padding、嵌套工具图片、两个相同图项 | N 合法，N+1 exceeded；图数逐实际项算，不用 base64 长度；非法编码沿表示拒绝 |
| RT7-I4 | 每张均合规，但总图数或最终 UTF8 完整请求体超过已知有限上游值；请求体含多字节文本/工具/schema 包装 | 独立限制仍拒；不能以逐图通过或媒体字节和放行 |
| RT7-I5 | token 准确量11/cap10；仅可靠上界11而实际未知/cap10；上界10/cap10 | 依次 exceeded、size_unavailable、通过该门；三种与上游 unknown 分开 |
| RT7-I6 | AttachmentRef.bytes 声称1但无授权固定字节；准确计量构件缺席 | 前者 size_unavailable，后者 unavailable；不能联网取引用或从 storage/key 猜租户 |
| RT7-I7 | 服务初发与公开 invoke 同一超限输入；续接换新 tools/messages 后超限 | 两公开路径都拒；续接保持 resumable、旧响应不动；不产生 undispatched 代替已有历史 |
| RT7-I8 | plan 成功后修改原消息/工具/快照/定义，或直接 send 假 planned 对象 | 合法计划仍发原固定值；伪造/变动的计划拒绝；不能在锚点之后加未计量输入 |
| RT7-I9 | 打开后目录改 cap/upstream facts，随后再发；旧格式快照没有 cap | 当前调用仍用绑定副本并逐次计量；旧不兼容格式明确拒绝、不提供旧读/结算路径、不回填或改写原数据，当前在途责任保持 |
| RT7-P1 | complete/truncated/有回复 interrupted，usage/cost、原始头数组/空值、route/upstream 事实均有 | S29 先返回完整 PendingModelResponse，无 replyDisposition/late；ModelResponse 持久入口拒绝该值 |
| RT7-P2 | 调用方分别明确 persisted/vetoed/consumed，期间尾变化与另一写方竞争 | 原事实不变；persisted 消息+响应同批，另两支 S49；late 按同次完整前缀，原合法批优先。不能先填 persisted 后再改 |
| RT7-P3 | 先取得头后读失败/取消；门追加未知；reply_pending 时宿主停止 | 原 RT5 头事实仍保留；opened 未知不能交内容/普通未处分值；停止走原无回复兜底，不新增默认 disposition |
| RT7-R1 | 同一 [A,A]：runtime_lost→续接→策略故障，与 failed→默认 retry→failed | 前者 retryConclusions 无默认结论，默认同家名额仍在；后者有一次，默认件 observed；n 分别1/2 |
| RT7-R2 | 默认 retry 已落，下一次发出尚未发生后重启 | 原结论回放，不重跑同次经过；已给数量1，不因 dispatches=[A] 算0 |
| RT7-R3 | 同一会话两个 callId C1/C2；C1有默认 retry；C2只有自定义 retry | C1 只影响自身；C2保留自定义原结论但默认 h=0，不能按Run聚合或丢掉自定义记录 |
| RT7-R4 | retryConclusions 缺失、归属混杂、日志历史不可读 | 形状/确定错配 invalidInput，不能确认来源 unavailable；不补[]、不计供应商次数；新runner缺modelCallId须拒写 |

旧实例中的“交回响应体”在带回复路径按 S-75 解释为 MR7 PendingModelResponse；在最后显式处分及提交之后才是 ModelResponse。旧失败/无回复分支及 RT5-H1～H6 保持完整响应语义。真实 Run 终结识别不得用通用 bool 或 fixture 关闭 G-28。

### v6 补充：失败主体的只读重取

以下为 S-34/S-76 新只读分支的消费者场景；尚未执行，不由现有 RetryHistory 模型的有限通过代证。

| 场景 | 输入/交错 | 预期与负控 |
|---|---|---|
| RT7-R5 来源恢复后重取 | S29 的 failed 响应已提交，retry 历史暂不可读而 unavailable；随后来源恢复 | 调用保留 awaiting_decision，readAttempts 返回状态、发出和完整 failureSubject；重复读同一前缀返回同值，无HTTP/追加/凭据读取/新增结论/次数消耗。负控：要求重调dispatch、重新写失败响应或读取次数增加h均失败 |
| RT7-R6 未能构造完整主体 | awaiting_decision/最新failed，但缺一段结论历史或响应来源无法确认 | readAttempts 整体 unavailable；不得返回成功却缺failureSubject、部分retryConclusions或默认[]。其他状态不附failureSubject，不借旧failed响应伪造当前主体 |
| RT7-R7 并发变化 | 读取完整前缀P期间或之后追加新的retry结论/发出 | 单次返回所有事实均来自P，不拼P的dispatches与P′的结论；之后再次读可见P′。原返回不授权下一次发送，dispatchAgain自身核当时状态/守卫/fence。负控：mixed-tail主体或据旧结果绕过wrongPhase/alreadyEnded均失败 |
| RT7-R8 恢复对账路径 | S33确认原failed并返回awaiting_decision | 调用者经S34取完整failureSubject；不新增恢复操作、不重新发送、不重复原最终结论；历史仍不可读时沿R6保留责任 |
