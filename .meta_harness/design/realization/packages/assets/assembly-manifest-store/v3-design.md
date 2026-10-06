# assembly-manifest-store：已提交求值读取增量

本页为 **candidate，未接受**；2026-09-27 rev 2。[已接受 v2 设计](design.md)保留原状态，本页只增加 v3 求值读面，不更换旧四操作的 SQL 提供者。本文服务、函数、列与源码组织名均为**候选**；`packages/assets/assembly-manifest-store` **尚未建包**。

## 输入与采用边界

依据 已提交求值的读取链候选及其 2026-09-27 存储归属修正。本节点补模型请求纵线的窄读取链；完整 Agent Definition、Agent Loop、自动初选与派发器构链仍归原拥有者。产品依据沿 manifest v3 的 PF-004 rev 12、PF-006 rev 19、PF-015 rev 11、PF-013 rev 13，不因本页候选而提升接受状态。

依赖的当前接受状态与采用记录以 [registry catalog](../../../../registry/catalog.json) 为准；下表只固定本节点拟消费的精确版本，不以本页静态状态标签替代登记，也不因依赖被接受就提升本候选节点。

| 精确坐标（baseline 均为 `omne-harness-lite-design-2026-09-15`） | 本节点消费范围 |
| --- | --- |
| [`capability.assembly-manifest/v3`](../../../../spec/capabilities/assembly-manifest/v3/contract.md) | 35 条、五操作；S-1～S-31 保留原责任，S-32～S-35 增加投影与读取验证 |
| [`capability.asset-evaluation/v4`](../../../../spec/capabilities/asset-evaluation/v4/contract.md) | S-8、S-12 定义完整结果与缺席，S-47 定义完整成功结果的公共纯值读取。只读取已提交结果，不调用 evaluate 或重解释属性 |
| [`capability.asset-registry/v3`](../../../../spec/capabilities/asset-registry/v3/contract.md) | S-48～S-50 是生产者责任及跨节点验收输入，**不是 manifest 的反向契约依赖** |
| `data.identity-values/v1`、`data.offer-expiry/v1`、`data.messages/v2`、`data.asset-model/v3`、`data.tool-definition/v2` | 精确消费面沿 manifest v3 S-4。这里的 SessionRef、严格 JSON 与 DependencyName 不随其他模型节点升级到新数据版本 |

候选源码仍在同名两层路径。现有 `core/storage` 协议与 `infra/storage-sql` 提供者继续承接存储要求；D-026的采用与 D-027的 NORMAL 持久边界不变。此次不另选数据库、不迁移到会话 JSONL、不增加第二份清单权威。共享存储对象仍是 `assembly_manifest_record(session, seq)` 及同事务的 `assembly_manifest_table` 行；`owned_ref` 的唯一约束仍覆盖所有会话。

## 契约责任到插件、服务与操作

| 契约责任 | 插件、服务或公开操作（候选） | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| manifest/v3 S-1～S-4、S-15：窄口、依赖与失败词汇 | 一条 fiber、稳定 `assemblyManifest` 服务；公开闭包 `createAssemblyManifestStore` | 延续原设计；尚未建包 | 原四操作加 readEvaluation，无管理写面或自动重试；AMS3-1 |
| S-5～S-9、S-12、S-17：会话序列、条件追加与引用 | 原 `checkManifestAppendInput`、`judgeManifestAppend`、`append` | 原两张 SQL 表、会话哨兵、主键与 owned_ref 唯一约束 | 原五道判定次序、given 认回、mint 铸号、reuse 同会话寻源不变；旧 S-26/S-27、V-1/V-2/V-7/V-8 保留 |
| S-6、S-11、S-13、S-18、S-24：原样存取、历史与持久 | `append`、`readHistory`、无损 JSON 构件 | 一次写事务写记录及全部目标表；无 UPDATE/DELETE | 原 R-AMS1～R-AMS9 与 registry R-M1～R-M9 全部保留；S-28、V-5/V-6/V-9；D-027 边界不提升 |
| S-10、S-14、S-16、S-19：原两种查询 | `readHead`、`dependencyPresence`、`answerPresence` | 一次 ReadTx；presenceSource 仍由装配给 | 空头与不可用不同；无来源仍 unavailable；旧 S-29～S-31、V-3 保留 |
| S-20～S-23、S-25：无事件、身份前提、结果未知与撤除 | 原闭包、必需 inject storage、一个撤除标记 effect | Cordis 4.0.4；没有新增耐久活状态或形式任务 | 在途事务跑完；权限与升级确认归装配；AMS3-4/5 |
| S-26～S-31：原六条规范场景 | 同一候选五操作实现的真实存储测试 | sqlite 文件库；pg 可运行时补其路径 | 原义务不被新增读面替代；全部尚未运行 |
| S-32；AE/v4 S-8、S-12、S-47：两个投影槽位及完整成功结果 | 公开纯函数 `readEvaluationProjection(content)` 调用 AE4 公共 `judgeEffectiveAssembly` | 严格无损读取后检查全部五类闭合 DTO、开放 JSON 槽及 S-47 结果内关系，再核 compositionOrder 全排列；尚未实现 | 判定通过才原值完整交回，不重做求值、不补根设置；结构不证明来源/权限；AMS3-2、ME-3/4/7 |
| S-33：当前提交上界内最近的完整求值 | 公开闭包与服务的 `readEvaluation(session)` | 一个 ReadTx 固定 head，再取同会话 seq ≤ head 的最近 given/mint 源 | 三项返回均出自该源；reuse 不让结果回退，不读其内容、不找别会话；ME-1/2/5/6 |
| S-34、S-35；registry/v3 S-48～S-50 | 真生产者 → 同次追加 → 历史读回的组合验收 | registry、AE4、本节点及模型验收装配 | 内容恰三项只约束 registry 生产者；ME-7，AMS3-3；本节点不冒领根正文读取与求值真实性 |

## 公开面与读取路径

包公开入口保持纯判定函数与不依赖 Cordis 的存储闭包；插件入口另行包装同一闭包。新增纯函数只检查已取得的内容，返回两个原值或投影不合法的具名结果；它不碰存储、租户、会话、目录或模型。完整结果判定复用 AE4 的候选公开函数 `judgeEffectiveAssembly(value: unknown): boolean`（[提供者投影](../../core/asset-evaluation/v4-design.md#持久结果的公开纯值判定)），不另建读取器权威。其布尔结果不是修补后的求值对象；通过后本节点交回原来的完整纯值。S-47 的 EffectiveAssembly、EffectiveAsset、EffectiveValue、FilteredOut、Unresolved 五类 DTO 按闭合成员表判，任意设置 value 槽保持开放 JSON；成员类型、唯一键、跨集合及层关系全由该公共构件统一核对。判定为 false 才映射为 unavailable{reason: invalid_evaluation_content}，程序缺陷不得伪装为 false；不能只校验 runtime 当前使用的根值。

纯值通过不证明来源、选用版本真实性、求值计算正确、当前新鲜度或租户权限；这些仍归真实输入 owner、evaluate 生产者与调用方。任意设置对象含 allowed 成员也不据此判作权限；自洽的混源结果可能通过，必须由生产链保证来源，不能让单参判定器承担它没有的输入。

`readEvaluation` 先按原 SessionRef 规则验证输入，然后进入一次 `storage.read`。在该 ReadTx 内读本会话最大的 seq 并固定为 head；无行即确认空头。再以 **session 相等、seq ≤ head、evaluation_kind 为 given/mint** 选择 seq 最大的源记录并读取。新旧按提交序号，不按 filledAt、内容时刻或引用字串判断；当前头是 reuse 时也不沿它的 evaluationRef 回退源。上界内无源或已选定源确定缺失即 recordNotFound；不能取消会话条件以借别会话的合法内容。

取源记录的 evaluationRef 与 content，经严格无损 JSON 读取、AE4 S-47 完整结果判定与 S-32 排列校验，完整交回 `{ evaluationRef, evaluation, compositionOrder }`，三项都来自选定源，不拼接头为 reuse 时的引用。evaluation 的 root、assets、composition、values、filteredOut、unresolved 及成员附带信息按 AE4 原值保留；集合身份按规范比较，compositionOrder 保持原顺序。根不属于 composition，不得加入排列。空 composition 要求显式空序列；不能把缺席补为空。根设置缺项可以是合法求值结果，本节点不追加时限、默认模型或锁。

registry S-48 的写入内容恰为 `{ evaluation, compositionOrder, filledBy }`；**这不是通用 append 或 readEvaluation 的额外 exact-members 限制**。其他合法 JSON 内容照旧可追加；额外成员、filledBy 的含义归写入方。readEvaluation 只投影这两个槽位；evaluation 槽内仍执行 S-47 全量检查，不能把顶层 content 允许额外成员误用为嵌套 DTO 允许未知成员。reuse 的任意 content 不参与此次投影；不能用 reuse 或更早的合法 given/mint 内容补救最新源缺项、缺失或非法。readHead/readHistory 仍保留旧表的 reuse 来源与 basedOn，两种读面不互相改写。

不建立进程内“最新求值”缓存、后台追尾或旁路物化表。每次调用从已提交头开始；新 given/mint 提交后下一次读取可看到新的求值，仅追加 reuse 不改变所选源，重开后从相同耐久记录恢复。此结果只表示最新已提交求值，不冒充当前层设置重新求值；runtime 的新鲜输入取得与解释另归其 owner。若未来测量证明查询有瓶颈，再评估缓存与失效，当前不以未测性能理由增加状态。

## 依赖、作用域与绑定

| 消费面 | 提供者与范围 | 变更与失败 |
| --- | --- | --- |
| `storage` | 必需 inject；本据点同一 `infra/storage-sql`，原迁移由装配合成 | 缺席 PENDING；换代重跑。事务受存储实例拥有，本节点不关闭借来的池/文件 |
| 严格 JSON 与完整 EffectiveAssembly 表示校验 | 精确消费 content-blocks/v3 S-24 的公开无损构件及 AE4 S-47 的候选公开 `judgeEffectiveAssembly`；采用状态查 catalog，本节点不复制结果 schema | 公共面表达已对齐；实现、制品消费与拒绝映射仍待 AMS3-2。文本重复键在解析时拒绝，不能先用普通 JSON.parse 丢精度再校验；构件缺失为构建/链接缺口，不回退到局部校验 |
| `presenceSource` | 原可选配置；仅需要其查询的验收装配给测试种子 | 未给合法，dependencyPresence 答 unavailable；与新读面无依赖 |
| 消费者 | `packages/tools/asset-registry` 用旧读写面并采用 S-48；`apps/model-request-acceptance` 消费新增历史读面；拓展点派发只沿其自有版本采用 | runtime/v3 S-66 当前输入由 `packages/assets/evaluation-input-store` 提供，不能回退为本历史结果。采用动作须逐消费者确认；旧 v2 不自动拥有新方法，拓展链解释和完整 Agent Loop 不随本增量交付 |

Cordis 采用 4.0.4（D-025）。已登记 basis：[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)承载必需依赖；[`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)承载换代重跑；[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)承载非法配置启动失败；[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)说明不能依赖多个 disposer 次序。上述条目有 probe，但不构成本节点证据。`ctx.provide` 的 effect 纳管继续沿原 kernel-basis probe 记为**待核对主张**，新增真实宿主验证见 ME-6。没有本节点可选的时限、重试或轮询策略；装配层的退出等待策略仍显式配置，不在此硬编码。

## 存储要求与共同对象

这是对存储提供者的要求，不新增数据库选择。原 [R-AMS1～R-AMS9](design.md#对存储提供者的要求清单)全部保留；本批追加下列消费。

| # | 要求及对应条款 | 兑现点与互指 |
| --- | --- | --- |
| R-AMS3-1 | head 与其上界内最近 given/mint 源在一个已提交快照中读取（manifest/v3 S-33） | 沿 `core/storage` P-6 的同一 ReadTx；按 session/seq 限定上界并选最大源序号，读期间不切换存储实例 |
| R-AMS3-2 | 选定源及返回引用属于同会话 given/mint；全局 owned_ref 不冲突（S-8、S-33） | 沿旧 R-AMS2/3/4 的锁定判定和唯一约束；reuse 写时仍按其原引用校验，与追加同事务。本次不增另一份引用表或内存锁 |
| R-AMS3-3 | content 字节可无损还原、整次读失败可识别（S-11、S-32、S-33） | 沿旧 R-AMS7；仅在新 readEvaluation 上按下表映射投影/持久内容读取错误，不修改旧四操作 |
| R-AMS3-4 | 源记录及目标表内容同次追加、重开留存（S-12、S-13、S-24；registry/v3 S-48） | 同一个 `assembly_manifest_record(session,seq)` 与外键所连 `assembly_manifest_table`，由本节点 append 唯一写入；互指 [registry 的 R-M1～R-M9](../../tools/asset-registry/design.md#对装配清单提供者的要求清单)。registry 内存表发布在追加确认后，不另起 SQL 事务冒充共同提交 |

记录序号是清单序号，不是 SessionLog 位置。会话 JSONL 的调用锚点与响应/回复追加另有 owner；本节点与那份日志没有共同事务，也不新造 manifest fence 或运行尝试守卫。S-21 的调用方核实仍由装配承担。

两类写交错仍由旧机制保护：同会话旧/新 registry 实例带相同期望头追加，必须在同一库的哨兵/主键处相遇；不同会话给同一个 given 引用，必须在 owned_ref 唯一约束处相遇。拆成各自库或只用进程内锁均不能成立，旧 S-26、V-1/V-2 继续真跑。

新增读交错：读者固定 head=1 后，写者在 seq=2 提交 e2，读者仍返回上界 1 内的完整 e1；另一次调用可以得到 e2。再在 seq=3 追加 reuse e1 后，新读面仍返回 e2；readHead/readHistory 的表引用则继续保留 e1。原始源是不可变数据；**只拆开两次查询但保留固定上界，在只增数据集上未必产生错误**，不能把它包装成必然失败的反例。ME-2 检查真实 ReadTx 的取得/释放，并以去掉上界且拆读、错误沿 reuse 引用、三项混源作为能失败的负控，分别报告证据性质。

## 状态、并发与失败映射

只有实例准入标记与存储拥有的在途事务，没有可交接的求值活状态。旧四操作的失败映射、条件判定次序与回执未知边界完整保留。

| 新 readEvaluation 情形 | 结果与机制 |
| --- | --- |
| SessionRef 缺席或不合形状 | invalidInput；不开 ReadTx |
| 确认空头、上界内同会话无 given/mint 源，或已选定源确定缺失 | recordNotFound；非空头而无源等情形只能由非法外部写入/损坏等 fixture 构造，合法 append 不产生它；不改选更早源 |
| 源存在，content 不是对象、槽位缺失/非法或排列错误 | unavailable，reason 为 invalid_evaluation_content；不回退到上条合法源 |
| 持久 content 不能严格无损解码 | unavailable；若已确认是 S-32 投影不合法，使用上述 reason。保留阶段诊断，不假空值；旧 readHead/readHistory 的缺陷映射不改 |
| 必要存储读取不可用或实例停止准入 | unavailable，不借缓存回答 recordNotFound 或成功 |
| 无关程序缺陷、存储结构或约束缺陷 | 按原存储分类暴露缺陷；不能把全部异常 catch 成 invalid_evaluation_content |

只读失败不重试、不追加。取消请求不是一个新契约操作：调用方停止等待不等于 ReadTx 已释放；已进入的读取跑完该次快照，事务在成功/失败路径均由存储的收口协议释放。旧 append 已确认/结果未知的事实不能因调用取消、fiber 撤除或诊断错误改写成“未提交”。

工程观测沿 [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md)：记录操作、提供者修订、会话关联、固定 head/ref、读源阶段、结果分类与实际资源结束；租户/尝试关联只接调用方已经核实的上下文，不从裸 SessionRef 猜授权。无日志 payload、求值内容或秘密值；诊断尺寸、输出故障和保留由装配的有界观测端口配置。记录不可用应暴露覆盖缺口，不能篡改业务返回为成功、虚报事务结束或把日志当清单权威。精确端口接线与失效策略待 AMS3-5/ME-8。

## 成对的装载与撤除

| 取得的资源/贡献 | owner 与可用时点 | 部分失败 | 撤除与保留 |
| --- | --- | --- | --- |
| 原迁移、存储租用 | 装配先合成迁移并确认升级；本节点借用 storage | 迁移/配置失败不发布服务；不自行恢复数据库快照 | 文件、连接与升级守卫归 storage/装配；本节点不删清单行 |
| 一个 closure、一个 assemblyManifest 贡献 | 本 fiber；storage 已就绪、配置通过后发布五操作 | 发布中失败沿 fiber 收口；provide 纳管仍待真实宿主核对 | 单个组合 effect 先关闭本实例准入；旧引用后到调用 unavailable，不靠服务消失推断旧调用停止 |
| 每次 ReadTx/WriteTx | storage 拥有，本次调用持有直到事务实际结束 | 一律通过存储的 finally/事务协议释放，无自有连接逃逸 | 已进入事务跑完并据实际结果返回；依赖替换后新实例不接管旧 ReadTx，不重新执行旧 append |
| 可选 presenceSource、显式诊断端口 | 装配拥有；本节点只借用 | 来源与诊断故障分别记录，不拼成成功投影 | 不释放他方资源；重载后不沿用旧实例的在场快照；无后台追尾、计时器或订阅需交接 |

同一 effect 内的本节点动作不依赖多 disposer 次序。关闭准入与实际事务结束分别可观察；应用停止必须按 storage 的既有关闭协议等待实际事务，不以取消信号作为释放完成。进程崩溃后只读没有需要重放的业务动作；追加恢复继续按 S-22，given 可以认回，mint/reuse 没有新造认回键。

## 关键选择与取舍

| 选择 | 落选方最强论证 | 本方弱点 | 置信度 |
| --- | --- | --- | --- |
| 沿用一个插件/fiber、必需 inject storage | 独立读插件可按需求单独装卸，降低读写版本耦合 | 五操作一起重跑；读能力不能单独换代 | 高：同一份清单与生命周期，没有新的独立资源维度；公开纯函数仍可单用 |
| 已接受 SQL 对象上按当前头寻源，不另建 JSONL 或最新投影表 | 日志顺序追尾便于诊断；物化最新值减少查询 | 每次读取需要查询，性能尚无测量；SQL 与模型日志只各自提交 | 高：本次只补读口，不改变 S-12 的共同对象；原始源不可变，缓存收益未证 |
| 一个 ReadTx 固定提交上界，选最近 given/mint | 直接沿头引用能让求值与被收窄表的 basedOn 一致；不变源也允许某些拆读实现 | 读面与旧表 basedOn 可能不同，消费者必须区分；事务占用需测量，不能声称仅拆事务一定错误 | 高：主线裁定并已落 S-33/S-34，旧表 reuse 不能令已提交根设置回退；当前层现算不在本读面 |
| 复用 AE4 S-47 公共纯值判定，再核本节点排列 | 本地专用校验可只检当前消费字段，省去跨包接线 | 依赖公共构件完整实现；纯结果仍无法验证来源和权限，需保留真实生产链证据 | 高：结果只有一个权威；独立公开函数可测试，避免两套形状与元数据规则分叉 |
| 投影只检两个槽位；exact-three 放生产者 | append 时统一强校验能更早拒绝脏内容 | 通用 append 可存读不出的内容，消费者须处理 unavailable | 高：S-32 明确保留通用内容；早拒绝应在 registry S-48 实现，不能侵入旧四操作 |

## 实施缺口与消费者影响

| # | 缺口与条款 | 受阻消费者 / owner | 闭合条件 |
| --- | --- | --- | --- |
| AMS3-1 | 本节点候选尚未接受、源码尚无；精确依赖采用状态见 catalog，旧六场景和新增 S-34/S-35 都未执行 | registry、模型纵线验收装配；主线接受与本节点实现者 | 独立评审、精确采用、实际五操作实现及 ME-1～ME-8/旧义务执行；设计检查不代替 |
| AMS3-2 | S-32 → AE4 S-47 → 公共 judgeEffectiveAssembly 的设计表达已对齐；共享构件实现、制品消费与本节点失败映射未验证 | 本节点；core/asset-evaluation owner | 精确采用状态查 catalog；以公开制品核完整五类 DTO、开放 JSON 槽及全部结果内关系，ME-3/4 验证无损读取和 false 映射，不另起类型权威 |
| AMS3-3 | 真实根正文 → AE4 → registry/v3 生产链未交付（S-32/S-35；registry S-48） | registry 历史读回与模型纵线验收；core/agent-definition、core/asset-evaluation、tools/asset-registry owners | 真提供者生成两份根版本结果、同次追加与 readEvaluation 精确读回，替身不能关闭 |
| AMS3-4 | S-21 调用方/租户核实、同库单属主、迁移与升级确认归装配 | `apps/model-request-acceptance` owner；既有 `apps/cli` 采用仍按旧决定 | 新验收应用在第一次受理前确认升级；核实入口身份，不将内部 SessionRef 面裸露；记录真实重开证据 |
| AMS3-5 | 新读面的真实 Cordis 撤除/资源结束、诊断端口与覆盖故障待验（S-23/S-33；SYS-OBSERVABILITY） | 本节点、storage owner 与 `apps/model-request-acceptance` owner | ME-6/ME-8 真宿主、文件库与诊断失效测试；明确有界配置及实际结束记录 |

原 AMS-1/2/4～10 继续保留。AMS-3 中“读取求值没有定义”的历史读取部分在本候选补齐，须独立采用/实施/验收；runtime S-66 的当前输入由其真实输入提供者承接，本节点不以历史读面关闭该责任；完整拓展链、PF-004、产品在场来源、自动初选和分布式保证均未随之闭合。新验收消费者路径为 `apps/model-request-acceptance`，是 PF-006/PF-017 模型纵线的技术验收装配，不声称产品 CLI 或 Agent Loop 交付。迁移、单属主、升级确认、入口身份、presence 种子及观测接线均归该装配 owner；本节点不增时钟或密钥依赖。独立评审与采用由主线另行完成。
