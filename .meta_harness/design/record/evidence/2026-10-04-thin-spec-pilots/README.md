# N4 薄规格试点

本记录接续 D-114/D-115 与负责人 N4 实施/验收授权。
当前状态：实施中，尚未接受交付。精确候选、独立评审、验收及集成结果待实际执行后补入。

[承诺归属与取代范围](../../../architecture/pilots/n4-ownership.md)为本批迁移清单。
试点覆盖治理公共定义/SQL 服务、模型纯退避/local 消费者与 tenancy-host 整体性质。
既有业务协议、未迁冻结与模型义务保持，N5～N8 未因本记录开工。

执行计划：`/data/qiwei/.claude/plans/smooth-tinkering-acorn.md`。
运行证据：工作树 `tmp/arch-intent/n4/`，BASE `92b4e7dec8c066655992662820b38b0eb96ea089`。
不跑全量 make check、不排队、不做完整模型基准。

## 2026-10-04 实际实施与验收收口

上文保留首批实施时的记录。本事件改变本批交付状态：按负责人 N4 自驱实施与验收授权，
主会话已接受精确候选 `5d0d402fce4d24406daf4d2a5ffa81ca9e70cf2b` 的限定交付。
[采用决定](../../decisions/thin-spec-pilots-adoption/decision.md)明确取代范围。
Session 是完成的候选设计，机制未接受；N5～N8 未开工。

[输入及保全收据](inputs-and-preservation.json)固定候选、BASE、范围、公开源与实际输出散列。
[独立 QA 原报告](qa-report.txt)和[机读结果](qa-report.json)为 **Pass with issues**：A1～A7均有通过证据，
407 个不同产品/工具用例通过，包含复跑共410次成功执行；4个既有治理skip不计通过。
另有6组公共入口、2个真实Service/SQL生命周期场景、4个实际pack及严格独立声明消费者。
[独立实施评审](implementation-review.txt)及[最终增量](implementation-supplement.txt)没有未关闭发现，IR-1/2/3均关闭。
这些报告是本次运行原文的逐字副本，其中相对路径按原归档目录恢复；原输入和报告没有改写。

### 实际验证和失败闭合

手动影响范围为49构建依赖成员、17类型检查成员、16相关测试成员与14具名工具套件。
[收口表](verification-closeout.txt)区分原批次、定点复跑和精确闭包继承。
原16成员批次有7处失败，不改记为全绿：fixture装载、host旧键/代理身份、README消费均已修复并定点通过。
两个response-writer和一个supervisor冷恢复在原45秒预算下，根单worker及独立QA净树两轮通过。
原并行及早期单独超时均保留；结果受运行条件影响，唯一根因未证明。
此条件限制作为 QA-N4-I1 保留，后续由验证责任拥有者定位，不增加时限或降低断言。

CLI acceptance 5/5通过，[strict回路原文](loop-status.txt)显示精确5d tracked干净、方向/环0、验收锁/删卡/传感器硬线通过。
agent196生成文件和3链接、文档2554文件、设计登记及109相关Python检查通过。
正式格式维护范围的310个影响文件通过；直接Prettier初探另报的锁文件/架构JSON不属该范围，BASE也不匹配，未借此重写。
agent编译一致不等于宿主/模型基准；设计登记不等于形式工具运行。没有全量make check、队列或完整基准。

本次 QA **实际执行**[五个有限形式配置](formal/formal.json)：Membership、AckLifecycle、AckProgress正例exit0，
Membership-NoSerialization、Ack-atomic负控各exit12并产生预期反例。
模型/配置快照在[formal/inputs](formal/inputs/README.md)，原始日志分别为[Membership](formal/Membership.log)、
[Membership负控](formal/Membership-NoSerialization.log)、[ACK生命周期](formal/AckLifecycle.log)、
[ACK进展](formal/AckProgress.log)和[ACK负控](formal/Ack-atomic.log)。
原模型仅有限actor/call/consumer规模，进展依赖原公平性条件；不证明新Service集成、真实IO或任意实现。
111份选定冻结资源字节保持，原OG2/RT12输出按原输入及前提读取继承，未把全部归档绿测计为本轮运行。

### 结构与架构读数逐项处置

[实际架构摘要原文](architecture-summary.txt)对应固定5d revision，inputDirty=false，无未版本输入；运行绑定未观测。
审讯页为 `/data/qiwei/repos/omne-harness-lite/.worktrees/arch-intent/tmp/arch-intent/n4/view-5d0d/report.html`。
以下分类的每一行、处置及理由均保留在[逐行清单](red-dispositions.json)，不以总表替代行级记录。

| 读数 | 处置与理由 |
|---|---|
| global-architecture预期变化 | 已处理：只更名两个候选provider selector、加入两个公共owner同域候选。规则/领域/其他角色语义未变，层次保持unknown；与新增偏离反向核对通过。 |
| 143个触及超线业务函数 | 保留：独立审计与BASE原函数字节相同。rename不当作新增业务复杂度；同名observedFacts歧义单列。 |
| 工具复杂度18→25、17→19、新9 | 保留：精确类来源与位置匹配，错键、重复、同一行和namespace反例要求额外分支；3架构套件56项及独立18项支持，阈值未变。 |
| 11成员带位 | 保留：趋势基线为f226b4cca，不能都归因任务BASE。本次未改core原源码；local的59个超alert函数为更名存量，不因此启动清理。 |
| 40新增跨成员边 | 保留：逐边按公共定义/真实消费者迁移解释，无私有路径兼容。 |
| 78克隆对 | 保留：77对两侧在BASE归一导入/空白后存在；另1对是公共定义/配置边界，逐对审计。 |
| 166旧装配投影新增偏离 | 保留：源码移位/新定义事实与未迁旧投影仍可对照，后续按N5/N6条款批次退役。不把多个静态类当多个实际fiber。 |
| 20新全局偏离 | 保留：1个IC-2为local既有直接provide；19个IC-4为未迁source/type闭包。治理根4个沿kernel-basis根触及Cordis，归N5分面。纯运行loader成功不能消除该读数（QA-N4-I2）。 |
| unknown、候选和运行未观测 | 保留：5个未解析服务标识、候选层次与未实现/待裁IC仍可见。静态图不证明隔离、同提交、恢复或LSP。 |

### 保全和未覆盖

原始配置、源码快照、全部失败/复跑、制品、独立报告与模型输出保全在当前工作树外的主检出任务位置：
`/data/qiwei/repos/omne-harness-lite/tmp/arch-intent/n4-delivery/5d0d402f/`。
源码归档13460个blob读回核对，源码bundle依赖明确BASE；root/QA归档分别282/1397项逐项读回核对。
本目录收据记录归档SHA及原文件SHA，路径不是唯一保全凭据。这里只承诺本机留存，没有远端备份声明。

PG整体恢复、分布式、真实付费上游、完整模型十五方法公共定义、Session机制、全IC迁移、全仓/完整形式与角色基准未执行。
QA未独立重跑浏览器交互或宿主自动hook；本批复用了既有视图，核对的是精确离线HTML/数据和抽取正反例。
工作树仍由本会话及HTTP预览使用，延期退役；释放条件为会话迁出且预览/后续消费者释放，并确认证据已保全。
