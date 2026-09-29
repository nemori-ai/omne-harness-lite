# CA3 candidate 验证义务

## 变化的影响

2026-09-29，本批从已接受前驱复制完整未变义务后定点演进；旧版本、旧接受与frozen字节不变。精确差异和消费者见[consumer-impact](consumer-impact.md)。本候选未接受；前驱“已接受/已验证”只保留其原范围。新Schema形状与行为模型检查不升级提供者或装配状态。

批内对齐：统一CallKey/CreationKey/ModelCallPayloadRef归MS7、PendingModelResponse归MR10；操作失败新增creationConflict，消费终止值独立；RT14操作九项传播；PF-013rev16/PF-012rev21/PF-015rev20；CA3先按ResponseId选择后交原纯sum。MR→MS→CA单向登记，防环自定义按既有口径对齐；SL3不升版。

## 必需证据与真实状态

| 义务 | 证据落点 | 状态与限制 |
|---|---|---|
| 新值必填、封闭分支、pending/final禁误用、精确跨Schema refs | 本批data的reference-examples/ready-examples及原实例 | 实际结果见版本外verification；形状不证明来源/权限/摘要 |
| 消费N→0不取消、ready终态与处分分离、成本不双加、旧投影不重开 | RT11 ReferenceLifecycle正配置及3负控 | 实际结果见版本外verification；不证明真实HTTP/取消/内存释放 |
| 内容先于marker、未知writer保留、引用回收保护、final原批唯一 | RT11 Publication正配置及3负控 | 实际结果见版本外verification；不证明物理存储/字节相等 |
| opened旧attempt仍可记录、取消同日志顺序、tail竞争、首内容后lost不重发 | RT11 OpenedOrder正配置及3负控 | 实际结果见版本外verification；真实准入/停止端口未开始 |
| 当前读/等待/处分/取消及资源内撤权 | 跨租户、撤权、同ref多消费者真实边界场景 | 未开始，caller布尔不能关闭 |
| 用户中断/网络/协议/超时/owner卸载，consumer先消失和新Run取回 | runtime持久原reply或fault delivered、已知账/未知及acquire原值对照 | 未开始；interrupt不返回第二结果；硬kill未持久增量不假承诺 |
| 不可变JSON原字节/完整数字/重复键拒绝、摘要、下层引用存续 | 内容存储真实写入→reopen→字节对照，损坏/删除/并发回收注入 | 未开始；Schema只表达数，不保证解析器无损 |
| creationKey同原输入、拒绝创建、profile变化、unknown认回 | 多进程重启/丢回执、同键不同值冲突 | 未开始；模型固定key/payload按构造成立，不算覆盖 |
| final并发处分、消息同批、成本读面ready/final接替与补账 | 真实SL3同日志、多写方及账汇总对照 | 未开始；模型原子Commit不能证明存储实现 |
| 指定lookup相对日志长O(1)、重建/历史列表另计 | 不同日志规模下真实I/O计数与结果长度 | 未开始，不用模型状态数代性能证据 |

## 对齐义务

MS7的ResponseId/SelectedBy/CredentialScope/ParameterAdjustment及droppedParameters按MR10权威逐字形状对齐；CA3 ResponseId保持同一形状，不能反向登记造成环。MS7只保存MR10 pending引用，不复制payload。MS7原dispatched继续MP5，新created的已采用快照精确MP6；MR10保持MP5响应快照形状。上下文只取既有Message，两个新marker不能混入。

## 已知缺口

G-13 ready/final完整来源与唯一选择（runtime/成本读面）。前驱其余未闭合缺口及owner按contract保留。数据无新增独立行为状态机，不增空TLA/Alloy；新跨记录/跨提交性质由RT11模型和真实组合义务承接，未运行继承Alloy不声称通过。

## 报给主线

本稿candidate，真实提供者/装配/权限/存储/取回链尚未验收。registry/catalog、covers、formal-tasks新增候选；lineage仅支持legacy baseline迁入，id-namespaces无新增族，二者保持。未对正式领域对象/词表/产品/提供者设计作修改。
