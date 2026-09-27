# loop-extension-runner 验证与证据

## v3 候选验证（2026-09-27）

对象为 [v3-design.md](v3-design.md) 和 `capability.loop-extension-runner/v3`；本版未接受、没有生产源码或实现运行，绑定保持 0 条。下方 v2 的历史记录不换标签。本次覆盖是两操作的控制语义与模型请求纵线真实交接；工具执行、AgentLoop 产品和卡片完整闭环不由此声明完成。

### v3 候选证据义务

| ID／条款及投影 | 实施后必须执行的证据与反例 | 当前状态／owner |
|---|---|---|
| V3-1：S-21/S-26，P1 | LC4 failure 完整快照＋MS4 发出记录进入服务；每处绑定缺失、nested 配值错配、错误 call/顺序或模型 ID 均 invalidInput，零求值、零结论；大数与布尔边界用无损值 | 未开始；runner/core 实施者 |
| V3-2：S-6/S-21/S-22，P1/P4 | 真实 MF3 readHead/readHistory＋AR3 S-48 内容＋AE4 S-47 公共判定＋选定 LC4 正文；E1 本表与别类别 E2 重载、reuse 删除、原序保持；错版本/来源/排列、缺项、空 allowed/非法档/超正文声明皆 unavailable、零求值零新结论且保留前缀；确实无清单为 manifestMissing，明确空构成仍走系统关门；回放核原链 | 候选输入已补齐，实际未开始；runner/清单/正文提供者与装配 owner |
| V3-3：S-10/S-14/S-15，P2 | 十一个位置与两维过滤、两处末位、八种结论、两张合法表和完整五种效果；多个违规取原次序；异步第一件阻塞时后件不得开始，前件未耐久时效果不得含它 | 未开始；runner 实施者，全部控制行不能只测默认 retry |
| V3-4：S-12/S-13/S-17，P2 | 依赖/实现缺席、起不来、开始后失败三类分开；五种系统件 fallback、租户 veto/收窄/after 分支；默认重试逐码点身份及 rewrite＋省略 onError→record；兼容件三种固定非阻断错误带 errored 记录，不能静默 observed | 未开始；G3-2 仅余模态转换/循环探测身份；runner/贡献者 owner |
| V3-5：S-11/S-18/S-19/S-21/S-28，P3 | 真实 JSONL 两 owner 并发：旧尝试写与新尝试开始、无 Run 同锚重复、回执丢失后重启、结论与提醒间停机；同 ID 同值认回；作者提醒结论前异内容冲突走 onError，结论后被他方占号则 replayInconsistent、保留旧结论且无效果/替身；alreadyRecorded 后不可读取为 unavailable；检查完整消息无损值、共享消息键/栅栏确实到 append | 未开始；runner＋sessionLog 实施者；有限模型不覆盖真实占号竞争 |
| V3-6：S-22/S-27/S-28，P3/P4 | replay 零求值/零写、已结束效果重建；首次生成 id/createdAt 后完整落结论，恢复补提醒时发号/时钟零调用，首次端口失败为 unavailable；未答 ask 不重复出卡、答后同值输入回放、新轮 ask 独立，偏离等待为 replayInconsistent；嵌套提醒只一层并继承外层栅栏 | 未开始；runner＋等待原语/装配 owner；假卡片端口仅证条件测试，不是真产品等待 |
| V3-7：S-14/S-26/S-46，P5 | 真实 runtime3 首内容事实＋恶意 retry 件，实际 S-50 拒绝后零第二次 send；形状判定先于守卫，refused{why}/alreadyEnded/callNotFound/wrongPhase 沿有效 onError 且只记真实 why/失败名；unavailable/invalidInput 同名失败、本件无新结论且保留前缀，invalidInput 不归罪作者；合法 provider_not_allowed 走守卫；不得剥掉 adaptation | 候选映射已补齐，实际未开始；runner＋runtime owner |
| V3-8：S-26，P5 | 真实默认重试按 runtime3 S-67 的 omne-official:default-retry 登记，执行 S-35 逐家/不回退一次/试尽和配置退避；allowed 后调用终结则 S-30 拒绝；resume/再发当前输入或规划失败保持原状态、零新锚点/响应/HTTP，runner 不改已落结论或捏造一次发出 | 未开始；runtime＋runner＋验收装配 owner；不把函数返回 plan 当已再发 |
| V3-9：S-9/S-50/S-52，P6 | 双会话句柄隔离、返回/停止后不可用、先取真实 tenant 再环境、前者失败后后者调用数为零、无默认宿主环境、句柄日志读取失败分类 | 未开始；runner＋真实本地 tenancy/environment 提供者；缺失路径可独立测 |
| V3-10：S-21/S-29/S-30/S-48，P7 | 批次不拆、报告 session/run/attempt 错一位拒绝；一次 admit、逐项结论、缺失即关门；连续否决按真实设置/日志计数，重启不清零；验证控制而不执行工具 | 未开始；runner/报告/设置 owner；保留 G3-6 的产品分支缺口，不虚构凭据交接 |
| V3-11：S-33/S-34/S-51，P8 | 实际 Cordis4.0.4 替换 sessionLog、撤 runner 与单条贡献；慢件、调用间隙、append 在途三时点；取消/撤除不误记否决，提交已进入日志时整批收场，迟到 Promise 拒绝可观察无新业务记录 | 未开始；runner＋kernel-basis owner；也是精确 ACTIVE 时序待核对主张的失败 oracle |
| V3-12：S-7/S-17/S-32，P8 | restricted 登记面静态检查＋真实装配；重复登记失败不移除他方；默认重试/实际 service 缺席分支；全部必需 fiber ACTIVE、guard.confirm 成功后才受理，确认失败撤除且零业务调用 | 未开始；runner＋装配＋静态工具 owner |
| V3-13：S-35/G-14 | 原七项回放义务及 InputsFromDurablePrefix/ControlStopsChain/RetryPassedGuard；4 正向和 10 个可失败负控，明确有界链/尝试/停机、同锚及公平性；按构造成立的性质不绑 | 规格侧已实际运行，范围见下；形式 owner/主线负责评审归档，不代证实际 runner 接线 |
| V3-14：SYS-OPEN 与 RUN-N7 | 独立 import 公开函数、真实服务复用同一逐件循环、端口故意不耐久/不判重时反例能暴露前提；函数不宣称租户授权或持久性 | 未开始，函数面契约门待主线；本包实施者 |

日志或传输模型、37 模型研究探针、纯值 Schema 实例均不能代替 V3-5/7/8/11 的真实提供者组合。测试端口结果必须明确写其前提，不计作真实装配验收。候选测试尚不存在，不在 bindings 创建空占位。

### v3 形式证据的有限范围

[规格验证记录](../../../../spec/capabilities/loop-extension-runner/verification.md#tlc-实际执行与范围)记录了 Runner.tla 的实际执行；本节点引用其范围，未重跑或升级为实现证据：Runner.cfg（两件一 worker）48,016 状态、RunnerUnfenced.cfg（一件两 worker）44,508、RunnerConcurrent.cfg（一件两 worker）332,712、RunnerProgress.cfg（一件一 worker＋显式弱公平）2,930，四者 exit 0。十份负控得到指定反例：九份不变量失败 exit 12，answered-stalls 进展失败 exit 13。它们表明指定断言可以被拧反，不是生产运行通过。

模型限于单会话稳定锚、有限链、最多两尝试/一次崩溃、每件至多一次 ask、二值改写主体；两件两 worker 的探索未完成，没有 verdict。唯一身份、时钟、可信声明、实际耐久介质及原子提交是外部前提。任意链/重复多轮 ask、精确 JSON 与适配绑定、E1/E2 来源读取、结论后 ID 竞争、嵌套提醒 veto、批次 admit、取消、句柄、完整错误处置表和守卫失败枚举不在该次覆盖内；仍须 V3-1～12/14 的真实或纯函数分层证据。登记与归档接受由主线负责，本次不新增 binding。

### v3 实际执行

尚无生产执行。2026-09-27 在本执行工作树根运行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`，实际退出 **0**，stdout 末行：

```text
PASS: design tree /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/.meta_harness/design passed gate=internal; formal=skip.
```

该次 stderr 为空；formal 全部显式跳过。这只核节点结构、链接与登记，不证明控制行为、日志耐久、Cordis 撤除或真实模型请求。`git diff --check` 对本节点通过。

同日最终追加投影后复跑同命令，实际 exit **1**，唯一检查错误来自并行维护的其他节点：

```text
ERROR: realization/packages/infra/credential-custodian-local/README.md: missing Markdown anchor: verification.md#模型副本来源绑定候选的验证义务
FAIL: design validation found 1 error(s).
```

本节点没有被该次检查报错；已通知主线由对应 owner 修复，本任务未越界修改。该次失败保留。并行修复落定后再次运行同命令，实际 exit **0**，末行仍为上列 `PASS ... gate=internal; formal=skip.`；本节点 `git diff --check` 同样 exit 0。formal 未在本节点重跑，最终全树静态检查通过不扩大行为证据范围。

### v3 覆盖缺口

G3-0 的 runner3/runtime3 candidate 登记已完成，LC4/MS4/MR4/AE4/AR3/MF3 已接受，本节点技术接受未完成；G3-1/3/7 的候选语义已补齐，真实来源、持久化、碰撞及守卫接线仍待实施验证。G3-2 只余模态转换/循环探测的身份；G3-4 已有上述有限模型证据；G3-5（函数契约与 ACTIVE 时序）和 G3-6（工具/loop 相关未决）保持。owner 与关闭条件见 [新设计缺口表](v3-design.md#缺口与受阻消费者)。尚无生产行为证据，不能只测可返回 retry 的分支即声称完整。

本轮独立验收装配未由本任务建立。它须持真实 sessionLog、MF3 读面、选定不可变版本的真实正文来源、默认重试贡献、首次生成用发号/时钟、稳定锚、合法会话/尝试事实、受理开闸与诊断；runner 不生成假的 Run 或为缺失授权补默认。旧 G-7 对不响应取消实现没有时间上界，取消返回不等于实际停止。

以下是 v2 原节点的历史义务与评审记录，按原版本读取。

本页记本节点触发的证据义务、实际跑过什么、覆盖到哪里。契约层的证据状态归[契约验证入口](../../../../spec/capabilities/loop-extension-runner/verification.md)。**源码不存在，本节点没有任何实现层的证据。**

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| `capability.loop-extension-runner/v2#S-35` 七条义务（`OneFinalConclusionPerPiece`、`CommitBeforeNext`、`ReplayReproducesEffect`、`RemindersExactlyOnce`、`OneCardPerAsk`、`StaleAttemptCannotWrite`、`AnsweredPassCompletes`） | 行为模型 `Runner.tla` 与配置、登记为 formal task；每条不变量配一份拧反开关的否定配置 | **受阻**：模型未建（契约 G-14） | 主线（派建模任务）；建成并跑过后本节点才可绑 |
| `#S-36`～`#S-49` 规范场景 | 两层各跑一遍：**函数面**——`runPass` ＋ 测试给的链与锚键 ＋ 一个按 `capability.session-log` v2 S-8、S-10、S-14 写的日志端口（判定与写入同一步、按耐久内容判）＋ 脚本化实现；**服务面**——真实 runner ＋ 会话日志与装配清单的最小提供者 ＋ 脚本化实现 | 未开始。**函数面可跑（键与链由测试给）**，锚不再受阻（[D-063 R-12](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）；**服务面受阻**：会话日志与装配清单的最小提供者尚未建包（节点 `session-log-jsonl`、`assembly-manifest-store` 已立，RUN-N1），读链未约定（assembly-manifest G-4，RUN-N2）；`#S-42` 的模态转换一支另受阻于它的能力标识（契约 G-3）。按 D-060 §八 N-35 ①：只在测试端口上跑通的记「有前提：测试日志端口」，不计入实际验证完成数 | 本节点 |
| `#S-51` 运行被取消，`dispatch` 以 `cancelled` 收场（含叫停落在两件之间一支） | 场景测试：脚本化的慢实现 ＋ 中止信号；断言在途那一件没有记录、后面的件没被调到、没有提醒 | 未开始；函数面可跑（中止信号与脚本化慢件）；服务面受阻同上（RUN-N1）；兼容件那一支另受阻于宿主机允许（execution-environments G-3，hooks-import 节点 fail-closed） | 本节点。**叫停 ‖ 结论追加**（[design 取消](design.md#状态并发与失败映射)）用按 `capability.session-log` v2 S-17 写的测试日志端口在单元级先跑：两种次序下都是整条落下或不落 |
| `#S-52` 执行环境句柄只及本会话、调用返回即失效 | 场景测试：两个会话各一次经过；返回后再解析即失败；来源缺席时解析失败、不给默认；**执行环境先取租户**：`holdingTenant` 答 `sessionNotFound`／`unavailable` 时 `resolveSessionEnvironment` 一次都没被调到，解析失败 | 未开始；句柄表与失效那一半有实现即可单元级跑；**解析出真值那一半**在验收装配里由 `sessionTenancy`、`executionEnvironments` 的最小提供者答测试种子即可跑（契约 G-20：接口已定、真承接者未到），最小提供者节点 `session-tenancy-table`（经 `./seed` 代写）、`execution-environments-host`（读数种子件）已立、尚未建包 | 本节点 |
| `#S-21` ① `admission.report` 三者核对（D-060 §八 M46） | 单元测试：会话、`runId`、`attempt` 各错一个 ⇒ `invalidInput`，一件都不求值；同一运行上一次尝试的报告同样被拒 | 未开始 | 本节点；有实现即可跑 |
| 公开函数面 `runPass`（[design 的公开面](design.md#公开面)） | 单元测试：不装 Cordis、不给存储，测试给链、锚键与四个端口即跑通一次经过；`ports.record` 答 `alreadyRecorded` ⇒ 改读已落的那一条接着走、答 `superseded` ⇒ `attemptSuperseded`、答 `unavailable` ⇒ 停在那一件之前；**反证**：接一个不判重的数组端口时同一次经过跑两遍就有两条结论——函数层不承诺「恰一条」，这条测试断言的是「重复来自端口」而不是 runner 自己补了去重 | 未开始 | 本节点；有实现即可跑（不受阻） |
| 服务面复用同一个 `runPass` | 结构检查：`dispatch` 不另持一套逐件循环 | 未开始 | 本节点 ＋ `tools/ts-checks` |
| 效果合成与三张处置表（`#S-12`、`#S-13`、`#S-15`、`#S-17`） | 纯函数单元测试，逐格覆盖 | 未开始 | 本节点；有实现即可跑（不受阻） |
| 两条交错（[design X-1、X-2](design.md#跨-owner-的共同存储对象与两条交错)） | 真并发演练 C-1（旧尝试 ‖ 新尝试推同一次经过）、C-2（无运行的经过被两副受理方协程同时推，交来同一把锚键） | 未开始；**受阻**：RL-2、RL-3 落在会话日志最小提供者上，节点尚无。日志一侧的判法有会失败的模型证据（formal task `session-log-v2-appends`），它不证 runner 给每次写带了栅栏与键，**不绑** | 本节点 ＋ 会话日志最小提供者（互指 RL-1～RL-6） |
| `#S-34` 第 4 行（实现在求值中途被撤下按报错） | 单元测试：登记代际在求值期间变更 ⇒ 记报错、不采用结果 | 未开始 | 本节点；有实现即可跑 |
| `#S-9` 句柄只及本会话、调用返回即作废 | 单元测试：作废后读取失败；没有指认别的会话的参数 | 未开始 | 本节点 |
| `#S-8`、`#S-33` 末段：runner 自身被撤除时在途 `dispatch` 不继续（D-060 §八 M63） | **最小场景**：脚本化慢件 ＋ 三个贡献者（系统自带件、兼容执行器、租户件）装在同一条链上，第一件落下结论后、慢件还在跑时 dispose runner（另一支：让 `sessionLog` 换代）；断言旧 `dispatch` 以 `unavailable` 收场、**此后日志里没有任何新结论记录**（尤其没有指定挂件的否决），新实例上的下一次 `dispatch` 回放接着走、慢件重新求值 | 未开始；用按 `capability.session-log` v2 S-17 写的测试日志端口即可在单元级跑（断言的是「撤除之后没有写」，不依赖真实日志的栅栏）。**它也是「撤除开始即离开 `ACTIVE`」这条待核对主张的会失败证据** | 本节点；有实现即可跑 |
| `#S-7`、`#S-17`、`#S-50` 登记面与解析面受限（装配给） | 静态检查（RUN-N6） | 未开始（规则未写） | 本节点 ＋ `tools/ts-checks` |

## 实际执行

没有。本契约没有登记的 formal task，本节点没有源码。

## 覆盖缺口

- **没有任何证据**：全部义务未开始；行为模型未建（G-14）。函数面场景可跑（键与链由测试给）；服务面场景受阻于会话日志与装配清单的最小提供者尚未建包（节点 `session-log-jsonl`、`assembly-manifest-store` 已立）、读链未约定（assembly-manifest G-4，那个节点的 AMS-3）。
- `bindings.yaml` 为空，与本页一致。
- **执行环境句柄解析出真值**：验收装配里等两份接口契约的最小提供者建包（契约 G-20：接口已定、真承接者未到；节点 `session-tenancy-table`、`execution-environments-host` 已立）；产品装配里会话持有租户没有写入方，只能证「解析失败时不给默认」那一半。
- **函数层没有契约条款**（RUN-N7）：`runPass` 的场景断言借服务面的条款，契约改了它不跟着有条款。

## 独立评审

2026-09-25 本节点（修复波 3 对齐之后）随 N4 批经一次独立的架构评审（只读结构核对，无运行）：阻断 1、应修 1、建议 1；主线据此裁定 [D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M63。下表逐条写处置与落点。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| R-1（阻断） | `sessionLog` 换代落在一次经过中途时，旧 `dispatch` 拿着旧引用继续，贡献者已对旧登记表注销，之后每一件都「此刻不在」，指定挂件的否决被写进日志、回放照单采用——推翻 S-8、S-33 末段；原自证引的 S-34 说的是实现被撤、不是 runner 被撤 | 按 M63：在途 `dispatch` 不继续，三处检查点加「本实例已撤除」判定（`fiberIsActive`），以 `unavailable` 收场、不落任何结论；等在途那一件时与实例停止信号竞速；不申请 S-8 例外 | design.md「状态、并发与失败映射」runner 自身被撤除段、步骤一行、失败映射；inject 表 `sessionLog` 行；执行环境句柄选择表第三行；装卸表 provide、登记表、句柄表三行；本页证据义务的最小场景 |
| R-2（应修） | README 先声称兑现 S-5、S-18、S-21、S-22 又写受阻于 G-1 | 按 M63：四条标「有前提地能：G-1」，从无条件的声称里划出 | README 可实施范围 |
| R-3（建议） | `cancelled` 之后在途那一件的 Promise 无人跟踪、上界与归属没写 | 按 M63：写明不跟踪、每次叫停至多一件在途、撤除不等它 | design.md 取消段第一条；装卸表「叫停或实例撤除后仍在跑的那一件」行 |
| 反证清单 1～4 | 会话日志契约给不出 RL-2 的锁定读；PF-005 要求执行环境句柄跨调用存活；loop 契约把叫停定成等在途件；`data.loop-extension` 加通用按键独占 | 照录为改选条件，本版都未触发 | 本表 |
| 范围外 ① | 若保留「在途 `dispatch` 继续」须申请 S-8 例外 | 不申请：按 M63 局部闭合 | — |
| 范围外 ③ | C-7／C-8 闭合前的产品后果（含要转的块的消息被否决、导入的 hooks 不生效） | 主线登记为产品后果、告知产品负责人（D-060 §八 N-26），不是本节点的裁决项 | README 分层状态受阻一句 |

## 修订波（2026-09-25 公开面）

依据：[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1、R-2、R-12，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，[D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-37 ②⑩。本波只改节点；契约侧（S-5 锚、G-1 收窄、G-20 改写、S-12 与 S-33 改指 `dependencyPresence`）由规格侧并行落，本节点只引条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-063 R-2 | 新开「公开面」：`runPass`（调用方交链、锚键与端口）、`composeEffect`、三张处置表、`passKeys`；服务面 `dispatch` 复用 `runPass`；「恰一条」、回放、栅栏、句柄范围、撤除不继续列为函数层不承诺；登 RUN-N7 | design.md「公开面」、RUN-N7；README；本页函数面两行 |
| 锚 | D-063 R-12；契约 S-5、G-1 | S-5、S-18、S-21、S-22 解除「有前提：G-1」；键原样拼进判重键与读取键；场景翻「可跑（键由测试给）」；调用方的两条义务如实写成本节点兑现不了 | design.md 操作落点 S-5、S-18、S-22 行，RL-3，X-2；README 可实施范围；本页场景行 |
| 会话日志接线 | `capability.session-log` v2 S-8～S-10、S-13、S-14、S-17、S-18 | RL-1～RL-6 加「接口契约兑现条款」一列；RL-2 改为「在日志条目壳上判、不另存尝试行」；X-1、X-2 的共同对象改写为日志的提交点与判重键；失败值映射 | design.md 存储要求、跨 owner 一节、依赖表；RUN-N1 |
| 装配清单接线 | `capability.assembly-manifest` v2 S-5、S-16、S-19、G-2、G-4 | 读链经 `readHead`、头 `0` ⇒ `manifestMissing`；**读链仍受阻于 G-4**（服务面）；`dependencyPresence` 并入 `assemblyManifest`、删独立 inject 边 | design.md 投影表、操作落点 S-6／S-12／S-16 行、inject 边表、依赖表；RUN-N2、RUN-N5 |
| 执行环境引用先经 `sessionTenancy` | N-37 ⑩；`capability.execution-environments` v2 S-11；`capability.session-tenancy` v2 S-8 | `resolveExecutionEnvironment` 先 `holdingTenant` 再 `resolveSessionEnvironment(tenant, session)`；两样分开解析的取舍表改写；G-20 改「真承接者未到、接口已定」 | design.md 执行环境句柄一节、S-50 行、inject 边表、依赖表；本页 S-52 行 |
| 最小提供者节点互指（主线 2026-09-25） | `session-log-jsonl`、`session-tenancy-table`、`assembly-manifest-store`、`execution-environments-host` 四个 candidate 节点 | RL-1～RL-6 引导段、RUN-N1、RUN-N2、RUN-N5、S-50 行、只 inject 日志一条、承接 S-32 的装配段改为「真承接者未到，最小提供者节点 X 已立（candidate）」；在场事实经 `presenceSource`、会话持有租户经 `./seed` | design.md 各处；README；本页覆盖缺口 |
| 第四轮：`openCall` 带同一份报告（契约 `capability.model-request-runtime/v2` 28a97642） | MRR S-28 ①③；[D-060 §八 N-43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) | S-21 行写明 `admission.report` 与 agent loop 交给 P-2 `openCall` 的 `report` 是同一份、P-2 核同样的三者；本节点问的两道判定（`legalTargets`、`canDispatchAgain`）输入里没有报告（MRR S-24 ①、S-50 ①），写明不带 | design.md S-21 行 |
