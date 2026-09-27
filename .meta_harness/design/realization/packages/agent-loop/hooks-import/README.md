# hooks-import

## 工作区接入的适用范围

HI-N5 的“导入报告交给中心资产治理落地”不等于工作区原位置兼容发现。现行 hooks-import/v2 S-9 与 AE S-17 将工作区 hook 落租户格，新产品要求候选仍在工作区层；该交接和启用事实表示需契约演进后重投影。纯翻译、事件映射与默认需租户显式启用原则仍成立，来源开关不能替代执行授权。

依据：[兼容交接的契约缺口](../../../../spec/capabilities/hooks-import/README.md)。

**2026-09-26 裁决对账**：[D-064 ⑭](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md) 已允许 hooks 子进程落宿主机，取代此前「产品未允许」的前提。现行未完成项是 EE G-3 的允许读面接线与 HI G-15 的工作目录、变量名单来路；缺席时仍按契约拒绝。本次只更新裁决依据，未登记实现或验证完成。


- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.hooks-import · v2`（[契约](../../../../spec/capabilities/hooks-import/v2/contract.md)，状态 `accepted`、已冻结）。落在 `agent-loop` 领域是 [D-059](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 接受的 tools 拆分候选 C（草图里写作 `hooks-compat`，节点名以本批裁定为准）；fork 边界是 [D-033](../../../../record/decisions/hooks-compat-baseline/decision.md#选择与范围)
- 源码位置：`packages/agent-loop/hooks-import`——尚未建包。第二层 `agent-loop` 由 D-059 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是 `importHostHooks`、两张映射表、`toHostInput`、`buildLaunch`、`fromHostOutput` 与 `runHostHook`（调用方交 `launcher` 端口；候选名），不依赖 Cordis、会话、租户或存储；**Cordis 服务面**是兼容插件——子进程落在这一会话的执行环境、回放不重跑、撤除停子进程只在这一层成立，函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：一个包、两样东西。**纯函数** `importHostHooks`（导入与导入报告，契约 S-11～S-15），按包导出，谁读得到来源产品的配置文件谁调；它不写任何东西，落成资产归资产治理。**兼容插件**（候选插件名 `hooks-compat`）向 runner 登记**一个**外部命令执行器（候选），`implementation.kind = command` 的全部兼容件都经它跑（契约 S-16～S-22），起、等、停子进程经 `capability.execution-environments` v2 的 `startProcess`／`processOutcome`／`stopProcessGroup`、每次带租户；配置一项 `hookEnvAllowlist`（候选，缺席即启动失败）。包内收 D-033 的 fork：DSH `c291e79` `hook-protocol` 的 `matcher`、`codec`、`merge`、`detached` 四个文件与 `HookOutput` 类型，剥掉对 `dsh-session` 的类型扩展，作为自有模块维护；执行器、导入与两张方言映射表自写。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-5～S-15（来源与方言、一条 command 一件、能力标识、干预力、工作区来源、兼容件载荷、导入与报告）、S-16～S-24（被调到时与两张映射表）、S-25、S-26 左列、S-27，逐条落点见 [design.md](design.md#操作落点)。**尚未建包，fork 尚未做，没有任何实现。**受阻（[缺口](design.md#实施缺口与消费者影响)）：执行环境**接口已定、真承接者未到**（`capability.execution-environments` v2；最小提供者节点 `execution-environments-host` 已立，本版只进验收装配），但**产品装配未交入允许时 fail-closed**——拓展件子进程的宿主机允许产品已给、装配尚未接入（execution-environments G-3，账本 ⑭），产品装配未交入允许时，`startProcess` 答 `noLanding{hostNotAllowed}`，每一件兼容件都「起不来」、按声明跳过（HI-N1）；子进程的工作目录与白名单变量没有来路（契约 G-15，HI-N7；交不出工作目录即起不来）；两家的解释器是契约引研究原文的待核对主张、basis 无条目（HI-N8）；函数层没有契约条款（HI-N9）；DSH 的许可与来历未核（HI-N3）；D-033 的 A／C 区分实验未跑（HI-N4）。HI-N2、HI-N6 已随 D-060 §八 M38、M39 闭合；HI-N10、HI-N11 已随契约 2026-09-25 第二轮修订闭合（S-19 退出码按来源产品语义；`EnvAllowlist` 定于 execution-environments S-13）。2026-09-25 修订波（公开面；N-37 ⑩ 四处）：处置见 [verification](verification.md#修订波2026-09-25-公开面)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **空表**——契约 S-28 不选用形式工件；证据形式是规范场景 S-29～S-36 与每行映射的测试，都没有实现可跑，登记在 [verification.md](verification.md#证据义务)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 纯函数与插件怎样分、fork 边界与区分实验、执行器怎样起停子进程、回放为什么不重跑、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空）与[验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
