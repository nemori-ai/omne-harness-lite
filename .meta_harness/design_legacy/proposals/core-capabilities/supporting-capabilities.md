# 预算、供应方账务、工程观测与命令入口

正文已按状态权威迁入以下精确规范；本页保留来源导航，不维护并行 draft。

- [计量预算、额度及账务关联 v1](../../../spec/capabilities/budget-accounting/v1/contract.md)。
- [工程证据、查询与缺口 v1](../../../spec/capabilities/engineering-observation/v1/contract.md)。
- [Slash 输入与键盘控制 v1](../../../spec/capabilities/command-input/v1/contract.md)。

## 具体计量来源核对

2026-09-13 的 OpenRouter [Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
说明响应/最后 SSE 可携带用量和费用，也可沿 generation ID 查询。adapter
保留该 ID、原始计量单位及来源；连接在最后帧之前中断仍可能缺失费用，
不能将文档的正常响应路径当无条件完整账务保证。[Generation 查询](https://openrouter.ai/docs/api/api-reference/generations/get-generation)
是核实入口，不是任意用户 Run 的外部幂等重试证明。具体单位到金额的映射
须由实现固定 API 样例验证，不能把 credits 和不同币种数字直接相加。
