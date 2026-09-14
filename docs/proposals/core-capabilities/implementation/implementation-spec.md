# 实施规格

本页定义第一批的实施选择与符合性映射，供[计划](plan.md)中的任务共同消费。
业务语义沿下表的已发布版本；本页不是另一个同义产品契约。具体存储编码、装配、
传输映射属于本次实施版本，在首个消费者开工前固定到同一提交。遇到与规范冲突
的反例，按[目标中的复议规则](scope.md#对已有设计与-fork-的处理)处理。

## 精确契约依赖

所有以下依赖均固定 v1；不使用 `current` 隐式升级。完整状态从
[catalog](../../../../spec/catalog.json)查验，未覆盖条款仍是未实现义务。

| 契约 | 本批消费范围 |
|---|---|
| [data.agent-runtime-identity](../../../../spec/data/agent-runtime-identity/v1/contract.md) | 全部共享运行身份，不能另造一组 SessionRef/AgentRef |
| [capability.live-agent](../../../../spec/capabilities/live-agent/v1/contract.md) | AR-1–17，在本批受信装配中全部适用 |
| [composition.agent-session-binding](../../../../spec/compositions/agent-session-binding/v1/contract.md) | CB-01–14，准入/附着/静止/资源义务 |
| [data.core-work](../../../../spec/data/core-work/v1/contract.md)及[Schema](../../../../spec/data/core-work/v1/schema.json) | CD-01–04；本批仅消费 text/tool_call/tool_result/deferred_receipt，其它内容不开放 |
| [capability.durable-records](../../../../spec/capabilities/durable-records/v1/contract.md) | DR-01–05；只实现本地 JSONL 提供者 |
| [composition.core-work-coordination](../../../../spec/compositions/core-work-coordination/v1/contract.md) | CC-01–07 中本批参与的原子关系/后果；不引入媒体提交或通用远程事务 |
| [capability.tenant-governance](../../../../spec/capabilities/tenant-governance/v1/contract.md) | TG-01/02/04/05 的本批主体、定义、选用与权益；关闭清算不开放 |
| [capability.action-authorization](../../../../spec/capabilities/action-authorization/v1/contract.md) | AU-01–06；配置项先限定模式、文本模型选择和 busy input=queue；不开放尚未实现的设备/账号授权 |
| [capability.session-run](../../../../spec/capabilities/session-run/v1/contract.md) | SR-01/03–06/08–10/12–14；SR-02 只消费原生命周期限制；SR-07/11 不开放 |
| [capability.human-decisions](../../../../spec/capabilities/human-decisions/v1/contract.md) | HD-01–09 的 system_approval；question/agent_approval/专属同意/暂行分支不开放 |
| [capability.tools](../../../../spec/capabilities/tools/v1/contract.md) | TL-01–09/12/13；TL-10/11 的独立 owner 义务保留，detach/后台能力不声明 |
| [capability.model-execution](../../../../spec/capabilities/model-execution/v1/contract.md) | MC-01–09/11 的文本路径；需要 MC-10 压缩才成立的切换明确不支持，不假称完成 |
| [capability.budget-accounting](../../../../spec/capabilities/budget-accounting/v1/contract.md) | BG-01–04；外部订阅/额度/账单提供者不开放 |
| [capability.engineering-observation](../../../../spec/capabilities/engineering-observation/v1/contract.md) | OB-01–03 在本批所有入口/状态/效果边界适用 |

## 包、所有权与依赖

沿 `packages/<能力族>/<职责包>`。下表是施工归属，标“新”的路径尚不存在，
到对应任务第一次交付实际源码时才建包。每个新增成员必须有实际行为/边界、
公开消费和验证；不按角色、TDD 阶段或一个类型预建空包。

| 路径 | 拥有的实现 | 依赖方向与本批改造 |
|---|---|---|
| `core/agent`、`core/scope` | 活体注册/构造/工作许可/退出；唯一 scope 路由 | 演化 agent；scope 只在真实缺口时改。通过注入端口接当前权限/Session，不能反向 import 业务实现 |
| `core/work-data`（新） | 两个共享 data 契约的 TS 表达、Schema 消费与值校验 | 只放这些明确共享结构，不收纳各能力状态。原重复身份类型迁到这一拥有者 |
| `coordination/admission`（新） | 同步短门、有序位置、提交票据、撤销屏障与耐久完成衔接 | 只协调记录/版本/使用关系，不自行判权限、执行工具或拥有全系统业务状态；依赖 records 端口 |
| `storage/records`（新）、`storage/jsonl` | DR 的受限读写端口/结果与编码检查；JSONL/OS 锁/同步/恢复提供者 | records 不依赖 jsonl 或业务能力；jsonl 不调用用户逻辑。独立端口用于注入真实提供者及故障测量 |
| `governance/tenant`（新） | TG 的成员、定义版本、权益和选用权威 | 本批管理操作沿该能力；应用不自行写 tenant/definition 状态 |
| `governance/authorization`（新） | 本批设置 owner、grant、当前 Action 判定与版本化声明解析协议 | 消费 tenant 的当前资格与共同门；不拥有请求/工具执行；解析器作为受信贡献装载 |
| `governance/human-decisions`（新） | 请求、一次决定、后果意图与统一池索引 | answer 与池同一权威；通过注入的来源端口提交等待/继续意图，不反向 import Loop |
| `governance/budget`（新） | 预算立场、attempt 预留、计量和暴露 | 消费共同门；不把授权或模型选择合入财务对象 |
| `session/session`、`session/projection`、`session/persistence` | 长期 Session/队列/Run 状态与附着；可重建投影；Session 记录映射/恢复 | 直接改造源基线，移除与目标冲突的入口；存储不反向依赖 Session；projection 不制造授权事实 |
| `tools/tools`、`tools/local-execution`（新） | 定义/发现/单槽位/manifest/调用控制；独立本地执行 owner/接纳账本/真实停止 | tools 经授权/HITL/预算端口组织命令准入；执行提供者只接精确已耐久许可，不调用模型决定权限 |
| `model/llm`、`model/openrouter`（新） | 档案/请求/内容流/manifest；唯一网络提供者 | llm 定义消费端口；openrouter 实现协议映射，不反向依赖 Session；不提供用户任意 baseURL |
| `context/system-prompt`、`agent/loop` | 贡献/skill/历史装配；Run 的模型→工具→等待→接续驱动 | Loop 消费上述能力，不拥有第二份 Session/审批状态；prompt 生成不代替当前准入 |
| `observation/engineering`（新） | 受控查询/导出/诊断 cursor 与 gaps | 读原事实，不能通过监听器反向裁决业务；业务端消费小型注入观测端口避免循环 |
| `media/content`、`util/brand`、`util/values`、`util/timeout` | 既有有限内容/值/计时辅助 | 本批不要求为凑改造覆盖率而修改；目标共享内容归 work-data，冲突源词汇只留明确基线范围 |
| `apps/local-harness`（新） | 常驻进程、CLI、认证适配、配置、能力装配与入口映射 | 选择提供者，业务转移回所属包；产品组合测试随应用，不能把组合实现塞进测试工具 |
| `tools/package-checks` | 依赖、来源和独立产物消费检查 | 随新增入口扩展检查，不成为产品运行依赖 |

表中多个业务权威共同依赖 coordination/records，不要求它们相互 import 实现。
跨能力共同提交由具名组合操作准备参与者；各 owner 提供纯、受信的条件检查与
记录增量，组合层声明本次原子关系。依赖循环是需要重划依赖/注入面的反例，
不能靠 import type、源码别名或把所有东西移进 core 解围。

目标入口采用包的默认公开入口，只有其明确声明的操作通过对应验收后才开放。
`/baseline` 可在迁移中的真实消费者仍需要时保留；修改现有模块即可满足目标时
直接修改，不能在目标外面包一层仍可绕过的旧 execute。应用禁止直接消费旧
registry/body 执行等绕门入口。源辅助若继续复用，其前提和用途在包 README 明示。
逐包 provenance 保留原件/许可与实际演化映射；自有新增文件不伪造上游来源。

## 部署、认证与装配

首批一个 Linux 常驻进程拥有一个逻辑运行时协调权威和一个本地业务协调域，
该域的所有原子批次落入同一 JSONL 文件；不同 tenant 的 typed stream 保留
明确归属并逐操作隔离。单域是本批选择，不把未来跨域原子性当既有能力。

CLI 通过仅本机的受控 IPC 连接常驻宿主。部署初始化生成本地凭据并保存主体映射，
服务端从实际凭据解析 UserRef/系统主体；请求正文的 userId/tenantId 只是目标或
输入，不是认证凭据。不开放任意主体 impersonation 参数。首次管理身份由可信
部署操作建立，之后的成员/定义/授权操作经真实治理服务及审计；测试使用独立
凭据及数据目录。凭据撤销影响下一操作，OS 管理员属于受信部署边界。

Session、Run、请求、预算和工具执行 owner 都由长期宿主承载；Agent 只持有
受限附着/许可和观察关系。释放 Agent 或客户端不关闭这些事实权威。装配初始化
先恢复 writer/状态/取消账本，再开放读取与执行入口；依赖不可用时按能力分别
报告可用性，模型断连不关闭获准历史和审批读面。

Cordis 仍直接使用仓库锁定的官方包；服务/插件/Context 只承载运行组合。
计划撤除先走 AR/CB/TL 的关门、排空与释放，再调用实际卸载。具体 API 映射
沿既有 D-005/D-007 证据；改变映射时按 cordis-authoritative-docs 核对采用版本，
本页不发明 Cordis 的事务或耐久 API。

## 记录格式、写入权与共同准入

实施格式命名为 `core-journal/1`，与上游 Session JSONL 格式分开。每个物理行
含 `formatVersion`、UTF-8 `payload` 字符串、其 `byteLength` 和 SHA-256；payload
解析为 DR-01 envelope，含 coordinationDomain、writerEpoch、commitId、seq、
operationRef、输入摘要、各 stream 的 expectedRevision/记录，以及原操作结果。
SHA/长度针对 payload 的实际 UTF-8 字节，不针对重新序列化后的对象；解析拒绝
重复键、未知格式、非法数据及越界长度。完整行以 LF 结束；断尾与完整坏行区别处理。

envelope 中各记录明确 owner、kind/version、tenant、可信主体和 CD 因果关系。
稳定事件种类由各能力定义，不能从类名生成；reducer 纯粹解释已提交记录，不调
运行时服务。操作摘要基于校验后的无损 JSON 结构规范编码，对象键排序、数组
保序，不允许 undefined/NaN 或模糊拼接。相同摘要还核对规范输入，不能仅凭哈希
碰巧相等复用不同操作。具体 Schema/codec 与黄金样例由 P0/P1 一起交付并固定，
后续 consumer 不各自发明格式；这属于实施格式，不覆盖已冻结 data v1。

writer 在规范化、由部署控制的域目录持有 OS 独占文件锁。所有受信写入路径必须
实际持锁；advisory 文件锁不承诺阻止恶意宿主代码直接修改文件。锁文件身份稳定，
运行期间不删除/替换锁文件，不以 PID 超时或心跳租约偷走暂停进程的锁；同进程
也拒绝第二 owner。取得锁后先校验/恢复，持久保存新的 writer epoch 并同步，
才发出写能力。旧句柄通过 owner/epoch 和关闭状态拒绝；关闭先关门、排空、同步，
再释放锁。计划提供者更换先释放旧者并核对前缀，不与其竞争接管。

OS 锁采用成熟 `flock` 绑定 `fs-ext@2.1.1`，其[官方仓库](https://github.com/baudehlo/node-fs-ext)
提供异步文件描述符锁接口。[P0 探针及 HUB 复验](evidence/p0-lock-probe/README.md)
已在 Node `v24.18.0`、Linux/ext4 验证构建、进程/独立 fd 排他、暂停持锁、死亡与
关闭释放；本批固定该发行物作为正式提供者的实现依赖，尚未接入产品锁文件。
默认宿主 g++ 9.4 构建失败，隔离 GCC 10.5 成功；构建环境必须满足该实际前提，
不退化为进程内 Map/超时文件锁。探针不证明正式 writer 的 epoch、恢复与耐久协议。

若采用需要原生构建的依赖，P0 明确锁定版本、构建命令与安装许可范围；现有
`--ignore-scripts` 安装不能被误报为已经构建成功。只对已核对的包执行必要构建，
不全局开启任意依赖脚本；隔离 tarball 消费使用相同安装/构建规则并实际加载。

共同提交使用两份视图：已分配有序位置的受控状态，以及已同步确认的耐久前缀。
准备在门外完成，进入短门后同步检查当前权限/修订/绑定/epoch/预算及去重，分配
位置并扣住精确使用和预留；不在门内 await。授权撤销立即封闭后续位置，授权
增加与答复只在耐久后可用。异步串行写完整批次，文件和必要目录同步后提升水位，
再确认结果/通知/允许真实效果。后续位置不能越过缺口执行。

同域联合关系明确为：输入+取批+Run 占位，调用+一次批准消费+预算预留+执行许可，
请求+来源等待，答复+唯一后果意图。业务状态仍由各 owner 解释。写失败进入
域级待核实状态，停止新增受控效果；只有证据说明批次未提交时才释放其预留/使用。
完整无回执行在恢复核实后可能成立，不能因“没收到成功”假定未发生。

恢复持锁扫描连续有效前缀。只有最后不完整批次允许先保存故障原件，再截回/
同步；完整损坏、乱序、格式未知保留失败，禁止跳过。索引/投影带水位重建，
权限/终态/恢复不能消费落后投影。查询旧操作与启动新 attempt 分开。
[Node 文件同步文档](https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandlesync)
明确同步行为依赖 OS/设备；本批的耐久性声明只覆盖真实验证的环境，不把 write
返回、通用 fsync 调用或进程 kill 测试表述为所有硬件断电保证。

## 工具、声明与人类决定

工具定义和声明沿共享 Schema 的 ToolDefinition/Command/AuthorizationDeclaration。
发布准备取得完整命令 Schema、受信解析器版本、实现 generation、skill 内容与
环境绑定。共同短门一次发布入口和声明索引；解析失败不留可调用条目。
动作解析只处理已完整校验的参数，输出 CD-04 Action；参数/秘密/目标版本固定，
实际执行收到同一份冻结值。声明索引仅是派生索引，当前 grant/成员/模式另求值。

程序化 M1 入口也必须提供可信消费类型及服务端证据，不能伪造模型 manifest。
M1 用计划给定的确定性驱动产生具名 Run/Step/调用，不运行任意脚本，也不把
一串命令文本交 shell。M2 则从真实模型建议创建同种调用；两者使用同一工具门。

ask 的提交保存 Action、request、continuation 和来源阻塞。pool 只索引这些
请求；Session 和 pool 的 answer 都调用 HD owner。approve 只产生绑定原 Action
的一次决定；准入时联合消费，重复后果查原回执。reject 形成未执行的可信结果，
恢复其对应接续。模式改变、显式取消、工具换代各沿 HD 原因关闭/取代，不伪造答案。

每个请求独立阻塞其 continuation，Run 另有全局控制阻塞和唯一驱动占位。
q1 就绪可推进而 q2 仍待答；q1 结束后只要 q2 未决，Run 仍不能普通 completed。
普通新输入排队；没有就绪接续时保存 waiting_human 原因并释放可释放的活体
资源，不循环调用模型等答案。等待不设自动答案，也不设置请求数量上限；列表
分页/索引和处理并发可有界，不能变相拒绝持久请求来逃避 HD-03。

待批动作不长期持有旧实现资源；换代/撤回使旧绑定不可准入并关闭/取代其请求。
已准入工作持有精确实现依赖，最后使用者真实收口后才能释放。scope 路由与
权限检查分别成立；旧 disposer/别名不能命中后来同名贡献。

## 独立执行、控制与恢复

local-execution 位于长期宿主，拥有 attempt 接纳账本和受管资源，独立于 Agent
生命周期。`start/inspect/requestStop` 消费 TL-08 协议；接纳/取消墓碑先耐久，
恢复先加载它们才开启动入口。开始前在同一短门检查精确 permit、执行 epoch 和
stop 状态；完成检查到进入实际执行阶段之间不能有允许 stop 穿过的空隙。

真实工具夹具采用部署控制目录中的多命令文件工具：help/read/write。目录与资源
由部署给定；参数不接受任意绝对路径/路径逃逸，不跟随用户可替换链接。write
具有明确人类确认声明，read 也检查权限。它验证真实读写、失败及影响次数，
不是完整制品系统或对不可信代码的沙箱。具体夹具与目标文件内容由测试隔离。

M1 使用 P2 已实现的真实预算 owner。该受信夹具的本批部署声明明确不收按次
直接费用，以具名零计费依据关联 attempt 和预算判定；不据此宣称 CPU/存储无
成本，也不推广为所有工具免费。其它计费来源必须声明当前费用依据和预算立场，
信息缺失按 BG 拒绝或记录未知暴露，不能通过省略 budget 参与者获得执行许可。

外部 I/O 开始前记录 dispatch 意图；效果与其日志未能原子成立的崩溃窗口一律
保留 possible_effect/unknown，禁止因为结果文件内容相同就推导“恰好执行一次”。
同进程重复 start 返回原执行身份；重启只认回原账本与可核实结果，无法核实不重发。
一项未开始且已可靠取消的 attempt 可以证明无效果；not_found 本身不能。

interrupt/cancel 请求本 Run 全部未结算自有调用停止并阻止新 Step。force_stop
立即撤销继续提交权，终态前还须取得防迟到启动的墓碑/隔离及真实停止依据；
未能证明时保留 stopping 和责任。Session 级强停设置 hold，continueQueue
只清 hold、不越过 stopping 占位。源 timeout/AbortSignal 只用于请求取消，
清理以实际受管任务/资源结果为准。旧 epoch 的迟到输出只能进入原工作的隔离证据。

## 模型、待答上下文与预算

本批网络出口固定 OpenRouter Chat Completions 文本/客户端工具协议。使用成熟
SSE 解析组件处理分帧，供应方错误与 finish 由本项目适配器解释；组件的具体版本
在 P0/P4 核对后锁定。禁用未授权 provider/model fallback、server tools、自动
OCR/转写等附加效果；重定向不能携带凭据转往其它出口。部署配置提供明确模型/
路由及能力/价格事实，事实 unknown 不伪装支持。当前 Run 的选择在所有 Step 保持。

manifest 保留历史切点、固定输入批次、工具单槽位表面、别名到精确贡献映射、
skill 正文/摘要及实际请求内容。模型流只有在有效终止和完整工具参数成立后才
可生成调用建议。无 finish EOF、error、abort 不能沿源装配的默认 stop 变成成功；
允许保留 partial 文本，但不得执行半份参数。价格/usage 缺席是 unknown。

待答编码采用**可辨别的结构化收据**：原 tool_call 的协议响应内容标明
`kind=deferred_receipt`、原 request/call/continuation 引用和 pending 状态，
不包含 success、最终结果或猜造答案。本地调用仍 waiting_approval，不能因发出
协议消息转 settled。q1 接续时，完整已答事实与 q2 待答清单进入下一 manifest；
以后 q2 的实际决定/结果以带原引用的上下文事实加入，不制造第二次工具建议。
该映射是本项目实施选择，**不是 OpenRouter 原生 HITL 能力**；目标路由必须
通过 A24 的 wire 与兼容性验证，否则拒绝该投影，不设置全答屏障来规避要求。

[OpenRouter 工具文档](https://openrouter.ai/docs/guides/features/tool-calling)
描述客户端执行及带 tool_call_id 的结果消息，本项目的准入/HITL 权威仍在本地。
[流协议文档](https://openrouter.ai/docs/api/reference/streaming)区分流中错误与
usage 尾帧；这些事实用于设计夹具，不表示本项目适配器已实现或目标模型已验证。
供应方动态能力和支持范围在真实验收时重新核对，不把文档里的示例模型作为默认选型。

模型执行 owner 同样拥有 attempt 接纳/取消账本；发网前消费耐久许可，强停先到
必须阻止迟到 dispatch。可能已发送则保留原请求 ID、partial/unknown、费用暴露，
可查询原请求时查询；没有证据不自动新建 attempt。真实模型动作需要 BG 的显式
observe/soft/hard 立场。hard 只对可核实上界作严格预留；未知上界按 BG-04 默认
拒绝，只有授权配置显式允许未知暴露时才可继续，并展示限制。

本批文本模型切换不做自动压缩：忙时保存 pending_next_run，应用前按当前资格、
文本历史与已知容量核对；只有需要压缩才能成功时明确返回本批不支持，原选择
不变。任何未来辅助模型调用都必须消费同一模型/预算能力，不能添加直连旁路。

## 应用表面与容量

应用开放 Session create/list/get/history、文本 enqueue/edit/reorder/withdraw、
Run 查询与精确控制、Session 级 hold/continueQueue、工具/skill discover/load/
retire、call/list/get/inspect/帧订阅与精确单次 stop、模式/授权/模型选择、审批
pool/list/get/answer、获准诊断与预算查询。单次 stop 核对原 call/attempt 和当前
控制资格，不扩大为 Run interrupt；订阅者分别持有游标与读取资格，撤权后不继续披露。
管理初始化/定义/成员/授权修改是明确的管理操作，不能通过改文件绕过当前门。
CLI 的具体命令词可在本边界内选择；不实现本批排除的操作，也不为它们放假成功占位。

入口结果区分业务拒绝、冲突、不可用、处理中、已提交与未知；提交后呈现失败
不否认提交。读取返回真实状态/水位，可答性单独表达。客户端断开只结束订阅。
关键记录和所需内容沿 owner 提交；观测索引缺失可重建，不能阻塞本不依赖模型的读面。

部署显式配置输入条数/字节、单次记录字节、模型输入/输出、工具执行并发、帧保留、
诊断缓冲及执行时限；缺失必要容量配置拒绝启动相应入口。配置不冒充产品固定上限，
不限制人类请求总数或给人类回答设超时。压力测量报告队列/等待/执行/同步延迟和
资源变化；本批不编造未有依据的吞吐/SLA，也不以此引入缓存/并行优化框架。
