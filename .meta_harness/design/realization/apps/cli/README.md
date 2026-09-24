# cli 应用节点

- kind：assembly
- 对象与设计修订：CLI 交付面的应用装配；**候选**，2026-09-22 随该交付面的产品正文建立；2026-09-25 按资产／工具运行时／模型请求运行时一程修订——据点装配加入 `model`、`tools`、`agent-loop` 三个领域的提供者与 `core` 的两个纯模块（[D-039](../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3)：两块运行时是本应用里的东西，不另立应用；「可独立运行」是验收要求，不是装配边界）；同日按修复波 3（[D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M31～M46）与已起草的 provider 节点对齐。尚无实现修订
- 源码位置：`apps/cli`（尚未建包）
- 交付面：[PF-016 命令行交付面](../../../product/PF-016-cli-tui-delivery-surface/README.md)（rev 6）。它的斜杠命令交付面规则（只认开头一条、会话没有的命令名当场明说不发送、带声明的命令按声明解析不通过即不发送、`/` 开头的普通文本可字面发出、保留名一律在 `omne-official` 前缀下）现由 [`data.slash-command/v1`](../../../spec/data/slash-command/v1/contract.md)（**candidate**）S-12～S-24 接住，由 `packages/core/slash-command` 兑现，交付面预判与受理面再判各 import 一次；解析起点是 [D-036](../../../record/decisions/slash-command-parsing-baseline/README.md) 的自研统一解析器
- 契约采用与边界依据：它消费的五份租户契约里，四份 v1 已由
  [D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受（[身份清单](../../../registry/README.md)里 `accepted`），账号能力按入口契约钉的 `capability.account-identity/v2`（`accepted`，D-028；v1 仍有效）；
  它们到据点这一侧的线上投影是 `composition.governance-center-entry/v1`（[契约](../../../spec/compositions/governance-center-entry/v1/contract.md)，**`accepted`，D-028**），
  对端是 [`apps/tenancy-host`](../tenancy-host/README.md)，入口层由 [`packages/tenancy/governance-center-entry`](../../packages/tenancy/governance-center-entry/README.md) 兑现；
  **本节点没有采用任何一份——据点一侧的客户端代理提供者尚不存在**。客户端与据点进程之间那份契约**尚未起草**。边上的保证一律指向
  [边表与交互面表](architecture.md#拓扑与进程模型)里的坐标或「待立」，
  命令与界面元素的产品含义一律指回
  [PF-016 §5.7](../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)，
  技术栈的采用一律指向[提案](../../../record/proposals/cli-tui/alternatives.md)或[决定](../../../record/decisions/README.md)。
  **本节点里出现第二份能力语义就是错。**
  **据点一侧本程新装的**：十份能力契约 `capability.{tool-execution-runtime, asset-registry, mcp-bridge, tool-admission, loop-extension-runner, hooks-import, model-profile-directory, model-request-runtime, modality-projection, stream-assembly}/v1` 与工具侧六份数据契约，**全部 `candidate`**（接受待 [D-041](../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）；
  提供者节点（已起草、candidate、未评审；包都尚未建）是 `packages/core/{tool-definition, loop-extension, skill-package, slash-command, mcp-endpoint, connector}`（一契约一包，D-040 §八 M41）、`packages/core/stream-assembly`、`packages/model/model-profile-directory`（本装配只装据点读提供者 P-1r）、`packages/model/model-request-runtime`、`packages/model/modality-projection`、
  `packages/tools/tool-execution-runtime`、`packages/tools/asset-registry`、`packages/tools/mcp-bridge`、`packages/agent-loop/loop-extension-runner`、`packages/agent-loop/hooks-import`；插件边界与服务键以各 provider 节点为准（它们照三份被 D-039 接受的拆分提案起草），**本节点不重新设计**。
  放行判断（`capability.tool-admission/v1`）本程**没有提供者**。中心一侧的资产治理与模型档案目录由 [`apps/tenancy-host`](../tenancy-host/README.md) 装配，**据点的依赖图里不得出现 `packages/assets/asset-governance`**。

**这个节点现在能回答两个问题**：「这个应用选了什么形状」——进程、边、交互面入口、包分层、技术栈采用与分发；
「据点装配要承接哪些『装配给』、承接不了的缺在哪」——[装载清单](design.md#据点装载清单与顺序)、[装配给逐行承接](design.md#装配给逐行承接)、[归装配的事项](design.md#归装配的事项逐条承接)与[缺口](design.md#实施缺口与消费者影响)。
别的三层（可实施、绑定、实际验证）的状态逐条写在下面。

## 分层状态

四项分别陈述，**不互相补齐**。

- **语义接受范围：交付面已接受；据点本程新装的契约未接受（候选，待 D-041）。**交付面 [PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md) 的
  front-matter 是 `status: active`、rev 6（另有[未决项](../../../product/PF-016-cli-tui-delivery-surface/design.md#九未决项)归别的 topic 或技术设计）——
  **产品语义已接受**；消费的五份租户契约里四份 v1 已 `accepted`、账号能力 v2 已 `accepted`（D-028），
  它们经治理中心入口的线上投影 `composition.governance-center-entry/v1` 已 `accepted`（D-028）（对端的产品依据 PF-017 rev 2）。
  **据点本程新装的十份能力契约与工具侧六份数据契约全部 `candidate`**，接受签字留产品负责人（[D-041](../../../record/decisions/assets-runtimes-contract-acceptance/README.md)，草案未签）；它们依据的主线裁定 [D-040](../../../record/decisions/mainline-self-rulings-2026-09/README.md) 尚未逐条追认。
  客户端与据点之间的契约尚未起草，入口组合 v2 尚未立——**本节点用到的线上形状里，只有据点到中心那两条租户边的一份已被接受。**
  owner：产品交付面归 PF-016 的 owner，契约归各自的规格 owner。
- **可实施范围：声称兑现的条款 0 条；设计上承接的「装配给」行列在下面，产品据点清单今天装不起来。**`apps/cli`、`packages/frontend/*` 与本程据点的十个 provider 包**都尚未建包**。
  本节点在设计上承接的装配给行（逐行见 [design.md](design.md#装配给逐行承接)）：TER S-46 第 1、2、3、8、10、11 行；MRR S-38 第 4、9 行；MPD S-22 第 1、4、5、6 行；MP S-26 第 1～4 行；SA S-29 第 2、3 行；REG S-31 第 7、8 行；BR S-30 第 2、6、8 行；RUN S-32 第 2、9、11、12 行；HI S-26 第 2、3 行（其中 RUN 第 12 行、HI 第 2 行只承接一半）——**承接不等于条款已兑现**，它们要等提供者与本应用的源码存在。
  **受阻**：会话日志、装配清单、据点上的中心事实副本、凭据保管方、到中心的连接、执行环境、agent loop、会话持有租户读面等承接者不存在（[缺口 C-1～C-8、C-13](design.md#实施缺口与消费者影响)，D-040 §八 M43、M48：本程不补、留给下一程，owner 主线），派发器、注册表、P-1r、P-2 会停在 `PENDING`；放行判断本程无提供者，产品据点里每一批动作都被全拒（已知后果）。修复波 3 新加给 agent loop 的两样——同一份带 `attempt` 的可用性报告交给派发器与执行宿主、给 `dispatch` 的叫停——在本节点登记为「归装配／待 loop 契约」（[A-19、A-20](design.md#归装配的事项逐条承接)）；执行环境句柄的两样来路（A-21）按 M48 归会话持有租户读面（C-13，PF-015）与执行环境（C-7，PF-005）。离线调模型：凭据取值先读据点本地副本（M47），凭据保管方（C-5）缺席的本版如实 `undispatched{credential_unavailable}`。
  客户端与据点进程之间的契约尚未起草；据点一侧的治理客户端代理按 `composition.governance-center-entry/v1` 与它的传输绑定实现，**本节点不设计它**；客户端信任中心证书的规则已定在 [design.md](design.md#客户端信任中心的规则d-029)。
  owner：架构与规格设计与各缺口的 owner，闭合条件逐条在缺口表。
- **绑定与证据：`bindings.yaml` 的 `bindings` 是空表。**交付面 PF 已接受，
  [按准入可以登记绑定](../../README.md#应用节点比提供者节点多什么)，**但本节点没有任何已存在、会失败的证据可指**——提供者、本应用与测试都不存在；
  运行 [`2026-09-25-formal-assets-runtimes`](../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md) 的八个 formal task 核的是契约模型，**模型把本节点给的那几样（追加口原子、同一存储、同一时钟）建成原子动作吸收掉了**，不在装配给被违反时失败，所以不绑。
  已识别的证据义务 **32 条**全部登记在 [verification.md](verification.md)，状态一律「未开始」。
  待复核的绑定数为 0——**因为一条都还没有**，不是因为都核过了。
- **实际验证：没有任何运行。**没有跑过属于本节点的测试、形式任务或真实集成，
  [verification.md 的实际执行表是空的](verification.md#实际执行)；
  [提案登记的五个区分实验](../../../record/proposals/cli-tui/alternatives.md#进入实施前的最小区分实验)
  **一个都没有跑过**，所以技术栈采用表里 `candidate` 的每一行都还是纸面结论。

## 按当前问题展开

| 当前问题                                                 | 阅读入口                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 这个应用是什么形状：进程、边、交互面、分层、技术栈、分发 | [应用形状](architecture.md)                                                   |
| 选了哪些提供者、依赖什么、资源谁拥有、装卸怎么配对       | [实现设计](design.md)                                                         |
| 据点装什么、按什么顺序、契约「装配给」的每一行由谁给     | [装载清单](design.md#据点装载清单与顺序)、[装配给逐行承接](design.md#装配给逐行承接) |
| 「可独立运行」怎样验收                                   | [验收装配](design.md#验收装配)                                                |
| 哪条承诺由哪份证据支持、前提是什么                       | [绑定表](bindings.yaml)                                                       |
| 实际跑过什么、覆盖到哪里                                 | [验证与证据](verification.md)                                                 |
| 独立评审提了什么、怎样处置、落在哪                       | [独立评审](verification.md#独立评审)                                          |
| 这些技术选择为什么是它、还有哪些候选                     | [提案](../../../record/proposals/cli-tui/README.md)——**推荐不是接受**         |
| 这个交付面在产品上承诺什么                               | [PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md)（rev 6） |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../spec/README.md)，采用选择回
[record/decisions](../../../record/decisions/README.md)。
