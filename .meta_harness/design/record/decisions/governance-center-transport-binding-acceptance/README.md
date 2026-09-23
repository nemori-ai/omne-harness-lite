# D-029：接受治理中心的传输绑定、防冒充落点与第一版安全基调

产品负责人 2026-09-23 把第一版定为**「自己人开发与实验迭代用」**，并授权主线按这个基调调研后拍板；主线据
[业界做法调研](../../../../research/client-center-mutual-trust-practices/README.md)作出本决定：
传输绑定 `composition.governance-center-entry-https-json` v1 接受并冻结，入口契约 G-10 与 G-11 闭合，
客户端信任中心证书的规则定下来，登录状态寿命、限流与持有证明三件按第一版基调登记为已知边界。

- **输入与下游**：来源是入口节点[「传输机制候选」](../../../realization/packages/tenancy/governance-center-entry/design.md#传输机制候选)的采用与
  [提案「传输候选的采用」](../../proposals/governance-center-entry/design.md#传输候选的采用)；spec-reviewer 三轮（第三轮收口复核后无阻断）。
  下游是 [registry](../../../registry/README.md) 的状态翻转与冻结、入口节点与 [`apps/cli`](../../../realization/apps/cli/README.md) 节点的改写、
  [`apps/tenancy-host`](../../../realization/apps/tenancy-host/design.md#运维约定owner本节点) 的部署边界约定。
- **范围定位**：只解决「传输绑定是不是有权者接受的精确对象」「防冒充两侧各落在哪」「第一版的安全基调」。
  **不解决**：实现与验证（归 realization 的实际证据）、登录状态的到期与刷新（产品未决项，本决定只登记它为第一版边界）、
  客户端确认失败时的呈现（PF-016）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`）对第一版基调与授权；主线据授权拍板；JSON 解析器自写一项由产品负责人直接「同意」 |
| 接受记录 | 2026-09-23 的设计会话，原话「第一版我们主要那边开发和实验迭代用，按这个基调，你该调研调研，授权你自己决策拍板」；四项裁决单中第三项原话「同意」；**摘录见[决定正文](decision.md)** |
| 精确修订 | HUB 分支 `panqiwei/tenancy-leg-2` 的落地提交（本决定与 registry 翻转在同一提交）；两份资源 SHA-256 登记在 [`registry/frozen.json`](../../../registry/README.md) |
| 接受范围 | 五项，逐项写在[决定正文](decision.md#选择与范围)；**契约条款全部接受，含「已知缺口」表——接受的是缺口以显式缺口存在** |
| 保留前提 | 第一版只供自己人开发与实验；D-028 的全部前提不变；入口层包已按候选实施、字节自初稿未变 |
| 取代关系 | 不取代任何决定。闭合 D-028 明确留开的 G-10／G-11；取代 [cli-tui 提案 D11](../../proposals/cli-tui/alternatives.md#d11-线上协议与认证) 中「登录状态作 Bearer 头」这一处 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么这样定、第一版哪些边界是有意留的 | [决定正文](decision.md) |
| 精确坐标与冻结哈希 | [registry](../../../registry/README.md)：`catalog.json` 的 `acceptance` 指向本包 [`acceptance.json`](acceptance.json) |
| 业界怎么做、每条做法的代价 | [调研](../../../../research/client-center-mutual-trust-practices/research.md) |
| 客户端一侧的信任规则落在哪 | [`apps/cli` 设计](../../../realization/apps/cli/design.md#客户端信任中心的规则d-029) |

返回[决定](../README.md)。
