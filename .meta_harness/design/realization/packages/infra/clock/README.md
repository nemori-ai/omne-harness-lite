## 2026-10-04 公共集成接续

本批共享 Storage/Clock 定义与提供者绑定按[承诺归属表](../../../../architecture/pilots/shared-storage-clock-ownership.md)接续。
该表及成员旁 SPEC 只取代原公开键、根入口和 raw 发布投影；事务、租约、维护及消费者业务的未迁承诺仍有效。
旧路径、实现状态和运行结论按下文原日期读取。Clock 当前候选源码改为 `packages/infra/clock-lease`；历史节点保留。
独立 L3 验收和产品技术接受尚未完成，不以源码改接或设计采用提升状态。

# clock

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码修订 HUB `c9b5850`），2026-09-22 首稿；**2026-09-23 修订**：承接入口契约（`composition.governance-center-entry/v1`，`accepted`，D-028）经 [tenancy-host「时钟装配」](../../../apps/tenancy-host/design.md#时钟装配)转交的两条——[S-36](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) 末行「运行中钟往回倒 ⇒ 要看时间的答不可用」（`now()` 改为每次现读墙钟、比对用过的最晚时刻，不再按单调钟推算）与 [S-34](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)「时钟不可用只表现为返回值」，写清启动时旧租约窗口与入口层等钟上界的关系；新增导出**迁移前的只读回拨核对**（tenancy-host R-U1）；同日按评审再修订：R-C2 的操作系统崩溃窗口改写为真实量级与后果，代价表补「墙钟前跳后被校正回来」一行。**不兑现任何契约条款**——它兑现的是 [offer-expiry 节点](../../core/offer-expiry/design.md#能力到-cordis-的投影)定下的时间源**形状** `Clock { now(): Instant | 'unavailable' }`（形状本身是 `data.offer-expiry` v1 [S-16](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源) 的条款，provider 是 offer-expiry，不是本节点），以及 [S-17](../../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 表里那一行「**`now` 不后退**」——契约把它列为装配给，offer-expiry 节点对实现提了形状要求（存储高水位、回拨即 fail-closed），D-026 把它的承接者定为本节点
- 源码位置：`packages/infra/clock`——**已实现（HUB `c9b5850`）**：`src/lease.ts`（常量 `LEASE_WIDTH_MS`／`RENEW_PERIOD_MS`、表名 `CLOCK_LEASE_TABLE`、迁移片段 `clockMigrations`）、`src/clock.ts`（`LeaseClock`：每次现读墙钟比对用过的最晚时刻、启动判定、续约、收回；`ClockRollbackDetected`、`isRolledBack`；时间源经 `TimeSources` 可注入）、`src/preflight.ts`（`clockPreflight`、`CLOCK_PREFLIGHT_CHECK`）、`src/plugin.ts`（`clockPlugin`，服务名 `CLOCK_SERVICE`＝`'clock'`，`inject: ['storage']`，`ClockConfig` 是空的严格对象）。第一层 `infra` 由 D-027 拍板（2026-09-23）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber，`provide('clock')`（服务名沿用既有节点），**必需 inject `storage`**。它拥有：进程内「用过的最晚时刻」、存储里的一行高水位（自带一张表与迁移）、续约定时器，以及与启动判定同一规则的迁移前只读核对。**不拥有**：`Instant` 的表示（归 offer-expiry，毫秒整数品牌类型）、任何消费者对 `'unavailable'` 的收场（AI 映射为 `storage-unavailable`，OG 映射为 `unavailable`，各归各）。采用版本：`@deepseek-ai/cordis` 4.0.4（D-025）。高水位是**写在前的租约**——offer-expiry 候选形状里「已读到的最大 `now`」那一句改成「先落盘上界、再返回不超过它的值」，反证与对比表在 [design.md](design.md#高水位为什么是写在前的租约不是写在后的节流)

## 分层状态

- 语义接受范围：**无契约条款归本节点。**`data.offer-expiry` v1 全部条款已被 D-023 接受，其中 S-16 的形状与 S-17「`now` 不后退」那一行是本节点**承接**的对象，provider 仍是 offer-expiry 节点；本节点作为承接者的选型被 D-026 接受。到此为止，不提升下面三层。入口契约 S-36 末行与 S-34 那两条（产品依据 PF-017 rev 2）随入口契约 v1 由 D-028 接受（2026-09-23）；本节点本程的设计（现读墙钟、`clockPreflight`、R-C2 的真实窗口）随同一决定接受为实现路径
- 可实施范围：本节点声称兑现 S-17 五行里的两行——「`now` 与 `expiresAt` 同源可比」的**一半**（只 provide 一个实例；另一半「消费者不得另用 `Date.now()`」是 offer-expiry 的 lint SC-OE-3）与「`now` 不后退」除操作系统崩溃之外的全部（进程内不后退、跨进程崩溃与重启不后退、启动时回拨 fail-closed）；另声称入口契约 S-36 末行（运行中回拨 ⇒ `'unavailable'` 直到追上）与 S-34 那条前提；逐条见 [design.md「能力到 Cordis 的投影」](design.md#能力到-cordis-的投影)，以上连同迁移前核对 `clockPreflight` **已实现（HUB `c9b5850`）**。**不兑现**：**操作系统崩溃或断电之后的不后退**（[R-C2](design.md#对存储提供者的要求清单)：`synchronous=NORMAL` 下丢的是上一次检查点以来尚未被操作系统回写的全部续约，空闲时窗口可达约 55 分钟、实际由回写延迟决定；重启时墙钟落在那一段里则回拨检不出，那一段里的过期判定复活——D-027 不承诺，本节点只标价）、墙钟前跳后被校正回来时的可用性（停摆等于跳幅、重启绕不过、无运维出口，出口归产品；[代价表](design.md#运行中回拨每次现读墙钟比对用过的最晚时刻)）、与真实时间的偏差上界（本节点跟墙钟走，不承诺墙钟准）、跨进程的单调（[投影 Q-8](../../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)，两个进程各管各的「用过的最晚时刻」）、消费者侧「`'unavailable'` 时各操作失败」（各消费者节点）
- 绑定范围：[`bindings.yaml`](bindings.yaml) 保持空表。本节点承接时间源形状与装配前提，不作为独立契约 provider；绑定只指向实际存在且能失败的断言，不以永久 run 登记作为条件。回拨、重启后租约、写失败与装卸的验证义务归 [verification.md](verification.md)。
- 验证义务：检查进程内单调、启动回拨抛出并闩住、崩溃后重启追上租约前 `unavailable`、干净撤除、续约失败越过租约后的 `unavailable`、撤除后的 `unavailable`、插件装卸和缺迁移时 `StorageDefect`；另检查现读墙钟、运行中回拨与迁移前只读核对。范围与前提归 [verification.md](verification.md)，进程崩溃不能代替操作系统崩溃或断电验证。

## 按当前问题展开

| 当前问题                                                                                                 | 阅读入口                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `now()` 怎么算、高水位为什么写在前、回拨怎么判、续约写失败怎么收场、装卸怎么配对                         | [实现设计](design.md)                                                                                                                                                      |
| 运行中钟往回倒怎么检出、代价多大；启动时要等多久、入口层等钟的上界为什么要大于租约宽度；迁移前的只读核对 | [运行中回拨](design.md#运行中回拨每次现读墙钟比对用过的最晚时刻)、[启动时的租约窗口](design.md#启动时的租约窗口与入口层等钟)、[迁移前核对](design.md#迁移前的只读回拨核对) |
| 哪条承诺由哪份证据支持                                                                                   | [绑定表](bindings.yaml)（当前为空）                                                                                                                                        |
| 回拨、重启、写失败三条义务与还缺什么                                                                     | [验证与证据](verification.md)                                                                                                                                              |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，获准采用的终态写回当前承诺拥有者；比较与接受过程留本工作树 tmp。
