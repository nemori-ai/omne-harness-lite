# 无GC最小映射定点复评

2026-09-29，锁定 `97f04eed53a7a8df2605dacbe080c3218f674a3e` 相对 `807ac9938efba68d6c3f2c840dfd70adff1bdddd`。两位只读 reviewer 分别核架构修订与规格表达，均未运行测试或形式工具；本页记已发生的判断，不替主线接受。

## 架构结论

九文件差异完整复核：无阻断，R-B1/R-N1/R-N2在设计层关闭。现Storage私有不可变原bytes、先内容确认后JSONL marker、无独立删除/GC、unknown/孤儿/关闭不结束存续，与RT11/MS7条件一致；没有第二份执行事实权威，不需通用内容service或跨store事务。可信准入同序限定本地全部写方/完整append/实际停后交权，跨进程无协议unavailable；H19新DTO不再当前前置，原来源/摘要规则保持，真派生缺源仍明确失败。

generation归受信来源绑定，进度来自SL3 readByKey权威tail，双读与投影水位核验，不从派生head自证。MR helper的pending先完整判定再读final保持原优先级与关系。无新增架构非阻断或产品政策待裁。

两处表达残句由作者同步：ST6表仍写一次SessionProjectionHead读；verification旧段仍称ModelContentRetention+JSONL后继阻durable。已按正文改为权威tail双读和无GC已定映射，仅文档同步，没有新增行为。

## 规格表达结论

仅四份spec文件，diff SHA256 `32b73ec1adb23bfe9fbda9bc50beb2ce4b22e5086fff96ebfc3be96c73a7a10a`。无阻断、无新增非阻断、无范围外待裁。RT11 S85/S93/G39与MS7 S55一致区分无独立回收容器与独立回收互斥；S86、MS7 S52/S54、MR10 S46相容。内容耐久先marker、有效引用/未停writer同存续、关闭不删、unknown留责、版本不复用、外部引用仍核保留均未削弱。Schema/实例/TLA/config字节在该提交范围未变，Publication覆盖声明准确。

## 未覆盖与主线门

真实Storage/JSONL持久化、unknown收口、重启保留、撤权/换代、读取成本、制品闭包均待实施及独立验收，旧模型不代证。四候选与五节点仍未接受；技术接受、冻结登记与后续实施开工归主线。本页不将外域提供者缺席升级为本轮必须实现完整Session/Run。
