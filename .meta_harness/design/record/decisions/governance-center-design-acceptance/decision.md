# D-028：接受治理中心交付面的设计链——入口契约 v1、账号能力 v2、能力边界选择与六个节点的设计

- **当前状态：已接受，四类对象，范围止于设计。**
  **不包括**任何实现、任何验证结论、传输绑定与防冒充手段（入口契约 G-10／G-11）、升级整体性的契约家（G-12），
  以及各契约「已知缺口」表里仍开着的产品与架构问题。
- **来源提案**：[`proposals/governance-center-entry`](../../proposals/governance-center-entry/README.md)
  （入口层落在哪：四个实质候选，推荐 A——入口层作为治理中心内不 provide 的独立 fiber、运维面同包另一 fiber；
  [两次 architecture-reviewer 评审](../../proposals/governance-center-entry/review.md)：第一次一项阻断当日闭合，第二次无阻断）。
- **需求与方法前提**：[PF-017 rev 2](../../../product/PF-017-governance-center-as-deployable-application/README.md)（`status: active`；rev 1 于 2026-09-23 接受，rev 2 同日落三条裁决 INT-016～INT-018）；
  [PF-001 rev 16](../../../product/PF-001-identity-scope-and-agent-constraints/README.md)；[PF-016 rev 3](../../../product/PF-016-cli-tui-delivery-surface/README.md)；
  [SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 单机字面读法；
  `harness-design-handbook` 主线 A→G 走完；F 反向核对的结论写进入口契约 S-36 与账号能力 v2 S-30 的「装配给／协议给」表。
  spec-reviewer 三轮（第二轮起无阻断，第三轮定向复评无阻断），应修全部采纳。
  [`covers.json`](../../../registry/README.md#covers) 登记的 PF-016／PF-017 → 入口契约、PF-001／PF-017 → 账号能力 v2 全部 `reviewed: false`，**本决定不改变这一点**。
- **实际接受依据**：**2026-09-23 的设计会话中，产品负责人（`panqiwei`）裁定：「入口契约、账号能力、能力设计点都接受」**，
  并对四件待定项作出选择（见下表「四件待定项」）。
  接受对象的精确修订：HUB 分支 `panqiwei/tenancy-leg-2` 的落地提交（本决定与 registry 翻转在同一提交）；
  两份契约的版本资源逐文件 SHA-256 登记在 [`registry/frozen.json`](../../../registry/README.md)，
  本包 [`acceptance.json`](acceptance.json) 是 catalog `acceptance` 字段指向的机器声明。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| **① 入口契约 [`composition.governance-center-entry` v1](../../../spec/compositions/governance-center-entry/README.md)** | **接受**：客户端 ↔ 治理中心这条边的判定次序、四种入口答复、身份推导与补授权、公开体检与运维面、中心标识；封闭路由表 27 条及其线上形状（Schema、样例）；TLA+ 判定模型正配置无反例、九个否定配置按预期给反例 | S-1～S-48 全部条款，含「已知缺口」表 G-1～G-12 作为显式缺口（G-1／5／6／9 已闭合） | **G-10 传输绑定、G-11 防冒充手段**：owner 入口层节点，实施前闭合（产品负责人裁「缺口开着先接受」）；G-2／3／4／7／8 归产品与架构；G-12 归架构主线。规范场景 S-38～S-46 一条未演练 |
| **② 账号能力 [`capability.account-identity` v2](../../../spec/capabilities/account-identity/README.md)** | **接受**：出示物与 LoginStateId 分离（INT-011 按业界做法）；S-44 按出示物换取身份；S-15 返回出示物；LoginStateId 按来源读、只对进程内开放 | S-1～S-47 全部条款 | 到期与刷新是产品未决项，不在本版；v1 消费者（注册组合、治理契约）不自动升级；OG v1 S-42 措辞收口归 OG 下一版 |
| **③ 能力边界选择：入口层作为独立 fiber（候选 A）** | **接受**：四候选反证互不重复；已知弱点（投影层持有中心标识、静态守卫、inject 八条任一换代关门）如实带着 | 提案 [design](../../proposals/governance-center-entry/design.md) 的推荐与 [改票条件](../../proposals/governance-center-entry/alternatives.md#推荐与改票条件) | 传输分歧（cli 提案 D11 bearer 头 vs 入口信封在体）在 G-10 冻结时定 |
| **④ 六个 realization 节点的设计**：[`tenancy/governance-center-entry`](../../../realization/packages/tenancy/governance-center-entry/README.md)（新立）、[`apps/tenancy-host`](../../../realization/apps/tenancy-host/README.md)（两步开闸、升级守卫对象、占位行、运维约定）、[`apps/cli`](../../../realization/apps/cli/README.md)（两条边改指对端）、[`tenancy/account-identity`](../../../realization/packages/tenancy/account-identity/README.md)（v2、凭据计算移出写事务）、[`infra/storage-sql`](../../../realization/packages/infra/storage-sql/README.md)（`createUpgradeGuard`、`upgrade` 显式、快照与恢复）、[`infra/clock`](../../../realization/packages/infra/clock/README.md)（现读墙钟、R-C2 真实窗口）；随之小修的 [`tenancy/organization-governance`](../../../realization/packages/tenancy/organization-governance/README.md)（S-36／S-37 参数收窄为品牌）与 [`tenancy/credential-verification`](../../../realization/packages/tenancy/credential-verification/README.md)（对入口 S-19 的影响） | **接受为实现路径**：两次架构评审的发现全部闭合（见提案 review.md） | 各节点 README「语义接受范围」所列条款；「可实施」「绑定与证据」「实际验证」三层**不变** | 全部源码未建或未改；U-3（pg 上升级不可撤回）、U-4／U-5（确认之后的失败支）为接受的遗留；节点自记的待核项（Cordis 原样传递 config、`node:sqlite` 在线备份等）按 source-check 取证 |

### 四件待定项，产品负责人 2026-09-23 的选择

| 待定项 | 选择 | 落点 |
|---|---|---|
| 传输绑定与防冒充手段开着，入口契约能否先接受 | **接受** | 本决定 ①；G-10／G-11 owner 入口层节点 |
| 断电或 OS 崩溃可能丢掉最后一段已提交的写（已撤销的又能用、刚铸的中心标识消失、刚登录的状态不在、空闲时约一小时的续约记录） | **现在写回产品正文**（不收紧 D-027 的持久性档位） | PF-017 rev 2 [§6.7](../../../product/PF-017-governance-center-as-deployable-application/design.md#67-重启不让任何人退出登录)、[§6.8](../../../product/PF-017-governance-center-as-deployable-application/design.md#68-停机已确认的都在没确认的等于没发生)、[§6.10](../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走)、[§6.12](../../../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)（INT-016）；入口契约 S-32 例外与 S-36「已提交事实跨 OS 崩溃」行；账号能力 v2 S-10／S-32 |
| 崩溃后重启时机器时钟落在上次租约窗口里：等到追上再起来、不按回拨报原因 | **接受这种读法** | PF-017 rev 2 §6.10（INT-017）；clock 与 tenancy-host 节点 |
| 时钟先跳快、再被校正回来：停摆与跳幅等长、重启绕不过 | **本版不给运维出口**，记为已知边界 | PF-017 rev 2 §6.10 与 §9（INT-018）；clock 节点代价表 |

## 理由与保留前提

**为什么现在接受**：这一程走完了 handbook 的全部七步；表达层三轮 spec-reviewer（后两轮无阻断），
选择层两次 architecture-reviewer（唯一阻断当日以「本表内三态占位行」闭合），形式工件在契约稿定后重跑。
继续停在 `candidate` 不会再产生新的证据；实施要从已接受的规格出发。

**保留前提：**

- **PF-017 rev 2 与 PF-001 rev 16 是两份契约的需求基线。**PF 再升 rev 带来语义变化时，已发布规格不可原地覆盖，发布新版本。
- **单机部署的字面读法**：两份契约「装配给 vs 协议须给」表左列的保证由装配兑现；分布式演化时右列须由协议重新兑现。
- **D-027 的持久性边界按 PF-017 rev 2 的写法读**：断电或 OS 崩溃可能丢掉最后一段已提交事务，是装配给的边界，本版不承诺；进程崩溃不在此列。
- **Cordis 4.0.4**（[D-025](../cordis-adoption-version/README.md)）；节点新增的假设（内核原样传递 config 对象、`node:sqlite` 在线备份接口等）须按 source-check 取证后才进 bindings。
- **存储提供者满足各节点的要求清单**（AI 的 R-8「写事务里没有凭据计算」、入口层的 R-GC1～R-GC8、tenancy-host 的 R-U1～R-U8）。

**已知张力（接受时如实带着）：**

- 账号能力 v1 与 v2 并存：注册组合与治理契约仍钉 v1，入口契约钉 v2；同一进程里由同一个提供者兑现两版的条款（v2 是 v1 的超集加两处改写）。
- 治理契约 v1 S-42 对 S-36／S-37 的豁免与 S-4「登录状态校验面即身份核实」在 v2 下只在进程内成立，措辞收口归 OG 下一版。
- 入口契约 S-19 把凭据解析规则的发布处定在凭据校验节点，换凭据方案须发入口契约新版本。

## 取代与影响

**不取代任何决定。**[D-023](../tenant-domain-design-acceptance/decision.md) 接受的五份 v1 与六节点设计仍有效；本决定在其上叠加。

| 受影响拥有者/消费者 | 应更新的引用、契约、地图或映射 | 所需产物/责任与闭合条件 |
|---|---|---|
| [registry](../../../registry/README.md) | `catalog.json` 两条 `status: accepted`、`acceptance` 指向本包；`frozen.json` 追加入口契约 v1 的 15 项资源与账号能力 v2 的 1 项 | **已随本决定完成。**此后两个版本目录任何字节变化都会被检查器报「frozen file changed」 |
| 两个 spec 包的 `README.md`、`spec/README.md` 当前状态 | 状态行改「已接受、已冻结」，指向本决定 | **已完成。**`verification.md` 在版本外，仍可变 |
| [`proposals/governance-center-entry`](../../proposals/governance-center-entry/README.md) | 状态行从「未接受」改为指向本决定 | **已完成** |
| 八个 realization 节点的 `README.md` | 「语义接受范围」记本决定 | **已完成。**「可实施」「绑定与证据」「实际验证」三层不变 |
| 投影 | PF-017 投影 v1、PF-001 投影 v2 的 `provenance.json` 填冻结哈希 | **随本程落地**（见两份投影目录） |
| 实施派发 | 以两份投影为入口；证据登记到 `record/evidence/`、绑定加进各节点 `bindings.yaml` | **未闭合。**入口层未建包；其余节点本程修订未落源码 |
| 产品设计（PF-017、PF-001 owner） | G-2／G-3／G-7 与 PF-017 §9 的未决项 | **未闭合。**闭合方式是升 rev，再发布契约新版本 |
| 架构主线 | G-12 升级整体性的契约家；G-8 多进程后的新鲜度界 | **未闭合** |
| 入口层节点 | G-10 传输绑定版本化工件、G-11 防冒充手段 | **实施前闭合** |

### 这条决定明确**不表示**

1. **不表示实现存在或符合。**入口层未建包；其余节点的本程修订（守卫对象、现读墙钟、凭据计算移出事务、参数收窄）都还没有源码。
2. **不表示任何东西被验证过。**入口契约的 TLC 结果覆盖范围写在其 formal 入口；规范场景一条未演练；节点 bindings 只绑到契约模型。
3. **不表示各契约「已知缺口」、节点 U-n／N-n 已闭合。**它们被接受为显式缺口，各有 owner。
4. **不表示传输形态已定。**信封在体与 bearer 头的分歧在 G-10 冻结时裁。
5. **不表示 `covers.json` 的需求覆盖已复核**，全部仍是 `reviewed: false`。
6. **不表示账号能力 v1 的消费者自动升到 v2。**

返回[本 topic 入口](README.md)。
