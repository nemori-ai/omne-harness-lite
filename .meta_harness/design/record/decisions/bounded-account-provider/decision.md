# D-041 · 采用有界账号提供者映射

2026-09-24，主线在既定“开搞”授权内作技术采用。来源为[D040](../governance-identity-offer-contracts/decision.md)、[SQL精化](../../proposals/governance-production-mechanisms/sql-transaction-refinement.md)及[AI节点修订](../../../realization/packages/tenancy/account-identity/v3-design.md)。本决定不接受OG2/entry2候选，也不开放新版生产中心。

独立architecture-reviewer只读审查草稿hash `1815cc03e4498cdcc495e982da555dd62480eba6f2bdd98c140467fc4bbfe463`，AI领域局部实施无阻断，未执行测试。主线采用普通/显式参与两面、单次改密准备票据、G重核优先、SQLite观察共同保护、首次迁移旧登录全部撤销与后续保持时刻。不新建插件，不自动推进现有bindings或消费者。

整装门槛不可省略：entry执行层跟踪从事务外凭据准备到最终事务结束的业务Promise，host待业务静止再关依赖；运输连接关闭/排空超时不能充当业务完成。迁移AI片段由本owner追加，但host必须保留已发布全局前缀后追加，不可继续spread新AI数组插在旧OG/clock/entry前面。两项需真实旧库和在途场景测试。

局部实施验收：真实SQLite期限边界、活动提交/回滚/观察、改密竞争与一次性票据、旧迁移和重启，现有注册清除回归；实际结果另记evidence。满足局部验收不代表CLI/TUI、备份恢复、Linux全链或生产部署已完成。
