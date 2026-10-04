# model-profile-directory

2026-09-28：[D-100](../../../../record/decisions/model-runtime-current-generation-adoption/decision.md) 采用 [v5-current-design.md](v5-current-design.md) 的当前迁移范围；绑定不新增，实际组合验证待实施。

## v4 候选增量（2026-09-28）

新增 [v4-design.md](v4-design.md)，只投影完整输入供给与上游事实。源码包 `packages/model/model-profile-directory` **已存在**，本次读取基线 `be026d6cc430a891177035a046a4d8aa8a4530a7`；下方“尚未建包”保留为历史采用时状态，不代表当前源码。

- **语义接受：本增量无。**catalog 中 `data.model-profile/v4`、`capability.model-profile-directory/v4` 均为 candidate；[D-096](../../../../record/decisions/model-profile-input-limits-product-adoption/decision.md)仅接受 PF-013 rev 14 产品规则。
- **可实施：候选投影已列明，待主线采用及 core v4 校验交付。**沿现有类型、插件和完整 JSON 行，落实完整写读、六项时标比较、旧行不可用；不新增服务或表。存量升级资料缺口 G4-2 只阻断旧库升级，不阻断具备完整输入的新库路径。
- **绑定证据：仍为 0 条。**既有源码测试不自动证明新增条款；本次不修改空绑定表，不虚构 v4 已执行测试。
- **实际验证：v4 行为尚无。**本次设计检查与待执行真实存储验收见 [v4 验证增量](verification.md#v4-候选增量2026-09-28)。实现者还需同步包的 README 与 README_ZH，不能以设计稿代替社区用法文档。

## v3 候选增量（2026-09-27）

新增 [v3-design.md](v3-design.md) 接续本页下方的 v2 已接受基线，不改写旧 design.md；源码路径仍是 `packages/model/model-profile-directory`，**尚未建包**。本轮范围为完整适配绑定读写、同档案配置修订历史判重、真实同存储目录读面，以及独立单机验收的凭据接线；中心／据点同步仍不在本轮。

- **语义接受：契约 v3 已由主线接受，本节点仍是候选。**本轮起草输入为 candidate；随后 [D-070](../../../../record/decisions/model-adaptation-binding-acceptance/decision.md) 接受 `capability.model-profile-directory/v3` S-1～S-35 与 `data.model-profile/v3` S-1～S-31，catalog 已登记。D-070 明确不接受提供者设计；本稿不作接受或实施声明。
- **可实施：候选责任与存储要求已列出，本机凭据成功路径受阻。**三条内容写路径将档案与历史事实同提交，清单还包括序号与处置；授权顺序、十个操作和租户／组织范围保留。独立评审发现 credentialPresent＋readReplica 不辨实际引用，本候选撤回该成功路径，改为受限绑定读取与 CCL 来源引用匹配，等待 CCL 新增量及共同存储要求闭合。见 [G3-1～G3-7](v3-design.md#归装配及缺口)，不以候选文档授权开包。
- **绑定证据：0 条。**既有绑定也为空；新事实没有已存在的目录实现测试，不将 Schema 检查、其他节点生命周期模型或旧存储套件提升为本节点证据。
- **技术投影的许可与失败：候选已明确。**可信 bootstrap 构造／传递 reader，CCL/P-1r 执行；逐 symbol 限制及 P-1r 失败映射见 [v3 设计](v3-design.md)。参与读取的异常必须先使共同 atomic 失败，再在外层转换，不能在 unit 内吞掉。
- **实际验证：尚无目录实现验证。**本次文档检查结果及真实存储、授权、故障、重启的验收义务见 [v3 验证增量](verification.md#v3-候选增量2026-09-27)。

## v2 已接受基线

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.model-profile-directory · v2`（[契约](../../../../spec/capabilities/model-profile-directory/v2/contract.md)，状态 `accepted`、已冻结）。插件边界与服务键取自 [D-059](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 接受的 model 拆分 A/A/A 的[装配草图](../../../../record/proposals/capability-split-model/design.md#装配草图与切分理由)（P-1、P-1r）；取值问法单列一个服务键是本节点的细化，理由在 [design.md](design.md#三个服务键取值问法单列)
- 源码位置：`packages/model/model-profile-directory`——尚未建包。第二层 `model` 由 D-059 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是五个判定纯函数（`scopeChain`、`winningRow`、`manifestDisposition`、`configEligibility`、`credentialSlot`，候选名；档案形状与表示层校验在纯模块 `core/model-profile`）；**Cordis 服务面**是 P-1 与 P-1r——目录本身是有状态的权威，只以服务面存在，路由名唯一、清单单调、秘密只在取值问法里出现只在这一层成立（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：一个包、两个插件。**P-1**（中心侧，候选插件名 `model-profile-directory`）拥有档案行、凭据绑定与官方清单的装入状态，provide `modelCatalog`（候选），兑现契约十个操作；`loadManifest` 不上任何服务面，只在插件体里对装配交来的发布清单调一次。`serveBaseFaces: true` 时 P-1 按配置另 provide 据点侧的两个服务键——**只供尚无节点的开发装配**，中心与产品装配都不开（D-060 §八 M65）。**P-1r**（据点侧，候选插件名 `model-catalog-read`）是同两个服务键的另一个提供者：`modelCatalogRead`（读、列、「有没有」）与 `credentialLookup`（只有取值问法），后端是治理中心入口的客户端加只读副本；租户那一把凭据的据点副本经凭据保管方 `credentialCustodian` 落地（加密、按登录状态归属），取值先读本地副本、中心可达时刷新（D-060 §八 M47，改判 M44 的「P-1r 不持久凭据」）——保管方据点一侧接口已定（`capability.credential-custodian` v2）、中心可达性观察面接口已定（`capability.center-connection` v2），**但向中心发请求在未来资产/据点入口（版本未分配）、未起草，P-1r 受阻**。中心侧由 [tenancy-host](../../../apps/tenancy-host/README.md) 装配，据点侧由 [cli](../../../apps/cli/README.md) 装配。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：P-1 声称兑现 S-5～S-12（存储事实与贯穿规矩）、S-14～S-20 与 S-31～S-33（十个操作）、S-21（通知）、S-22 左列、S-23，逐条落点见 [design.md](design.md#操作落点)。**尚未建包，没有任何实现。**阻断两处（[缺口](design.md#实施缺口与消费者影响)）：凭据保管方**据点一侧接口已定、真承接者未到**（最小提供者节点 `credential-custodian-local` 已立、本版只进验收装配；产品装配里据点离线如实收成 `credentialUnavailable`，P-2 记 `undispatched{credential_unavailable}`，M47），**中心一侧本版不收**（保管方 G-7），取值问法在中心恒 `unavailable`（MPD-N1）；P-1r 依赖的未来资产/据点入口（版本未分配）（向中心发请求，center-connection G-1）与据点副本的新鲜度上界都未定义（契约 G-7；MPD-N2），据点侧读面整体受阻。静态检查加「`readReplica` 只许 P-1r 调」（MPD-N4）。G-19 按 D-063 R-4 闭合：`A` 由本节点读面直接给，不加操作。2026-09-25 修订波处置见 [verification](verification.md#修订波2026-09-25-公开面)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **空表**——契约 S-24 不选用形式工件，没有登记的 formal task 可绑；证据形式是规范场景 S-25～S-30 与一条静态检查，都没有实现可跑，登记在 [verification.md](verification.md#证据义务)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 两个插件、三个服务键、清单怎样只由发布装入、存储要求、事件边界、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空）与[验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

## 2026-09-27 模型来源投影采用

[D-075](../../../../record/decisions/model-credential-source-projection/decision.md)技术采用上述精确来源关联与失败/权限投影。旧候选字节和验证范围保留；真实源码及负控待执行，完整 CCL/MCP/OAuth 仍无本事件交付声明。

2026-09-28：[D-098](../../../../record/decisions/model-input-limit-provider-adoption/decision.md)完成独立架构复评后的分段技术采用；精确范围见决定。MP4 已由 D-097 接受，其余消费者已由 D-099 接受；起草状态文字保留，实施和验证仍须单独交付。
