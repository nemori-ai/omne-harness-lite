# PM02

原拒收不创建 execution，首输入只 SE35 rejected。冻结时失败终态与其余精确 SE38 同批。Accept 允许 frozen 且 active 的新输入，旧准备必须 Conflict 后重算。

## 有限前提

一个 Session、一个 active Run、一个原 invoke 身份、一个 finishRun operation、两个准备者、最多三个输入。原 invoke、freeze、最终发布和故障注入各至多一次，query/replay 各最多两次。

模型假定原日志不可变、连续，目录完整可验证，单个发布动作原子成立。配置没有搜索深度截断，并关闭 deadlock 检查。进展需要有限相关历史、材料最终可读、公平调度与最终提交机会；本资源不证明无条件活性。

## 覆盖边界

不含已有 execution 的一般前缀、后继 Run、完整恢复资格或通用控制组合。见证以真实 Freeze→Prepare→Accept→Conflict→Prepare→Publish 顺序和状态值核对。

源文件 [PM02.tla](PM02.tla)、[cases.json](cases.json) 与 cfg 保留采用字节或明确的元数据分区映射。具名负控、见证及正控的精确目标见[配置目录](../case-catalog.md)。复跑参数、测量自检和证据含义见[总入口](../README.md)，实现接续义务见[动作映射](../mapping.md)。
