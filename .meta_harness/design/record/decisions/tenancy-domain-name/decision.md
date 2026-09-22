# D-024：租户领域的限界上下文名 `tenancy`

- **当前状态：已接受，一个名字。**
- **来源**：[realization 两层布局规则](../../../realization/README.md#packages-的两层布局)把第二层定义为「按领域或限界上下文聚合」并把领域名标为候选；
  [D-023](../tenant-domain-design-acceptance/decision.md) 接受六个节点设计时把这个名字列为未闭合项。
- **需求与方法前提**：领域边界 = D-023 接受的五份契约边界（账号身份、组织治理、账号注册、身份值、邀约过期）；
  承载仓库 `docs/workspace.md` 的 `packages/<能力族>/<职责包>/` 两层规则。
- **实际接受依据**：2026-09-22 设计会话，产品负责人（`panqiwei`）就交接文档门槛「领域名 `tenancy` 与包布局拍板」作答：
  「tenancy 我觉得没问题啊」。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| 租户领域在 `packages/` 第二层的名字 | **接受 `tenancy`**：它直接命名[租户](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)这一族事实的归属边界，与统一语言的英文正式名同根；四个领域节点已按它落盘 | `packages/tenancy/{account-identity,credential-verification,organization-governance,account-registration}` 这一层的拼写 | 源码尚未建包；`core/` 那两个节点不受影响 |

## 理由与保留前提

名字要在第一次建包前定，否则改名就是搬目录加改所有引用；现在定，代价是零。
**前提**：领域边界不变。若将来把治理或身份再切成别的限界上下文（[拆分提案的候选 C 与「再切治理侧」仍是候选](../../proposals/tenant-capability-split/alternatives.md#推荐与仍待区分的事项)），
新边界要有自己的名字，本决定不自动延伸过去。

## 取代与影响

不取代任何决定。

| 受影响拥有者/消费者 | 应更新的引用 | 闭合条件 |
|---|---|---|
| [realization README](../../../realization/README.md) 与四个 `tenancy/` 节点的 `README.md` | 「候选名，产品负责人未拍板」改为指向本决定 | **已完成** |
| [D-023](../tenant-domain-design-acceptance/decision.md)「取代与影响」表 | `tenancy` 名一项标已闭合 | **已完成** |
| 承载仓库 `packages/tenancy/` | 第一次建包时按此路径 | 源码落地时 |

**不表示**：布局判据改变、任何契约或节点语义改变、Cordis 采用版本已定。

返回[本 topic 入口](README.md)。
