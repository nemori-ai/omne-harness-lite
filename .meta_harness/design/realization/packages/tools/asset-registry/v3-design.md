# asset-registry v3 增量实现设计

本稿为 **candidate，未接受**。节点与源码路径均为 `packages/tools/asset-registry`，沿 [D-059](../../../../record/decisions/assets-runtimes-split-and-rulings/README.md) 的领域划分；**尚未建包**。原 [design.md](design.md) 保留已接受 v2 的范围。本页服务、函数、配置和存储对象名均为候选，不表示现成 API。

## 输入与实现路径

兑现 `(omne-harness-lite-design-2026-09-15, capability.asset-registry, 3)`，catalog 当前为 candidate。本页 S-n 指 [registry v3](../../../../spec/capabilities/asset-registry/v3/contract.md)，保留其七操作及 S-1～S-50；增量依据是[已提交求值读取链提案](../../../../record/proposals/model-request-adaptation/read-projection.md)。产品坐标沿契约的 PF-002 rev 20、PF-006 rev 19、PF-004 rev 12；本页不扩张完整 Agent Loop、中心同步或命令产品交付。

| 精确依赖 | 本节点消费范围 |
| --- | --- |
| `capability.asset-evaluation/v4`（candidate） | 唯一的纯 evaluate、完整 EvaluationInput/EffectiveAssembly、两次求值及根来源前提；S-6/S-8/S-15 等精确条款沿 registry S-4 |
| `capability.assembly-manifest/v3`（candidate） | 原四操作及 S-32/S-33；表历史与最近已提交求值分开读取，作为本节点唯一耐久权威 |
| `data.asset-model/v3`、`data.tool-definition/v3`、`data.loop-extension/v3`（accepted） | 资产、正文、依赖声明与模型面工具名；不因本批其他新版本出现而自动升级 |
| `data.agent-definition/v1`（candidate） | 经 AE4 与真实正文提供者消费，读取同一不可变根版本的 references/attributes；不是 registry 新增的反向规范依赖 |
| `capability.model-request-runtime/v3` S-66（candidate） | 消费者及边界核对：runtime 的当前设置求值不是 manifest 的历史读取；不把它列成 registry 的规范依赖 |
| 其余十二项依赖 | 精确沿 registry v3 S-4/catalog，含 messages v2 的严格 JSON、profile v2 S-7、identity-values v1、offer-expiry v1、call-accounts v2，以及 MCP、工具放行等窄口；不随相邻包 root 自动漂移 |

继续自建一个薄 Cordis 插件，以本仓库公开纯模块实现本项目语义。求值不复制、不修正结果；正文判定使用 AE4 owner 交付的同一 `defaultBodyContracts` 组合根。Cordis 采用 [D-025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)。清单仍由 `assembly-manifest-store` 经存储抽象兑现；本节点不选择数据库，不建立注册表副本库。

## 契约责任到 Cordis 的投影

| 编号与契约责任 | 插件、服务或公开操作（候选） | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| AR3-1：S-5～S-7、S-14～S-18、S-22、S-48～S-49 | `buildTableContents`、`buildSnapshots`；`assetRegistry.fill` | AE4 成功结果 + 显式全排列 → 六类构成计划 → manifest3 一次 given → 已提交快照 | 追加之前不发布；VE-1/2/3；无产品证据 |
| AR3-2：S-13、S-16～S-18、S-23、S-48、S-50.2/5/6 | `assetRegistry.reload` | 获取本次真实输入、公开 evaluate；按来源确认的 C16 根失配收 unavailable；成功后检查完整排列、构建全部目标表并一次 mint | 根失配不换旧表、不追加清单；不按集合遍历排序、不预填 minted ref。固定输入接线见 AR3-G3；VE-2/4 |
| AR3-3：S-8～S-12、S-16、S-20、S-24、S-31、S-50.5/6 | `computeAvailability`、`buildReport`；`refreshAvailability` | AE4 第一次给持有/门控、桥给本次动作、第二次加动作集求执行权限；同一次输入仅加动作集，无动作时复用第一次纯结果 | 确认 C16 根失配则整个 unavailable、无报告；通常二次读不到才保留报告并标非 meta 门权限 unavailable；VE-5/6；真实输入义务 AR3-G2/G3 |
| AR3-4：S-19～S-20、S-25～S-26、S-34 | `findInSnapshot`；`lookup`、`list` | 按 within 固定当前或报告所依快照；只在规定分支现求“谁可以用” | tool/run 不重新求值替换正文；skill/run 不重判门控；VE-5/7 |
| AR3-5：S-27～S-28、S-48.6、S-50.3/4 | `markFailed`、`onAssetChange` | 从目标表历史记录取得 E1/O1，筛掉条目；同次 reuse 保留原引用/结果/完整排列 | S-27 不重新求值；S-28 现求只作删除判据，不把该结果冒充新的表源；VE-8 |
| AR3-6：S-17～S-18、S-31～S-34、S-43、S-50.4 | 清单对头、历史重建与条件追加闭包 | manifest3 readHead/readHistory/readEvaluation，候选共同 SQL 记录与表内容 | 每表来源与会话最近源分别保留；未知提交不盲目重发；VE-9/10/11 |
| AR3-7：S-29～S-32、全部七操作 | 一个插件/fiber、稳定 `assetRegistry` 服务；必需 inject `assemblyManifest`、`clock` | 不 inject storage、求值或每个动态贡献；需要时现取读面/桥/自报 | 业务事件仍 0；纯函数可单用；配置与撤除见后文；VE-12/13 |

### 公开函数与服务面

保留原四类纯构件并明确提交前后边界。候选 `computeAvailability`、`buildReport`、`findInSnapshot` 分别处理显式读数、报告值及给定快照；不读取 Context、存储或当前身份。调用者可在 Cordis 外使用。

候选 `buildTableContents(evaluation, compositionOrder, bodies, filledAt, filledBy)` 在提交前完成排列、正文及工具名冲突检查，产生完整目标表构成与三字段 content 计划。候选 `buildSnapshots(committedRecord, bodies, availability)` 从确认提交的同一记录壳取得 basedOn，从表项取得 filledAt，从 content 取得 filledBy；不在 mint 前制造占位 EvaluationRef。正文及其他能导致构建失败的条件须在追加前完成；提交后的映射是已验证值的确定投影，映射缺陷不可谎称 SQL 没提交。

服务面组合上述函数，负责七操作的会话归属前提、输入读取、选择快照、条件追加、发布与恢复。只读纯函数不承诺给定快照属于当前尝试，也不授予访问资格。模型请求 runtime 必须调用真实 `lookup(tool, within=run{report})` 取得正文，不能从固定 fixture 或最新 AE assets 绕过它。

## 三种求值关系及字段来源

| 用途 | 采用哪份事实 | 禁止替代 |
| --- | --- | --- |
| 当前或报告所依的某张表 | readHead/readHistory 所定位的那条表记录；table 构成、filledAt 与壳 evaluationRef | 不因另一个类别 reload 或新的根设置而改写旧表 basedOn |
| 会话最近已提交的求值 | manifest3 readEvaluation 固定 head 上界，选择本会话最近 given/mint | 最新头为 reuse(E1) 时不能回退已提交 E2；也不能把 E2 当成当前层值 |
| reload、尝试开始与规定的读时门控 | 真实输入提供者按该操作要求读取，公开调用 AE4 evaluate | 不从历史 EffectiveAssembly.values 反推输入，不把旧 E、空集或固定设置当作当前事实 |

S-48 的记录计划严格只含 `content={evaluation, compositionOrder, filledBy}`。完整 AE4 结果及未用于本次目标表的 root/values/filteredOut 等都保留；不复制一份 EvaluationInput。`tables[category].composition` 保存真实有序构成，`tables[category].filledAt` 是表时刻，记录壳 `evaluationRef` 是 basedOn 的唯一来源。JSON 通过现有严格无损构件处理；不以普通 stringify 文本相等比较对象，不舍入数字或把 true 当成 1。

reuse 记录保留旧表所依 E1 与完整 O1，仅 tables 记删后的构成；`onAssetChange` 为当前权限执行的新求值只提供删除判据，不能覆盖记录的历史 E1。具体反例：fill(E1/O1) → reload(tool,E2/O2) → markFailed 旧命令表；命令表/readHistory/reuse 仍回到 E1/O1，readEvaluation 返回 E2/O2。重开后两者仍不同；runtime S-66 的实时设置另外现求。

### 成功求值与顺序检查

fill 接收调用方真实 evaluate 的成功结果；本节点核形状和排列，但不把形状合格等同来源可信。reload 对缺席、词法、类型、重复等可直接判的输入错误先拒绝；然后读会话、读取真实输入并调用 evaluate。其 compositionCycle/categoryUnsupported 按 S-23 顺序原样转交，没有成功 E 时不猜全排列是否成立。

取得成功 E 后才比排列与 E.composition：漏项、额外项、根成员为 invalidInput；随后才判 unresolved 与 toolNameConflict。旧/新 plugin 的成员决定一次 reload 的目标类别，所有目标共用该次 E；其他类别的内容、次序、时刻、basedOn 保持原值。调用方给的顺序不能被排序、删补或从新的 E 重新生成来“修好”。

### lookup/list 的分支

| 分支 | 快照 | 读时权限处理 |
| --- | --- | --- |
| slash_command，session 或 run | 分别为当前表或报告所依表 | 每次真实输入 + AE4，读取 not_usable；只收窄已在表内的条目 |
| skill，session | 当前表 | 现求门控；输入不可读为 unavailable，不能答“没有” |
| skill，run | 报告所依表 | 按报告钉住的技能门控，不现读，不改成当前表 |
| tool/plugin/loop_extension/mcp | 按 within 选表；tool/run 含本报告动作条目 | 不增加 S-20 没有的使用权限门；可用性按报告或最近一次读数 |

读只读、不换表；现求的门控结果不跨调用缓存。读取失败与“没有”严格区分。报告身份由内部调用方核实，本节点仍检查显式 session/run/attempt 一致性，不取“最近一份报告”。

## 依赖与尚待对齐的真实输入

| 依赖与范围 | 取得/生效方式 | 缺席、撤回与旧引用 |
| --- | --- | --- |
| manifest3、clock | 必需 inject；同一节点实例固定这两个提供者 | 缺席 PENDING；换代重跑、丢弃可重建缓存。已受理操作按自己那次真实追加收场 |
| AE4、asset-model3、正文组合根及各类纯值 | 静态公开 import | 构建或制品错误不伪装为 unavailable；本节点不另实现求值 |
| 会话租户、真实配方、持有/配值、精确正文及工作区 | 候选 `packages/assets/evaluation-input-store` 与真实 sessionTenancy；调用时取得 | 会话归属与输入一致性在交回前核实；缺源 unavailable。不在本节点直接拼接多份未核对读取 |
| MCP 桥、模态读面、声明依赖的提供者自报 | 沿旧设计作为可选读面按调用现取 | 分项“缺”/“读不到”，不静默放行，不自动换执行者；原 G-6/G-7/G-9 仍有效 |
| 诊断接收端与策略 | 候选装配显式提供的有界结构化观察端口 | 不记录完整 content、正文、配值或凭据；诊断失败不改写提交事实，由装配暴露覆盖缺口 |

输入端口须明确配方与当前授权的区别；以下语义按最新候选对齐，真实提供者仍未实现：

1. **AR3-G2：成员资格与授权。**[AE4 S-6/C12](../../../../spec/capabilities/asset-evaluation/v4/contract.md#s-6-求值输入-evaluationinput) 已区分 standing 的求值配方与 PRE-3 的当前有效性/调用权限；[E-11](../../../../spec/capabilities/asset-evaluation/v4/examples.md#e-11-捕获角色与当前资格分开) 给出场景。registry S-24②显式捕获的 standing/roles 仅作该路径的角色配方；S-20.2 规定现读的门控仍按其当前成员资格来源，不能用 runtime S-66 的捕获政策覆盖所有 registry 读取。两类输入都必须另核当前 tenant 有效且调用有权，旧 captured effective 不足以放行。源提供者候选接线复用已存在的 organization-governance 公开 `memberships.participate(unit).standing(tenant)`，与本次本机来源在同一一致存储 unit 中读取；不逐请求向中心改写捕获身份。无权、失效、未知或无法形成一致输入时不交出成功输入，消费操作按契约 unavailable。源 provider 的接线与实际撤销交错仍是实施缺口，不因候选文字对齐视为验收。
2. **AR3-G3：根版本与用途。**registry S-23/S-24 沿装配定义版本及对应根；runtime S-66 读取这次持有规则选择的真实根。源提供者须明确每种用途的配方与正文读取，并满足 AE4 C16/PRE-9。不能把 current 改 pinned、只改 source.version 或用当前根暗换 registry 的旧根。固定根与真实选版不符时保留 C16 的失败事实，不能调整输入使其通过；源不能取得合法输入时按操作的不可用分支收场。具体固定定义/正文/工作区读取面、共享 AE 选版构件及并发有效性核对由源 owner、AE4 owner 与主线完成；正在成稿的 S-66 current 接口本身不覆盖该固定根请求，registry 不在这里发明另一份 EvaluationInput。

**C16 失败交接。**按 registry S-16、S-23⑥⑧、S-24⑥⑧、S-31 与 S-50.5/6，内部输入生产者保留装配固定根 A 的版本 1 正文及 `source`，同时读取真实当前持有；当前根被 B 替换或仍为 A 但选用版本 2 时，真实 AE4 evaluate 按 S-7/C16 拒绝。生产者须用本次固定来源与实际持有/选版事实确认根失配，并交回可核实的依赖失败因果；服务只在请求本身合法且该原因已确认时将 `invalidInput` 映射为 `unavailable`。不能仅按失败名捕获所有 `invalidInput`，也不能改 root.source、声明、引用、current/pinned 策略或伪造旧持有来使输入通过。reload 不构建或发布新表、不追加清单；refresh 的 start/continue 都不交 `AvailabilityReport`，已有六张表、清单头和历史内容保持不变。

该分支与普通第二次求值读不到分开：后者仍按 S-24⑧ 交出报告，除 meta 门外的 `effectivePermissions` 项为 `unavailable`；已确认的根失配不能降成权限分项失败并交报告。缺 `compositionOrder`、缺 `attempt`、错误身份/运行报告等调用者错误仍按原次序为 `invalidInput`；成功求值后才可判的非法排列仍在该处判定，`compositionCycle`／`categoryUnsupported` 原样转交。规格映射缺口已落定，AR3-G3 只保留固定用途输入、原因交接的实现及真实来源验收义务；不因此声称行为已验证。

## 共同提交对象与存储要求

本节点**无自有持久表、不 inject storage**。以下要求全部经 manifest3 追加/读取交给 [assembly-manifest-store v3](../../assets/assembly-manifest-store/v3-design.md#存储要求与共同对象)；沿用原 R-M1～R-M9，新增或强调的映射如下。两个节点要求在同一存储约束域兑现，不另选数据库。

| 编号、条款 | 对存储提供者的要求 | 共同对象及写入者 |
| --- | --- | --- |
| R-AR3-1：S-17/S-18/S-48.5 | 求值 content、所有目标表构成、表时刻及引用一次提交、全成全败 | `assembly_manifest_record(session,seq)` 与外键所连 `assembly_manifest_table(session,seq,category)`；manifest.append 是唯一物理写入者，registry 不另存表 |
| R-AR3-2：S-17、S-22⑦ | 期望头判定与追加同事务；同会话竞争可识别 | 新旧 registry 实例经同一 manifest 约束域写同一 `(session,seq)` 主键；事务内会话哨兵排序，主键兜底。进程队列不承担正确性 |
| R-AR3-3：S-13、S-22⑦、S-48.4/6 | given 全局引用唯一且可认回，reuse 源属于同会话，mint 在提交时铸号 | record 的 `owned_ref` 唯一约束与事务内源查询；跨会话竞争在同一索引相遇；不以不同会话的内存 map 去重 |
| R-AR3-4：S-6/S-25/S-33/S-50.4 | 一致读取 head 与各表、按表时刻读历史、既存源不可变且可重建 | 同一 ReadTx；`assembly_manifest_table(session,category,filled_at)` 唯一性及记录外键；readEvaluation 最近 given/mint 的规则独立于表历史 |
| R-AR3-5：S-18/S-19/S-32/S-33 | 追加成功后的既定持久边界、严格无损内容、未知结果/不可用可识别 | 沿 manifest 存储要求与既有 [D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md)；不把正常进程重开结果扩成断电无损 |

**清单 SQL 与会话 JSONL 没有共同提交。**S-27 的命令失败先由派发调用方耐久写会话日志，确认后才调 markFailed；后者只在自己的 manifest 追加点删表项。日志失败则不调用；日志成功后进程中断或 SQL 失败，失败事实保留、命令可能仍在，按 S-27 下一次失败再调用，不自动制造跨存储回滚或未知重放。runtime 的调用锚点、attempt 栅栏及回复/响应同批写入也只归 sessionLog，不把其日志位置当 manifest seq。

### 两条写交错与一条历史反例

- **旧实例 reload 与新实例 markFailed 都读 head=H**：先追加者在 `(session,H+1)` 提交，后者 headMismatch 后按新头重建并重做自己的计算；不能用旧计划覆盖另一操作。进程队列即使禁用仍应成立。未知追加结果不走此已知冲突重做分支。
- **两个会话 given 同一引用**：会话锁不同，但 owned_ref 唯一约束相同；最多一方成功，另一方 evaluationRefConflict 不能成为第二次合法 fill。仅各自加进程锁或各开一库无法保护。
- **E1→E2→reuse(E1)**：表源 E1 与最近已提交 E2 不相等是合法状态。若从最新头的引用解释全会话根、或把 reuse content 改为 E2，VE-8 应失败。输入实时性另由 AR3-G2/G3 的读取协议保护。

## 状态、并发与失败

实例只持有按清单头校验的缓存、可重建旧快照、有界换表队列和停止准入标志；报告由调用方持有，不在此持久或共享“最后一份”。快照输出不允许后续缓存修改污染，重建读不到原版本正文为 unavailable，不用最新正文补齐。

换表先完整准备、一次 append、确认后才发布；每次读先对清单头，防止旧实例晚提交后新实例持续给旧缓存。已知 headMismatch 才可依策略重新读取并重做；策略可配置、有界，沿原默认的一次冲突重做作为配置初值，不能硬编码进算法。满队列/策略耗尽明确 unavailable；不丢弃已受理 Promise。配置非法沿本批既有启动失败政策，运行期间来源不可读按具体操作返回，不混成配置错误。

given 回执丢失可按同一引用认回；当前六表已被取代则 evaluationSuperseded。mint/reuse 不获得额外幂等键；提交未知时不以“报错”断言没写，也不自动重发。接下来清单对头/历史读确认事实，再按契约收场。若调用方忽略未知事实直接重试 reload，可能产生另一次合法 reload，必须如实保留。

两次求值的失败、分项不可用、工具名冲突按 S-23/S-24 的既定次序处理；C16 已确认根失配按前述依赖映射收口，与通常二次读不到分别记录。外部读取 unavailable 不返回空表；内部求值/Schema/存储约束缺陷按原分类暴露，不用 catch-all 掩盖。可观测信息包含操作、会话/尝试关联、旧头/期望头/新头、目标类别、引用、固定根与本次选用的资产/版本关联、当前读取阶段、依赖失败到操作结果的分类、队列和资源结束；不含正文、完整配置与秘密。

## 成对的装载与撤除

| 取得资源或贡献 | owner 与对外可用 | 部分失败 | 撤除、在途与保留 |
| --- | --- | --- | --- |
| 纯模块和正文判定器 | 本实例持有不可变构件；不依赖服务才可单用 | 规范/实现错误暴露，不发布半个服务 | 无 IO 资源需释放，不撤回已交出的纯值 |
| `assetRegistry` 服务 | 本 fiber；必需依赖 ACTIVE、配置通过后对外提供 | 失败随 fiber 收回；provide 纳管仍须真实宿主核对 | 先关本实例准入；旧引用后到请求 unavailable |
| 缓存、队列、在途调用登记 | 一个组合 effect 所有；任务从受理到完成都有归属 | 已受理任务有明确拒绝/完成去向，不能清队列后遗留 Promise | 已受理操作跑完，按各自那次追加收场；不靠取消请求或服务消失宣称停止。晚结果不写入新实例缓存，最终释放旧实例状态 |
| 借用的 manifest/clock/输入/桥/诊断端口 | 各提供者持有资源；本次操作使用明确取得的实例 | 缺失按契约分项或整体 unavailable | 不关闭他方连接/存储；已开始事务由其真实 owner 收口，未能开始的调用按实际不可用失败 |

不依赖多 disposer 的完成次序；应用停机须等真实在途与存储事务结束后再回收依赖，不能仅按 fiber 状态认定所有外部工作已结束。这里无自动业务重放、资产通知监听或模型请求取消。

机制依据逐条引用：必需/可选取用是 [inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)；必需提供者换代是 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)；配置失败是 [plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)；清理并发限制是 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)。均有既有 probe，但不是本节点组合证据。`provide-is-effect-managed` 尚无 basis 条目，保持**待核对主张**，VE-12 真宿主演练后再交主线，不在此推导上游。

## 关键选择与代价

| 选择 | 落选方最强论证 | 本方弱点与复查信号 | 置信度 |
| --- | --- | --- | --- |
| 一个插件，必需 manifest/clock，其他读面按需取得 | 拆开只读服务可独立启动；所有依赖均必需可简化缺失分支 | 清单换代使整实例重跑；可选端口需分项失败与真实资源责任。须以 VE-12 验证 | 中高 |
| 注册表不建持久表，清单一次追加后发布 | 自己建表可直接查询、索引，减少重建成本 | 每次对头及正文重建有成本；先测再决定缓存，不能多写一份权威 | 高 |
| 显式顺序与提交前构成计划，提交后从壳投影 | 直接让 buildSnapshots 铸引用可减少两步接口；按集合顺序无需输入 | 增加一个纯构件并维护前后不变条件；能避免 mint 假引用与隐式顺序 | 高 |
| E1 表历史、E2 最近提交、实时输入分别读取 | 统一“当前求值”入口最简单，调用方少处理来源 | 更多读取和用途契约；固定根与 current 不能共用未区分用途的 getter，当前资格亦须真实现核 | 高，AR3-G2/G3 的真实输入接线待实施 |
| 真读数分支求值，无门控结果缓存 | 缓存可降低命令识别与列表延迟 | 读成本随频率增长；沿旧 A-8 先测延迟/资源，再提有失效前提的优化 | 中高 |

## 归装配与实施缺口

候选 `apps/model-request-acceptance` 负责：真实 storage/clock 与 manifest 迁移、全部必要 fiber ACTIVE 后 guard.confirm 再受理；会话/租户/run/attempt 身份核实；真实根资产/版本、持有及配值的显式发布；传入完整排列；调用 refreshAvailability 并传同一报告；日志失败先落盘再 markFailed 的顺序；观察端口与有界策略；旧调用结束前不关闭借用存储。此装配不是完整 Agent Loop，不自动选第一条模型，也不自创初始正文。

原生产应用 `apps/cli` 的资产通知转发、完整 PF-004 装配触发及中心副本同步未由本批自动关闭；本节点仍不监听所有租户的事件或枚举会话。

| 缺口 | 条款与受阻消费 | owner 与闭合条件 |
| --- | --- | --- |
| AR3-G1 | v3 candidate；本节点、manifest3 尚无源码，全部七操作 | 主线接受；本节点/manifest 实施者完成 VE-1～VE-13 及原义务 |
| AR3-G2 | S-20.2/S-24②及 AE4 S-6/C12/PRE-3 的来源语义已区分，真实当前资格/授权读取未实现 | 输入源 owner 对同一 unit 接真实 memberships 现读，演练角色配方保留与资格撤销/未知；不把捕获值作为授权 |
| AR3-G3 | S-16/S-23/S-24/S-31/S-50.5/6 已明确 C16 invalidInput→依赖 unavailable；固定用途读取面、共享选版构件、可核实的原因交接与真实演练仍缺，reload 与 refresh 消费受阻 | evaluation-input-store、AE4、本节点与验收装配 owner 完成读取/失败交接及 VE-2/4/6；不得伪造 pinned/root 或旧持有解除阻断；runtime S-66 当前根用途保持独立 |
| AR3-G4 | S-22/S-31 的真实输入、正文、会话身份及尝试调用方 | 输入提供者及验收装配落地；旧 A-2 不能仅凭 runtime S-66 方法存在就宣称闭合 |
| AR3-G5 | S-8～S-12 的 MCP/自报/有效模式/meta 门未全具备 | 相应原 G-6/G-7/G-9 owner；本批缺席按契约处理，未演练分支不列覆盖 |
| AR3-G6 | S-27 的 JSONL→SQL 顺序、S-17/S-18 的竞争/未知提交、实际撤除与观测尚未验 | 本节点、manifest/sessionLog 及验收装配 owner 执行真实故障与重开；不以单元替身代替 |

存储要求已互指 manifest 节点；源节点及新验收装配尚待主线成稿。原 design A-3/A-8、契约 G-3/G-14/G-17 继续沿其产品边界，不借本增量改写。验证义务见 [verification.md](verification.md#v3-候选增量)；本稿不接受自己。
