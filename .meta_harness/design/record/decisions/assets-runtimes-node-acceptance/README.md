# D-042：接受资产／工具运行时／模型请求运行时一程的 32 个新立节点与 3 处修订（**待产品负责人签字，G5**）

- **当前状态：草案，未接受。**主线（自驱授权下，2026-09-25）把本程实现映射阶段的产物整理成可签字的接受材料。签字前各节点 README「语义接受范围」一律「未接受（候选，待 D-041）」；签字后改为指向本决定，`realization/README.md` 各表的状态列同步。**本决定以 [D-041](../assets-runtimes-contract-acceptance/README.md) 先签或同签为前提**：节点是契约的实现路径，契约未接受则节点无所兑现。
- **来源**：节点起草简报（18 个节点，core 按 [D-040 §八 M41](../mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 拆成 15 个纯模块）；起草反推出的契约修订 M31～M46；五批 architecture-reviewer 独立评审（N1～N5，`tmp/assets-runtimes/nodes/review-N*.md`）与主线裁定 M47～M75、N-19～N-31；各节点 verification「独立评审」表。
- **范围定位**：只解决「这 27 处节点设计是不是有权者接受的实现路径」，接受的是**设计**（插件边界、服务键、inject 边、effect 装卸配对、存储要求、验证义务、显式缺口），不是实现：本程没有任何一个节点有源码，bindings 只绑形式证据或为空表。**不解决**：任何实现或验证；产品负责人待裁项（账本 `tmp/assets-runtimes/pending-user-rulings.md`）；下一程缺口 C-1～C-16 的闭合。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`）；**尚未签** |
| 接受记录 | 待：签字时在[决定正文](decision.md)「实际接受依据」补对话原话与日期 |
| 精确修订 | HUB 分支 `panqiwei/assets-runtimes` 节点评审收口之后的提交（起草时 `6babe6e1`；签字时以当时 HEAD 为准） |
| 接受范围 | 下表 27 处；每个节点 README「可实施范围」列的条款、「有前提地能」的前提、缺口表（作为显式缺口） |
| 保留前提 | D-041 接受 27 份契约；D-039 的拆分、领域名与装配落点；D-040 §八的裁定被追认或逐条改判；Cordis 4.0.4（D-025）；验收装配的十个替身只用于验收、真承接者随各自那一程到来 |
| 取代关系 | 不取代任何决定；`apps/cli`、`apps/tenancy-host`、`packages/tenancy/organization-governance` 三处修订不撤销 D-023／D-028／D-029 对其已实现部分的接受 |

## 接受对象

| 领域 | 节点 | 性质 | 兑现 |
|---|---|---|---|
| core | `packages/core/{content-blocks, messages, call-accounts, arrival-events, asset-model, tool-definition, loop-extension, skill-package, slash-command, mcp-endpoint, connector, model-profile, model-response}` | 新立，纯模块 ×13 | 各同名 data 契约 v1 |
| core | `packages/core/asset-evaluation`、`packages/core/stream-assembly` | 新立，纯计算 ×2 | `capability.asset-evaluation` v1、`capability.stream-assembly` v1 |
| assets | `packages/assets/asset-governance` | 新立，插件 | `capability.asset-governance` v1、`capability.asset-transfer` v1 |
| tools | `packages/tools/{tool-execution-runtime, asset-registry, mcp-bridge}` | 新立，插件 ×3 | `capability.tool-execution-runtime`、`capability.asset-registry`、`capability.mcp-bridge` v1 |
| agent-loop | `packages/agent-loop/{loop-extension-runner, hooks-import}` | 新立，插件 ×2 | `capability.loop-extension-runner`、`capability.hooks-import` v1 |
| model | `packages/model/{model-profile-directory, model-request-runtime, modality-projection}` | 新立，插件 ×3 | `capability.model-profile-directory`、`capability.model-request-runtime`、`capability.modality-projection` v1 |
| session（候选领域名，账本 ⑱） | `packages/session/{session-log-jsonl, session-tenancy-table, run-attempt-facts-derived}` | 新立，最小提供者插件 ×3（[D-043 R-1](../assets-runtimes-rulings-2026-09-25/README.md)） | `capability.session-log`、`capability.session-tenancy`、`capability.run-attempt-facts` v1（接口契约） |
| assets | `packages/assets/assembly-manifest-store` | 新立，最小提供者插件 | `capability.assembly-manifest` v1（接口契约） |
| infra | `packages/infra/{credential-custodian-local, execution-environments-host, center-connection-probe}` | 新立，最小提供者插件 ×3（center-connection 一包两插件） | `capability.credential-custodian`、`capability.execution-environments`、`capability.center-connection` v1（接口契约） |
| model | `packages/model/pi-ai-transport` | 新立，定向 fork 包（[D-043 R-5](../assets-runtimes-rulings-2026-09-25/README.md)） | `capability.model-request-runtime` v1 传输适配一层（S-38） |
| tenancy | `packages/tenancy/organization-governance` | 修订（v2 段） | `capability.organization-governance` v2 |
| apps | `apps/tenancy-host` | 修订（本程追加段） | 装配资产提供者与 P-1，OG 按 v2 采用 |
| apps | `apps/cli` | 修订 | 据点装配 core／tools／agent-loop／model 各节点与八个最小提供者／传输节点，验收装配替身缩为五件（桥、转换器、放行件、求值输入、执行环境读数种子件），缺口 C-1～C-16 |

`capability.tool-admission` v1 本程无提供者节点（tools C 子选择二），runner 以全拒件顶上——不在接受对象里，写在 `packages/tools/tool-execution-runtime` 的消费者表。

返回[决定](../README.md)。
