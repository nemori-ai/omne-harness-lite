# loop-extension-runner v3 候选实现设计

本节点为 `packages/agent-loop/loop-extension-runner`，**尚未建包**。本稿消费 `omne-harness-lite-design-2026-09-15 · capability.loop-extension-runner · v3` 的[候选契约](../../../../spec/capabilities/loop-extension-runner/v3/contract.md)；以下 S-n、G-n 均指该版本。保留 [v2 已接受设计](design.md)，不改写其接受事实。本稿自身未接受，不把候选正文存在当作 catalog 登记或可实施性证明。

增量依据是 [model-request-adaptation 提案](../../../../record/proposals/model-request-adaptation/design.md) 的公共执行路径、真实 runner 与默认重试交接；其 [既有评审](../../../../record/proposals/model-request-adaptation/review.md) 未覆盖本节点。需求坐标沿契约：PF-012 rev 15、PF-008 rev 7、PF-002 rev 20、PF-013 rev 13、PF-014 rev 7、PF-004 rev 12、PF-000 rev 1、PF-005 rev 6、PF-015 rev 11。

## 实现路径与边界

继续采用既有的自建 TypeScript runner 路径，复用 core 纯值包和 kernel-basis；不 fork DSH runner，理由与 [D-033](../../../../record/decisions/hooks-compat-baseline/decision.md) 和旧节点相同。实际 Cordis 采用 [D-025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)。本稿内所有插件、服务、方法、端口、键编码及内部字段名均为**候选**，没有现成生产 API。

交付范围保留完整 `dispatch`、`replay` 两操作的控制语义：位置与维度过滤、两处末位、逐件等待、合法性、失败策略、记录、效果、提醒、回放、批次控制、取消和句柄。`after_model_call` 的失败与完整回复两维都走同一 runner；不是另写一个直接调用重试函数的捷径。runner 不执行工具、不成为 AgentLoop，也不拥有模型发送、Run 终态、等待卡片持久化或调用结算。

公开函数面沿旧设计的候选 `runPass`、`composeEffect`、三张处置表、`passKeys`；调用者交链、端口、锚和中止信号，不依赖 Cordis 或隐式会话。服务面在同一个逐件求值构件上接真实日志、链读面和运行时判定。`runPass` 的端口正确性、幂等耐久与授权不自动成立；旧 RUN-N7 的函数面契约缺口仍需主线处理，不借服务契约冒称函数层已有全部保证。

## 契约到 Cordis 的投影

| 行 | 契约责任 | 插件／服务／操作（候选） | 实现及采用版本 | 符合性依据或缺口 |
|---|---|---|---|---|
| RUN3-P1 | S-5/S-6/S-21：输入、锚、链、完整失败主体 | `loopExtensionRunner.dispatch` → 纯值判定 → 当前类别表与其求值读取 → `runPass` | LC4、MS4、MR4、CB3；profile3 经 LC4/MS4 精确采用；MF3 S-16/S-18、AR3 S-48、AE4 S-47 | V3-1/2；同 E、同版本正文、顺序和权限集合投影见下；真实提供者接线待验 |
| RUN3-P2 | S-7/S-10/S-12～S-17：实现在场、逐件控制与关门 | 同一插件提供 `loopExtensionImplementations`，按名及代际取实现；逐件直接 `await`；五种效果由已落结论折叠 | core/loop-extension 的候选 v4 纯判定；系统件与普通件的差别只来自规范身份及规则 | V3-3/4；系统标识 G3-2，不能按名字相似或登记顺序猜 |
| RUN3-P3 | S-11/S-18/S-19/S-21/S-28：先落后算、回放、防重及提醒 | `sessionLog.append/readByKey` 端口；每件提交确认后才继续；`alreadyRecorded` 改读并比较完整耐久值 | session-log/2，真实 session-log-jsonl 提供者；完整提醒随结论持久化，回放复用 id/createdAt；本节点没有独立存储 | V3-5/6；结论前后撞号分支见下；G3-4 仅有有限模型证据 |
| RUN3-P4 | S-22：只读重建 | `loopExtensionRunner.replay` | 核输入、链与日志前缀，返回已落记录；不求值实现、不追加、不带尝试栅栏 | V3-6；无记录与不可读取分开，链不一致原样拒绝 |
| RUN3-P5 | S-14/S-26：retry/select_model 的能力判定 | 调用时取本地 `modelRuntime.canDispatchAgain/legalTargets` | model-request-runtime/3 S-50/S-24；默认件行为归该契约 S-35 | V3-7/8；没有 `confirmRetry` 新操作、没有预判即发送 |
| RUN3-P6 | S-9/S-50：短生命期只读/环境句柄 | 调用级句柄表；`resolveTenant/resolveExecutionEnvironment` | session-tenancy/2 S-8；execution-environments/2 S-11；先读真实租户再取环境 | V3-9；缺服务/失效/来源不可读均明确失败，不回退宿主机 |
| RUN3-P7 | S-21/S-29/S-30：批次、报告、连续否决 | 批次协调仍在 `dispatch`；`toolAdmission` 调用时取用；连续否决从日志及设置读 | AE4 S-8/S-42、AR3 S-11；tool-admission/2 保留 | V3-10；不执行工具；凭据交接及相关旧缺口不由本节点填空 |
| RUN3-P8 | S-31/S-33/S-34：不开事件、依赖失败、取消及撤除 | runner fiber、实例停止信号、调用检查点、贡献代际和句柄失效 | Cordis 4.0.4；basis 对照见下 | V3-11/12；取消请求不等于外部实现已静止 |

### 插件、依赖与缺席

一个插件，一条 runner fiber，**只必需 inject `sessionLog`**。`loopExtensionRunner` 与受限的 `loopExtensionImplementations` 由该实例共同提供。`assemblyManifest`、`modelRuntime`、`toolAdmission`、`sessionTenancy`、`executionEnvironments` 在需要时经本机真实服务读面现取；不以全局可见性代替授权，不把不存在的服务换成成功 fixture。

| 依赖的精确范围 | 实际绑定及缺席回答 |
|---|---|
| LC4、MS4、MR4、CB3、call-accounts/2、identity-values/1（accepted） | 静态公开包依赖；新默认入口需显式采用并核 Schema 闭包；收到 LC3 缺绑定主体不能去字段后继续 |
| model-request-runtime/3 S-24/S-50（candidate） | 每次判断调用时取真实 `modelRuntime`；不可读为这次 `dispatch` 的 `unavailable`，本件无记录；已终结依 S-26 作为被拒 retry，不能当不可用 |
| session-log/2 | 必需服务；提供者替换使 runner 撤除重跑，旧实例停止推进；调用失败按具名答复映射 |
| assembly-manifest/3 S-16/S-18/S-19；asset-evaluation/4 S-8/S-42/S-47；asset-registry/3 S-11/S-48（accepted） | 真实本地 `assemblyManifest` 给类别记录，AE4 公共纯值判定检查完整成功求值；正文读取端口绑定同一资产的选定不可变版本；needs 三态及报告也沿本批精确版本；任何必要来源缺失不替成 fixture |
| tool-admission/2、modality-projection/2、tool-execution-runtime/2 的既有接口／身份 | 完整控制语义保持；toolAdmission 缺席按 S-17 全拒。模态转换缺席只否决确有要转块的消息；执行动作与执行后事实由外部 owner 负责 |
| session-tenancy/2、execution-environments/2 | 每次句柄解析现取；前者答不出时不得调用后者，不允许无租户或宿主机默认环境 |

配置错误统一沿已接受节点的**启动失败**政策：runner 本身无策略默认配置；重复内建名或第二个命令执行器的登记抛错给登记者，登记者 fiber 失败，不能覆盖先前合法贡献。默认重试的 `default_retry_backoff` 配置由 runtime 的默认重试贡献者拥有，runner 不另设常量、随机或计时默认值。实现缺席、读取暂时失败是调用期具名结果，与启动配置错误分开。

### 当前类别表到实际链

链读取构件先调用 MF3 S-16 `readHead`，从同一次一致读取得 `latest.loop_extension` 及 `tables.loop_extension`。需要重读时只用该会话、类别与已钉住的 `filledAt` 调 S-18 `readHistory`。读取 AR3 S-48 的完整 `{evaluation, compositionOrder, filledBy}` 后，复用 AE4 S-47 的候选公开纯函数 `judgeEffectiveAssembly`（[对应节点](../../core/asset-evaluation/v4-design.md)）核完整成功求值及其结果内关系；不另求值，也不拿 MF3 S-33 的全局最新求值替换表自己的 E。该纯函数不证明正文真实或同一次快照；跨记录与正文来源核对仍在本节点读取边界。

候选链构造函数核 `compositionOrder` 为 E.composition 的全排列，按类别筛选，再按当前表构成保留同序子序列；`given`/`mint` 取完整类别筛选，`reuse` 只可删。别的类别已经重载到 E2 时，本表仍用 `basedOn`/记录壳指认的 E1。装配将候选正文读取端口绑定真实资产正文提供者：只按条目中与同 E 对齐的资产和不可变版本读 LC4 正文，不能读最新版本或用登记实现的自述替代。声明的 `onError`、`unavailability`、`needs`、`implementation` 取该正文；位置、维度与 `power` 取同 E 的 EffectiveValue。

`power.value.allowed` 保持原权限集合表示，链构造只求一个执行档：逐成员检查合法三档且均不高于正文声明后，取 `observe < rewrite < veto` 最强档。缺项、非法成员、超声明、空集合及来源不匹配均在调用任何件之前返回 `unavailable`，无新记录、已有前缀保留；不能裁剪错误后继续。合法指认的清单不存在或不属本会话为 `manifestMissing`；调用参数不合法为 `invalidInput`。明确有效的空构成才是空链，仍须执行系统件缺席关门规则。真实读取、纯判定与正文来源分别留结构化失败原因，业务结果只用契约原值。

### 上游语义与负面清单

| 采用的机制事实 | basis 与本节点用法 |
|---|---|
| 异步控制不能依赖 `bail`；`emit` 不保留控制返回 | [async-control-not-bail](../../../../basis/cordis/async-control-not-bail.md)，4.0.4、有 probe；runner 以链的数据次序直接 await，不把链改成事件监听顺序 |
| inject 没有 optional 形式；可见服务不是权限沙箱 | [inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)，4.0.4、有 probe；只 inject 日志，其余调用时取用；受限登记与会话身份由装配和代码边界保护 |
| 必需提供者变化触发插件体卸载重跑 | [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，4.0.4、有 probe；旧经过停止，新实例依日志恢复，不继承内存中的未提交结果 |
| 多个 effect 的异步清理不是有序完成 | [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)，4.0.4、有 probe；关闭本实例准入、触发停止、句柄作废在同一收口函数里表达，不依赖兄弟 effect 次序 |
| 插件体/配置异常使该 fiber 失败并收回贡献 | [plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)，4.0.4、有 probe；重复登记不静默覆盖 |
| 撤除开始时先离开 ACTIVE、早于贡献者注销 | **待核对主张**；现有 basis 不含该精确时序的 probe。旧设计依赖它防止把 runner 自身撤除误记成系统件不可用；V3-11 必须实际反证，不能据源码名认为成立 |

Cordis 不提供日志耐久、栅栏/判重、跨 fiber 事务、可靠业务事件、租户权限、沙箱、外部效果回滚或实现实际停止。runner 不为每个模型或每个会话新开 fiber，不用 isolate 代替隔离数据，不因贡献卸载就宣称其在途 Promise 或子进程已结束。

## after_model_call 的真实交接

1. 调用方按 LC4 S-2 选择位置与维度。失败输入使用 runtime/3 S-29 返回的原快照与完整已出门序列；runner 在 S-21 接收边界同时校验 LC4/MS4 的单条合法性、同次调用/序号及快照绑定的一致性。配置值按公共严格无损 JSON 规则比较，不从当前目录、注册表或响应体重建。错误为 `invalidInput`，零次实现求值、零新结论。
2. 链及声明来自上述真实读面；默认重试件只按 runtime/3 S-67 的 `{category: loop_extension, name: "omne-official:default-retry"}` 识别。其出厂 `power = rewrite`、正文省略 `onError` 时沿 LC4 为 `record`，与既有 runner2 S-26.3 一致。真实贡献者接原失败主体，执行 runtime/3 S-35 的策略及可配置退避，只交 `observed` 或 `retry`。runner 不实现第二份选供应商策略，不以样例函数替代贡献者在场。
3. 一件返回 retry 时，先做 LC4 的形状（含 RetryPlan/Duration）、干预力与位置校验，再调用真实 runtime/3 S-50 `canDispatchAgain(session, callId, plan)`。`allowed` 才能把 retry 最终结论追加；`refused{why}`、`alreadyEnded`、`callNotFound`、`wrongPhase` 按 S-14/S-26 的输出不合法分支应用本件有效错误策略，留痕为实际 why 或实际失败名，后三者没有 why，不能补造。`unavailable` 与 `invalidInput` 分别让 dispatch 同名失败、当前件无新结论并保留前缀；后者是 runner 调用守卫的输入边界失败，不归罪已过 LC 检查的作者输出，也不改走 onError。合法计划的 `provider_not_allowed` 由真实守卫拒绝，不冒作形状拒绝。
4. retry 结论提交确认之后才交回 `effect.retry`，并停止后续件。该确认只说明**结论耐久且当时守卫允许**，不是 HTTP 已发送或保证稍后可发送。调用方等待 `plan.after` 后才调 runtime/3 S-30；运行时再次判定守卫。runner 不做退避计时、不主动发送，不改已提交结论。
5. 真实流已交付首内容后，即使自定义件故意返回 retry，也必须被运行时的 `already_spoke` 守卫拒绝；失败主体的 `interrupted_mid_reply` 与故障码不能绕过它。确认默认件不产生 retry 还不够，V3-7 须装一件违例贡献者穿过真实守卫验证零第二次发送。
6. 已有发出的调用在 resume 或 dispatchAgain 的当前输入读取/求值失败，或规划输入被 runtime/3 S-28/S-29/S-57 拒绝时，保持原调用状态，零新 HTTP、零新已出门/响应/终结；当前输入端口责任见 S-66。runner 不伪造新的失败主体、retry 确认或请求结果；已落 retry 记录保留，后续重入该经过只能重建原效果，实际继续如何调度由调用方处理。这不覆盖凭据不可用时契约另定的 released 分支，也不能借 runner 所钉住的历史链替代 runtime 的当前输入。
7. 完整回复维度使用同一个 runner，按 LC4 的触发规则执行；中断、被否决/消费的回复不能无条件冒作 complete_reply。效果交回后，模型回复与响应体的同一追加结算仍由调用方和 runtime/日志承担；runner 不制造第二份 ModelResponse。

## 状态、并发与失败映射

`dispatch` 的候选控制流：输入校验 → 读取真实链并钉末位 → 按锚读取日志并核前缀 → 逐件检查取消/实例状态 → 判在场 → 创建短期句柄 → await 实现 → 使句柄失效 → 两类合法性判断 → 再查取消/实例状态 → 带键与栅栏追加 → 确认后继续 → 补缺提醒及其一层嵌套经过 → 返回效果。批次项可按契约并行，单条链内不得并行；`replay` 只走输入、链和前缀读取，不启动实现或补提醒。

实现开始前报告起不来才是不可用；开始后的错误按错误策略。实现单独撤除时，登记代际不同，迟到结果按 S-34 报错；runner 自身撤除时经过以 unavailable 收场，不能把全部贡献缺席写成一串否决。所有异步调用都有结算或迟到处理：取消后调用结果被消费并丢弃，拒绝写有界、脱敏诊断；不向日志补结论，不制造未处理拒绝。旧 G-7 没有实现执行时限，不能保证任意不响应信号的第三方工作实际停止，外部资源仍归贡献者。

正在求值时叫停：返回 cancelled，不落该件结论、不推进、不补提醒。追加已经进入日志提交口之后叫停或撤除：不能撤销提交；它按该次完整提交结果收场，确认后不开始新步骤。信号不是耐久栅栏，取消权威和尝试开始记录仍由调用方/日志提供。

### 提醒生成与耐久值认回

作者的 inject 已带完整 `id`/`createdAt`，按 LC4/MS4 校验；runner 自产报错/否决提醒时，候选发号与时钟端口**只在首次生成边界**交出本日志唯一的不透明 MessageId 及当时 Instant，完整消息随所属结论耐久记下。端口不可用为 `unavailable`；自产 ID 提交前已知碰撞可重新生成。发号只提供候选值，日志同一提交边界的唯一判重仍是权威；不能以随机概率替代碰撞处理。回放直接取已落提醒，不调用生成器或时钟。

提醒写入及 `alreadyRecorded` 都必须认回完整耐久消息，用公共严格无损 JSON 比较（含来源/内容、数字精确值和类型、对象无序、数组有序）。作者输出在结论提交前已知同 ID 异内容冲突，沿 S-14 输出不合法进入该件 onError；同 ID 同值才能幂等认回。结论已耐久后另一写入者抢先占号，读回异内容则 `replayInconsistent`，不交效果、不补替身、不改旧结论；读取或比对来源不可用则 `unavailable`。预读不是预留 ID，必须覆盖这两个提交之间的竞争。嵌套经过仍只有一层、每次写继承外层尝试栅栏。

## 对存储提供者的要求

本节点不选择数据库，不另存 runner 业务表；要求由 [session-log-jsonl](../../session/session-log-jsonl/design.md#消费者要求的承接互指) 对 session-log/2 的同一实现承接。两边的互指仍沿既有 RL-1～RL-6；新 v3 接受/实施时日志节点 owner 须复核新载荷版本，不能沿 v2 注释冒充已接完。

| 要求 | 对应条款 | 共同对象与判断位置 |
|---|---|---|
| 结论追加成功即持久，完整一批可见；确认前不推进 | S-10/S-11/S-21；session-log/2 S-13/S-14/S-17 | 同一本日志的耐久追加序列；不可用可识别 |
| 尝试栅栏与写入同一判断点，不能先读再另写 | S-21/S-32；session-log/2 S-10/S-14 | 当前会话日志中已提交条目壳的 `(run, attempt)` 与本次提交；不另造内存尝试行 |
| 每次经过/件的最终结论唯一；ask 各轮与最终结论分开编码 | S-11/S-18/S-21/S-28；session-log/2 S-8 | 日志已提交条目中的判重键，键含会话作用域、位置、维度、调用方锚、件名与记录类别；ask 轮次须从耐久记录导出，不能用进程计数 |
| 完整提醒随结论持久化；按 MessageId 判重并可读回完整值；重放有序、不可读不当空 | S-19/S-22/S-28；session-log/2 S-8/S-9/S-18 | 同一本日志中的提醒键、经过读取键及提交顺序；其他消息写入者共享同一消息键约束；同 ID 异内容不能作为成功幂等 |
| 卡片从已提交 ask 重建，一条 ask 恰一张卡 | S-27/S-32 | runner 只提交 ask；卡片唯一性由等待原语 owner 的实际存储承接，不由 runner 内存保证 |

选择实际 JSONL 提供者时，**跨 owner 共同触碰的是该会话的 `entries.jsonl` 已提交行**：runner 写结论/提醒，runtime 写已出门/已开口/响应与终结，调用方写尝试开始及取消。所有写必须进入同一 `sessionLog.append` 的持久判重/栅栏与串行提交边界。SQL 的会话表、时间 `now`、runner 内存锁和未落盘标记都不是共同对象。本节点不要求 runner 结论与后续 HTTP 原子，不把只读 retry 守卫和结论提交冒作 runtime/日志的跨 owner 原子事务；实际发送重新判守卫是必要边界。

| 交错反证 | 必须由真实提供者观察到的结果 |
|---|---|
| 新尝试开始先提交，旧 runner 才追加；或旧结论先提交、新尝试后开始 | 前者旧写 `attemptSuperseded`；后者新 runner 按原键读回旧结论。不得两边各留一条最终结论 |
| 两个无 Run 调用方持同一锚并发；再在提交完整行但回执未到时杀进程 | 第二次提交按耐久键拒重并读已存在值；重启后也只有一条。锚不同不在 runner 的幂等前提内 |
| canDispatchAgain 已 allowed，调用在 retry 结论提交后被终结，再调 dispatchAgain | retry 历史不改；runtime 返回 alreadyEnded，零新发送。不能将旧 allowed 当租约 |
| 结论提交后、提醒提交前停机；另一 owner 推进尝试，再恢复 | 从日志取原 id/createdAt 补缺提醒，生成器与时钟调用数不再增加；每次新写受当前栅栏，旧协程不能补写 |
| runner 结论含提醒 A 已提交，另一消息写入者先向同日志提交同 ID 异内容 B；或 A 先提交、B 后到 | 前者 runner 读回 B，返回 replayInconsistent 且不交效果，保留原结论及 A；后者 A 耐久，B 不得覆盖，runner 同值认回。两边触碰同一 entries.jsonl 中的 MessageId 判重键；alreadyRecorded 不等于同值 |

这些是 V3-5/7 的实际并发义务，尚未执行；日志的既有 formal task 只证明日志抽象，不证明 runner 带对键、栅栏或使用真实服务，因此不登记为本节点绑定。

## 成对的装载与撤除

| 取得的贡献/资源 | owner 与可用时点 | 部分失败 | 撤除与仍为真 |
|---|---|---|---|
| 两个候选服务和本实例停止信号 | runner fiber；依赖日志可用、初始化完成后发布，装配尚须在全部必需 fiber ACTIVE 后确认 guard 才开入口 | 注册任一步失败撤除本实例已取得部分；不保留半个可用 runner | 停止新经过、唤醒在途等待、撤服务；日志事实保留。provide 的 effect 收口沿 kernel-basis 实际 probe，未升格 basis 的部分仍须集成验证 |
| 受限实现表、每条贡献代际 | 登记者的 effect 持注销权；表归 runner；登记成功后可被查得 | 重复登记使登记者失败，不回滚他方贡献 | 只撤自身条目；单条撤除的在途结果按代际判错；整体撤除由实例停止优先收场 |
| 每件调用的日志/环境句柄与取消监听 | 那次经过持有，调用前产生，完成或中止时作废 | 输入/解析失败不泄露句柄；移除已装监听 | 旧句柄不再解析；已经交出的环境引用及其资源仍归实际环境 owner，不声称被撤回 |
| 已启动但不响应取消的实现 Promise | 贡献者拥有实际执行；runner 附带一次结果/拒绝终结处理并撤下自己的句柄/监听 | 启动后异常按契约分类；不是起不来 | runner 不等其实际停止即可返回 cancelled/unavailable；迟到结果不写业务记录，外部效果不回滚。每次经过至多一个在求值件；长期不停止仍是 G-7 限制，不宣称总资源有界 |

装配 `guard.confirm` 是存储迁移/服务就绪后的开闸责任；S-50 的 allowed 是重试只读判断；日志 append 的确认是耐久提交。三者不能互代。全部 ACTIVE 检查、guard 失败后的撤除和入口不受理归装配，runner 自己不提前宣称系统已就绪。

## 关键选择与代价

| 本方（候选） | 落选方最强论证 | 本方弱点、反转条件 | 置信度 |
|---|---|---|---|
| 一个 runner fiber，只 inject 日志，贡献按数据链调用时取 | inject 所有服务/贡献可将缺依赖统一变 PENDING，生命周期更直接 | 缺席分支更多且必须按件明确回答；若契约改成任何贡献缺席都让 runner 停机才改选 | 高 |
| 顺序 await 与纯核心共享，无控制事件 | Cordis serial 自带逐件等待，易与插件生态集成 | 自己维护链/回放迭代；但事件注册序不等于装配链的数据次序，不能把两套合并规则混为一谈 | 高 |
| 真实 runtime 的只读守卫＋发送时再次守卫 | 本地复制一张表可以消除依赖调用失败，先准入后持令牌可避免竞态 | 真实服务暂时失活会停住经过；只读答案有时间窗口，必须测试再发拒绝，不将结论当发送授权令牌 | 高 |
| 日志共同提交序列、耐久键与栅栏 | runner 内部锁与缓存能少读日志、单实例实现简单 | 依赖真实日志正确性与 IO；必须测重启和跨 owner 并发；发现日志不能原子判写即暂停，不改用锁补保证 | 高 |
| 收到停止即返回、不等无上界实现 | 等实际停止可在返回时保证无工作残留 | 外部效果可能继续；须明确贡献者 owner 与迟到处理，不能把取消确认当实际停止 | 中 |

## 缺口与受阻消费者

| ID | 条款／缺口 | owner 与关闭条件 |
|---|---|---|
| G3-0 | runner3/runtime3 已在 catalog 以 candidate 登记；LC4/MS4/MR4/AE4/AR3/MF3 已 accepted；runner3 及本节点技术接受尚待 | 主线/规格 owner；独立评审与接受仍是本版生产实施的门，登记不等于接受 |
| G3-1 | S-6/G-2 候选已补齐 MF3/AR3/AE4/LC4 的链读取；真实正文读取端口、公共判定及同 E/同版本接线尚无实现证据 | runner、manifest、资产正文提供者及装配 owner；完成 V3-2，含 E1/E2 与空 allowed 负例，才能声明真实 dispatch 读链成立 |
| G3-2 | S-7/S-17/G-3 默认重试身份已由 runtime3 S-67 闭合；模态转换、循环探测的规范身份仍未定 | 对应能力 owner；提醒嵌套中确需转换及循环探测的路径仍受阻，不从位置或名字猜身份 |
| G3-3 | S-19/S-30/G-5 候选已定首次 id/createdAt 生成、完整值持久化和结论前后碰撞收场；实际发号/时钟/日志读回待验 | runner、sessionLog 与装配 owner；V3-5/6 用真实共同日志对象演练，生成端口不可用与并发占号均须可失败 |
| G3-4 | S-35/G-14 已有 Runner.tla 的 4 正向/10 反例执行记录，仅有限模型范围；本节点 0 新绑定 | 形式规格/主线 owner；独立评审、证据归档及采用接受；真实 IO、链读取、消息碰撞和运行时接线仍由 V3-2/5/7/11 覆盖 |
| G3-5 | RUN-N7 的公开函数面行为契约仍不完整；撤除先离开 ACTIVE 的精确时序待核对 | 主线/本节点实施者；函数面边界明确；真实 Cordis 负例验证 V3-11 后才声称此机制可用 |
| G3-6 | S-29 G-16/G-17/G-19、G-8/G-10 等未决仍按原契约 | 对应 loop/卡片/放行 owner；本纵线不执行工具或完整 AgentLoop，不把这些路径接受为完整产品闭环。两操作本身的已定拒绝与控制责任仍须实现 |
| G3-7 | S-14/S-26 候选已补齐 canDispatchAgain 全部收场；实际错误策略、前缀保留及输入边界分类尚未执行 | runner/runtime 实施者；V3-7 逐分支验证，不编造 why；invalidInput 不走作者 onError |

归装配：真实 sessionLog、MF3 本地读面与同资产不可变版本正文读取端口、默认重试贡献、合法调用方身份、会话归属、锚、尝试开始与取消记录、首次生成的时钟/发号端口、guard 开闸、诊断 sink 及最终独立验收驱动。正文读取的真实提供者、授权及不可读映射由装配明确绑定；runner 不替缺失正文造声明。现有 [apps/cli](../../../apps/cli/README.md) 是历史产品装配承接者；本轮独立验收装配尚须主线具名建立，不能以它替代 AgentLoop 产品实现。完整覆盖与反例见 [v3 验证页](verification.md#v3-候选证据义务)。
