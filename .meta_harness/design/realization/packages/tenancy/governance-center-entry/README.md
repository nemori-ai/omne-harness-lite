# governance-center-entry

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-23 首稿；兑现 `omne-harness-lite-design-2026-09-15 · composition.governance-center-entry · v1`（[契约](../../../../spec/compositions/governance-center-entry/v1/contract.md)，状态 `candidate`，主责产品依据 [PF-017](../../../../product/PF-017-governance-center-as-deployable-application/README.md) rev 1 已接受（2026-09-23））。形状依据[提案 `governance-center-entry`](../../../../record/proposals/governance-center-entry/README.md) 的候选 A（候选，未接受）
- 源码位置：`packages/tenancy/governance-center-entry`——**尚未建包**。第二层 `tenancy` 是租户领域这个限界上下文的名字（[D-024](../../../../record/decisions/tenancy-domain-name/README.md)）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个包、两个 Cordis 插件，**都不 provide**，都装在装载清单最后、**同起同停**。
  **入口层** `governance-center-entry`（候选名）必需 inject `logins`、`registration`、`organizations`、`memberships`、`offers`、`storage`、`credentials`（只用 `parse`）、`clock`（只在启动时用）：一个 TLS 监听、一张封闭的路由表、判定次序与答复映射、启动时读或铸中心标识；**启动成功以钟可读为条件**——插件体里等 `clock.now()` 可读，上界是装配给的 config `clockReadyTimeoutMs`（候选名），超界即启动失败；
  **就绪与开门分两步**：插件体只绑端口不受理、标识就绪、钟可读后返回，等装配传入的 config `openSignal`（候选名，一个 Promise）兑现才开门、读钟作 `startedAt`、发 `serving`；
  账号能力按 [`capability.account-identity` v2](../../../../spec/capabilities/account-identity/v2/contract.md)（`candidate`）消费：**认人凭出示物走 S-44**，列表句柄就是 `LoginStateId` 本身，入口层永不以线上收到的 `LoginStateId` 认人；**在路由上不提交任何东西**，全包只碰 `governance_center` 一张表，由本包导出它的迁移片段。
  **运维面** `governance-center-ops`（候选名）只 inject `storage`、`clock`：本机套接字上只答完整体检，不引用任何治理服务。
  中心标识、版本、开门与关门、缺陷经三条 `emit` 通知从入口层到达运维面，不落存储、不经服务；运维面每次装载发一声 `listening`，开着门的入口层据此重发 `serving`，两者被各自重跑时仍能对上。
  中心标识那一行由迁移以占位（未铸）插入：入口层按契约 S-28 的三种读法收场——未铸即铸，已铸合形即用，**那一格不存在或值不合形即启动失败**，失败恰为读不到、写不进、不存在、不合形四支并点名是哪一支；表整个丢了由升级守卫的迁移前核对挡。配置错误一个政策：启动失败。Cordis 采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

四项分别陈述，不互相补齐。

- **语义接受范围：契约 candidate、需求已接受。**契约 `candidate`（catalog 已登记，`acceptance` 为空），所以本节点兑现的每一条契约条款仍是候选依据；主责产品依据 PF-017 rev 1 已接受（2026-09-23）。
  参与方里账号能力改用 v2，它是 `candidate`（未接受）；其余四份契约 v1 已由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md) 接受（账号能力 v1 也在其中，本节点已不消费它）；采用版本与名字由 D-025、[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md) 接受。本节点的设计与它依据的提案都没有被接受
- **可实施范围**：本节点声称兑现契约 S-1～S-36 中落在入口层与运维面的部分，逐条见 [design.md 的投影表](design.md#能力到-cordis-的投影)；
  并**认领契约的两条缺口**——**G-10 传输绑定的版本化工件**（候选 `https-json/1`，见[传输绑定](design.md#传输绑定将来冻结的工件)，未采用、未冻结）与 **G-11 防冒充的具体手段**（中心一侧：只有 TLS 监听，证书链与私钥是部署配置输入、不是部署密钥，见[防冒充](design.md#防冒充中心一侧的手段与材料)）。
  **不兑现**：客户端一侧（标识比较、「问不到」的呈现、据点副本、防冒充的确认）；契约 G-2～G-4、G-7、G-8（G-1 随 AI v2 闭合，证据在账号能力一侧）；「装配给」一列里归 `apps/tenancy-host` 的各项（装载顺序、迁移合成与原子性、迁移前核对 `governanceCenterPreflight` 的接入（N-16，那边已承接设计）、config 来源、日志汇、撤除总超时，以及 **`openSignal` 的兑现时机**——全部 fiber `ACTIVE` 且升级快照确认之后——与兑现后等 `serving` 的上界，见[归装配](design.md#归装配的事项)）。
  **读法待核对与依赖他节点的**：载荷内部成员重复按 `payload` 重复同一步收场，是本节点的延伸读法（N-3，契约 S-4 稳定稿仍未单列）；`clockSane` 的运行中回拨由时钟节点检出（N-5 设计层已闭合）。原 N-1（`startedAt` 在钟读不到时）、N-2（工程记录分不出存储与钟）已由契约裁决闭合，本节点照裁决写（启动等钟、超界启动失败；工程记录只记入口层自己观察到的失败值），见[缺口表](design.md#实施缺口与消费者影响)。
  **AI v2：已对齐**。认人改调 [AI v2 S-44](../../../../spec/capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)（`logins.exchange`，候选名，与账号能力节点一致），列表句柄 = `LoginStateId`，域分隔派生与多重匹配分支已删；出示物的表示层用账号能力包导出的 `parseLoginStatePresentation`（S-45 交换表示的全部四条），不解析线上的 `LoginStateId`；「只凭出示物认人」写成结构检查（[本节点约束](design.md#本节点约束存储要求之外)第 8 条，含不 import `parseLoginStateId`、不写 `as LoginStateId`）；出示物的线上形状归入口契约 Schema，`LoginStatePresentation` 就是 S-45 交换表示的投影，账号能力签发的 43 字符 base64url 过它（[对齐义务](design.md#出示物的线上形状对齐义务)）；撤销的句柄在载荷那一步过 Schema（只到 IV S-31），过了原样交给 `revoke` 的 `unknown` 目标参数。`credentials` 的注入不变。
  撤销目标（N-14）**已闭合**：[AI v2 S-16](../../../../spec/capabilities/account-identity/v2/contract.md#s-16-撤销登录状态) 的来源要求只针对发起方，撤销是一次调用，载荷里的句柄原样交给 `revoke` 的目标参数（`unknown`，表示层归账号能力包）。
  **已闭合**：与入口契约改钉 AI v2 的稳定稿逐条核对（N-11）；开门那一刻的失败由 `apps/tenancy-host` 有界等 `serving`、超时即启动失败承接（N-12，[那边的两步开闸](../../../apps/tenancy-host/design.md#两步开闸就绪与开闸分开)）；与改写后的契约 S-28 逐条核对（N-15）；迁移前核对的接入由 `apps/tenancy-host` 承接（N-16，设计层）；契约 S-28 前提与 S-36 那一行的核对判据已改为本节点 R-GC8 的那条（N-17）。**仍未闭合**：账号能力包与时钟包的源码（N-13、N-5 设计层已闭合，源码未改）。**已知边界**（不是缺口）：只有占位行的新表被拼进已有事实的数据、或已铸的值被本包之外的写者改回 NULL，下次启动会铸出新标识——本包只碰一张表。
  **源码：尚未建包**，本节点的一切名字都是候选
- **绑定与证据**：[`bindings.yaml`](bindings.yaml) **六条**（S-10、S-11、S-13、S-14、S-32、S-33），全部绑到契约的 formal task `governance-center-entry-v1-decision`——证的是**契约模型**，不是本节点源码；前提逐条写在各绑定里。**绑定为候选、不提升状态**：契约仍是 `candidate`，这六条既不提升语义接受，也不说明本节点任何源码符合契约。
  S-7、S-15、S-18、S-19 不绑（自指、模型表达不了、或没有变异证明会失败），理由在 bindings 末尾。S-11 那条的前提已改为 AI v2 S-44，并与契约稳定稿核过（N-11）。本节点自己的十九条测试义务 T-1～T-19 与六条结构检查**全部未开始**，见 [verification.md](verification.md#证据义务)
- **实际验证：尚无。**本节点没有任何运行；契约模型在 2026-09-23 跑过一次，那是契约的证据（[verification「实际执行」](verification.md#实际执行)）

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 两个插件各 inject 什么、一个请求怎么走、27 条路由各调哪个方法、传输与防冒充的候选、中心标识存哪怎么铸、装卸怎么配对、对存储要什么、还缺什么 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml) |
| 要证什么、实际跑过什么、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
