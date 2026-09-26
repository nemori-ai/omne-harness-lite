# model-profile-directory

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.model-profile-directory · v1`（[契约](../../../../spec/capabilities/model-profile-directory/v1/contract.md)，状态 `accepted`、已冻结）。插件边界与服务键取自 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 接受的 model 拆分 A/A/A 的[装配草图](../../../../record/proposals/capability-split-model/design.md#装配草图与切分理由)（P-1、P-1r）；取值问法单列一个服务键是本节点的细化，理由在 [design.md](design.md#三个服务键取值问法单列)
- 源码位置：`packages/model/model-profile-directory`——尚未建包。第二层 `model` 由 D-039 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是五个判定纯函数（`scopeChain`、`winningRow`、`manifestDisposition`、`configEligibility`、`credentialSlot`，候选名；档案形状与表示层校验在纯模块 `core/model-profile`）；**Cordis 服务面**是 P-1 与 P-1r——目录本身是有状态的权威，只以服务面存在，路由名唯一、清单单调、秘密只在取值问法里出现只在这一层成立（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：一个包、两个插件。**P-1**（中心侧，候选插件名 `model-profile-directory`）拥有档案行、凭据绑定与官方清单的装入状态，provide `modelCatalog`（候选），兑现契约十个操作；`loadManifest` 不上任何服务面，只在插件体里对装配交来的发布清单调一次。`serveBaseFaces: true` 时 P-1 按配置另 provide 据点侧的两个服务键——**只供尚无节点的开发装配**，中心与产品装配都不开（D-040 §八 M65）。**P-1r**（据点侧，候选插件名 `model-catalog-read`）是同两个服务键的另一个提供者：`modelCatalogRead`（读、列、「有没有」）与 `credentialLookup`（只有取值问法），后端是治理中心入口的客户端加只读副本；租户那一把凭据的据点副本经凭据保管方 `credentialCustodian` 落地（加密、按登录状态归属），取值先读本地副本、中心可达时刷新（D-040 §八 M47，改判 M44 的「P-1r 不持久凭据」）——保管方据点一侧接口已定（`capability.credential-custodian` v1）、中心可达性观察面接口已定（`capability.center-connection` v1），**但向中心发请求在入口 v2、未起草，P-1r 受阻**。中心侧由 [tenancy-host](../../../apps/tenancy-host/README.md) 装配，据点侧由 [cli](../../../apps/cli/README.md) 装配。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-041 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：P-1 声称兑现 S-5～S-12（存储事实与贯穿规矩）、S-14～S-20 与 S-31～S-33（十个操作）、S-21（通知）、S-22 左列、S-23，逐条落点见 [design.md](design.md#操作落点)。**尚未建包，没有任何实现。**阻断两处（[缺口](design.md#实施缺口与消费者影响)）：凭据保管方**据点一侧接口已定、真承接者未到**（最小提供者节点 `credential-custodian-local` 已立、本版只进验收装配；产品装配里据点离线如实收成 `credentialUnavailable`，P-2 记 `undispatched{credential_unavailable}`，M47），**中心一侧本版不收**（保管方 G-7），取值问法在中心恒 `unavailable`（MPD-N1）；P-1r 依赖的入口 v2（向中心发请求，center-connection G-1）与据点副本的新鲜度上界都未定义（契约 G-7；MPD-N2），据点侧读面整体受阻。静态检查加「`readReplica` 只许 P-1r 调」（MPD-N4）。G-19 按 D-043 R-4 闭合：`A` 由本节点读面直接给，不加操作。2026-09-25 修订波处置见 [verification](verification.md#修订波2026-09-25-公开面)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **空表**——契约 S-24 不选用形式工件，没有登记的 formal task 可绑；证据形式是规范场景 S-25～S-30 与一条静态检查，都没有实现可跑，登记在 [verification.md](verification.md#证据义务)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 两个插件、三个服务键、清单怎样只由发布装入、存储要求、事件边界、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空）与[验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
