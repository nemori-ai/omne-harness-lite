# demo 冷恢复宿主的窄实施映射

2026-09-28，revision 1，**candidate，未技术采用，新增 bindings 0，尚无本增量运行验证**。节点仍为 `packages/model/model-request-runtime`；本页补该节点已有恢复端口在开发示例 `examples/model-invocation-minimal-demo` 的真实宿主绑定。没有新产品应用、一般进程平台、Run/Session 生命周期能力或第十四操作。本页按既有性质补绑定，未做、也不声称双盲新架构。新名称与接口均为**候选**，不是已存在的 API。

## 输入、分层状态与范围

源码基线 `c68868e8c07880172a7df37c6850707c97fb21fa`。catalog 基线 `omne-harness-lite-design-2026-09-15` 中 RT9、MR8、SL3 均为 accepted；以下为本次实际读取的 SHA256。

| 输入 | SHA256／采用依据 |
|---|---|
| [capability.model-request-runtime/v9](../../../../spec/capabilities/model-request-runtime/v9/contract.md)，S-17/S-33/S-36/S-38/S-69～S-72 | `3ae5ee1843a31cb229a11c77a35c2bdc66e51100953322be0febed1ef37e64fb`；[D-104](../../../../record/decisions/model-recovery-timing-adoption/decision.md) |
| [data.model-response/v8](../../../../spec/data/model-response/v8/contract.md)，S-17/S-18 | `34b78e9c55df99fa8ea3756c98010914fae92a56375a429316e7fdafb966fe13`；D-104 |
| [capability.session-log/v3](../../../../spec/capabilities/session-log/v3/contract.md)，S-13/S-14/S-19/S-21～S-23/S-33～S-35 | `f327f1289e1d6c539dd959e8862b382869e3d303cf984b6a773fdd6a00e4bd26`；[D-083](../../../../record/decisions/session-log-tail-condition-adoption/decision.md) |
| [runtime v12 revision 1](v12-recovery-timing-design.md) | `66da0f35031af73e2994c778e23d5bdcbe8fccefca83f4337084b134b2c4aa11`；[D-105](../../../../record/decisions/model-recovery-timing-provider-adoption/decision.md) |
| [v12 留存补充 revision 1](v12-recovery-owner-supplement.md) | `49484bf1597667c7b2e27279d5084e8acca958f82136b8f7625b40696e8b6ba7`；D-105 追加采用 |
| [session-log-jsonl v3 恢复 rev 2](../../session/session-log-jsonl/v3-recovery-design.md) | `ea205862968dbe54889d7ba4b80ffcb33e04318c5ba8a82fb09367c1bbd324ae`；[D-085](../../../../record/decisions/session-log-recovery-projection-adoption/decision.md) 已采用，原稿 candidate 字样不撤销采用 |
| 组合 close／宿主与观察端口 | [D-102](../../../../record/decisions/model-runtime-owner-close-adoption/decision.md)、[D-103](../../../../record/decisions/model-runtime-host-observer-adoption/decision.md)，有效承诺全部保留 |

- **语义接受**：上述已接受契约；需求来源沿 RT9 的 PF-013/PF-015 引用，不追加产品政策。
- **可实施**：本候选须独立评审、主线精确采用；本页自身不授权施工。
- **绑定证据**：新增 0。后文 C14-V 是待执行义务，未绑未运行的测试。
- **实际验证**：当前源码的冷入口不成立；真实 kill 后原 dispatched/opened 可读，但恢复因旧 `callHosts` 缺席而 unavailable。该失败只说明宿主组合缺口，不否定 runtime 已有 absent 分支。

本次闭合目标是：**同一存活部署主管见证长期 worker 真正退出后，由后继 worker 在原目录唯一重新承载 noRun 会话并对账**。主管自身死去且新主管没有可靠历史时，必须 unknown；本页不把这项已有不可判分支改成自动恢复，也不宣称关闭 D-085 所有跨主管重启义务。

## 契约责任到兑现点

| 契约责任 | 构件／操作 | 候选实施与版本 | 符合性依据或缺口 |
|---|---|---|---|
| SL3 S-21/S-23/S-35，D-085 ProcessOwnership | demo 主管持有 worker 实例；worker 注入真实生命身份及退出观察 | 示例 `demo.ts`、新增局部 `demo-worker.ts`／`demo-supervisor.ts`；公开日志端口不变 | C14-V1/V5/V8；Node child 语义仍须来源核对 |
| RT9 S-33②，同一会话唯一重承载 | `openDemo` 先认证、借用日志、对账，再开放新调用 | 示例 `bootstrap.ts` 拆恢复日志借用与调用准备 | C14-V1/V2/V6；无完整 session owner 交付声明 |
| RT9 S-17/S-33，原 owner 有无不得混淆 | `RuntimeRecoveryScope.originalInvocation` 的 cold absent 与 warm original 分支 | `service-types.ts` 缩窄恢复 binding，`bootstrap.ts` 建真正冷 scope | C14-V3/V5；空 Map 不构成证据 |
| RT9 S-33/S-69～S-72，原批优先／零 HTTP | 既有 `createRuntimeReconcile`、codec、coordinator | 复用 D-105 已采用路径，不另写恢复表 | C14-V1～V4/V7 |
| MR8 S-17/S-18，RT9 S-33 真实事实规则 | 已持久 opened、原完整批；warm 原 handle 的 observedFacts | 原恢复构造不变；cold 没有原 closure 时不可从 IPC 显示内容拼账 | C14-V2/V3/V4 |
| RT9 S-36/S-38，D-102/D-103 | worker 内组合 close；主管等待实际进程退出 | 原 ModelCallHost、runtime、日志 owner 顺序收口 | C14-V8/V9；close 不等于 exit |

Cordis 采用 [D-025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)。worker 内继续现有插件与服务；主管只是示例的进程资源 owner，不新增 Cordis 服务或每请求 fiber。依据 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) 与 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)（均有 probe），不能把 fiber 撤除、重跑或 effect 完成当物理退出；有顺序要求的 close 仍由显式组合承担。

## 主管、worker 与 IPC

### 一个部署一个长期 worker

主管是交互 CLI 的本地宿主进程；每个正在打开的数据根最多持有一个 worker。整个示例 application、Cordis Context、数据库连接、session-log owner、模型请求、凭据读取和调用句柄均在该 worker 中。多轮对话复用它；只有它实际退出后才允许启动后继，**不按一次模型请求 fork**。主管不打开同根日志、不持有业务写者，不直接调用 SL3 追加。

候选 `createDemoSupervisor` 显式拥有子进程集合及数据根关联，生命周期长于某一 CLI remote facade 句柄。CLI 持有一个 supervisor，需要受管进程的独立消费者也显式取得和关闭它；消费者同批迁移，不留自动假设退出的旧重载。facade 可关闭一次句柄再重开，而 supervisor 保留已观察退出事实。默认 CLI 的正常结束可以连 supervisor 一起关闭；另起 CLI 不继承旧进程内知识。

**公开面必须明确区分**：现有 `openDemo` 是 worker 内执行的本地 API，它实际持有并返回原 application/actor 等本地对象；函数型配置、回调与测试 hook 在 worker 内构造。CLI 的候选 `openSupervisedDemo` 是明确另名的 remote facade，只暴露可跨进程的既有 demo 命令和序列化事件，不冒充本地 `openDemo` 返回类型。application、actor、函数不能 JSON 穿越 IPC，不放假 stub，也不静默删减公共返回成员。若需改变本地公开签名，实施者须显式迁移全部消费者与双语文档；本页不授权用类型断言把 remote facade 伪装成本地对象。公开入口验收必须由真实 worker 调用实际 `openDemo`，并同时验证 CLI facade 路径；只测内部 bootstrap 不算完成。

主管在启动前生成随机且不可复用的生命 nonce，将它同**本次实际 child 对象、限定的数据根、启动代际**绑定；只有该 child 通过专属继承 IPC 收到它。同一个 worker 进程内全部日志实例、close/open、插件重跑使用同一个 `ProcessOwnership.current`。现有 `runId` 可继续是 application 实例标识，但不得再用每次 open 的随机值充当物理身份。PID 仅用于显示/向已持有 child 发信号，不作身份或退出证明。

主管对每个已管理 child 保存 `starting / alive / exited` 的本地事实和其唯一身份；监听在开放任何子进程工作之前安装。只有可信 child 退出完成观察才变为 exited；收到 kill 请求、IPC 断线、等待超时、spawn error 或 owner 查不到均不能变为 exited。spawn 失败且无法确认是否真的产生了可写 child 时不再开另一个写者。记录只属于该 supervisor 的本次生命，不写第二本业务／进程状态日志。

Node 子进程启动、`exit`/`close` 事件及 IPC 断开在支持 Node 版本上的精确语义，basis 尚无条目：**假设，须按 source-check 取证**。施工前必须验证真正退出与 stdio/IPC 收口的区别；使用实际退出事件证明死亡，另外等待句柄收口释放 supervisor 资源，不能把 IPC close 单独当死亡。不得未经取证改用 `/proc`、`kill(pid,0)` 或心跳判死。

### IPC 是本地工程边界

以下消息和配置名均为候选，不形成第十四个 runtime 操作：

| 方向／消息 | 责任与处理 |
|---|---|
| 主管→worker：一次启动声明 | 生命身份、明确数据目录及现有可序列化部署配置；worker 校验后自行构造时钟、scheduler、插件和本地依赖。不得把函数、Context、handle 或 actor 授权对象 JSON 化 |
| worker→主管：退出事实查询；主管→worker：对应结果 | 仅查询持久 marker 指出的 owner；请求绑定当前 child、代际、数据根和请求 ID。主管只回答自身持有的 child 事实，不接收调用者给的 exited 数组/布尔值。未知身份返回 unknown |
| 主管→worker：既有 demo 命令；worker→主管：结果 | 只代理 demo 已有显式公开面，沿原业务结果；worker 每次执行原入口认证/会话归属检查，不以 IPC 可达代替授权。未知命令或非法载荷启动前/操作前明确拒绝 |
| worker→主管：既有 observer 序列化事件 | 保留原 target/位置与 D-103 有界投递；terminal 输出不成为持久事实。慢终端/断线按现有观察失败处理，不阻塞模型结算，不转成第二份无界队列 |
| 主管→worker：close；worker→主管：关闭结果 | 拒新命令，沿原 close，只有实际 released 才报释放；随后停止 worker 并由主管真实等待退出。unavailable 保留 worker/责任，不隐式 kill |

每个请求带当前 child 代际及一次性请求 ID，迟到旧代际回包不结算新请求；消息接收端先校验闭合类型和大小。精确十进制／模型账沿已有序列化及 codec，不经 JS Number 丢精度。IPC 输入上限、同时在途命令数、观察事件/字节界限由显式配置提供；非法或缺少必需项启动失败，CLI 默认初值只在配置入口定义。达到命令边界时当次拒绝，不自动重放。

失联时，主管已发出的业务命令一律保持结果未知并返回可识别 unavailable，不因子进程退出改报取消成功；未发出的命令明确拒绝。stream receiver 的失败独立呈现。停止命令必须能在现有命令在途时送达，不能被普通命令队列排在 send 完成之后。生命周期和退出查询使用独立有限控制通道配额，避免业务满载使 close/退出查询互相等待；不增加计时器重试器。

worker 的 IPC 断开触发其宿主停止，继续原 close；不能确认清理完成时保留责任。主管若已死，孤儿 worker 仍可能活着；新主管不能因连接不到它宣告死亡。密钥只由 worker 既有凭据提供者按授权路径读取，不放 argv、事件或调试日志；IPC 只传已有允许的引用，不增加模型凭据采信面。

## 退出来源、覆盖与唯一恢复权

恢复的三个条件分开核实，任何一个都不能替代另两个：

1. **旧物理写者已实际退出**：主管持有本根旧 worker 的真实完成观察。对当前 child 自身永远 alive；同一 supervisor 未见过的历史 owner、错误根、过期代际或记录缺席均 unknown。未知旧布局不提供 `observeLegacyExit`。
2. **后继独占原存储根**：worker 通过既有存储及 SL3 owner 锁取得独占，不删锁、不复制目录、不从“能拿锁”推出死亡。active 恢复仍由日志 provider 按 D-085 从字节 0 扫描，修复索引；主管不改 marker。
3. **本会话新调用未开放且恢复唯一**：worker 认证 actor 并现核持有租户后，建立会话恢复准入；同一 session 仅一个 recovery scope，scope 全部任务结束后才释放该准入。主管的一 worker 限制只是本地资源管理，跨进程写排他性由原持久存储锁守住。

主管对数据根的覆盖必须完整：它可以证明本次管理链里旧 worker 已退出，不能据此证明此前陌生 worker 没有活着。首次接手已有 clean 日志时，若完整前缀已有全部收场，可以按原完整事实只读认回；**若仍有待追补调用且主管不知道其原物理写者，则不开放 cold absent，返回 unavailable**。clean 只说明 SL3 的文件关闭条件成立，不是原网络/回调所有者死亡证明。首次全新数据根及此后受该主管连续管理的 worker 链可建立覆盖；目录身份仍按现有根 dev/inode 与外部不改写前提核实。不能把一次陌生 clean 打开自动升级成覆盖证明。

这里继承 [SLJ design 的装配专用目录前提](../../session/session-log-jsonl/design.md)：supervisor 存活期间，此根只交给其 worker 链；即使旧 worker 已放锁、后继尚未取锁，也不允许另一主管或独立 provider 接手。部署 owner 负责目录专用安排，原锁只排斥同时写者，**dev/inode 相同不证明时间上连续专用**。若专用前提失效或无法确认，主管撤销覆盖判定，相关 cold scope 不返回 absent；不靠再次拿锁恢复可信覆盖。首次发现的陌生未收场历史在本次主管生命内保持来源未知，当前 worker 后来写 active、被 kill、被主管确认退出，也不能将它洗成“全部原工作来自已知 worker”。只有原完整批实际存在时可按其事实认回，不从这一轮物理死亡补造更早的来源。

主管整体重启后不从保存的 nonce/PID/退出日志文字复活权限。旧 active 的 unknown、旧 clean 内未收场调用的 owner unknown 保持拒绝；没有新的 OS 出生身份来源，本候选不闭合该分支。拒绝范围要在 CLI 输出和双语示例说明，不以提示“重启好了”伪装交付。

## 冷 scope 与暖 scope 分开成立

`RuntimeRecoveryScope.binding` 候选破坏性收窄为仅拥有 `log: SettlementLogBinding` 的恢复绑定；现有恢复/settleReply 仅读取该成员。不要为冷恢复虚造 catalog、selection、credential 或当前 EIS。普通 `SessionRuntimeBinding` 完整面保持原职责；现有 warm 完整 binding 可以满足窄面。当前消费者和类型测试同批迁移，不加兼容别名。

示例 `sessionAccess` 拆出共用的**认证、现核 session→tenant、同一日志借用与 owner**部分；普通调用在其上建立 selector/current inputs，恢复只取前者。恢复 binding 的 currentGeneration 依赖真实日志 owner 与必要身份/租户提供者，不依赖旧模型 contribution 是否 active。runtime 的 recovery 纯组件可独立构造并消费同一 scope；即使模型 contribution 已撤除，也能先完成恢复。正常 P-2 必需依赖及发出门不因此降低。

**正常 `settleReply` 的原批只读认回不进入 S-33**：沿既有 RT9 S-49 与原 v4 投影，从 `RuntimeSessionAccess.bind` 取得经过实际身份/代际核实的 log 和 owner，读取权威完整前缀并按既有处置判定幂等结果。它不借 `RuntimeRecoveryAccess.enter`、不要求会话重新承载、不停止同会话另一调用 B。主线 settlement-fix 是这一既有责任的实现修正；本页只划清接线，不新建领域规则。cold 恢复的准入与停止前提不能套到正常已提交原批的认回路径。

| 原暖门 | 暖恢复 | 新冷恢复 |
|---|---|---|
| `callHosts` 存在 | 停止实际持有的 host，等待实际注册资源释放 | 不造空旧 host；由主管对旧 worker 的真实退出完成及覆盖建立无旧回调前提 |
| `runtimeBindings` 存在 | 校验原 binding/日志代际/tenant 一致 | 在后继独占成功后，从现核会话及 SL3 建新窄日志 binding；不冒充旧 generation |
| 日志里的 call 都在 `trackedCalls` | 保留原容器/owner，未确定不得丢 | 从同一权威完整前缀识别 call/dispatch/ResponseId；确为已退出覆盖内的旧工作才能缺席；不能从空 Map 推出 |
| `originalInvocation` 找到 handle | 返回实际同次 handle；handle 不可读返回 unavailable | 对已核验前缀中的 noRun target，且恢复期间从未在本 worker 启动过该 target，返回 absent；未知、错 target、跨 session/tenant 或新工作返回 unavailable |

cold absent 证明的是原物理 worker 已消失且本次没有可读的原执行 closure；不是断言模型从未执行或费用为零。已持久原完整批始终优先，持久 opened 的 firstTokenAt 保留。暖分支尚持有可信同次事实时不能为了简化改走 absent；也不能把主管收到的 observer 文本、用量展示或任意 IPC 值当 observedFacts。

冷 scope 的 `owner` 是后继实际创建、绑定同一 session/tenant/log generation 的结算 owner；全部 read/append registration、coordinator 及 unknown tracker 由 D-105 长期组件持有，close 失败继续持有。新的 owner 不清除一个仍活着的旧 owner 未决标志；只有物理退出与独占重开建立了本候选冷前提。L1→L2 同进程旧 owner 交接仍是原独立缺口。

## openDemo 的真实动作链

1. 主管校验配置、建立或复用本根 supervisor 资源，启动一个长期 worker；worker 完成既有身份/存储/日志提供者初始化。失败收口部分资源，未证实旧 child 退出不启动竞争者。
2. worker 从原私有 demo 状态认证账户，现核原 session 的持有租户。新目录沿原注册/准备动作；已有目录不可重新创建同名会话来绕过历史。
3. 对已有会话，关闭所有新调用/消息追加准入，用窄日志访问读取并对账。原模型不可加载、凭据失效、当前 model 选择不可求值不阻止此步；不得先执行 effectiveModel/prepareModelInputs/transport.acquire/plan。
4. 调用既有 `createRuntimeReconcile`，只消费日志原绑定；cold scope 依据上节。原完整批可直接认回；待追补按原表，零 HTTP。任一部分 unavailable 不返回部分成功，不开放 send。
5. 恢复成功后才准备当前调用所需资产/EIS/选择/凭据；旧模型不可加载时保留已成功恢复结果，展示当前调用不可用，允许既有合法模型切换操作。不能回滚已提交恢复，也不能因恢复得到 resumable 自动 dispatch。fresh 目录空历史同样在开新调用前通过空对账。
6. 新 `send`、`selectModel` 等沿原授权及阶段门；恢复结束与新调用准入切换由同一会话本地 admission owner 串行处理。对账完成不会授予未来无限期权限，每次业务操作仍现核 actor/tenant。

## 共同存储、并发反例与装卸

不新增数据库或进程事实持久对象。原完整批 writer 与恢复 writer 共同触碰**同一本 SL3 权威日志 entries、尾与 ResponseId 判重键**；同提交比较、完整批原子追加、认回和耐久性要求沿 RT9 S-69～S-72／SL3 S-13/S-14/S-33～S-35。互指 [session-log-jsonl v3 恢复](../../session/session-log-jsonl/v3-recovery-design.md)：独占与物理退出是准入前提，marker 不替代业务同提交域。未来替换存储仍须提供原子完整追加、唯一判重、权威完整前缀、独占写者、不可用可识别，不把此页当新增数据库选型。

反例 A：旧 writer 已写完整批、回执丢、worker 被杀；后继读回必须认原批。若恢复读后另一个合法同根写者抢先提交，原同提交判重/尾条件决定认回，不能由主管“我看见退出了”越过。反例 B：旧 worker 仍活着或只 IPC 断开，新 worker 尝试打开；锁与退出门必须挡住，不能先写 runtime_lost。反例 C：主管已死，旧 worker 收到断线但 close 未完成；新主管只知道旧 PID 不存在/无法联系仍不足，必须 unknown。三者均纳入真实多进程测试。

| 取得的资源 | owner／开放时点 | 部分失败与撤除 |
|---|---|---|
| child 实例、IPC、退出监听、退出事实 | supervisor；实例关联建立且启动握手通过后可处理命令 | 关闭准入，保留未决命令结果未知；真实等待 exit 和句柄收口。关闭失败保留引用，不自动强杀 |
| 数据库与 session-log 根锁／marker／文件任务 | worker 中原提供者；沿原 ready | runtime/恢复任务停止后再关闭日志和存储；失败不释放锁或写 clean 假成功；SIGKILL 后由后继按 D-085 处理 |
| call host、观察 receiver、模型 lease | worker 中原宿主／D-103 | 停止和实际释放区分；观察失败不改账；沿原 D-102 组合收口，不靠并发 Cordis disposer 排序 |
| 冷 scope、读写登记、coordinator、未知结果 | D-105 reconcile 组件与该会话恢复 owner | 未决保留，其他会话可收口；scope.close 只在任务真实停止且耐久结果可判后执行 |
| 私有退出覆盖记录 | supervisor 本次生命 | child 关闭后保留到 supervisor 关闭；不是可脱离该实例使用的恢复凭证，主管重启后不采信缓存 |

不新增强杀或自动恢复的产品政策。已有显式关闭返回 unavailable 时维持可诊断的未释放状态；外部 SIGKILL 是验收/宿主实际动作，恢复只处理其结果。时钟、调度、IPC 边界、密钥路径均归示例部署配置；缺必需值或非法默认启动失败，运行期来源不可判沿 unavailable，不能归成参数 malformed 后掩盖未知结果。

## 关键选择

| 候选选择 | 落选方最强理由 | 本方弱点／置信度 |
|---|---|---|
| 整部署长期 worker，主管真实见证退出 | 全部同进程更简单，无 IPC | 多一进程和有限协议；提供真实死亡边界且非每请求启动。中等，须真实进程验证 |
| 明确主管实例持有退出事实，不做通用死亡查询 | OS 出生身份查询可覆盖主管重启 | 本方不能自动恢复陌生历史；符合 D-085 unknown，避免未经采用的平台机制。较高 |
| 窄恢复 binding，不伪造完整调用 binding | 复用现有 sessionAccess 改动更少 | 需拆公共类型/示例借用逻辑；避免旧模型/凭据门污染零发送恢复。高 |
| 原日志完整批与既有 coordinator 唯一权威 | 保存 IPC usage/最后文本可减少冷恢复未知 | 本方冷丢失内存事实仍 unknown；不引入新采信与补账政策。高 |

## 施工顺序与验收义务

先固定身份/IPC/配置类型和窄 recovery binding，再并行实施示例主管 worker、日志借用/冷 scope、独立多进程验收。所有调用者及 README/README_ZH 同批破坏性迁移。不能用测试直接注入 exited 或 absent 取代生产主管入口。

| Oracle | 必须执行的实际场景与失败判据 |
|---|---|
| C14-V1 | 主管经 CLI remote facade 启动真实 worker，由 worker 调用**公开 openDemo 入口**；本机受控 HTTPS 收到一次请求，durable dispatched 后 SIGKILL；主管等待真实退出再重开。恢复生成 runtime_lost、sentAt:null、无 opened→resumable；恢复阶段 HTTP 计数严格零增量，旧 ResponseId/profile/参数不变 |
| C14-V2 | durable opened 后 kill，恢复 firstTokenAt 逐字保留、状态 interrupted、无回复；没有真实 sentAt 则 null，费用无来源为 unknown，不能零；再次显式发出按原资格拒绝 |
| C14-V3 | 完整原 `[M,R]` 批已持久但回执丢后 kill；后继认回原完整批、原 actual sentAt/firstTokenAt/known 零及非零费用/header，不新生成 ResponseId、不刷新 endedAt、不改原 bytes。第二次 reconcile 同结果、零新追加 |
| C14-V4 | warm 原 handle 已停止、已观察账或时间但结果隔离；仍保留已知事实，不能因新的冷分支用 absent 覆盖。cold 无原 handle 的 unknown 与 warm unavailable 分开断言 |
| C14-V5 | 真实 alive worker、仅 IPC 断开、未知旧 owner、同 PID 不同身份、错误根/代际、跨租户/错误 session/target 分别拒绝；负控须命中对应门，不能只用更早启动失败冒称覆盖全部门。专用目录前提失效不能返回 absent；陌生 clean 内未收场历史首次拒绝后，kill 当前 worker 并真实等待退出，再重开仍须 unknown，不能洗成覆盖 |
| C14-V6 | 旧模型 contribution 撤回／未安装、无可用凭据／当前选中模型不可求值；worker 内 openDemo 仍先完成原日志对账，零 plan/acquire/send，再报告新调用不可用。陌生 clean 内未收场调用第一次与后继 worker 再次打开都保持 unavailable；fresh 空历史可正常开放。实际本地 API 保持 application/actor 与函数配置，remote facade 不传这些对象、不造 stub、不冒充返回类型；两条公开路径均验 |
| C14-V7 | 恢复 append 回执未知、部分读取失败、并发第二次 reconcile：整次无部分成功，原 scope/registration 留存；恢复后认回原批，concurrent=1 不死锁。真实半尾及完整批处理沿 SL3；不改写中间损坏 |
| C14-V8 | 连续多轮复用一个 worker；同 worker 日志 close/open 与 fiber 重跑 current 不变。正常 close 后真实 exit、后继身份不同；主管整体重启未知历史不能自动 exited。关闭过程中 kill，原锁/marker 正确留存 |
| C14-V9 | held 命令、慢终端、IPC 满边界、控制消息并发 close、迟到旧代际回包：有界、无重放、实际停止前不报 released；业务结果未知可解释，观察故障不改账。断线不能自行宣告旧子进程已死 |

所有网络测试只用本机受控服务；正反例分别保存原始日志、child exit 信号与生命周期身份、HTTP 计数、逐次结果和权威字节摘要。本页不绑定这些尚未运行的义务，不用单包单元测试替代实际公开入口验收。

## 尚缺与归属

- **C14-G1／SL3 S-21/S-23/S-35**：Node child 生命与 IPC 实际行为的来源核对、同一进程稳定身份实现及 C14-V5/V8/V9，归示例实施者与独立验收者；采用本页不能代证。
- **C14-G2／RT9 S-33/S-38**：窄 binding、真实 cold scope、openDemo 顺序及会话准入，归 runtime／示例实施者；实施前本页须主线评审采用。
- **C14-G3／RT9 S-17/S-33/S-69～S-72**：C14-V1～V7 的真实 FS、完整批/未知写入/known 事实验证，归独立验收者。现有 cold Fail 未被本草案关闭。
- **C14-G4／SL3 S-35、RT9 S-33**：主管整体重启后陌生历史的退出来源未建立，保持 unknown；需要此进展保证时另补经过采用的可信来源，不在本页写探测策略或人工强制开闸。
- **C14-G5**：withRun/G-28、同进程 L1→L2 owner 交接及完整 Session 重承载仍属既有独立缺口。本页不新增装配 app；示例消费者承担这里具名的有限 noRun 接线，不代表正式产品会话生命周期实现。
