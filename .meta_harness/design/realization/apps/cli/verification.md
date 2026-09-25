# cli 验证与证据

本页登记这个节点**触发了哪些证据义务、实际跑过什么、覆盖到哪里**。
原始配置、输入快照与运行结果归 [record/evidence](../../../record/evidence/README.md)，本页只引用并解释范围。

> **一句话状态：什么都没跑过。**下面 35 条义务（租户边与交付面 11 条、据点装配 24 条）全部「未开始」，
> [实际执行](#实际执行)是空表，[bindings.yaml](bindings.yaml) 是空表。
> **这不是「还没来得及记」，是真的没有任何运行。**

## 证据义务

义务从契约条款与本节点声称兑现的范围产生，**不从已有测试反推**。
来源条款写精确契约坐标；契约尚未立的写「待立」，并写清拟议名与它要覆盖的性质。

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
| --- | --- | --- | --- |
| [`capability.account-identity/v2#S-30`](../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证) | 该条列出的「装配给的保证」在本节点这条跨进程边上**逐条**由协议重新兑现的证据：撤销传播时延上界 δ 进契约、激活可见性窗口内 fail-closed、同提交的等价表述、标识释放的传播界 | **未开始** | 本节点 + 该契约 owner。入口契约 [`composition.governance-center-entry/v1#S-36`](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)（`accepted`，D-028）已逐行写明这条边上由谁兑现：领域没有被拆开，同存储／同提交类的保证仍由装配给，改由协议给的是与调用方身份和流向调用方的值有关的那几行（含中心一侧 δ = 0）；据点侧副本的陈旧归 PF-016。闭合条件：据点侧客户端代理立起来并出证据；在此之前**本节点不得声称这些保证已成立** |
| [`capability.organization-governance/v1#S-42`](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) | 同上，针对组织治理那一侧列出的各条 | **未开始** | 同上 |
| [`composition.account-registration/v1#S-25`](../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) | 注册组合链跨这条边之后的同提交与重跑语义证据 | **未开始** | 同上 |
| [`data.identity-values/v1#S-30`](../../../spec/data/identity-values/v1/contract.md#s-30-跨边界须重新验证) | 接收边界重新鉴别调用方的结构检查：**持有标识不构成资格** | **未开始** | 同上 |
| [`data.offer-expiry/v1#S-17`](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) | 跨这条边之后时间源与参数下发的一致性证据，或把「已过期」改成由单点判定并携带的事实 | **未开始** | 同上 |
| [`capability.organization-governance/v1#S-18`](../../../spec/capabilities/organization-governance/v1/contract.md#s-18-每道准入现读)、[`#S-43`](../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用) | 中心不可达注入：[必须现读的三类](../../../product/PF-016-cli-tui-delivery-surface/design.md#69-需要现读成员资格的那几件事不拿副本放行)**明确失败且说清是问不到**，副本一次都没有被当成准入依据 | **未开始** | 本节点。闭合条件：代理提供者与据点进程存在 |
| [`capability.account-identity/v2#S-17`](../../../spec/capabilities/account-identity/v2/contract.md#s-17-校验登录状态) | 本机连接的认证证据：不出示登录状态、出示已撤销的登录状态、同一台机器上另一个账号的连接**三种都被拒**；账号**不从操作系统用户推断** | **未开始** | 本节点。闭合条件：传输两端存在 |
| **待立：交付面呈现与受理契约**——[两种呈现形式留下同一串记录条目](../../../product/PF-016-cli-tui-delivery-surface/design.md#55-两种呈现形式同一份事实) | 同一场景分别用人读与机读各跑一遍，记录条目序列**逐条相同** | **未开始** | 本节点。**这是「交付面不是能力」唯一可核的证据**；闭合条件：契约起草接受 + 两种呈现形式都存在 |
| **待立：同上**——投影顺序等于日志顺序、每条带来源坐标与单调序号、断线续读、有界缓冲与慢消费者处置 | 断线与慢消费者注入下的续读对照；**内核不提供背压与可靠投递**，所以这几条必须由传输端出证据 | **未开始** | 本节点。闭合条件：同上 |
| **待立：同上**——[机读通道只承载契约内容](../../../product/PF-016-cli-tui-delivery-surface/design.md#66-机读那一份只承载事实)、[秘密不进任何呈现](../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)、[调试开关不改变领域行为](../../../product/PF-016-cli-tui-delivery-surface/design.md#612-观感偏好不改变任何领域行为) | 哨兵串在任何输出面都搜不到；开关调试前后的记录条目序列相同 | **未开始** | 本节点；凭据归属[已裁](../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据)，等待立契约 |
| **待立：同上**——进程以任何方式退出后终端被还原 | 真 pty 冒烟：正常退出、异常退出、收到终止信号三种下终端状态复原。**`kill -9` 与远程连接中断明确不在覆盖内**，因为[撤除路径本身不保证被执行](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) | **未开始** | 本节点。闭合条件：人读那一份存在 |

**据点装配的义务**（2026-09-25 起）。来源契约全部 candidate（待 [D-041](../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）；「本节点」一列指的是 [design.md](design.md) 里本节点自己作的选择。**结构检查**指对依赖图、装配清单与 inject 声明的静态断言，**演练**指真进程、真文件上的注入。

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
| --- | --- | --- | --- |
| 本节点：[包分层规矩 5](architecture.md#包分层与依赖规则)（assets 候选 B） | 结构检查：据点的依赖图（`apps/cli` 据点入口的传递 import）里没有 `packages/assets/asset-governance` | **未开始** | 本节点。闭合条件：`apps/cli` 建包 |
| [`capability.tool-admission/v1#S-33`](../../../spec/capabilities/tool-admission/v1/contract.md#s-33-装配给的保证-vs-协议须给的保证)；本节点 [验收装配](design.md#验收装配) | 结构检查：产品据点清单里没有放行件与任何一个替身，**本版也没有七份接口契约的最小提供者**（关键选择 5）；放行件与替身只在 `apps/cli` 的测试代码里、不在任何 `packages/*` 里；两份清单里都**没有独立的 `dependencyPresence` 键**（它是 `assemblyManifest` 的查询，AM S-19）；**最小提供者的配置不带测试项**（一条规则，A-27，原 A-31 并入）：只有 `apps/cli` 的测试代码 import `session-tenancy-table` 的 `./seed`，产品清单里 `run-attempt-facts-derived` 不带 `runEndRecognizer`、`assembly-manifest-store` 不带 `presenceSource`、不装提供 `executionPlacementReadings` 的种子件；产品清单里不出现 `center-connection-replay`（A-33）；产品清单里的 P-2 解析到的 `modelTransport` 是 `pi-ai-transport`、不是脚本化传输。每条规则带「故意违反即失败」的自测 | **未开始** | 本节点 ＋ `tools/ts-checks`。闭合条件：同上 |
| 本节点[升级确认在第一次受理之前](design.md#升级确认在第一次受理之前)、A-28；ST S-6、AM S-13／S-24 的共同前提 | 启动序列测试 `assembly.upgrade-confirmed`（名候选，与 tenancy-host 同名同形）：`boot()` 返回时 `guard.pending()` 为 `clear`；确认之前没有任何受理；故意不调 `confirm()` 的变体在下一次撤除后库回到升级前（证明检查会响）；验收装配里「子进程提交之后被杀、重开同一库文件」的场景看到的是确认之后的提交 | **未开始** | 本节点。闭合条件：`apps/cli` 建包、验收装配存在 |
| 本节点 A-32（三个 infra 最小提供者的撤除次序） | 装配测试：验收装配的撤除按 P-2 → 执行宿主 → 桥本体 → hooks-compat → 派发器 → 执行环境 → 保管方 → 根依次结算——兼容件起过的组在执行环境撤除之前经它停下，保管方撤除时没有在途清扫事务以 `StorageUnavailable` 收 | **未开始** | 本节点 ＋ 两个 infra 节点。闭合条件：三者建包；前提是 design.md 缺口 C-11 那条待补 probe 的假设（`await` 一条 fiber 的撤除等到它的 async disposer 结算完） |
| 本节点 A-29、A-30（保管方 CCL-2、CCL-3） | 装配测试：① 合成的迁移里桥的片段先于保管方的片段，清单里没有桥插件时照样合成桥的片段——pg 上建表不失败、sqlite 上 `depositOAuth` 不以缺陷收场；② 桥与保管方拿到的 `oauthPendingTtl` 是同一个值（改一边的配置即装配测试失败） | **未开始** | 本节点 ＋ 桥节点 ＋ `credential-custodian-local`。闭合条件：三者建包 |
| [`capability.tool-execution-runtime/v1#S-46`](../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-46-装配给的保证-vs-协议须给的保证) 第 1 行 | 演练：一次工具执行在途时回收发起它的那副 agent runtime，执行照常跑到收场、结果照常送达；结构检查：执行宿主的 fiber 父链上没有 agent runtime | **未开始** | 本节点。闭合条件：执行宿主与验收装配的 agent loop 驱动存在（受阻于缺口 C-8 只影响产品装配） |
| 同上第 3 行；[`capability.mcp-bridge/v1#S-30`](../../../spec/capabilities/mcp-bridge/v1/contract.md#s-30-装配给与协议给) 第 2、4 行；要求 S-a | 装配测试：清单里每个 inject `storage` 的插件拿到的是同一个实例，清单里恰有一份 `storage-sql` | **未开始** | 本节点。闭合条件：执行宿主、桥建包 |
| 同上第 8 行；[`capability.mcp-bridge/v1#S-27`](../../../spec/capabilities/mcp-bridge/v1/contract.md#s-27-桥被替换或卸载) ⑥；[`capability.modality-projection/v1#S-26`](../../../spec/capabilities/modality-projection/v1/contract.md#s-26-装配给的保证-vs-协议须给的保证) 第 3 行；本节点关键选择 2 | 结构检查：据点装配里没有 loader／HMR、没有对任何插件的 `fiber.update`。演练（排空重启）：在途的一次工具执行、一次模型调用、一次 MCP 调用分别收成 `failed{abnormal_interruption}`、`interrupted{run_cancelled}`、`bridgeWithdrawn`，重启后三者都**没有被重发** | **未开始** | 本节点 + 三个 provider 节点（各自的撤除条款 [TER S-48](../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-48-本能力自己的撤除与换代)、[MRR S-36](../../../spec/capabilities/model-request-runtime/v1/contract.md#s-36-宿主停止与撤除)、BR S-27）。**撤除由本应用显式驱动**：根撤除之前按 P-2 → 执行宿主 → 桥本体 → hooks-compat → 派发器依次 `await`，验收装配再接执行环境 → 保管方（M48、A-32）；**前提**：`await` 一条 fiber 的撤除会等到它的 async disposer 结算完——待补 probe 的假设（design.md 缺口 C-11），不成立时本条预期不成立、正确性改由下一任恢复扫描兜住。闭合条件：三者建包、验收装配存在、那条 probe 登进 basis |
| [`capability.modality-projection/v1#S-9`](../../../spec/capabilities/modality-projection/v1/contract.md#s-9-登记表同键一件登记是系统装配层的声明) 第 2 条、S-26 第 2 行 | 启动序列测试：本机 socket 开闸之前没有任何受理；声明者 `ACTIVE` 之后、开闸之后，已声明的键一次也不答「没登记」 | **未开始** | 本节点。闭合条件：P-3、声明者与门面存在（门面受阻于待立的交付面契约，验收装配里用直接调用代替） |
| [`capability.model-profile-directory/v1#S-22`](../../../spec/capabilities/model-profile-directory/v1/contract.md#s-22-装配给的保证-vs-协议须给的保证) 第 5、6 行；本节点关键选择 4 | 租户没配自己那一把时调官方档案得 `undispatched{credential_unavailable}`；在据点的存储、配置与进程环境里放一个出厂凭据哨兵的反面检查——**哨兵搜不到，因为本装配根本不配它** | **未开始** | 本节点 + P-1r、P-2 节点。闭合条件：两者建包 |
| 同上第 4 行 | 结构检查：清单里只有 P-2 inject `credentialLookup` | **未开始** | 本节点。闭合条件：P-1r、P-2 建包 |
| [`capability.modality-projection/v1#S-24`](../../../spec/capabilities/modality-projection/v1/contract.md#s-24-转换件不发起模型调用)；S-26 第 1、4 行 | 结构检查：P-4\* 的 inject 与依赖图里没有 `modelRuntime`；受限面 `converterAssembly` 只被声明者与转换件包解析，`converterRegistry.convert` 只被模态转换那一件的实现模块调 | **未开始** | 本节点。闭合条件：P-3、声明者、P-4\* 建包 |
| [`capability.tool-execution-runtime/v1#S-45`](../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-45-送达通知)、S-46 第 11 行（M42）；[`capability.model-request-runtime/v1#S-51`](../../../spec/capabilities/model-request-runtime/v1/contract.md#s-51-模型侧到达装配前提的承诺)；[PF-016 §6.4](../../../product/PF-016-cli-tui-delivery-surface/design.md#64-一台机器上账号之间互不可见但宿主机那一层不隔离)（F ③） | 两个账号、同一账号的两个租户身份各开一个会话，同时产生送达通知与观察者推送：每条客户端连接收到的**只属于它出示的账号、它的当前租户身份与它订阅的会话**；两个会话复用同一个 `CallId` 也不串 | **未开始** | 本节点。闭合条件：门面与传输存在（受阻于待立的交付面契约） |
| 本节点：配置错误一个政策（[失败映射](design.md#状态并发与失败映射)末行） | 逐项注入：每个具名参数缺值或非法、转换件声明不合形状、存储文件不可写——据点进程**启动失败、退出非零**，诊断点名那一项、**不含值**，没有 fiber 留在 `ACTIVE`、本机 socket 没有开闸 | **未开始** | 本节点。闭合条件：清单与各插件建包；具名参数的名单随各契约 G 定值（缺口 C-9）更新。本波加三项：执行宿主的 `judgeTimeoutMs` 缺席 ⇒ 启动失败（产品配置给初值 500 ms，A-16）；P-5 的 `retryPolicy` 不合形状 ⇒ 启动失败、**缺席不是错误**（取配置层默认初值，A-23）；兼容件的 `hookEnvAllowlist` 缺席 ⇒ 启动失败 |
| 要求 S-g、L-f；[`capability.tool-execution-runtime/v1#S-46`](../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-46-装配给的保证-vs-协议须给的保证) 第 3、5 行；[设计反证 ②](design.md#存储要求清单与跨-owner-的同一提交) | 演练：第二个据点进程对同一份 SQL 库与同一本会话日志**起不来**；排空重启时旧进程未退、新进程已起的重叠窗口里，只有一个进程能写 | **未开始** | 本节点 + `storage-sql`（SQL 一半已有子进程测试）+ 会话日志最小提供者 `session-log-jsonl`（节点已立、尚未建包；属主文件锁是它的关键选择五，C-1） |
| 同上第 4、5 行；要求 L-b；[设计反证 ①](design.md#存储要求清单与跨-owner-的同一提交) | 演练：结果消息已追加、出站项尚未标送达时杀掉据点进程；重启后日志里那条结果消息**恰有一条** | **未开始** | 本节点 + 执行宿主节点（已选出站项 `tool_execution_outbox`，M44）+ 会话日志最小提供者（按耐久内容判重，SL S-8 第 2 条）。闭合条件：最小提供者节点立起（验收装配里即可演练）；产品装配随 C-1 |
| [`capability.mcp-bridge/v1#S-6`](../../../spec/capabilities/mcp-bridge/v1/contract.md#s-6-连接归桥不上签名不跨租户)（P-8） | 哨兵：据点进程环境里放一个不在白名单上的变量与一个秘密，stdio 服务端进程里两个都读不到 | **未开始** | 本节点 + 桥节点。闭合条件：桥建包，`stdioEnvAllowlist` 定值（BR G-12） |
| [`capability.mcp-bridge/v1#S-28`](../../../spec/capabilities/mcp-bridge/v1/contract.md#s-28-据点停机与重启) | 演练：stdio 服务端在跑时对据点进程 SIGKILL；重启后的桥回收那个孤儿进程组、不复用它、不向它发任何请求 | **未开始** | 桥节点（回收是它的义务）+ 本节点（给出以据点身份起、有权终止的前提）。闭合条件：桥建包 |
| [`capability.hooks-import/v1#S-26`](../../../spec/capabilities/hooks-import/v1/contract.md#s-26-装配给的保证-vs-协议须给的保证) 第 3 行 | 演练：hook 命令再起一个孙进程；超时之后整组都不在 | **未开始** | 兼容层节点 + 本节点。闭合条件：兼容层建包；执行环境在验收装配里由 EE v1 的最小提供者给，**拓展件子进程的宿主机允许由测试种子给**——产品装配里这一项没有（EE G-3，账本 ⑭），兼容件 fail-closed、只会「起不来」、没有子进程可停 |
| [D-039](../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3)、[D-035](../../../record/decisions/message-and-stream-baseline/decision.md)「两条链各自能从脚本化输入跑到真实 JSONL 日志」；本节点[验收装配](design.md#验收装配) | 不起客户端进程、不连治理中心：模型链（脚本化传输（登记 `modelTransport` 的一件）→ P-2 → 日志；MRR G-19 已按 D-043 R-4 闭合，`legalTargets`／`selectModel`／`displayList` 经服务面可跑，`openCall` 用交来的 `target`、不读求值（MRR S-28 ④）；**新会话由种子先写一条模型切换记录**（MRR S-9、G-20 ②：从没切换过的会话 `effectiveModel` 恒 `unavailable`）；**`effectiveModel` 的锁判与 `dispatch` 的两个时限仍受阻于 AM G-4**——从装配清单记录里的读法未约定，验收由最小提供者 ＋ 测试种子给一份不含「用哪个模型」项的求值（MRR S-10 第 2 步：没有锁）与时限值，记「有前提」（N-35 ①））与工具链（放行件 → 执行宿主 → 本地工具与 MCP stdio 工具各一次 → 送达 → 日志）各自跑通，日志落在**真实 JSONL 文件**上 | **未开始** | 本节点。闭合条件：各 provider 建包、七份接口契约的最小提供者建包（节点已立，D-043 R-1）、五件替身按「只回放契约允许的序列」写成——会话持有租户（否则 `submit` 整批 `dependencyUnavailable{sessionTenancy}`，TER S-21；经 `session-tenancy-table` 的 `./seed` 代写）、执行环境（否则每一项 `failed{environment_unavailable}`；读数由种子件给）、尝试与运行的事实（否则落账算不出 `late`；认法 `runEndRecognizer` 由测试驱动交进）都由最小提供者承接 |
| [`data.slash-command/v1#S-16`](../../../spec/data/slash-command/v1/contract.md#s-16-名字只按会话斜杠命令集认) 及 S-12～S-15 | 同一份用例集在交付面预判与受理面再判两侧各跑一遍：拿到同一个会话斜杠命令集时**逐条同一结果** | **未开始** | 本节点 + `packages/core/slash-command` 节点。闭合条件：该纯模块建包；受理面受阻于受理那一程 |
| 本节点：P-1r 恰一个实例（[换代表](design.md#提供者换代或缺席时谁被重跑)后一段） | 演练：模型调用在途时切断到中心的连接；P-2 与 agent runtime 不被重跑、在途调用不被放弃，读副本照常 | **未开始** | 本节点 + P-1r 节点 + `centerConnection` 的提供者。闭合条件：P-1r 建包；远端读受阻于入口组合 v2（C-4），验收装配里用副本与 `centerConnection` 的最小提供者（CN v1），它按脚本回放断线与重连、不以换代表达（CN S-7） |
| [`capability.tool-execution-runtime/v1#S-46`](../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-46-装配给的保证-vs-协议须给的保证) 第 7 行；[`capability.loop-extension-runner/v1#S-32`](../../../spec/capabilities/loop-extension-runner/v1/contract.md#s-32-装配给的保证-vs-协议须给的保证) 第 6～8 行；[`capability.hooks-import/v1#S-26`](../../../spec/capabilities/hooks-import/v1/contract.md#s-26-装配给的保证-vs-协议须给的保证) 第 2 行；归装配 A-19～A-21 | 在验收装配里由 agent loop 驱动替身演练三件：① 同一份报告交给 `dispatch` 与 `submit`，两侧都收；换成同一运行**上一次尝试**的报告，两侧都答 `invalidInput`；② 兼容件的 hook 在跑时叫停 `dispatch`，收场 `cancelled`、那一件不留记录、子进程组不在；③ 执行环境句柄在调用返回之后再解析即失败，执行环境取不到时解析失败而不回退宿主机 | **未开始** | 本节点（验收装配的驱动替身）+ 派发器、执行宿主、兼容层节点。**产品装配里 ①② 归 loop 契约（C-8），③ 的两样来路归会话持有租户读面（C-13）与执行环境（C-7）**，那时证据由那几程出；闭合条件：各 provider 建包、验收装配存在（含会话持有租户与执行环境两个最小提供者；锚键由测试给，RUN S-5） |
| [`capability.model-profile-directory/v1#S-22`](../../../spec/capabilities/model-profile-directory/v1/contract.md#s-22-装配给的保证-vs-协议须给的保证) 第 3 行；[`capability.model-request-runtime/v1#S-38`](../../../spec/capabilities/model-request-runtime/v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) 第 6 行；[PF-016 §6.17](../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)、[§6.20](../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据)；D-040 §八 M47 | 演练：① 保管方在场、租户那一把已落副本，切断到中心的连接之后调模型——照常发出，凭据取自本地副本；② 保管方缺席——同一场景如实收成 `undispatched{credential_unavailable}`，不是别的收场；③ 同一台机器上另一个账号的据点读不到这份副本（按登录状态归属）；④ 副本值不出现在任何日志、呈现与机读输出里（哨兵） | **未开始** | 本节点 + P-1r 节点（按 M47 修订）+ 凭据保管方最小提供者 `credential-custodian-local`（节点已立、尚未建包，C-5）。① ③ ④ 在验收装配里经最小提供者 ＋ 经 `storeReplica` 写的种子可演练（记「有前提」）；② 在验收装配里不装保管方即可演练 |
| [`capability.tool-execution-runtime/v1#S-13`](../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-13-账) 的 `late`、G-18；D-040 §八 M74 | 在验收装配里由 `runAttemptFacts` 的最小提供者（RAF v1：「已被取代」从会话日志条目壳算出、「已终结」以测试种子答，N-37 ④）演练：① 同一运行的新尝试开始之后，旧尝试里那次执行才落账 ⇒ 账上 `late: true`；② 运行已终结之后才落账 ⇒ `late: true`；③ 两者皆否 ⇒ `late` 缺席；④ 答 `unavailable`／`attemptNotFound` ⇒ 不给过渡值（不以「`late` 缺席」冒充「不晚」），收场按执行宿主节点的处置 | **未开始** | 本节点（验收装配）+ 执行宿主节点（按 M74 修订）+ RAF 最小提供者 `run-attempt-facts-derived`（节点已立、尚未建包；「已终结」经测试驱动交进的认法 `runEndRecognizer`）。**产品装配里这份读面归会话日志与 loop 那一程（C-16）**，那时证据由那一程出；闭合条件：执行宿主建包、验收装配存在 |

| [`capability.credential-custodian/v1#S-19`](../../../spec/capabilities/credential-custodian/v1/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行；[`capability.mcp-bridge/v1#S-30`](../../../spec/capabilities/mcp-bridge/v1/contract.md#s-30-装配给与协议给) 第 4 行；要求 S-h；[D-040 §八 N-37](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤ | 装配测试：验收装配里保管方最小提供者与桥本体拿到的是**同一个 `storage` 实例**；OAuth 条目对 `mcp_oauth_binding` 的引用约束存在——绑定行在被指着时删不掉（`ReferenceViolation`）；落地内容里找不到条目的明文（以已知原文逐字节扫，CC S-26），密钥只在本机密钥文件里 | **未开始** | 本节点 + 桥节点 + 保管方最小提供者 `credential-custodian-local`（节点已立；它的 K-3、K-9）。闭合条件：三者建包；保管方的迁移片段排在桥之后（A-29） |
| [`capability.credential-custodian/v1#S-19`](../../../spec/capabilities/credential-custodian/v1/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 3 行；N-37 ⑩ | 结构检查：`credentialCustodian` 的 `readReplica` 只被 P-1r 解析，`depositOAuth`、`resolve` 只被桥本体解析（模型档案目录节点 MPD-N4、桥节点 N-14 的同一条规则在装配这一层再核一次） | **未开始** | 本节点 ＋ `tools/ts-checks`。闭合条件：P-1r、桥建包 |

**受阻项写明阻塞原因**：上面每一条的阻塞原因都是同一族——
**契约未立或未接受、提供者不存在、源码未建包**。
不用「待补充」掩盖，也**不新设一个「无法验证」的状态**把缺证据登记成已处理。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
| --- | --- | --- | --- |

**本表为空，因为没有任何运行。**没有测试、没有形式任务、没有真实集成，
[record/evidence](../../../record/evidence/README.md) 下也没有属于本节点的 run（`2026-09-25-formal-assets-runtimes` 核的是契约模型，理由见[覆盖缺口](#覆盖缺口)）。
[提案登记的五个区分实验](../../../record/proposals/cli-tui/alternatives.md#进入实施前的最小区分实验)
同样**一个都没跑过**——它们是选型的改选触发，不是本节点的符合性证据，
但在跑之前，[技术栈采用表](architecture.md#技术栈采用)里的渲染层、呈现路线与第二阶段分发**都只是纸面结论**。

**有限检查不写成无条件证明。** 将来填进上表的每一行都要带上边界：
关闭了哪些故障路径、在什么规模与参数下、跳过了哪类输入。

## 覆盖缺口

**目前没有任何一条条款有任何形式的证据。**与 [bindings.yaml](bindings.yaml) 的空表一致——
两处不给不同说法。

| 缺什么 | 为什么 | 谁能补 |
| --- | --- | --- |
| 本节点消费的五份租户契约**一条绑定都没有** | 五份租户契约与入口契约都已接受（D-023、D-028），但本节点的代理提供者不存在、据点与客户端之间的契约未起草，没有任何可引用的测试 | 据点侧代理提供者与本应用建包之后，由本节点回填 |
| 交付面自己那份契约的全部性质**没有可绑定的条款** | 契约尚未起草 | 架构与规格设计 |
| 据点装配承接的「装配给」行（[逐行](design.md#装配给逐行承接)）**一条绑定都没有** | 契约 candidate（待 D-041）；provider 与本应用都未建包；运行 [`2026-09-25-formal-assets-runtimes`](../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md) 的八个 formal task 核的是契约模型，**本节点给的那几样在模型里被吸收**（追加口原子、同一存储、同一时钟都是「一步」；执行宿主的 fiber 位置根本不建模），装配给被违反时这些任务不会失败——所以不引作本节点的证据 | 上表 22 条义务逐条闭合；契约接受后回填 bindings |
| 标「受阻」的装配给行 | 会话日志、装配清单、中心事实副本、到中心的连接、凭据保管方、附件字节存储、执行环境、agent loop、会话持有租户读面、尝试与运行的事实读面这些承接者不存在（[缺口 C-1～C-8、C-13、C-16](design.md#实施缺口与消费者影响)；D-040 §八 M43、M48、M74：本程不补、留给下一程） | 主线（M43、M48、M74） |
| 标「缺口」的装配给行（MRR S-38 第 5 行、MPD S-22 第 2 行、MP S-26 第 6 行、HI S-26 第 1 行；MPD S-22 第 3 行按 M47 改为受阻于保管方） | 单机没有承接方式：目录在中心而调用在据点、附件字节存储未定义、执行环境无契约 | 入口组合 v2（C-4）、附件字节存储（C-6）、PF-005（C-7） |
| 四条假设（`ctx.effect` 撤除函数可提前调用、没有 inject 时插件体不重跑、不带 `thisArg` 的派发不过滤、`await` 一条 fiber 的撤除等到它的 async disposer 结算完）**没有 probe** | 第四条是本装配显式驱动撤除次序的前提（据点义务第 5 条）；前两条由 provider 节点依赖；第三条按「全进程可见」处理，且已进契约（TER S-46 第 11 行），事件越界的义务（上表第 10 条）不靠它。「子 fiber 随父卸载」本装配已不依赖 | `packages/core/kernel-basis`（缺口 C-11） |
| harness 其余能力族的任何条款 | 契约与提供者都还没设计 | 各能力的设计 |
| 跨进程之后失效的那批保证 | 入口契约（`accepted`，D-028）已把这批保证逐行分派；**据点侧代理立起来之前，这批保证在本节点这条边上是缺口，不是假设** | 据点侧代理提供者 |

## 独立评审

2026-09-25 本节点（据点装配修订、修复波 3 对齐之后）经一次独立的架构评审（N5，只读结构核对，无运行）：阻断 2、应修 2、建议 4；主线据此裁定 [D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M47、M48。下表逐条写处置与落点。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| B-1（阻断） | 验收装配的替身集合跑不通它声称要演练的工具链：`submit` 读不到会话持有的租户即整批失败，起执行者第 2 步没有执行环境即 `failed{environment_unavailable}`，兼容件一律「起不来」；「落在宿主机是验收环境的前提」与执行宿主、兼容层的「不降级、不回退」相抵 | 按 M48：补「会话持有租户读面」（`sessionTenancy`，执行宿主、派发器、注册表会话事实三个消费者共用一份）与「执行环境」（`executionEnvironments`，只答宿主机已被显式允许＋按进程组起停）两个替身；删掉那句前提，改写为「由执行环境替身给出」；会话持有租户读面新登缺口 C-13（真承接者 PF-015），执行环境仍归 C-7 | design.md 验收装配替身表与说明、装载清单、inject 边表执行宿主与派发器行、装配给 RUN S-32 第 7 行与 MP S-26 第 7 行、A-9、A-21、C-3、C-13；本页据点义务第 16、17、20 条的闭合条件 |
| B-2（阻断） | 离线调模型的凭据来源：失败映射说「照常」，而 P-1r 不落地凭据、P-2 只经 `credentialLookup` 取值，据点上没有一条路径读得到副本 | 按 M47（改判 M44「P-1r 不持久凭据」，产品正文 PF-016 §6.17／§6.20 优先）：P-1r 把租户那一把的副本经凭据保管方落在据点（加密、按登录状态归属），取值先本地副本、中心可达时刷新；**保管方缺席的本版离线调模型如实 `undispatched{credential_unavailable}`**，写成显式缺口 | design.md 失败映射两行、选择与动作链 MPD 行、inject 边 P-1r 行、成对装卸 P-1r 行、装配给 MRR S-38 第 6 行与 MPD S-22 第 3 行（改引 M47）、A-4、「凭据的值怎么到据点」一行；architecture.md 技术栈采用末段；README 可实施范围；本页新增据点义务第 21 条 |
| A-1（应修） | 撤除次序依赖未登记的内核假设 | 按 M48 改为本应用显式驱动：根撤除之前按 P-2 → 执行宿主 → 桥本体 → 派发器依次 `await`，`storage`、`clock` 随根最后走。这一驱动仍依赖「`await` 一条 fiber 的撤除等到 async disposer 结算完」，同时登进 C-11 并写成据点义务第 5 条的前提 | design.md 装载清单「撤除次序」、成对装卸 storage／clock 行、C-11；architecture.md 分发与升级；本页据点义务第 5 条、覆盖缺口的假设一行 |
| A-2（应修） | 服务键 `sessionExecutionEnvironment` 与 provider 节点的 `executionEnvironments` 不一致 | 统一为 `executionEnvironments` | design.md 开头候选名、装载清单、选择与动作链 HI 行、inject 边表 hooks-compat 行、A-9 |
| A-3（建议） | `dependencyPresence` 没有缺口条目 | 新登缺口 C-14（派发器契约 RUN-N5）；验收装配的固定清单写明没有一件声明 `needs` | design.md C-14、装载清单、验收装配「装配清单」替身行 |
| A-4（建议） | 会话日志替身半径最大，缺删除条件 | 写明它做的正是 C-1 的 L-a～L-f、C-1 闭合即删；全部替身的行为不进任何 `bindings` 作证据，真承接者一立就删 | design.md 验收装配「会话日志」替身行与首条说明 |
| A-5（建议） | 排空重启第一步「关闭新运行的准入」没有承接者 | 登进 C-8「挡住什么」，并在排空次序里点名 | design.md C-8；architecture.md 分发与升级 |
| A-6（建议） | 「切断到中心的连接」演练与连接替身「从测试种子读」不匹配 | 替身「只许做什么」补「按脚本模拟断线与重连、不以换代表达」 | design.md 验收装配替身行；本页据点义务第 19 条 |
| 范围外 1 | G-7 与 M44 的张力 | M47 消解：产品正文优先 | 同 B-2 |
| 范围外 2 | 会话持有租户读面的 owner：PF-015 还是随入口 v2 的 C-3 | M48 定：会话那一程（PF-015），与 C-3 分开登记 | design.md C-3、C-13 |
| 反证清单 · 关键选择 1 | 「替身超过八个、或某个替身必须做契约未定义的判断」即应复议 D-039「不另立应用」 | 替身现为十个，前一半已触发；后一半未触发（`sessionTenancy`、`executionEnvironments`、`runAttemptFacts` 都只答测试种子，不判租户、不选落点）。主线裁定**不复议 D-039**（D-040 §八 N-27），关键选择 1 置信度「中」保留 | design.md 验收装配末条、关键选择 1 |
| 转交表达评审 | C-10 已闭合仍占位的写法 | 保留为已闭合一行（删除线加闭合依据 M40），编号不复用；逐字核对 README 与 design 的承接行号留给表达评审 | design.md C-10 |

**N3／N4 批评审的裁定落到本节点的几处**（同属 D-040 §八，本节点不是那两批的评审对象，这里只登落点）：

| 编号 | 裁定 | 处置 | 落点 |
| --- | --- | --- | --- |
| M74（N3 范围外 1） | `late` 的两件事实经据点读面 `runAttemptFacts` 读；真承接者会话日志／loop；验收装配以替身供它；`late` 不给过渡值 | 加第十个验收替身，只答测试种子；执行宿主 inject 边补调用时取用；新登缺口 C-16（C-15 已由 M58 的 `infra/clock` 修订占用）；新增一条据点义务 | design.md 开头候选名、装载清单、验收装配替身表与说明、inject 边表执行宿主行、A-24、C-8、C-16 与编号说明；本页据点义务第 22 条、第 17 条闭合条件、覆盖缺口 |
| M69（N4、N5） | 凭据保管方服务键定为 `credentialCustodian` | 本节点各处统一，A-4 里「两个节点叫法不一」一句删掉 | design.md 开头候选名、装载清单、A-4、报给主线 |
| M67（N4 M-3、M-4） | P-5 带候选默认退避 `[1000, 2000, 4000]` ms 装载，G-8 只待产品负责人确认数值；`openCall` 宿主句柄形状归 C-8 | 装载清单给出 P-5 的 config；「归装配」表新增 A-23，A-17 去掉「默认重试件退避」（它是 P-5 的配置，不是设置项）；C-8 补宿主句柄一句 | design.md 装载清单、选择与动作链 MRR 行、A-17、A-23、C-8 |
| N-27（壬回报） | 替身过八不复议 D-039；「`await` 一条 fiber 的撤除等到 async disposer 结算完」登 kernel-basis 待补 probe | 关键选择 1 置信度「中」保留、写明后半条件未触发；那条假设已在 C-11 | design.md 验收装配末条、关键选择 1、C-11、报给主线；本页上表「反证清单 · 关键选择 1」一行 |

## 修订波（2026-09-25 公开面）

依据：[D-043](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1、R-2、R-4、R-5、R-12，[SYS-OPEN](../../../foundation/cross-system-constraints/requirements.md#sys-open)，[D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-36、N-37。本波只改节点；契约侧由规格侧并行落，本节点只引条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-043 R-2 | 新开「公开面」：装配没有公开函数面；服务面组合兑现各 provider 的运行时层不变量；SYS-LLM 由本装配给传输的常量兑现；验收可直接跑函数面（有前提） | design.md「公开面」；README |
| 替身表改为「最小提供者（接口契约 X）」 | D-043 R-1；七份接口契约的提供者映射 | 原十个替身里七个改为接口契约的最小提供者（落处、兑现条款、产品装配里的它、真承接者各一列）；剩四个替身；关键选择 1 的替身数改写 | design.md「验收装配」、关键选择 1；本页据点义务里独立运行、P-1r 恰一个实例、A-19～A-21、离线凭据（M47）、`late`（M74）各行 |
| 最小提供者是否进产品清单 | 起草时推导 | 本版只进验收装配（新增关键选择 5，取舍表与改选条件） | design.md 关键选择 5、装载清单说明、选择与动作链新增一行、装卸表；README；本页结构检查一行 |
| 保管方条目落处 | N-37 ⑤；CC S-19 第 2 行 | 副本条目与 OAuth 条目以密文落在绑定所在的同一 `storage`、本机只放密钥；S-h 与跨 owner 表改写 | design.md 选择与动作链、S-h、跨 owner 表、A-4、C-5；本页新增装配测试一行 |
| 装载清单删 `dependencyPresence` 键 | N-37 ② | 删独立键；`assemblyManifest` 标「含 `dependencyPresence` 查询」；插件表、派发器行、A-7、C-14 改写 | design.md 装载清单、插件与 inject 边、选择与动作链、A-7、C-14；本页结构检查一行 |
| 可实施范围与缺口表同步 | D-043 R-1 | C-1、C-2、C-5、C-7、C-13、C-14、C-16 改写为「接口已定、真承接者未到」；C-4 分出观察面（CN v1）与请求面（入口 v2）；装配给各行状态加「接口已定」；L-a～L-f、S-h 对到接口契约条款 | design.md 装配给逐行承接、存储要求、归装配、缺口表；README 可实施范围 |
| G-19 闭合 | D-043 R-4；MRR 契约 G-19 | 模型链验证解阻 `legalTargets`／`selectModel`／`displayList`（写过切换记录的会话）；`openCall` 不读求值（MRR S-28 ④）；`effectiveModel` 的锁判与 `dispatch` 时限仍挡在 AM G-4（报主线） | design.md 公开面、报给主线；本页据点义务「独立运行」一行 |
| 锚 | D-043 R-12 | 派发器行与 L-d 写明锚键由调用方交、验收由测试给 | design.md 选择与动作链、L-d、RUN S-32 第 4 行 |
| 重试策略对象 | N-36 | A-23 改为 `retryPolicy`，缺席取配置层默认初值；配置错误政策行补这一项 | design.md 选择与动作链、装载清单、失败映射末行、A-23；本页配置一行 |
| 执行宿主判定时限（主线追加裁定） | 执行宿主节点「判定时限是策略配置」 | A-16 承接 `judgeTimeoutMs` 初值 500 ms（本装配的配置给），缺席即启动失败 | design.md 选择与动作链、装载清单、失败映射末行、A-16；本页配置一行 |
| hooks 兼容件 fail-closed | EE G-3；账本 ⑭ | 兼容件行、HI S-26 第 1 行、A-9、C-7 写明本版 fail-closed；验收装配的允许由测试种子给 | design.md 对应各处；本页 HI S-26 第 3 行一行 |
| 对齐契约侧提交 `f0998468` 与主线 2026-09-25 两条裁定 | MRR G-20；RUN S-5、S-21；TER S-47；HI G-15、S-19；主线裁定（白名单同一形状类型、hooks 退出码映射） | 驱动行写明锚的参数名 `anchor`／`anchors`；C-16 写明读不到得 `dependencyUnavailable{runAttemptFacts}`；C-7 加 HI G-15；A-16 写明两份白名单同一形状类型、EE 未定；报给主线加 ④ MRR G-20（新会话第一次切换之前发不出请求）、⑤ HI 退出码一行契约与裁定相左、⑥ 白名单类型 | design.md 驱动行、C-2、C-7、C-16、A-16、报给主线 |
| 对齐契约第二轮（`47e36d14`） | TER S-21（`{sessionTenancy}`）；EE S-13（`EnvAllowlist`）；HI S-19；MRR S-10 第 2 步、G-20 | C-13 与「独立运行」一行改为 `submit` 读不到会话持有租户得 `dependencyUnavailable{sessionTenancy}`；「独立运行」一行的模型链改写（`openCall` 不读求值、新会话由种子写切换记录、锁判与时限挡在 AM G-4）；A-16 两份白名单改指 EE S-13；报给主线撤掉已随契约闭合的两项（HI 退出码、白名单类型） | design.md C-13、A-16、报给主线；本页「独立运行」一行 |
| 最小提供者波与传输 fork 节点（主线 2026-09-25） | 申：`packages/session/{session-log-jsonl, session-tenancy-table, run-attempt-facts-derived}`、`packages/assets/assembly-manifest-store`；戌：`packages/model/pi-ai-transport`；酉：`packages/infra/{credential-custodian-local, execution-environments-host, center-connection-probe}`（全部 candidate） | MRR 行、inject 表（加 `pi-ai-transport`、P-2 必需 inject `modelTransport`、「有意不设的边」删去传输）、换代表、装载清单（P-2 之前加 `pi-ai-transport`）、装卸表（P-2 只有在途表，连接池归传输插件）；「七份窄口」行与验收装配表七行链到各自节点并按它们改写：尝试事实「代 loop 写终结的测试驱动交进认法 `runEndRecognizer`，答案仍从日志算」、装配清单「在场事实经配置 `presenceSource` 交进」、会话持有租户「经本包 `./seed` 代写」、保管方（inject `storage`、`clock`，两张密文表，片段排在桥之后，`keyFile` 缺席时启动生成，种子经 `storeReplica`，`oauthPendingTtl` 与桥同源）、执行环境（不 inject，POSIX 进程组，读数种子件，产品装配里工具 `unavailable`、兼容件 `noLanding{hostNotAllowed}`）、中心连接（验收 `center-connection-replay`、产品 probe、信任方式归本节点）；替身表脚本化传输改「登记 `modelTransport` 的一件」、加执行环境读数种子件（替身五件）；S-h、L-a、L-f（文件锁已由 `session-log-jsonl` 写出）、同一提交表、C-1、C-2、C-5、C-7、C-12、C-13、C-14、C-16、A-2、A-4、A-7、A-9、A-16、A-22、A-24 同步；装卸表「密钥取不到」限定启动时；归装配加 A-25～A-34 | design.md 各处；architecture.md 第 134、138、150、176、179、191 行一带；README；本页结构检查、A-29／A-30 装配测试、「独立运行」、据点义务各行 |
| 独立评审 N6 A-3：升级确认时点无 owner | [D-040 §八 N-42](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ① | 新开「升级确认在第一次受理之前」：本装配开升级守卫（`{ checks, guard }`），全部 `ACTIVE` 之后 `guard.confirm()`、确认之后才开闸；写明它是 ST S-6、AM S-13／S-24 与 A-28 的共同前提，产品装配与验收装配同一时点。三个 SQL 侧节点改引这一节由申改 | design.md 该节、验收装配首段、A-1、A-28；本页「升级确认」一行 |
| 独立评审 N6 A-4：RAF → `sessionLog` 边缺失、总述有误 | 同上 ① | inject 边表加七个最小提供者行（「仅验收」），RAF 行必需 inject `sessionLog`；总述改为「都不 inject 能力插件，RAF 是唯一 inject 另一个接口服务的」；换代表 `sessionLog` 行列 RAF 重跑与缓存丢弃，`storage`／`clock` 行列入 AM、ST、保管方、中心连接最小提供者 | design.md 插件与 inject 边、换代表 |
| 独立评审 N6 B-5：「配置不带测试项」无人认领 | 同上 ① | 与 A-27、A-31 合成一条：「最小提供者的配置不带测试项（`presenceSource`／`runEndRecognizer`／`./seed`／`executionPlacementReadings` 种子件）」；A-31 保留编号、并入 A-27 | design.md A-27、A-31、验收装配结构检查一条、替身表种子件行；本页结构检查一行 |
| 独立评审 N7 F-6：显式撤除次序不含三个 infra 最小提供者 | 同上 ② | 显式次序改为 P-2 → 执行宿主 → 桥本体 → hooks-compat → 派发器，验收装配再接执行环境 → 保管方；中心连接写明不需要；写明三者的次序不承担正确性、未按此序的收场由两节点的失败映射兜住；兼容件排到派发器之前（它是派发器的 inject 下游） | design.md 撤除次序一条、装卸表 `storage`／`clock` 行与最小提供者行、A-32；architecture.md 第 200 行一带；本页排空演练一行、A-32 一行 |
| 独立评审 N7 D-1：`oauthPendingTtl` 双持 | 同上 ③（主线裁：维持双持＋相等装配测试） | 不改；A-30 与本页 A-29／A-30 装配测试不变 | — |
| 同批主线裁定 D-4：中心连接信任方式 | [D-040 §八 N-42](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ③ | A-34 由「未定」改为「本版 CA 链加主机名」、状态改承接 | design.md A-34、验收装配中心连接行 |
| 第四轮：`openCall` 带同一份报告、工具条目经注册表取 | MRR S-28 ①③、G-24 闭合（[D-040 §八 N-43](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | 调用链同步：agent loop 驱动把同一份报告也交给 `openCall`；A-19 改为三个接收方；inject 边表 P-2「调用时取用」加 `assetRegistry`；C-8 与 TER S-46 第 7 行的承接句同步 | design.md 替身表 agent loop 驱动行、inject 边表 P-2 行、装配给 TER S-46 第 7 行、A-19、C-8 |
