# 成员与组织结构模型

对应 [治理行为](../../SPEC.md)，祖先链／共同祖先的纯定义归 identity-values。

| 工件 | 输入／预期 | 范围及前提 |
| --- | --- | --- |
| Membership.tla | Membership.cfg：无反例；Membership_NoSerialization.cfg：AtLeastOneSuperAdministrator 反例 | 两 actor，分别 Serialized=TRUE／FALSE；仅安全性，无公平进展，负控检查缺组织串行化的末位超管竞争 |
| Affiliation.als | aNonTrivialTree：SAT；AcceptPreservesAcyclic、PersonalOrganizationSharesNoAncestor、ShareAncestorIsSameAffiliationTree：UNSAT | 有限结构；接受前真实无环及守卫为前提，不表达 SQL、真实并发接受、授权、offer 时间或资产时刻 |

ancestorChain 不含自身，shareAncestor 比较各自含自身的链。根相等是独立写法；两者等价须 acyclic，不能省前件。树 witness 必须满足无环，不能拿环使祖先可达而冒充合法树见证。各 check/run scope 以模型末尾命令为准。

Alloy 的具名负控必须产生对应反例：

- 删除 accept 判环前置：`AcceptPreservesAcyclic` 应给出环反例。
- 将前置改为 `child not in ancestorChain[c,newParent]`：同断言应给出 `child=newParent` 的自环反例。
- 将 shareAncestor 改为两条不含自身的祖先链交集：`ShareAncestorIsSameAffiliationTree` 应给出组织与自己上级的反例。

TLC 从本目录用配对 cfg、单 worker 和工作树 tmp metadir 执行。Alloy 用每条原命令、JSON receipt 判读 SAT/UNSAT；枚举值或工具 exit 0 本身不等于检查通过。identity-values 的 solver fixture 查询见其 tests/fixtures/affiliation-alloy.ts：固定关系期望独立于实现生成，必要时从本模型追加该查询复跑。

不证明真实 last-superadmin race、直接构造自环、清除、decline、账号共同活动或资产时刻。真实义务归 [verification](../README.md)。输出留工作树 tmp。
