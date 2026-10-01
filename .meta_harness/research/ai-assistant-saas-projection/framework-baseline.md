# 框架承诺基线（2026-09-30）

基线 `2a04c2322a7b679133654acc3c4241effaade4be`；分支 `pandazki/frontend-upstream-sync-20260930`。工作区已核对。只读当前设计；未实施、未提交、未运行产品测试。

本报告服务外部 AI 助理 SaaS 投影。FC 编号只是报告定位符。早期 1 万注册用户是外部产品规模输入，没有被写成框架容量承诺。设计未实现不等于不可行；按当前已承诺行为做组合，额外策略与外围设施需单列。

## 必须保留的版本与承诺边界

- SYS-KERNEL 2026-09-28 已改为仅 Cordis 官方包、自研 Agent Loop；旧 DSH agent 和其他 DSH fork 安排已被取代。Cordis采用记录D-025为4.0.4。旧CLI和hooks映射中的采用前提需后续复核。
- SYS-LLM：harness所有模型请求经OpenRouter。SYS-DEPLOY：第一版完整单机，未来可分布式不改变领域语义；PF020多地实例是产品形态，不代表分布式实现已交付。
- registry的catalog实际64坐标均accepted（README一览表仍写63，末段D-069已记64，属于导航局部不一致），但这不是64项实现完成。D-066行政迁移保留旧接受事实；OG3不是OG2超集，不能按最大版本自动升级消费者。旧谱系/退休设计不能复活作当前依据。
- PF015当前rev20；D-074仅精确接受rev13。最新Session/Run宿主、句柄、重装配及归档规则来源于产品decisions，旧MRR v2等冻结契约须后续演进。
- Connector当前明确整体搁置（PF002 rev31、PF015 rev20）；data.connector/v2的旧接受不能恢复其当前交付承诺。
- Engram只占位，不是M01长期记忆的既有实现承诺。日程/通知可承接跨时间工作，完整长期目标或关注监测产品尚未定义。
- D-073接受PF021 rev8产品，D-074接受PF020 rev21产品，均没有因此产生协议、提供者或运行验证。

## 当前实现与证据范围

Core阶段221/221义务已技术签收（含6项仅NonConnector部分），90外部义务与Connector16项未签；最终适用检查6534通过，不能据此声称完整runtime或全仓make绿灯。治理制品限定证据为1926通过/34跳过与47项独立制品旅程；完整Agent工作会话、Web/Desktop、实际公司部署和整机灾备均不在该范围。每个数字仅属于所引历史输入，本次未重跑。

JSON同时保存50个realization节点的原始状态摘录、实际包存在观察、当前状态摘要和证据路径，避免把README历史“未建包”当现状，也避免以源码目录取代证明。

## 能力定位表

| 定位 | 能力 | 当前产品/技术状态 |
|---|---|---|
| FC-01 | 内核、完全动态与开放框架 | current-product-commitment；kernel-basis已有4.0.4有限probe及源码；完整动态Agent装配还需现行PF对应规格演进。 |
| FC-02 | 身份、租户与组织治理 | current-product-commitment；已有治理纵线与限定跨OS证据；OG3时刻和资产依赖未实现。 |
| FC-03 | 账号注册、登录及凭据 | current-product-commitment；治理实现包含v2基线及AI3已实施的有界登录/代次/改密/共同参与增量；account-identity节点的“v3局部实现与实跑”和verification的AI3局部验证为当前依据。限定包内与治理整装证据不能把旧bindings自动升级成AI3全部条款证明；保留既有测试范围与全仓历史失败限制。 |
| FC-04 | 资产、设置、权限与范围求值 | current-product-commitment；core纯模块已限定签收；治理、注册表、装配清单最小提供者未建包，工作区增量需规格演进。 |
| FC-05 | 资产复制、分享和回收 | current-product-commitment；已接受契约和节点设计，无资产纵线真实实现。 |
| FC-06 | Agent定义、装配与重装配 | current-product-commitment；窄口接口及节点已接受、未建包；2026-09-29产品变化待相应新规格。 |
| FC-07 | 工具、技能与调用执行 | current-product-commitment；core定义和Skill3已签收；执行runtime、Skills运行时与放行完整提供者未交付。 |
| FC-08 | MCP接入与外部服务凭据 | current-product-commitment；MCP数据纯模块有core阶段证据；桥及保管方未建包，OAuth/静态凭据若干接口仍待承接。 |
| FC-09 | 连接件：当前明确搁置 | explicitly-deferred-product；历史契约/节点已接受，Connector16项延期且未建包；当前产品状态是搁置，不能自行恢复设计。 |
| FC-10 | 执行环境与沙箱 | current-product-commitment；窄口契约与宿主最小节点设计接受，无包无运行证据；宿主允许已产品裁决但读面接线仍缺。 |
| FC-11 | 行动入口与多Agent协作 | current-product-commitment；产品规则明确；完整meta工具及多Agent/会话运行时没有本次可用实现证据。 |
| FC-12 | HITL、确认卡片与显式授权 | current-product-commitment；产品承诺及放行窄口契约存在，完整会话授权/HITL提供者无对应交付证据。 |
| FC-13 | 持久会话、归档和运行模式 | current-product-commitment；窄口读取/日志已设计，无会话聚合完整实现；最新运行时归属、归档及模式规则待规格承接。 |
| FC-14 | Agent Loop、Run与独立执行接续 | current-product-commitment；完整Loop/Run契约和消费者尚未交付；已接受的是若干窄口及调用runtime旧版语义，不代表当前产品全覆盖。 |
| FC-15 | 输入受理、排队和控制 | current-product-commitment；slash-command纯模块有core证据；受理与队列完整契约/运行时仍未交付。 |
| FC-16 | 模型档案、调用、切换与重试 | current-product-commitment；档案/响应数据模块已验证；目录、请求runtime和pi-ai传输未建包，D-019比较门未过。 |
| FC-17 | 多模态消息、流与输出 | current-product-commitment；core块/消息/流算法已限定验证；模态投影提供者、真实端到端输送无实现。 |
| FC-18 | 上下文组装、压缩和持久投影 | current-product-commitment；消息数据纯模块已交付；完整上下文组装/压缩闭包与runtime接线没有对应已交付证明。 |
| FC-19 | Loop拓展件与hooks兼容 | current-product-commitment；拓展件数据纯模块有core证据；派发器和兼容层未建包，工作目录与变量白名单来路未接。 |
| FC-20 | 工作区、资源与持续成果 | current-product-commitment；D-074接受PF020 rev21产品；工作区身份/关系/Git托管/同步协议和提供者未交付。 |
| FC-21 | 跨时间日程与长期工作的基础 | current-product-commitment；D-073接受rev8产品含24命令90场景；未执行产品运行测试，尚无技术契约或实现节点。 |
| FC-22 | 主动通知与目标租户送达 | current-product-commitment；产品已接受；通知协议、渠道实现、送达证据无对应交付。 |
| FC-23 | 日历计算与数据供应 | current-product-commitment；D-073产品接受；无对应技术契约、节点、运行验收。 |
| FC-24 | 知识结构与长期记忆边界 | placeholder-not-delivery-commitment；仅占位；契约、节点、实现与验证均为空。 |
| FC-25 | 长期待机、主动推进与关注边界 | current-product-commitment；已有产品目标及原子能力设计，整体主动助理组合与关注策略属于外部产品选择；本调查不反写harness。 |
| FC-26 | 据点、节点与未来分布式边界 | current-product-commitment；治理中心与CLI限定跨OS/网络旅程有证据；完整据点、Agent工作会话、跨节点工作区未实现。 |
| FC-27 | CLI/TUI交付 | current-product-commitment；限定治理CLI/TUI、归档分发及真实跨OS/PTY证据已完成，保留环境限制。 |
| FC-28 | 治理中心、部署与运维 | current-product-commitment；治理与Docker R5/健康修补有限技术接受；公司实际部署、整机灾备仍需环境证据。 |
| FC-29 | 持久事实、恢复和审计 | current-product-commitment；core账目结构及治理局部恢复已有证据；会话日志/执行接续提供者未交付，最新宿主规则待规格演进。 |
| FC-30 | 可观测性与成本 | current-product-commitment；数据账目纯模块已交付；全局运行观测系统及外部SaaS计费需要各自工程承接。 |
| FC-31 | Web与Desktop交付预留 | reserved-not-designed；无PF正文、契约、节点、实现与验证；治理CLI/TUI可供已定义业务协议参考。 |

## FC-01 · 内核、完全动态与开放框架

只采用Cordis官方包，自研Agent Loop；定义/装配/活体分离，核心闭包及内部构件可独立取用，运行时只是消费者。

- PF-004 rev 20：[6.9 Agent runtime 组成与装配输入矩阵](../../design/product/PF-004-agent-definition-and-assembly/design.md)；[6.10 重装配触发与生效矩阵](../../design/product/PF-004-agent-definition-and-assembly/design.md)；[6.11 撤销、卸载与不可用的产品原则](../../design/product/PF-004-agent-definition-and-assembly/design.md)；[6.12 消费关系与生命周期依赖](../../design/product/PF-004-agent-definition-and-assembly/design.md)
- [SYS-KERNEL](../../design/foundation/cross-system-constraints/requirements.md)
- [SYS-OPEN](../../design/foundation/cross-system-constraints/requirements.md)
- [SYS-COMPOSITION：定义、装配与活体](../../design/foundation/definition-and-runtime-composition/requirements.md)
- 正式决定：[D-025](../../design/record/decisions/cordis-adoption-version/decision.md)

契约：空：未找到本能力对应的当前正式契约。

节点：`packages/core/kernel-basis`

kernel-basis已有4.0.4有限probe及源码；完整动态Agent装配还需现行PF对应规格演进。

明确边界：
- 不采用DSH agent；旧DSH fork与跨进程原语采用前提已被2026-09-28 SYS-KERNEL取代。
- Cordis不自动兑现租户安全、持久化、可靠投递、外部效果回滚。

## FC-02 · 身份、租户与组织治理

自然人账号和租户成员关系分层；组织、角色和当前身份决定范围，跨租户默认拒绝。

- PF-001 rev 24：[账号](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md)；[组织](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md)；[租户](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md)；[6.4 隔离](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md)
- [SYS-TENANT](../../design/foundation/cross-system-constraints/requirements.md)
- 正式决定：[D-023](../../design/record/decisions/tenant-domain-design-acceptance/decision.md)；[D-042](../../design/record/decisions/governance-participation-provider/decision.md)；[D-066](../../design/record/decisions/pr9-pr10-coordinate-reconciliation/decision.md)

契约：`data.identity-values/v1`（accepted）、`capability.organization-governance/v1`（accepted）、`capability.organization-governance/v2`（accepted）、`capability.organization-governance/v3`（accepted）

节点：`packages/core/identity-values`、`packages/tenancy/organization-governance`

已有治理纵线与限定跨OS证据；OG3时刻和资产依赖未实现。

明确边界：
- 一万注册用户是外部SaaS假设，框架材料没有一万用户容量或吞吐保证。
- OG3不是OG2超集；资产隔离等跨域另一半不能由已完成治理包代证。

## FC-03 · 账号注册、登录及凭据

账号生命周期、登录状态、凭据更换和个人组织创建有独立治理契约。

- PF-001 rev 24：[账号](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md)；[登录状态](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md)；[主动更换凭据](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md)；[个人组织](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md)
- 正式决定：[D-040](../../design/record/decisions/governance-identity-offer-contracts/decision.md)；[D-043](../../design/record/decisions/registration-bounded-provider/decision.md)

契约：`capability.account-identity/v1`（accepted）、`capability.account-identity/v2`（accepted）、`capability.account-identity/v3`（accepted）、`composition.account-registration/v2`（accepted）、`data.offer-expiry/v2`（accepted）

节点：`packages/tenancy/account-identity`、`packages/tenancy/credential-verification`、`packages/tenancy/account-registration`

治理实现包含v2基线及AI3已实施的有界登录/代次/改密/共同参与增量；account-identity节点的“v3局部实现与实跑”和verification的AI3局部验证为当前依据。限定包内与治理整装证据不能把旧bindings自动升级成AI3全部条款证明；保留既有测试范围与全仓历史失败限制。

明确边界：
- 登录不等于所有租户授权；凭据值不进交付面。
- 不由此推导外部SaaS的SSO、支付账号或多因素产品。

## FC-04 · 资产、设置、权限与范围求值

资产携带设置与权限，按持有、来源、组合、工作区与会话分层求值；运行中数据、执行实现、承载服务分别变化。

- PF-002 rev 31：[5.2 设置与权限是资产的两种属性](../../design/product/PF-002-assets-settings-and-permissions/design.md)；[5.6 四步：资产求值 → 组装 → 投影 → 层级计算](../../design/product/PF-002-assets-settings-and-permissions/design.md)；[5.7 工作区那一级，不参与权限计算](../../design/product/PF-002-assets-settings-and-permissions/design.md)；[5.8 三条层序，各答一个问题](../../design/product/PF-002-assets-settings-and-permissions/design.md)；[6.5 资产数据、执行实现与承载服务分别变化](../../design/product/PF-002-assets-settings-and-permissions/design.md)
- 正式决定：[D-061](../../design/record/decisions/assets-runtimes-contract-acceptance/decision.md)；[D-062](../../design/record/decisions/assets-runtimes-node-acceptance/decision.md)

契约：`data.asset-model/v3`（accepted）、`capability.asset-evaluation/v3`（accepted）、`capability.asset-governance/v2`（accepted）、`capability.asset-registry/v2`（accepted）、`capability.assembly-manifest/v2`（accepted）

节点：`packages/core/asset-model`、`packages/core/asset-evaluation`、`packages/assets/asset-governance`、`packages/tools/asset-registry`、`packages/assets/assembly-manifest-store`

core纯模块已限定签收；治理、注册表、装配清单最小提供者未建包，工作区增量需规格演进。

明确边界：
- core纯求值不是资产发布/装载运行时；新工作区来源与会话动态规则未自动进冻结v2。
- 组织/工作区资产不自动带来成员私人凭据。

## FC-05 · 资产复制、分享和回收

同一自然人的租户身份间复制；分享授予获权而非拥有，组织隶属树限制流向，撤销与过期保留明确语义。

- PF-003 rev 6：[6.1 一条不变量：团队资产不出那棵树](../../design/product/PF-003-asset-transfer-and-sharing/design.md)；[6.3 复制的通则：同一自然人的两个租户身份](../../design/product/PF-003-asset-transfer-and-sharing/design.md)；[6.7 覆盖的范围：内容覆盖，配置不动](../../design/product/PF-003-asset-transfer-and-sharing/design.md)；[6.10 分享：给的是获权，不是拥有](../../design/product/PF-003-asset-transfer-and-sharing/design.md)；[6.12 关系解除之后](../../design/product/PF-003-asset-transfer-and-sharing/design.md)；[6.13 分享不可传递](../../design/product/PF-003-asset-transfer-and-sharing/design.md)；[6.14 待确认的复制通知与分享邀请会过期](../../design/product/PF-003-asset-transfer-and-sharing/design.md)
- 正式决定：[D-061](../../design/record/decisions/assets-runtimes-contract-acceptance/decision.md)；[D-062](../../design/record/decisions/assets-runtimes-node-acceptance/decision.md)

契约：`capability.asset-transfer/v2`（accepted）、`capability.asset-governance/v2`（accepted）、`data.offer-expiry/v2`（accepted）

节点：`packages/assets/asset-governance`

已接受契约和节点设计，无资产纵线真实实现。

明确边界：
- 分享不可传递，不等于复制或转移所有权；撤权不等于撤销已发生效果。

## FC-06 · Agent定义、装配与重装配

AgentDefinition与会话持有的定义身份、当前实际装配清单、运行实例分开；显式reload安全交接，已发起调用保留原输入。

- PF-004 rev 20：[6.1 不变式](../../design/product/PF-004-agent-definition-and-assembly/design.md)；[6.7 装配清单的生与失效](../../design/product/PF-004-agent-definition-and-assembly/design.md)；[6.9 Agent runtime 组成与装配输入矩阵](../../design/product/PF-004-agent-definition-and-assembly/design.md)；[6.10 重装配触发与生效矩阵](../../design/product/PF-004-agent-definition-and-assembly/design.md)；[6.12 消费关系与生命周期依赖](../../design/product/PF-004-agent-definition-and-assembly/design.md)
- PF-012 rev 21：[6.18 Agent runtime 的装配与重装配交接](../../design/product/PF-012-agent-loop-and-run/design.md)

契约：`capability.assembly-manifest/v2`（accepted）、`capability.asset-registry/v2`（accepted）

节点：`packages/assets/assembly-manifest-store`、`packages/tools/asset-registry`

窄口接口及节点已接受、未建包；2026-09-29产品变化待相应新规格。

明确边界：
- 普通恢复不是直接读取最新来源；资产数据变化不必替换服务。
- 最新产品装配矩阵不因旧AM/REG accepted而成为已实现。

## FC-07 · 工具、技能与调用执行

工具定义、一次执行和执行runtime寿命分开；工具可后台执行、显式中断、产物卸载，技能可携资源；真实执行按采用实现版本绑定。

- PF-006 rev 23：[5.1 三层正交](../../design/product/PF-006-tools-and-skills/design.md)；[5.2 「工具」这个词指三样东西，寿命各不相同](../../design/product/PF-006-tools-and-skills/design.md)；[5.3 一份工具定义长什么样](../../design/product/PF-006-tools-and-skills/design.md)；[6.5 工具执行有自己的运行时，绑定在 session 上](../../design/product/PF-006-tools-and-skills/design.md)；[6.6 前台/后台 与 等待态，是两个维度](../../design/product/PF-006-tools-and-skills/design.md)；[6.10 结果太大时卸载，而卸载是第三个维度](../../design/product/PF-006-tools-and-skills/design.md)；[6.12 工具执行的运行时可以被单独控制，而它停了就不重来](../../design/product/PF-006-tools-and-skills/design.md)；[6.14 定义与实现更新的调用边界](../../design/product/PF-006-tools-and-skills/design.md)
- 正式决定：[D-032](../../design/record/decisions/tool-execution-runtime-baseline/decision.md)；[D-069](../../design/record/decisions/skill-yaml-key-resolution/decision.md)

契约：`data.tool-definition/v3`（accepted）、`data.skill-package/v3`（accepted）、`capability.tool-execution-runtime/v2`（accepted）、`data.call-accounts/v2`（accepted）、`capability.tool-admission/v2`（accepted）

节点：`packages/core/tool-definition`、`packages/core/skill-package`、`packages/core/call-accounts`、`packages/tools/tool-execution-runtime`

core定义和Skill3已签收；执行runtime、Skills运行时与放行完整提供者未交付。

明确边界：
- Skill纯读取/验证不等于脚本执行或权限。
- 已停止的工具执行不自动重来，已发生外部效果不可当作回滚。
- 所选工具资产版本→执行代码仍有受阻消费登记。

## FC-08 · MCP接入与外部服务凭据

MCP动作投影成工具；接入点持有、租户凭据、桥连接和工具执行分别负责。

- PF-002 rev 31：[MCP](../../design/product/PF-002-assets-settings-and-permissions/design.md)
- PF-006 rev 23：[6.13 MCP 接入点带来的动作](../../design/product/PF-006-tools-and-skills/design.md)
- 正式决定：[D-037](../../design/record/decisions/mcp-client-adoption/decision.md)

契约：`data.mcp-endpoint/v2`（accepted）、`capability.mcp-bridge/v2`（accepted）、`capability.credential-custodian/v2`（accepted）

节点：`packages/core/mcp-endpoint`、`packages/tools/mcp-bridge`、`packages/infra/credential-custodian-local`

MCP数据纯模块有core阶段证据；桥及保管方未建包，OAuth/静态凭据若干接口仍待承接。

明确边界：
- MCP不是连接件事件订阅的替代承诺；不承诺任意第三方SaaS已完成集成。
- 组织不统一持有成员MCP凭据，跨租户凭据不共用。

## FC-09 · 连接件：当前明确搁置

PF-002 rev31将连接件是否继续作为资产以及订阅、投递、路由、新会话触发整体搁置；旧形状仅条件性保存。

- PF-002 rev 31：[Connector](../../design/product/PF-002-assets-settings-and-permissions/design.md)；[九、未决项](../../design/product/PF-002-assets-settings-and-permissions/design.md)
- PF-015 rev 20：[6.23 连接件创建会话的输入](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[九、未决项](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)

契约：`data.connector/v2`（accepted）

节点：`packages/core/connector`

历史契约/节点已接受，Connector16项延期且未建包；当前产品状态是搁置，不能自行恢复设计。

明确边界：
- 不把旧accepted data.connector/v2解释为当前Connector交付承诺。
- 不得把收件箱、聊天渠道或外部事件推送自动投射成框架现成连接件。

## FC-10 · 执行环境与沙箱

宿主机、会话/租户级沙箱等执行环境可选；落点不可用明确拒绝，工具各自受环境权限限制。

- PF-005 rev 8：[5.1 四种执行环境](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)；[5.2 租户级沙箱：本体的存活，与数据的存活，是两件事](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)；[6.1 宿主机始终在场，沙箱实现装配时可选装配](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)；[6.2 宿主机不提供租户隔离，因此必须被显式允许](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)；[6.3 会话级沙箱：到点销毁，数据不留存](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)；[6.4 租户级沙箱：共享的工作空间](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)；[6.9 落点不可用就是拒绝，不降级](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)；[6.10 hooks 子进程与环境变量传递](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)
- 正式决定：[D-064](../../design/record/decisions/assets-runtimes-rulings-2026-09-26/decision.md)

契约：`capability.execution-environments/v2`（accepted）

节点：`packages/infra/execution-environments-host`

窄口契约与宿主最小节点设计接受，无包无运行证据；宿主允许已产品裁决但读面接线仍缺。

明确边界：
- 宿主机本身不提供租户隔离；沙箱不是资产。
- 最小宿主进程组提供者不是完整沙箱产品或跨节点迁移。

## FC-11 · 行动入口与多Agent协作

Meta能力覆盖文件、Shell、Web、Browser、Computer、Agents、TodoItems、BkgJobs、Ask等入口；委派和消息受会话身份、授权和父子约束。

- PF-007 rev 23：[5.1 十三扇门，按作用对象分成五族](../../design/product/PF-007-meta-capabilities/design.md)；[5.2 一张总表](../../design/product/PF-007-meta-capabilities/design.md)；[5.6 一次放行判断走四步](../../design/product/PF-007-meta-capabilities/design.md)；[5.8 子不得宽于父](../../design/product/PF-007-meta-capabilities/design.md)；[6.8 `Agents()`：通向别的 agent](../../design/product/PF-007-meta-capabilities/design.md)；[6.9 `TodoItems()`：通向自己手上的待办](../../design/product/PF-007-meta-capabilities/design.md)；[6.10 `BkgJobs()`：通向自己发起的执行](../../design/product/PF-007-meta-capabilities/design.md)
- PF-015 rev 20：[5.2 会话与会话之间](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)

契约：`capability.tool-admission/v2`（accepted）

节点：空：未找到本能力对应的实现节点。

产品规则明确；完整meta工具及多Agent/会话运行时没有本次可用实现证据。

明确边界：
- 十三扇门的产品定义不表示十三个提供者已实现。
- TodoItems是条目清单，不是跨会话长期目标管理；Cordis()定义完整但本版不实现。

## FC-12 · HITL、确认卡片与显式授权

统一决策池与卡片；Ask语义授权和系统拦截有各自来路，一张卡只答一次，拒绝/不回答可辨，系统不替人作答。

- PF-008 rev 7：[5.1 三种情形，中间那一种最容易被漏掉](../../design/product/PF-008-human-in-the-loop/design.md)；[5.3 一批卡片，与「答完」是什么意思](../../design/product/PF-008-human-in-the-loop/design.md)；[6.1 永远等着，系统不替人作答](../../design/product/PF-008-human-in-the-loop/design.md)；[6.4 两个答复入口，一张卡片只能答一次](../../design/product/PF-008-human-in-the-loop/design.md)；[6.5 「不回答」是合法答复](../../design/product/PF-008-human-in-the-loop/design.md)；[6.7 租户隔离在池子上成立](../../design/product/PF-008-human-in-the-loop/design.md)；[6.9 人拒绝之后，agent 分得出那是拒绝](../../design/product/PF-008-human-in-the-loop/design.md)
- PF-007 rev 23：[6.11 `Ask()`：通向人](../../design/product/PF-007-meta-capabilities/design.md)

契约：`capability.tool-admission/v2`（accepted）

节点：空：未找到本能力对应的实现节点。

产品承诺及放行窄口契约存在，完整会话授权/HITL提供者无对应交付证据。

明确边界：
- 等待不自动等同批准；权限设置与一次/会话授权不同。
- 治理TUI已交付不代表Agent决策池与Ask的完整UI已交付。

## FC-13 · 持久会话、归档和运行模式

会话跨运行持续，租户身份创建时固定，工作区显式指定；休眠恢复保持原会话，归档保留历史；模式维度独立。最新裁决按连续空闲自动归档并保留迟到事实。

- PF-015 rev 20：[会话的生命周期](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[6.1 会话不会消失](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[6.3 归档先停活儿，再落状态](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[6.4 撤销归档只还给你状态](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[6.11 会话睡醒之后，还是原来那个](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[6.12 会话持有创建那一刻的租户身份](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[6.13 工作区在创建时显式指定，不指定就是空](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[6.15 三个模式维度独立变化](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[6.19 从函数输入确定持久化范围](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[6.21 三类 runtime 的归属与执行关联](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)；[九、未决项](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)
- 正式决定：[D-074](../../design/record/decisions/session-workspace-product-acceptance/decision.md)

契约：`capability.session-tenancy/v2`（accepted）、`capability.session-log/v2`（accepted）

节点：`packages/session/session-tenancy-table`、`packages/session/session-log-jsonl`

窄口读取/日志已设计，无会话聚合完整实现；最新运行时归属、归档及模式规则待规格承接。

明确边界：
- D-074精确接受rev13，不能写成rev20整包接受；当前rev20增量来源在产品decisions。
- 归档不抹去授权/历史，不让已结束Run因迟到结果复活；完整会话契约尚未交付。

## FC-14 · Agent Loop、Run与独立执行接续

日志为事实权威，Run是工作归因单位；一个会话最多一个未终结Run；Agent runtime只持调用句柄，Session/Run治理独立模型和工具执行，卸载句柄不自动取消执行。

- PF-012 rev 21：[5.2 会话日志是唯一的真相来源](../../design/product/PF-012-agent-loop-and-run/design.md)；[5.4 一步的骨架](../../design/product/PF-012-agent-loop-and-run/design.md)；[5.7 一次尝试：三条路通向「重新算一遍」](../../design/product/PF-012-agent-loop-and-run/design.md)；[6.13 取消跟着宿主走](../../design/product/PF-012-agent-loop-and-run/design.md)；[6.15 取消先落日志，再发信号](../../design/product/PF-012-agent-loop-and-run/design.md)；[6.17 Run 这一层的七条不变式](../../design/product/PF-012-agent-loop-and-run/design.md)；[6.18 Agent runtime 的装配与重装配交接](../../design/product/PF-012-agent-loop-and-run/design.md)
- PF-015 rev 20：[6.21 三类 runtime 的归属与执行关联](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)

契约：`capability.run-attempt-facts/v2`（accepted）、`capability.session-log/v2`（accepted）、`capability.model-request-runtime/v2`（accepted）、`capability.tool-execution-runtime/v2`（accepted）

节点：`packages/session/run-attempt-facts-derived`、`packages/session/session-log-jsonl`、`packages/model/model-request-runtime`、`packages/tools/tool-execution-runtime`

完整Loop/Run契约和消费者尚未交付；已接受的是若干窄口及调用runtime旧版语义，不代表当前产品全覆盖。

明确边界：
- 旧MRR v2和节点“模型调用挂在Agent runtime effect”需按2026-09-29产品演进；不静默当作当前最终行为。
- Run终结、尝试重建、业务取消和外部副作用回滚不同。

## FC-15 · 输入受理、排队和控制

输入先落账；来源可辨，按来源同一事件去重，队列与插队可见且不漏不重，控制指令与斜杠命令按既有含义处理。

- PF-014 rev 11：[5.1 一条入站到达从哪里来，到哪里去](../../design/product/PF-014-inbound-intake-and-queueing/design.md)；[5.4 插队：停在哪，就怎么办](../../design/product/PF-014-inbound-intake-and-queueing/design.md)；[5.5 控制指令家族](../../design/product/PF-014-inbound-intake-and-queueing/design.md)；[5.10 斜杠命令在受理时分两路走](../../design/product/PF-014-inbound-intake-and-queueing/design.md)；[6.1 先落账，再谈别的](../../design/product/PF-014-inbound-intake-and-queueing/design.md)；[6.3 去重只认来源说得出的那个「同一件事」](../../design/product/PF-014-inbound-intake-and-queueing/design.md)；[6.4 排着的东西必须看得见](../../design/product/PF-014-inbound-intake-and-queueing/design.md)；[6.5 插队是原子的](../../design/product/PF-014-inbound-intake-and-queueing/design.md)；[6.8 停机不会让一条入站到达永远悬着](../../design/product/PF-014-inbound-intake-and-queueing/design.md)；[九、未决项](../../design/product/PF-014-inbound-intake-and-queueing/design.md)

契约：`data.slash-command/v2`（accepted）、`capability.session-log/v2`（accepted）

节点：`packages/core/slash-command`、`packages/session/session-log-jsonl`

slash-command纯模块有core证据；受理与队列完整契约/运行时仍未交付。

明确边界：
- 斜杠纯解析不等于完整入站受理；Connector来源当前搁置。
- 队列产品语义没有转换为一万用户吞吐或存储无界容量保证。

## FC-16 · 模型档案、调用、切换与重试

模型档案与凭据分离；模型按请求采用，合法切换下一请求前生效；重试为可替换拓展件，错误按事实分类；框架所有模型请求经OpenRouter。

- PF-013 rev 14：[5.6 凭据挂在范围上，不挂在档案上](../../design/product/PF-013-model-profiles-and-invocation/design.md)；[5.9 换模型：一条事实，一个生效点，零个新分支](../../design/product/PF-013-model-profiles-and-invocation/design.md)；[5.10 合法目标集合与展示列表，是两件事](../../design/product/PF-013-model-profiles-and-invocation/design.md)；[5.12 重试站在一个已经存在的位置上](../../design/product/PF-013-model-profiles-and-invocation/design.md)；[5.13 模型请求的运行时可以被单独控制，而它停了看首 token](../../design/product/PF-013-model-profiles-and-invocation/design.md)；[6.5 切换是用户的直接命令，合法目标不得拒绝](../../design/product/PF-013-model-profiles-and-invocation/design.md)；[6.7 生效点：收到那条事实之后、下一次模型请求之前](../../design/product/PF-013-model-profiles-and-invocation/design.md)；[6.16 错误信息外泄之前要脱敏](../../design/product/PF-013-model-profiles-and-invocation/design.md)
- [SYS-LLM](../../design/foundation/cross-system-constraints/requirements.md)
- 正式决定：[D-019](../../design/record/decisions/model-provider-pi-ai-fork/decision.md)

契约：`data.model-profile/v2`（accepted）、`data.model-response/v3`（accepted）、`capability.model-profile-directory/v2`（accepted）、`capability.model-request-runtime/v2`（accepted）

节点：`packages/core/model-profile`、`packages/core/model-response`、`packages/model/model-profile-directory`、`packages/model/model-request-runtime`、`packages/model/pi-ai-transport`

档案/响应数据模块已验证；目录、请求runtime和pi-ai传输未建包，D-019比较门未过。

明确边界：
- 不承诺任意供应商直连；独立闭包的可取用性不取消harness的SYS-LLM。
- 旧模型宿主/取消规则需演进；不能把有限TLC或旧短请求当当前运行时成功。

## FC-17 · 多模态消息、流与输出

消息来源、块、可见性、流片段与最终消息分离；先记录再可见，未完整工具参数不执行，模态转换保留原消息和采用投影。

- PF-009 rev 9：[5.5 一条消息是分次到达的](../../design/product/PF-009-context-message-types/design.md)；[5.6 流断在半路](../../design/product/PF-009-context-message-types/design.md)；[5.9 语音：生成了不等于听到了](../../design/product/PF-009-context-message-types/design.md)；[6.6 内容是块，不在进日志时压成文本](../../design/product/PF-009-context-message-types/design.md)；[6.8 组装的结果与一次性拿到的必须相同](../../design/product/PF-009-context-message-types/design.md)；[6.9 用户看见了的，会话日志里必须有](../../design/product/PF-009-context-message-types/design.md)；[6.10 没收齐的工具调用参数，不解析、不执行](../../design/product/PF-009-context-message-types/design.md)；[6.11 每个块都带「给人看 / 给模型看」两个标注](../../design/product/PF-009-context-message-types/design.md)；[6.15 每一块自己说它是追加片段还是整体替换，系统照办](../../design/product/PF-009-context-message-types/design.md)；[9.4 设计缺口：实时双工下，没听到的不给模型看](../../design/product/PF-009-context-message-types/design.md)
- PF-013 rev 14：[5.11 有 transcript 的块，不再把任何模型挡在外面](../../design/product/PF-013-model-profiles-and-invocation/design.md)

契约：`data.content-blocks/v3`（accepted）、`data.messages/v3`（accepted）、`data.arrival-events/v2`（accepted）、`capability.stream-assembly/v3`（accepted）、`capability.modality-projection/v2`（accepted）

节点：`packages/core/content-blocks`、`packages/core/messages`、`packages/core/arrival-events`、`packages/core/stream-assembly`、`packages/model/modality-projection`

core块/消息/流算法已限定验证；模态投影提供者、真实端到端输送无实现。

明确边界：
- 纯流装配不等于端到端可靠输出；附件字节存储仍缺。
- 实时双工“未听到不给模型看”保留产品缺口，不能投射为现成实时语音产品。

## FC-18 · 上下文组装、压缩和持久投影

人读和模型读各自派生；组装只读日志，压缩保留记录，不擦除新消息或悬而未决事实；派生当前状态可持久化但不是第二权威。

- PF-010 rev 7：[5.4 组装必须满足的五条要求](../../design/product/PF-010-context-management-and-assembly/design.md)；[5.6 压缩是一个闭包，它的调子是三个联合目标](../../design/product/PF-010-context-management-and-assembly/design.md)；[5.7 压缩能做的，只有两件事](../../design/product/PF-010-context-management-and-assembly/design.md)；[5.8 压缩不能做的，有三件事](../../design/product/PF-010-context-management-and-assembly/design.md)；[6.1 组装只读日志，不写日志](../../design/product/PF-010-context-management-and-assembly/design.md)；[6.8 交回来的东西必须装得进目标模型的窗口](../../design/product/PF-010-context-management-and-assembly/design.md)；[6.12 记录里的消息一条都不能擦除](../../design/product/PF-010-context-management-and-assembly/design.md)；[6.13 上一次模型请求之后新来的消息，不许压](../../design/product/PF-010-context-management-and-assembly/design.md)；[6.14 悬着的东西不许被点名](../../design/product/PF-010-context-management-and-assembly/design.md)；[6.16 压缩之后，meta runtime context 要重新给一份完整的](../../design/product/PF-010-context-management-and-assembly/design.md)
- PF-015 rev 20：[6.19 从函数输入确定持久化范围](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)

契约：`data.messages/v3`（accepted）、`data.content-blocks/v3`（accepted）

节点：`packages/core/messages`、`packages/core/content-blocks`

消息数据纯模块已交付；完整上下文组装/压缩闭包与runtime接线没有对应已交付证明。

明确边界：
- 上下文压缩不等于长期个性化记忆；持久投影不能冒充来源事实。
- 没有承诺所有历史永远全塞进模型窗口。

## FC-19 · Loop拓展件与hooks兼容

拓展点按位置组织，可插拔可替换，干预必须留下结论；兼容hook受执行环境、权限与日志规则约束。

- PF-012 rev 21：[5.8 Loop 拓展点](../../design/product/PF-012-agent-loop-and-run/design.md)；[6.9 拓展件只能靠改日志起作用](../../design/product/PF-012-agent-loop-and-run/design.md)；[6.10 能干预的拓展件，必须留下结论](../../design/product/PF-012-agent-loop-and-run/design.md)
- PF-005 rev 8：[6.10 hooks 子进程与环境变量传递](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)

契约：`data.loop-extension/v3`（accepted）、`capability.loop-extension-runner/v2`（accepted）、`capability.hooks-import/v2`（accepted）

节点：`packages/core/loop-extension`、`packages/agent-loop/loop-extension-runner`、`packages/agent-loop/hooks-import`

拓展件数据纯模块有core证据；派发器和兼容层未建包，工作目录与变量白名单来路未接。

明确边界：
- 新SYS-KERNEL取代DSH非Cordis fork安排；旧D-033的复用方向不得继续当当前采用依据。
- 工作区兼容发现不等于导入成租户资产；新PF020规则需规格演进。

## FC-20 · 工作区、资源与持续成果

Workspace为跨会话逻辑资源聚合，实例为节点上的入口；允许共享维护、多地址多地实例。Omne Host首版仅Git，资源承载文件成果，local/remote允许异步同步。

- PF-020 rev 21：[工作区（Workspace）](../../design/product/PF-020-workspace/design.md)；[工作区实例（Workspace Instance）](../../design/product/PF-020-workspace/design.md)；[Omne Host 的首版范围](../../design/product/PF-020-workspace/design.md)；[资源操作与成果](../../design/product/PF-020-workspace/design.md)；[会话视角下的本地与 remote](../../design/product/PF-020-workspace/design.md)；[agent 自主协作与 Git 管理](../../design/product/PF-020-workspace/design.md)；[四、产品规则](../../design/product/PF-020-workspace/design.md)；[九、未决项](../../design/product/PF-020-workspace/design.md)
- [SYS-DEPLOY](../../design/foundation/cross-system-constraints/requirements.md)
- 正式决定：[D-074](../../design/record/decisions/session-workspace-product-acceptance/decision.md)

契约：空：未找到本能力对应的当前正式契约。

节点：空：未找到本能力对应的实现节点。

D-074接受PF020 rev21产品；工作区身份/关系/Git托管/同步协议和提供者未交付。

明确边界：
- 不另设成果发布/交付流程及草稿/已发布状态；不自动合并任意文件。
- GitHub、Obsidian、Office365仅说明统一抽象的开放范围，不能宣称各提供者已交付。
- 多节点产品形态不等于首版分布式平台；普通目录存在组织参与限制覆盖缺口。

## FC-21 · 跨时间日程与长期工作的基础

Schedule内含Routine，产生单次Job；支持执行、通知或两者；每次agent执行新建作业会话，以统一成果工具和完成检查承接该Job。

- PF-021 rev 8：[系统必须具备的三项能力](../../design/product/PF-021-schedule-and-calendar/design.md)；[非目标](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.1 系统、用户与 agent 的归属和管理](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.2 线性与非线性表达](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.3 机械执行与每次 agent 执行的新会话](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.4 成果工具与完成检查](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.9 完整安排的创建、更新与工具范围](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.11 日历重算与补跑](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.12 重叠处理](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.14 取消单次 Job](../../design/product/PF-021-schedule-and-calendar/design.md)
- 正式决定：[D-073](../../design/record/decisions/pf021-product-acceptance/decision.md)

契约：空：未找到本能力对应的当前正式契约。

节点：空：未找到本能力对应的实现节点。

D-073接受rev8产品含24命令90场景；未执行产品运行测试，尚无技术契约或实现节点。

明确边界：
- Schedule不是完整长期目标管理系统；跨会话目标对象尚未定义。
- 非线性是确定性复杂时间计算，不是事件DAG或结果驱动自适应规则。
- Job完成不等于整个长期目标达成；不自动重试已终止Job或构成补偿工作流。

## FC-22 · 主动通知与目标租户送达

通知能力独立于日程，系统和agent均可发送到明确目标租户，执行结果和通知结果分别记录。

- PF-021 rev 8：[通知能力](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.5 通知发送与租户送达](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.13 通知声明与完成](../../design/product/PF-021-schedule-and-calendar/design.md)
- PF-016 rev 10：[6.14 没有带外通知，所以进来就要看得见等着的事](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.16 没人开着屏，这一处照常发生事](../../design/product/PF-016-cli-tui-delivery-surface/design.md)
- 正式决定：[D-073](../../design/record/decisions/pf021-product-acceptance/decision.md)

契约：空：未找到本能力对应的当前正式契约。

节点：空：未找到本能力对应的实现节点。

产品已接受；通知协议、渠道实现、送达证据无对应交付。

明确边界：
- 没有Schedule也可通知，不等于任意邮件/短信/推送渠道已承诺集成。
- 通知发送不冒充最终送达；不从本条推出关注监测策略、用户偏好推断或主动代理产品。

## FC-23 · 日历计算与数据供应

日历独立产品应用，明确版本与覆盖，离线冷启动、持续更新、复杂日期计算与缺依据失败。

- PF-021 rev 8：[日历服务](../../design/product/PF-021-schedule-and-calendar/design.md)；[业务日历与版本](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.6 数据供应与首批范围](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.7 冷启动](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.8 热更新与可追溯性](../../design/product/PF-021-schedule-and-calendar/design.md)；[6.11 日历重算与补跑](../../design/product/PF-021-schedule-and-calendar/design.md)
- 正式决定：[D-073](../../design/record/decisions/pf021-product-acceptance/decision.md)

契约：空：未找到本能力对应的当前正式契约。

节点：空：未找到本能力对应的实现节点。

D-073产品接受；无对应技术契约、节点、运行验收。

明确边界：
- 不承诺第三方个人日历同步、会议邀请或用户编辑法定日历。
- 独立应用不等于异地部署，版本/更新规则不等于已完成数据运维。

## FC-24 · 知识结构与长期记忆边界

Engram仅声明终局meta入口将能操作知识结构；不是已经定义的记忆命令或本版实现交付要求。

- PF-007 rev 23：[6.13 `Engram()`：通向自己的知识结构（**占位声明，不作实现交付要求**）](../../design/product/PF-007-meta-capabilities/design.md)
- PF-010 rev 7：[6.12 记录里的消息一条都不能擦除](../../design/product/PF-010-context-management-and-assembly/design.md)

契约：空：未找到本能力对应的当前正式契约。

节点：空：未找到本能力对应的实现节点。

仅占位；契约、节点、实现与验证均为空。

明确边界：
- M01若指长期个人记忆，不能冒充框架已承诺实现；需外部产品自建策略/后续明确设计。
- Engram参考系统性质仅备用，不构成本版设计；没有已承诺自动记忆、检索、遗忘、个性化注入方案。

## FC-25 · 长期待机、主动推进与关注边界

框架总体目标为超长期待机、持续进化；会话、工具后台执行、日程、通知为长期协作提供原子能力。

- PF-007 rev 23：[6.9 `TodoItems()`：通向自己手上的待办](../../design/product/PF-007-meta-capabilities/design.md)；[6.10 `BkgJobs()`：通向自己发起的执行](../../design/product/PF-007-meta-capabilities/design.md)
- PF-021 rev 8：[一、背景与问题](../../design/product/PF-021-schedule-and-calendar/design.md)；[非目标](../../design/product/PF-021-schedule-and-calendar/design.md)
- [SYS-LONG-RUNNING：超长期待机、稳定运行与持续进化](../../design/foundation/long-running-and-evolving/requirements.md)

契约：空：未找到本能力对应的当前正式契约。

节点：空：未找到本能力对应的实现节点。

已有产品目标及原子能力设计，整体主动助理组合与关注策略属于外部产品选择；本调查不反写harness。

明确边界：
- 未找到独立关注对象/持续监测/个人长期目标管理的现行完整产品承诺。
- 不能把长期待机目标解释为已实现主动性策略、无限自治或全天候生产SLA。

## FC-26 · 据点、节点与未来分布式边界

中心管治理，据点承载工作，交付面可关闭而工作继续；第一版完整单机，设计保留未来分布式/异构/微服务边界。

- PF-016 rev 10：[5.1 三处地方，各自拥有什么](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[5.6 哪些东西在中心一侧，哪些在据点一侧](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.8 关掉屏不会让任何东西丢掉](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.16 没人开着屏，这一处照常发生事](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.17 治理中心不可达，已经开着的会话照常干活](../../design/product/PF-016-cli-tui-delivery-surface/design.md)
- PF-020 rev 21：[工作区实例（Workspace Instance）](../../design/product/PF-020-workspace/design.md)；[会话视角下的本地与 remote](../../design/product/PF-020-workspace/design.md)；[四、产品规则](../../design/product/PF-020-workspace/design.md)
- [SYS-DEPLOY](../../design/foundation/cross-system-constraints/requirements.md)
- [已确认要求](../../design/foundation/runtime-state-and-continuity/requirements.md)

契约：`capability.center-connection/v2`（accepted）

节点：`apps/cli`、`apps/tenancy-host`、`packages/infra/center-connection-probe`

治理中心与CLI限定跨OS/网络旅程有证据；完整据点、Agent工作会话、跨节点工作区未实现。

明确边界：
- 多个机器/节点产品位置不等于首版已经交付分布式控制面、集群调度、自动故障转移。
- 跨进程装配给保证需协议重新兑现；不能把单机SQLite验证推成异构恢复证明。

## FC-27 · CLI/TUI交付

人读与机读同一份事实，当前身份可见，秘密不进呈现，屏幕关闭不丢工作；当前实际交付范围是治理CLI/TUI。

- PF-016 rev 10：[6.1 交付面不持有任何领域事实](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.3 当前身份必须一直在场](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.5 人能做的脚本能做，脚本能做的人能做](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.6 机读那一份只承载事实](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.7 交付面永不替人作答](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.8 关掉屏不会让任何东西丢掉](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.11 秘密不进任何一份呈现](../../design/product/PF-016-cli-tui-delivery-surface/design.md)；[6.15 环境不支持的时候明说，不静默降级](../../design/product/PF-016-cli-tui-delivery-surface/design.md)
- 正式决定：[D-022](../../design/record/decisions/cli-tui-delivery-form/decision.md)；[D-051](../../design/record/decisions/governance-tui-entry-adoption/decision.md)

契约：`capability.client-local-state/v1`（accepted）、`composition.governance-client-operations/v2`（accepted）、`composition.governance-cli-entry/v2`（accepted）

节点：`apps/cli`、`packages/frontend/client-local-state`、`packages/frontend/governance-client-operations`、`packages/frontend/governance-center-client`

限定治理CLI/TUI、归档分发及真实跨OS/PTY证据已完成，保留环境限制。

明确边界：
- 已交付治理TUI不是完整Agent会话UI；只验证限定xterm/iTerm profile。
- 没有交互密码输入；Web/Desktop不在治理制品验收中。

## FC-28 · 治理中心、部署与运维

可部署治理中心独立于运维者身份；启动整体成功、持久登录、版本识别、备份和隔离恢复有限定采用。

- PF-017 rev 6：[5.1 中心有两张面，没有第三张](../../design/product/PF-017-governance-center-as-deployable-application/design.md)；[6.6 要么整个起来，要么不起来](../../design/product/PF-017-governance-center-as-deployable-application/design.md)；[6.7 重启不让任何人退出登录](../../design/product/PF-017-governance-center-as-deployable-application/design.md)；[6.8 停机：已确认的保留，未确认的核实](../../design/product/PF-017-governance-center-as-deployable-application/design.md)；[6.9 升级：同一个中心，要么整体成，要么整体不成](../../design/product/PF-017-governance-center-as-deployable-application/design.md)；[6.13 运维者没有任何一扇门通向账号能做的事](../../design/product/PF-017-governance-center-as-deployable-application/design.md)；[6.18 备份与恢复的交付目标](../../design/product/PF-017-governance-center-as-deployable-application/design.md)
- 正式决定：[D-055](../../design/record/decisions/governance-online-maintenance-adoption/decision.md)；[D-067](../../design/record/decisions/governance-docker-deployment-adoption/decision.md)；[D-071](../../design/record/decisions/governance-docker-stop-adoption/decision.md)；[D-072](../../design/record/decisions/governance-docker-health-binding/decision.md)

契约：`composition.governance-center-entry/v3`（accepted）、`composition.governance-center-entry-https-json/v3`（accepted）

节点：`apps/tenancy-host`、`packages/tenancy/governance-center-entry`、`packages/infra/storage-sql`、`packages/infra/clock`

治理与Docker R5/健康修补有限技术接受；公司实际部署、整机灾备仍需环境证据。

明确边界：
- 当前路由未开放未来资产/模型/据点协议；运维者不因此具有业务账号权限。
- Docker单机和同机备份不保证整机/磁盘毁损灾备；不等于1w用户生产容量验证。

## FC-29 · 持久事实、恢复和审计

能干预必须留下结论，恢复依据寿命不少于被恢复对象；日志追加、尝试接续、未知外部效果和成本有可追溯语义。

- PF-000 rev 1：[6.1 K1：能干预的，必须留下结论](../../design/product/PF-000-occurrences-and-record-entries/design.md)；[6.2 K2：依据的寿命，不得短于要靠它重建的那个对象](../../design/product/PF-000-occurrences-and-record-entries/design.md)；[6.3 K3：瞬态条目不得独撑任何一条恢复路径](../../design/product/PF-000-occurrences-and-record-entries/design.md)
- PF-012 rev 21：[5.7 一次尝试：三条路通向「重新算一遍」](../../design/product/PF-012-agent-loop-and-run/design.md)；[5.14 外部效果的记录：追溯与幂等，是同一条记录上的两个字段](../../design/product/PF-012-agent-loop-and-run/design.md)；[6.1 日志先于可见](../../design/product/PF-012-agent-loop-and-run/design.md)；[6.12 终态之后再回来的东西，不让 Run 复活](../../design/product/PF-012-agent-loop-and-run/design.md)
- PF-011 rev 5：[6.3 上交必须留下条目，这条不可省](../../design/product/PF-011-off-nominal-handling/design.md)；[6.6 「不可确定」必须能表达](../../design/product/PF-011-off-nominal-handling/design.md)
- [已确认要求](../../design/foundation/runtime-state-and-continuity/requirements.md)

契约：`capability.session-log/v2`（accepted）、`capability.run-attempt-facts/v2`（accepted）、`data.call-accounts/v2`（accepted）

节点：`packages/core/call-accounts`、`packages/session/session-log-jsonl`、`packages/session/run-attempt-facts-derived`

core账目结构及治理局部恢复已有证据；会话日志/执行接续提供者未交付，最新宿主规则待规格演进。

明确边界：
- 恢复不等于回滚、补偿或把未知外部效果当成功；模型检查仅在具体前提下。
- 治理恢复证据不代表Agent日志、全局审计查询或合规留存产品完成。

## FC-30 · 可观测性与成本

系统需要解释动作因果链、身份授权、等待、资源/性能和成本，未知结果必须可辨；故障不得静默假成功。

- PF-012 rev 21：[5.13 Run 拥有什么：归属的判据](../../design/product/PF-012-agent-loop-and-run/design.md)
- PF-011 rev 5：[5.4 各层的四要素](../../design/product/PF-011-off-nominal-handling/design.md)；[6.3 上交必须留下条目，这条不可省](../../design/product/PF-011-off-nominal-handling/design.md)；[6.6 「不可确定」必须能表达](../../design/product/PF-011-off-nominal-handling/design.md)
- [已确认要求与工程含义](../../design/foundation/observability-and-logging/requirements.md)

契约：`data.call-accounts/v2`（accepted）

节点：`packages/core/call-accounts`

数据账目纯模块已交付；全局运行观测系统及外部SaaS计费需要各自工程承接。

明确边界：
- Run成本记录不是SaaS订阅、账单、预算或配额产品；当前无已确认商业计费体系。
- 不把可观测性全局要求升级为已实现全链路平台或生产SLA。

## FC-31 · Web与Desktop交付预留

当前产品索引仅预留PF-018 WebUI与PF-019 Desktop，尚未开题。


契约：空：未找到本能力对应的当前正式契约。

节点：空：未找到本能力对应的实现节点。

无PF正文、契约、节点、实现与验证；治理CLI/TUI可供已定义业务协议参考。

明确边界：
- 外部AI助理SaaS前端是外部产品交付与策略，不可写成框架已承诺的Web/Desktop完整设计或实现。

## 可复核材料

- [机器可读能力、契约、节点、来源摘要](framework-capabilities.json)
- [既有施工顺序与依赖](framework-dependencies.md)

每个引用源均在JSON的sources保存路径、SHA-256和摘要；sha表示本次观察到的字节，不额外宣称源已冻结。PF条款保存标题、行号和附近原文；registry cover的reviewed状态原样保留。
