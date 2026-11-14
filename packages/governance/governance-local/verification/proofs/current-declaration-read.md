# 当前注册声明的独立读取

令 S 为当前 scope 记录，e 为请求代次，d 为精确定义引用，C 为贡献关系。当前注册可用谓词为 S 开放、S.epoch=e，且 C 中存在同 scope/e/definitionKey(d) 的 active 贡献。读取还要求完整正文引用等于 d，并满足正文大小预算。查询使用同一 SQL 事务快照。

独立 definition-projection 直接返回该谓词下的观察。target-projection 共用此观察，runtime 时额外要求同一代次的 selected target；management 不添加 runtime 条件。因此拆分没有放宽原 runtime 选择条件，也没有要求独立声明存在 Settings target。

在贡献撤下已提交之后开始的新事务不再满足 active 谓词；关闭或新代次使 scope 谓词失败。与修改并发的读取按 SQL 事务顺序观察其中一个合法状态。旧读取结果不保证随后写入仍合法，写入组合必须在自身事务中重新取得并消费绑定事实。

这段论证以原发布准入、唯一 Governance 写者、SQL 事务语义和关系约束为前提。它不证明真实发布者当前可执行、持有合法、外部来源缺席或动作获得许可。注册与撤下的用例验证行为，共享 SQL 查询计划的守护验证索引使用。
