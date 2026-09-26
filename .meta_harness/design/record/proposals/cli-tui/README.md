# CLI-TUI 交付面：技术选型与架构框架

**选择对象**：本项目第一个[交付面](../../../ubiquitous_language/index.md)——一个面向生产分发的
CLI-TUI 应用——**用什么技术把它做出来，它的大框架长什么形状**。
具体是两组可判断的问题：十一个技术选型点（运行时、渲染层、呈现路线、终端差异、无界面输入输出、
进程模型、命令体系、分发、测试驱动、配置文件、线上协议与认证），
以及由它们合成的拓扑、分层、通信与进程模型框架。

**2026-09-22 的完整 Agent 交付面候选不新增领域概念。**它显示的每一条都指回会话日志里的一条记录条目，
它提交的每一件事都成为一条入站到达、一条卡片答复记录或一条控制指令记录——
领域语义全部来自[架构内核 PF](../../../product/architecture-core.md) 已立的对象，
本提案只回答「用什么把行画到终端上、这些进程怎么摆」。

- **当前状态：候选。**十一个选型点的推荐**一条都没有被接受**，
  [decisions](../../decisions/README.md) 里没有任何一条接受它们。
  截至本段输入日期 2026-09-22，与本提案相关而**已发生的接受有两条**，且都是它的**前提**不是结论：
  [D-022 CLI-TUI 交付形态](../../decisions/cli-tui-delivery-form/README.md)（五条产品形态与交付深度）与
  [D-019 定向 fork pi-ai](../../decisions/model-provider-pi-ai-fork/README.md)（模型传输层不在本提案重选）。
- **本次终点与范围**：把 2026-09-22 的选型草案收成一个可长期消费的信息包——
  候选比较、框架性设计、两轮独立评审与处置。
  **不包含**：契约正文（前端契约等架构与规格设计开工）、
  应用的实现形状（归 [realization 的应用节点](../../../realization/README.md)）、
  路径与里程碑（一次交付的材料，留在任务区）。
- **输入基线**：主检出 `619c109`（main，2026-09-22；工作树另有未提交改动，本设计未消费）；
  [六家 CLI/TUI 调研](../../../../research/agent-harness-cli-tui/README.md)首轮 2026-09-21；
  [四家会话设计调研](../../../../research/agent-harness-session-design/README.md)；
  架构内核 PF-000～PF-015 当前 rev（PF-000 rev 1 · PF-001 rev 12 · PF-002 rev 8 · PF-003 rev 4 ·
  PF-004 rev 8 · PF-005 rev 4 · PF-006 rev 14 · PF-007 rev 15 · PF-008 rev 4 · PF-009 rev 4 ·
  PF-010 rev 5 · PF-011 rev 4 · PF-012 rev 7 · **PF-013 rev 4 草稿** · PF-014 rev 3 ·
  **PF-015 rev 8 草稿**）；
  [跨系统约束](../../../foundation/cross-system-constraints/requirements.md)；
  三份租户契约（[account-identity](../../../spec/capabilities/account-identity/README.md)、
  [organization-governance](../../../spec/capabilities/organization-governance/README.md)、
  [account-registration](../../../spec/compositions/account-registration/README.md)）均为 `candidate`；
  [Cordis 机制条目](../../../basis/README.md)；
  [pi-ai 定向 fork 的采用决定](../../decisions/model-provider-pi-ai-fork/README.md)（模型传输层不在本提案重选）。

## 2026-09-24 治理切片增量

输入改为 PF-016 active rev6 的本期治理 CLI/TUI、PF-001 rev17、PF-017 rev3；Agent 工作会话下一期。下述 2026-09-22 的完整 Agent 框架仍是历史输入与候选，不要求本期先创建据点或 Agent 进程。本期边界、27条前身路由映射、本地状态三个实现候选及新接口缺口归 [governance-client.md](governance-client.md)。

治理运输采用前提另有已接受的 D-029 和冻结 `composition.governance-center-entry-https-json/v1`，不沿用旧草案的 Bearer 头。新增客户端语义仍为候选，不能把传输已接受外推为全部 CLI 已可实施。独立评审及局部探针见 [评审记录](review.md#治理客户端增量评审--2026-09-24)。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是。**一个交付面、十一个决定点**——这是用户 2026-09-22 的裁定（「CLI-TUI 整个一个 proposal topic」），不是把十一件事混成一件：每个决定点在 [alternatives.md](alternatives.md) 里各有自己的选择对象、必须保留的性质与同一把尺 |
| 现有能力覆盖 | 见 [design.md](design.md)。结论是**交付面不承载任何领域责任**；已立 PF 覆盖全部领域语义，未覆盖的只有「投影与受理这一层本身」 |
| 剩余责任 | 一个：**前端门面**（投影与受理的组合者）。理由与边界在 [design.md](design.md) |
| 三个实质候选 | **齐，逐点齐。**十一个决定点各有 3～5 个实质不同的候选（多数还有一条基线），均给出兑现方式、总负担、维护归属与证据；被约束或反例排除的真实路径保留排除依据 |
| 接受权限 | **本包不产生接受。**推荐、评审通过、模板齐全都不提升状态；[review.md](review.md) 记录的两轮独立评审同样不是接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现有能力怎样承载，剩余责任是什么，框架长什么形状 | [设计正文](design.md) |
| 十一个决定点各有哪些候选、推荐谁、否决谁、什么会改变选择 | [候选与取舍](alternatives.md) |
| 谁独立审过、审出什么、作者怎么处置 | [评审记录](review.md) |

## 后续消费

- **已经发生的接受**：[D-022 CLI-TUI 交付形态](../../decisions/cli-tui-delivery-form/README.md)——
  交付深度、产品形态、会话在本机、中心治理节点是独立应用、交互层包家族名 `frontend`。
  **它不接受本包的任何技术选型**。
- **等待它的下游**：
  - 前端契约（投影事件与提交）归 `spec/capabilities/`，**尚未起草**，等架构与规格设计做到那里；
  - 拓扑、进程模型、包分层、技术栈采用与分发归
    [realization 的应用节点](../../../realization/README.md)`apps/cli/architecture.md`——
    节点建立后，每个选型点在那里标 `candidate` 并**回链本包**；被接受后改为链接决定；
  - 新词条归[统一语言](../../../ubiquitous_language/index.md)，**先立词条才能进正文**。
- **2026-09-22 草案当时还没有的**：任何决定文件覆盖 D1～D11；交付面契约、绑定或执行证据。后续治理切片与运输采用按本页增量入口展开。
  [alternatives.md](alternatives.md) 末尾列出的最小区分实验 E1～E5 **一个都没跑**。

路径、里程碑、排期与派工不在本包，留在任务区。返回[提案](../README.md)。
