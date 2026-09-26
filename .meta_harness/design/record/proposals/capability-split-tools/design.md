# 块 B 工具运行时：五个 #8 对象怎么切成能力、插件与领域

## 需要作出的选择

块 B 的机制读数（任务区，2026-09-23）把工具运行时拆成 43 个对象。其中五个落在 #8（plugin + service），对账四表没有增减：

| 对象 | 拟议契约（并行起草中，候选） |
|---|---|
| 工具执行运行时（无词条，指 PF-006 §6.12 所说「工具执行运行时里找得到／找不到」的那个容器） | `capability.tool-execution-runtime` |
| 注册表（无词条） | `capability.asset-registry` |
| 拓展件派发器（无词条） | `capability.loop-extension-runner` |
| [放行判断](../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision)的提供者 | `capability.tool-admission`（**本批只交接口**） |
| MCP 桥（无词条） | `capability.mcp-bridge`，另有数据半边 `data.mcp-endpoint` |

另外，hooks 兼容层的导入与方言映射表已由主线从派发器里移出，单立为 `capability.hooks-import`（主线裁定，待确认）。
它的运行时一半（compat 实现）是向派发器登记的**贡献**，归属随派发器一起讨论。

本包回答一个问题的三个侧面，候选以整套配置作答：

1. **几份能力契约**：五份各自成契约，还是有几份该合并。
2. **几个插件兑现**：一份契约一个插件，还是几份共用一个；执行运行时的宿主是一条 fiber 还是两条。
3. **落在哪个领域**：[realization 两层布局](../../../realization/README.md#packages-的两层布局)里 `packages/<domain>/<node>` 的第一层取什么。

**选错的可观察后果**（都是静默的）：

- 执行宿主多挂一个会换代的依赖，或与别的维度同插件：那个依赖的提供者每换代一次、那个维度每更新一次，会话里**所有在途工具执行**都会落「失败 · 异常中断」。
  这在 [PF-006 §6.12](../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来) 的意义上确实是停机，但它是自己造成的。
- 放行判断的提供者和派发器、执行运行时焊在一起：放行判断不在的时候，做不到「整批拒、别的拓展件照走」（见 K-4、K-5）。
- 领域放错：一个领域里的包跟着别的产品 topic 反复改；或者第一次建包之后再搬目录、改引用。[D-024](../../decisions/tenancy-domain-name/README.md) 定名字的理由正是「现在定，代价是零」。

**作者推荐候选 C**（[候选与取舍](alternatives.md#推荐与改票条件)）：五份能力契约，每份一个插件；执行宿主只 inject 存储与时钟；
执行运行时、注册表、MCP 桥和放行接口放在 `tools`，派发器和 hooks 兼容层放在 agent loop 那一侧的领域。**推荐不是接受。**

### 必须保留的性质

编号只在本包内有效。每行最后一列写的是：拆分方式在哪里会把这条性质弄丢。块 B 领域读数的其余性质由契约条款承载，**不随拆分方式改变**，本包不再重列。

| # | 性质 | 依据 | 拆分在哪里会破坏它 |
|---|---|---|---|
| **K-1** | 回收 [agent runtime](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) 不会让任何工具执行停下，也不会让 `Ask()` 的卡片作废 | [PF-006 §6.12 宿主表](../../../product/PF-006-tools-and-skills/design.md#它的宿主是谁决定了什么会带走它)（rev 17）；[PF-012 §6.13](../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)（rev 10）；[D-032](../../decisions/tool-execution-runtime-baseline/README.md) | 执行宿主落在 agent runtime 或 agent loop 的提供者之下，或者与它们同插件 |
| **K-2** | 执行停了不重来：同一次调用至多交给执行者一次；执行运行时失去连续性，就落「失败」，原因「异常中断」，没有例外 | [PF-006 §6.12「停机之后，它不重来」](../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来)（rev 17） | 执行活体所在的 fiber inject 了任何服务——插件体重跑，就等于把工具再做一遍 |
| **K-3** | 某个维度换提供者、换代码或改配置时，受牵连的在途工作**只限于那个维度**（推导） | [SYS-DYNAMIC](../../../foundation/fully-dynamic-system/requirements.md) C2「在途工作的处置由设计明确」；PF-006 §6.12（执行宿主重跑一次就是一次停机） | 执行宿主与别的维度同插件，或 inject 了会换代的服务 |
| **K-4** | 任何一层的明确禁止，什么运行模式、什么拓展件都翻不了；放行判断缺席时整批拒；判的、签的、执行的是同一份参数 | [PF-007 §5.6](../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)（rev 16）；[PF-012「改参数，先落一条生效参数」](../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)（rev 10）；「缺席即整批拒」是**主线裁定，待产品负责人确认**（任务区 `tmp/assets-runtimes/pending-user-rulings.md` §一 U-5 甲案） | 派发器 inject 放行提供者（缺席时停在 PENDING，别的件也跟着不跑）；或执行运行时不核对放行凭据（无词条） |
| **K-5** | [拓展件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)不可用就视作卸载：这一次看得见「此刻不在」，别的件照走；系统自带的件不享受特权 | [PF-012 §5.8「拓展件是可插拔的服务」](../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略)、[「系统自带的几件」](../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪)（rev 10） | 派发器 inject 各件的实现 |
| **K-6** | MCP 对端的可用性与版本不由本系统掌握，对端的变化不算故障；连不上时，它的动作原位装[替换件](../../../ubiquitous_language/terms/reach-and-availability.md#ul-stand-in--替换件--stand-in) | [PF-002 §4 MCP](../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)（rev 16）；[PF-006 §6.13](../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)（rev 17） | 桥与执行宿主同插件：桥的每次换代或更新都会牵连本地工具执行 |
| **K-7** | 收场、账与结果消息在同一次提交里落下；真实结果落成 ToolMessage 还是 SystemReminderMessage，由运行时按日志里有没有占位来判 | [PF-006 §5.4](../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账)、[§5.5](../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)（rev 17）；[D-058](../../decisions/message-and-shape-rulings/README.md) Q15 | 执行记录（无词条）出现第二个写入者 |
| **K-8** | 边界能在不改语义的前提下拆成分布式；哪些保证是装配给的，要写明 | [SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | 按进程内的方便来切，不按部署亲和来切 |

**可调整的**：能力契约的数目、插件的数目与粒度、领域归属、节点名、执行宿主的 fiber 形状。
**不可调整的**：K-1～K-8；D-032（运行时自研、执行宿主不在 agent runtime 之下）；D-037（桥的路径与范围）；D-033（兼容层的 fork 边界）；D-058 Q8、Q10、Q15。

## 五个对象的归属画像

领域归属按「它拥有哪个产品 topic 的事实或动作链」判断（[两层布局判据](../../../realization/README.md#packages-的两层布局)）。
下表把判断要用的几项事实并排列出来。

| 对象 | 拥有者（产品 topic） | 跑在谁身上 | 运行时消费者 | 独立的变化原因 | 向它登记的贡献者 |
|---|---|---|---|---|---|
| 工具执行运行时 | PF-006（执行、收场、前后台、停机） | 进程级服务；每次执行一条子 fiber；宿主是[会话](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-session--会话--session) | agent loop、`BkgJobs()`、卡片答复、交付面、恢复路径 | 执行语义、执行者种类、收场与恢复 | 执行者（无词条）：样例工具、MCP 桥、技能脚本、进程内函数、子进程 |
| 注册表 | **PF-006 为主**（[当下可用性](../../../ubiquitous_language/terms/reach-and-availability.md#ul-current-availability--当下可用性--current-availability)、替换件、常驻、槽位、依赖解析）＋ PF-002（[会话斜杠命令集](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set)、reload） | 进程级服务；按（会话, 类别）持快照数据 | agent loop、`Tools()`/`Skills()`、斜杠命令识别、放行（取定义） | 会话级可见集合的失效事件：reload、③ 型失败后的自动刷新、可用性重算 | —（MCP 桥的投影与可用性由它可选取用） |
| 派发器 | **PF-012**（[§5.8](../../../product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点)） | 在调用方 agent runtime 的协程上跑（[PF-012 §6.13](../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)：拓展件那段执行的宿主是 agent runtime） | **只有 agent loop** | 结论集合、报错策略、回放 | 自带五件：循环探测（PF-012）、放行判断（PF-008）、卸载判定（PF-006）、模态转换和重试（PF-013）；compat 件；租户自己的件 |
| 放行判断的提供者 | PF-007 §5.6（四步）＋ PF-008（卡片） | 作为派发器上 `before_action` 的末一件 | 派发器；执行运行时核对凭据 | 授权政策 | — |
| MCP 桥 | PF-002 §4 MCP ＋ PF-006 §6.13 | 进程级服务；每条接入点连接一条子 fiber | 注册表（投影与可用性）、执行运行时（把它当执行者用） | MCP 协议与 SDK 版本、[D-037](../../decisions/mcp-client-adoption/README.md) 的桥接范围 | — |

**读法**：

- 执行运行时、MCP 桥和注册表的主体语义都在 PF-006，三者归 `tools` 不成问题。**注册表里有 PF-002 的一块**（命令集与 reload），这是一个子选择，见[候选与取舍](alternatives.md#两个子选择)。
- **派发器的拥有者、宿主和唯一的运行时消费者都在 agent loop 那一侧。**它进入块 B，只是因为它的契约恰好排在这一程起草。
  **同步修改的证据**：主线在读数之后给派发器契约追加了一批裁定（记在任务区 `tmp/assets-runtimes/briefs/S15-loop-extension-runner.md` 与裁决账本里，**待产品负责人确认**）。
  其中五条改的是 PF-012 的 loop 语义：`before_model_call` 的否决等于这次不发、运行失败；`before_persist_message` 对模型回复只开放否决（兼涉 PF-009）；
  系统追补的中断提醒不算「让队列非空」（兼涉 PF-014）；连续被否决的回复计入[循环守卫](../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯)；放行判断钉在 `before_action` 末位（兼涉 PF-008）。
  另有一张表，规定自带五件各自缺席时怎么办，涉及 PF-013（转换件、重试件）、PF-012（循环探测）、PF-007（放行判断）、PF-006（卸载判定）各自的件；
  还有两条是机制与边界上的：派发器自己逐件等待；hooks 的导入移出派发器契约。
  **没有一条改到执行运行时的语义。**
- 放行判断的拥有者是 PF-007 与 PF-008，不是 PF-006。本批它没有提供者，节点暂不建立；它将来落在哪个领域，是第二个子选择。

## 现有能力如何承载

调查范围：本 spoke 的 `spec/`、`realization/`、`record/decisions/`（基线 `e0ef60a1`）。**范围之外**：并行 spoke 上正在起草的能力契约，只读了施工简报。

| 要求 | 现有能力与精确位置 | 覆盖依据 | 未覆盖承诺、实现缺口或未确认前提 |
|---|---|---|---|
| 工具定义、拓展件声明与结论的形状 | [`data.tool-definition`](../../../spec/data/tool-definition/README.md) v1、[`data.loop-extension`](../../../spec/data/loop-extension/README.md) v1（均为 candidate） | 纯数据，没有操作；[两层布局](../../../realization/README.md#packages-的两层布局)判它们落 `core/` | 未接受；`data.loop-extension` 自述「有行为的是 runner」 |
| 持久事实（执行记录、账、动作清单副本） | [`core/storage`](../../../realization/packages/core/storage/README.md) 协议 ＋ [`infra/storage-sql`](../../../realization/packages/infra/storage-sql/README.md)（租户一程已实现，[D-026](../../decisions/infrastructure-persistence-choices/README.md)） | 一次读写事务、显式锁，首胜可以写成同一行上的条件写 | 执行记录与[会话日志](../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log)要在**同一个事务**里写（主线裁定），这需要会话日志的追加能加入调用方的事务——块 D 的契约尚未给出 |
| 时长、等待上限、转后台计时 | [`infra/clock`](../../../realization/packages/infra/clock/README.md) | `now()` 不后退 | — |
| 内核语义 | [`core/kernel-basis`](../../../realization/packages/core/kernel-basis/README.md) 的八条 probe；[basis](../../../basis/README.md) 的八条条目 | 本包用到的机制主张都引条目 id | 「宿主重跑会收掉在途执行」**没有 probe**（[X-6](../tool-execution-runtime-baseline/alternatives.md#仍待区分的实验)）；H-1～H-4 是假设，见[草图依赖的前提](#草图依赖的前提与会推翻它的证据) |
| 五个 #8 对象的契约 | **无已接受契约**；五份能力契约加 `capability.hooks-import`、`data.mcp-endpoint` 正在并行起草 | — | 本包只能按简报里的候选操作讨论服务面 |
| 放行判断的实现 | **本批不交付**（用户 2026-09-23 的裁决，由步骤 A 转述，状态「继承待核对」） | — | 按「缺席即全拒」，[可独立运行的装配里一个工具也执行不了](#交接缺口) |
| 决策卡片、执行环境落点、卸载判定 | **无契约**（PF-008、PF-005、PF-006 自带件） | — | 挡 `Ask()` 等待、elicitation、放行出卡、落点求值、`storeRaw` 所指的存储这几项的定稿 |
| 装配 | [`apps/tenancy-host`](../../../realization/apps/tenancy-host/README.md)（租户领域）、[`apps/cli`](../../../realization/apps/cli/architecture.md)（候选） | 存储、时钟怎么承接已有先例 | 可独立运行的装配节点**不存在**，名字待拍板；它没有对应的 PF，见[交接缺口](#交接缺口) |

## 剩余责任与能力演化

**五项新的独立责任**。每一项都查过现有能力及其组合，扩展哪一项都会混进另一份独立责任：

| 剩余问题 | 关系 | 为什么不并进已有能力，它自己承诺什么、依赖什么 |
|---|---|---|
| 以会话为宿主、比 agent runtime 活得长的一次执行：前后台 × 等待态、六种收场、中断、停机与恢复、送达、报账 | **新增**（[D-032](../../decisions/tool-execution-runtime-baseline/README.md) 已定为自研起点） | 没有别的能力拥有「一次执行」。承诺：K-1、K-2、K-7。依赖：存储、时钟（必需）；会话日志追加、落点求值、流装配器（可选取用）。和 agent loop 的交接点只有两处：「提交一批已放行的调用」与「等某次前台调用落定」 |
| 一个会话此刻认得什么：按类别的快照、reload 一族、每次尝试现算可用性与替换件 | **新增** | 块 A 的资产求值回答「这个范围此刻生效什么」，注册表回答「这个会话此刻认得什么」，两者的失效事件不同。硬塞进求值服务，就是悄悄扩大它的责任。依赖：资产求值（必需）；MCP 桥、执行者表（可选取用） |
| 在一个拓展点上按清单顺序逐件求值、落结论、执行报错策略、回放 | **新增** | agent loop 能力**还没有契约**，没有可以扩展的已有承诺；而拓展件的作者（自带件分属三个块、compat 件、租户自己的件）要一个独立于 agent loop 版本的公开协议。依赖：会话日志读写（必需）；各件实现走登记，可以缺席 |
| 放行四步的入出与判定次序 | **新增**（本批只有接口） | 授权政策的失效事件（PF-007／PF-008）与派发协议（PF-012）不同；它有第二个消费者，就是执行运行时核对凭据 |
| 连接 MCP 接入点、取回并持久保存动作清单、把动作投影成工具定义、作为执行者调用动作 | **新增**（[D-037](../../decisions/mcp-client-adoption/README.md) 已定路径） | 独立的变化原因是 MCP SDK 与桥接范围；它有自己的活资源（连接、stdio 子进程）；消费者是注册表与执行运行时两方 |

**不是能力维度，而是贡献**（向某个服务登记，登记的寿命等于贡献者 fiber 的寿命）：

| 贡献 | 登记给谁 | 为什么不单立维度 |
|---|---|---|
| 执行者（子进程、进程内函数、技能脚本、MCP 动作、样例工具） | 执行运行时 | 只有一个消费者，随运行时一起变；在运行时契约里作为「执行者登记」一节即可 |
| 卸载判定（系统自带件，归 PF-006） | 派发器（`after_action`，范围＝这一个）；它调用运行时的「存原始结果」 | 它是一件拓展件实现。**它的契约没有家**（主线已记为缺口），所以节点也立不起来 |
| compat 实现（`implementation.kind: compat`） | 派发器 | 它是一件拓展件实现；导入与方言映射表归 `capability.hooks-import` |
| meta 的几扇门（`Tools()`、`Skills()`、`BkgJobs()`、`Ask()`） | 执行运行时（作为官方工具的执行者） | 不在本包范围，这里只指出它们是消费者和贡献者 |

**所有候选都会出现的两条反查信号**（它们不区分候选，但每个候选都要承接）：

- **跨 owner 同提交**：执行记录落收场，与会话日志追加结果消息，要在同一次提交里完成（K-7）。执行运行时和会话日志的拥有者不是同一方。
  主线的裁定是「同一存储、同一约束域，装配给」。**提供者设计要指出两个写入者共同触碰的那个存储对象**：要么会话日志的追加能加入运行时的事务，
  要么改成发件箱的形状——行上标「待送达」，再按（`CallId`, 前台段／后台段）幂等追加。见[交接缺口](#交接缺口)。
- **重复拥有同一事实**：注册表快照与[装配清单](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)都在记「这个会话装了什么」。
  主线的裁定是快照不持久、重启时由清单加求值重填，清单是唯一权威。**这条裁定要成立，有一个前提**：reload 的结果必须也记在清单里，
  否则一次重启就会在人不知情时改掉会话的命令集（[PF-002 §4 Slash Command](../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)）。见[交接缺口](#交接缺口)。

## 取舍入口

见 [alternatives.md](alternatives.md)。五个候选逐个对照 K-1～K-8，写明失去的保护点、反查信号和可计数代价；另有两个子选择、推荐、改票条件和仍待区分的调查。**推荐不是接受。**

## 装配草图与为什么这样切

> **本节可以独立成立**：提供者设计和投影会引用它。它按推荐候选 C 的边界来画——换成 B，只改「领域」那一层标注；换成 D，只改执行宿主那一格。
> 机制语义只引用 [basis](../../../basis/README.md) 条目 id；basis 没有覆盖的，标假设 `H-n`（见本节末表），不在这里推导上游行为。产品依据写到小节和 rev。
> 主线在读数之后作的裁定标「主线裁定」，**都还没有经产品负责人签字**。本节是**候选装配**，不是已接受的设计。
> 来源：块 B 机制读数 §4（任务区，2026-09-23），已按对账和主线裁定改写；原件不作依据。

### 草图

```text
据点侧进程（无词条：承载会话据点的那个进程；可独立运行时由候选装配节点承载，名待拍板）
└─ 根 Context
   ├─ [装配给] 存储（core/storage 协议的提供者）· 时钟 · 会话日志的读写与追加（块 D）   ← 本块不拥有
   │
   │  ══ 领域 tools（候选名，待拍板）══
   ├─ tool-execution-runtime        宿主插件；inject：存储、时钟（只这两样）
   │   ├ 提供：工具执行运行时服务
   │   ├ 持有：活体表（CallId → 执行 fiber）· 执行者表（登记来的）· 内建「必得不可用」执行者（替换件走它）
   │   ├ 起来时：恢复扫描——全部非终局行 → 回收登记过的进程组 → 同一行上首胜写「失败·异常中断」
   │   │         → 送达（前台追补占位 / 后台追补提醒）→ 关闭阻塞在该执行上的卡片（superseded，主线裁定）
   │   │         扫完才对外提供服务
   │   └─ 执行 fiber × N             inject：无；插件体只跑一次
   │        └ 一个收口 effect：取消信号 → 宽限 → 杀进程组 → 回收 → 释放无状态沙箱 → 撤转后台计时器
   │
   ├─ asset-registry                inject：资产求值（块 A）；装配清单经其读面取（读面归属未定）
   │   └ 数据：按（会话, 类别）的快照，不持久；重启由装配清单 + 求值重填（主线裁定）
   │           可用性与替换件每次执行尝试现算；MCP 动作集在一次执行尝试内钉住（主线裁定）
   │
   ├─ mcp-bridge                    inject：存储（动作清单副本持久）
   │   ├ 贡献：执行者「MCP 动作」→ tool-execution-runtime（effect）
   │   └─ 连接 fiber × 键           inject：无；键 =（租户, 接入点能力标识, 持有所在层, 凭据代际）
   │        └ 一个收口 effect：关传输 → 终止 stdio 进程组 → 排空 stderr；挂起的调用各自落失败、不重放
   │
   ├─ tool-admission                本批只有接口、没有提供者；到位时贡献 before_action 末一件（effect）
   ├─ 贡献者（tools）：样例工具（登记执行者 + 定义作资产种子）· 卸载判定（登记 after_action 一件；契约无家）
   │
   │  ══ agent loop 那一侧的领域（名待拍板）══
   ├─ loop-extension-runner         inject：会话日志读写（块 D）
   │   └ 持有：拓展件实现表（登记来的）；派发跑在调用方（agent runtime）的协程上
   ├─ hooks-compat                  贡献 compat 实现（effect）；导入经块 A 建资产（capability.hooks-import）
   │
   │  ══ 别的块 ══
   ├─ 模态转换、重试（块 C）· 循环探测（agent loop 一侧）——各自登记为拓展件实现（effect）
   └─（消费者，将来）agent loop / agent runtime fiber：inject 工具执行运行时、注册表、派发器——能承受重跑
```

**贡献的统一形状**：执行者和拓展件实现都这样接上去——向目标服务登记，拿回一个注销函数，包进贡献者自己的 `ctx.effect`。
**登记的寿命等于贡献者 fiber 的寿命**，撤除责任随之明确。贡献者 inject 目标服务，目标服务换代时，贡献者重跑并重新登记（贡献者没有活状态，承受得起）。
**目标服务从不 inject 贡献者**：写进 inject 就等于说「没有它我不跑」，与「不可用即视作卸载」正好相反（[`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md)）。

### 服务面与依赖边

操作名是简报里的候选，**名字归契约**。

| 服务 | 对外（候选） | inject（必需） | 可选取用（缺席时怎样） |
|---|---|---|---|
| 工具执行运行时 | 提交一批已放行的调用（整批核对凭据与参数摘要，批内依次执行，主线裁定）· 等某次前台调用落定（可以重等）· 中断一次或一批（带发起者）· 转后台（自动／用户／插队）· 中断某次运行的全部前台执行 · 中断某个会话的全部执行（归档）· 答复等待（可以多次）· 查一次执行 · 列本会话的后台执行 · 列活体（对账用）· 执行尝试开始时对账 · 存原始结果（给卸载判定）· 登记执行者 · 工具侧的发帧与报账原语 | 存储、时钟 | 会话日志追加（缺席：收场留在行上并标「待送达」，日志回来后补送）· 放行结论的读取（凭据就是日志里那条结论的引用；缺席：一律不执行）· 落点求值（缺席：要求隔离落点的一律拒，宿主机落点按权限）· 流装配器（缺席：帧丢弃，不影响执行） |
| 注册表 | 填 · 按类别重填（plugin 连带成员）· ③ 型失败后标记、下一次尝试前自动重填 · 算可用性与替换件 · 查 / 列 | 资产求值（块 A） | MCP 桥的投影与可用性（缺席：该接入点的全部动作按钉住的形状装替换件）· 执行者表（缺少某种执行者：对应的工具不可用） |
| 派发器 | 在一个位置、带维度与 subject 派发一次（逐件顺序求值）· 回放 · 登记实现 | 会话日志读写（块 D） | 各件实现（缺席：视作卸载，记一笔；**放行判断例外：整批拒**，主线裁定） |
| 放行判断的提供者 | `before_action` 末一件；草稿出卡；给结论带凭据 | 待定（授权表达的读面、执行权限的求值） | — |
| MCP 桥 | 刷新动作清单副本 · 投影为工具定义 · 可用性 · OAuth 交互（交互面归 PF-016；D-037 那三件产品面事项未闭合）· 执行者「MCP 动作」 | 存储 | 凭据读面（块 A；缺席：连不上） |

**agent runtime inject 运行时、注册表和派发器是对的**：它本来就按「日志还在，重算 `f`」来设计（[PF-012 §5.7](../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)），被卸载重跑就是一次新的尝试。

### 装卸配对

| 装载者 | 取得或建立什么 | 何时对外可用 | 部分失败怎么收口 | 撤除时 | 保留什么事实 | 谁观察完成 |
|---|---|---|---|---|---|---|
| 执行宿主 | 服务、活体表、执行者表 | **恢复扫描完成之后** | 存储缺席 ⇒ PENDING（[`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md)）；扫描抛出 ⇒ `FAILED`，什么服务都不出现（[`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md)） | 进入 UNLOADING 之后拒收新的提交；子 fiber 随之卸载（H-1）；**不指望撤除时写收场**——那是下一任宿主恢复扫描的事，撤除时可以顺手做同一个首胜写，但不依赖它（H-9） | 执行记录、账 | 下一任宿主的恢复扫描 |
| 一次执行 | 行先落下（持久意图先于外部效果）→ 起 fiber → 执行者开始 | 行落下，即可用 `CallId` 指认 | **起进程失败 ⇒ 收场「失败」**，不是「被中断」 | 首胜写收场 → 卸载 fiber → 收口 effect 按次序释放；收口出错自行记进账（[`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)） | 行上的收场、原因、发起者、账；已送达的消息 | 行上有收场，且活体表里没有它 |
| 转后台计时器 | 一个定时 | 前台开始时 | — | 姿态变化、落收场或那次执行卸载时撤（H-2） | — | — |
| 执行者登记 | 执行者表里的一项 | 登记即可用 | 贡献者 `FAILED` ⇒ 没有登记 ⇒ 下一次尝试时该工具装替换件 | 注销；**在途执行照常跑完**，撤下只影响新的提交（主线裁定）。**例外：MCP 执行**——它的连接归桥的连接 fiber，桥一撤，挂起的调用就各自落失败（见[交接缺口](#交接缺口)） | — | 执行者表 |
| 注册表快照 | 一份快照 | 快照落下即生效 | 求值失败 ⇒ 不产生半份，明确失败 | 服务撤除时快照随之消失；重启由清单加求值重填（主线裁定） | 无（清单是权威） | — |
| 拓展件实现登记 | 实现表里的一项 | 登记即可用 | — | 注销 ⇒ 下一次派发时记「此刻不在」 | — | 实现表 |
| MCP 连接 | 传输 + stdio 子进程 + 握手 + 列举 | 列举完成、副本写回之后 | 握手失败 ⇒ 该连接 `FAILED` ⇒ 连不上（[`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md)） | 一个 effect：关传输 → 终止进程组 → 排空 stderr；挂起的调用各自落失败，不重放 | 动作清单副本（持久） | 桥的连接表 |
| compat 派发 | 一个 hook 子进程 | — | 路径不存在或落点不可用 ⇒ 视作卸载；非零非 2 退出、超时 ⇒ 报错，按档处置（[D-033](../../decisions/hooks-compat-baseline/README.md) 推迟的 [G4](../hooks-compat-baseline/design.md#交接缺口)，主线裁定，待确认） | 随那次派发的取消信号杀进程组（宿主是 agent runtime） | 结论一笔 | 派发器 |

### 事件与控制通道

| 通道 | 性质 | 派发方式 | 依据 |
|---|---|---|---|
| 拓展件派发（含放行判断） | 控制，异步 | **派发器自己按清单顺序逐件 await**，不走 Cordis 事件 | 次序是装配清单顺序（D-058 Q8），成员是本会话的数据；[`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md)；[`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md) |
| 提交、中断、转后台、答复等待、成批中断 | 控制 | 直接调用运行时 | — |
| ③ 型流程 | 控制 | 可选取用目标服务后直接调用；缺席就是那项服务明说的一次失败 | [`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md) |
| 发帧 | 数据流 | 调流装配器的追加，**不阻塞、不失败** | [PF-006 §4 发帧](../../../product/PF-006-tools-and-skills/design.md#发帧)；D-058 Q4、Q18 |
| 执行结束、注册表某张表的内容换了 | 通知 | `emit`，**发送方包住**；只作提示，正确性来自日志与存储 | [`emit-listener-throw-propagates`](../../../basis/cordis/emit-listener-throw-propagates.md) |
| MCP `tools/list_changed` | 通知（对端发来） | 只记一笔，下一次执行尝试开始前重取 | D-037 |

**名字相同、含义不同**：PF-012 说的「瀑布式」是产品词，意思是「按声明顺序依次过，前一件的输出是后一件的输入」；
Cordis 的 `waterfall` 是环绕式中间件（H-5），拓展件拿到 `next` 就能调用多次，这正是 PF-012 装不进的那一半。契约和提供者设计里不要单写「瀑布」两个字。

### 为什么这样切

1. **执行宿主不在 agent runtime 之下**（K-1）：放在它下面，每回收一次就带走一批执行（H-1）；放在外面，这条性质由结构给出，不靠补丁。D-032 的起点形状就是这样。
2. **执行宿主与注册表分开**（K-3）：注册表 inject 资产求值，而求值的提供者会随资产治理的演进换代。两者若同在一条 fiber，
   **求值提供者每换代一次，就是一次全部在途执行的停机**。代价可以数：换代次数 × 在途执行数。宿主的 inject 面必须最小。
3. **执行宿主与 MCP 桥分开**（K-3、K-6）：桥随 MCP SDK 版本和桥接范围变化，它换代不该让本地工具的执行跟着停。桥以**贡献执行者**的方式接到宿主上，宿主不 inject 桥。
4. **派发器与执行宿主分开**：拓展件那段执行的宿主是 agent runtime，工具执行的宿主是会话（[PF-012 §6.13](../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)）。
   两者寿命不同，取消语义也不同：前者随运行取消而停，后者只有前台的随之停。放在一起，就得在一个服务里维护两套取消规则。
5. **放行提供者与派发器分开**（K-4、K-5）：授权政策（PF-007／PF-008）与派发协议（PF-012）的失效事件不同；而且本批只交接口——派发器在它缺席时也要能跑，执行运行时在它缺席时要 fail-closed。
6. **不按会话、租户、运行开 fiber 或 isolate**：它们之间差的是数据（[`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md)）；实例数随会话数上涨，违背「完全动态、长期待机」。
7. **执行 fiber 与连接 fiber 什么都不 inject**（K-2）：插件体重跑，就是把外部效果再做一遍（[`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)；D-037「不重放已发出的调用」）。
8. **控制不走 Cordis 事件**：次序和成员都是会话级数据，而 Cordis 的次序是注册序、监听者对整棵树可见（H-6、H-7）；异步控制误用 `bail` 会静默扭曲判定（[`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md)）。
9. **派发器和 hooks 兼容层落在 agent loop 那一侧的领域**（推荐候选 C 相对于 B 的差别）：派发器的拥有者、宿主和唯一的运行时调用方都在那一侧，
   读数之后给它追加的裁定，凡是改语义的，改的都是 loop 语义或各块自带件的缺席处置，没有一条涉及执行运行时（[归属画像](#五个对象的归属画像)）。向它登记的贡献者分属三个块，但它们经公开契约登记，
   跨领域登记**不是**同步修改的信号。hooks 兼容层的方言跟着两家宿主的版本漂移（[研究](../../../../research/loop-extension-hooks-compat/research.md)），它只在拓展点协议之上工作，所以与派发器同属一侧。
10. **hooks 的导入移出派发器契约**（主线裁定）：方言映射随 Claude Code／Codex 的版本变；它若留在派发器契约里，每次宿主升级都要给派发器出新版本。D-058 Q10 也说「运行时只认统一的入出」。

### 为什么不拆

| 不拆的东西 | 拆开会怎样 | 反查信号 |
|---|---|---|
| 前后台姿态、等待态、收场和账**不拆成各自的服务**，都是执行记录同一行上的列 | 转后台、答复等待、中断、归档、恢复、正常完成这六路会争同一次执行的状态；拆到几个服务，就要跨 owner 同提交，而首胜只能是同一行上的条件写（进程内锁和时间谓词都不算） | 跨 owner 同提交 |
| 转后台计时器不拆成独立服务 | 它的触发与完成竞争同一行；拆出去，就要有第二份「这次执行现在是不是前台」的事实 | 重复拥有同一事实 |
| 结果送达的判断（落 ToolMessage 还是 SystemReminderMessage）不拆出运行时 | 判断的依据是「这个 `CallId` 有没有占位」，只有写占位的一方同时知道姿态何时变；拆出去，就是两个写入者对同一个 `CallId` 的消息各判一次 | 跨 owner 同提交 |
| 发帧不拆成插件 | 帧没有自己的生命周期（与执行同生同灭），也没有自己的消费者契约（消费者是流装配器）；拼到一半的在途状态由运行时持有（D-058 Q18） | 只是把需求名改成插件名 |
| 执行者接口不拆成独立契约 | 它只有一个消费者（运行时），随运行时变 | — |
| 动作清单副本不拆出桥 | 写它的只有桥；拆出去就多了第二个写入者的入口 | 重复拥有同一事实 |
| 放行凭据不单立服务 | 凭据就是日志里那条放行结论的引用加参数摘要，任何一方读日志都能核对，跨进程也一样 | — |
| 卸载**不放进**运行时（反方向：不合并） | 卸载判定是 `after_action` 上的一件拓展件，执行这件事的逻辑在 agent loop 里（[PF-006 §6.10](../../../product/PF-006-tools-and-skills/design.md#执行这件事的逻辑在-agent-loop-里)）。放进运行时，就把「结果大」和「怎么跑」耦合起来了 | — |

### 装配给与协议给

这是 F 第四问的预答。**契约要把这张表写进去**。

| 保证 | 单机时由谁给（装配给） | 分布式时协议必须兑现什么 |
|---|---|---|
| agent runtime 被回收不影响执行 | 执行 fiber 不在 agent runtime 的 fiber 之下 | 运行时在别的节点上时自然成立；但 agent runtime **等一次前台调用**要改成按 `CallId` 的协议等待（读日志或订阅），不能是进程内的一个等待 |
| 「工具执行运行时里找得到／找不到」 | 同一进程里的活体表 | 要有租约或心跳来判定「找不到」；**执行节点失联 = 这些执行失去连续性 = 失败** |
| 收场首胜 | 同一存储、同一行上的条件写 | 存储仍须单写者、可串行化；不能按节点各写各的行 |
| 收场、账与结果消息同一提交 | 执行记录与会话日志同一存储、同一事务（主线裁定） | 行上标「待送达」＋ 按（`CallId`, 段）幂等追加 |
| 结果只送达一次、送到对的调用上 | 运行时是唯一的送达方；`CallId` 在会话日志内唯一 | 送达按（`CallId`, 前台段／后台段）幂等；`CallId` 的登记跨节点串行化，或按节点分域 |
| 放行凭据可核对 | 读同一份日志 | 凭据是日志引用，任何节点读日志即可核对——**这正是把凭据设计成日志引用、而不是进程内对象的理由** |
| stdio MCP 服务端在据点侧的机器上 | D-037 本版的取值 | 「可换落点」是将来的拓展点（D-037） |
| 拓展件实现在进程内登记 | 实现表 | 远端实现要有协议；回放语义不变（按日志） |

**部署亲和**：{agent loop, 派发器, 注册表} 读写的都是会话日志和会话级快照，天然跟 agent runtime 放在一起；{执行运行时, MCP 桥} 持有外部进程与连接，将来可以放到执行节点上。
推荐的切法与这条缝一致（K-8）。

### 两源已知失败情形落到哪里

[D-032](../../decisions/tool-execution-runtime-baseline/README.md) 要把两源已知失败情形列成测试义务。本草图的承接处如下：

| 已知失败情形 | 承接处 |
|---|---|
| 撤除时 cancel 抛错要强制结算 | 收场先落、停止后发；收口 effect 包住每一步，错误记进账 |
| 同 id 换实例不串台 | 身份是 `CallId`，不是 fiber uid；执行者的晚到回调先核对「行上没有收场，且活体表里是同一条 fiber」，否则丢弃 |
| 停止与 I/O 交错（含 local-execution 那组反例） | 同一行首胜；收场之后到达的 I/O 完成一律丢弃，账里记「外部效果可能已发生」 |
| bash spawn 失败被记成 killed | 起进程失败落「失败」，不落「被中断」 |
| 进程被强杀后子进程还活着 | 恢复扫描先回收登记过的进程组，再写失败；进程组标识随行保存（在账里） |

### 草图依赖的前提与会推翻它的证据

| 前提 | 若不成立 |
|---|---|
| H-1 子 fiber 随父 fiber 卸载 | 宿主或桥撤除时，活体与连接变成孤儿，「找不到」就不可信；要改成在撤除 effect 里显式卸载活体表与连接表。契约条款不变 |
| 待核对主张：宿主因必需服务换代而重跑时，在途执行会被收掉（由 [`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md) ＋ [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) ＋ H-1 推出，**无单独 probe**，即 [X-6](../tool-execution-runtime-baseline/alternatives.md#仍待区分的实验)），并且这种换代很少发生 | 换代若成了常态（存储提供者在进程内撤换），改用候选 D 的两条 fiber |
| H-4 没有 inject、不调 `fiber.update` 时，插件体不会因为别的原因重跑 | 执行 fiber 要改成「在 effect 里起进程 ＋ 幂等守卫（行上已有收场就不起）」 |
| `core/storage` 能表达同一行上的条件写 | 首胜无处可写，整个草图的并发正确性失去依托 |
| 会话日志的追加能加入运行时的存储事务（主线裁定「同一存储」的落地方式） | 改成发件箱的形状：行上标「待送达」＋ 按（`CallId`, 段）幂等追加 |
| 装配清单记下了 reload 的结果（主线裁定「快照不持久」的前提） | 重启后按清单加**当前**求值重填，会在人不知情时改掉命令集；要么清单追加 reload 结果，要么快照改为持久 |
| 产品维持「停了不重来，没有例外」 | 若为 `Ask()` 开例外，它的等待要能从卡片与答复重建，执行 fiber「插件体只跑一次」对它不再成立 |

本节用到的假设（basis 没有覆盖；出处是手册的 4.0.2 最小内核模型或推断，**采用版本是 4.0.4，补 probe 时按 4.0.4 重核**。
编号沿用块 B 机制读数，本节用不到的几条略去，所以编号不连续）：

| # | 假设 | 影响哪里 |
|---|---|---|
| H-1 | 子 fiber 的卸载登记为父 fiber 的一个 effect，父卸载必然带走子 | 宿主撤除、候选 D |
| H-2 | `ctx.effect` 返回的撤除函数可以单独提前调用，只撤那一个 effect | 计时器、执行者与实现的注销 |
| H-3 | 对一条子 fiber 调 `dispose()` 只卸载它，不牵连兄弟与父；子插件重跑不牵连父 | 单独中断；候选 D 的门面重跑 |
| H-4 | 没有 inject、不调 `fiber.update` 时，插件体不会因别的原因重跑 | K-2 |
| H-5 | `waterfall` 是环绕式中间件，外层先跑，件拿到 `next` | 派发器不用它（结论不依赖此假设） |
| H-6 | `serial` 与 `emit` 同一派发次序，是注册序 | 同上 |
| H-7 | 不带 thisArg 的派发不过滤，监听者对整棵树可见 | 同上 |
| H-9 | 进程被杀时，disposer 不保证会运行（操作系统事实，不是 Cordis 主张） | 恢复扫描是唯一的权威 |

## 领域与包布局

> **整节待产品负责人拍板。**下面的路径是**候选**，照[两层布局](../../../realization/README.md#packages-的两层布局)与 [D-024](../../decisions/tenancy-domain-name/README.md) 的先例写出；
> 节点名与包名同名。没有契约的贡献立不起 provider 节点（[准入门槛](../../../realization/README.md#准入门槛与停止条件)）。

| 候选路径 | 兑现的契约 | 形态 | 备注 |
|---|---|---|---|
| `packages/tools/tool-execution-runtime` | `capability.tool-execution-runtime` | 宿主插件 + 每次执行一条子 fiber | 内建「必得不可用」执行者 |
| `packages/tools/asset-registry` | `capability.asset-registry` | 插件 | **子选择**：也可能归块 A 的领域，与块 A 拆分提案有接缝（[交接缺口](#交接缺口)） |
| `packages/tools/mcp-bridge` | `capability.mcp-bridge` | 插件 + 每条连接一条子 fiber | 官方 SDK 作一般依赖（D-037） |
| `packages/core/mcp-endpoint`、`packages/core/tool-definition`、`packages/core/loop-extension` | 三份 `data.*` | 纯模块 | `data.*` 契约落 `core/` |
| 放行判断的提供者 | `capability.tool-admission` | **本批不建节点**（没有提供者） | 将来落在哪，是子选择二 |
| `packages/<loop 领域>/loop-extension-runner` | `capability.loop-extension-runner` | 插件 | 领域名待拍板；照 D-024 先例，可取与 [UL-agent-loop](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-loop--agent-loop--agent-loop) 英文正式名同根的 `agent-loop`——**这只是一个候选写法** |
| `packages/<loop 领域>/hooks-compat` | `capability.hooks-import` ＋ compat 实现 | 插件（贡献者） | 包含 D-033 的 hook-protocol fork（自有模块） |
| 样例工具、卸载判定 | 无能力契约 | 贡献者 | 样例工具要不要立节点、立在哪，归实现映射；卸载判定契约无家 |
| `apps/runtime-host`（候选名） | 装配 | assembly | **没有对应的 PF**，见[交接缺口](#交接缺口) |

若产品负责人选 B（只定一个领域名），第二层全部取 `tools`，并在派发器与 hooks 兼容两个节点的 README 里写下搬迁触发条件：agent loop 的节点建立之时。

## 证据义务与受阻消费

| 依赖的性质与前提 | 保护者或环境责任 | 所需证据与当前结果 | 闭合条件、负责产物及受影响的选择 |
|---|---|---|---|
| H-1、H-2、H-4，以及「宿主重跑收掉在途执行」 | `core/kernel-basis` 的 probe | **无 probe** | 提供者设计开工前补齐；它们只改提供者设计，不改契约条款，也不改本包的选择 |
| H-3「子插件重跑不牵连父」 | 同上 | **无 probe** | 只在候选 D 重新上桌时才需要 |
| 派发器与 agent loop 同步修改的证据 | 读数之后主线给派发器追加的裁定（待确认）；将来 agent loop 契约起草时的修订记录 | 只有那一批裁定，**尚无 agent loop 契约可以对照** | [Y-1](alternatives.md#仍待区分的调查)；影响 B 与 C 之间的选择 |
| 执行记录与会话日志同一事务 | 块 D 会话日志契约；运行时提供者设计 | 未起草 | 两边契约都写出共同的存储对象；否则按发件箱的形状 |
| 装配清单记下 reload 的结果 | PF-004 与注册表契约 | 未核 | 注册表契约起草时核实；影响「快照不持久」这条裁定 |
| 放行判断缺席即整批拒、停机后关闭孤卡 | 产品负责人（U-5、U-6） | 主线已按甲起草，**未签字** | 签字前，依赖它们的条款标「待确认」 |

## 交接缺口

| # | 缺口 | 影响谁 | 负责者 | 闭合条件 |
|---|---|---|---|---|
| 1 | **按现在的裁定，可独立运行的装配连一个工具也执行不了**：放行判断的实现本批不交付，而「放行判断缺席即整批拒」加上「运行时只执行带凭据的调用」，会让每一批都被拒 | 可独立运行的交付范围；候选装配节点 | 主线 → 产品负责人 | 三选一：交付一个只做第 ①② 步的最小提供者（第 ③④ 步碰到 `auto_permission` 需要卡片契约）；给可独立运行的装配另定一个不对外的放行件，并写明它不是产品行为；或者把「可独立运行」的验收改成只跑到放行为止 |
| 2 | **注册表归哪个领域**，与并行的块 A 拆分提案有接缝（本包未读那份提案） | `asset-registry` 节点路径；资产求值的提供者 | 主线 | 两份提案对齐成一个答案；本包推荐 `tools`，改票条件见 [alternatives](alternatives.md#两个子选择) |
| 3 | `apps/runtime-host` 没有对应的 PF。按[准入门槛](../../../realization/README.md#准入门槛与停止条件)，「没有 PF 的应用不建节点」 | 可独立运行的装配 | 主线 | 要么为它开 PF（或指到已有的交付面 PF），要么把它定为测试装配、不作为 assembly 节点 |
| 4 | 主线裁定「撤下执行者后在途执行照常跑完」**对 MCP 执行不成立**：MCP 调用的连接归桥的连接 fiber，桥一换代或被撤下，挂起的调用各自落失败 | 运行时契约的执行者登记一节；桥契约的收口义务 | 主线 | 裁定补一句 MCP 例外；或者把「连接归桥」改成「调用期间连接由执行持有」（这会改桥的连接模型） |
| 5 | 卸载判定的契约没有家，节点立不起来；「存原始结果」所指的存储也未定义 | 卸载判定这件自带件；K-7 中「原始结果不进日志」一条 | PF-006 owner、主线 | 主线已记为缺口，本包只指出它对拆分的影响：它是 `tools` 领域的贡献者 |
| 6 | 执行记录与会话日志同一事务，缺少共同的存储对象（跨 owner 同提交） | 运行时与会话日志两份契约的提供者设计 | 块 D 会话日志契约、运行时提供者设计 | 写出共同触碰的存储对象，或者改用发件箱 |
| 7 | 装配清单是否记下 reload 的结果 | 「快照不持久」这条裁定是否成立 | PF-004 owner、注册表契约起草者 | 核实；不成立就改裁定 |
| 8 | [proposals 索引](../README.md#当前主题)尚未收录本包 | 读者导航 | 主线 | 登记一行 |
| 9 | 无词条的概念：注册表、执行者、执行宿主、派发器、放行凭据、MCP 接入点连接、动作清单持久副本、执行记录、据点侧进程 | 契约与提供者设计的用词 | 词表 owner | 其中「注册表」已经在 PF-002 的散文和 UL-session-slash-command-set 的定义里被当名词用；「动作清单持久副本」对 agent 可见——这两个先判 |

评审处置见 [review.md](review.md)；实际决定与下游入口从 [README](README.md#后续消费) 导航。
