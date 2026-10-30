# Agent 通用实现的行为边界

根入口导出 `createAgentRuntime`、通用评估器 `agentEvaluator`、它写入的 checkpoint 的 schema 采用 `agentCheckpointSchema` 与构造类型。根入口另导出独立 Model 接收工厂、宿主持有状态与完整交付材料读取器，形状见[公开入口](docs/public-api.md#独立-model-接收入口)。读取器只判断 schema 与原关联，不独自证明保存或当前资格。工厂的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。工厂的创建校验、四个面的访问守卫与 `invoke` 的 Loop 正常路径骨架已实现，I0 输入批与 I1 请求准备、不可用读取的 W0 等待、真实 cannot-fit 的 F1 出口已实现。F1 新建候选从注入的 AgentClock.now 取时；失败保留原准备与续点，不写候选；同一已形成候选重试不再次取时。I2/M0 的固定主调用与意图提交、M6 正常直接受理及未知时原调用认回、M1 等待 received、M3 完整材料采用及 M4/M5 直通已实现。首内容前最终失败且无有效回复经 I3 形成 no-reply 候选。I3 的接纳事实、message 事件与 Q4 接续同 revision 提交。I4 提交真实空动作批，I8 重读最新事实后选择新 step、一次等待保存或 F1 候选，部分内容不直接决定完成。W0 保存业务等待，启动观察后重读来源，再按注入时钟等待进程内检查时刻。R0 保留原 operation 与 expected，committed 认回后继，unknown 等待，excluded 才重求值。通知与检查到期都不证明原操作未执行。其他操作本体及剩余 Loop 节点的精确语义与失败分支尚未实现，实际支持范围见[成员 README](README_ZH.md#支持范围)。运行契约的接受范围以 [公共 SPEC](../agent-contract/SPEC.md) 为准。

F1 在候选依据的修订未变时提交终结候选的业务内容，Journal 据此建立候选与 FinishIntent 投影；提交被排除后保留原意图与时刻。新输入或其他事实先改变修订时，经 R0 重读再求值。no-reply 候选失效后，I8 依据已消费结果、原 received 材料 关闭该调用的业务续点，不把已收场调用变成 producer 等待；原 received 与账目待办保持。F2 以普通 settling 提交完成落终态之前的经过，Journal 据此设 author route 的 beforeTerminal。F3 先读快照，投影尚无清单或上次 tryFinish 答 changed 时以 prepareFinish 发行终结责任清单，再读最新完整修订，最后以读到的 FinishIntent 投影调用 tryFinish 创建终态。F3 的 tryFinish 返回 unavailable 时，协调者经 R0 在内存等待，按检查时刻重试，不提交 waiting。changed 与 blocked 回 R0，未交清的 custody 保持真实等待；commit-unknown 先查询原操作再读取终态，excluded 才以原操作重试，unknown 或查询不可用不写会使原终结失效的等待提交。内存 Journal 按 SPEC 的五类责任固定次序阻塞终结，核对 obligations 已发行且属本候选，核对 intent 与投影相等，author route 无 beforeTerminal 或 cancellation route 无允许的判断记录时以 passages 阻塞；取消候选经 commitSettlement 的 establish、judge 建立与判断，协调者的取消路线仍未实现。

F4 从非空终态台账认回已登记观察，并把未登记项保留给长期 Journal 与合法观察者。本阶段不执行扩展求值、不虚构 observed。O0 不执行 Model ACK 或 release 记录；接收状态由宿主持有。未确认输出不由 O0 代为确认，其他合法保管责任继续留在 Journal。终态责任可接续后，E9 释放执行槽并保持登记，旧 execution 仍可读，新 execution 可复用 runtime。这些回归只覆盖同一非耐久内存 Journal 上的新协调者，不证明实际杀进程或跨进程恢复。

## 兑现责任

实现须完整兑现公共操作与失败语义，不在此复制公共状态机或结果形状。配置与注入能力聚合由 [构造入口](docs/public-api.md) 拥有，机制及尚缺设计见 [内部架构](docs/architecture/README.md)。

## 资源与替换

通过显式依赖取得外部能力，不导入 Cordis 或固定本地提供者。业务身份作为操作输入，不以 Context 或插件配置替代。替换和退出保留未完成责任，不能把依赖丢失或 disposer 完成报告成业务成功。

## 验证

当前测试核对构造、访问守卫、正常路径、输入承接、请求准备、主调用接缝、回复准入、空动作批、I8 三种去向、原操作认回、等待保存、失通知后的计时重读与等待资源清理，以及终结的候选投影、清单发行与失效、五类 blocked 次序、取消路线的建立、判断与迁移和三个保管变体（内存 Journal 通过 agent-contract 的 Journal 核心一致性套件）。测试使用脚本化 Model 与非耐久内存 Journal，不证明真实提供者或完整恢复。needs-compaction 按 #513 revision 2 保存原结果并返回 unsupported，压缩路径与相应 F1 结果留给 4.5。内部窄接续从同一内存 Journal 的已存 ready/step 或 PendingCall 重建固定帧，并从 received 条目读取完整材料，覆盖意图提交前后与 producer 已提交而尚未完成 I3 的切点，要求原 runtime、Access/Authority 与旧驱动已停；I2 尚须无未决 Journal 操作。它不是公开恢复或进程耐久。缺原产出 scope/format 的 reasoning_state、完整或未封 thinking 返回 unsupported，已接收材料保持可读。

Model 接收遵守公共 SPEC 的 [J02](../agent-contract/SPEC.md#结果接收)。同一内存 Journal 提供四个视图，joint commit 在单一发布点写入材料、条目、操作结果与 saved。原消费绑定独立于当前 checkpoint 与 attachment 保留。独立接收工厂在当前资格和原 Model 权威核验后才认回或提交；unknown 只查询原 operation，excluded 不换号。账目在共同提交后出站，重试与 blocked 状态跨组件重装配保留。Model 的公开 testing pusher 自行执行其 ACK；Agent loop 不调用 Model consumption。

I3 只准入完整普通结果。completed/limit 的合法全 sealed 内容可形成回复，原 settlement、parts 与真实 trims 保留在 received 材料中，不合成提醒或 trim。含 partial 的结果不升级为完整消息。interrupted 按部分结果回 I8，原控制身份随材料保留，不改成上游故障。该消费出口不表示控制请求、阶段记录或公开恢复已交付。
