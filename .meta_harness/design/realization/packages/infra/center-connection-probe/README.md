# center-connection-probe

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，同日按独立评审 N7 修订（处置见 [verification](verification.md)），尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.center-connection · v2`（[契约](../../../../spec/capabilities/center-connection/v2/contract.md)，状态 `accepted`，已接受、已冻结；设计依据 PF-016 rev 8、PF-017 rev 2）。它是那份窄口契约的**最小提供者**，取代 `apps/cli` 验收装配里原先的「中心连接」替身（D-063 R-1）；**真承接者是未来资产/据点入口（版本未分配） 的据点客户端**（契约 [G-1](../../../../spec/capabilities/center-connection/v2/contract.md#八已知缺口)，cli 缺口 C-4），本节点只兑现窄口（观察面），不扩展契约
- 源码位置：`packages/infra/center-connection-probe`——**尚未建包**。路径与第一层 `infra` 已由主线裁定（D-060 §八 N-40 ①）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是可达性的归约（`observe`）、公开体检答复的分类（`classifyProbeReply`）、下一次探的时刻（`nextProbeAt`）与一次独立的探测（`probeOnce`），候选名，不依赖 Cordis；**Cordis 服务面** `centerConnection` 加上「这一次在场」的计数、自己探自己重连的节拍、可达性怎么变都不撤除——这几条函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**一个包、两个 Cordis 插件，同一个服务键、同一个归约**——`center-connection-probe`（产品据点装法：对治理中心入口发公开体检）与 `center-connection-replay`（验收装法：按测试脚本回放对端行为，不连中心）；两者都必需 inject `clock`、都不 inject 存储。探测间隔、超时与答复上限全是策略配置项。**契约没有「判定阈值」**：可达性由最近一次有结果的往来定（S-5、S-6 ①），本节点不设阈值，去抖须契约新版本（主线已裁，[缺口 CNP-1](design.md#实施缺口与消费者影响)）。Cordis 采用版本 4.0.4（D-025）

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**设计已接受**（2026-09-26，D-062；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：本节点声称兑现契约 S-5～S-11 的全部规矩与唯一的操作 `reachability`，逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)。**尚未建包、没有一行源码**。
  **信任方式本版已裁**：CA 链加主机名（Node 的标准核验），钉公钥留新版本（[CNP-2](design.md#实施缺口与消费者影响)，cli A-34）。**插件体不读钟、不因钟启动失败**（CNP-5 已裁）；崩溃后快速重启落在时钟旧租约窗口里时，起始时刻读到之前 `undetermined` 的 `since` 缺席、读到即定（CNP-12 已裁 ①，契约 S-5 由规格侧改写）。
  **产品装配本版不装**（cli 关键选择 5）；P-1r 必需 inject 本服务，所以产品据点清单里 P-1r 停在 `PENDING`。装上也只是观察：向中心发请求不在这份契约（G-1），P-1r 读到 `reachable` 也问不了中心
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约本版不建形式工件（[S-12](../../../../spec/capabilities/center-connection/v2/contract.md#s-12-本版选用哪些形式工件)），证据全部是对脚本化对端与真实 TLS 的场景，一条都没有
- 实际验证：**尚无**。没有源码、没有测试、没有集成运行

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 两种装法怎样分、探测怎样排程、什么算「在应答」、时钟不可用怎么办、撤除时在途的那一次探归谁 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 record/decisions。
