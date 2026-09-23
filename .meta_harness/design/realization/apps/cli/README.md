# cli 应用节点

- kind：assembly
- 对象与设计修订：CLI 交付面的应用装配；**候选**，2026-09-22 随该交付面的产品正文建立，尚无实现修订
- 源码位置：`apps/cli`（尚未建包）
- 交付面：[PF-016 命令行交付面](../../../product/PF-016-cli-tui-delivery-surface/README.md)（rev 3）
- 契约采用与边界依据：它消费的五份租户契约里，四份 v1 已由
  [D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受（[身份清单](../../../registry/README.md)里 `accepted`），账号能力按入口契约钉的 `capability.account-identity/v2`（**`candidate`**；v1 已接受）；
  它们到据点这一侧的线上投影是 `composition.governance-center-entry/v1`（[契约](../../../spec/compositions/governance-center-entry/v1/contract.md)，**`accepted`，D-028**），
  对端是 [`apps/tenancy-host`](../tenancy-host/README.md)，入口层由 [`packages/tenancy/governance-center-entry`](../../packages/tenancy/governance-center-entry/README.md) 兑现；
  **本节点没有采用任何一份——据点一侧的客户端代理提供者尚不存在**。客户端与据点进程之间那份契约**尚未起草**。边上的保证一律指向
  [边表与交互面表](architecture.md#拓扑与进程模型)里的坐标或「待立」，
  命令与界面元素的产品含义一律指回
  [PF-016 §5.7](../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)，
  技术栈的采用一律指向[提案](../../../record/proposals/cli-tui/alternatives.md)或[决定](../../../record/decisions/README.md)。
  **本节点里出现第二份能力语义就是错。**

**这个节点现在唯一能回答的问题是「这个应用选了什么形状」**——进程、边、交互面入口、包分层、
技术栈采用与分发。别的三层（可实施、绑定、实际验证）全是缺口，逐条写在下面。

## 分层状态

四项分别陈述，**不互相补齐**。

- **语义接受范围：空。**交付面 [PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md) 的
  front-matter 已是 `status: active`（rev 3，2026-09-22 接受；另有
  [6 条未决项](../../../product/PF-016-cli-tui-delivery-surface/design.md#九未决项)归别的 topic 或技术设计）——
  **产品语义已接受**；消费的五份租户契约里四份 v1 已 `accepted`、账号能力 v2 已 `accepted`（D-028），
  它们经治理中心入口的线上投影 `composition.governance-center-entry/v1` 已 `accepted`（D-028）（对端的产品依据 PF-017 rev 2），
  客户端与据点之间的契约尚未起草——**本节点两条边上用到的线上形状没有一条已被接受。**
  owner：产品交付面归 PF-016 的 owner，契约归各自的规格 owner。
- **可实施范围：空。**`apps/cli` 与 `packages/frontend/*` **尚未建包**；
  harness 能力族的架构与规格设计**尚未开始**，因此本节点在
  [动作链表](design.md#选择与动作链)里只能写「提供者尚不存在」；
  客户端与据点进程之间的契约尚未起草，**没有任何提供者可选**；
  据点一侧的治理客户端代理要按 `composition.governance-center-entry/v1` 与它的传输绑定实现，契约已接受（D-028）、传输绑定未冻结（G-10）（那份契约的 G-10），**本节点不设计它**。
  本节点当前声称兑现的条款数为 **0**。owner：架构与规格设计，闭合条件是那几块设计做到这里。
- **绑定与证据：`bindings.yaml` 的 `bindings` 是空表。**交付面 PF 已接受，
  [按准入可以登记绑定](../../README.md#应用节点比提供者节点多什么)，**但本节点没有任何已存在、会失败的证据可指**——提供者与测试都不存在，两条边的线上投影也还是 `candidate`；
  已识别的证据义务 **11 条**全部登记在 [verification.md](verification.md)，状态一律「未开始」。
  待复核的绑定数为 0——**因为一条都还没有**，不是因为都核过了。
- **实际验证：没有任何运行。**没有跑过测试、形式任务或真实集成，
  [verification.md 的实际执行表是空的](verification.md#实际执行)；
  [提案登记的五个区分实验](../../../record/proposals/cli-tui/alternatives.md#进入实施前的最小区分实验)
  **一个都没有跑过**，所以技术栈采用表里的每一行都还是纸面结论。

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 这个应用是什么形状：进程、边、交互面、分层、技术栈、分发 | [应用形状](architecture.md) |
| 选了哪些提供者、依赖什么、资源谁拥有、装卸怎么配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml) |
| 实际跑过什么、覆盖到哪里 | [验证与证据](verification.md) |
| 这些技术选择为什么是它、还有哪些候选 | [提案](../../../record/proposals/cli-tui/README.md)——**推荐不是接受** |
| 这个交付面在产品上承诺什么 | [PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md)（rev 3） |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../spec/README.md)，采用选择回
[record/decisions](../../../record/decisions/README.md)。
