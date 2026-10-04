# 模型请求运行时：纯退避计算

本批只迁 `retryDelay`、输入/结果类型及纯策略判别。完整运行时的十五操作与耐久生命周期未迁。
形状归根入口；本文件拥有迁入的 S-60 函数行为。
[迁移范围](../../../.meta_harness/design/architecture/pilots/n4-ownership.md#模型请求运行时)保留其他精确旧源和模型义务。

## 显式输入与失败

计算只读显式输入，不读取账号、环境、时钟或其他外部状态，不调用模型，不发送事件。
函数不调度等待，不产生随机数。调用方给出 uniformSample，承担样本来源的责任。
输入不得被修改，结果由函数拥有。非法形状/值返回 invalidInput/malformed，不补默认政策。

n 为严格正整数，factor 为有限且不小于 1 的数。base/max 为有限非负 TD3 Duration。
uniformSample 为有限数，满足 0 ≤ u < 1。未知 kind/jitter、缺项或额外字段均非法。
Duration 与 JsonNumber 使用公开精确值语义，不能先转成毫秒浮点数再计算。

## 算法

以同一时长单位计算。B 根据 kind 取 base、base × n 或 base × factor^(n−1)。
D = min(max, B)。none 返回 D，full 返回 u × D，half 返回 D/2 + u × D/2。

对于 decorrelated，previousDelay 必须是有限非负时长。第一次重试明确给 previousDelay = base。
lo = min(base, max)，hi = min(max, max(lo, previousDelay × factor))。
返回 lo + u × (hi − lo)。不得改用其他 jitter 的 D 来替代这个区间。

函数不进行舍入或离散化。实际计时器的精度与等待方式由消费者决定。
u = 0 取下界。上界在非退化区间不被取到，退化区间返回唯一值。

## 验证与消费者

迁入的精确向量和非法输入用例验证算法、边界、冻结结果与输入不变。
默认重试组件通过此公共入口消费，策略配置仍由运行时拥有。
根入口和实现不加载 Cordis。本批没有建立完整 ModelRuntime Service 定义。
