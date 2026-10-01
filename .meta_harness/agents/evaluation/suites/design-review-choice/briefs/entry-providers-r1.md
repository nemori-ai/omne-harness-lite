你被派来评审三个实现映射节点的提供者设计。

- **设计工作区**：`{WORKDIR}/.meta_harness`（当前目录 `{WORKDIR}` 是承载它的仓库根）。
- **待审对象**（精确快照：本检出的 HEAD）：治理中心入口的落点选定之后牵连改动的三个提供者节点，
  各四份文件 `README.md`、`design.md`、`bindings.yaml`、`verification.md`：
  1. `.meta_harness/design/realization/packages/tenancy/account-identity/`：按 `capability.account-identity` v2 修订
     （登录状态出示物的生成与派生、按出示物换取身份、几个操作的参数收窄为品牌类型）。
  2. `.meta_harness/design/realization/packages/infra/storage-sql/`：承接升级的整体性
     （属主排他、迁移前只读核对、快照与确认）。
  3. `.meta_harness/design/realization/packages/infra/clock/`：每次现读墙钟，与用过的最晚时刻比对。
- **它们兑现的契约**：`capability.account-identity` v2（候选；v1 已接受）、`data.offer-expiry` v1 的时间源（已接受）；
  消费它们的是组合契约 `composition.governance-center-entry` v1（候选）与装配节点
  `.meta_harness/design/realization/apps/tenancy-host/`。
- **依据**：产品设计 PF-017 rev 1（草稿，尚未接受）；上游语义 `.meta_harness/design/basis/cordis/`；
  已定的决定 D-025（Cordis 版本）、D-026（持久化选型）、D-027（sqlite 的落盘方式），在 `.meta_harness/design/record/decisions/`。
- **范围**：每个节点的绑定与契约语义是否重合，装载与撤除是否成对，装配给与协议给的拆分是否与契约一致；
  三个节点一并送审，也看它们放在一起是否自洽。不审契约文本的表达，不判实现源码。
- **状态**：三个节点都是草稿，尚未接受。
- **只读**：不写任何文件，结果在返回消息里交付。
- **本次判断：选择。**
