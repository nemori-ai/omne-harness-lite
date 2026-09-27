# model-request-runtime 验证与证据

本页记本节点触发的证据义务、实际跑过什么、覆盖到哪里。原始输入与输出归 [record/evidence](../../../../record/evidence/README.md)；契约层的证据状态归[契约验证入口](../../../../spec/capabilities/model-request-runtime/verification.md)，本页只写它们与本节点的关系。**源码不存在，本节点没有任何实现层的证据。**

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| `capability.model-request-runtime/v2#S-15`、`#S-17`、`#S-22`、`#S-30`、`#S-31`、`#S-33` | 形式任务 `model-request-runtime-v2-invocation`：六条有否定配置的不变量 | **已执行**（契约层；run `2026-09-25-formal-assets-runtimes`，退出 0）；绑在 [`bindings.yaml`](bindings.yaml) | 主线；模型改动后重跑 |
| 同上（不允许回退的常量） | 形式任务 `model-request-runtime-v2-invocation-no-fallback` | **已执行**（同一 run，退出 0）；**不绑**：否定配置只在允许回退的常量下演示过 | 主线；要绑须在不允许回退的常量下补否定配置 |
| `#S-41`～`#S-48`、`#S-52` 规范场景 | 包内场景测试：真实 P-2 ＋ 脚本化传输 ＋ 真实会话日志提供者 ＋ 真实存储（sqlite 临时文件库） | 未开始。**G-19 已按 [D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) 闭合**（`A` = 范围里登记的全部档案，由目录读面直接给）：`legalTargets`、`displayList` 与经它们的场景**解阻**（`sessionTenancy`、目录、会话日志用最小提供者 ＋ 测试种子）。**仍受阻**：从没切换过的会话一律 `unavailable`（契约 G-20，MRR-N13），验收装配以种子写一条模型切换记录（契约 S-9、G-20 ②）；写过切换的会话，`effectiveModel` 的锁判与 `dispatch` 的两个时限要读求值结果，挡在 **assembly-manifest G-4**（读法未约定，MRR-N3）——验收装配由最小提供者 ＋ 测试种子给出一份不含「用哪个模型」项的求值（⇒ 没有锁）与时限值；`openCall` 本身不读求值（S-28 ④）；会话日志、保管方、装配清单的最小提供者尚未建包（节点 `session-log-jsonl`、`credential-custodian-local`、`assembly-manifest-store` 已立，MRR-N1～N3）。**函数面**：`invokeModel` ＋ 脚本化传输跑发出、收场、成因、脱敏、装配各支，不受上述任何一处挡。按 D-060 §八 N-35 ①：只在最小提供者 ＋ 测试种子上跑通的记「有前提」，不计入实际验证完成数 | 本节点；各阻断闭合后 |
| 公开函数面 `invokeModel`（[design 的公开面](design.md#公开面)） | 单元测试：不装 Cordis、不给存储与会话，只给档案快照、消息、凭据值与脚本化传输即跑通一次发出；首个内容出现前 `beforeFirstContent` 被 await、它未完成时快照里没有内容；`abort()` ⇒ 收场与账如实；**反证**：同一请求两次 `invokeModel` 就是两次发出（函数层不判「开口之后不再发」、不写锚点）；传输答失败时 `invokeModel` 不自己回退到下一家 | 未开始 | 本节点；有实现即可跑（不受阻） |
| 服务面复用同一个 `invokeModel` | 结构检查：P-2 的发出只经 `invokeModel`；演练：「已出门」确认之后才调它、「已开口」确认之后内容才推给观察者（与绑 S-15 的模型互为两层证据） | 未开始 | 本节点 ＋ `tools/ts-checks` |
| `#S-46` 成因分类与脱敏 | 哨兵串场景：七种失败源、全部记录里找不到凭据原文与其片段 | 未开始；受阻于契约 G-5、G-6（没有值就没有可测的配置） | 本节点；G-5、G-6 定值后 |
| `#S-18`、`#S-21`、`#S-36`：传输交回的事实怎样分成因（[design](design.md#传输交回的事实怎样分成因)） | 场景测试（真实 P-2 ＋ 脚本化传输）：① `first_token_wait_limit` 到点、传输交回 `local{queued}` ⇒ `unrecognized`、`localError` 带排队时长，**不是** `upstream_unavailable`；② 同一时限到点、传输交回 `aborted` ⇒ `upstream_unavailable`；③ 撤除中止、传输交回 `aborted` 或 `local{queued}` ⇒ `interrupted{run_cancelled}`、不进成因分类；④ 带内错误带整数 `code` 而 `httpStatus` 是 200 ⇒ `failure.statusCode` 是那个 `code`、`inBand: true`，结构化日志里有 `httpStatus`、`failure` 里没有；⑤ 带内错误没有整数 `code`（首 token 之前）⇒ `unrecognized`、不带状态码、留 `upstreamError` | 未开始；①已有契约 S-21/S-18 判据（MRR-N15 已闭合） | 本节点；有实现即可跑 |
| `#S-28` ①③④⑧ 工具条目经注册表取、`report` 同在同缺 | 场景测试（测试注册表件按 `capability.asset-registry/v2#S-25` 的答复分法写，或注册表节点的实现）：带 `run` 与 `report` ⇒ 以 `within = run{report}` 取、取到的条目进 `plan`；不带 `run` ⇒ `within = session`；带 `run` 缺 `report`、或带 `report` 不带 `run`、或报告的会话／运行／尝试任一对不上 ⇒ `invalidInput`、不写记录；名字取到「没有」⇒ `invalidInput{unknownTool}`；注册表缺席或答 `unavailable` ⇒ `unavailable`、不写记录、不打开调用；续接按这一次交来的 `tools` 与 `report` 重取；**反证**：尝试中途 reload 之后，同一 `report` 取到的仍是报告所依快照里的那一条定义 | 未开始 | 本节点；有实现即可跑（真实注册表受阻于它自己的节点建包） |
| `#S-13` 投影追到日志尾 | 性质测试：任意日志前缀上，追补后的读 = 对整份日志重算；伸缩测量：读的代价与历史长度无关 | 未开始 | 本节点；有实现即可跑（只依赖测试日志端口的不算——须对 `capability.session-log` v2 的真实提供者，最小提供者即可） |
| 被建模方式吸收的四条（`#S-22` 第 2、5 条，续接同一家，`#S-28` ④） | 场景 `#S-41`、`#S-42`，examples 第 4、8、11 节 | 未开始；同上受阻 | 本节点 |
| 跨 owner 的三条交错（[design 表 X-1～X-3](design.md#跨-owner-的共同存储对象与三条交错)） | 真并发演练 C-1（宿主停止 ‖ loop 写回复）、C-2（旧尝试写「已出门」‖ 新尝试推进并对账）、C-3（不属于运行的调用，旧实例 ‖ 新实例续接）：两副协程、同一日志、插桩让它们在提交前交叠 | 未开始；**受阻**：共同对象 L-2、L-4、L-6 所在的会话日志提供者不存在 | 本节点 ＋ 块 D；日志提供者到位后 |
| 契约 `#S-38` 传输适配十一条 | **逐条归 fork 节点 [`pi-ai-transport`](../pi-ai-transport/verification.md) 的 T-1～T-11**（S-38 第 n 条 ↔ 它的 T-n；第 10 条是 T-10a），本节点不另写一份；本节点只核 P-2 这一侧的次序——「已出门」确认之后才调 `send`（S-15 行） | 未开始；那个节点尚未建包（MRR-N4）；D-019 比较门未过（它的 PAT-N2）；第 1、2、4、5、7 条依赖的上游事实在研究层（契约 G-10） | fork 节点 ＋ 实施程 |
| 假设 H-1（effect 提前撤除） | kernel-basis probe | 未开始 | `packages/core/kernel-basis` |
| 静态检查 | `credentialLookup` 的调用点只在「发出」模块；锚点写只经调用方交来的口 | 未开始（规则未写） | 本节点 ＋ 承载仓库 `tools/ts-checks` |
| `#S-7`、`#S-19` 发起租户的来路（D-060 §八 M66） | 单元测试：`sessionTenancy`（按 `capability.session-tenancy/v2#S-8` 的答复分法写的测试件，或它的最小提供者 ＋ 测试种子）答租户 A ⇒ 取值问法收到 A；读面缺席或答 `sessionNotFound`／`unavailable` ⇒ 那一次操作 `unavailable`，取值问法**一次都没被调**；`openCall` 输入里没有租户这一项 | 未开始 | 本节点；有实现即可跑 |
| `#S-19` 离线凭据收场（D-060 §八 M47） | 场景测试：`credentialLookup`（P-1r 或按 `capability.model-profile-directory/v2#S-20` 写的测试件）答 `credentialUnavailable`（据点离线、保管方 `readReplica` 答 `absent`）⇒ 首次发出 `undispatched{credential_unavailable}`、续接 `released{cause: credential_unavailable}` | 未开始 | 本节点；有实现即可跑 |
| `#S-35` P-5 的策略对象（[D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；[design](design.md#p-5重试策略是一个可配置对象)） | **性质测试**（`retryDelay`）：结果 ∈ `[0, max]`；`jitter: none` 时 `linear`／`exponential` 对 n 单调不减；`full` ∈ `[0, d]`、`half` ∈ `[d/2, d]`、`decorrelated` ∈ `[base, max]`；同一 (策略, n, 种子) 同一结果；默认初值下 n = 1～4 依次 1000、2000、4000、4000。**单元测试**（`decideRetry`）：S-35 五条逐条，含「允许回退时每家至多一次」「不允许回退时同家一次」「没有下一家即试尽」——次数不来自配置；`Config` 不给 `retryPolicy` ⇒ 取默认初值；`kind` 不在枚举、`max < base`、`factor < 1` ⇒ 启动失败 | 未开始 | 本节点；有实现即可跑 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| `2026-09-25-formal-assets-runtimes`，任务 `model-request-runtime-v2-invocation` | `Invocation.tla`（SHA-256 `7dafcaa2…`）＋ `Invocation.cfg`：2 家、允许回退、至多 3 次发出、至多 2 次停机，五个开关全开；弱公平只用于进展性质 | 退出 0，无反例；29,521 generated、15,802 distinct、深度 21 | [run 入口](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md) |
| 同一 run，任务 `model-request-runtime-v2-invocation-no-fallback` | 同上，不允许回退 | 退出 0，无反例；13,861 generated、7,420 distinct | 同上 |
| 六份否定配置（同一模型哈希） | 每份恰拧反一个开关 | 各出预期反例（退出 12） | [契约验证入口「实际执行」](../../../../spec/capabilities/model-request-runtime/verification.md#实际执行) |

**这些是契约层的有限检查**：结论只在所列常量内成立，模型只有一次调用、不含 loop、拓展件、追加口失败与传输；它们**不是本节点实现的验证**，本节点尚无实现。

## 覆盖缺口

- **没有任何实现层证据**：源码不存在。
- **契约里没有形式证据的条款**：S-9～S-13、S-16、S-18～S-21、S-24～S-29、S-32、S-34～S-37、S-49～S-51——证据形式是规范场景与性质测试，全部未开始，受阻原因见上表。
- **S-39** 只有第四条（在途发出不假装没发生）落在 `QuiescentSettled` 上，整条不绑；其余三条靠场景。
- **跨 owner 的三条交错**被模型吸收（一次调用、原子的「写下」），只能真并发演练，演练受阻于会话日志提供者。
- **排队中首 token 时限到点的判据已定**（MRR-N15）：S-21/S-18 明确对上游零请求的 `local{queued}` 收 `unrecognized`。对应真实 P-2 场景仍未运行，不能把表达闭合说成默认重试件已验证。
- **已开口的耐久写延迟**（MRR-N7）没有测量；与会话日志最小提供者 `session-log-jsonl` 的每批 `datasync`（它的 SLJ-2、verification V-13）同一次测量。

## 独立评审

2026-09-25 本节点（修复波 3 对齐之后）随 N4 批经一次独立的架构评审（只读结构核对，无运行）：应修 2、建议 2，总判可进 G5；另有 N5 批（cli）反推出的离线凭据来源。主线据此裁定 [D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M47、M65、M66、M67。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| M-1（应修） | 发起租户（契约 S-7「来自会话」）在本节点没有来路：不在 `openCall` 输入、不在 inject、不在调用时取用，安全性质「不改用别的租户的凭据」的前提无落点 | 按 M66：来路是会话持有租户读面 `sessionTenancy`（与 runner 同一读面，C-13），不进 `openCall` 输入、不改契约 ① | design.md 插件表 P-2 行、操作落点 S-7 行、inject 表新增一行、装配给表凭据一行、依赖表新增一行、MRR-N10；本页证据义务新增一行 |
| M-2（应修） | 装配给表「在册状态变化之后」一行写「单进程装配由 P-1 直读同一份存储」，指向没有节点的装配 | 按 M65：改为「产品装配（cli）：协议给——中心可达时经 P-1r 读中心，据点副本经保管方；`serveBaseFaces: true` 只供尚无节点的开发装配」 | design.md 装配给表第 5 行、插件表 P-2 行、依赖表第一行 |
| M-3（建议） | `defaultRetryBackoff` 无值则不装 P-5，与 cli 清单列了 P-5 冲突 | 按 M67：P-5 的 `Config` 以候选默认 `[1000, 2000, 4000]` ms（至多三次、指数、无抖动）为默认值，cli 照常装；G-8 保持开着，只待产品负责人确认数值 | design.md「值不在本节点」一条、插件表 P-5 行、配置错误政策一段；README；本页证据义务新增一行 |
| M-4（建议） | `openCall` 的宿主句柄形状只在正文里作候选，loop 契约起草者看不到这项义务 | 按 M67：登缺口 MRR-N11，owner C-8 | design.md「一次调用是宿主上的一个 effect」第一条、MRR-N11 |
| N5 B-2（cli 批反推） | 离线调模型的凭据来源 | 按 M47：据点上 `credentialLookup` 由 P-1r 先读保管方里的本地副本；保管方缺席的本版离线如实 `undispatched{credential_unavailable}` | design.md 操作落点 S-19 行、装配给表凭据一行、MRR-N2；README；本页证据义务新增一行 |
| 反证清单 1～5 | loop 把会话级写入也做成调用方交口；H-1 不成立且子作用域代价更高；出现第二条不经 P-2 的发出通道；会话日志契约给不出 L-2／L-4；出现只要选择不要调用的消费者 | 照录为改选条件，本版都未触发（第 1 条已写在 design.md 末段） | 本表 |

## 修订波（2026-09-25 公开面）

依据：[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1、R-2、R-4、R-5，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，[D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-36、N-37。本波只改节点；契约侧（G-19、G-8、S-11）由规格侧并行落，本节点只引裁决与条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-063 R-2、R-5 | 新开「公开面」：`invokeModel`（一次发出）、`TransportAdapter` 与 pi-ai 传输 fork 作公开构件、`classifyCause`、`redact`、S-10～S-12 纯判定、`dispatchGuard`、`decideRetry`、`retryDelay`；P-2 复用 `invokeModel`；跨发出守卫、锚点、结算、SYS-LLM 列为函数层不承诺；登 MRR-N12 | design.md「公开面」、MRR-N12；README；本页函数面两行 |
| P-5 策略对象 | N-36 | `defaultRetryBackoff` 列表改为 `retryPolicy { kind, base, factor, max, jitter }`，默认初值在配置层、与原列表逐次相同；次数由 S-35 推出；自写算术配性质测试，不引库；`decorrelated` 以 (`callId`, n) 为种子（取舍表） | design.md「P-5：重试策略是一个可配置对象」、插件表 P-5 行、S-35 行、配置错误段、装卸表；本页 `#S-35` 一行 |
| G-19 闭合 | D-063 R-4；契约 G-19（`f0998468` 起已闭合） | `A` 由目录读面直接给；`legalTargets`、`selectModel`、写过切换记录的会话的 `displayList` 解阻；`openCall` 按 S-28 ④ 不读求值；`effectiveModel` 的锁判与 `dispatch` 的时限仍挡在 assembly-manifest G-4（报主线） | design.md S-9～S-12 行、inject 表、依赖表、MRR-N3；本页场景行 |
| 会话日志接线 | `capability.session-log` v2 S-6～S-10、S-13～S-19 | L-1～L-8 加「接口契约兑现条款」一列；L-4 改为「在日志条目壳上判、不另存尝试行」；共同对象第 2 条与 X-2、X-3 改写；失败值映射 | design.md 存储要求、跨 owner 一节、依赖表；MRR-N1；bindings 文件头与 S-17 条 |
| 装配清单、会话持有租户、保管方接线 | `capability.assembly-manifest` v2 S-16、G-4；`capability.session-tenancy` v2 S-8、G-2；`capability.credential-custodian` v2 | 服务键不变，改指条款；缺口改写为「接口已定、真承接者未到」；产品装配里会话持有租户恒 `sessionNotFound` 如实写出 | design.md 插件表、S-7 行、inject 表、依赖表；MRR-N2、MRR-N3、MRR-N10 |
| 传输 fork | D-063 R-5 | 基线与托管已定，MRR-N4 改为「只缺节点本身」 | design.md 实现路径、公开面、MRR-N4 |
| G-20 与「没有锁」（对齐契约侧提交 `f0998468` 与主线 2026-09-25 裁定） | 契约 S-9、S-10 第 2 步、S-26、G-20；`capability.asset-evaluation/v2#S-12` | 求值成功而没有「用哪个模型」这一项 ⇒ 没有锁、取第 1 步的名字；读不到才 `unavailable`；从没切换过的会话仍 `unavailable`（新立 MRR-N13：新会话在第一次切换之前发不出请求）；MRR-N3 收窄为锁判与时限 | design.md S-9～S-12 行、inject 表、依赖表、MRR-N3、MRR-N13；本页场景行 |
| G-8 闭合 | 契约 G-8、S-35 | 「值不在本节点」一条改为引契约已闭合的策略对象 `default_retry_backoff`（`kind`／`base`／`factor`／`max`／`jitter`）；上面独立评审 M-3 一行的「G-8 保持开着」是当时的处置，已被本行取代 | design.md「值不在本节点」 |
| 对齐契约第二轮（`47e36d14`）：G-20 口径 | 契约 S-9 末句、S-10 第 2 步、G-20 ①②；`capability.asset-evaluation/v2#S-12` | 措辞核对：求值读不到（求值失败）⇒ `unavailable`，求值成功而 `values` 无此项 ⇒ 没有锁，直接引 S-10 第 2 步；MRR-N13 删去「不当没有锁」，只留初值那一半；验收装配改为以种子写一条模型切换记录 | design.md S-9～S-12 行、MRR-N13；本页场景行 |
| 传输 fork 节点立起（主线 2026-09-25，按 `pi-ai-transport` 的 PAT-N14 ①） | `packages/model/pi-ai-transport`（candidate） | P-2 必需 inject `modelTransport`（关键差异之四，取舍表）、「有意不设的边」删去不 inject 传输；`TransportAdapter` 改 `plan`／`send`／`read` 三段，输入带 `target` 与 `ModelToolEntry[]`，名字到条目的来路登 MRR-N14；`data.messages` S-35 的翻译落在 `plan` 之内；插件表配置列删传输选择，`statusCauseTable` 初值用 `openRouterStatusCauseTable`；关键差异三改为连接池不在 P-2；装卸表与依赖表随之改；MRR-N4 改「节点已立、尚未建包、比较门未过」；S-38 十一条的证据改指那个节点的 T-1～T-11 | design.md 实现路径、公开面、插件表、inject 表、关键差异三与四、装配给表、依赖表、装卸表、MRR-N4、MRR-N14；README；本页 S-38 行 |
| 最小提供者节点互指（主线 2026-09-25） | `session-log-jsonl`、`assembly-manifest-store`、`session-tenancy-table`、`credential-custodian-local` | L-1～L-8 引导段、MRR-N1、MRR-N2、MRR-N3、MRR-N7（与 session-log-jsonl 的 SLJ-2／V-13 同一次测量）、MRR-N10 改为「真承接者未到，最小提供者节点 X 已立（candidate）」 | design.md 存储要求与缺口表；README |
| 第四轮：MRR-N4 规划拒绝 | 契约 S-28 末条、S-29 ④、G-21（它们已闭合 PAT-N9） | MRR-N4 那一句「规划拒绝没有落点」改为已由契约闭合，写明三种拒绝的收场 | design.md MRR-N4 |
| 第四轮：P-2 对传输两种事实的分类（`pi-ai-transport` 的 PAT-N18 ①） | 契约 S-18、S-21、S-36、S-38 第 2 条；带内无整数 `code` 一行是 [D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)、N-43 | 新开「传输交回的事实怎样分成因」：`local{queued}` 按传输本地行收 `unrecognized`、`aborted` 按两个时限分、撤除一律按撤除收场；`httpStatus` 只进诊断、不进 `failure.statusCode`；带内无整数 `code` ⇒ `unrecognized`。S-21 一列与这一格读法相左，登 MRR-N15 报主线 | design.md S-18 行、新一节、MRR-N15；本页一条场景义务 |
| 第四轮：`openCall` 带 `report`、工具条目经注册表取（契约 28a97642） | 契约 S-28 ①③④⑧、G-24 闭合（D-060 §八 N-43）；[D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④ | 依赖表加 `assetRegistry.lookup`（调用时取用，取舍表：inject 会让注册表每次换代连带 P-2 与全部 agent runtime 重跑）；S-7 行写取条目、`report` 核三者、续接重取；`report` 只进服务面 `openCall`，`invokeModel` 收已解析的条目、不收它；MRR-N14 改已闭合 | design.md 公开面 `TransportAdapter` 行、插件与配置表 P-2 行、S-7 行、十三个操作行、依赖表与「有意不设的边」、MRR-N14；README；本页一条场景义务 |

## 2026-09-27 既有承诺同步

主线与独立 spec-reviewer 定向核对 PAT-N14、PAT-N18、MRR-N15：MRR v2 冻结契约 SHA256 `d7d166da84aaf1f05ac6274abc0f215e57a32dadad79db19f4a7402120f799b9` 已含 D-060 N-42～N-44 的工具条目来源、无码带内错误与排队中止分类，D-066 登记继续承接其语义接受。三处为节点漏同步，按既有条款修正，无新裁决、未改冻结资源。历史评审表保留原时点；未运行源码、T/G 比较门或新的形式验证，其他实施缺口不变。
