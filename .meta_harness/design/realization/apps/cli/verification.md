# CLI验证义务与当前运行

## D049文件入口增量

| ID | 判据 | 当前证据 |
|---|---|---|
| F1 | 34命令/31路由的白名单与非秘密载荷映射；重复key、精度、未知/重复选项拒绝 | input.spec.ts逐项对照冻结命令与CG例；语法失败仍保持已选machine模式 |
| F2 | 秘密只从受保护regular文件取，FIFO/设备拒绝、严格UTF8、权限/符号链接/超限拒绝 | 具名文件测试及两平台实际CLI反例；Linux另实测外UID文件 |
| F3 | CG提供的Preview先于秘密；所有人读需TTY，机器一份安全JSON | 内部顺序断言及实际script PTY/子进程管道 |
| F4 | 实际CG工作→CG close→CLS close→输出；关闭缺陷不伪造业务事实/静止 | 内部具名屏障、CG/CLS close异常、信号及输出失败测试 |
| F5 | 输出EPIPE不重做业务；秘密和远端控制序列不进入输出指令 | 实际CLI破损stdout、中心记录恰一次目标；控制字符/公开报告检查 |
| F6 | 可复跑输入、两平台/工具链限定、构建完成后验证 | 本次源码与原始日志；workspace build/typecheck、应用68项，规则与设计检查 |

[2026-09-25运行包](../../../record/evidence/2026-09-25-tests-cli-file-entry/README.md)保存上述证据。实际治理旅程在macOS/Linux arm64 Node24.21.0运行编译CLI子进程，连接同一测试进程里的真实Cordis中心/HTTPS/SQLite；中心时钟可控、凭据成本为测试配置。不是apps/tenancy-host进程部署或物理多机验收。

内部Runtime是测试入口，精确制造读取/CAS/关闭与stderr故障，不开放用户故障选项。CG close正常实现使用allSettled，拒绝分支由内部替身触发，不称正常黑盒已经出现该故障。秘密TTY、TUI、安装与升级/备份仍无本节点的接受结果。portable额外实验只验证搬离仓库的依赖闭包，尚未采用安装器或发布制品。

## 后续完整Agent形态的旧义务（不作为本期治理状态）

以下保留旧三进程/据点方案对应的未完成事项；其中“未建包/契约未立”只指该后续Agent方案，不能替代上方D049已实现治理增量。

# cli 验证与证据

本页登记这个节点**触发了哪些证据义务、实际跑过什么、覆盖到哪里**。
原始配置、输入快照与运行结果归 [record/evidence](../../../record/evidence/README.md)，本页只引用并解释范围。

> **一句话状态：什么都没跑过。**下面 11 条义务全部「未开始」，
> [实际执行](#实际执行)是空表，[bindings.yaml](bindings.yaml) 是空表。
> **这不是「还没来得及记」，是真的没有任何运行。**

## 证据义务

义务从契约条款与本节点声称兑现的范围产生，**不从已有测试反推**。
来源条款写精确契约坐标；契约尚未立的写「待立」，并写清拟议名与它要覆盖的性质。

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
| --- | --- | --- | --- |
| [`capability.account-identity/v1#S-30`](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) | 该条列出的「装配给的保证」在本节点这条跨进程边上**逐条**由协议重新兑现的证据：撤销传播时延上界 δ 进契约、激活可见性窗口内 fail-closed、同提交的等价表述、标识释放的传播界 | **未开始** | 本节点 + 该契约 owner。入口契约 [`composition.governance-center-entry/v1#S-36`](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)（candidate）已逐行写明这条边上由谁兑现：领域没有被拆开，同存储／同提交类的保证仍由装配给，改由协议给的是与调用方身份和流向调用方的值有关的那几行（含中心一侧 δ = 0）；据点侧副本的陈旧归 PF-016。闭合条件：入口契约接受；在此之前**本节点不得声称这些保证已成立** |
| [`capability.organization-governance/v1#S-42`](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) | 同上，针对组织治理那一侧列出的各条 | **未开始** | 同上 |
| [`composition.account-registration/v1#S-25`](../../../spec/compositions/account-registration/v1/contract.md) | 注册组合链跨这条边之后的同提交与重跑语义证据 | **未开始** | 同上 |
| [`data.identity-values/v1#S-30`](../../../spec/data/identity-values/v1/contract.md#s-30-跨边界须重新验证) | 接收边界重新鉴别调用方的结构检查：**持有标识不构成资格** | **未开始** | 同上 |
| [`data.offer-expiry/v1#S-17`](../../../spec/data/offer-expiry/v1/contract.md) | 跨这条边之后时间源与参数下发的一致性证据，或把「已过期」改成由单点判定并携带的事实 | **未开始** | 同上 |
| [`capability.organization-governance/v1#S-18`](../../../spec/capabilities/organization-governance/v1/contract.md#s-18-每道准入现读)、[`#S-43`](../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用) | 中心不可达注入：[必须现读的三类](../../../product/PF-016-cli-tui-delivery-surface/design.md#69-需要现读成员资格的那几件事不拿副本放行)**明确失败且说清是问不到**，副本一次都没有被当成准入依据 | **未开始** | 本节点。闭合条件：代理提供者与据点进程存在 |
| [`capability.account-identity/v1#S-17`](../../../spec/capabilities/account-identity/v1/contract.md#s-17-校验登录状态) | 本机连接的认证证据：不出示登录状态、出示已撤销的登录状态、同一台机器上另一个账号的连接**三种都被拒**；账号**不从操作系统用户推断** | **未开始** | 本节点。闭合条件：传输两端存在 |
| **待立：交付面呈现与受理契约**——[两种呈现形式留下同一串记录条目](../../../product/PF-016-cli-tui-delivery-surface/design.md#55-两种呈现形式同一份事实) | 同一场景分别用人读与机读各跑一遍，记录条目序列**逐条相同** | **未开始** | 本节点。**这是「交付面不是能力」唯一可核的证据**；闭合条件：契约起草接受 + 两种呈现形式都存在 |
| **待立：同上**——投影顺序等于日志顺序、每条带来源坐标与单调序号、断线续读、有界缓冲与慢消费者处置 | 断线与慢消费者注入下的续读对照；**内核不提供背压与可靠投递**，所以这几条必须由传输端出证据 | **未开始** | 本节点。闭合条件：同上 |
| **待立：同上**——[机读通道只承载契约内容](../../../product/PF-016-cli-tui-delivery-surface/design.md#66-机读那一份只承载事实)、[秘密不进任何呈现](../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)、[调试开关不改变领域行为](../../../product/PF-016-cli-tui-delivery-surface/design.md#612-观感偏好不改变任何领域行为) | 哨兵串在任何输出面都搜不到；开关调试前后的记录条目序列相同 | **未开始** | 本节点；凭据归属[已裁](../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据)，等待立契约 |
| **待立：同上**——进程以任何方式退出后终端被还原 | 真 pty 冒烟：正常退出、异常退出、收到终止信号三种下终端状态复原。**`kill -9` 与远程连接中断明确不在覆盖内**，因为[撤除路径本身不保证被执行](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) | **未开始** | 本节点。闭合条件：人读那一份存在 |

**受阻项写明阻塞原因**：上面每一条的阻塞原因都是同一族——
**契约未立、提供者不存在、源码未建包**。
不用「待补充」掩盖，也**不新设一个「无法验证」的状态**把缺证据登记成已处理。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
| --- | --- | --- | --- |

**本表为空，因为没有任何运行。**没有测试、没有形式任务、没有真实集成，
[record/evidence](../../../record/evidence/README.md) 下也没有属于本节点的 run。
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
| 本节点消费的五份租户契约**一条绑定都没有** | 五份租户契约已接受（D-023），但本节点的代理提供者不存在、据点与客户端之间的契约未起草、入口契约仍是 candidate，没有任何可引用的测试或形式任务 | PF 接受 + 规格与实现推进之后，由本节点回填 |
| 交付面自己那份契约的全部性质**没有可绑定的条款** | 契约尚未起草 | 架构与规格设计 |
| harness 能力族的任何条款 | 契约与提供者都还没设计 | 各能力的设计 |
| 跨进程之后失效的那批保证 | 入口契约（candidate）已把这批保证逐行分派；**在它被接受、且据点侧代理立起来之前，这批保证在本节点这条边上是缺口，不是假设** | 入口契约 `composition.governance-center-entry/v1` 的接受；据点侧代理提供者 |

## 2026-09-25可搬运CLI与独立中心进程

[本次运行](../../../record/evidence/2026-09-25-tests-cli-portable-host/README.md)：89项应用/打包故障、归档清单与BUILD_ID、三平台keygen/serve真实进程、正式scrypt成本、治理旅程与正常/强杀重启。中心仍从仓库dist启动，CLI从仓库外最终归档运行；不包含中心分发/服务管理器、物理多机、TUI或备份恢复。

D051新增CQ2验证义务：全部34表单/31路由真实Intent与秘密槽；setup/固定Use分责；原Preview完整实际输出后确认；输入帧/输出背压有界、严格UTF8、取消/resize/迟到事件；输入及CG静止/输出结束后恢复2004和OS再关闭CLS。真实CG/中心/CLS和Mac/Linux模拟器/IME分别验收，未完成不得提升验证状态。有限模型归2026-09-25-formal-tui-delivery，不能代替上述实际测试。

D051主线验证见[增量运行](../../../record/evidence/2026-09-25-tests-tui-increment/README.md)：34表单映射、115项测试、真实中心TUI旅程、PTY四场景及XTerm正常退出、制品Undo256与表单核对。独立验收/源码review未执行，Mac模拟器/IME与完整真实终端交错仍未覆盖；原先“没有任何证据”段仅描述旧Agent形态，不适用当前治理增量。

D051-r3：[独立QA与跨OS](../../../record/evidence/2026-09-25-tests-tui-cross-os/README.md)封存53个独立观察、126项源码测试、S37取消不附带读取修复及Mac/Linux真实HTTPS互联；Mac GUI/IME和全34操作成功业务语义独立覆盖仍缺。

## 2026-09-25 D052/D053 新制品与全工作区回归

[固定证据包](../../../record/evidence/2026-09-25-tests-host-startup/README.md)封存564份源输入、44份顶层运行记录、三组最终跨OS场景及两份完整归档。18成员1761通过/34跳过/0失败，build/types通过；独立无dist快照分别host先行与CLI先行打包通过。Mac/Linux arm64与Linux amd64真实HTTPS治理/重启通过；Docker网络与PTY不等同物理公司网络或macOS GUI终端验收。初版失败和旧实现迁移负控保留。宿主归档、启动修复已验证；服务管理/每日备份/隔离恢复和最终fable review仍未完成。

## 2026-09-25 D054 iTerm 与独立治理表单补验

[固定证据](../../../record/evidence/2026-09-25-tests-iterm-delivery/README.md)封存133项CLI测试、实际iTerm 3.7.1beta1 GUI/WeType输入、半答复停止与恢复、Linux XTerm回归及独立QA r4/r5。r4覆盖30/30治理表单成功业务语义；r5为有限范围Pass with issues，严格汇总exit1：实际交错三次中两次命中并通过，一次夹具额外查询时序异常保留。不是所有时序均通过或整体生产接受。备份、服务部署与最终fable review仍未完成。


## 2026-09-26 终审修补与最终制品

[最终固定输入、运行与独立QA](../../../record/evidence/2026-09-26-tests-governance-review-fixes/README.md)接续D055/D056与D057：生产闭包移除测试运行器，初始化未收场责任与叠加故障诊断修复，领域契约不变。18成员最终合并1926通过/34跳过，host最终单独重跑；两包清单、严格独立类型消费、47项独立制品旅程及真实首启故障恢复、三组跨OS与systemd通过。最终host r3、CLI r2的SHA/BUILD_ID在该run；旧记录不提升到新制品。Fable三轮及主线处置均有公开记录，未发现本期阻断。

限定：首次工作根创建须串行；原位源变动精确hash/fstat分支未独立验到；TUI仍限D054 profile，不是任意终端支持；恢复只隔离，同机备份不覆盖整机/磁盘毁损。公司实际部署、Agent工作会话与Web/desktop不属于本次验证。
