# execution-environments-host

**2026-09-26 裁决对账**：[D-044 ⑭](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md) 已允许 hooks 子进程落宿主机，取代此前「产品未允许」的前提。现行未完成项是 EE G-3 的允许读面接线与 HI G-15 的工作目录、变量名单来路；缺席时仍按契约拒绝。本次只更新裁决依据，未登记实现或验证完成。


- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿，同日按独立评审 N7 修订（处置见 [verification](verification.md#独立评审)），尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.execution-environments · v1`（[契约](../../../../spec/capabilities/execution-environments/v1/contract.md)，状态 `candidate`，未接受、未冻结；设计依据 PF-005 rev 6、PF-006 rev 19、PF-016 rev 6）。它是那份窄口契约的**最小提供者**，取代 `apps/cli` 验收装配里原先的「执行环境」替身（[D-043](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1）；**真承接者是 PF-005 那一程**（契约 [G-1](../../../../spec/capabilities/execution-environments/v1/contract.md#十已知缺口)，cli 缺口 C-7），本节点只兑现窄口，不扩展契约
- 源码位置：`packages/infra/execution-environments-host`——**尚未建包**。路径与第一层 `infra` 已由主线裁定（[D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-40 ①）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是落点判定（`decidePlacement`、`decideExtensionLanding`）、程序路径解析（`resolveProgram`）与一组进程组原语（`startGroup` 交回的句柄：等结果、按组停并有界答复），候选名，不依赖 Cordis、会话或租户；**Cordis 服务面** `executionEnvironments` 加上引用与 (租户, 会话) 的绑定、跨租户即失效、撤除时停下起过的每一组——这几条函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber，不 inject 任何服务**；本版只认宿主机：工具的执行环境权限是 `always-allow` 或 `auto_place` 答 `host`（`auto_place` 落宿主机，[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑥），其余按契约 S-6 的次序答不落；权限与目标环境的来路**调用时现取一个可选读面**（契约 G-2 没有契约，只在验收装配里由种子件提供）；**拓展件子进程在契约 G-3 闭合之前 fail-closed**（N-37 ⑧）。进程表只在内存里，撤除即按组停；**每一次发信号之前核组长身份**，核不上不发（契约 S-15 ④，主线裁定 D-040 §八 N-42 ②）。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**无**。契约仍是 `candidate`，未经独立评审、未接受（[D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md) 是待签草案）；本节点的设计同样未被接受
- 可实施范围：本节点声称兑现契约 S-5～S-17 的全部操作与规矩，逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)。**尚未建包、没有一行源码**。
  **只在 POSIX 上**（进程组靠会话与进程组号，[缺口 EEH-7](design.md#实施缺口与消费者影响)）；进程与信号的上游语义 basis 没有条目，**全部待取证**。
  **产品装配本版不装**（cli 关键选择 5）；装上也如实失败：工具落点的来路没有（契约 G-2）⇒ 每一次 `placeExecution` 答 `unavailable`（执行宿主收成 `failed{environment_unavailable}`）；拓展件子进程的允许没有（G-3）⇒ `startProcess` 答 `noLanding{hostNotAllowed}`（兼容件「起不来」）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约本版不建形式工件（[S-18](../../../../spec/capabilities/execution-environments/v1/contract.md#s-18-本版选用哪些形式工件)），证据全部是对真实操作系统进程的场景与故障注入，一条都没有
- 实际验证：**尚无**。没有源码、没有测试、没有集成运行

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 落点怎样判、读面从哪来、进程组怎样起停、结果何时交、撤除时在途进程归谁 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、要取证的上游语义、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
