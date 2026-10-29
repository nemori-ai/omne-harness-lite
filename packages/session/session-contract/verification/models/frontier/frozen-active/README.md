# FrozenActive

Capture→目录→Accept→Admit→旧前缀→旧尾部→Refresh→重捕获→最终发布。同链分别检查新输入已 taken 和仍 pending、双方最终竞争、正常 ended 与取消窗口。

## 有限前提

一个 Session、一个已有 execution 的 frozen active Run、两个输入。初始 input 1 已 taken，raw 有 taken 与普通 effect；input 2 可在捕获后受理、建立原目录并 taken 或保持 pending。事件序列至多四项。

模型假定原日志不可变、连续，目录完整可验证，单个发布动作原子成立。配置没有搜索深度截断，并关闭 deadlock 检查。进展需要有限相关历史、材料最终可读、公平调度与最终提交机会；本资源不证明无条件活性。

## 覆盖边界

正常 ended 前提是当时受理输入均原 taken 且 grant 有效。没有完整 P-5 资格、真实 head 修订、动态 custody、unknown、恢复、后继 Run 或与 GapIsolation 的组合证明。

源文件 [FrozenActive.tla](FrozenActive.tla)、[cases.json](cases.json) 与 cfg 保留采用字节或明确的元数据分区映射。具名负控、见证及正控的精确目标见[配置目录](../case-catalog.md)。复跑参数、测量自检和证据含义见[总入口](../README.md)，实现接续义务见[动作映射](../mapping.md)。
