# Entry v2 形式映射与未闭合范围

本版将入口暂定分类、事务终结、预期身份比较分成三个有限模型；没有把三者组合为一个端到端精化证明。

| 模型 | 对应条款与检查 | 前提与未覆盖 |
|---|---|---|
| [EntryDecision](EntryDecision.tla) / [正配置](EntryDecision.cfg)及Validity_*负控 | S8/10/11/12/13/14/18/19/33，版本→信封→认人→载荷→授权→领域的分类顺序、不可用/拒绝/缺陷分流 | 四类路由、一个请求；decision是临时分类。invalidated是时效/准备间隙的抽象输入，不表示共同事务中其他写者可提交。WF(Pipeline)只保证EventuallyClassified；不证明发送、业务完成、G优先或SQL隔离 |
| [EntryCommit](EntryCommit.tla) / [正配置](commit-valid.cfg)、两项commit-bad负控 | S49：最终时间不可用不提交、通知只在已确认提交后释放；含实际已提交但回执未知分支 | 原子commit是前提，stageActivity是布尔抽象，不能证明有效必touch或失效不复活；无进展/排空证明 |
| [ExpectedTenant](ExpectedTenant.tla) / [正配置](valid.cfg)、两项bad负控 | S51：真实checked/effect/expected推导AppliedExpected、CheckedSameCommit | 两个租户，一个业务及一个外部切换；保护是抽象守卫，未证明成员授权、ABA或SQL |

三个模型均关闭终点死锁检查；不存在“全部性质已由形式化证明”的声明。AI3的LoginCommit/CredentialRevision提供独立登录/代际有限检查，S52最终G优先与实际路径仍需SQL验证。Schema检查具体逐路由值，不证明行为。

实际运行见EntryCommit/EntryDecision证据及ExpectedTenant证据。EntryDecision范围独立复核及组合/运输/生命周期映射未全部就绪，entry2仍候选。
