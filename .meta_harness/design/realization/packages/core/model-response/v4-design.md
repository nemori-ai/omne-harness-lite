# model-response v4 候选实现设计

本文件是 `packages/core/model-response` 的增量映射，状态 **candidate**；不修改 [已接受设计](design.md)，不把 v3 的实际验证移记为 v4。契约坐标为 `omne-harness-lite-design-2026-09-15 · data.model-response · v4`，以下 S-n 均指 [该契约](../../../../spec/data/model-response/v4/contract.md)。本次读取的正文 SHA-256 为 `b591476555136ef8e86fba235b95df23627aa930581ee13db2817079d5cbf566`，是候选输入快照，不能冒充冻结凭据。

增量依据为 model-request-adaptation 提案 rev 2 及其 独立评审范围。需求沿契约所列 PF-013 rev 13、PF-009 rev 8、PF-004 rev 12、PF-012 rev 15、PF-001 rev 19、PF-011 rev 4、PF-010 rev 6；本节点不扩展产品范围。

## 实现路径与来源

在已有 TypeScript 纯值包中实现 v4。复用 `packages/core/model-response/src/index.ts` 的公开面与现有严格无损 JSON、`ExactDecimal`、Schema runtime；S-27 的有序判定继续由纯函数承担，不能根据验证器错误数组推断先后。本轮不新引依赖或 fork。

默认根入口与 `./schema` **候选采用 v4**。将现有根入口 v3 的纯函数和类型保留到候选 `./v3`，并由候选 `./schema/v3` 保留 v3 完整规范字节和原 `$id`。v2 只保持当前已有 `./schema/v2` 及其完整资源闭包，不新建 `./v2` 纯函数面。现有源码尚未提供 v4 或上述 v3 子面；不能把已存在的 v2 Schema 导出写成旧版判定入口已实现。未实施的契约 v2 消费者由主线另行决定采用，契约已接受不代表曾公开过 v2 纯函数 API。

v3 纯值子面直接执行固定版本规则，不按输入缺字段猜版本，不把缺少绑定的旧响应补成 v4。选择哪个版本归消费者的显式采用；保留面是主线指定的现有消费者边界，不构成任意历史版本兼容承诺。

Cordis 采用版本仍为 D-025 的 4.0.4。本节点不使用 Cordis API，不依赖任何 basis 机制语义，也没有待核对的上游生命周期主张。

## 契约责任到实现的投影

以下入口名称对应既有公开操作，其 **v4 实现均为候选，尚未实施**。Schema 公共 `validate` 只判断形状；完整单文档准入使用 `judgeModelResponse`。

| 行 | 契约责任 | 插件、服务或公开操作 | 实现与采用版本 | 符合性依据或缺口 |
|---|---|---|---|---|
| MR4-P1 | S-4～S-15、S-17～S-19、S-35 的数据表示及 S-26 Schema 范围 | 无插件；候选 v4 根类型、`validate`、`judgeModelResponse` | 在已有 `src/types.ts`、`src/schema.ts`、`src/judge.ts` 演进；复制 response/4 完整 Schema，固定依赖图 | MR4-V1/V5；旧 242 项测试不代表新图通过 |
| MR4-P2 | S-36 前两项：完整绑定相等，模型标识与请求路由一致 | 候选 v4 `judgeModelResponse` | 完成原有具名跨字段次序后，以 profile/3 S-29 的精确 JSON 值规则比较两处绑定，再比较 `definition.modelId` 与 `route.profile.routeName`；不使用 `upstreamModel` | MR4-V2/V3；Schema 无法单独完成相等关系 |
| MR4-P3 | S-27/S-28 拒绝次序及表示错误与调用结局分开 | 候选 v4 `judgeModelResponse` | 保留原有成员检查、具名跨字段检查、末尾无专名关系三段；新增绑定错配只进入最后的 `malformed` | MR4-V3；不修补、重试或重分类一次真实发出 |
| MR4-P4 | S-37 实际执行方的可选非空原串 | 候选 v4 `Route` 类型及形状判定 | `servingProvider` 不复用指定方 `ProviderName` 的规范化假设；缺席保持缺席，值按输入原样保留，不生成 `unknown` 占位 | MR4-V4；来源和供应商对应关系归 MR4-X2 |
| MR4-P5 | S-19/S-38 缓存与费用的单一表示 | 候选 v4 类型及纯判定，复用 call-accounts/2 | 只消费 `usage.cache_read_tokens`、`usage.cache_write_tokens` 与其 `Unknown`；使用精确整数/十进制，拒绝额外缓存镜像，不根据配置或价格推算 | MR4-V4；实际计数来源和命中验收归 MR4-X2 |
| MR4-P6 | S-6/S-9/S-11 与 messages/4、call-accounts/2 的副本对齐 | 本包的独立对齐测试，候选 | 沿已接受设计的 Schema 位置限定断言比较，保留注解差异；完整资源仍各自逐字节核对；约束与实例字段变异应使比较失败 | MR4-V5；纯形状相同不证明同次请求的值相同 |
| MR4-P7 | S-36 后两项及 S-16、S-20～S-25 的写入和历史事实 | 本节点无操作 | 调用绑定、已出门留痕、响应持久化、恢复与旧实现可用性由 runtime/日志/传输真实边界承担 | MR4-X1/X2；本节点不查询注册表、凭据、日志或适配实现 |

绑定比较复用 content-blocks 所有的严格无损 JSON 表示和 model-profile/3 的值语义，不再定义第二种相等。对象成员次序不影响相等、数组次序参与相等；数值按精确值比较，`1` 与 `1.0` 相等，大于安全整数界的相邻数必须可区分，布尔值不能等同数字。实现可复用已有精确值构件；新增内部比较构件若确有必要，仍在此规则下接受反例检验，不以普通 `JSON.stringify` 或浮点转换作为判据。

## 关键选择

| 选择（候选） | 落选方的最强论证 | 本方弱点与需要的证据 | 置信度 |
|---|---|---|---|
| 继续作为纯值模块，无插件、服务、inject、事件或 effect | 登记校验服务可以动态替换校验策略、统一消费者入口 | 静态版本需要消费者显式升级和打包验证；但纯表示没有独立运行生命周期，动态策略替换会改变历史版本判定 | 高 |
| Schema 形状校验加现有有序纯判定 | 将所有判断交给一个可扩展 Schema 引擎，入口较少 | 两层要通过组合反例避免漂移；跨字段相等不属于标准 JSON Schema，且拒绝优先级不能由库的遍历次序提供 | 高 |
| 默认采用 v4，保留 v3 纯值子面及 v2 已有 Schema 闭包 | 单一最新入口能减少资源数量；自动识别输入版本使用方便 | 保留多版会增加构建及测试成本；必须证明旧消费者不会因默认依赖升级而改变判定，不允许无依据补绑定 | 高 |
| 实际来源校验留在 transport/runtime，本包只判表示 | 在响应校验时查询供应商目录和实现注册表，可以早发现不一致 | 一份合法文档仍可能说假话；需真实边界取证。纯模块不能把当前目录状态当历史事实，不能自行给缺失字段补值 | 高 |

## 依赖、作用域与版本绑定

| 精确契约 | 解析方式与采用范围 | 缺席、撤回及变更生效 |
|---|---|---|
| `data.model-profile/v3`（candidate） | v4 图固定绑定、快照、路由、参数定义；profile/3 自身仍引用 content-blocks/2 | 接受与实现门未完成；不得临时回退 profile/2 或补默认绑定 |
| `data.messages/v4`（candidate） | v4 图固定 AssistantMessage 和发出记录的共享断言 | 接受与实现门未完成；不得以 messages/3 当前根资源代替 |
| `data.content-blocks/v3`、`data.loop-extension/v3`（accepted） | 沿 v3 已接受采用，完整块、FailureCause 及其传递资源 | 不因相邻包升版自动跟随 |
| `data.call-accounts/v2`、`data.offer-expiry/v1`、`data.identity-values/v1`（accepted） | 既有纯模块与精确资源；缓存 Unknown、用量、金额和身份继续有唯一拥有者 | 静态依赖和打包检查；本包没有服务失活或默认值政策 |
| response/3 纯值子面、response/2 已有 Schema 面 | 分别固定对应 catalog 传递资源和 `$id`；v3 判定显式使用 messages/3、model-profile/2 的必要纯值面；v2 只保留已有 Schema 资源闭包 | 新默认根不能进入旧版闭包；同一进程并存时不改全局资源表，不将旧引用重绑；不新增 v2 判定 API |

每版 Schema 图只从其精确 `$id` 的随包资源闭包装入，传递引用逐项可解析且完整资源字节与相应规范一致。包的发布版本不是契约版本；workspace 根入口的“当前版”也不是精确依赖凭据。v3 子面所需的 content-blocks、messages、model-profile、loop-extension 资源与判定必须钉其精确采用；v2 资源图也必须闭合，但不据此制造 v2 纯函数实现。

复制定义的对齐只单向在本包执行：`ResponseId` 与 messages、call-accounts 对齐；`SelectedBy`、`CredentialScope`、`ParameterAdjustment` 与 messages 对齐。沿 [既有断言比较口径](design.md#副本定义的对齐放在依赖方)，不制造反向包依赖。

## 状态、并发与失败映射

本节点没有领域状态、异步工作、持久提交点或跨 owner 写入。每次纯判定使用严格 JSON 快照，不修改输入；`readonly` 类型不能代替这一点。只有固定资源编译产物可由模块持有，不能把调用者数据、模型配置、凭据或当前供应商目录保存在模块级可变缓存。

S-27 的新增绑定比较处于具名关系之后：例如绑定错配与 `reply_missing` 同时出现时，必须返回 `reply_missing`；与 `first_token_inconsistent` 同时出现时，必须返回后者。绑定成员本身类型非法仍在成员形状阶段拒绝。`failure.inBand` 缺 `statusCode` 等既有末尾关系继续延后，不能被新 Schema 接线提前到成员阶段。

输入的表示错误只返回原有具名拒绝或 `malformed`，不转成一次调用的 `failed`，也不触发重发。已验证值不能证明历史绑定、缓存、费用来源或首内容时序。供应商原串不同也不在纯值层触发业务失败：名称对应与首内容前后的失败分类留给真实传输/runtime。

本节点没有密钥、TTL、超时或默认值配置项。配置值是被校验的档案数据，不是模块启动配置。固定规范资源缺失或编译失败属于构建/制品缺陷，公开输入拒绝不能掩盖它；不增加运行期降级或静默换版。

## 存储要求与装卸配对

**存储要求清单为 0 项。**本节点不写日志、不分配 ResponseId，不拥有原子写、唯一约束、锁定读或跨 owner 同一提交。S-22/S-25/S-36 的耐久性由 runtime 与会话日志承担；此处没有可以用进程锁替代的提交边界。

**受管装载贡献为 0 项，装卸表不适用。**普通模块导入后公开静态纯函数，既有输入与结果由调用者拥有；没有连接、监听器、计时器、后台任务或 Cordis 资源要撤除。模块不会取消任何在途调用，也不参与模型版本引用的 acquire/release。历史响应判定不要求旧模型实现在线。

## 归装配与消费者交接

| 事项 | owner 与真实边界 | 本节点的交付边界 |
|---|---|---|
| 正确选择根/旧版公开面、打包完整依赖图 | 消费者包与装配构建；主线逐消费者确认契约采用 | 提供精确纯值入口；MR4-V5/V6 核实其独立可消费 |
| 打开调用取得完整绑定、逐次发出一致、恢复后不换绑 | [model-request-runtime](../../model/model-request-runtime/README.md) 与共同日志写入边界 | 只校验一份响应自身，MR4-X1 未闭合前不能声称端到端成立 |
| 实际供应商名称对应、缓存原始来源、费用与参数事实 | [pi-ai-transport](../../model/pi-ai-transport/README.md) 采集，runtime 记录 | 原串、计数、Unknown 的表示检查不能替代 MR4-X2 |
| 时钟、密钥、身份核实与落盘耐久 | runtime 的应用装配及会话日志提供者；本轮独立装配节点仍由主线建立/明确 | 本模块不消费这些依赖；其缺席不妨碍纯值单测，阻断真实请求验收 |

## 实施缺口与消费者影响

MR4-G1：response/4、profile/3、messages/4 仍为候选；独立评审和技术接受之前不开始本版生产实现。owner 为主线及各契约拥有者，受阻者是采用新绑定的 runtime、transport 和目录消费链。

MR4-G2：v4 纯判定、默认资源、v3 纯值子面及其精确闭包尚未实施；已有 v2 Schema 闭包也须复核未被默认升级破坏。owner 为本包实施者和依赖包实施者，关闭条件见 [MR4-V1～V6](verification.md#v4-候选证据义务)。现有 v3 实现与旧证据仍按原坐标有效。

MR4-G3：本节点不能闭合写入真实性与装配义务。owner、反例和消费者限制见 [MR4-X1/X2](verification.md#v4-覆盖缺口与外部-owner)；不得用合法响应样本或研究探针覆盖生产端到端义务。
