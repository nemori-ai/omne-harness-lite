# 完整迁入记录

原 `SKILL.md` 与 `references/fanout_playbook.md` 均完整迁入，原件记录见[清单](migration.json)。
Solo、HUB/spoke、共享基线、写入归属、集成检查与删除前证据保留的指导继续保留。

增加 `references/execution-context.md`，把原仓库路径、Python 环境、检查与交付制度改成
任务明确的执行仓库输入；`.worktrees` / `main` 作为采用时的示例。历史事故明确为来源经验，
不把旧产品的工具栈、政策或临时状态变成未来工作区的事实。
独立审阅后修正原生隔离工具段残留的固定容器要求，并明确 spoke 所有权本身不授予提交权限。

两端 copy 策略保留全部三份运行文件，quick_validate、自包含引用与字节一致性通过。
迁移未执行真实 worktree 创建、合并、推送或删除；后续旧入口切换及原件留档见[退役记录](../../../evaluation/host-entry-retirement/README.md)。

## 迁入之后：2026-10-02 重构成「一个会话一棵工作树」

上面第二行「HUB/spoke……的指导继续保留」到此为止。负责人 2026-10-02 定：一个会话只用一棵隔离工作树，不再有 HUB 与 spoke；
被要求走 HUB／spoke 或并行写者时明确拒绝并说明原因。`SKILL.md` 整份重写，`references/fanout_playbook.md` 删除，
新增 `references/why-one-writer.md`（拒绝时引的依据，带日期与出处）。[清单](migration.json)记的是当初迁入的原件，不随这次重构改。
依据、试派结果与说明不了什么，见[评估记录](../../../evaluation/worktree-single-session-2026-10-02.md)。
