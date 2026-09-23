# governance-center-entry

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-23 首稿；兑现 `omne-harness-lite-design-2026-09-15 · composition.governance-center-entry · v1`（[契约](../../../../spec/compositions/governance-center-entry/v1/contract.md)，状态 `candidate`，主责产品依据 [PF-017](../../../../product/PF-017-governance-center-as-deployable-application/README.md)（rev 1）仍是 `draft`）。形状依据[提案 `governance-center-entry`](../../../../record/proposals/governance-center-entry/README.md) 的候选 A（候选，未接受）
- 源码位置：`packages/tenancy/governance-center-entry`——**尚未建包**。第二层 `tenancy` 是租户领域这个限界上下文的名字（[D-024](../../../../record/decisions/tenancy-domain-name/README.md)）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个包、两个 Cordis 插件，**都不 provide**，都装在装载清单最后、**同起同停**。
  **入口层** `governance-center-entry`（候选名）必需 inject `logins`、`registration`、`organizations`、`memberships`、`offers`、`storage`、`credentials`（只用 `parse`）：一个 TLS 监听、一张封闭的路由表、判定次序与答复映射、启动时读或铸中心标识；**在路由上不提交任何东西**，全包只碰 `governance_center` 一张表，由本包导出它的迁移片段。
  **运维面** `governance-center-ops`（候选名）只 inject `storage`、`clock`：本机套接字上只答完整体检，不引用任何治理服务。
  中心标识、版本、开门与关门、缺陷经三条 `emit` 通知从入口层到达运维面，不落存储、不经服务。配置错误一个政策：启动失败。Cordis 采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

四项分别陈述，不互相补齐。

- **语义接受范围：无。**契约 `candidate`（catalog 已登记，`acceptance` 为空），PF-017 rev 1 `draft`——本节点依据的每一条都是候选依据。
  参与方五份契约 v1 已由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md) 接受；采用版本与名字由 D-025、[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md) 接受。本节点的设计与它依据的提案都没有被接受
- **可实施范围**：本节点声称兑现契约 S-1～S-36 中落在入口层与运维面的部分，逐条见 [design.md 的投影表](design.md#能力到-cordis-的投影)；
  并**认领契约的两条缺口**——**G-10 传输绑定的版本化工件**（候选 `https-json/1`，见[传输绑定](design.md#传输绑定将来冻结的工件)，未采用、未冻结）与 **G-11 防冒充的具体手段**（中心一侧：只有 TLS 监听，证书链与私钥是部署配置输入、不是部署密钥，见[防冒充](design.md#防冒充中心一侧的手段与材料)）。
  **不兑现**：客户端一侧（标识比较、「问不到」的呈现、据点副本、防冒充的确认）；契约 G-1～G-4、G-7、G-8；「装配给」一列里归 `apps/tenancy-host` 的各项（装载顺序、迁移合成与原子性、config 来源、日志汇、撤除总超时，见[归装配](design.md#归装配的事项)）。
  **契约兑现不了或对不上的**：`startedAt` 在钟读不到时没有定义（N-1，S-26）；工程记录分不出「存储」与「钟」两类判不了（N-2，S-30 与参与方的不可用值）；此外重复成员的读法待确认（N-3）、`clockSane` 依赖时钟节点补运行中回拨判定（N-5），见[缺口表](design.md#实施缺口与消费者影响)。
  **源码：尚未建包**，本节点的一切名字都是候选
- **绑定与证据**：[`bindings.yaml`](bindings.yaml) **六条**（S-10、S-11、S-13、S-14、S-32、S-33），全部绑到契约的 formal task `governance-center-entry-v1-decision`——证的是**契约模型**，不是本节点源码；前提逐条写在各绑定里。
  S-7、S-15、S-18、S-19 不绑（自指、模型表达不了、或没有变异证明会失败），理由在 bindings 末尾。本节点自己的十九条测试义务 T-1～T-19 与五条结构检查**全部未开始**，见 [verification.md](verification.md#证据义务)
- **实际验证：尚无。**本节点没有任何运行；契约模型在 2026-09-23 跑过一次，那是契约的证据（[verification「实际执行」](verification.md#实际执行)）

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 两个插件各 inject 什么、一个请求怎么走、27 条路由各调哪个方法、传输与防冒充的候选、中心标识存哪怎么铸、装卸怎么配对、对存储要什么、还缺什么 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml) |
| 要证什么、实际跑过什么、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
