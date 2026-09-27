# 模型请求适配的增量设计

## 输入与性质

用户确认：八家 37 个模型逐个调优，公共实现加窄适配；SystemReminderMessage 对 OpenAI 用 developer，其他采用语义适合且可通过所选路由传输的专用类型，否则 user；缓存按路由设计、TTL 可配置并取得真实命中证据。未来组织/租户复用策略，公开函数可脱离 runtime 使用。全链路诊断依 [SYS-OBSERVABILITY](../../../foundation/observability-and-logging/requirements.md)。

| 观察者与触发 | 必须成立的结果 | 责任 |
|---|---|---|
| 调用者打开模型调用 | 参数、提醒、推理和缓存规则能追到确切模型、路由和版本 | 目录提供合法档案；运行时绑定；传输实现映射 |
| 管理者更新某档案的适配 | 成功采用新绑定后打开的调用采用该版本，旧调用仍使用旧绑定；自建档案不自动跟随 official 更新 | 目录、注册提供者与运行时 |
| 管理者撤除旧实现 | 不再准入，已有调用释放后资源才收口；强制中断显式可见 | 注册提供者；宿主；运行时 |
| 租户引用自建档案 | 范围、凭据与费用仍按现有契约判，不因复用代码改变 | 目录、凭据与运行时 |
| 首内容到达或停机恢复 | 锚点先耐久；恢复读取事实，不自行重发 | 运行时与共同会话日志 |
| 工程诊断者查询 | 生命周期、实际执行方、缓存、费用及未知项可关联，秘密和默认正文不暴露 | 公共执行路径与受治理的读面 |

上述进展均以前提成立为限：上游可达、记录提供者可用、调用者释放或取消在途操作。没有不依赖环境的“必定完成”承诺。

## 前身与剩余责任

延伸现有 model-request-runtime 服务和公开函数、pi-ai-transport 提供者，不另立一个 LLM 领域对象。新词 [模型适配绑定](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-adaptation-binding--模型适配绑定--model-adaptation-binding) 是调用/档案的属性，不具备独立领域身份。

| 现有精确承载者 | 本次变化 | 未覆盖或必须补齐 |
|---|---|---|
| `data.model-profile/v2` | v3 增加绑定属性及快照携带 | implementation、definition、configuration 精确版本与值 |
| `data.messages/v3` | v4 在已出门记录保留绑定并保留 core 修正 | 已出门记录不能仅靠诊断恢复版本 |
| `data.model-response/v3` | 新版本保留绑定与缓存诊断事实 | 既有精准计费保持；缓存读/写缺席与零区分 |
| `capability.model-request-runtime/v2` | 新版本写公开函数、宿主/观察者、版本引用、队列超时 | 已有 13 操作不删；服务面持久性不强加给函数面 |
| `capability.assembly-manifest/v2` | 独立装配使用的求值内容读取需补新版本 | 层锁、两个时限、默认重试链的生产者和读取约定 |
| `capability.model-profile-directory/v2`、`credential-custodian/v2` | 目录 v3 采用 profile v3；独立单机读面明确真实提供者与授权输入 | 不称目录 v2 已返回 adaptation；不以 serveBaseFaces 虚构中心凭据或据点协议 |
| `capability.asset-registry/v2` | 采用真实 lookup 与 report 快照 | 直接传工具定义仅验证函数面，不替代服务面 |

## 绑定与配置的精确取舍

绑定包含 implementation{name, revision}、definition{modelId, revision}、configuration{revision, values}。implementation 版本包含公共/家族规则，definition 对应一个模型窄定义；配置 values 保留精确 JSON 值。版本标记在其名称域内解释，配置 revision 在档案身份内解释，不能跨档案仅凭同名 revision 取值。

档案新版本显式给出绑定；自建档案明确引用已注册实现和窄定义，不靠模型名猜策略。打开调用时校验所引用的精确版本与配置，并取得引用；同一调用各次发出不重选策略。已出门记录和响应保留完整绑定。进程重启后缺少旧实现时，事实仍可对账；再次发出如实不可用，不代换成新版本。

缓存方式、TTL、断点布局和上游支持值来自配置及模型窄定义，缺少必需显式配置即拒绝规划。参数和配置错误在出网前拒绝或按接受条款记调整/丢项。请求参数与策略配置分开，策略元数据不透传为 arbitrary extra。保留禁止发送 user/session_id/x-session-id/prompt_cache_key 的身份规则。

当前先采用已接受的 chat-completions 路径；比较门失败时回到原选择，不自动切换协议。推理努力度仅采用模型宣告支持且统一词表可表达的值；xhigh 等新值不偷偷塞入原五档。需要拓展统一参数时另演进其语义拥有者。

## Cordis 投影与生命周期

公共传输提供一个稳定 modelTransport 服务及可独立使用的函数。版本注册和引用管理位于提供者内部，模型插件只登记贡献，不为每个模型新建连接池或服务。代码贡献由可信装配加载；组织/租户的声明式数据仍由目录治理，isolate 不作为安全沙箱。

注册表针对同一精确 implementation/definition 版本只接受一份不可变实现；重复不同内容拒绝。更新由三个独立动作构成：先注册新版本；目录分别 updateProfile/loadManifest 采用新绑定并在自己的耐久提交点确认；最后显式停止旧版本准入。不存在跨注册表与目录的原子提交。注册失败不改档案；目录提交失败保留旧档案；若先撤旧，仍引用旧版的档案打开调用时如实 unavailable。组织/租户自建档案保留其显式旧绑定，不能由 official 发布动作自动改写。

注册表判定点只排序取得引用与撤除准入：先取得者可继续，撤除后取得者被拒。不可用版本不能静默回退。撤旧是可信发布者的显式操作，须先检查受影响档案、报告仍有旧引用并采用分阶段更新；本批不自动清理仍被自建档案引用的版本。检查不承诺跨 owner 原子撤旧，新调用竞争由 acquire 判定收口。

正常撤除先停止新准入，等待引用数归零，再释放资源；等待可配置且有界。超时报告仍有在途调用，不假称已卸载。强制撤除先触发每个在途调用的取消，再等待实际停止/结算；异常有记录。单个 effect 组合上述收口顺序，不依赖 Cordis 多个 disposer 的并发执行次序。

这里只承诺策略贡献的版本更新。modelTransport 自身被替换仍按原必需 inject 关系撤除 runtime；不把整个服务的重载叫作无中断热更新。

## 公开函数与服务面

invokeModel 接受已解析消息、工具定义、档案快照、参数、具体传输与取消信号，返回 outcome、snapshot 和 abort。outcome 是未结算的函数结果投影，包含块、用量/费用、收场和上游执行事实；不含本系统会话、租户、凭据归属或回复处置，不直接构造完整 ModelResponse/AssistantMessage。runtime 与 consumer 补齐各自拥有的身份与结算事实。单次调用只做一次 send，不自动重试或恢复。不读会话/租户/存储，不拥有服务面准入和耐久性。可注入 beforeFirstContent，必须等待它成功后才能暴露首内容；失败停止读取并交可辨认失败，不能露出未获许可内容。

静态独立函数的传输资源由调用者持有至 outcome 收口。动态提供者公开 acquire(binding)，返回确切版本的引用与 release；直接使用 invokeModel 或分开的 plan/send/read 时，其外包装必须先 acquire，并在全部读取/停止后 finally release。运行时在 openCall 取得引用并于 releaseCall/撤除后释放。直接消费者不得绕过动态引用计数；强制撤除必须能够取消这些消费者并等待实际停止。

runtime 仍承担 legalTargets、displayList、effectiveModel、selectModel、openCall、dispatch、dispatchAgain、interrupt、releaseCall、reconcile、readAttempts、settleReply、canDispatchAgain。凭据逐次取；attempt 栅栏与 ResponseId 判重由共同会话日志提交点判。回复与响应体由 consumer 一次 append，不建立日志与 SQL 的跨存储事务。

本地排队尚未触达上游时，首内容时限中止属于本地事实，不归 upstream_unavailable；实际触达后的超时才按上游时限分类。采用正式条款后才修改原实现映射。

宿主交 effect 登记、取消信号和停止中读面。观察者输出显式携带会话/目标身份并验证归属；不靠全局 emit 过滤数据。缓冲有界，缓冲耗尽作为观察交付失败记录，不丢弃业务结算。消费失败与诊断 sink 失败分别处理。

## 可观测性

公共执行路径记录准入、绑定、规划、凭据读取、出门、首内容、流结束、结算、中断、恢复、注册与撤除。关联包括租户/会话/Run/attempt/call/dispatch 的适用身份和 profile/implementation/definition/configuration 版本；独立函数只带调用者明确给出的工程关联，不创建假会话。

请求供应商与实际供应商分别表达；缓存 read/write 计数缺席为 unknown，零是已知零；费用沿既有精准金额与来源。指标不以会话、call、原文作为高基数标签。默认诊断只记录类别、阶段、计数与版本，不记录 credential、消息正文、工具参数或模型推理。敏感调试另受显式配置与权限约束，不由本批默认启用。

sink、缓冲、导出和保留策略可配置/替换；采集异常、丢弃、延迟可见。诊断失败不修改业务结局，必要耐久锚点失败按原契约阻止相关可见动作。外部追踪后端不成为恢复真相源。

本批独立装配由装配方持有本机结构化诊断 JSONL 文件、查询/导出工具和有界指标读面；不随 runtime fiber 销毁。目录/文件限定本机运维所有者权限，查询必须显式声明租户范围，运维主体的跨租户读取来自本机管理权限，不把 tenant 身份当授权凭证。普通租户不获得该本机文件或网络读面；未来租户诊断 API 另定义读取授权。本机降级状态与有界 stderr 摘要报告 sink 不可用、丢弃计数和覆盖缺口，不回录正文/凭据。留存策略配置化，运行证据按设计链长期保存。

## 独立装配与证明门

验收应用使用真实 storage/clock、sessionLog、holdingTenant、modelCatalogRead、credentialLookup、assetRegistry 与所需求值读面。显式创建测试会话归属、发布工具定义、选模和配置，不用 fixture 造尚未定义的产品事实。默认重试只接明确采用的内建路径，未触发的执行环境解析与 needs 分支不宣称覆盖。

装配迁移遵循全部 fiber ACTIVE 后 guard.confirm，再开始受理；确认前失败撤除。MRR-N7/SLJ V-13 首内容耐久写延迟必须测量，不先猜性能 SLA。

| 证据 | 失败阻断 |
|---|---|
| 固定路由、无隐藏重试、流/推理重放、费用/身份比较门 | 生产传输采用及受影响模型认证 |
| 版本引用、撤除准入、强制停止的有限行为模型及否定配置 | 对应热更新机制接受 |
| Cordis 4.0.4 effect 提前注销与在途引用小验证 | effect 方案；不成立则子作用域方案待重验 |
| 三条真并发、崩溃恢复、一次 append 回复与响应体 | runtime 实现及真实装配验收 |
| 37 个模型在生产实现路径的缓存/参数/工具真实验收 | official 37 模型完整交付 |

## 仍须关闭的候选缺口

P-1：新增绑定 Schema 及消费者版本对齐；P-2：函数/宿主/观察者契约；P-3：版本引用模型与真实 Cordis 验证；P-4：独立求值/凭据读面生产者；P-5：生产代码与最终 37 模型验收。当前探针是研究原型，不消费新规格也不解除这些门。
