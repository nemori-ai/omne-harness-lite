你被派来评审一项架构设计：治理中心入口层与运维面的落点选择，连同建立在它上面的组合契约与三个实现映射节点。

- **设计工作区**：`{WORKDIR}/.meta_harness`（当前目录 `{WORKDIR}` 是承载它的仓库根）。
- **待审对象**（精确快照：本检出的 HEAD）：
  1. 提案 `.meta_harness/design/case-inputs/governance-center-entry/` 的 `design.md` 与 `alternatives.md`：
     入口层三个落点（A 独立 fiber、B 并入装配、C 三扇门）与运维面一个替代（D 进程外命令），主线取 A，尚无接受。
  2. 建立在 A 上的组合契约 `composition.governance-center-entry` v1（候选）：
     `.meta_harness/design/spec/compositions/governance-center-entry/`。
  3. 三个实现映射节点：`.meta_harness/design/realization/packages/tenancy/governance-center-entry/`（新立）、
     `.meta_harness/design/realization/apps/tenancy-host/`、`.meta_harness/design/realization/apps/cli/`。
- **依据**：产品设计 PF-017 rev 1（草稿，尚未接受）；参与方契约 `capability.account-identity` v2（候选；v1 已接受），
  `capability.organization-governance`、`capability.account-registration`、`data.identity-values`、`data.offer-expiry` 各 v1（已接受）；
  上游语义 `.meta_harness/design/basis/cordis/`；已定的决定 D-025（Cordis 版本）与 D-027（sqlite 的落盘方式），
  技术前提由本案例所附 basis 与规格表达，不恢复历史接受事件。
- **范围**：这一组选择——落点 A 的边界能否承载契约要它兑现的性质，内核不给的保证各由谁给，
  依赖换代与撤除时责任归谁，三个节点的投影与契约语义是否重合，装配给与协议给的拆分是否与契约一致。
  不审契约文本的表达（另有一轮规格评审）；`account-identity`、`storage-sql`、`clock` 三个提供者节点另行送审，不在本次范围。
- **状态**：提案未接受，契约为候选，三个节点为草稿。
- **只读**：不写任何文件，结果在返回消息里交付。
- **本次判断：选择。**
