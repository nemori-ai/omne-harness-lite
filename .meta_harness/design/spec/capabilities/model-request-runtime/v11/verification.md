# RT11 candidate 验证义务

## 变化的影响

2026-09-29，本批从已接受前驱复制完整未变义务后定点演进；旧版本、旧接受与frozen字节不变。精确差异和消费者见[consumer-impact](consumer-impact.md)。本候选未接受；前驱“已接受/已验证”只保留其原范围。新Schema形状与行为模型检查不升级提供者或装配状态。

批内对齐：统一CallKey/CreationKey/ModelCallPayloadRef归MS7、PendingModelResponse归MR10；操作失败新增creationConflict，消费终止值独立；RT14操作九项传播；PF-013rev16/PF-012rev21/PF-015rev20；CA3先按ResponseId选择后交原纯sum。MR→MS→CA单向登记，防环自定义按既有口径对齐；SL3不升版。

## 必需证据与真实状态

| 义务 | 证据落点 | 状态与限制 |
|---|---|---|
| 新值必填、封闭分支、pending/final禁误用、精确跨Schema refs | 本批data的reference-examples/ready-examples及原实例 | 实际结果见版本外verification；形状不证明来源/权限/摘要 |
| 消费N→0不取消、ready终态与处分分离、成本不双加、旧投影不重开 | RT11 ReferenceLifecycle正配置及3负控 | 实际结果见版本外verification；不证明真实HTTP/取消/内存释放 |
| 内容先于marker、未知writer保留、引用回收保护、final原批唯一 | RT11 Publication正配置及3负控 | 实际结果见版本外verification；不证明物理存储/字节相等 |
| opened旧attempt仍可记录、取消同日志顺序、tail竞争、首内容后lost不重发 | RT11 OpenedOrder正配置及4负控（含R2 OldAttemptMayOpen许可） | 实际结果见版本外verification；真实准入/停止端口未开始 |
| 当前读/等待/处分/取消及资源内撤权 | 跨租户、撤权、同ref多消费者真实边界场景 | 未开始，caller布尔不能关闭 |
| 用户中断/网络/协议/超时/owner卸载，consumer先消失和新Run取回 | runtime持久原reply或fault delivered、已知账/未知及acquire原值对照 | 未开始；interrupt不返回第二结果；硬kill未持久增量不假承诺 |
| 不可变JSON原字节/完整数字/重复键拒绝、摘要、下层引用存续 | 内容存储真实写入→reopen→字节对照，损坏/删除/并发回收注入 | 未开始；Schema只表达数，不保证解析器无损 |
| creationKey同原输入、拒绝创建、profile变化、unknown认回 | 多进程重启/丢回执、同键不同值冲突 | 未开始；模型固定key/payload按构造成立，不算覆盖 |
| final并发处分、消息同批、成本读面ready/final接替与补账 | 真实SL3同日志、多写方及账汇总对照 | 未开始；模型原子Commit不能证明存储实现 |
| 指定lookup相对日志长O(1)、重建/历史列表另计 | 不同日志规模下真实I/O计数与结果长度 | 未开始，不用模型状态数代性能证据 |

## 对齐义务

MS7的ResponseId/SelectedBy/CredentialScope/ParameterAdjustment及droppedParameters按MR10权威逐字形状对齐；CA3 ResponseId保持同一形状，不能反向登记造成环。MS7只保存MR10 pending引用，不复制payload。MS7原dispatched继续MP5，新created的已采用快照精确MP6；MR10保持MP5响应快照形状。上下文只取既有Message，两个新marker不能混入。

## 已知缺口

G-38 当前资格/生产终态来源（Session/Run访问装配）；G-39 内容保留共同对象（内容存储/日志/runtime）；G-40 真停止/索引/撤权（恢复装配/runtime）。前驱其余未闭合缺口及owner按contract保留。数据无新增独立行为状态机，不增空TLA/Alloy；新跨记录/跨提交性质由RT11模型和真实组合义务承接，未运行继承Alloy不声称通过。

## 报给主线

本稿candidate，真实提供者/装配/权限/存储/取回链尚未验收。registry/catalog、covers、formal-tasks新增候选；lineage仅支持legacy baseline迁入，id-namespaces无新增族，二者保持。未对正式领域对象/词表/产品/提供者设计作修改。

## R2 变化的影响与证据义务

S-5/S-33/S-68/S-72/S-75/S-77/S-79/S-81/S-85/S-86/S-92：一份响应事实两阶段；live只读识别；中断fence完整；首次消息合法派生/真实性先行；两类零发送创建关联。S-88的旧attempt许可新增ENABLED断言及定点负控。

[examples](examples.md) 新增的跨记录场景是组合验收义务，未执行，不由Schema或旧TLA代证。必须保留原已有派生、防伪造system来源、覆盖原消息全成员与嵌套派生id/可见性、unknown认回原批；原摘要/来源矛盾必须拒绝，不能full兜底。真实写权/转换来源/组装选择证明归各消费者；未知明确unavailable。当前来源范围见 [source-alignment](source-alignment.md)。本轮实际检查仅报告新证据，前轮日志不可覆盖。

## R2 独立发现的修订落点（待复评）

| Finding | 修订坐标 | 实例/证据与未覆盖 |
|---|---|---|
| A-B1 | MS7 S-9；MR10 S-14/S-45/S-47；RT11 S-75/S-77/S-79/S-86 | 四包 examples/verification：原派生不覆盖、合法新派生块、真实来源/写权、unknown同批、摘要真实性先行；真实组合验收未开始 |
| A-B2 | RT11 S-33/S-72/S-92 | live只读成功，不取消、不强停；仅追补取恢复资格；examples含新attempt与旧speaking |
| A-B3 / S-B2 | MS7 S-50/S-54 与 ModelCallEndedRecord Schema；RT11 S-28/S-85 | 初次拒绝成对字段，已accepted后首次dispatch拒绝字段均缺；同key认回accepted原身份/当前终态；JSON正反例实际通过 |
| S-B1 | MR10 S-4/S-8/S-14/S-46/S-47；RT11 S-5/S-86；CA3 S-40/S-41 | ready可永久pending、无reply直接final、同ResponseId一账，不强造consumed |
| S-B3 | RT11 S-68 | Run中断意图明确fenced{run,attempt}；非Run明确unfenced，不再用同上 |
| S-B4 | RT11 S-33⑤ | 九个状态闭合集合，包含open及live；ready/final处分信息与当前事实一致 |
| S-B5 | OpenedOrder.OldAttemptMayOpen | R2正配置+错误attempt栅栏单变异负控；只证明许可存在，不宣称调度公平或实际最终进展 |
| S-B6 | 四包入口 + source-alignment.md | 当前产品rev及逐topic范围/实际锚点索引；历史裁决保留原rev，未消费增量外置 |
| S-N1 | MS7 examples.md 与 reference-examples.json | 旧零发送例明确已有accepted创建；初次拒绝成对字段例另列；Markdown实例纳入实际Schema检查 |
| S-N2 | MR10 S-40；RT11 S-8/S-49及当前义务引用 | 活跃坐标MR10/MS7/CA3统一；历史演进/接受坐标保持 |

## R2 实际运行范围

2026-09-29，本轮Schema检查70/70（包括Markdown中的model_call_ended实例），exit 0。OpenedOrder正配置exit 0，255 generated / 166 distinct；4负控exit 12，分别命中OldAttemptMayOpen、CancelCannotPrecedeOpened（两配置）、NoSendAfterOpenedLoss。每次run前已保存输入SHA、Java版本/JAR SHA、命令、退出码及独立原日志；临时证据在 `tmp/model-registry-design/spec-draft-r2/`，由主线提升正式evidence。无失败日志覆盖。Schema只是形状，不能证明跨记录关系、真实来源、写权或实际汇总。

ReferenceLifecycle/Publication共10个模型/配置输入与首轮交付SHA相同，保留原有限结果，本轮未重跑；逐项差异见该证据目录的prior-model-applicability.json。原OpenedOrder旧run不冒称适用于新字节。其他继承模型均未运行。852冻结资源校验无差异，首轮evidence归档hash无差异；这不是接受或生产验收。

## 无独立回收路径的条件化修订

2026-09-29，联合节点评审指出原“同内容保留记录”把有独立回收竞争的机制写成普遍前提。本候选明确无独立删除/GC且与全部有效引用、尚可能发布writer同存续的耐久容器亦可兑现；不减内容确认先于marker、原字节/版本/unknown与外部引用保留保证。Schema/实例/形式模型字节未变，Publication仍只覆盖其显式保留/回收抽象；不借旧TLC声称SQL+JSONL或无GC物理实现已验。所选真实映射与负控见runtime v20 R20-V6。
