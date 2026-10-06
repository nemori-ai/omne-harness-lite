# model-request-acceptance 实现设计

revision 2，candidate，未接受；`apps/model-request-acceptance` 尚未建应用。下文应用构件、入口与配置名均为候选，已接受契约的操作名保持原名。本节点是验收消费者与真实提供者的装配，不新增服务能力或改变领域操作的失败集合。本修订回应独立评审 MAA-AR1/AR2，处置内容待独立复核。

## 实现路径、采用边界与应用形状

单机 Node/TypeScript workspace 应用，源码仅在 `apps/model-request-acceptance/src`，场景在所属 `tests`。通过包公开入口组装提供者；没有产品 HTTP 监听器、产品 CLI/TUI、中心连接或通用控制台。机器驱动入口显式接配置和场景选择，输出运行标识、逐场景结果、证据位置与覆盖缺口；发布身份和总体接受由主线负责，应用不能自动宣布 official 支持。

主进程持有 Cordis **4.0.4**（D-025）、共享资源及场景调度器。崩溃场景由外层验收驱动启动、杀死并重开实际子进程，使用同一指定持久目录，监督者不提供假业务事实。正常模型网络唯一出口为选定 pi fork 的生产 `send`，只去 OpenRouter；受控 HTTPS 故障服务器仅用于专门故障场景，不能产出任何模型认证通过行。

采用 D-019 的 pi 0.86.1、commit `3390bd93630965a12a0a1a5c36ce890ec22f7e1d` 定向 fork，来源/许可与十五项比较门归 [pi-ai-transport v3](../../packages/model/pi-ai-transport/v3-design.md)。应用不复制 SSE、家族适配、缓存映射或重试循环。公开独立函数与 Cordis 服务均采用同一批生产构件；前者不因本应用存在而依赖租户、日志或存储。

契约状态查 [catalog](../../../registry/catalog.json)。D-070/D-071 的纯值采用、D-072、D-073 与 D-074 是已知输入；runtime3、runner3 及 transport/目录来源/凭据窄组件的未接受修订只作本稿候选依赖。发布前必须冻结本次全部契约、节点、源码与配置摘要，不借候选文字提前解除实施门。

## 选择与动作链

下表同时是契约责任到装配的投影。提供者内部操作、存储失败和策略继续以所链节点为准；本应用不接管其业务状态机。

| 行／消费的契约责任                                               | 所选提供者与精确采用                                                                                                                                                                                       | 配置、作用域和交接                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1：account-identity3、organization-governance2 S-26/S-63       | 真实 account-registration、account-identity 及 [organization-governance](../../packages/tenancy/organization-governance/v2-design.md)；所需 accepted 依赖逐项锁定                                          | 一个本地据点的真实账号、登录与租户。真实公开操作产生身份；当前资格由 memberships 读取。传 tenant 不构成授权，捕获 standing 不替代当前效力                                                          |
| A-2：存储协议、升级确认、时间                                    | [storage-sql](../../packages/infra/storage-sql/design.md) 的 SQLite 文件库、[clock](../../packages/infra/clock/design.md)，沿 D-026/D-027                                                                  | 同一个 AtomicStorage 实例承接所有需共同提交的 SQL 提供者；合成迁移、只读预检、全 ACTIVE 后 confirm 归 bootstrap。clock 时间戳与可替换等待/截止调度分开配置                                         |
| A-3：session-tenancy2 S-5/S-6/S-8                                | [session-tenancy-table rev2](../../packages/session/session-tenancy-table/v2-design.md)                                                                                                                    | guard 确认后才允许实际 seed；映射持久且不可变。runtime 仍只见 holdingTenant；参加同 unit 的读是公共技术构件，不新增授权服务                                                                        |
| A-4：runtime3 S-66；AE4 PRE-1..PRE-9；AD1 S-1..S-10              | [evaluation-input-store rev1](../../packages/assets/evaluation-input-store/design.md)、core/agent-definition1、core/asset-evaluation4 同一 BodyContracts 闭包                                              | bootstrap 持有真实 publication/capture 技术面，runtime 仅持读闭包。实际版本正文→根选择→提取→完整 evaluate；拒绝 manifest 反建输入、空源或固定设置兜底                                              |
| A-5：manifest3 S-12/S-32..S-35；registry3 S-48                   | [assembly-manifest-store v3](../../packages/assets/assembly-manifest-store/v3-design.md)、[asset-registry v3](../../packages/tools/asset-registry/v3-design.md)                                            | registry 真实求值、明确 compositionOrder，manifest 唯一物理写入者；源记录和目标表同 SQL 提交。当前输入和历史 E 分开；真实根固定配方失配不得修输入                                                  |
| A-6：directory3 S-7/S-19/S-20；custodian2 S-7/S-12..S-15         | [model-profile-directory v3](../../packages/model/model-profile-directory/v3-design.md) 的 P-1/P-1r；[credential-custodian-local 模型窄组件](../../packages/infra/credential-custodian-local/v2-design.md) | 本地可信来源持有真实 sourceRef/body 对；预置 keyFile；同库真实绑定 reader；只装 localCredentialOnly，不 provide 假完整 credentialCustodian。每次发送重新取值，无中心/工厂跨级回退                  |
| A-7：profile3 S-29..S-31；runtime3 S-38/S-53/S-57..S-59/S-64     | [pi-ai-transport v3](../../packages/model/pi-ai-transport/v3-design.md)，公共函数、注册宿主和逐模型贡献                                                                                                    | 精确 implementation/definition/configuration revision 与 route 绑定。配置全部显式；取消到实际 socket/读取终止才交还 lease。模型注册不重跑整个 runtime                                              |
| A-8：runtime3 S-5..S-67                                          | [model-request-runtime v3](../../packages/model/model-request-runtime/v3-design.md) P-2/P-5                                                                                                                | 十三个操作与同一 invokeModel 公共函数；场景驱动承担调用者的模型选择、尝试上下文、回复结算和显式继续，不实现另一套 runtime                                                                          |
| A-9：runner3 S-6/S-14/S-19..S-28/S-32/S-35；LC4 S-1..S-41        | [loop-extension-runner v3](../../packages/agent-loop/loop-extension-runner/v3-design.md)，LC4 公共判定、真实默认重试贡献                                                                                   | 真实历史链、正文与允许集合；失败主体为完整记录。retry 先真实只读守卫、结论耐久，应用显式等待后 dispatchAgain 再复核。默认件身份沿 runtime3 S-67，声明沿 runner3 S-7/S-26 与 LC4，不由 app 补 power |
| A-10：session-log2 S-6..S-19；run-attempt-facts2 S-5..S-9        | [session-log-jsonl](../../packages/session/session-log-jsonl/design.md)、[run-attempt-facts-derived](../../packages/session/run-attempt-facts-derived/design.md)                                           | 真实文件锁、追加、fdatasync、栅栏与读回。验收驱动只按该节点已允许的 runEndRecognizer 认自己实际追加的验收终结条目；两事实仍从同次真实日志读得，不注入布尔事实                                      |
| A-11：runtime3 S-20/S-37/S-51/S-62/S-63/S-66⑨；SYS-OBSERVABILITY | 显式应用拥有的诊断 sink、查询端口、有界观察接收端及独立退化计数                                                                                                                                            | sink 在 runtime fiber 外，权限/保留/限额由运行配置指定；业务锚点归日志。运行时退出后仍可记录资源收口与故障，不能因 sink 坏而改业务结果                                                             |

A-1 的注册精确采用 [composition.account-registration/v2](../../../spec/compositions/account-registration/v2/contract.md)，provider 为 [account-registration](../../packages/tenancy/account-registration/README.md)，以 AI3/OG2 普通独立提交链产生激活事实；同时装真实 [credential-verification](../../packages/tenancy/credential-verification/design.md) scrypt 提供者（兑现 AI3 S-8/S-26），不能让注册或登录走恒真凭据校验。装配显式给身份层凭据政策、保留期与密码派生配置；激活签名私钥交 registration、公钥交 AI，清除签名私钥交 OG、公钥交 AI。复用 identity-values1 的实际密钥/交接凭证实现，启动核两组配对；密钥由本运行指定的持久部署输入供给，重开不自动重生。账号/登录秘密和这些私钥与模型 keyFile 分开保管。AI3 S-27 已规定的 credentialPolicy 缺席为 credential-rejected 仍保留，应用不能把 provider 的领域拒绝改成别的失败；成功场景则必须提供真实合规政策。其余来源配置及授权不因“验收应用”而跳过。

核心数据采用 profile3、messages4、response4、LC4、AD1；其余 CB3、tool-definition3、call-accounts2、arrival-events2 等沿各消费者精确声明。模态投影采用 capability.modality-projection/v2 的公开生产函数，stream-assembly/v3 由 transport/runtime 使用；实际附件字节输入若无所属真实提供者，阻断该模态认证，不拿空字节假装完整支持。LC3 等旧面仍由原消费者显式使用 `/v3`/`schema/v3`，应用不通过升级根依赖强迫旧消费者改语义。

## 具体 bootstrap 与准入门

候选单一入口 `src/bootstrap.ts` 拥有装配流程及一个组合 cleanup；机器入口只调用它。全部路径、策略、预算账本、官方资产清单、root 配方、模型绑定、凭据来源、keyFile、观察与诊断界限必须由显式运行配置提供。非法静态配置、缺预置密钥、迁移不匹配统一启动失败；运行期缺源/失效/依赖故障按各契约具名拒绝。配置文件不成为新增产品配置协议。

1. **只读预检**：固定代码/契约/节点版本，检查所选阶段的接受门、已部署 37 定义清单、实际路径归属、凭据输入隔离、secret scan 规则和账本身份。先估计完整本阶段剩余请求的最坏费用；价格或上限不明时不进入付费发送。扫描产物不输出秘密或来源引用。
2. **构造与装载**：创建应用拥有的观测/调度资源，合成各提供者真实迁移；使用 storage-sql 的 `createUpgradeGuard`、clock 只读回拨预检与迁移序列前缀检查。装入真实身份/治理、日志/tenancy、输入/manifest/registry、目录、transport、runner/runtime 等本阶段必需插件。组件构造可在此发生，但不开放场景、seed、发布或模型发送。目录公共 binding reader 与模型副本组件相互以公共构造参数连接，不伪造 MCP 依赖。
3. **确认升级**：核所有本阶段必需 fiber 为 ACTIVE，且迁移、配置、组件构造就绪，再 `guard.confirm()` 并检查 `snapshotTaken ⇒ snapshotRemoved`。确认失败不开入口，按 storage 协议撤除并报告 `guard.pending()`；未确认前不写声称持久的业务事实。bootstrap 禁止先 seed 再 confirm。所需 provider 为 PENDING/FAILED 即启动失败，不降低必需清单使其“就绪”。
4. **真实身份与 session 映射**：确认后通过真实公开注册/登录/治理操作创建或读取本次本地账号、LoginStateId 与 effective tenant，核账号/据点对应。只有 `apps/model-request-acceptance/src/bootstrap.ts` 和 `apps/model-request-acceptance/tests/**/*.ts`、既有 `apps/cli/tests/**/*.ts` 可 import tenancy `./seed`；结构守卫必须先落地，其他 src、转导出、相对路径/别名绕过均应失败。seed 同租户幂等、异租户抛错、零 UPDATE/DELETE。该内部步骤不是产品会话创建 API。
5. **真实来源发布与捕获**：通过 EIS `./publication` 发布实际资产版本、持有与配值，explicit official manifest 精确匹配本次部署资产。所有必需 scope 行显式存在；确定空和缺源分开。随后 captureSessionRecipe 从真实治理捕获 standing，并用真实 tenancy 核归属。runtime 每次读取仍核当前资格。源创建与 session seed 分两次提交，中间 recipe 缺席答 unavailable；不补跨 owner 原子创建保证。
6. **真实档案与凭据**：由目录真实操作建立 profile/完整 adaptation/历史配置。可信本地来源一次取得 sourceRef/body 对，bindCredential 提交引用，再用同一对调用模型副本组件 storeBoundReplica。组件在共同 unit 锁定读实际绑定行；轮换已发生则 stored:false，不给旧 body 贴新 ref。P-1r 只借用该唯一组件，并从同一 AtomicStorage 真读。预置的普通 32 字节、0600 keyFile 经节点实际校验；禁止初始化时自动换钥、跨账号复用或日志输出 body/key/ref。此途径不声称中心复制或完整 CCL 六操作交付。
7. **真实清单和尝试**：读取实际源→公共 evaluate→registry 写真正求值记录和排列，由 manifest 同次提交内容/表。建立日志实际 run/attempt 壳与调用锚，模型选择通过 runtime 操作留痕。不得把 E 写回源冒充实时读取，或把 manifest 清单序号当日志位置。最后确认选定场景全部前置成立，才开放场景调度与付费门。

已确认后的启动后半段失败不恢复旧数据库快照；已提交账号、映射、源、绑定、清单和费用都是事实。应用保留失败阶段与证据，重启显式读取核对；只有原操作的幂等/认回机制可以重用，不能整段自动重跑。跨多个 owner 的 bootstrap 不声称全成全不成。

## 同一提交、持久边界与并发反例

| 共同对象及存储要求                                                         | 原 owner／精确要求                                  | 本装配必须满足的约束                                                                                                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OG 实际资格事实＋EIS head/recipe/asset/version/scope                       | OG2 S-63；EIS-R1..R6，runtime3 S-66                 | 同一 SQLite AtomicStorage/BEGIN IMMEDIATE；实际 participate 串行 await，assertStorage 拒不同实例。当前资格与源同快照；unit 异常交外层终结后映射，不吞异常继续提交             |
| EIS `evaluation_input_head(store_key)`、版本/层表                          | EIS-R2/R3；AE4 PRE-1、AM3 版本承诺                  | 所有发布者在真实 head/哨兵和目标表相遇；预期修订判重，版本严格无损且只追加；不能用两个进程锁替代                                                                              |
| `session_tenancy` 与 EIS recipe                                            | tenancy2 S-6、EIS-R4                                | 各自真实持久但无共同创建提交；映射不可改支撑随后捕获。若选参与读则绑定同一 unit；不能冒称额外产品创建原子性                                                                   |
| `assembly_manifest_record`、`assembly_manifest_table`、`owned_ref`         | manifest3 R-AMS3-1..4、旧 R-AMS；registry3 S-48     | 同一 SQL 库/约束域；manifest 唯一物理写者，原始 E、排列、目标表同次追加确认后 registry 才发布。旧/新实例冲突在真实行和唯一约束排序                                            |
| `model_credential_binding(tenant)`＋`credential_custodian_replica(tenant)` | directory3 R3-7/R3-8、CCL model-only MCR 要求       | 同一 AtomicStorage；绑定锁定读取与来源校验/副本读写同 unit。引用保留在密文认证上下文；轮换可留旧副本但旧副本不可取值；不得清空来源后仍沿旧匹配结论发送                        |
| 同一本 session JSONL 的提交序列、判重键和 attempt 壳                       | session-log2；runtime3 L-1..L-6；runner3 RL-1..RL-6 | opened/dispatched/intent/ended、runner 结论/提醒、response/AssistantMessage 通过真实追加及 fsync 确认；多个写者共享 ResponseId/MessageId/经过键与栅栏。结算批次按契约一起提交 |
| SQL 派生缓存、manifest 与 JSONL                                            | 各节点原 durability 边界，D-027/SLJ-2               | 不声称跨 SQL/JSONL 原子提交或断电恢复次序；缓存丢失重算，恢复只认各自已确认事实。进程 kill 测试不冒充断电持久证明                                                             |

必须在真实边界排出两组交错：资格撤销在读取前/后，输入只允许相应完整快照；refA 读取或发布与 refB 轮换前/后，绝不允许“先 present=true，再从无来源副本取 A”。另验旧/新 registry 同头竞争、不同会话同 owned_ref、runtime/调用者并发结算同 ResponseId、提醒同 ID 异内容；不能以进程锁、时间戳或单线程测试关闭。

共享/工作区/MCP 来源无实现时整次 unavailable；正常模型配方必须真实声明未挂载/不需要这些来源，不能遇到缺源后改写配方。runner 的工具/卡片/兼容命令分支没有真实提供者就按契约拒绝；本轮只消费模型失败/重试链，不宣称全 Agent Loop 或工具执行。runEndRecognizer 只认验收驱动实际提交、具名区分的终结载荷；没有认法时保留 run-attempt-facts unavailable，不从外部内存宣称运行结束。

## 调用、重试、热更新和观测

场景调用路径分两条：公开 invokeModel 由应用显式供 TransportAdapter/调度/策略并持有精确 lease；服务路径由 P-2 从真实目录、输入、日志取值。两条都经过生产 plan/send/read。业务重试只经 runner 完整失败链、真实 canDispatchAgain、耐久结论、显式等待和 dispatchAgain 再校验；transport、HTTP 库和验收驱动没有隐藏重试。runner3 的既有出厂声明是 rewrite，onError 沿 LC4 的 record；应用必须实际发布/求得这一声明，不能拿“系统默认”绕过允许集合。替换件的 power/配置缺失或非法不补值。

每次调用固定完整 binding。热更新分 register→adopt→retire，旧 runtime/direct lease 仍用旧版直到实际结束；未知/卸载版本不换 latest。目录配置修订按档案保留不可改历史；同 revision、不同档案不能被全局配置缓存混用。旧调用继续旧 binding 只证明在途不换版，不授予新配置或新实现复用旧认证的资格。

### 认证结果的完整匹配边界

机器认证记录先完整保存下面三部分及其来源快照，再派生查询索引。这是验证记录的匹配规则，不新增领域身份、实体或服务：

| 部分                        | 完整保存及相等判据                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 精确档案及配置来源上下文    | 有档案时保存 profile3 S-13 的完整 ModelProfileRef：official 为 `{origin: "official", routeName}`，custom 为 `{origin: "custom", scope, routeName}`，scope 保留判别式及组织/租户完整身份，不补默认。配置来源以该精确档案身份限定；同裸 revision 的 official/custom、不同 scope/tenant 或 route 不混。独立函数确实无档案时，调用者显式提供同等的配置来源作用域/上下文并留其实际来源；本轮 37 official 的 public 测试也保留对应官方 ref 与来源快照，不因函数不读目录而丢上下文 |
| 完整 ModelAdaptationBinding | 采用 profile3 S-29/S-30 的唯一表示，原样保存 `implementation: {name, revision}`、`definition: {modelId, revision}`、`configuration: {revision, values}`。五个字符串逐码点相等，values 以公共严格无损 JSON 判相等：对象成员无序、数组有序、数值精确；缺席不能补 `{}`，不可舍入或投影成少数缓存字段。implementation revision 限于 name、definition revision 限于 modelId、configuration revision 限于上述档案/来源上下文，保留完整命名范围                                    |
| 路由与实际执行证据          | 保存固定请求 provider route 及上游实际 provider 原串，两者分开核对；认证匹配采用本次实际 provider route，实际值缺席/未知就不能继承确定路由的通过记录，不由请求补齐                                                                                                                                                                                                                                                                                                          |

旧证据匹配、复用判定、结果合并与失效传播都使用这份完整上下文、完整 binding 与实际 route。哈希只作索引；摘要相等后仍回读真实全值核对，哈希碰撞、缺来源快照、无法无损解码或任一分量不同均不复用通过结果。完整配置快照保存在受本机 owner 权限保护的认证证据内；它不进入默认诊断正文，也不能含凭据或 sourceRef 等秘密。若秘密扫描拒绝，保持证据不合格，不能删掉字段后把残缺 binding 判同值。

源码/家族公共构件变化使所有受影响完整认证记录失效；窄定义或配置变动至少使相应上下文/binding/route 的记录不能用于新请求，保留旧记录的历史范围。没有完整影响映射时不声明未重验对象仍通过。尤其同 `c1` 下 TTL/断点不同、不同 implementation.name 下同 revision，以及跨 profile/tenant 的同裸 revision 均不得借旧 pass。目录应拒绝同一档案同修订改义；认证匹配器仍要独立拒绝不一致证据，不能假定输入一定先经过目录。A-V13 验证这些反例和哈希冲突。

诊断沿 [SYS-OBSERVABILITY](../../../foundation/observability-and-logging/requirements.md) 与 runtime3 S-63：同一 runId 关联场景、tenant/session/call/dispatch、模型绑定各修订、阶段和原因；request/provider/response 身份只有实际来源，不由请求补响应。默认不记正文、工具参数/结果、推理、凭据、来源引用或其片段。仅使用受控合成内容的原始响应证据也须经过凭据/引用哨兵扫描、权限与大小检查；诊断记录不作恢复账本。慢、抛错、满 sink 和观察者退出均有独立可查询退化计数，不靠已坏 sink 自报；拒收/诊断故障不能制造业务成功、丢费用或提前释放资源。

查询、导出和认证结果输出沿适配提案既有本机 owner 政策：只交经实际本机管理权限核实的运维所有者，普通租户不获得文件或网络读面。bootstrap 固定本次 OS 所有者及受限证据根，检查实际目录/文件归属与 owner-only 权限；目录采用 0700、数据/诊断/导出文件采用 0600，不靠 umask 推断最终 mode。重开及导出前重核，错误 owner、group/other 可访问或无法核实均拒绝相应读写/导出，不静默降权条件。候选本机查询入口每次要求显式 tenant 范围，缺席不能扩成全部；跨租户查询依靠同一已核本机管理权限和显式范围，不由 tenant 参数、当前会话或记录里的 owner 字段授予权限。

导出使用同一调用方权限、tenant 范围和内容裁剪判定，再核目标路径/句柄的固定 owner 与权限；不能借导出绕过查询拒绝，不能往其他所有者或宽权限文件落内容。机器场景结果及证据位置也只经该本机 owner 输出上下文交付，不新增普通租户可用的机器诊断 API；未核实输出目的地时不输出租户诊断或完整配置证据。A-V14 的真实调用方/文件权限负控验证本规则，不仅检查传入 tenant 是否相等。此处落实已采用的本机权限边界，不增新的产品授权政策。

首内容延迟分别量测网络到达、opened 耐久门、可见首内容，另测 SQL 排队/持锁、输入规模与双次纯求值成本。不写未经确认的性能阈值；提交原始计时、分布和可重跑配置，性能主张由验收方据实际数据判断。首内容前取消、opened 写入结果未知、首内容后失联各沿 runtime 原契约，禁止以重试改善测量结果。

## 共享费用账本与发送授权

本轮 USD 100 为已授权整程上限，研究与生产验证使用**同一份现有 ledger**，由显式配置指向、启动核身份，不新建空账本抹掉研究费用。读取本稿时的实际 ledger 为 162 条 settled、USD `1.057233989500000000`；此数只记录起草核对时点，运行永远重新读账，不把它硬写成基数或余额。研究阶段另有配置额度，不成为新增授权。

所有付费物理发送共享同一个独占预留/结算实现，覆盖 public、Cordis、冷暖、故障、恢复验证与显式重试。先按精确十进制价格、已限制的输入/输出/缓存及适用费用组成计算保守上界，在排他账本临界区同时核 settled＋全部 outstanding reservation 不超过上限，确认预留后才 send。唯一预留关联一次物理发送及 generation/调用证据；结算按实际费用只一次。没有请求发生的拒绝可据证据撤销预留，不能由等待超时或 abort 信号推断免费。

实际 usage/generation 对账未得、定价/计费上界未知、重启后未决预留、原账本损坏或无法取得唯一写权时，停止新的付费 send，保留 unknown 与预留并报告；不估零、不重复结算、不另开 ledger。整个阶段的最坏费用先投影，余量不足就保留未认证行并继续离线验证，不能降弱断言或擅自扩预算。generation 查询和计费事实的未知也不能被“研究暖读成功”覆盖。账本是本次开发费用保护器，不宣称已实现产品预算契约；现有研究 helper 的持久/并发/故障行为必须通过 A-V10 后复用，不复制一套只在应用生效的保护。

## 成对装载与撤除

不能依赖 Cordis 多个 disposer 的运行顺序。应用拥有的组合 cleanup 显式顺序 await 各资源阶段；各提供者只释放自己取得的资源，不关闭借来的 storage/clock。若现有公共组件缺 drain/close 证据，先补其提供者实现义务，本应用不把一个取消 Promise 当成真实停止。

| 资源／贡献                                                | 唯一 owner、可用时点                           | 部分失败                                 | 撤除与仍为真                                                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 场景入口、付费门、bootstrap 发布权                        | 应用；bootstrap 第 7 步完成后                  | 不放行半就绪环境                         | 先关闭新场景/发送/发布准入；任何已发送费用和已提交事实保留                                                                               |
| 真实独立调用句柄、观察端口、运行宿主、精确模型 lease      | 各调用的应用协调器；runtime 内部资源归 P-2     | 登记所有已开始 Promise，失败仍收结果     | 按场景明确 cancel 或等待；等 socket、读取、回调、outcome/结算实际收口才 release，remaining_active 如实报告。旧版本回收不能删除新版本贡献 |
| runner/P-5/runtime 及 transport 贡献                      | 各 provider fiber，应用持有装卸句柄            | 已登记部分由本实例撤除，不重跑调用补偿   | 先停新业务并处理在途/迟到，随后撤注册；transport 池在所有实际 lease/work 结束后关闭，不以其他 fiber 已撤推断空闲                         |
| EIS、registry、manifest、目录 P-1/P-1r、真实身份/治理闭包 | 各 provider；应用借用服务                      | 不把已确认写恢复为旧快照                 | 应用停新读写并 await 实际事务；P-1r 不关闭借来的 model-only 组件；当前授权失效仍按真实失败                                               |
| model-only custodian 与 keyFile                           | 应用唯一构造并拥有组件；keyFile 为持久部署输入 | 构造失败关本次句柄，不删钥/密文          | runtime/P-1r/bootstrap 取值与发布及外层 atomic 均实际结束后调用 close；keyFile 与副本保留                                                |
| sessionLog 文件锁/句柄                                    | session-log provider                           | 未确认尾由原恢复协议处理                 | 调用/回复/结论排空后关日志并释放属主；不删除历史或账本。不确认尾不作成功                                                                 |
| SQLite、升级 guard、clock/调度                            | storage/clock provider；应用持有总生命周期     | confirm 前失败沿升级恢复；pending 报位置 | 所有读写者、组件和 unit 实际结束后关 storage，最后收 clock/调度；confirm 后不回滚整个应用事实                                            |
| 诊断 sink、独立退化计数与证据输出                         | 应用根 owner，先开后关                         | 已失败时仍输出最小安全结果，不泄秘密     | 资源收口和账本状态记录完成后有界 flush/close；残留/未知不写成“清理成功”，证据保留                                                        |

进程崩溃后无 cleanup 成功声明。重开先取真实属主/升级门、读账本与日志，调用 runtime reconcile 及 runner 重放；reconcile 不发 HTTP、不重新加载旧版来“补发”。需要显式继续的场景重新准入；无旧版、当前输入失效、凭据已轮换等按原失败值保留旧事实。

Cordis 依据为 [`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md)、[`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md)、[`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)，各有 probe；不由此推出本组合已通过。provide 纳管等各节点仍标待核对的主张继续待核对，由真宿主测试关闭。

## 关键选择与取舍

| 选择                                                        | 落选方最强论证                                   | 本方弱点／复查信号                                             | 置信度                                            |
| ----------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------- |
| 独立开发验收应用，复用真实 provider                         | 接 CLI/全 Loop 更接近最终使用面                  | 需显式实现合法的模型调用者动作，不能把本程通过冒作最终产品通过 | 高：本轮已明确纵线边界                            |
| 一个受管 bootstrap 与顺序 cleanup，多 provider 仍各有 fiber | 交 Cordis 自动依赖卸载最省胶水                   | 应用需跟踪实际调用/事务，真实 drain 接口缺失会阻断关闭验收     | 高：已知 disposer 不按注册顺序串行                |
| SQL 同实例、JSONL 保留各自提交边界                          | 所有事实统一 SQL 可简化跨存储恢复                | 本方案需显式故障恢复，不能给跨介质原子/断电保证                | 高：沿已接受提供者，不在装配改存储契约            |
| model-only 真组件＋预置钥，真实目录 sourceRef 锁读          | 完整 CCL 便于复用统一入口；fake MCP 可先跑通依赖 | 多一步本地来源部署，完整 OAuth/复制能力仍缺；窄组合需独立通过  | 高：不隐藏依赖缺席，也不允许旧 body 贴新 ref      |
| 37 精确模型分别认证，公共家族实现复用                       | 每族代表便宜且能覆盖大量公共代码                 | 实测成本与时长增加；预算不够会留下明确未认证行                 | 高：模型/路由实际行为可能不同，用户明确逐模型提供 |
| 全程一个排他精确 ledger                                     | 每场景独立预算更易并行                           | 预留/unknown 阻塞吞吐，需实际故障测试其持久语义                | 高：独立账本不能保证共享上限                      |

认证索引的新增选择保持 profile3 的既有值语义：

| 选择                                                  | 落选方最强论证                         | 本方弱点／复查信号                                 | 置信度                                                           |
| ----------------------------------------------------- | -------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| 先留完整上下文/binding/实际路由，再以哈希查找并核全值 | 裸修订组合或仅哈希比较更短、读取成本低 | 证据更大，匹配需无损读回；没有全值不能复用通过记录 | 高：S-13/S-29 明定各身份范围及完整值相等，MAA-AR1 给出可失败反例 |

## 实施缺口与归装配事项

| 缺口 | 条款及受阻消费者                                                                      | owner 与关闭条件                                                                                                           |
| ---- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A-G1 | runtime3 S-1..S-67、runner3 S-35；当前仍 candidate；本节点未接受                      | 主线/spec/provider owners；独立评审、精确采用、runner3 正配置及七项负控证据后才解除对应实施/验收门                         |
| A-G2 | directory3 S-20、custodian2 S-12..S-15；sourceRef 新投影未采用/未实现                 | 目录/CCL owner 与主线；共同绑定行、可信 pair、真实 keyFile、restricted imports 通过后才能认证租户凭据发送                  |
| A-G3 | runtime3 S-66、manifest3 S-35、registry3 S-48                                         | 读取 provider/app owner；真实源发布、捕获、求值与存储组合尚无证据；A-V2/3/4 关闭，缺来源分支继续 unavailable               |
| A-G4 | runtime3 S-53/S-61/S-64、runner3 S-32、session-log2 S-13                              | provider/app owner；真实关闭/lease/socket/atomic/持久失败测试；现有公开 close/drain 不足需该 owner 补投影，不靠 app 假等待 |
| A-G5 | runtime3 S-38、response4 S-37/S-38、D-019                                             | transport/主线及独立验收者；37 生产路径全 G 门、账本与 secret scan，研究缓存读不关闭                                       |
| A-G6 | runtime3 S-63、CCL 来源保密、SYS-OBSERVABILITY                                        | app owner；明确 sink/查询权限、限额/保留与安全证据位置，真实失效演练；无参数就拒启对应观测场景                             |
| A-G7 | run-attempt-facts2 G-3；runner3 工具/卡片/外部命令分支；当前输入 shared/workspace/MCP | 对应未来能力 owner；本程不关闭完整产品来源/运行生命周期。验收认法只在真实日志上使用，缺依赖不伪造                          |

迁移、guard、真实入口身份、源写入权限、显式官方清单、时钟/调度、凭据 pair 与钥、模型发布/退役、观察与诊断、唯一 ledger、机器证据和停止协调全部点名归本装配。策略取值由已接受语义与本次显式配置给出；缺失时报告 owner，不在胶水中新设权限、出厂默认或回退。
