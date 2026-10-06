# pi-ai-transport：精确模型适配增量

本页为 **candidate，未接受**；2026-09-27 rev 1。保留 [已接受 v2 设计](design.md)，不原地改变其采用范围。本文中的插件、服务、操作、配置及源码组织名均为**候选**，`packages/model/pi-ai-transport` **尚未建包**。本文不是新的传输契约，契约的九件事仍由各规范正文拥有。

## 输入与采用边界

增量依据为 [model-request-adaptation 提案 rev 2](../../../../record/proposals/model-request-adaptation/design.md)，产品依据沿 `capability.model-request-runtime/v3` 记载的 PF-013 rev 13、PF-009 rev 8、PF-012 rev 15；37 个模型、专用提醒角色、可配置缓存及公共实现加窄适配来自提案记录的本轮用户要求，不追认为旧产品 rev 的已接受条款。全局开放函数与观测边界分别沿 [SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)、[SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md#sys-observability全链路可观测与日志完备)。

| 精确坐标（baseline 均为 `omne-harness-lite-design-2026-09-15`） | 状态与本节点消费范围 |
| --- | --- |
| [`capability.model-request-runtime/v3`](../../../../spec/capabilities/model-request-runtime/v3/contract.md) | candidate；S-18、S-20、S-38、S-51、S-53、S-57～S-59、S-63、S-64；S-54～S-56 为函数消费者的交接边界。catalog 登记及最终采用由主线完成，尚不据候选开生产包 |
| [`data.model-profile/v3`](../../../../spec/data/model-profile/v3/contract.md) | catalog candidate；S-2、S-5、S-15～S-21、S-27、S-29～S-31，精确绑定和配置的唯一值定义 |
| [`data.messages/v4`](../../../../spec/data/messages/v4/contract.md) | catalog candidate；消息输入及 S-35、S-36；S-49 的耐久绑定由 runtime 写，本节点只保证规划与实际字节一致 |
| [`data.model-response/v4`](../../../../spec/data/model-response/v4/contract.md) | catalog candidate；S-9、S-11、S-15、S-19、S-21、S-24、S-36～S-38；传输只交事实，不构造完整响应体 |
| [`data.content-blocks/v3`](../../../../spec/data/content-blocks/v3/contract.md)、[`data.tool-definition/v3`](../../../../spec/data/tool-definition/v3/contract.md)、[`data.loop-extension/v3`](../../../../spec/data/loop-extension/v3/contract.md) | catalog accepted、已冻结；块/无损 JSON、模型面工具条目、故障成因类型。采用本轮 core 修订，不回退 v2 |
| [`data.arrival-events/v2`](../../../../spec/data/arrival-events/v2/contract.md)、[`data.call-accounts/v2`](../../../../spec/data/call-accounts/v2/contract.md) | catalog accepted、已冻结；增量和 token/精确金额的唯一表示 |
| [`capability.stream-assembly/v3`](../../../../spec/capabilities/stream-assembly/v3/contract.md) | catalog accepted、已冻结；作为 T-12/T-14 的真实消费者，不在传输里复制装配器或中间解析工具参数 |

本节点不拥有选模、档案层覆盖、凭据保管、会话准入、锚点、响应体结算或重试。组织/租户档案仍由目录按租户 > 组织 > official 规则治理；声明式档案可引用可信装配已注册的策略，不接收任意租户代码，不以 Cordis isolate 冒充权限边界或沙箱。

## 实现路径与来源

继续 [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md) 与 [D-063 R-5](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) 的定向 fork：pi-ai **0.86.1**，提交 `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`；保留 [原 fork 边界、MIT 许可与来源追踪](design.md#fork-边界)。只迁入已选片段，移植后是本项目维护的实现；不引入 pi 的模型目录、环境凭据、SDK 重试或第二套消息类型。DSH 与 omne-next 作为比较读数，不由“参考过”推出采用其 API、缓存默认值或生命周期政策；新的复用选择须另有精确来源与比较结果。

HTTP 继续 `node:https` 单次直发，产品端点固定 OpenRouter chat-completions。计划、发送和读流分别可公开取用；公共请求构造、严格 SSE 读取、无损 JSON、错误事实、费用/用量及诊断只实现一次。无需 LLM 抽象基类；状态只放在连接池、流读取器和版本引用容器，模型定义与家族规则用普通不可变数据及函数组合。

采用 `@deepseek-ai/cordis` **4.0.4**，依据 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md)。上游承载只引用如下已登记机制，不从本节点推导新的内核保证：

| basis id 或待核对主张 | 本节点使用方式与界限 |
| --- | --- |
| [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) | P-2 必需 inject 稳定 `modelTransport`；注册表内部增加版本不更换该服务的 fiber。整个传输服务替换仍会重跑 P-2，不承诺无中断 |
| [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md) | 模型贡献插件需要稳定传输服务才能登记，使用必需 inject；不以所谓 optional inject 假装注册成功 |
| [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) | 每项贡献用单个组合 effect 完成停止准入、等引用、释放资源，不能依赖多个 disposer 的调用顺序 |
| [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md) | 基础配置/声明非法使启动失败、贡献不发布；同批配置政策保持一致 |
| [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md) | 租户定制只是目录中的数据，本节点不按租户建代码实例或池 |
| [`emit-listener-throw-propagates`](../../../../basis/cordis/emit-listener-throw-propagates.md) | 不用全局 `emit` 作为业务观察或诊断隔离手段，输出走显式有界端口 |
| `ctx.effect` 提前解除登记、`ctx.provide` 纳管、Node 请求取消及 socket 实际停止 | 前两项没有对应 basis 条目：**待核对主张**，有限原型只支持其已跑路径；Node 行为是**假设，须按 source-check 取证**。真实 socket、替换宿主及晚到回调的验收仍开着，不由 dispose 回调被调用推成停止已完成 |

上述 basis 条目均有 probe；具体当前运行范围从各条目与 [kernel-basis](../../../../../../packages/core/kernel-basis/verification/README.md) 读。新增 effect 使用方式已有 [有限原型与失败修正](../../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md#连续调用补验)，不是生产实现证据。OpenRouter 路由行为、缓存 TTL 与角色语义由最终真实比较门核对，目录元数据不作为充分证据。

## 契约责任到兑现点

| 契约责任 | 插件、服务或公开操作（候选） | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| runtime/v3 S-38 十一义务；S-57～S-59 | `planRequest`、`sendRequest`、`readStream`、`createPiAiTransport`；稳定服务 `modelTransport` | pi 0.86.1 定向 fork + Node HTTP；尚未建包 | 原 T-1～T-20、SC-1～SC-3 全部保留；本轮变化逐项见 verification。G 比较门未完成 |
| profile/v3 S-29～S-31；runtime/v3 S-53、S-64 | 注册、取得、撤旧的 `registerAdaptation` / `acquire` / `retire`；精确版本引用 | 同一提供者的内部注册表与公开动态包装；尚未建包 | 取得/停准入排序、不可变绑定、实际停止后释放；有限 Adaptation 模型有负控，生产并发测试 PAT-V3-2 待做 |
| runtime/v3 S-57；messages/v4 S-35、S-36 | 家族规则 + 模型窄定义，在 `planRequest` 决定角色、参数、缓存 | 一个公共实现，八家定义集、37 个明确模型；不解析路由前缀选择规则 | 未知实现/定义或配置不能解释时出网前拒绝；PAT-V3-1、T-10、T-17 与逐模型 G 门 |
| runtime/v3 S-54 ④、S-57 ④；messages/v4 S-49；response/v4 S-11、S-36 | `planned` 持有完整绑定、已定实际参数与内部只读序列化结果；send 只消费该计划 | 使用 core 严格无损值；不再读取当前目录/注册表选策略 | T-10 与 PAT-V3-3 比较实际请求体、计划及锚点；耐久写是 runtime 的责任 |
| arrival-events/v2 S-7～S-9、S-11、S-13、S-15、S-20；content-blocks/v3 S-9、S-14 | 单流读取器；显式事件目标；不透明推理数据保真 | 复用已接受 core 数据与 stream-assembly/v3 作为真实测试接收者 | T-3、T-11～T-16、T-19；工具参数不做中间 JSON 解析；未知/断流不伪造封口 |
| response/v4 S-9、S-37、S-38；call-accounts/v2 S-4～S-8 | `readStream` 交实际 provider/model/id、usage 与精确 cost | 缓存只读 `usage.cache_read_tokens` / `cache_write_tokens`，没有镜像 `cache` 对象 | T-8、T-15、T-18 与 PAT-V3-4；实际供应商不由请求值代填，零与未知保真 |
| runtime/v3 S-18、S-58；S-20、S-63 | send/read 的来源事实；统一诊断输出与脱敏 | 无第二套状态码业务分类；不把观测失败写成业务终态 | 排队、触达、取消请求与实际停止分开；PAT-V3-5、T-5、T-19 |
| runtime/v3 S-53 ⑤⑥、S-56、S-61、S-64 | 引用取消信号、单 effect 撤除、调用者解除登记 | 真实 Cordis 4.0.4；直接调用者和 runtime 均纳入引用 | 原型只模拟调用者停止；PAT-V3-2/6 需真实读流、socket、宿主交错 |

## 公开函数、家族与模型定义

包入口 `.` 保留四个公开函数；插件子入口 `./plugin` 另依赖 Cordis。`TransportAdapter` 类型仍由 runtime 的公开面拥有，本节点只做类型依赖，不在运行时 import runtime 形成循环。候选 `createModelPlugin(definition)` 是供可信装配使用的贡献工厂，不是租户上传代码接口。它不提供同名 `modelTransport`，不拥有新连接池。

| 层 | 输入与职责 | 可替换的边界 |
| --- | --- | --- |
| 公共构件 | 消息/工具的公共投影、请求保护字段、严格 SSE、错误来源、token/cost、诊断 | 可独立 import；不开目录/会话，不读环境；HTTP 只从 send 离开进程 |
| 家族实现 | 明确登记的 implementation 名与 revision，组合提醒、推理重放、参数与缓存规划规则 | 与公共构件一并纳入 implementation revision；不得用同一 revision 偷换公共解析器或家族行为 |
| 模型窄定义 | definition.modelId/revision；该模型支持的统一参数值、模态、角色与路由缓存能力、配置校验 | 精确 modelId 等于档案 routeName；只登记确认的模型，目录新增条目不自动变成 official |
| 配置值 | 完整 `configuration.revision/values`，TTL、缓存方式与断点布局等由已登记定义解释 | 每次从 binding 的完整值取，不按 revision 字符串跨档案找值；配置历史判重归目录，注册表不复制一份 |

工厂/manifest 以精确名字列出 OpenAI 12、Anthropic 4、DeepSeek 2、Google 2、xAI 2、Qwen 8、Moonshot 2、Zai 5，共 37 个。名字及本轮路由样本见 [逐模型读数](../../../../record/evidence/2026-09-27-probe-model-request-runtime/model-evidence-summary.json)；生产 manifest 尚未产生。验收对用户确认的交付清单检查无遗漏、无自动扩容，且每项均能解析到确切 implementation/definition/configuration。不能把研究脚本可调用或 OpenRouter 目录可见当成 official 提供。

家族共用以下规划规则，例外留在窄定义；“自动候选”有本次无控制字段的暖读支持，“显式候选”只表示已发送控制并出现暖读，不声称字段或 TTL 已被采纳。下表为后续生产验收的候选输入，不把探针升格为正式认证。

| 家族与模型数 | 共同提醒规则 | 缓存规划候选与窄定义的必要差别 |
| --- | --- | --- |
| OpenAI 12 | developer | 本次 openai 路由有自动暖读，自动模式不发 cache_control；各代/档的 reasoning 与输出上限须逐定义验证 |
| Anthropic 4 | 当前已试 user；新专用类型须先核所选路由与语义再升 revision | anthropic 路由显式断点候选，TTL 必须配置；Opus/Sonnet/Fable 独立验证推理 replay、工具及断点布局，短答复通过不能替代 |
| DeepSeek 2 | 同上 user 分支 | 本次 deepinfra/fp8 自动暖读；原生路由账号规则拒绝是独立失败，不能自动切换或从 DeepInfra 推原生已验 |
| Google 2 | 同上 user 分支 | google-ai-studio 自动候选；每代工具/推理及输入模态逐模型声明，不让目录自动增大承载范围 |
| xAI 2 | 同上 user 分支 | xai 自动候选；各代 reasoning 支持值与 replay 独立验证，缺席不自动填 none |
| Qwen 8 | 同上 user 分支 | alibaba 路由：3.8-flash、3.7-flash 有自动暖读，其余六项显式候选；必须由窄定义决定，不能用全家统一缓存模式 |
| Moonshot 2 | 同上 user 分支 | K3 的 moonshotai/mxfp4 与 K2.7-code 的 moonshotai/int4 各有自动暖读；保留两个指定 endpoint 及不同工具/推理约束 |
| Zai 5 | 同上 user 分支 | 四项 z-ai/fp8 自动候选；5.3-prime 是 alibaba 显式候选。Prime 不能继承原生缓存方式或实际 provider 对照 |

指定 provider 标识与上游实报名称可能不在同一命名空间。窄定义保存有来源的路由对应规则以做事实核对；不能直接把字符串不等当错配，也不能猜别名。无法核实时保留两原值并报告对应关系未知；正式证明已错配时交协议来源，最终首内容前/后分类由 runtime 依 S-18 承担。T-8 和真实 G 门覆盖已知匹配、已知错配、未报告及对应关系未知四支。

提醒投影是计划的一部分：OpenAI 的 SystemReminderMessage 用 `developer`；其他定义只有在所选 OpenRouter 路由确认接受且语义适合时才登记专用类型，否则用 `user`，保留提醒标识。不能默默落为 `system`，不能从 `openai/` 等字符串前缀猜映射。其他消息、工具结果、参数原文与推理 opaque 沿原数据契约；CompactionMessage 保留原 S-35 的单独映射义务，不因提醒规则改变而混成同一种。

缓存按**模型定义与指定供应商路由**选策略；同一家模型走不同路由时可采用不同窄规则。自动缓存不凭空发手工断点；显式缓存由 binding 配置给 TTL、断点布局与所需字段，经定义的允许值校验后发出，不把 `short` 暗译成固定 5 分钟，不从环境或族默认补 TTL。原 `routeWireHints` 和 `promptCacheRetention` 不与本轮 binding 同时拥有裁决权；本候选采用 binding 后移除这两处决策源。旧已接受设计的初值只属于 v2，不自动继承。

plan 返回配置已采用的事实；read 只有在上游实报 cache read > 0 时才能报告该次已命中。自动/显式模式都需冷暖对照；写入量大于零、价格、请求含 cache_control、一次暖读都不证明 TTL 到期或稳定命中率。真实路由不支持所需能力时，不能偷偷换家；该模型/路由的认证保持未通过，留反例交回主线。

## 动态登记、取得与撤除

稳定传输插件拥有注册表及共享连接池；每个可信模型贡献插件拥有自己的不可变版本贡献与清理责任。贡献插件可复用同一家族函数，不要求每个模型一份代码或一个服务。声明先完整校验，尚未就绪的版本不对 acquire 可见；发布方身份由可信装配保证，不把插件名当授权。

`registerAdaptation` 校验实现/定义的精确键、不可变内容及配置解释器。不同内容不得覆盖相同精确键；重复操作只可确认原注册拥有者的同一贡献，不能让新 fiber 接管旧引用的清理权。登记取得的所有者凭据只用于撤除自己的贡献，不落入模型请求或 durable binding。输入对象先作无损防御性复制；只读 TS 类型与表面 freeze 不足以保护嵌套配置或可变字节。

`acquire(binding)` 在一个不含 await 的本地判定段内检查版本可取得、匹配 modelId/routeName、校验完整配置并建立引用。返回固定构件、原 binding、取消信号与幂等 release；陌生版本/已停止准入为 `unavailable`，配置无法解释为 `invalidInput{malformed}`。动态直接消费者先 acquire，再调用独立函数或 plan/send/read；静态消费者由调用者显式持有资源。runtime 的引用跨多个 dispatch、等待策略与回复处置保留，直到 S-53 要求的实际停止与结算/交接收口。

每个动态执行必须登记实际读取及回调完成条件，不能仅因外包装 `finally` 开始执行就声称已停止。release 移除的是该持有者使用权，不能提前销毁仍在用的构件；重复 release 不减第二次。强制撤除向 runtime/direct 两类持有者同等传递取消请求，等待它们报告实际停止；不把 abort 事件本身作停止证明。构件不响应时，旧资源仍在，状态与在途数可查，报告 `remaining_active`（提供者诊断结果的候选名，非新增 ResponseOutcome）。

发布是三个独立动作：**登记新版本 → 目录成功采用 → 显式撤旧**。登记失败不改档案；目录提交失败保留旧绑定；成功采用后新打开调用才取得新版本。新版本登记本身不改变档案，自建档案也不跟随 official 更新。旧版停准入后仍指向它的档案得到 unavailable，不回退“最新”。撤旧前影响清单是管理辅助，不是跨 owner 原子保证；它与新 acquire 竞争仍由注册表判定点排序。

撤除内部先把该贡献改为 retiring，关闭新 acquire，再按**此刻仍有效引用**建立本次排空等待。不能在 active 时创建一个“首次归零即永久完成”的 Promise：已有实测反例为 acquire A → release A → acquire B → dispose，旧 Promise 会在 B 尚活跃时误放行。引用归零并且所有实际读/回调完成后才清理该所有者资源、删除其登记；清理失败保持可见失败及未释放范围，不以删 Map 冒称完成。

等待政策（期限、检查节奏、强制取消后的等待）由显式配置与可替换调度实现提供，不写死数字。超时只报告仍有工作，并保持关闭准入与资源所有权；它不将 disposer 提前成功结算。具体 `retire` 结果型与单机管理入口由本节点实现面表达，不扩充 runtime 的业务失败枚举。进程整体退出使连接终止后，业务对账归 runtime 的耐久事实；本注册表没有持久恢复保证。

## 关键选择及代价

| 选择 | 落选方最强论证 | 本方弱点 | 置信度 |
| --- | --- | --- | --- |
| 共享传输与家族规则，窄模型贡献；不设 LLM 基类 | 每模型类便于封装少数完全不同协议与资源；每模型插件也可以共享池，不能因“插件多”就推导资源重复 | 组合接口需对齐；家族规则修订可能影响多模型，必须重跑受影响认证 | 高；当前固定一种 OpenRouter 协议，差异主要是数据/规划 |
| 一个稳定服务，模型贡献只登记；runtime 不 inject 每个模型 | 每模型服务的必需 inject 会让内核自动处理缺席，少一份引用管理 | 本方案自有取得/停准入/排空协议，必须做真实并发与失败验证 | 中高；保护既有调用与指定版本，有限模型及原型有支持，生产路径未证 |
| 贡献插件必需 inject 稳定服务；发布采用与撤旧分步 | 可选查找能容忍顺序并降低重载影响；统一发布事务向管理者更简单 | 缺服务时贡献未就位；管理者必须看每步结果，自建档案可能仍需旧版 | 高；Cordis 没有 optional inject 或跨目录事务 |
| 一个组合 effect 显式排序撤除 | 多 effect 各自清理更局部、容易复用 | 单个收口程序承担错误聚合、等待状态和部分资源清理 | 高；basis 明确并发 disposer 不保证顺序 |
| 版本登记而非每次仅验签就直接执行 | 签名可离线核来源，不要求一个运行中登记表 | 注册表是单进程状态，重启需重装精确版本；可信装配仍承担代码来源审查 | 高；签名不证明资源仍存活、配置可解释或在途已停止 |
| 保留 pi fork、单一 chat-completions 及比较门 | 原厂协议可能更完整承载缓存/推理；全 SDK 可减少自行维护协议细节 | 遇到无法无损承载的模型会阻断认证，需要回到采用选择重新评估 | 中；真实协议比较门尚未通过，绝不自动转协议绕门 |

## 依赖、存储与装配责任

本节点无自有耐久存储，也不声明跨 owner 同一提交。`data.messages/v4#S-49` / `data.model-response/v4#S-36` 的完整 binding 由 runtime 在会话 JSONL 的共同 append 点写入；本节点只返回同一规划的不可变值，不读目录后再尝试写一份“同步”影子表。配置修订的历史冲突由目录/存储提供者承担。本节点对存储提供者的直接要求清单为空。

本文“独立验收装配”精确指主线指定的 **`apps/model-request-acceptance`**，是本纵线的技术验收消费者；不表示 CLI 或 Agent Loop 已交付。时钟、凭据注入、可信发布身份与诊断输出均归该节点；节点尚未建立，暂以路径指认，其装配闭合仍登记 PAT-V3-8。

| 边界 | 实际承担者与生效点 | 缺席、撤回与装配责任 |
| --- | --- | --- |
| 传输核心、core 类型 | 上表精确版本、包公开入口；随候选采用切换 | core 新数据版本未实现时阻断生产包，不经别名假装兼容 |
| 版本可用性 | 同一稳定传输实例内部注册表；acquire 与 retiring 的本地线性化点 | 只保证本进程。跨进程版本租约、发布恢复由未来协议重建，不能把内存标记当耐久事实 |
| 档案采用与完整配置 | model-profile-directory 及其存储；以目录提交为准 | 目录负责历史修订判重、scope/身份及 official manifest 写入；本节点不拥有同一事务 |
| 凭据/取消/时钟 | runtime 或独立函数调用者每次显式交入 | 空凭据零 HTTP，禁止环境回退；时钟、超时政策与凭据合法取得归独立验收装配/调用者 |
| 首内容门、最终结算 | runtime 的 invokeModel/host 与会话日志 | 传输遵守读取取消并交事实；门和 durable 失败由调用者收口，不由 readStream 造响应体 |
| 诊断 sink/指标导出/保留 | 独立验收装配持有的有界输出端，寿命跨 runtime fiber | 装配校验容量/权限/输出路径及替代诊断状态；本节点不创建租户日志文件或网络查询 API |

配置错误政策分清边界而不产生两套政策：启动时基础配置/可信贡献声明非法，插件抛错、不发布，装配启动失败；每次调用的 binding、TTL 等声明式输入非法按 S-53/S-57 具名拒绝；明确凭据缺席按 S-58 拒绝，零 HTTP。profile 不存在某项必需配置不能靠启动默认补齐。策略预算与超时是装配明确给出的政策，无额外隐式总超时。

两条并发反证要转成真实测试：

1. acquire V1 先于 retire 的判定点 ⇒ 旧引用保留直至 read/回调/结算交接收口；retire 先于 acquire ⇒ unavailable，零 HTTP。若先删登记/关池再等，前一种出现本地撤除被误报成上游断流，因此禁止该次序。
2. V2 登记完成但目录采用失败，V1 仍 active ⇒ 新调用仍用 V1；若管理者此时撤 V1 ⇒ 新调用 unavailable，不能自动用 V2。组织档案采用 V2 与租户档案保留 V1 并行，两者各取自己的配置值。没有同一提交承诺，不能靠进程锁伪造目录耐久性。

附加交错：传输宿主替换与 P-2 撤除并行，旧 send 已出网则保留读取/停止与事实交回通路；尚未出网且旧传输停止准入则交本地事实。旧对象不再接新工作，最后一条实际读流收口后才能销毁共享池。跨 fiber 卸载等待次序仍需真实验证；内核不会替本节点取消 HTTP 请求。

## 成对的装载与撤除

| 取得的资源/贡献 | 拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止/交接与保留 |
| --- | --- | --- | --- |
| 配置、连接池、`modelTransport` | 稳定传输 fiber；完整校验/构造后提供服务，装配待 ACTIVE 才受理 | 已建池由同一组合清理收口；未完整发布的对象不可取得 | 关闭传输新准入；已有读取保留直到调用者实际停止/自然收口；最后一条结束再销毁池，超时不宣称销毁 |
| 家族/模型精确版本贡献 | 模型贡献 fiber；校验与登记完成后可 acquire | 撤自己已登记的 token；不恢复整表旧快照，不触碰并行贡献 | 单 effect 先 retiring 后排空；强制路径先请求取消再等停止；只释放自己的贡献资源 |
| runtime/direct 版本引用与取消监听 | 各调用者；acquire 成功后 | 后续 plan/host 登记失败也必须解除已取得引用及监听 | 使用者收口后恰一次 release；等待中的 retry/reply 仍由 runtime 持有，提前释放是缺陷 |
| 单次请求/socket/读流回调 | send/read 构件；请求真正建立后 | 序列化/排队失败不出网；连接后失败留来源、未知费用 | 取消后关闭/终止实际网络与读循环，等回调结束；不以 signal.aborted 代替这一判据 |
| 诊断端使用权及缓冲 | 传输采集者持借用端口，sink 本体归装配 | sink 拒收记录独立降级状态，不转成模型失败 | 释放本地缓冲/监听；外部 sink、耐久会话事实、已发生费用保留 |

## 可观测兑现与缺口

共用采集代码记录注册/拒绝/停准入/在途数/资源收口、版本取得与释放、规划及调整/丢项、队列与触达、响应/首内容候选/结束、取消请求与实际停止。首内容已可见与已耐久的事实由 runtime 报告，传输不越权。请求 provider 与实报 servingProvider 分栏，配置已采用与 cache read > 0 分栏，未知 token/cost 不计成零。

事件只带调用者显式提供的工程关联及完整版本坐标；默认不包含 binding 的配置正文、消息、工具参数/结果、推理、凭据或原始上游错误正文。错误先经同一脱敏政策，凭据片段哨兵在所有返回/诊断/失败支核验。度量只用有限模型/家族/结果等标签，不用 session/call/原文；日志和 trace 可带授权关联，不传到 OpenRouter 请求或 cache key。

诊断端是显式、可替换且有界的端口；容量与导出/保留由装配配置。本节点捕获诊断投递拒绝/异常并维护有界独立降级计数，不无限重试、不等待慢 sink 卡住读流；无法输出时如实暴露覆盖缺口。它不能篡改业务 outcome、费用或业务流完成；业务观察者背压与会话归属由 runtime/v3 S-62 另管，不能因共享一个 logger 就声称覆盖了租户授权。

未实现、未验收范围集中在 [verification 的增量义务与缺口](verification.md#v3-候选增量验证)。生产者 wire 等价、真实 socket 停止、直接消费者引用与宿主替换、37 份生产 manifest 及全部比较门仍阻断消费者；有限模型/原型和研究缓存暖读均不解除它们。
