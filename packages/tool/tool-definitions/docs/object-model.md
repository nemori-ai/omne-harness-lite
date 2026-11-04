# 内部对象模型

## 对象与关系

ToolImplementation 是无资产名称的作者实现，资产治理由 loader 注入。Arguments 是一次边界解析结果。Prepared 是原文件身份、原文和计划新文的临时值，不是持久化批次。

## 生命周期

ProcessHandle、FileIdentity、TerminalRef 均由 Execution 拥有。作者不从对象 token 推导路径，也不从版本推导权限。TextWindow 只保存本次显示所需的有界首尾文本。终端状态和资源寿命不存进作者。

生命周期与未知结果见 [SPEC](../SPEC.md#所有权失败与生命周期)。
