# ACK 差分四表对账

2026-09-29，candidate，技术选择 revision 2；主线未采用。[领域性质](ack-domain-reading.md)已明确本次双盲限制；继承T29原读数，本表不重做全域边界。

## A 性质承载

| 性质 | 保护点 | 条件与后继义务 | 能失败的验收 |
| --- | --- | --- | --- |
| A1/A10 明确有权确认 | callAccess新增ack；终结目标核验；独立ACK键 | RT后继写当前授权；只读/ref不授清理 | 同租户只读、旧consumer、跨租户均拒绝；当前consumer通过 |
| A2/A9 真清理与恢复 | durable ACK先行，Storage retention门与内容行同事务删除/释放 | 不假定JSONL/SQL同事务；真实任务最终停止、环境最终可用下继续 | unknown ACK晚提交、SQL未知、每阶段崩溃恢复；清理故障返回pending |
| A3 原身份/幂等 | 原CallKey/creationKey+语义摘要；确认后显式视图 | RT/MS后继；无新发出 | 同key等值返回原ref已确认、异值冲突；旧ref不notFound |
| A4/A5 读者边界 | 只保护实际复制/校验，不保护闲置handle或业务时长 | read/delete共用同调用SQL门；读副本归consumer | 在读完整结束或明确失败；两consumer仅一ACK；闲置者不阻挡 |
| A6 晚写者 | 原发布许可/代际、原批认回、停止后删除 | attempt fence/超时/Map空不证明停止 | 原persisted先赢/后赢、unknown原批晚到；禁止删后旧内容发布 |
| A7 不改结果/账 | ACK不处分；CA后继final→ACK见证→ready同ResponseId选择；原final不变 | 后续合法处分消费自持原值+摘要+当前资格；未知账原值 | 保存→ACK→释放→真实persisted；unknown迟到账；不同发出各计一次 |
| A8 只清自身 | 精确所属CallKey内容/保留责任清单 | 不删原日志/consumer内容/他调用共享内容 | 两调用共享引用/不同locator隔离；外部extra lease单独配对 |

## B 内核负面清单

| 原需求 | 不向Cordis索取的保证 | 本层承接 |
| --- | --- | --- |
| durable确认/释放 | fiber完成不是事务或耐久回执 | SessionLog原批认回；Storage同对象事务 |
| 写未知/副作用 | throw/dispose不回滚已提交日志 | 原批与真实writer责任；明确unavailable/pending |
| 关闭/恢复 | 不假设有序异步dispose、取消即实际停止 | 现owner统一排空；恢复唯一资格与同源读回 |
| 权限/旧ref | Context/ref不是授权票据、不是跨进程活性证据 | 当前租户/关联授权；durable身份与来源代际 |
| 大内容/长时运行 | 不依emit可靠投递、定时器准点或无限内存 | 清理责任耐久；公平调度假设显式；不等待历史consumer |

此表继承原机制读数，新增性质读数作者已见机制，双盲未达成；独立架构评审专查有无因实现形状削弱ACK性质。

## C 对象与承载复查

| 既有对象 | 保持的身份/不变量 | 本次变化与边界判断 |
| --- | --- | --- |
| Model Call | CallKey/原归属/真实三个终态/唯一创建 | 既有service加ACK操作；确认及清理是其阶段，不是新业务对象 |
| Model Response | 原ResponseId、唯一真实final、原usage/cost/inputCalibration | pending值不永久由model保管；ACK不造处分；MR后继只补持有例外 |
| Session Log | 不可变、完整原批判重、事实源同一本 | 加MS ACK记录；不改日志、不建Session/Run完整实现 |
| runtime私有内容 | locator/version/摘要、内容归属明确 | 同owner retention控制行/读写删除门；无需通用内容/GC服务 |
| call accounts | 每次实际发出恰一次、原账不可改 | CA后继承认ACK最小原账见证，非新账对象/计算引擎 |

独立架构评审r1阻断B1已推动真实改向：删掉ACK自动consumed、拆独立确认键、增加最小账见证与延后真实处分核验。不是将产品降级去适配旧final机制。

## D 代价与动态性

| 信号 | 明确代价 | 限制与取舍 |
| --- | --- | --- |
| 版本影响 | RT12/MS8/MR11/CA4及runtime/messages/accounts后继 | 仅真实保留/读取/账来源变更；SL3/模型厂商/完整Session不升 |
| 交错状态 | retained/retiring/acknowledged/released与原批未知 | 统一一套生命周期，不留旧noGC模式或全局GC开关 |
| 长期空间 | 每CallKey最小身份/账/摘要仍保留 | 清理大副本，原日志保留是既有事实边界；不宣传全Session无限空间为常量 |
| 延后处分 | 若ACK后再形成完整final，consumer须自持原完整值 | MR原字段不可由摘要恢复；非ACK/读账前置；不建立第二份runtime副本 |
| 未来可替换 | ModelCallHost与现Storage/SL提供者承担真实生命周期 | 不新增plugin/isolate/通用GC平台；正式Schema与Cordis句柄分离 |
| 反查索引 | 当前未建立对象→需求自动反查 | 本表人工核Model Call/Response/Log/Accounts及PF013§6.19；不据未建立索引扩大需求 |

结论：可在既有runtime扩面；四契约窄后继必要，先独立审本选择，后起草精确规格与形式模型。尚未接受或实现。
