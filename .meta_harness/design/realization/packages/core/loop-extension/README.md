## 2026-09-30 源码依赖对账（A1 core 集成后）

LC6 的固定资源图精确引用 CA2 与 MS6（[v6-design.md](v6-design.md)「LC6、MP5、MS6」行、「asset-model/v3、call-accounts/v2、tool-definition/v3」行与 21 资源清单；[资源闭包后继](../messages/public-definition-resource-closure-followup.md)的 LC6 行重申二者是真实直接引用）。A1 把 call-accounts 根换为 CA4、messages 根换为 MS8 后，本包改从各 owner 保留的精确入口取原字节：`@omne-harness-lite/call-accounts/schema/v2`（[call-accounts v3-design](../call-accounts/v3-design.md)「本包 Schema 与元数据」行）与 `@omne-harness-lite/messages/schema/v6`（[messages v7-design](../messages/v7-design.md)「另需保留 MS6 `./schema/v6`」段）。包依赖边不变，LC6 不因 CA4/MS8 自动升级（[call-accounts v4 ACK 映射](../call-accounts/v4-acknowledgement-design.md)迁移段）。`core-pure-imports` 表随此对齐；新增 binding 0。

## 最终 core 阶段签收（2026-09-26）

2026-09-28：[D-100](../../../../record/decisions/model-runtime-current-generation-adoption/decision.md) 采用 [v6-design.md](v6-design.md) 的当前迁移范围；绑定不新增，实际组合验证待实施。

本节点本阶段的 6 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# loop-extension

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.loop-extension/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/loop-extension` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**581 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 6 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前采用与实施层（2026-09-26 D-068）

设计显式采用 `data.loop-extension · v3`，精确 [规范](../../../../spec/data/loop-extension/v3/contract.md) 与 [接受](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 已冻结；采用依据为 [D-068追加](../../../../record/decisions/core-implementation-spec-reconciliation/decision.md)。此段取代以下原2当前采用／源码不存在的旧说明，旧投影按历史读，不代替新实际验证。节点身份、纯模块或构件边界、公开操作、外部所有者与Connector延期不变。

- 可实施：沿新规范全部本节点责任和下文既有投影，只有D-068明确的表示／采用／错误例变化；不扩展外部runtime或存储。
- 源码：`packages/core/loop-extension` 已完整采用3；作者 `29abb185` 的末段交付已集成至 HUB `fad84ef3`。默认3及完整原字节 `schema/v2` 均保留；实际 AM 固定图和保留2消费者闭包已通过。
- 实际验证：[当前源 HUB 复验](../../../../record/evidence/2026-09-26-tests-core-current-v3/README.md) 中本包 **581 tests**、构建、严格类型与公开消费者通过，六包合计2410；原2证据保留原坐标。W6最终两真实链、逐ID技术接受及用户总体接受仍待，不从局部通过推到外部责任。


## 原2采用投影记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.loop-extension · v2`（[契约](../../../../spec/data/loop-extension/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/loop-extension`——**尚未建包**。归 `core`：它是 `data.*`，被 `agent-loop`（派发器、兼容层）、`model`（模型请求运行时、模态投影）、`tools` 与 `assets` 消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点。它提供位置、维度、干预力、声明、输入、八种结论与三种记录的类型，两张合法组合表，结论的表示层校验（十个拒绝值），推出规则与 asset-model 的 `loop_extension` 类正文端口。**逐件派发、结论落日志、报错处置都不在这里**，归拓展件派发器

## 分层状态

**当前实施补充（2026-09-26）**：源码已进入 HUB，build／typecheck、555 项测试、26 规则实际源码扫描及格式门通过，纯值接口已释放。下列初稿「未建包／无源码／未开始」是设计接受时基线，实际证据待逐项保全和登记；不据本地门通过声称 runner 的落盘、资格或回放已经完成，也不替代用户最终总体接受。

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-1～S-29、S-36～S-40 的形状、合法组合表、推出规则与表示层面，以及 S-41 执行环境句柄的**形状**（解析归 runner）。**不兑现**：S-30～S-35（每件的结论必留、记录形状落日志、不可用与报错两分、不合法结论按报错处置、跨过等待只带已落日志的东西）——归派发器与写拓展件的人。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、两张合法组合表怎样驱动判定       | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（含当前有限测试绑定） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

## 2026-09-27 LC4 提供者候选

[v4-design.md](v4-design.md) 接续已存在的 LC3 纯包，规划根4与显式 `/v3` 纯面，以及独立的 `/schema/v3` 冻结资源。它只承载作者输入/输出表示、纯值判断及单条记录约束，完整批次和落盘控制留给 runner；旧 design.md 与原接受/运行记录保留。

- **语义接受**：data.loop-extension/v4 已由 [D-073](../../../../record/decisions/model-current-input-contracts-adoption/decision.md) 技术接受；本提供者候选尚未接受。
- **可实施范围**：候选映射详见新稿；现源码仍为 LC3，已显式钉 MP2/MS3 来维持旧语义，尚未提供根4与 `/v3` 双面。AE/MR 旧消费者须显式采用 LC3，ArrivalEvents 的 LC2 枚举复用须对齐，不自动升级。
- **绑定与证据**：原 LC3 绑定 1 条保留，LC4 新增 0 条；[LV4-1～LV4-6](verification.md#lc4-提供者候选证据义务) 均待实际实施/组合证据。
- **实际验证**：本稿没有新增 LC4 实现结果；旧 581 项及候选规格检查各属原范围，不能推成新版提供者已验证。

## 2026-09-27 本轮技术采用

[D-074](../../../../record/decisions/model-read-provider-adoption/decision.md)采用本轮增量设计；精确输入哈希另记，候选历史读数保留原字节。实际源码、符合性与组合证据另核，旧绑定不重标。

## 2026-09-28 LC6 直接迁移候选

[v6-design.md](v6-design.md) 接续当前实际 LC4 根实现，目标统一 LC6 根与 Schema，删除旧 LC3 运行实现；现行精确契约仍引用的 LC3/LC2 及传递 Schema 资源仅按其依赖用途保留。本段是新候选，不改旧采用及证据字节。

- **语义接受**：LC5 已由 [D099](../../../../record/decisions/model-input-limit-consumer-contract-adoption/decision.md) 接受；LC6/MP5/MS6 后继尚待主线释放及登记，LC6 尚未接受。
- **可实施范围**：纯值层、完整重试结论、调用关联和现有消费者直接迁移的候选映射已列出；后继精确输入与 provider 采用未闭合前不作为施工授权。不增加 Cordis 服务、runner 或工具执行。
- **绑定证据**：原 LC3 绑定 1 条不动，本候选新增 0 条；LV6-1～LV6-7 全部待验。
- **实际验证**：本次只起草实现映射，未修改或验证 LC6 源码。旧 581 项不得重标；同会话完整历史及真实落盘仍为 runtime/runner 的外部义务。

## 2026-09-28 纯主体判断增补采用

[D-106追加](../../../../record/decisions/runner-current-pure-provider-adoption/decision.md)技术采用[v7纯主体增补](v7-subject-judgment-design.md)精确SHA 53573d393e7fa61afdeb7d6d5abe3aaac93e2703626ced3214fda3835e7fd3a5。只释放两个公共纯判断及共享私有流水线的施工，LC6与Schema不变，S-14外部责任不迁移。原完整输入入口不降低前提；源码/制品/SV-1～6尚待，新增绑定0，不提升完整runner服务状态。

## 2026-10-03 固定Schema技术采用

[D-116](../../../../record/decisions/fixed-schema-precompile/README.md)与[本节点固定图装配](fixed-schema-precompile-design.md)补充现行设计。只改变固定图编译/装载时机；本机制实施、实际绑定与验证未完成，原契约和历史run的状态不据此改写。

## 2026-10-03 D-116 主体实施与有限验收

本节点固定图已实施构建期生成与首次实际消费时的同步原生装载。全部定义、公开结果/errors、构建失败清理、恢复、新鲜性及制品消费的实际范围见[主体原始运行与有限签收](../../../../record/evidence/2026-10-03-tests-fixed-schema-main/README.md)。本段取代上文 D-116 补充中关于固定图实施/验证尚待的状态；原契约、其他能力与历史运行的边界不变。
