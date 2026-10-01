你被派来评审一个实现映射节点的提供者设计。

- **设计工作区**：`{WORKDIR}/.meta_harness`（当前目录 `{WORKDIR}` 是承载它的仓库根）。
- **待审对象**：节点 `.meta_harness/design/realization/packages/session/run-attempt-facts-derived/` 的一轮候选修订，
  四份文件 `README.md`、`design.md`、`bindings.yaml`、`verification.md`。精确快照：本检出的 HEAD。
- **它兑现的契约**：`capability.run-attempt-facts/v2`（已接受），消费 `capability.session-log/v2` 的读。
- **相关上游语义**：`.meta_harness/design/basis/cordis/` 下的条目。
- **范围**：这一个节点的设计选择——绑定的机制语义与契约语义是否重合、装载与撤除是否成对、
  装配给与协议给的拆分是否与契约一致。不审契约文本的表达。
- **状态**：这一轮修订尚未接受。
- **只读**：不写任何文件，结果在返回消息里交付。
- **本次判断：选择。**
