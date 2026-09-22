# D-023：接受租户领域的设计链——五份契约 v1、能力拆分、六个 provider 节点的设计与投影 v1

- **当前状态：已接受，四类对象，范围止于设计。**
  **不包括**任何实现、任何装配、任何验证结论、Cordis 采用版本、`tenancy` 这个限界上下文名，
  以及各契约「已知缺口」表里仍开着的产品问题。
- **来源提案**：[`proposals/tenant-capability-split`](../../proposals/tenant-capability-split/README.md)
  （五份边界怎么切；[三票独立评审全投维持](../../proposals/tenant-capability-split/review.md)）与
  [`proposals/identity-values-v1`](../../proposals/identity-values-v1/README.md)
  （共用数据契约三份竞标的合并；[合并件四轮 spec-reviewer 评审第四轮 0 阻断](../../proposals/identity-values-v1/review.md)）。
- **需求与方法前提**：[PF-001 rev 15](../../../product/PF-001-identity-scope-and-agent-constraints/README.md)（`status: active`）；
  [PF-003 rev 4 §6.14](../../../product/PF-003-asset-transfer-and-sharing/design.md) 的邀约过期一句；
  [SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant) 与
  [SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 按字面读法；
  `harness-design-handbook` 主线 A→G 走完，F 反向核对未发现契约要改的项。
  [`covers.json`](../../../registry/README.md#covers) 登记的 PF-001／002／003／015 → 契约覆盖全部 `reviewed: false`，**本决定不改变这一点**。
- **实际接受依据**：**2026-09-22 的设计会话中，产品负责人（`panqiwei`）裁定：
  「租户领域这块的全部 harness design 都翻为正式接受」。**
  接受对象的精确修订：主检出 `main` 提交 `a6e490a`（`spec/` 与两份提案最后改于 `677d910`，六个节点 `affa4af`，投影 `c61f333`）；
  契约的 18 项版本资源逐文件 SHA-256 登记在 [`registry/frozen.json`](../../../registry/README.md)，
  本包 [`acceptance.json`](acceptance.json) 是 catalog `acceptance` 字段指向的机器声明。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| **① 五份契约 v1**：[`data.identity-values`](../../../spec/data/identity-values/README.md)、[`data.offer-expiry`](../../../spec/data/offer-expiry/README.md)、[`capability.account-identity`](../../../spec/capabilities/account-identity/README.md)、[`capability.organization-governance`](../../../spec/capabilities/organization-governance/README.md)、[`composition.account-registration`](../../../spec/compositions/account-registration/README.md) | **接受**：四轮 spec-reviewer 评审阻断 29→16→9→0；architecture-reviewer 对五份作为语义整体的批次评审 2 阻断 3 非阻断当日闭合；[形式工件两轮执行](../../evidence/2026-09-22-formal-tenant-domain-2/README.md)四个登记任务无反例、否定配置按预期出反例 | 每份 v1 的**全部条款**（`acceptance.json` 逐坐标写明范围）；**含各自「已知缺口」表**（[iv 十](../../../spec/data/identity-values/v1/contract.md#十已知缺口)、[oe 八](../../../spec/data/offer-expiry/v1/contract.md#八已知缺口)、[ai 九](../../../spec/capabilities/account-identity/v1/contract.md#九已知缺口)、[og 十一](../../../spec/capabilities/organization-governance/v1/contract.md#十一已知缺口)、[ar 九](../../../spec/compositions/account-registration/v1/contract.md#九已知缺口)）——**接受的是这些缺口以显式缺口存在并各有 owner，不是替它们填值**。catalog 五条翻 `accepted`，18 项资源冻结 | 规范场景一条未演练；formal 入口列的 11 个变异核对与 2 个有效性核对未登记；Alloy 四条命令因 `alloy exec` 退出码与断言无关未登记为任务；四处措辞与现行节点设计对不上（见下节「已知张力」），**改动须发布 v2** |
| **② 能力拆分：维持五份（候选 A）＋ 两处修正** | **接受**：三票独立评审全投 A、反证互不重复；两处修正（当前租户身份「归一不搬家」落 [og S-14](../../../spec/capabilities/organization-governance/v1/contract.md#s-14-当前租户身份是登录状态上的一项选择) 第 5 条；改写「换认证重启治理」两处）已落回 spec 并随①一起被评审 | 五份契约之间的**语义边界**与 catalog 登记的依赖方向 | 候选 C（个人组织随账号生灭）与「再切治理侧」保留为候选，[翻盘条件在 alternatives](../../proposals/tenant-capability-split/alternatives.md#推荐与仍待区分的事项)；翻盘要走新决定 |
| **③ 共用数据契约三份竞标的合并** | **接受**：合并件即①里的 `data.identity-values` v1，[择优规则](../../proposals/identity-values-v1/alternatives.md#择优规则合并成一份的依据)随包保留 | 合并结果；三份原件作为来源保留在提案包 | 三份原件本身未被独立评审——**接受的是合并件，不是任何一份原件** |
| **④ 六个 provider 节点的设计**：[`core/identity-values`](../../../realization/packages/core/identity-values/README.md)、[`core/offer-expiry`](../../../realization/packages/core/offer-expiry/README.md)、[`tenancy/account-identity`](../../../realization/packages/tenancy/account-identity/README.md)、[`tenancy/credential-verification`](../../../realization/packages/tenancy/credential-verification/README.md)、[`tenancy/organization-governance`](../../../realization/packages/tenancy/organization-governance/README.md)、[`tenancy/account-registration`](../../../realization/packages/tenancy/account-registration/README.md) | **接受为各契约的实现路径**：architecture-reviewer 六节点评审 1 阻断 9 非阻断，全部成立并当日闭合；阻断项换了机制（「已过留存期限」= 账号行上首次观测落盘的 `expiredAt` + 组织行对账号行的引用约束，[理由在 account-identity 设计](../../../realization/packages/tenancy/account-identity/design.md#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)） | 每个节点 `design.md` 里的**插件边界、服务面、依赖方向、对存储提供者的要求清单、装卸配对、配置错误政策（缺密钥即启动失败）、交接凭证走签名、S-15 归 account-identity 且 `credentials` 作可选依赖、四个插件不加进程内锁**；`bindings.yaml` 现有绑定 | 节点状态**仍是 `candidate`**——源码尚未建包，`implemented`／`assembled` 无从谈起；三条共用待核对主张（可选 inject 语义、`ctx.provide` 纳管、插件体抛出后的 fiber 状态）probe 仍为 null；清扫提供者因缺枚举读面本版建不起来（[ar G-6](../../../spec/compositions/account-registration/v1/contract.md#九已知缺口)）；`tenancy` 名未拍板；Cordis 采用版本无决定 |
| **⑤ [PF-001 投影 v1](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md)** | **接受为实施入口**：八节自包含，[未决项](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)以显式 Q-n 存在，[实施顺序](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#8-实施顺序)九步各带完成判据 | v1 这一版本；其 `provenance.json` 里契约来源的 sha256 自本决定起填冻结值 | 需求与实现映射来源（产品正文、节点 design／bindings）**不在冻结集合**，实施前仍要核坐标；18 项 Q-n 一项都没因本决定闭合 |

## 理由与保留前提

**为什么现在接受**：这一程走完了 handbook 的全部七步，评审已经收敛——
表达层四轮 spec-reviewer 归零，选择层 architecture-reviewer 两轮（批次 + 六节点）阻断当日闭合，
基座级的拆分选择走了独立三票投票，形式工件跑了两轮且当前模型的结论以第二轮为准。
继续停在 `candidate` 不会再产生新的证据；实施要从已接受的规格出发，接受是实施的前提。

**保留前提：**

- **PF-001 rev 15 是被接受契约的需求基线。**PF-001 再升 rev 而带来语义变化时，
  [已发布规格不可原地覆盖](../../../spec/README.md#路径即身份)——
  评审期间「直接落在 v1 上」的做法**自本决定起终止**，改动发布 v2；
  `baseline.json` 的 `version_policy` 已是 `evolving`，允许新增版本。
- **单机部署的字面读法**：五份契约「装配给 vs 协议须给」各表左列的保证在本决定范围内由装配兑现；
  分布式演化时右列须由协议重新兑现，那是新版本的事。
- **Cordis 手册基线 4.0.2**：节点设计引用的内核行为按 basis 条目与手册基线核对；
  采用版本的决定落地后，bindings 与四条 probe 为 null 的 basis 条目要重核。
- **存储提供者满足各节点的要求清单**（原子、唯一约束、锁定读、引用约束、快照一致、持久、不可用可识别）；
  哪个具体存储归装配，不在本决定内。

**已知张力（接受时如实带着，不静默选边）：**

- 契约文本四处与现行节点设计对不上，**四处都是措辞、不改任何失败集合或次序**，
  逐条列在[投影 v1 的 Q-18](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)：
  [ar S-34](../../../spec/compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)「崩溃后回来 ⇒ 认回、重建个人组织」与
  [ai S-13](../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)「认回须未过期」；
  [ar S-25](../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 第 1 行「③ 读到 ② 提交后的事实」；
  [ai S-30](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) 第 7 行左列；
  [ai S-4](../../../spec/capabilities/account-identity/v1/contract.md#s-4-账号记录)「AccountId 由存储生成」；
  [iv 六](../../../spec/data/identity-values/v1/contract.md#六装配给与协议给) S-35 左格。
  **实施按现行节点设计；措辞修订进 v2。**
- [ai S-39](../../../spec/capabilities/account-identity/v1/contract.md#s-39-unactivated_retention)「此后的判定」与节点「此后产生的记录」两种读法：
  节点在产生时定死 `retentionDeadline`，两种读法当前都可实施，**契约措辞待 v2 收口**。
- `PF-003/README.md` 的 `depends-on` 仍钉 PF-001 rev 11，待产品侧复核；不影响本决定的对象。

## 取代与影响

**不取代任何决定。**[D-022](../cli-tui-delivery-form/decision.md) 写的「不表示接受任何契约」
是那条决定 2026-09-22 当时的范围声明；契约的接受**由本决定发生**，D-022 原文不改写。

| 受影响拥有者/消费者 | 应更新的引用、契约、地图或映射 | 所需产物/责任与闭合条件 |
|---|---|---|
| [registry](../../../registry/README.md) | `catalog.json` 五条 `status: accepted`、`acceptance` 指向本包；`frozen.json` 登记 18 项资源 | **已随本决定完成。**此后 v1 目录任何字节变化都会被检查器报「frozen file changed」 |
| 五个 spec 包的 `README.md` | 状态行改「已接受、已冻结」，指向本决定 | **已完成。**`verification.md` 在版本外，仍可变 |
| [`proposals/tenant-capability-split`](../../proposals/tenant-capability-split/README.md)、[`proposals/identity-values-v1`](../../proposals/identity-values-v1/README.md) | 状态行从「未接受」改为指向本决定 | **已完成** |
| 六个 provider 节点的 `README.md` | 「语义接受范围」从「无」改为所兑现契约的全部条款；「对象与设计修订」记本决定 | **已完成。**「可实施」「绑定与证据」「实际验证」三层**不变** |
| [投影 v1](../../../product/PF-001-identity-scope-and-agent-constraints/projection/README.md) | `provenance.json` 契约来源填冻结哈希、状态 `accepted`；目录 README 的状态句 | **已完成。**需求与节点来源仍未冻结，每次据它实施前先核坐标 |
| 实施派发（developer 角色） | 以投影 v1 为入口；实际验证证据登记到 `record/evidence/`、绑定加进各节点 `bindings.yaml` | **未闭合。**源码尚未建包；第一次真实派发之后节点才可能进入 `implemented` |
| 产品设计（PF-001 owner） | Q-n 里归产品的未决项（会话级层身份、成本计量口径、个人 context 内容、隶属请求宿主、清扫节奏等） | **未闭合。**闭合方式是升 PF-001 rev，再发布契约 v2 |
| record/decisions | Cordis 采用版本、`tenancy` 名各需一条决定 | **未闭合** |

**本决定不使后几项自动完成。**接受了设计，不等于：
包已建立、任何测试跑过、任何规范场景演练过、任何变异核对登记过、存储已选定、应用已装配。

### 这条决定明确**不表示**

1. **不表示实现存在或符合。**六个节点的源码位置一个都还没建包；`implemented` 要等具名提供者在固定源码修订上拿出相称的符合性证据。
2. **不表示任何东西被验证过。**两轮形式工件「无反例」的覆盖范围写在两份 formal 入口里；规范场景、变异核对、真并发演练一项都没做。
3. **不表示各契约「已知缺口」与投影的 18 项 Q-n 已闭合。**它们被接受为**显式缺口**，各有 owner；实施到那里要么按缺口写的兜底走，要么停下来等裁决。
4. **不表示 Cordis 采用版本已定、`tenancy` 名已拍板、存储已选定。**
5. **不表示 `covers.json` 的需求覆盖已复核**，全部仍是 `reviewed: false`。
6. **不表示 D-022 提案里的技术选型被接受**——那是另一条线。

返回[本 topic 入口](README.md)。
