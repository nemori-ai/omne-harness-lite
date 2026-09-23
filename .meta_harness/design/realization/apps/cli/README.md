# cli 应用节点

- kind：assembly
- 对象与设计修订：CLI 交付面的应用装配；**候选**，2026-09-22 随该交付面的产品正文建立，尚无实现修订
- 源码位置：`apps/cli`（尚未建包）
- 交付面：[PF-016 命令行交付面](../../../product/PF-016-cli-tui-delivery-surface/README.md)（rev 4）。它新增的斜杠命令交付面规则（只认开头一条、未知命令名不发送、`/` 开头的普通文本可字面发出）待本节点的输入解析契约出现时接住
- 契约采用与边界依据：**本节点没有采用任何已接受契约。**它消费的五份租户契约在
  [身份清单](../../../registry/README.md)里全部是 `candidate`（`acceptance` 为 null）；
  客户端与据点进程之间那份契约**尚未起草**。边上的保证一律指向
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
  **产品语义已接受**；但消费的五份租户契约全部 `candidate`，
  客户端与据点之间的契约尚未起草，**没有一条契约条款可以被本节点声称为已接受。**
  owner：产品交付面归 PF-016 的 owner，契约归各自的规格 owner。
- **可实施范围：空。**`apps/cli` 与 `packages/frontend/*` **尚未建包**；
  harness 能力族的架构与规格设计**尚未开始**，因此本节点在
  [动作链表](design.md#选择与动作链)里只能写「提供者尚不存在」；
  客户端与据点进程之间的契约尚未起草，**没有任何提供者可选**。
  本节点当前声称兑现的条款数为 **0**。owner：架构与规格设计，闭合条件是那几块设计做到这里。
- **绑定与证据：`bindings.yaml` 的 `bindings` 是空表。**交付面 PF 已接受，
  [按准入可以登记绑定](../../README.md#应用节点比提供者节点多什么)，**但没有一份已接受的契约可绑**；
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
