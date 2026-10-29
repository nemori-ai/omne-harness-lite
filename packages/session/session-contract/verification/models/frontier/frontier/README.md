# Frontier

检查 taken/解释分离、完整 batch、捕获 E 不丢尾部、最终根、取消窗口、后继与迟到原终态、未知认回、head/cursor 和相关读取集合。

## 有限前提

一个本租户 Session、至多两个输入、两个顺序 Run。两个本租户相关 execution、一个无关旧 execution 与一个仅提供错误材料的外租户 execution。每个 execution 最多四个原事件。一次意图至多一次最终业务提交。

模型假定原日志不可变、连续，目录完整可验证，单个发布动作原子成立。配置没有搜索深度截断，并关闭 deadlock 检查。进展需要有限相关历史、材料最终可读、公平调度与最终提交机会；本资源不证明无条件活性。

## 覆盖边界

P-5 只在外部合法收束前提成立时检查前缀机制。该模型不覆盖 PM-02，也不独立覆盖 frozen-active 新受理完整链或共享 gap 门，分别看伴随模型。

源文件 [Frontier.tla](Frontier.tla)、[cases.json](cases.json) 与 cfg 保留采用字节或明确的元数据分区映射。具名负控、见证及正控的精确目标见[配置目录](../case-catalog.md)。复跑参数、测量自检和证据含义见[总入口](../README.md)，实现接续义务见[动作映射](../mapping.md)。
