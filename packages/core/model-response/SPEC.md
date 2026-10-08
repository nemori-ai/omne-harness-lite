# Model Response 当前采用边界

当前公开类型和 Schema 由本包拥有。F0 迁移消息依赖时，当前 Schema 身份升为 `data.model-response/v12`，包内仍只维护一份当前资源。

相对 MR11，仅更新 Schema 身份及两个 `AssistantMessage` 引用，使其指向 Message 当前 MS9 资源。AssistantMessage 的形状未变化。响应、待回复、输入校准、实际费用、无损表示、收场、原回复及 ACK 后采用的全部业务承诺继续遵循已采用的 MR11；本页只取代 Schema 身份和这两个依赖版本，不新增行为或旧执行 codec。

验证应确认 25 个公开定义、两个私有成员校验器及完整资源图可编译。精确转换断言只允许上述三个位置改变，其余整个 Schema 结构应与 MR11 相等。业务性质和失败场景继续由本包原测试与真实模型消费者核验，Schema 编译不证明实际发送、耐久结算或当前权限。
