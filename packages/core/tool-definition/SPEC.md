# Tool definition 行为补充

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 并实施第二阶段。
本页接续 ToolResult.isError 与执行环境权限声明的具名新增语义；公开类型、当前 Schema、返回判定和规范化共同实现该形状。其他未迁条款、旧规范实例和 retained Schema 的验证义务保持。

isError 为 true 表示正常返回的业务失败。省略或 false 表示正常返回的成功。字符串返回始终按成功归一，不能从文本含有“错误”等词推定失败。

该字段不表示执行准入拒绝、运行时中断或调用异常，也不携带执行账。判定与规范化须保留省略、false 和 true 的区别，不修改作者输入。

当前 Schema 的公开 URI 保持。具名变化之外的形状继续接受原冻结资源的比对，原正反例继续运行；旧资源的字节与历史散列不改写。

## 执行环境权限声明

本增量沿2026-10-06用户授权的PR1协议交付。ENVIRONMENT_PERMISSION_VALUES是executionEnvironment内建权限项的三态形状源，与execute动作权限及targetEnvironment落点设置分开。声明函数要求有权配置方显式给出factoryDefault，不提供隐式初值；无环境声明的工具不产生此项。声明不是已授权限，当前求值及组织／租户收窄仍由资产及授权领域拥有。除这个具名新增声明入口外，原ToolDefinition数据与冻结Schema不变；实际输入生产及工具采用链在PR2验证，不能凭常量值自签授权。
