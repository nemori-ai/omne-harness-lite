# schedule/schedule 长期行为契约

本文件拥有本成员的必要行为。完整复刻范围及 D3、D4、D5、D9、执行意图已由用户于 2026-11-03 确认，源修订为 `a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0`。行为约束后续实现，不表示实现已交付。当前真实 workspace 包为 `0.0.0` private，`src/index.ts` 仍为 `export {}`。产品规则见[产品正文](../../../.meta_harness/design/product/schedules-and-jobs/design.md)，公开形状设计见[公开 API 设计](docs/public-api-design.md)，机制见[内部设计](docs/internals.md)。公开形状尚非真实导出，存储及跨域适配须完成具名证据义务。

## 责任、消费者与前提

定义拥有者向人、agent、系统机械功能、装配及应用承诺完整 Schedule、明确时间与控制、可靠单次 Job 受理、原工作查询/接续及整体结算。Routine 仅是所含数据属性；日期知识、资产/授权及通知交付分别消费原拥有者公开契约。Job 核心只消费自有 JobExecutor 端口，不导入 Session/Agent 的类型或服务；Session/Run/消息/推进只由外部执行适配器解释。不能通过私有存储建立第二权威。独立能力入口不依赖 Cordis 或模型工具槽，具体集成遵守已接受 IC。

消费者提供显式身份、合法范围、明确工作和时间声明、适用依赖/执行资料、运行模式及策略。系统机械功能来自具名功能与部署管理条件；普通租户工具不能任意创建系统操作。合法支持、当前授权、日期依据、持续提供者和实际资源决定相应进展；缺失/无效/未知明确说明，不偷填策略或凭历史授权放行。

Job 接受不要求已存在 Session/Run；实际开始必须有相应执行/交付承接依据。对外可靠受理须使固定工作、来源、采用及未完责任一致可恢复。工作、调用及外部效果各有身份和保管者，不以 Schedule/Job/Session 或 provider 对象销毁决定它们已经不存在。

## 操作的前提与结果

| 操作含义 | 成立前提与结果 | 拒绝、取消或未知边界 |
| --- | --- | --- |
| 创建完整安排 | 当前保存资格、完整适用声明及可计算依据；一次一致保存为明确 active 或 draft | 非法或不支持拒绝，不留半份生效；回执未知查原保存 |
| 更新完整安排 | 非重要文本更新保持身份及原管理状态；draft 可完整修订；重要变化原子 replace | 不回写旧 Job/预置/其他安排；并发前提变更重核或冲突 |
| 有界预览 | 有权读取完整明确规则/引用和实际依据；返回下一次/有限未来及解释 | 只读，无 Job/计数/通知；覆盖不足与合法空不同 |
| 暂停/恢复/结束 | 独立控制资格及顺序成立；暂停阻新接受，恢复仅暂停，结束不可复活 | 不自动取消旧 Job；重复真实返回，未知不假称成立 |
| 到期/补跑接受 | 完整定义、当前控制/资格、最新依据、来源/碰撞、次数与重叠守卫成立 | 一致固定 Job/次数/处置/责任；失效重核，已处理不再建 |
| 启动原 Job | 当前启动资格、依赖及固定要求成立，未被取消且前序条件满足 | program、agent/new、agent/existing 三路按冻结意图承接，或直接通知；装配失败不报开始 |
| 当前进度/成果/问题 | 固定合法当前 Job 绑定，保管本次输入与结果 | 不切换目标，不独自宣布成功/失败/取消或发送通知 |
| 取消单次 Job | 当前取消资格与原工作事实，和启动/终结确定判序 | 开始前可不依赖会话；开始后报告真实停止/效果；发送后不承诺撤回 |
| 查询安排/工作/历史 | 当前租户和字段读取资格；原采用、结果、新鲜度与未完责任 | 只读，不重跑/补送，不因缺投影认定未发生 |
| 预置发现与采用 | 可读实际内容/来源，显式选择填入完整安排 | 无独立 Routine CRUD，不自动创建/升级已有安排 |
| 提供者停启/换代 | 支持/配置/接续范围明确；新准入停止与在途保管可核验 | 承接前原方持责，清理仅撤自身贡献，不擦历史或外部效果 |

以上是操作含义，不枚举公共方法、字段、错误码、状态枚举、幂等键或数据表。具体类型必须承载下列区别，不能以形状未定取消行为承诺。

## 业务不变式

### INV-SJ01 身份、所有者与内含描述分开

Schedule、已接受 Job、操作发起者、出厂来源及通知目标分别可辨。租户身份为组织/账号共同身份，系统自用明确系统归属，不伪造特殊租户。创建会话结束/归档或运行实例退出不改变 Schedule/Job 身份。Routine 属 Schedule 内容，无独立身份/生命周期或多个 Schedule 共同引用的可变对象；采用预置后内容由 Schedule 持有，后改预置不回写、安排编辑不反改预置。精确操作/定义/来源/运行代际标识由 Q-SJ02 落实。验证义务 V-SJ01。

### INV-SJ02 当前资格、租户及披露贯穿实际边界

创建、修改、控制、预览/查询、Job接受/启动、取消、资源动作及通知披露分别核验所需当前资格。持有服务、工具可发现、同账号或系统调度不代替授权；默认拒绝未授权跨租户，不改投另一身份、不借组织管理员取得成员私有安排。已保存授权不是未来动作永久许可，单次/本会话授权不复制给新作业会话。后台、缓存、索引、读面和诊断保留同一归属与字段披露；撤权与接受/开始/披露竞争受实际保护边界约束，已发生效果仍如实记录。验证义务 V-SJ02。

### INV-SJ03 保存完整一致的安排

create/update 必须使完整工作内容、时间、适用声明及管理事实一致成立，失败不留下部分生效。日期处理、补跑、重叠明确选择；组合通知明确非空事件、内容及目标；参数与工作类型匹配。创建必须明确 active 或 draft。draft 不参与扫描、预算、准备、接受或发送；reviseDraft 可完整修订，discard 是终态。promote 以当前主体、CAS、同意和依赖重新核验，从严格未来第一个有效时刻开始，记录 promotedBy/promotedAt，重试认回原结果。非重要 label、agent instruction 或 reminder content 原地更新，保持管理状态；purpose、时间结构、program/input、session 模式或目标、绑定变化必须原子 replace。replace 同提交停止旧安排后续、建立新 Schedule 和双向 predecessorId/successorId、转移 quota，失败无半后继，旧 Job 与历史保留。新后继从严格未来起算；不能更新、promote 或重授复活终态。并发修改或控制前提变化时重核或冲突，不覆盖后来确认事实。预览不是必经批准，成功读取不授写权。验证义务 V-SJ03。

### INV-SJ04 时间输入具有确定产品含义

一次性保存明确日期/本地时刻，相对表达在保存时解析固定。常规日/周/月/自然季度/年重复有正整数间隔、起算、明确日期/星期/时刻，周从周一开始。同一规则内可明确列出多个月份、星期或日内时刻。不能以多份 Schedule 代替同规则多值。位置型仅为所选月、季度或年内第 N 个或最后一个指定星期几或工作日，N 为正整数。

计算时区、包含边界的开始、可选截止、eligibleLimit、jobLimit 及排除日期明确；排除日期按规则时区排除当日全部候选。不存在的月日/位置不改为月末、不扣次数；事件条件、任意脚本或无限嵌套不因某库支持而自动准入。验证义务 V-SJ04。

### INV-SJ05 日期处理、覆盖与本地时间顺序固定

按基础候选、原日期边界/首次启用/排除、已选日期处理、结果日期同样检查、夏令时及碰撞合并的顺序解释。保持原日、跳过非工作日、前移/后移至最近工作日分别声明；后三者和工作日位置规则需明确日历，保持原日不免除真实依赖。平移保留本地时刻，可跨周期但不越开始/截止/首次启用；结果被排除即跳过，不再找另一日。需要路径缺覆盖拒绝猜测；实际调休知识不用星期模板代替。夏令时不存在时刻跳过，重复时刻取第一次。验证义务 V-SJ05。

### INV-SJ06 预览只读、同依据等价并有解释

相同实际完整定义、计算时区与日历身份/版本，引用和展开预览得到一致候选及理由；结果能辨原来源、平移、排除、边界与次数限制。只读返回有界下一次/未来候选，不保存、启用、接受 Job、扣次数或发送通知，不预测实际重叠/时长、不授写权。非法、无权、缺依据、查询故障、未知与合法空结果分开。两次查询依据已变化如实说明；查询取消只影响本次观察。验证义务 V-SJ06。

### INV-SJ07 最新校验与接受在一致边界保护

日常仅预算下一候选 t+1，不预建未来 Job。真正接受前按有效完整定义、当前后续控制/资格、最新必要日期依据、次数及实际重叠重新校验。校验后到接受之间前提变化必须重核或冲突，不能接受过时结果。Job 固定要求/来源/日期依据、接受、次数、相关处置与初始责任在对外确认时一致可恢复并达到声明的普通崩溃/断电耐久边界；不是先报成功再补账。日历发布、权限与本域接受跨拥有者时需实际守卫/协调证据，不能凭顺序调用或 Context 同进程声称同事务。验证义务 V-SJ07。

### INV-SJ08 来源去重、碰撞及次数如实计量

同日程尚未接受候选落到同一有效时刻合并为一次工作并保留各来源。新候选碰撞同日程已有 Job 则独立记因已有工作跳过，不创建第二份、不向旧 Job 回填来源。已经接受或明确处理的来源因重算换日期也不能重复制造工作。eligibleLimit 计经完整日期处理、DST 与同刻合并后的合格时隙，jobLimit 计实际已接受 Job。两轴独立且同时满足才接纳，不能把 RRULE COUNT 当其中任一轴。过滤、排除、gap、越界不耗 eligible；合格后 overlap skip 不产生 Job，不能因此回填更早时隙。合并时隙及实际创建 Job 各计一次，notification Job 计 jobLimit、不耗 execution 预算；wait/失败/取消不退 Job 次数，也不重新列入补跑。来源、碰撞和次数与接受共同可恢复，重复唤醒/回执丢失不能多计或漏记。精确身份必须能辨认这些关系，不只靠最新时间戳。验证义务 V-SJ08。

### INV-SJ09 已接受工作要求和采用固定

最终校验后接受才形成 Job，包括等待执行/等停止确认。固定本次工作类型/描述、声明、目标、来源、原定时刻和日历版本/解释；实际受理/开始时间另记。后改 Schedule/日历/出厂内容或消费者日历选择不回写旧 Job，不能将等待 Job 再变候选或随新版挪动/取消。执行输入保有本次合法 AD 身份及声明中的版本采用依据，具体合法资产/实现演化沿原拥有者记录实际采用，不另冻结整套资产副本。验证义务 V-SJ09。

### INV-SJ10 后续控制与既有工作分责

pause 阻止新到期/补跑接受，resume 仅恢复暂停并沿已声明补跑；stop 永久结束新接受，包括此前未接受积压，不能 resume 复活。控制先成立则无后续新 Job，接受先成立则旧 Job保留且不自动取消。一次性工作已产生或无候选可产生时结束其后续接受；这不构成原 Job 已执行完成，读面继续显示真实 pending/running/terminal；重复合法原定时刻耗尽且漏过区间按声明处理后自然结束。截止约束原定时刻，不拒绝截止内合法迟到受理；手动 stop仍优先阻新工作。重复控制返回实际状态，更新不恢复已结束安排。验证义务 V-SJ10。

### INV-SJ11 补跑是同一漏过区间的有界选择

以恢复 T 为界，仅选择首次启用之后、原定截止内、尚未建 Job且未明确处理的合法漏过。不补或最近最多 N 次明确，N 正整数；按最新依据选有效候选，超过上限的更早时刻记录不补，同区间不能下一轮分页补光。T 当刻正常工作不占 N，和选中补跑合并后按原定时刻从早到晚逐项接受并应用重叠；T 也可能因此跳过并可解释。次数不超剩余，原定/实际时间分开；重算提前到过去也受此声明。已有等待 Job是原工作继续，不占 N、不再计数。验证义务 V-SJ11。

### INV-SJ12 重叠作用于实际前序集合

同 Schedule：含执行的 Job看执行部分，纯通知看本次发送/交付主动作是否有真实结束结果；未知不自动算结束。组合通知尾部不单独挡下一执行，仍归原 Job。跳过不建 Job、不再补；并行独立 Job/执行关联/结果；new 分支各自会话，existing 分支仍指向声明的原会话，不推导外部资源隔离；等待先接受固定 Job并按原定顺序等实际前序。替换先接受新 Job，向需停止的全部执行/等待前序发明确控制，原执行契约所需停止确认后才开始新工作。停止失败/未知/未确认受阻，不偷偷并行；配置时已知不支持则拒绝。此前多并行工作按实际集合处理。归档业务取消完成、Run显示或请求成功不证明原动作已停止，不新增全 runtime 统一销毁事务。验证义务 V-SJ12。

<a id="inv-sj13-agent-job-专属会话及必需承接不省略"></a>

### INV-SJ13 执行意图与三种承接路径完整区分

Work 在接受时冻结。program 保存注册程序引用和经 schema 校验的 JSON input，不含 instruction/session，不接受自由脚本，未装载 Session/Agent 仍能创建、查询、接受和执行。agent 必须保存非空 instruction 与 session 判别分支。new 保存稳定 agentProfileRef，每 Job 幂等建立一次新执行会话，恢复不得再建；existing 保存明确 sessionRef，只投递该会话，不以 agentProfileRef 改写其 Agent。目标不存在、终局、跨租户或无准入资格时拒绝或受阻，绝不回退 new。三条路径由外部适配器实现 Job 自有 JobExecutor。核心不解析 Session/Agent 内部对象。

Session intake/inbound 决定 instruction 的合法消息种类、是否形成 turn、排队或恢复推进点。Work 不含 message role、Run 或 Session 聚合。existing 不等同 self-wake，也不自动续旧 Run。入队只表明承接/pending，实际执行、目标证据和原关联终态成立才结算。new 的上下文、资料和工作区显式引用且当前有权，不能复制创建者全量历史或授权。执行适配必须把当前 Job 的上报/目标检查能力正确绑定到本次执行关联，existing 中不能因另一输入改写本 Job 绑定。验证义务 V-SJ13。

### INV-SJ14 上报归原 Job，达成有独立依据

CurrentJob 绑定本次实际执行关联的 Job，模型不能传另一 Job来改变目标；绑定缺失/不一致拒绝向未知对象提交。进度、问题及候选最终成果分别可查，不自行更改主动作结局、重试或隐式发送。目标完成须有候选最终成果及可说明依据，检查本次固定目标/交付要求；普通回复、上报成功、工具返回或 Run完成不足。未达不能正常成功，无法继续按既有等待/失败/停止机制处置；检查不授无限续跑、不抵消停止、不拉起新业务执行。验证义务 V-SJ14。

### INV-SJ15 机械工作、工具逻辑结果及资产归属真实

租户或合法系统归属的 program Job 只执行具名功能及部署允许动作，无 agent会话或模型目标判断，真实功能成功才完成，触发/请求成功不足。有意停止服务不被备份安排自行启动，不能停止明说。普通租户改所有者不转成系统功能权。不可用 dummy tool execution 沿原工具逻辑调用/结果位置收场为不可用，真实工具未执行，不能当真实成功或制造其物理资源/费用。Agent产出资产按实际工作区/租户提交及当前权限，不能直接提交组织资产或代用户手动提升；具体创建入口碰撞结果仍归资产类别，不在本域补定。验证义务 V-SJ15。

### INV-SJ16 通知义务由本次已选实际事件产生

纯通知到期交付给定内容，不启动 agent；纯执行无配置通知。组合仍同一 Job，声明非空开始/成功/失败/取消事件及各内容/明确目标。开始是实际执行，等待/仅建会话不算；成功需目标/机械实际依据，失败需已确认结局，未知不冒充失败。每 Job每已选实际事件一次逻辑通知，未选/未发生不适用；先前成功成果不存在时不伪造文案。事件、义务内容/目标/来源及承接前责任一致可恢复，本域拥有它们并核对实际事件。验证义务 V-SJ16。

### INV-SJ17 整份成功不混淆执行与交付

纯执行成功须执行目标达成，纯通知成功须明确目标租户持久可取回。组合成功须执行成功且全部实际触发通知义务送达；没有命中不制造通知，执行失败/取消不因通知送达变成功，执行成功但应送未达不能整体成功。通知受理、尝试、在线、显示/已读、submit或 agent独立 send都不足；独立意图不替原配置义务。通知重试/换代继续原逻辑通知，不重做机械/agent执行或内容生成；投递失败不倒写执行结局、不递归生成执行失败通知。整体与未完责任由本域结算，不交通知层推断。验证义务 V-SJ17。

### INV-SJ18 单次取消依实际效果边界

当前取消资格独立于读权，普通租户不能取消系统机械 Job。已接受未开始的排队/等停止/装配前受阻 Job可在无 Session/Run时取消；成立即不启动。执行已开始记录停止意图，沿原优雅/显式强制控制，业务取消、实际停止/资源和外部效果分别呈现；机械按其实际可停止性，不以请求成功报停止。纯通知发送前取消获胜阻止发送、不另发取消通知；已发送/效果未知不承诺撤回、不把未知改取消或重发。主动作已终结保留原结局与未完通知，不把成功/失败改成取消。验证义务 V-SJ18。

### INV-SJ19 取消、启动、终结及恢复确定判序

开始前取消先成立则不得启动；工作先开始走原停止路径；主动作先终结保留结局。各竞争、停止控制及结果跨普通重启可认回。重复取消不重复动作/通知，回执未知查同 Job；依赖恢复、前序结束、调度重建或完成检查不能复活已取消执行。取消不改 Schedule/其他Job/固定输入、不退次数、不删除历史、不重入补跑。新替换 Job取消不撤销它已发出的旧工作停止事实；停止申请不能当作前序动作结束。验证义务 V-SJ19。

### INV-SJ20 取消后的通知与迟到事实保留

组合执行取消成立，包括执行前取消，仅按本 Job声明选中取消事件产生原逻辑通知，不伪造开始/成功。此前已经触发的全部交付责任继续保管，主动作终结不抹尾部义务。迟到成果/回执/费用及外部效果沿原 Job/调用保存，不将已取消工作改成正常成功、不承诺回滚。失去观察资格只能限制读取，不擦已发生效果。通知送达与原执行取消/失败、仍在物理收尾可以并存，聚合不能丢其真实范围。验证义务 V-SJ20。

### INV-SJ21 原执行与消费接续不变成业务重跑

恢复先核对原 Job/执行关联/取消/主动作终态、原调用、未消费结果及通知/区间处置。原调用在执行则接续其句柄/保管责任，已收场则取原结果；查询失败不推不存在，attempt/runtime重建不自动新建 Job/Session/调用。逻辑消息、执行账、费用和上下文组装沿原拥有者，不能把通知或日志条目当新输入随意重放。Q04归档解除业务等待、传播取消但不等待全物理停；后到结果不恢复会话推进，原执行/审计继续保管。Q05成员失效不自动销毁/归档/冻结；空闲、关闭配置、常驻豁免和实际系统权限归 Session，离线未知不是空闲。验证义务 V-SJ21。

### INV-SJ22 历史与查询不成为副作用入口

Schedule/Job/交付及来源/日期依据/漏过跳过/控制历史按业务承诺保留，不因结束安排、会话归档、失权或实例退出自动清除；物理归档/索引优化不缩短可查范围，本契约不设 TTL或删除能力。查询受当前资格及字段披露限制，只读呈现原采用/成果/事件/交付/未知及新鲜度，当前 Schedule不覆盖历史Job。读面落后/查询故障不能当未发生；查询不补跑、重做执行、重发通知或修复权威状态。验证义务 V-SJ22。

### INV-SJ23 生命周期、保管与自身撤除配对

提供者停止先关新准入，再排空/停止或可靠交接原Job/区间/控制/执行/通知及未知，承接前原方持责，不出现无人负责窗口。事实/责任独立于单一 fiber，依赖换代、旧引用及晚到结果归原身份。资源登记、监听、计时器、句柄及共享使用权只撤本实例贡献，部分初始化失败也收口；旧清理不删新实例/其他租户，不恢复整份旧快照。外部输出不能靠 disposer声称可逆，实际残留/未停如实报告，不把撤注册当业务完成。验证义务 V-SJ23。

### INV-SJ24 配置、集成及进展条件真实

合法策略、提供者支持、配置采用点和旧引用处置明确；缺依赖/无效配置/不能满足停止或送达判据时拒绝或受阻，不静默选参数/目标/通道。参数由合法治理配置，系统功能/预置内容/默认启用不在本契约代选。IC规定唯一接缝、纯根入口、提供者隔离、依赖/事件/贡献/显式身份和多进程重兑现，Cordis不自动供业务授权、耐久或原子受理。监听/呈现失败不倒写已提交事实。进展以前述合法前提成立为条件，无条件成功/固定耗时/无限重试未获承诺。自定义并发认领/接受/装卸/恢复机制要有行为模型及实际故障/并发证据；若靠新可逆/交换/互不干扰性质省略关键控制，按手册补相应证明及适用机器检查，不以规范目标声称证明已建立。验证义务 V-SJ24。

## 持续验证义务

下表是必须由实际拥有者保存的持续验证资源，不是已经运行的结果。验证使用真实提供者/介质/消费者和精确版本，分别记录模型、探针、测试及未覆盖；图、mock、字段校验或一次正常重启不能证明整体。

| 义务 | 必须覆盖的实际场景及禁止结果 | 责任 |
| --- | --- | --- |
| V-SJ01 身份/描述 | 同账号不同组织、系统/租户、来源/目标分离；预置编辑不回写，Routine独立ID负例 | 定义、资产/预置 |
| V-SJ02 资格/披露 | 读/写/取消分权，接受/开始前撤权，系统调度无权资源、跨租户缓存/诊断负例 | 身份/授权、本域、执行/通知 |
| V-SJ03 完整保存 | 内容/时间/策略各写入切点故障、并发编辑/控制，draft 不到期、幂等 promote、discard 终态、原子 replace 与双向 lineage、文本编辑不恢复状态 | 定义协调、存储 |
| V-SJ04 时间形状 | 一次相对固定、间隔/周期/位置、月31日/不存在位置；同一规则内多个月份、多个星期几及多个日内时刻的保存与计算，禁止以多份 Schedule 代替；位置型在所选月、季度或年内的正例，以及每周第一个工作日等不支持周期的拒绝反例；未支持规则及库默认负例 | 定义、日期算法 |
| V-SJ05 日期顺序 | 调休、前后平移跨周期、原/结果排除与边界、首次启用、路径缺覆盖、DST缺失/重复 | 日期提供者、日历组合 |
| V-SJ06 预览 | 引用/展开同答、不同版本如实解释；次数/通知/Job/重叠预测副作用负例 | 日期、读面、日历 |
| V-SJ07 接受一致 | 预算后定义/日历/权限/控制变化、校验至接受竞争、固定内容/次数/责任切点崩溃与断电 | 接受协调、日历/权限、真实介质 |
| V-SJ08 去重/计数 | 同来源换日期、多个来源平移碰撞、撞已有Job、不回填、重复唤醒与回执丢失、等待/失败/取消不退款 | 接受、存储 |
| V-SJ09 要求冻结 | 编辑策略/内容、日历新版/消费者切换、等待转开始保持原要求/依据，合法资产采用仍归原拥有者 | Job、日历、装配 |
| V-SJ10 后续控制 | pause/stop与接受两种顺序，重复控制、结束后编辑/resume，截止内积压与手动stop区别 | 定义/接受协调 |
| V-SJ11 有界补跑 | N边界/T当前、更多旧积压下一循环不补、DST/碰撞、次数/截止、重算提前、重启再次中断 | 调度/接受、日期 |
| V-SJ12 重叠 | 四策略、多并行前序、组合通知尾部、未知纯通知、停止失败/未确认、归档不作停止证据、外部资源不假隔离 | Job、原控制/执行 |
| V-SJ13 专属承接 | program 无 Session/Agent，new 幂等新会话，existing 只投指定会话且失败不 fallback，intake 决定消息，冻结 instruction、正确执行关联及目标检查 | Session/装配/资产、本域 |
| V-SJ14 成果目标 | 换Job上报、进度/普通回复/Run终态冒成功、缺最终依据、无法继续及停止权、不隐send | CurrentJob、目标检查、Agent Loop |
| V-SJ15 真实执行 | 机械触发不等完成、不可停止、备份不启动有意停服；dummy无物理执行；产出提交位置/组织提升负例 | 机械功能、Tool、资产 |
| V-SJ16 实际事件 | 已选/未选/未发生四事件，排队非开始、未知非失败、事件与义务保存切点和重复告知 | Job、执行、通知 |
| V-SJ17 组合结算 | 源成功但未送达、源失败/取消但送达、无事件命中、离线可取回、已读/独立send/submit不替义务、通知重试不重执行 | Job与通知组合、应用 |
| V-SJ18 取消效果 | 无会话取消、开始前/后、机械不可停、纯通知发送前/后/未知、不承诺撤回、已终结仍待通知 | Job控制、执行/通知 |
| V-SJ19 判序恢复 | 取消/启动/完成三竞争、重复/回执丢失/重启、替换新Job取消保旧控制、不得复活/退次数 | Job/原控制、存储 |
| V-SJ20 尾责迟到 | 开始前取消事件、既有通知保留、迟到成果/回执归原Job、取消不正常成功、真实物理收尾 | Job、通知、执行/保管 |
| V-SJ21 原工作 | attempt/调用恢复、未知查询不重发、归档逻辑取消但执行未停、离线成员失效/idle不猜 | Session/Run/runtime、Job |
| V-SJ22 只读历史 | 结束/归档/失权/换代不擦历史，当前权读字段，新鲜度/缺投影，查询不触发业务 | 本域读面、存储、应用 |
| V-SJ23 换代释放 | 承接前/后中断、无承接方、两代交错清理、部分初始化、共享使用/实际资源残留、晚到结果 | 提供者、装配、原执行/通知 |
| V-SJ24 配置/证明 | 无效/缺席/生效点、旧引用、监听失败不倒写、IC真实入口及显式身份、模型前提/真实组合对应 | 定义/提供者、装配/治理 |

## 技术义务与采用限制

Q-SJ02 落实精确身份/公开形状及读面；Q-SJ03 落实日期算法/版本校验到接受、来源/碰撞/次数；Q-SJ04 落实并发认领、耐久受理、补跑区间/控制及原工作恢复；Q-SJ05 落实当前Job/目标证据、实际停止及通知事件/义务交接和聚合；Q-SJ06 落实提供者、配置、IC及生命周期/真实资源。机制必须满足行为，不因选库/后端改变产品政策，也不以技术缺项将全域SPEC降为待定。

完整来源范围和终态已确定，Q-SJ02–Q-SJ06 是实现与证据义务，不得把它们当作重新缩小产品范围的许可。[日程协调者](../../../docs/domains/schedules-and-jobs/README.md#契约与验证导航)组合本域结果，日历、JobExecutor、通知和授权各有独立事实拥有者。强撤权/跨进程排除不能从当前 storage 自动取得，约束见[存储机制](docs/internals.md#实际存储能力与未闭合保证)。未来分布式部署须重新证明身份、接受、未知、责任和资源。

## 完整范围补充行为

以下补充和 INV-SJ01–INV-SJ24 一同约束实现。字段唯一源归[公开API设计](docs/public-api-design.md)，不能凭外部port未实现删去产品结果。

### 环境绑定与依赖状态

用户环境拥有者提供一个原子值 `{ownerRef, revision, activeTimezone, activeCalendarId}`。calendar 不拥有用户偏好，schedule 不写用户账户。followUserEnvironment 保存相对意图、最近确认的环境 revision 及解释锚；explicit 保存明确 timezone/calendar ref。用户安排默认 follow，固定业务及系统安排使用 explicit。显式日历身份与版本政策是两个轴：explicit 可以采用该日历 latest，也可以 pinned；用户切换偏好不改变 explicit 的日历身份，latest 发布仍可改变未接受未来的版本依据。

每次 due 扫描先对账环境，再算候选。事件加速更新，本地投影加低频反熵保证漏事件后收敛。高频枚举不做跨域网络请求。对账未完成或权威不可证明新鲜时，最终准入 fail closed。

跟随只重算未接受未来。已准备但未接受的旧证明应以 staleBasis 判拒，再准备新候选；原证明和处理事实保留。已接受 Job、历史 occurrence 和结果不改。环境切换原子采用 timezone 与 calendar，不能用新时区配旧日历。

环境不相容进入 `environment_incoherent` blocked。恢复后从当前时刻重算，不补环境停泊期间提醒或 execution 的旧 occurrence；这是一项明确的 source recovery 分类，不能被一般 catchUp 覆盖。用户 pause 仍保留。

源 S02 的“旅行不改时区”条款用于 explicit 记录；S07 后续 timezone-follow 修订与 ADR-108 用于 follow 模式。验收附录保留原文，本契约以模式条件解决冲突，不让开发者把两个相反断言同时施加在同一记录上。

依赖以外域公共引用及权威版本记录，不导入 Membership/Blueprint/Device/Session 内部对象。对Agent配置与会话的可执行性检查由JobExecutor适配器转换为prerequisiteProof，核心不调用Session/Agent服务。下表具体外域原因由对应适配器产生，核心只应用ready/blocked/terminal及版本。静态必需依赖进入 admission 检查，执行途中才提出的可选工具请求仍由执行/许可层处理。

| 情况 | 处置 | 恢复与补跑 |
|---|---|---|
| 设备暂时离线、资源暂时不可用 | blocked/逐窗拒绝，保留身份 | 同一权威关系恢复后按该 Schedule catchUp 处理 |
| 日历暂不可取或覆盖不足 | 停泊、真实原因 | 恢复后重算，执行按有界 catchUp；提醒不补 |
| 环境不相容或待对账 | 停泊 | 当前时刻重锚，不回补停泊区间 |
| Membership suspend、原 release deactivate、原 Session 用户归档 | 可恢复 blocked | 仅 owning authority 明确恢复同一关系才 ready |
| Device retire、Tenant 关闭、原 master 永久失效、exact release tombstone、Membership 移除 | terminallyInvalidated | 保留历史，禁止用同名新对象、latest release 或新 Membership 复活 |
| 权威读取失败或含混 404 | unknown/blocked | 不推断终局删除、不自动授予权限 |

权威事实含 authorityRef、identity、version、observedAt、disposition 和 reason。每依赖只应用更高 version，terminal 不能被旧 restore 覆盖。无可比较版本的 provider 不得声称能可靠处理迟到恢复。

### 一次性与提醒窗口

once execution 的规范 DTO 必须明确 lapse 或 awaitRecovery。源兼容入口把省略或 null 显式映射 lapse；reminder once 固定 lapse。创建时过去或DST gap拒绝；普通扫描迟到不能自动lapse，只有规定的可恢复blocker或pause跨期触发默认终局作废。awaitRecovery保留原W直到同一依赖恢复，无隐含到期日。永久失效不受选项影响；一次性至多接受一次，实际完成随原执行终态，不以派发成功结束。

Reminder purpose 与 execution 互斥。目标用 notification Job 承载一次已接受提醒工作，保持现行纯通知 Job 契约。它没有 Agent 执行 Session、Run、Dispatch，不执行能力、工具或模型，不占 execution budget；接受仍计一次 jobLimit。Job 保存固定要求、取消及整体结果，notification 拥有实际通知与各 route 的投递原事实，不制造空 agent 工作。

提醒内容 title 可空且最多 200 Unicode code points；body 为 1–16,384 UTF-8 字节，禁止 trim 或隐式规范化。源 reminder profile 为 fleet、无设备目标、无 execution payload、catchUp=none，源兼容映射显式选择 overlap=parallel，保留各期独立通知责任；它不替代目标原生通知工作的可配置 overlap。提醒接受后等待通知主动作完成，已有未知主动作按明确 overlap 处理，不假定 transport 已完成。目标原生纯通知若选择 wait/replace，仍遵守目标真实停止及等待约束。once reminder 不带 calendar overlay。

政策 `reminder-window-v1`：首次通知接受允许半开窗口 `[W, deadline)`，`deadline=min(W+300s,nextEffectiveSlot)`；没有下一有效时隙时取 W+300s。nextEffectiveSlot 已经过规则边界、排除、日历处理、DST 与碰撞合并，不是下一基础 civil 候选。T 等于 deadline 即 missed。deadline 随 Preparation 冻结，admit 不另从当前定义猜测。超窗后保存 missed 判决，不补发。若窗口内已经耐久接受，传输可晚于窗口，不变为 missed，也不重建另一通知。长停机用有界 lapse span 保存已判错过的区间及规则/版本，不为每分钟无限造行。

接受必须把 occurrence receipt、notification Job 与通知 intent 的可靠交接放进同一保护边界或明确的耐久 outbox。纯通知主动作以目标租户耐久可取回为成功依据，外部推送、已读、ack 独立。取消与该边界竞争，未阻止已成立通知时不得报撤回。notificationId 只能引用真实已接受的通知，pending intent 仅有 intentId。发送失败/重试不重新接受 occurrence。

### 系统安排与订阅

SystemScheduleDefinition 是出厂产品功能定义，含 featureId、definitionVersion、合法工作模板、recurrence、允许的个性化维度和 audience policy。可控 Subscription 由 owner 显式启用，拥有 subscriptionId、definitionVersion、参数、管理状态和独立接受历史。Feature 定义同时声明 controllable、controlReason、parameterSchema、defaults 及适用 owner 的权威依据。未给覆盖值使用 defaults，updateParameters 仅改本订阅未接受未来。不可控 feature 仍在受影响用户清单显示原因，其生效依据是产品权威适用规则，不能伪装成用户同意的订阅。

每个 subscriber occurrence 的唯一键包含 subscriptionId。不能用共享 scheduleId+time 吞掉另一用户的工作。缺少授权或可控功能的订阅时不接受，不把安装应用等同订阅。不可控功能以明确 authority assignment 作为展开依据，仍按每个受影响 owner 独立去重。

错峰 offset 以固定算法 `SHA-256(featureId, subscriptionId, policyVersion) mod windowSeconds` 计算，保存实际值；重启不重新随机。先算规范 occurrence，再加限定窗口内 offset，保留原定时间和 actual due。窗口为产品定义公开值，不能由工具临时选择。

取消订阅阻止新接受，已接受工作沿 Job 控制处理。升级系统定义不改已接受 Job；新版本采用需根据 feature 声明显式迁移或确认，禁止凭 latest 偷换 exact release。平台机械维护任务走系统归属，不能伪造用户订阅或用户同意。

### 作者同意与配额

Agent authoring 管理的是自己在当前合法 master/owner 范围内创建的安排意图。人工 owner 保有查看、修改、暂停、终止权。工具可发现与命令被授权是两个判断。

读取、预览不要求写入同意。granular 模式的 Agent create 无需等待用户在场，应用服务直接落 draft，零未来接受；Agent 可自主 reviseDraft/discard 自己的 draft。owner 的 promote 就是逐条确认。在 granular 模式且没有适用的 standing blanket 同意时，对已生效安排的修改、取消、替换仍逐命令确认，覆盖规范 payload hash、动作、owner、target、purpose 及 originating context，批准不得移用于另一份内容。

授权包含两轴：粒度 granular/blanket 与范围 session/standing。blanket+standing 跨会话和重启有效，无隐含过期；权威显式设置的到期仍遵守。Schedule 保存 grantRef/generation 和 adoptionKind。撤销 blanket 只阻塞依赖它的安排，独立仍有效的 granular grant 不失效。重授不自动恢复：owner 使用 reconfirmConsent(scheduleId,newConsentRef,expectedRevision) 逐条确认，原子更新 adoption、撤销阻塞锁和审计，再按当前其他依赖重算 standing。它不改变 paused，也不能复活终态。

standing work 配额由既有资源/许可治理拥有，Schedule 使用 QuotaParticipant。计量为每 owner+author 的非终态未来意图，draft、active、paused、blocked 均占一份；不按 occurrence 数或 Job 数重复收费。create 原子保留一份，draft promote 不另收费，replace 同事务转移一份，discard/stop/exhausted/invalidated 释放，superseded 仅转移不双减。两并发 create 的 reservation/CAS 与 Schedule 命令同提交，超额返回 capacity_exceeded 且零部分写入。策略值来自拥有者，不在本契约编造数值。

Agent 经已授权 official capability 间接形成未来工作的路径沿该 capability 自身授权，不额外套本作者工具确认门。两条路径仍在实际接受、执行和披露边界检查当前资格。

同意检查属于应用服务及其 authority port。Tool 不能自己记“用户同意过”并跳过服务检查，也不能将整个多命令 tool 视为一个不可区分权限。

### 外部接续、交付与归档

self-wake 属 Session 续跑同一工作：耐久 checkpoint、wakeId/generation、claim、同一Session/Run/trace、截止、次数、active budget及ProgressMonitor均由外部拥有者管理。retime不清预算/计数，取消不能被过期timer或重启复活。无进展及生存期限持续命中原监测器，不能无限挂起逃逸。Job.agent/existing仅执行本次固定instruction，不能据此实现或假装已经具备self-wake。两者不互相替代。

本节由外部Agent执行/结果回传适配器实现。源handoff映射为Work.agent：session.mode=new，agentProfileRef绑定同租户exact immutable Blueprint release，instruction保存工作要求，returnTo.targetRef保存originating master的opaque引用，并保留结果政策。Job核心不解析master或Blueprint领域对象。它不保存凭证快照，也不取得“以后永远可执行”的资格。

仅此handoff profile 的每个执行 occurrence 接受后新建一次 child 工作，与源 master 有明确归属。handoff 默认 overlap=skip，无显式 parallel 时前序未终态就记录 skipped；源兼容 profile 不默认排队。master idle 不妨碍按已固定 target 直接派发，无需先叫醒 master 重选目标。重复 start 查询原 execution receipt，不能多建 child。child 执行终态与 raw report 先耐久保存，再形成独立 MasterReturnIntent。

master 可运行则投递一份内部触发；busy 则保存有界待收结果。队列满返回 blocked 并由结果拥有者保留责任，禁止丢弃或无限内存积压。master dormant 可按其既有唤醒协议恢复；用户归档则 blocked；永久删除则 terminally blocked，不能改投新 master。

master return 的幂等键为 jobId+resultVersion+masterRef。收到返回不代表用户 publication，也不代表 archive。原始 child report 不被 master 改写，master 产出的用户 artifact 独立引用来源。

四项结果分别成立：execution、masterReturn、publication、archive。每项都有 state、operationRef、artifactRef 或真实失败。查询不得因执行成功把其余三项标为成功。

ResultPolicy 将 audience、attention、archive 三轴分开。audience=masterInternal 时结果只回 master，默认无用户交付物、普通 feed 或通知；可显式 archive。audience=userDeliverable 时 master 先生成用户可理解的正式 artifact，再由 publication provider 接受。默认站内可见，不自行升级 push。raw child report 只作不可变来源。归档 provider 拥有主题分类、容器及存储语义，schedule 只传稳定目标引用，不把外域 taxonomy 搬入 Routine。

重复工作持有稳定 resultSeriesId，每次 occurrence 的 resultEntryId 独立且不可覆盖前一期。series 查询按 scheduledAt、entryId 稳定排序，保留来源及 artifactVersion。两类 audience 都可归档，internal archive 不因此公开到普通结果中心。

每项外部请求使用稳定 operationKey，超时先查询，支持 query 不代表外部 exactly-once。provider 无查询能力时记录 unknown 和人工处置入口，不盲目重发有副作用操作。发布已成功而归档失败，只续接归档。用户通知是 publication 后的独立反应，失败不重执行 Job。

### 只读读面与资源边界

| 入口 | 必须呈现的内容 | 上限与语义 |
|---|---|---|
| Schedule list/detail | owner、作者、purpose、control、standing、原因、下一次、绑定、定义/状态 revision、lineage、consent ref | limit 默认 50，最大 200；稳定 cursor，未知筛选拒绝 |
| revisions | 不可变修改前后引用、主体、原因、时间 | 默认 50，最大 500；不重写旧史 |
| executions | occurrence、准备/接受/拒绝/missed、Job 原结果与通知结果 | 默认 50，最大 500；原定时间范围与稳定 cursor |
| agenda | 请求时区中的区间，历史真实结果及未来预测，draft/blocked/terminal 可按筛选查看 | 最长 92 天；扫描最多 10,000 Schedule、返回最多 5,000 行，达到上限显式 incomplete |
| preview | inline 定义 XOR scheduleId，after、下一 N 次、来源和日历/DST解释 | N 默认 5，最大 100；严格只读 |
| calendars | 三历 roster、版本、覆盖、知识截至、供应健康 | 指定版本不可得不得回退 |
| result pending | master 待收结果、publication/archive 未完责任 | 只移动/移除合法待办，不改原报告 |
| inbox | 可用通知及 acknowledgement | 打开不等于确认 |

本契约分页与上限是 Node v1 明确选择，非声称源具有完全相同参数。源旧 ledger slot_to/from 兼容入口可保留，但目标游标包含 `(scheduledAt,id,queryHash)` 和 observationRevision，不能仅按时间漏掉同刻记录。

日程计算时区决定候选、排除和日历处理。agenda 请求时区只改变显示与范围边界，不重解释规则。区间以 request timezone 的 civil 边界转换为 `[from,to)` instants，首日午夜包含。历史取原采用依据，未来取当前预测依据并标 prediction。

UI 流程：查看列表/agenda → 选择/编辑意图 → 预览与同意 → active 创建或 draft → owner promote → 查看准备/接受/执行/通知 → 控制后续或取消既有 Job。必须能区分“暂停未来”与“取消这一份工作”，以及“已接受通知”与“已送达”。默认摘要控制上下文体积，完整详情通过引用读取，不能截断后声称完整。


## 来源与目标验收映射

来源固定于 [omne-next a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0](https://github.com/nemori-ai/omne-next/tree/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness)。下表逐条保留 17 组共 154 个源 AC 的稳定追踪 ID、原题与固定修订正文位置。所有原条款的 Given/When/Then 都是验收义务，不能只验证标题。目标拥有者链接给出目标语义；外部组合仍须真实提供者验收，不能在纯函数测试中声称通过。当前全部条款均为“未实现/未执行验收”，没有本轮产品测试通过结论。

采用差异只有具名终态：D3 以 explicit/follow 模式解释旅行与环境跟随；D4 源 count 映射 eligibleLimit，Job次数另用jobLimit；D5 保存draft/promote/discard及原子新身份replace；D9 周期execution统一none/latest N，源pending-first断言按新目标改验，不能声称源行为等价。源 S12 的 system schedule 仅指逐用户产品功能，排除无逐用户对象的平台运维。目标另外保留合法 system scope 的平台维护，和每 owner 的订阅/authority assignment 分开；这是目标边界适配，不能声称全部源归属语义等价。源 S03 的单一 Schedule 执行终结映射为本域 Schedule 后续控制与 Job 实际执行的组合读面：once 接受后即便未来来源已耗尽，也不能把它显示成执行完成。源 State/Runtime/Blueprint 名称映射为实际语义拥有者，不新建同名领域。源job_id只作sourceScheduleKey。表中跨域行为由本域保留关联与聚合义务，原事实由对应拥有者完成。

| 来源组 | 条数 | 目标行为拥有者与组合验收 |
| --- | --- | --- |
| S01 | 14 | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口)；本域/授权/SQL |
| S02 | 7 | [日期规则](#inv-sj04-时间输入具有确定产品含义)、[日期顺序](#inv-sj05-日期处理覆盖与本地时间顺序固定)；本域日期/Calendar |
| S03 | 8 | [一次性](#一次性与提醒窗口)、[单次取消](#inv-sj18-单次取消依实际效果边界)；本域/JobExecutor |
| S04 | 7 | [Calendar冻结与采用](../../calendar/calendar/SPEC.md#inv-ca14-日历更新与业务采用分责)、[接纳](#inv-sj07-最新校验与接受在一致边界保护)；Calendar/接受协调 |
| S05 | 11 | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策)；Calendar/发布物/SQL |
| S06 | 9 | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果)；Calendar/读取适配 |
| S07 | 10 | [环境绑定](#环境绑定与依赖状态)；环境拥有者/本域/Calendar |
| S08 | 14 | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择)；外域权威/接受协调 |
| S09 | 5 | [提醒窗口](#一次性与提醒窗口)、[通知结算](#inv-sj17-整份成功不混淆执行与交付)；本域/通知 |
| S10 | 11 | [只读读面](#只读读面与资源边界)；本域读取/应用 |
| S11 | 4 | [Standing事件](docs/internals.md#112-standing-转移通知)；本域/通知 |
| S12 | 8 | [系统订阅](#系统安排与订阅)；系统功能/本域/授权 |
| S13 | 9 | [外部接续](#外部接续交付与归档)；Session continuation/ProgressMonitor，非本域imports |
| S14 | 8 | [外部交接与返回](#外部接续交付与归档)；JobExecutor agent adapter/Session/MasterReturn |
| S15 | 13 | [作者同意与配额](#作者同意与配额)；本域/授权/QuotaParticipant |
| S16 | 8 | [结果与归档](#外部接续交付与归档)；结果发布/主题归档/本域聚合 |
| S17 | 8 | [通知接缝](docs/public-api-design.md#6-结果通知及事件)、[整体结算](#inv-sj17-整份成功不混淆执行与交付)；通知/授权/应用/本域 |

### 154 个源 AC 逐条索引

| 追踪ID与原条款 | 目标义务 | 验收承担者 |
| --- | --- | --- |
| <a id="s01-t01"></a>S01-T01 [AC-1 · 创建自己的计划](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L121) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t02"></a>S01-T02 [AC-2 · 空列表不是错误](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L130) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t03"></a>S01-T03 [AC-3 · 列表受 owner scope 隔离](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L137) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t04"></a>S01-T04 [AC-4 · 更新可编辑内容](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L145) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t05"></a>S01-T05 [AC-5 · 暂停与重新启用](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L153) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t06"></a>S01-T06 [AC-6 · 永久停用](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L164) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t07"></a>S01-T07 [AC-7 · 同一到期窗口至多接受一次](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L171) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t08"></a>S01-T08 [AC-8 · 无效输入与非法动作 fail loud](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L182) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t09"></a>S01-T09 [AC-9 · 未证明身份与跨 scope 写入被拒绝](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L190) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t10"></a>S01-T10 [AC-10 · 起草态永不到期](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L355) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t11"></a>S01-T11 [AC-11 · 转正记主体且幂等](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L361) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t12"></a>S01-T12 [AC-12 · 丢弃是终态](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L368) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t13"></a>S01-T13 [AC-13 · 原子替换无中间态](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L375) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s01-t14"></a>S01-T14 [AC-14 · 新旧线索双向可读、旧史保留](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md#L382) | [作者生命周期](#inv-sj03-保存完整一致的安排)、[查询](#inv-sj22-历史与查询不成为副作用入口) | 本域/授权/SQL |
| <a id="s02-t01"></a>S02-T01 [AC-1 · 既有 cron 计划保持兼容](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md#L73) | [日期规则](#inv-sj04-时间输入具有确定产品含义)、[日期顺序](#inv-sj05-日期处理覆盖与本地时间顺序固定) | 本域日期/Calendar |
| <a id="s02-t02"></a>S02-T02 [AC-2 · 常见复杂序列可表达且可预览](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md#L80) | [日期规则](#inv-sj04-时间输入具有确定产品含义)、[日期顺序](#inv-sj05-日期处理覆盖与本地时间顺序固定) | 本域日期/Calendar |
| <a id="s02-t03"></a>S02-T03 [AC-3 · 旅行不重解释 Schedule](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md#L87) | [日期规则](#inv-sj04-时间输入具有确定产品含义)、[日期顺序](#inv-sj05-日期处理覆盖与本地时间顺序固定) | 本域日期/Calendar |
| <a id="s02-t04"></a>S02-T04 [AC-4 · DST 结果唯一且可解释](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md#L94) | [日期规则](#inv-sj04-时间输入具有确定产品含义)、[日期顺序](#inv-sj05-日期处理覆盖与本地时间顺序固定) | 本域日期/Calendar |
| <a id="s02-t05"></a>S02-T05 [AC-5 · 有限次数和截止时间不会被例外绕过](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md#L101) | [日期规则](#inv-sj04-时间输入具有确定产品含义)、[日期顺序](#inv-sj05-日期处理覆盖与本地时间顺序固定) | 本域日期/Calendar |
| <a id="s02-t06"></a>S02-T06 [AC-6 · 重算和 failover 不重复派生 occurrence](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md#L108) | [日期规则](#inv-sj04-时间输入具有确定产品含义)、[日期顺序](#inv-sj05-日期处理覆盖与本地时间顺序固定) | 本域日期/Calendar |
| <a id="s02-t07"></a>S02-T07 [AC-7 · 不可计算规则明确失败](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md#L115) | [日期规则](#inv-sj04-时间输入具有确定产品含义)、[日期顺序](#inv-sj05-日期处理覆盖与本地时间顺序固定) | 本域日期/Calendar |
| <a id="s03-t01"></a>S03-T01 [AC-1 · 一次性预定可创建且可与重复计划区分](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md#L90) | [一次性](#一次性与提醒窗口)、[单次取消](#inv-sj18-单次取消依实际效果边界) | 本域/JobExecutor |
| <a id="s03-t02"></a>S03-T02 [AC-2 · 执行生命周期如实可见，终态随执行终态而定](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md#L97) | [一次性](#一次性与提醒窗口)、[单次取消](#inv-sj18-单次取消依实际效果边界) | 本域/JobExecutor |
| <a id="s03-t03"></a>S03-T03 [AC-3 · 默认处置是终局作废](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md#L121) | [一次性](#一次性与提醒窗口)、[单次取消](#inv-sj18-单次取消依实际效果边界) | 本域/JobExecutor |
| <a id="s03-t04"></a>S03-T04 [AC-4 · 显式选择等待时沿用可恢复语义](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md#L130) | [一次性](#一次性与提醒窗口)、[单次取消](#inv-sj18-单次取消依实际效果边界) | 本域/JobExecutor |
| <a id="s03-t05"></a>S03-T05 [AC-5 · 永久失效不受选项影响](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md#L139) | [一次性](#一次性与提醒窗口)、[单次取消](#inv-sj18-单次取消依实际效果边界) | 本域/JobExecutor |
| <a id="s03-t06"></a>S03-T06 [AC-6 · 唯一一次](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md#L147) | [一次性](#一次性与提醒窗口)、[单次取消](#inv-sj18-单次取消依实际效果边界) | 本域/JobExecutor |
| <a id="s03-t07"></a>S03-T07 [AC-7 · 无效输入 fail loud](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md#L155) | [一次性](#一次性与提醒窗口)、[单次取消](#inv-sj18-单次取消依实际效果边界) | 本域/JobExecutor |
| <a id="s03-t08"></a>S03-T08 [AC-8 · 跨 scope 拒绝且零信息泄漏](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md#L162) | [一次性](#一次性与提醒窗口)、[单次取消](#inv-sj18-单次取消依实际效果边界) | 本域/JobExecutor |
| <a id="s04-t01"></a>S04-T01 [AC-1 · 业务日历与复杂 recurrence 保持独立](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md#L71) | [Calendar冻结与采用](../../calendar/calendar/SPEC.md#inv-ca14-日历更新与业务采用分责)、[接纳](#inv-sj07-最新校验与接受在一致边界保护) | Calendar/接受协调 |
| <a id="s04-t02"></a>S04-T02 [AC-2 · 调休等逐日覆盖可被诚实表达](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md#L78) | [Calendar冻结与采用](../../calendar/calendar/SPEC.md#inv-ca14-日历更新与业务采用分责)、[接纳](#inv-sj07-最新校验与接受在一致边界保护) | Calendar/接受协调 |
| <a id="s04-t03"></a>S04-T03 [AC-3 · 同一版本在 fleet 中结果确定](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md#L85) | [Calendar冻结与采用](../../calendar/calendar/SPEC.md#inv-ca14-日历更新与业务采用分责)、[接纳](#inv-sj07-最新校验与接受在一致边界保护) | Calendar/接受协调 |
| <a id="s04-t04"></a>S04-T04 [AC-4 · 日历更新只改变未接受的未来](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md#L94) | [Calendar冻结与采用](../../calendar/calendar/SPEC.md#inv-ca14-日历更新与业务采用分责)、[接纳](#inv-sj07-最新校验与接受在一致边界保护) | Calendar/接受协调 |
| <a id="s04-t05"></a>S04-T05 [AC-5 · 数据缺失不产生猜测](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md#L102) | [Calendar冻结与采用](../../calendar/calendar/SPEC.md#inv-ca14-日历更新与业务采用分责)、[接纳](#inv-sj07-最新校验与接受在一致边界保护) | Calendar/接受协调 |
| <a id="s04-t06"></a>S04-T06 [AC-6 · 平移碰撞默认合并且保留出处](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md#L109) | [Calendar冻结与采用](../../calendar/calendar/SPEC.md#inv-ca14-日历更新与业务采用分责)、[接纳](#inv-sj07-最新校验与接受在一致边界保护) | Calendar/接受协调 |
| <a id="s04-t07"></a>S04-T07 [AC-7 · 截止时间与有限次数优先](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md#L117) | [Calendar冻结与采用](../../calendar/calendar/SPEC.md#inv-ca14-日历更新与业务采用分责)、[接纳](#inv-sj07-最新校验与接受在一致边界保护) | Calendar/接受协调 |
| <a id="s05-t01"></a>S05-T01 [AC-1 · 新增国家不改核心](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L149) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t02"></a>S05-T02 [AC-2 · 到点周期拉取并本地持久化](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L156) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t03"></a>S05-T03 [AC-3 · 携带权威出处的修订取代旧版本](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L164) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t04"></a>S05-T04 [AC-4 · 无出处的静默改写不得自动发布](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L172) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t05"></a>S05-T05 [AC-5 · 语义退化不得成为发布版本](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L180) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t06"></a>S05-T06 [AC-6 · 地平线临期告警先于耗尽](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L189) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t07"></a>S05-T07 [AC-7 · 首批三国机制诚实表达](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L196) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t08"></a>S05-T08 [AC-8 · 离线装机即三本可用](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L204) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t09"></a>S05-T09 [AC-9 · 装机联网刷新尽力而为、失败不碍装](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L222) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t10"></a>S05-T10 [AC-10 · 重复 provisioning 幂等收敛](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L238) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s05-t11"></a>S05-T11 [AC-11 · 发布物新鲜度受闸](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md#L252) | [Calendar供应](../../calendar/calendar/SPEC.md#inv-ca10-供应发现与业务校验成立才可发布)、[发行](../../calendar/calendar/SPEC.md#inv-ca18-健康与发行条件可观察且有明确政策) | Calendar/发布物/SQL |
| <a id="s06-t01"></a>S06-T01 [CAL-AC-1 · 目录与覆盖诚实](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md#L61) | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果) | Calendar/读取适配 |
| <a id="s06-t02"></a>S06-T02 [CAL-AC-2 · 日判定含调休覆盖](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md#L65) | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果) | Calendar/读取适配 |
| <a id="s06-t03"></a>S06-T03 [CAL-AC-3 · 工作日算术与引擎同源](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md#L69) | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果) | Calendar/读取适配 |
| <a id="s06-t04"></a>S06-T04 [CAL-AC-4 · 预览与将来触发一致](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md#L73) | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果) | Calendar/读取适配 |
| <a id="s06-t05"></a>S06-T05 [CAL-AC-5 · 越界 fail-loud](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md#L77) | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果) | Calendar/读取适配 |
| <a id="s06-t06"></a>S06-T06 [CAL-AC-6 · 版本语义显式](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md#L81) | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果) | Calendar/读取适配 |
| <a id="s06-t07"></a>S06-T07 [CAL-AC-7 · 只读性](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md#L85) | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果) | Calendar/读取适配 |
| <a id="s06-t08"></a>S06-T08 [CAL-AC-8 · 预览引用式入参等价](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md#L89) | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果) | Calendar/读取适配 |
| <a id="s06-t09"></a>S06-T09 [CAL-AC-9 · 生效日历一跳查询等价](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md#L93) | [Calendar查询](../../calendar/calendar/SPEC.md#操作的前提与结果) | Calendar/读取适配 |
| <a id="s07-t01"></a>S07-T01 [UAC-AC-1 · One authoritative active calendar per user](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L206) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s07-t02"></a>S07-T02 [UAC-AC-2 · Schedule creation needs no calendar identity](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L213) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s07-t03"></a>S07-T03 [UAC-AC-3 · Switching calendars converges without per-schedule migration](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L220) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s07-t04"></a>S07-T04 [UAC-AC-4 · The pre-execution check uses the calendar in effect](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L228) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s07-t05"></a>S07-T05 [UAC-AC-5 · Accepted past is never rewritten](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L235) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s07-t06"></a>S07-T06 [UAC-AC-6 · Incompatible switch blocks loudly, never guesses](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L242) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s07-t07"></a>S07-T07 [UAC-AC-7 · No active calendar fails closed](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L251) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s07-t08"></a>S07-T08 [UAC-AC-8 · Fleet determinism survives the mutable setting](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L258) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s07-t09"></a>S07-T09 [UAC-AC-9 · Timezone change converges without per-schedule migration（2026-08-20 追加）](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L265) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s07-t10"></a>S07-T10 [UAC-AC-10 · Coherent joint switch rebinds as one environment（2026-08-20 追加）](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md#L275) | [环境绑定](#环境绑定与依赖状态) | 环境拥有者/本域/Calendar |
| <a id="s08-t01"></a>S08-T01 [REC-AC-1 · Device 暂时离线不会变成永久退役](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L176) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t02"></a>S08-T02 [REC-AC-2 · 只有同一权威关系恢复才自动 ready](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L184) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t03"></a>S08-T03 [REC-AC-3 · 用户 pause 与 dependency standing 互不覆盖](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L193) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t04"></a>S08-T04 [REC-AC-4 · Authority 不可读时 fail closed](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L200) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t05"></a>S08-T05 [REC-AC-5 · 已 accepted 工作不被 blocker 倒改](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L207) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t06"></a>S08-T06 [REC-AC-6 · 迟到恢复事实不能覆盖更新 blocker](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L214) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t07"></a>S08-T07 [REC-AC-7 · 反复 tick 不形成通知风暴](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L221) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t08"></a>S08-T08 [TERM-AC-1 · 权威 decommission 导致终局停用](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L230) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t09"></a>S08-T09 [TERM-AC-2 · 暂时离线不能触发终局结果](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L237) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t10"></a>S08-T10 [TERM-AC-3 · 新对象不让旧 Schedule 静默复活](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L244) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t11"></a>S08-T11 [TERM-AC-4 · 继续工作必须显式重建并重新准入](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L254) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t12"></a>S08-T12 [TERM-AC-5 · 已 accepted 的 order 不被倒改或隐式 kill](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L261) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t13"></a>S08-T13 [TERM-AC-6 · 迟到 restore 不能跨越 terminal version](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L269) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s08-t14"></a>S08-T14 [TERM-AC-7 · Terminal 原因可感知且历史不被抹除](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md#L276) | [依赖状态](#环境绑定与依赖状态)、[补跑](#inv-sj11-补跑是同一漏过区间的有界选择) | 外域权威/接受协调 |
| <a id="s09-t01"></a>S09-T01 [RM-AC-1 · 到期成通知、零执行](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-reminder-only-schedule-notification-without-execution.md#L58) | [提醒窗口](#一次性与提醒窗口)、[通知结算](#inv-sj17-整份成功不混淆执行与交付) | 本域/通知 |
| <a id="s09-t02"></a>S09-T02 [RM-AC-2 · 窗口内至多一条](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-reminder-only-schedule-notification-without-execution.md#L62) | [提醒窗口](#一次性与提醒窗口)、[通知结算](#inv-sj17-整份成功不混淆执行与交付) | 本域/通知 |
| <a id="s09-t03"></a>S09-T03 [RM-AC-3 · 种类互斥且不静默翻转](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-reminder-only-schedule-notification-without-execution.md#L65) | [提醒窗口](#一次性与提醒窗口)、[通知结算](#inv-sj17-整份成功不混淆执行与交付) | 本域/通知 |
| <a id="s09-t04"></a>S09-T04 [RM-AC-4 · 错过不补发](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-reminder-only-schedule-notification-without-execution.md#L69) | [提醒窗口](#一次性与提醒窗口)、[通知结算](#inv-sj17-整份成功不混淆执行与交付) | 本域/通知 |
| <a id="s09-t05"></a>S09-T05 [RM-AC-5 · 账本处置可辨](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-reminder-only-schedule-notification-without-execution.md#L72) | [提醒窗口](#一次性与提醒窗口)、[通知结算](#inv-sj17-整份成功不混淆执行与交付) | 本域/通知 |
| <a id="s10-t01"></a>S10-T01 [OBS-AC-1 · 单条读与列表同真相](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L82) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t02"></a>S10-T02 [OBS-AC-2 · 列表有界且可过滤](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L85) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t03"></a>S10-T03 [OBS-AC-3 · 账本覆盖处置全谱（业务方 2026-08-27 裁定 A 修订：词汇随事实）](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L89) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t04"></a>S10-T04 [OBS-AC-4 · 修订锚可对齐](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L96) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t05"></a>S10-T05 [OBS-AC-5 · agenda 诚实四态](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L100) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t06"></a>S10-T06 [OBS-AC-6 · 时区语义显式](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L104) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t07"></a>S10-T07 [OBS-AC-7 · 护栏 fail-loud](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L108) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t08"></a>S10-T08 [OBS-AC-8 · 判词缺席](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L111) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t09"></a>S10-T09 [OBS-AC-9 · 关联 id 可跳转（打通性）](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L114) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t10"></a>S10-T10 [OBS-AC-10 · agenda 过去窗口与账本同真相](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L119) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s10-t11"></a>S10-T11 [OBS-AC-11 · 账本时间窗过滤一致](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md#L124) | [只读读面](#只读读面与资源边界) | 本域读取/应用 |
| <a id="s11-t01"></a>S11-T01 [SN-AC-1 · 受阻成一条持续事项](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-standing-transition-owner-notice.md#L60) | [Standing事件](docs/internals.md#112-standing-转移通知) | 本域/通知 |
| <a id="s11-t02"></a>S11-T02 [SN-AC-2 · 恢复与失效各自成通知](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-standing-transition-owner-notice.md#L64) | [Standing事件](docs/internals.md#112-standing-转移通知) | 本域/通知 |
| <a id="s11-t03"></a>S11-T03 [SN-AC-3 · 不同成因开新事项](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-standing-transition-owner-notice.md#L68) | [Standing事件](docs/internals.md#112-standing-转移通知) | 本域/通知 |
| <a id="s11-t04"></a>S11-T04 [SN-AC-4 · 系统形成、不可伪造](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-standing-transition-owner-notice.md#L72) | [Standing事件](docs/internals.md#112-standing-转移通知) | 本域/通知 |
| <a id="s12-t01"></a>S12-T01 [AC-1 · 用户可表达订阅意向](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md#L105) | [系统订阅](#系统安排与订阅) | 系统功能/本域/授权 |
| <a id="s12-t02"></a>S12-T02 [AC-2 · 覆盖参数带默认值且可调整](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md#L113) | [系统订阅](#系统安排与订阅) | 系统功能/本域/授权 |
| <a id="s12-t03"></a>S12-T03 [AC-3 · 不可控的 feature 仍可感知](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md#L121) | [系统订阅](#系统安排与订阅) | 系统功能/本域/授权 |
| <a id="s12-t04"></a>S12-T04 [AC-4 · 跨订阅者不误去重](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md#L130) | [系统订阅](#系统安排与订阅) | 系统功能/本域/授权 |
| <a id="s12-t05"></a>S12-T05 [AC-5 · 单订阅者内仍至多一次](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md#L137) | [系统订阅](#系统安排与订阅) | 系统功能/本域/授权 |
| <a id="s12-t06"></a>S12-T06 [AC-6 · 同刻展开被确定性打散](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md#L145) | [系统订阅](#系统安排与订阅) | 系统功能/本域/授权 |
| <a id="s12-t07"></a>S12-T07 [AC-7 · 逐订阅者结果独立](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md#L153) | [系统订阅](#系统安排与订阅) | 系统功能/本域/授权 |
| <a id="s12-t08"></a>S12-T08 [AC-8 · 订阅取消后不再展开](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md#L160) | [系统订阅](#系统安排与订阅) | 系统功能/本域/授权 |
| <a id="s13-t01"></a>S13-T01 [AC-1 · Agent 可设定当前 Session 的未来续跑](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md#L108) | [外部接续](#外部接续交付与归档) | Session continuation/ProgressMonitor，非本域imports |
| <a id="s13-t02"></a>S13-T02 [AC-2 · 等待不占执行资源、不消耗执行超时](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md#L115) | [外部接续](#外部接续交付与归档) | Session continuation/ProgressMonitor，非本域imports |
| <a id="s13-t03"></a>S13-T03 [AC-3 · 到点恰好继续一次，且是同一因果链](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md#L122) | [外部接续](#外部接续交付与归档) | Session continuation/ProgressMonitor，非本域imports |
| <a id="s13-t04"></a>S13-T04 [AC-4 · 竞争、重投与接管不产生第二次继续](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md#L130) | [外部接续](#外部接续交付与归档) | Session continuation/ProgressMonitor，非本域imports |
| <a id="s13-t05"></a>S13-T05 [AC-5 · 持续只自唤醒会被既有检测命中](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md#L138) | [外部接续](#外部接续交付与归档) | Session continuation/ProgressMonitor，非本域imports |
| <a id="s13-t06"></a>S13-T06 [AC-6 · 正常推进不被误伤](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md#L145) | [外部接续](#外部接续交付与归档) | Session continuation/ProgressMonitor，非本域imports |
| <a id="s13-t07"></a>S13-T07 [AC-7 · 生存底线不可旁路](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md#L151) | [外部接续](#外部接续交付与归档) | Session continuation/ProgressMonitor，非本域imports |
| <a id="s13-t08"></a>S13-T08 [AC-8 · 已终止的工作不得复活](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md#L158) | [外部接续](#外部接续交付与归档) | Session continuation/ProgressMonitor，非本域imports |
| <a id="s13-t09"></a>S13-T09 [AC-9 · 无效输入 fail loud](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md#L165) | [外部接续](#外部接续交付与归档) | Session continuation/ProgressMonitor，非本域imports |
| <a id="s14-t01"></a>S14-T01 [AC-1 · Master 可以建立可审计的 future intent](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md#L107) | [外部交接与返回](#外部接续交付与归档) | JobExecutor agent adapter/Session/MasterReturn |
| <a id="s14-t02"></a>S14-T02 [AC-2 · Master idle 时仍直接派发](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md#L115) | [外部交接与返回](#外部接续交付与归档) | JobExecutor agent adapter/Session/MasterReturn |
| <a id="s14-t03"></a>S14-T03 [AC-3 · 竞争和重投不会重复创建 child](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md#L122) | [外部交接与返回](#外部接续交付与归档) | JobExecutor agent adapter/Session/MasterReturn |
| <a id="s14-t04"></a>S14-T04 [AC-4 · 过期 authority 不被沿用](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md#L129) | [外部交接与返回](#外部接续交付与归档) | JobExecutor agent adapter/Session/MasterReturn |
| <a id="s14-t05"></a>S14-T05 [AC-5 · 默认 overlap 不制造积压](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md#L136) | [外部交接与返回](#外部接续交付与归档) | JobExecutor agent adapter/Session/MasterReturn |
| <a id="s14-t06"></a>S14-T06 [AC-6 · 三种 terminal outcome 都回到正确 master](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md#L143) | [外部交接与返回](#外部接续交付与归档) | JobExecutor agent adapter/Session/MasterReturn |
| <a id="s14-t07"></a>S14-T07 [AC-7 · Master 永久失效时不静默改投](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md#L150) | [外部交接与返回](#外部接续交付与归档) | JobExecutor agent adapter/Session/MasterReturn |
| <a id="s14-t08"></a>S14-T08 [AC-8 · Schedule 后续变化不篡改 accepted work](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md#L157) | [外部交接与返回](#外部接续交付与归档) | JobExecutor agent adapter/Session/MasterReturn |
| <a id="s15-t01"></a>S15-T01 [AC-1 · 默认逐次确认](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L249) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t02"></a>S15-T02 [AC-2 · 永久授权后自主建立](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L256) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t03"></a>S15-T03 [AC-3 · 读免确认](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L263) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t04"></a>S15-T04 [AC-4 · 修改与取消同创建门](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L270) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t05"></a>S15-T05 [AC-5 · owner 全量可见且可终止](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L277) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t06"></a>S15-T06 [AC-6 · 撤权后 blanket 计划进入 blocked，granular 计划继续有效](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L284) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t07"></a>S15-T07 [AC-7 · 重新授权不自动恢复](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L293) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t08"></a>S15-T08 [AC-8 · target 为自己形成独立 Session](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L300) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t09"></a>S15-T09 [AC-9 · recurrence 全集可用](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L308) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t10"></a>S15-T10 [AC-10 · 间接形成的未来工作不走本确认门](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L315) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t11"></a>S15-T11 [AC-11 · 超出 standing 配额 fail loud](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L323) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t12"></a>S15-T12 [AC-12 · 跨 scope 与越权拒绝](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L330) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s15-t13"></a>S15-T13 [AC-13 · granular 模式下建立即起草、转正即确认](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md#L403) | [作者同意与配额](#作者同意与配额) | 本域/授权/QuotaParticipant |
| <a id="s16-t01"></a>S16-T01 [AC-1 · Internal work 默认不打扰用户](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md#L104) | [结果与归档](#外部接续交付与归档) | 结果发布/主题归档/本域聚合 |
| <a id="s16-t02"></a>S16-T02 [AC-2 · User-deliverable 形成一个权威交付物](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md#L112) | [结果与归档](#外部接续交付与归档) | 结果发布/主题归档/本域聚合 |
| <a id="s16-t03"></a>S16-T03 [AC-3 · 默认站内可见但不主动打扰](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md#L119) | [结果与归档](#外部接续交付与归档) | 结果发布/主题归档/本域聚合 |
| <a id="s16-t04"></a>S16-T04 [AC-4 · 两类工作都可以归档](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md#L126) | [结果与归档](#外部接续交付与归档) | 结果发布/主题归档/本域聚合 |
| <a id="s16-t05"></a>S16-T05 [AC-5 · 重复工作形成稳定 series](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md#L133) | [结果与归档](#外部接续交付与归档) | 结果发布/主题归档/本域聚合 |
| <a id="s16-t06"></a>S16-T06 [AC-6 · Master 整理失败不拿原始报告冒充发布](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md#L140) | [结果与归档](#外部接续交付与归档) | 结果发布/主题归档/本域聚合 |
| <a id="s16-t07"></a>S16-T07 [AC-7 · Provider 失败不丢失也不改投](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md#L148) | [结果与归档](#外部接续交付与归档) | 结果发布/主题归档/本域聚合 |
| <a id="s16-t08"></a>S16-T08 [AC-8 · 重试不重复发布或归档](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md#L155) | [结果与归档](#外部接续交付与归档) | 结果发布/主题归档/本域聚合 |
| <a id="s17-t01"></a>S17-T01 [AC-1 · In-app durable truth 是最低保障](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md#L52) | [通知接缝](docs/public-api-design.md#6-结果通知及事件)、[整体结算](#inv-sj17-整份成功不混淆执行与交付) | 通知/授权/应用/本域 |
| <a id="s17-t02"></a>S17-T02 [AC-2 · Informational notification 默认不阻塞执行](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md#L59) | [通知接缝](docs/public-api-design.md#6-结果通知及事件)、[整体结算](#inv-sj17-整份成功不混淆执行与交付) | 通知/授权/应用/本域 |
| <a id="s17-t03"></a>S17-T03 [AC-3 · Actionable delivery 不复制 request truth](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md#L66) | [通知接缝](docs/public-api-design.md#6-结果通知及事件)、[整体结算](#inv-sj17-整份成功不混淆执行与交付) | 通知/授权/应用/本域 |
| <a id="s17-t04"></a>S17-T04 [AC-4 · External route 受用户策略和实时资格约束](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md#L74) | [通知接缝](docs/public-api-design.md#6-结果通知及事件)、[整体结算](#inv-sj17-整份成功不混淆执行与交付) | 通知/授权/应用/本域 |
| <a id="s17-t05"></a>S17-T05 [AC-5 · 外部预览默认安全裁剪](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md#L83) | [通知接缝](docs/public-api-design.md#6-结果通知及事件)、[整体结算](#inv-sj17-整份成功不混淆执行与交付) | 通知/授权/应用/本域 |
| <a id="s17-t06"></a>S17-T06 [AC-6 · Delivery standing 诚实且保留 fallback](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md#L90) | [通知接缝](docs/public-api-design.md#6-结果通知及事件)、[整体结算](#inv-sj17-整份成功不混淆执行与交付) | 通知/授权/应用/本域 |
| <a id="s17-t07"></a>S17-T07 [AC-7 · 多 route 重复不制造多个逻辑通知](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md#L98) | [通知接缝](docs/public-api-design.md#6-结果通知及事件)、[整体结算](#inv-sj17-整份成功不混淆执行与交付) | 通知/授权/应用/本域 |
| <a id="s17-t08"></a>S17-T08 [AC-8 · 未认证和越权 recipient fail closed](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md#L105) | [通知接缝](docs/public-api-design.md#6-结果通知及事件)、[整体结算](#inv-sj17-整份成功不混淆执行与交付) | 通知/授权/应用/本域 |

### N01–N25 目标附加验收

| ID | 场景与判定 |
|---|---|
| N01 | 不加载 Cordis/tools/HTTP，调用纯日历及日程计算，结果与装配内一致 |
| N02 | 直接 application API 与 Tool/HTTP 相同 command 得到相同授权、CAS、错误和 durable receipt |
| N03 | 同 tenant 不同 owner、伪造模型 tenant/actor、旧 consent 均不能越权或泄露存在性 |
| N04 | 两实例并发接受、发布换版、环境切换、撤权、pause/stop/replace 竞争均有唯一可解释结果 |
| N05 | 提交前后逐点 kill/响应丢失/重启，receipt、Job/通知 intent、次数及 source 处理无半提交 |
| N06 | 未知操作按原键恢复，无法证明未提交时不创建第二份；outbox 重试不重执行 |
| N07 | 旧/新实例 dispose 交错，只撤自身注册，旧 fence 不发新动作，晚到结果归原身份 |
| N08 | 纽约 gap/fold、上海补班、日本 observed、跨年缺覆盖、季度最后工作日及碰撞复核 |
| N09 | eligibleLimit 和 jobLimit 独立；wait/取消不退 Job 次数，notification Job计次数但不占execution预算，过滤/skip 不偷换源 count |
| N10 | 已接受 Job 在环境、日历、Routine 修改后不变；未接受未来按正确模式变化 |
| N11 | 提醒 W、deadline前一毫秒、deadline、短周期下一有效槽、离线多个区间、已接受但晚送分别判定，有notification Job但零执行 Session |
| N12 | 断网初装、旧种子重复、新版发布及 withheld 并存、critical 阻发行、unknown 不通过 |
| N13 | self-wake crash 前后同 Session 同工作、预算不清零、取消不复活；child handoff 则每次新工作 |
| N14 | result 四轴及通知失败不改 execution；master 永久失效不重绑；档案 provider 独立 |
| N15 | preview/agenda 预算耗尽显示 incomplete，查询无业务副作用，分页同刻记录无漏无重 |
| N16 | standing quota并发create不越额，draft/promote/replace计量正确；granular draft免确认、重授后reconfirm不解除pause |
| N17 | internal不公开、series不覆盖前期、actionable多route共用同一humanRequest、外部预览安全裁剪 |
| N18 | self-wake无进展被原monitor命中，正常推进不误判，原Run生存底线持续 |
| N19 | 不装载Session/Agent领域仍可创建、查询、接受并执行program Job；核心包依赖图不出现Session/Agent类型或服务 |
| N20 | agent/new幂等新建、agent/existing只投指定会话；instruction冻结不变；intake决定消息类型；目标失效不fallback新会话 |
| N21 | existing投递入队只记accepted/pending，实际关联终态才结算；重试不重复投递，program输入拒绝任意脚本 |
| N22 | 同一T、候选和政策下，设备恢复/日历恢复/积压扫描选中集合一致；none无旧pending特权，latest 1只选最新，T当刻不占N，下一轮不分页补光；once/环境/reminder/已接受Job例外不被覆盖 |
| N23 | follow切换采用同一环境revision的时区与日历；explicit不跟随偏好但latest仍可换版；pinned不换版；已接受Job一律不回写，系统归属不得假设用户环境 |
| N24 | draft不扫描且可自主修订/丢弃；promote从严格未来开始并重新核验；active文字原地更新，时间/引擎/目标变化原子replace，失败无半后继，lineage与旧Job保留 |
| N25 | 单一规范DTO不含dueSelection；真实provider与tools组合全部验收，无双调度路径、占位成功或未声明回退；完整交付覆盖P0–P7而非仅纯算法 |


下表为每个目标验收的实际执行承担者；上一表的完整判定不可因拆分而减弱。源154项和N01–N25同时纳入完整交付闸，真实适配/存储/tools未完成时不得以设计检查通过结案。

| ID | 主验收入口与参与者 |
| --- | --- |
| N01 | 两包纯根入口与装配内同输入比较 |
| N02 | 应用服务、Tool、HTTP等价及原receipt |
| N03 | 身份/同意/字段披露与跨owner隔离 |
| N04 | 接受/控制协调与Calendar/环境/权限参与者的并发模型及真实故障 |
| N05 | SQLite真实介质切点kill及恢复 |
| N06 | operation query、JobExecutor与outbox交接故障 |
| N07 | Cordis两代提供者/贡献token交错释放 |
| N08 | Calendar与日期提供者golden及Node24/ICU矩阵 |
| N09 | 接受participant双计数、wait/cancel、notification分支 |
| N10 | 本域Job冻结与Calendar/Environment更新 |
| N11 | reminder窗口、通知真实接受/取消与零Session |
| N12 | Calendar供应、种子安装及发布物发行闸 |
| N13 | SessionContinuation持久续跑与JobExecutor child执行对照 |
| N14 | 外部结果/MasterReturn/归档及本域四轴聚合 |
| N15 | 应用查询/投影、只读副作用与分页预算 |
| N16 | 作者/授权/QuotaParticipant同提交及reconfirm |
| N17 | 通知、结果读取/披露、多个route与已有humanRequest |
| N18 | Session原ProgressMonitor/Run生存期限 |
| N19 | 不装载Session/Agent的真实program执行及依赖检查 |
| N20 | Agent适配new/existing、instruction与Session intake |
| N21 | 原execution查询/关联终态与注册program输入schema |
| N22 | 三恢复入口固定T/区间共同选择及例外分类 |
| N23 | Environment/Calendar依据守卫与Job冻结 |
| N24 | 作者生命周期、CAS/Quota/lineage原子替换 |
| N25 | 唯一DTO、全P0–P7真实provider/tools装配验收 |
