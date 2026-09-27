# pi-ai-transport：完整窄定义与配置解释投影候选

2026-09-27，rev 2，**candidate，未接受、未实现、未验证**。本页是既有节点的局部增量，按节点模板补齐本次变化涉及的公开面、投影、资源责任和验证义务；没有新建节点。既有四件套及 [v3-design](v3-design.md) 保留原字节。本文新增类型、字段、函数与方法名全部是**提供者实现面候选**，不是现有可调用 API，也不向语言无关数据契约增加字段。rev 2 按主线明确裁定补齐完整定义代际的无兼容迁移，供 ND-AR1 定向复评；不据裁定声称本页已经接受。

## 基线与分层状态

[D-076](../../../../record/decisions/model-runtime-delivery-adoption/decision.md) 采用的 v3 文件 SHA-256 为 `297d42b6eb6b8841169724d3922bd9be4f1114a8432c498aa27cba4b9f75e0cd`；该文件开头的历史 candidate 字样不取代采用记录。本增量只细化其“公共实现＋家族规则＋模型窄定义”和“完整配置由定义解释”的既定责任。

| 层 | 本次状态 |
| --- | --- |
| 语义接受 | baseline `omne-harness-lite-design-2026-09-15` 下 `data.model-profile/v3`、`capability.model-request-runtime/v3` 在 catalog 为 accepted；前者采用记录经 [D-078](../../../../record/decisions/model-main-integration-coordination/decision.md) 行政承接，后者及本节点 v3 沿 D-076。本页新增实现投影尚未采用 |
| 可实施 | 既有源码包已存在：五成员 `ModelDefinition`、37 个显式身份、两个默认 pilot、纯 plan/send/read 和进程内 lease 已有局部实现。本页扩充的完整定义、公开读取与统一解释器尚未实现；不据此直接发布 37 份正式档案 |
| 绑定证据 | 新增绑定 **0 条**；本页下列 ND-V 是待执行义务，不伪造 `test:` 登记，不扩大既有 bindings 的适用范围 |
| 实际验证 | 本增量暂无实现运行。既有 [verification](verification.md) 的参数、生命周期及外部制品结果仅证明各自冻结输入；既有暖读不证明全参数、模态、工具、推理 replay 或 TTL 保留期 |

精确输入为 [profile3 S-5～S-9、S-15～S-21、S-27～S-31](../../../../spec/data/model-profile/v3/contract.md)、[runtime3 S-53、S-57、S-58、S-64](../../../../spec/capabilities/model-request-runtime/v3/contract.md)、[messages4 S-35](../../../../spec/data/messages/v4/contract.md)、[response4 S-11](../../../../spec/data/model-response/v4/contract.md) 与 [既有适配提案](../../../../record/proposals/model-request-adaptation/design.md)。产品来源沿 D-076/v3 对 PF-013 rev 13、PF-009 rev 8、PF-012 rev 15 和本轮 37 模型用户要求的明确采用范围，不把其后产品变化自动算作已投影。

源码观察基线为 `ea000728b0819c3b7c7534f01bd4c2b4e0b1c76b`，implementation revision 5、definition revision 1；它是观察坐标，不是新增接受事实。后续同时发生的公共实现修复应按实际合入修订重新核对；本候选不预占未来 revision 数字。

## 契约责任到兑现点

| 契约责任 | 公开构件／Cordis 兑现点（新增名均候选） | 实现与采用版本 | 依据或缺口 |
| --- | --- | --- | --- |
| profile3 S-7～S-9、S-28：能力值与正式建档内容 | `ModelDefinition.capabilities` 复用 core 属性类型；`createOfficialProfileContent` 产生 core `ModelProfileContent` | `@omne-harness-lite/model-profile` 现有公开类型和表示判定；新增生成面尚未实现 | ND-V1；未知值阻断对应正式条目，ND-G1 |
| profile3 S-16～S-21；runtime3 S-57：支持值及非静默处置 | 每条 route 的完整 `parameters`／`extra` 规则，公共参数规划器 | 同一公共实现与明确家族实现修订；不凭 modelId 前缀选函数 | ND-V2、ND-V3；G-22 例外仍有效 |
| profile3 S-29～S-31；runtime3 S-53、S-57：配置与精确绑定 | `configurationSchema`、`interpretConfiguration`；已有 `acquire` 与 `planRequest` 共同消费 | Schema 从该精确定义生成，解释器由该 implementation 拥有 | ND-V4、ND-V5；逐路由未知允许值阻断 ND-G2 |
| messages4 S-35；runtime3 S-57：提醒角色 | 每条 route 的 `reminderRole`，公共消息投影器 | OpenAI developer；其他沿已核实专用类型或 user；不增加 system 分支 | ND-V6；新专用类型尚未核实的保持缺口 |
| runtime3 S-53、S-58、S-64：固定引用与同一规划发送 | 新读取面只读；既有 lease 冻结整个新定义及完整 binding；send 只消费已签发 plan | 既有稳定 `modelTransport` 服务与贡献插件；本增量不增加 fiber/service | ND-V5、ND-V7；宿主整体换代与 socket 停止沿既有义务 |
| runtime3 S-20、S-63：配置不泄密且观测不替代耐久事实 | 公开读面只给无秘密定义与 Schema；错误只给有限字段位置／拒绝类 | 沿既有显式诊断端口；不输出任意配置值、完整 schema 错误或请求内容 | ND-V8；配置无秘密仍须接收边界与装配负责 |

## 数据的唯一来源与公开读取

正式能力使用 core 已有 `ModelProfileContent`，调用固定值使用已有 `ModelProfileSnapshot`，参数选值使用已有 `ModelRequestParameters`。不另造 official offer DTO，不往 `ModelAdaptationBinding` 三个闭合成员里塞 Schema、能力表、认证标记或推理支持列表。

下列为候选 `ModelDefinition` 的完整可观察投影。它是一份无代码、无秘密的不可变提供者声明；技术成员不登记为新的领域身份。

| 成员（候选） | 类型／含义及校验 |
| --- | --- |
| `modelId`、`revision`、`implementation` | 沿现有公开名字及 profile3 S-29 精确字符串域。`implementation` 指向已装配的公共代码＋家族规则，不接受字符串路径、动态 import 或可执行配置 |
| `capabilities` | `Pick<ModelProfileContent, 'inputModalities' \| 'outputModalities' \| 'maxInputTokens' \| 'maxOutputTokens' \| 'inputConstraints'>`。直接复用各字段公共类型和表示判定，不重新定义数、模态或限制。它是构造正式档案的来源值，不是每次规划都覆盖快照的“最新事实” |
| `routes` | 以精确 `ProviderName` 为键的非空表；每值具有本页下述 `reminderRole`、`parameters`、`extra`、`cache`。无缺省 route 或厂家前缀分支 |

候选 route 声明将现有模型级 `reminderRole` 和 `routes[provider]` 的单一缓存模式扩为完整逐路由记录；不保留同时拥有裁决权的模型级 fallback。家族工厂可复用不可变规则片段，最终产物必须展开为可检查的每模型／每路由完整值。家族差异进入 implementation 修订；模型及路由事实差异进入 definition 修订。不存在第三份可浮动的 family 身份。

能力事实与本机可承载输入分别存在：`capabilities.inputModalities` 描述正式提供的模型能力；公共编码器可承载哪些具体块／引用表示仍由实现与模态投影负责。当前编码器只能处理 text/image，不能据此把实际声明的 audio/video 删掉，也不能靠扩大能力表宣称已实现编码器。对应模态的正式提供／认证在真实字节来源和完整编码路径闭合前保持受阻（ND-G3）。

候选纯公开面全部从包根 `.` 导出，不加载 Cordis；`./plugin` 保持装配入口：

| 公开面（候选） | 输入 → 输出；缺席与失败 |
| --- | --- |
| `readModelDefinition` | 显式定义集合＋binding 的 implementation/definition 两分量 → 完整不可变定义；未知精确键为 `unavailable`，非法坐标为 `invalidInput`。不读目录、不采用 latest，不取得使用权 |
| `configurationSchema` | 完整定义＋精确 provider → 该 route 的无默认值 JSON Schema 工件；route 不在定义中为 `unavailable`。工件不携带配置实值，不拥有独立修订或持久身份 |
| `interpretConfiguration` | 完整定义＋configuration.values＋精确 provider → 已校验、无损复制的配置解释或 `invalidInput`；route 未登记为 `unavailable`。只解释，不补 TTL／断点／模式 |
| `createOfficialProfileContent` | 完整定义＋明确的 `providers`、`allowFallback`、完整 configuration、可缺席 parameters → `ModelProfileContent` 或表示拒绝；routeName、origin=official、capabilities 和完整 adaptation 由明确输入构造。所有字段最后经 core `judgeModelProfileDocument`。不生成 registration/updatedAt，不注册目录、不建立 lease、不发请求 |

`createOfficialProfileContent` 是官方清单维护者的便利构造器，不是租户建档授权入口。它要求所选 providers 都能由这份定义定位、且配置能在这份清单声明的各路由解释；不能解释就返回提供者实现面的 `invalidInput`。这个额外一致性检查只决定能否**生成官方清单条目**，不改目录对一般自建档案的契约判定。没有完整输入不能只输出部分条目并称完整 37 清单成功。

组织／租户自定义直接使用同一个 core `ModelProfileContent`、已注册的精确实现及窄定义和显式 configuration，授权及配置修订历史由目录拥有。它们不被 `officialDefinitions` 的存在自动变成 official，不跟随官方配置更新，也不能把声明式配置变成可执行 adapter。

公共读取是观察快照，返回后可能发生撤除；“读得到”不承诺“随后可取得”。执行仍先经动态 `acquire`，或由独立调用者明确持有静态资源。注册表不为只读查询另外建立常驻引用。

## 完整定义代际的导入、构造与迁移

**本节是主线对技术迁移的明确裁定**：当前仓库尚未生产发布，不为旧五成员定义增加兼容层。新版只接受上节完整声明。不能把旧定义补成虚构 capability、空规则、false 或默认 TTL，也不能通过分支检测旧形状继续注册它。以下候选接口变化随公共 implementation 与受影响 definition 的语义修订一起交付，不预占未来修订数字。

| 边界／公开面 | 新代际的具体行为与失败 |
| --- | --- |
| 包根 `.` 的 import | 导出纯构件、类型、明确的只读模型 ID 目标清单；不在模块求值时调用 `ownDefinitions` 构造 37 份尚不完整的声明，不访问网络／目录，不分配连接池。单独 import 任一纯面不得因官方事实未冻结而失败，也不解析 Cordis |
| `pilotDefinitions`、`officialDefinitions` | 两个旧五成员贡献集合从新版公开导出移除；不保留旧名字的兼容别名，也不导出空的“完整官方定义”集合。原实现与源码制品只作为原修订的历史证据保留，不重新进入新版注册路径 |
| `officialModelIds`（候选） | 只读的 37 个精确字符串目标清单，可用于范围盘点。它不含实现／配置／能力值，不满足 `ModelDefinition`，不能传给注册、plan 或生成正式档案；长度 37 不代表 37 个模型可调用。完整正式定义集合只能在对应实际事实冻结并明确采用后另行发布 |
| `TransportOptions.definitions`／`createPiAiTransport` | definitions 改为**必填**。未给、undefined、非数组或任一不完整定义在创建 Agent／连接池之前同步抛 `TypeError` 配置错误；无 fallback pilot。完整显式数组先拥有和校验，之后才构造资源 |
| 明确的 `definitions: []` | **允许**，含义是该静态传输没有任何可规划模型；其 plan 对任何合法模型绑定返回 `unavailable`，不出网。它供已有动态 service 的内部 network owner 明确构造 send/read 资源使用；不能被当作官方就绪或隐式补装载。静态调用者若显式选择空数组，接受同样可观察语义 |
| `planRequest(input, definitions)` | 第二实参改为必填，无默认 pilot；缺席、非法数组或不完整声明返回具名 `invalidInput`，不抛成上游失败；显式空数组或无匹配精确键返回 `unavailable`。两支均纯计算、零 HTTP |
| `createModelTransportService`／`piAiTransportPlugin` | 继续由稳定 service 拥有空起步的注册表，并在内部明确给 network factory 传 `definitions: []`；它们不增加隐式官方贡献。服务存在不表示任何模型可取得，需可信装配逐条登记完整定义 |
| `registerAdaptation`／`createModelPlugin` | 旧五成员值、缺字段或非法完整声明均不能发布。直接 register 返回 `invalidInput`；贡献工厂同步抛 `TypeError`。若非法内容在插件装载边界被发现则启动失败，不发布该贡献；不把配置失败变成网络重试 |
| 新宿主 acquire 旧 binding | 新宿主没有该旧精确实现／定义时返回 `unavailable`。禁止用新版规则补齐旧绑定、由 modelId 选最新版本、加载旧格式旁路或把旧宿主 lease 对象当作新宿主注册项 |

明确空数组只是**无静态规划能力**，不是通用发送授权：send 仍沿 S-58 接收有效、固定的 plan 与明确资源；动态 service 只发送本宿主 lease 已签发的计划。旧宿主签发的 plan／lease 不能跨宿主使用；外部调用者不能以有一个空 network factory 绕过动态引用的所有权约束。

两类宿主的迁移只保留各自原有责任：

1. 旧源码制品的宿主 A 在自身寿命内持有旧代码、旧五成员数据及已取得的旧 lease；关闭新准入后按原协议等待真实执行、track 回调与结算交接收口，再释放 A。旧调用不能在排空期间改用新 implementation 或新配置。新宿主 B 不接受那些旧对象。
2. 新代际宿主 B 只装完整定义；未冻结的官方事实不妨碍 B 的纯面导入或具名完整测试定义运行，但对应正式模型不可取得。A 的旧精确版本不在 B 就是 unavailable；进程丢失后的续接不得用 B 重建旧对象，仍沿 S-53 的明确缺版本分支。
3. 有现存 A 的持有者时，迁移装配必须把 A 保留到实际排空；不能先通过同一 Cordis service 提供者替换销毁 A 再宣称旧 lease 延续。若需要 A/B 同时服务，由装配给它们独立宿主所有权与明确解析入口；同名服务并存按既有 Cordis isolate 规则分别装载，A 的持有者仍引用 A，B 的新消费者显式引用 B。没有这份装配时采用先排空 A、再启动 B 的顺序，不承诺无中断。内核不替应用迁移在途调用。

本增量不建立 A/B 迁移管理服务，也不承诺跨进程恢复旧实现；未来需要并存装配时，其资源、解析与排空证据由实际装配节点负责。只换公共包制品的开发过程可以直接升级调用者，但必须同步更新所有采用了删除公开面的消费方。

| 受影响消费者／产物 | 对应修改责任与完成判据 |
| --- | --- |
| 本包 src/index、definitions、official、plan、transport、registry、plugin | 传输实施者移除旧贡献导出／模块求值路径，加入目标 ID 清单、显式构造与完整定义校验；静态和动态路径均通过 ND-V9，不留下旧形状自动转换 |
| 本包 README.md／README_ZH.md | 同一实施者逐例更新 imports、参数、注册与插件装载；说明无默认模型、目标清单不等于可用模型、空数组用途与新旧宿主边界。完整示例使用明确标注的教学定义，不把测试能力值冒充官方事实；两语言例子实际编译并运行适用无网络步骤 |
| model-request-runtime 包 README.md／README_ZH.md 及公开调用样例 | runtime 消费者实施者为 `createPiAiTransport` 提供显式完整定义；沿同一 `invokeModel`，不另建发请求路径。真实运行缺所需完整定义时明确受阻，不用教学值调用真实模型 |
| transport 的 support、plan、parameters、conformance、registry、plugin-lifecycle、official 测试 | 验证实施者改用具名完整 fixture，保留既有行为断言和新负控；official 的 37 身份检查改读目标 ID，不能把旧 37 五字段注册成功测试改名为新完整提供通过。模型事实与上游认证另有验收门 |
| 外部打包消费者、开发示例及 acceptance 应用接线 | 对应开发／装配 owner 检查公开声明和实际解析，去掉已删除导出、传全明确输入；在制品外独立导入根入口并执行 ND-V9。当前尚未建成的生产装配不得被样例替代 |
| 原来依赖隐式 pilot 的真实直接调用者、动态贡献装配、旧制品使用者 | 主线负责合入时盘点引用与实际装配关系；明确升级到完整定义、维持原制品待排空或受阻三种去向。检索零命中只是辅助，必须核对实际 public/service 入口的构造参数；不从测试更新推断真实调用已迁移 |

## 参数支持与处置的最小表达

每条 route 的候选 `parameters` 必须显式覆盖 `ModelRequestParameters` 的八个统一成员；`extra` 是按上游原键精确登记的表。两者描述**支持及处置**，不存请求选值，不给缺席项默认值。参数类型从公共类型索引取得，不重新列一个 effort 词表。

每个参数规则的候选形状只支持以下三类，先满足当前确有需求的差异，不建通用政策语言：

| 规则（候选判别式） | 精确解释 |
| --- | --- |
| `pass` | 按公共参数域接受原值，发出；仅适用于已有证据支持该完整域的声明。`extra` 必须另外明确可接受的 JSON 值域，不能以已知键推断任意值都支持 |
| `drop` | 明确不发该项、记录其项名；这是适配处置选择，不能拿它代替对模型真实支持能力的调查 |
| `select` | `accepted` 为明确的同类型值集合，或数值项的闭区间（两端均为 core 无损数）；原值在域内则发原值，域外按必填 `otherwise` 丢弃或改为明确给定的同类型值。改值目标必须落在 accepted 域；不得是函数、环境值或未定义的“最接近” |

候选类型 `ParameterRule<T>` 的封闭形状为 `{ kind: 'pass' }`、`{ kind: 'drop' }` 或 `{ kind: 'select', accepted, otherwise }`；`accepted` 恰取 `{ values: readonly T[] }` 或 `{ minimum: JsonNumber, maximum: JsonNumber }`，`otherwise` 恰取 `{ drop: true }` 或 `{ adjustTo: T }`。值集合非空且无重复，区间 minimum≤maximum。统一成员的 T 来自 `NonNullable<ModelRequestParameters[K]>`；对 extra，T 是 core `JsonValue`，pass 明确表示该已登记键支持任意 JSON，select 只允许 values 分支。其他成员一律使定义无效。这些只是本节点候选技术类型，不是新增 data 契约。

`select` 的值集合按 core JSON 值相等判定；数值按精确十进制比较，不能先转 JS number。数值区间只用于统一数值项；`seed` 仍须是整数。复杂约束或跨项条件若现有表达不能承载，先报提供者映射缺口，不静默透传。具体字段编码由该 implementation 的已有公共映射持有；规则不能任意改变请求保护字段。

规则编译时验证八项齐全、无额外统一项、各值属于 core 域、调整目标有效、每个已认得的 extra 键不与统一项及保护字段冲突。陌生 `extra` 键按 S-19 丢弃并留痕。保护字段／统一项上游别名沿既有安全政策一律丢弃；声明试图把它们登记成私有参数时，定义本身非法，注册失败。该候选改变现有“未保护的陌生键均透传”的实现，不把旧行为追认为符合 S-19。

逐项处理顺序固定为 core 统一词表的既有顺序，再按 extra 键逐码点排序；这只固定数组输出和确定性，不改变对象 JSON 相等规则。每个给出的参数恰有一种结果：原值在实际 `parameters`、调整后值在实际 `parameters` 且有一条 `parameterAdjustments`、或不在实际参数且有一条 `droppedParameters`。项名按 profile3 S-20：**extra 记原键名，不加 `extra.` 前缀**。所有 extra 丢弃后省略 extra；独立实际参数全部为空允许 `{}`。源码基线仍输出前缀的偏差须由相应实现修复和新证据关闭，本页不声称已修复。

`reasoningEffort: none` 与缺席分开；缺席不生成 reasoning。上游 `xhigh`、`minimal` 等不能直接进入公共词表，也不能把映射后的上游私有 token 填入统一实际参数。本轮只提供能由既有词表及留痕合法表达的原值／改值／丢弃；没有已接受对应关系的模型值保留待核对，若确需扩统一域则先回 spec 出新版本。

`maxOutputTokens` 保留 runtime3 **G-22** 的明确例外：此刻上游输出上限无来源时按要求原样发送，不从 `capabilities.maxOutputTokens`、目录卡片或研究样本生成动态夹取规则。这一项当前规则只允许 pass；有真实当前来源并完成所需语义采用后才能加入数值调整。档案及本次合并参数的 S-18 表示上限校验仍照常执行。

## 逐路由配置 Schema 与唯一解释器

本增量保留现有配置值的 `cache` 容器，不引入协议级新配置格式。候选 `routes[provider].cache` 是配置允许值的唯一手写来源：

| 路由声明（候选） | 对应合法 values 与 Schema |
| --- | --- |
| `{ mode: 'automatic' }` | 只接受 `{ cache: { mode: 'automatic' } }`；对象各层 closed，mode 用 const；禁止 ttl／breakpoints／其他键。自动缓存不产生手工 cache_control |
| `{ mode: 'explicit', ttlValues, breakpointLayouts }` | ttlValues 是有来源的非空精确字符串集合；breakpointLayouts 是有来源的非空完整布局集合，每布局为现有 `system/last_tool/last_message` token 的非空、无重复数组。values 必含 cache.mode=explicit、ttl、breakpoints；ttl 用 enum、breakpoints 用完整数组 enum。各层 closed，无 default |

布局按数组原次序保留；只验证已列的完整布局，不因列出三个可能位置就允许未经确认的任意组合。TTL 不在公共代码硬编码为 `5m/1h`，不从 short 推导固定时长；精确路由可以在已确认后声明这些值，声明本身不证明 TTL 保留期。现有断点没有可附着文本／工具时，是否可以省略该断点的具体 wire 行为须先按既有请求投影与真实路由核实；不能把“配置形状通过”记成“实际已布置所有断点”（ND-G2）。

生成器采用 JSON Schema Draft 2020-12 的 `type/properties/required/additionalProperties/const/enum`，不包含外部 `$ref`、远程读取、默认值、代码或秘密。Schema 是提供者配置的发布工件，随 implementation＋definition 精确修订分发，位于本包公开读取面；不注册为 `data.*`，不落入 binding，不需要新增 schema 字段。

纯解释器与 Schema 生成器从**同一份已拥有、已校验的 route 声明**读允许值。解释器不靠另写一份族级 `5m/1h` 检查表；Schema 编辑也不是改变解释器的入口。配置严格解析和无损复制先沿 core JSON；本轮配置叶子只有字符串及数组，不把 core 无损数对象直接交通用 JSON Schema validator 冒充原始 JSON。ND-V4 使用独立 Schema validator 对原始 JSON 文本做等价性核对。

调用边界分别为：

1. 可信贡献装载先校验完整声明并生成规则；非法声明／Schema 不发布，插件启动失败。纯函数显式收到非法声明则 `invalidInput`，动态 register 仍沿其具名拒绝；这是同一“错误不发布”政策在两个现有边界的表达。
2. 现有 `acquire(binding, routeName)` 尚未选择本次 provider；本候选保留签名，校验 binding，并对定义中所有 route 调同一解释器。至少一条能解释才建立引用；全不匹配为 `invalidInput`。该检查只证明配置可由定义解释，**不承诺每个 provider 都可用**。
3. `plan` 获得这次明确 provider 后，只用该 route 的同一解释器；未知 route 为 `unavailable`，已知 route 配置不适用为 `invalidInput{malformed}`，均零 HTTP。不因 acquire 曾有另一条 route 匹配而绕过本次校验。
4. `send` 消费冻结 plan 的实际字节，既不重读 Schema／定义，也不把配置重新解释或转成任意 extra 参数。完整 binding 与参数留痕保持原对应关系。

自动和显式路由无法用同一配置同时表示时，本构造器不伪造可以跨它们回退的官方条目；按精确配置另行建档的名字约束仍归 profile3，不在这里增设别名。一般档案在一次真实规划不适用时按第 3 步明确拒绝，不隐藏换路由或改配置。

## 注册、版本、资源与并发

本增量不改变一个稳定传输插件、共享连接池及模型贡献插件的边界；纯读取、Schema 生成和参数规则不各建 fiber/service。Cordis 继续 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md) 的 4.0.4；pi fork 路径继续 v3 的 0.86.1／`3390bd93630965a12a0a1a5c36ce890ec22f7e1d`，未选新第三方运行依赖。

| 资源／贡献 | 取得、可见与部分失败 | 撤除及保持 |
| --- | --- | --- |
| 完整定义＋生成的配置工件 | register 先严格复制、递归拥有所有数组／对象并校验；整份通过才原子加入本进程可取得表。半份声明不可见 | retiring 先停新 acquire，已取得 lease 持有原完整值；只读副本不授予执行权 |
| 家族参数规划器／配置解释器 | 属于同一 implementation 修订与传输宿主；贡献仅引用已装配实现。缺实现为 unavailable，不能从定义自行加载代码 | 旧 lease 仍用原实现；公共代码改变必须升 implementation，受影响认证失效；不得同修订替函数 |
| 动态 lease 与实际执行 | acquire 同一无 await 判定段完成校验、版本取得和引用建立；后续规划不借当前定义补字段 | 沿 v3 的 release、track、实际停止、结算交接；强制取消不是释放证明；共享宿主换代仍须既有真实验证 |
| 正式档案写入 | 本包只交完整 `ModelProfileContent`，目录按自身契约提交并维护配置历史 | 目录失败不改变旧档案；不自动撤旧注册。注册新版本→目录采用→显式撤旧的三个动作保持分开 |

同键不同内容检查须覆盖完整定义（能力、所有路由、每个参数／extra 规则、提醒、TTL 和布局），采用 core JSON 值比较，不遗漏新增字段，也不能用对象引用或未经认回的摘要当等价性。配置 revision 的命名域和同 revision 不改值由目录／公开调用者的配置来源负责，注册表不另建跨档案配置历史。

修订影响明确区分：改变公共算法／家族行为升 implementation；改变模型能力、支持值、route、role、TTL 允许集合或布局升 definition；改变某档案实际配置值升该来源的 configuration。只改变运行中采用的配置不改窄定义；只增加新版本不改变旧调用。精确新版登记不自动替换目录，旧定义缺失不能以最新版本恢复旧调用。

**存储提供者要求：本增量为零新增项。**本节点没有持久写权；定义取得和 retiring 排序在同一进程 owner 内，跨进程时不宣称这套引用协议仍成立。目录采用与本节点注册从来不是同一提交，二者没有共同存储对象，本页也不提出跨 owner 原子保证。未来如果要求原子发布／回收，必须先明确共同持久对象与新协议；不能靠两个事务现读、时钟谓词或进程锁补出承诺。

两条必须实际反证的交错：A 读到旧定义→B retire 关闭准入→A acquire 应 unavailable；A acquire 旧定义→B 登记新版并被目录采用→A 再 plan/send 必须仍用旧配置与旧规则，直到实际执行及跟踪回调完成后才能释放。ND-V7 不仅检查 dispose 回调被调用。

上游机制依赖逐项沿 basis：[`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) 约束宿主更换时贡献重跑；[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md) 约束贡献必需依赖；[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md) 约束非法声明不发布；[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) 要求沿既有单组合 effect 收口；[`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md) 不提供租户授权。无新增依赖上游精确行为；v3 所列尚无 basis 的提前解除登记和 Node 实际停止仍是待核对主张，不由本页关闭。

## 事实闭合与关键选择

37 个用户确认模型继续是完整目标，按 v3 的八家计数固定（12/4/2/2/2/8/2/5），不由 OpenRouter 目录自动增加。研究卡片、短请求观察与正式值分别维护。未核实的字段不能写成 false、空集合、任意参数域或 `inputConstraints: {}`；后者是已知无所列限制。`maxInputTokens` 不等于目录总 context_length，必须记录只计输入的推导前提与来源；历史 1024/128 token 请求也不证明最大输出能力。投影经采用后，公共规则、Schema 生成、严格校验、只读公开面与固定 lease 可以在完整的具名测试定义上先实现；这些测试定义不是 official，不将待核实项改为 drop，也不以返回空清单的 API 声称 P2 已完成。

正式定义与正式 profile 发布工件只含已经闭合并明确采用的值。未闭合模型仍保留其目标身份、事实问题及验收 cell，不进入完整正式清单，也不从目标范围删除。既有 37 个五成员贡献的存在只证明身份及局部规划，不是本增量完整清单；两个 pilot 也不能冒充能力资料已齐。P2 的能力冻结与 P6 的当前完整 binding／配置来源／实际路由生产认证分别放行。

| 关键选择 | 落选方最强论证 | 本方弱点／反证信号 | 置信度 |
| --- | --- | --- | --- |
| core `ModelProfileContent`＋提供者窄规则，避免第二种能力 DTO | 新 offer 类型可直接带研究状态、细粒度测试和支持声明，管理端消费方便 | 研究未知不能塞进正式值，需明确发布门；若出现无法由 core 表达的真实产品能力，须回 spec | 高 |
| 家族纯构件＋展开的窄数据，不做每模型类／服务 | 每模型类适合完全不同的协议／独占资源，局部特殊行为封装直接 | 共用实现更新波及多模型；不能靠模型名决定分支；出现独立资源寿命时重新审查 | 高，当前固定 OpenRouter 协议 |
| 逐 route 元数据同时生成 Schema 与解释器 | 单独手写 Schema 易用成熟 validator 并直接输出 UI 配置表 | 生成器与解释器可能共同出错，必须用独立 validator、抓线和负控；复杂配置超出现有有限形状时重新设计 | 中高 |
| acquire 校验 route 联集，plan 校验明确 route | acquire 增传完整 provider 集可更早阻止任何后续不匹配 | 较晚才发现具体 route 不适用，但仍在纯规划前明确拒绝；官方构造器提前逐 route 核对；不误称 acquire 成功即所有路由可用 | 中 |
| 固定参数处置表与有限值规则 | 任意回调可自然表达跨参数限制及特殊上游行为 | 当前有限形状不能承载任意跨参数约束；遇到真实需要先补投影，不以任意代码侵入声明或复制第二份策略 | 中 |
| 注册／目录采用／撤旧分步，无新共享存储 | 一个共同发布事务可消除采用窗口，管理者体验更简单 | 显式不可用窗口及恢复管理仍需面对；本轮无新增跨 owner 原子承诺，范围符合 v3 | 高 |

## 验证义务、缺口与装配承接

下表是未来实现验收 oracle，**本次未执行**。每个 oracle 都必须在对应语义被删除或替换时失败；失败记录保留，不能只写测试名。实施者提供公开源码／制品与真实受控 HTTPS，独立 verification 执行者核对结果，主线决定放行。

| ID／条款 | 可失败的验收 oracle |
| --- | --- |
| ND-V1／profile3 S-7～S-9、S-28～S-31 | 37 身份精确集比对；正式 content 经 core 表示判定且与来源全字段相等。未知字段禁止产出，context_length 直接塞 maxInputTokens、unknown 写空限制、未给 configuration 均有负控；不存在凭空补 registration/updatedAt |
| ND-V2／profile3 S-16～S-21 | 八项均测原值发送与缺席不补；drop、select 及改值的正向场景仅适用于允许这些规则的其余项。`maxOutputTokens` 当前只允许 pass，将其定义为 drop／select 是非法定义负控，保留 G-22 原样发送例外与 S-18 表示上限校验。none/缺席分离，xhigh 被公共域拒；精确大整数／小数及边界数值比较。把丢项静默化、调整不留原值、额外补默认值或 G-22 擅自夹取作为负控 |
| ND-V3／profile3 S-19～S-21；runtime3 S-57/58 | 一个已登记 extra、一个未登记键、所有保护键、原键恰以 `extra.` 开头的私有项；用真实抓线核实际 body、公开 parameters 和两类留痕逐项对应，禁止递归乱剥前缀。全部 extra 丢弃时公开 core judge 仍通过且没有 extra:{} |
| ND-V4／profile3 S-30；runtime3 S-57 | 每 route 合法／非法 TTL、布局、重复／未知位置、缺字段、未知键和错误 mode 的有限枚举，与独立 Draft 2020-12 validator 双向相等。人为改生成器或解释器一边必须失败；每个拒绝实测零 HTTP |
| ND-V5／runtime3 S-53/57/58 | acquire 在 A route 匹配不能放过 B route 错配置；同 key 不同能力／规则／TTL 均拒绝。原定义、返回读面、配置原对象被修改后，旧 lease 和 plan 实际抓线不变；相同 revision 字符串但不同完整配置不能混用 |
| ND-V6／messages4 S-35；runtime3 S-57 | 所有 official 定义显式 reminder route：OpenAI developer、其他 user 或已核实专用类型；提醒标识和顺序保留，不出 system，不按模型名前缀偷选规则。自动缓存零手工控制，显式计划及抓线准确对应给定 TTL／可实际附着布局 |
| ND-V7／runtime3 S-53/64 | 上节两条交错及空闲后再次 acquire；旧定义、Schema 与解释器固定至实际 stream/socket 和 track 回调结束；晚到清理不删除新版。新版本仅登记不能改变目录采用值或旧 lease。受控停止不证明远端未计费 |
| ND-V8／profile3 S-30；runtime3 S-20/63 | 错配置及极长未知键不进入原始日志；敏感哨兵全输出扫描；读取面没有凭据／认证详情／实例 owner token；诊断失败不改业务结果。发布包独立消费者仅根入口可取上述纯面且不解析 Cordis |
| ND-V9／runtime3 S-53/57/58/64；profile3 S-29～S-31 | 在只有新版公开制品、没有任何冻结 official full 定义的独立消费者中 import 根入口成功，HTTP／连接池构造计数均零且不解析 Cordis；旧两集合不再导出，目标 ID 清单不能注册。缺 definitions 的 factory 在资源创建前抛 TypeError；缺定义的纯 plan 报 invalidInput；显式 [] 的合法请求 plan 报 unavailable；旧五字段 register 报 invalidInput，均零 HTTP。用具名完整 fixture 可成功规划和受控 HTTPS 发送，证明不是全不可用空 API。另以旧制品 A 取得 lease、阻塞实际流／回调，关闭 A 新准入并启动独立新版 B；B acquire 旧 binding 必须 unavailable，跨宿主 plan／lease 使用被拒绝，A 原调用按原代码和原值完成后才释放。负控恢复 import 时 ownDefinitions(旧37)、默认 pilot、旧格式自动补齐、或让 B 接管 A 对象，必须分别失败；没有真实 A/B 场景则保留该迁移证据缺口 |

| 缺口 | 阻断谁／owner 与闭合条件 |
| --- | --- |
| ND-G1：37 个完整能力、输入窗口换算、输入限制及参数支持尚未逐值闭合 | 阻断对应正式定义／官方清单及完整 P2 放行；模型调优和主线负责保存来源、明确值与采用。离线工件和拒绝路径实施可独立进行；不得通过缩小真实能力声明消掉待验 cell |
| ND-G2：各显式 route 的 TTL、完整布局及无附着目标行为缺实际确认 | 阻断该路由完整正式配置集／缓存提供；调优与传输 owner 明确可生成字段、有限候选和冷暖／到期对照。局部 plan shape 通过不算上游采纳或命中 |
| ND-G3：实际模态字节来源与转换／公开承载尚未闭合 | 阻断相应模态提供与模型认证；modality provider、runtime 和验收装配负责，不能只把 profile 删成 text。沿既有 B3 的精确采用与实现范围接续 |
| ND-G4：runtime3 G-22 当前输出上限来源 | 阻断动态输出夹取能力；主线及 profile 契约 owner 先给来源和所需新版；当前原样发送规则不受本候选改变 |
| ND-G5：本页公开面、规则表达及迁移尚未采用 | 阻断按本页改源码；主线安排独立架构／表达核对及明确采用，再按迁移表逐个修改消费者、对应包 README/README_ZH 与真实公开例子。ND-AR1 的迁移设计补充等待定向复评；ND-V9 的制品导入和两宿主实际场景尚无新证据。旧 v3/证据不原地改为“已经覆盖” |

归装配事项继续由 [model-request-acceptance](../../../apps/model-request-acceptance/README.md) 与 runtime 节点承接：可信实现装载与 publisher 权限、正式清单/配置来源、目录提交与历史、时钟、凭据下发、明确 provider 选择、生命周期与取消、生产认证和单一费用账本。该应用设计已有采用，完整源码装配仍未完成；本候选的纯构造器不替它提供这些保证。本节点只交已拥有的声明／规划及外部事实，不新增存储、身份治理、费用或发布协调能力。
