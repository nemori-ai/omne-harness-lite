# mcp-bridge

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿，尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.mcp-bridge · v1`（[契约](../../../../spec/capabilities/mcp-bridge/v1/contract.md)，状态 `candidate`，未接受、未冻结；设计依据 PF-002 rev 20、PF-006 rev 19）
- 源码位置：`packages/tools/mcp-bridge`——**尚未建包**。第一层 `tools` 由 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/README.md) 拍板（tools 取候选 C，MCP 桥归 `tools`）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：官方 MCP SDK 之上自写薄桥（[D-037](../../../../record/decisions/mcp-client-adoption/README.md)：协议层交 SDK、不 fork；**SDK 精确钉版尚无决定**）。**一个包、两个 Cordis 插件**：
  桥本体 `mcp-bridge`（候选名）必需 inject 存储与时钟，持有连接表、OAuth 续期与孤儿回收；
  执行者贡献 `mcp-bridge-executor`（候选名）零状态，inject 桥与工具执行运行时，只做「向执行运行时登记 MCP 那一格执行者」这一件——桥与执行运行时**互不 inject**（[capability-split-tools 草图](../../../../record/proposals/capability-split-tools/design.md#装配草图与为什么这样切)「贡献的统一形状」）。
  凭据保管方是**调用时现取的可选依赖**（契约 S-2：装配给；接口 `capability.credential-custodian` v1 已定，最小提供者节点 [`credential-custodian-local`](../../infra/credential-custodian-local/README.md) 已立）
- 公开面：**公开函数面**是 `connectEndpoint`、`projectActions`、`toToolResult`、`createMcpExecutor`（候选名），不依赖 Cordis、会话、租户或存储；**Cordis 服务面**是上面两个插件，按五元组区分连接、按持有解引用凭据、OAuth 同一提交与撤除次序只在这一层成立、函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**未接受（候选，待 D-041）**。契约仍是 `candidate`；[D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md) 是待产品负责人签字的草案，契约里的主线裁定长期落点 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/README.md) 尚未逐条追认。本节点的设计同样未被接受
- 可实施范围：本节点声称兑现的条款逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)：S-5～S-30 的全部操作、义务与装配给一列。**尚未建包、没有一行源码**。
  **受阻**：凭据保管方**接口已定、真承接者未到**（`capability.credential-custodian` v1 S-16～S-18 接住 C-1～C-3；最小提供者节点 `credential-custodian-local` 已立、本版只进验收装配，经本包 `./tx-reads` 读与锁绑定行）——在它装上之前（产品装配），凡交来凭据引用的接入点一律 `dependencyUnavailable`，OAuth 整条路走不通；装上之后 **C-4～C-6 本版不收**（保管方 G-2、G-4、G-3）：要静态凭据的接入点 `credentialUnavailable`、OAuth 令牌不续期（到期人要重取）、没有出示名；「引用还配没配着」要读据点上的配值副本，**没有 provider 节点**（缺口 B-3，归装配）；SDK 的进程组、环境合并、按请求取消、进度路由与 OAuth 钩子**全部待取证**（契约 G-6，缺口 B-1）。
  2026-09-25 随契约修复波 3 对齐（[D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：远端参数 schema 形状合法、只是编不出来的动作不再排除，以同形替换件出现、原因 `schema_unsupported`（M37）；执行运行时的 `submit` 带报告，交给本节点的接入点持有有了来路（M33，原缺口 B-6 闭合）；副本与线上消息按严格无损 JSON 读写（M36，线上那两跳待取证）。保管方与配值副本读面按 M43 本程不补——在 [verification](verification.md#覆盖缺口) 登记。
  2026-09-25 修订波（公开面，[D-043](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）：新开「公开面」一节；保管方改指接口契约条款，C-4～C-6 标本版不收，最小提供者的落处按 N-37 ⑤（密文进绑定所在的存储）；处置见 [verification](verification.md#修订波2026-09-25-公开面)。
  同日独立评审（N3）之后：保管方清扫只清三种、待生效行不清（M72，C-3 与第三条反证）；交给执行运行时的执行者包装不依赖贡献插件存活（M73）；保管方服务键定为 `credentialCustodian`（M69）；撤除次序由装配显式驱动（M71）；SDK 钉版在实施开工前出决定（B-1）。处置逐条见 [verification 的独立评审](verification.md#独立评审)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **空表**：本契约不建形式工件（[S-31](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-31-本版选用哪些形式工件)）；保管方契约的 `credential-custodian-v1-sweep` 证的是契约模型，「在绑定行上排序」是它的前提、不是它检查的东西，**不借来绑定**。S-23 的证据登记为场景：保管方 S-28 的真并发交错（verification N-2）与 S-23 ④ 两次提交之间强杀（N-18）。七条规范场景与本节点自己的交错演练**一条都没有**
- 实际验证：**尚无**。没有源码、没有测试、没有集成运行

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 两个插件各管什么、连接表为什么在一个 effect 里、OAuth 的「同一提交」落在哪个存储对象上、撤除次序、装卸配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空，理由在文件头）与 [verification](verification.md) |
| 证据义务、要取证的 SDK 能力、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
