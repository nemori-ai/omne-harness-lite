你被派来评审一份施工计划。

- **设计工作区**：`{WORKDIR}/.meta_harness`（当前目录 `{WORKDIR}` 是承载它的仓库根）。
- **待审对象**：`tmp/plan-under-review/plan.md`，修订 r1，候选。精确快照：本检出的 HEAD。
- **目标与验收边界**：见计划开头。
- **它采用的设计**：契约 `.meta_harness/design/spec/capabilities/center-connection/v2/contract.md`（已接受），
  节点 `.meta_harness/design/realization/packages/infra/center-connection-probe/` 的 `design.md` 与 `verification.md`（已接受）。
- **范围**：这一份计划。
- **只读**：不写任何文件，结果在返回消息里交付。
- **本次判断：计划。**
