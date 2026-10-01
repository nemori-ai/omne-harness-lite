# D-104：模型请求恢复时序的精确表示

2026-09-28，主线依用户持续实施、主调度及技术验收委托，接受 `data.model-response/v8` 全40条／3资源及 `capability.model-request-runtime/v9` 全76条／52资源，资源摘要见 [acceptance.json](acceptance.json)。本次继承 D-100／D-101 的当前代际及估算余量政策，修复 durable dispatched 先于 HTTP 与原实际 sentAt 必填之间的表示缺口。依据沿[适配提案](../../proposals/model-request-adaptation/design.md)及其中[独立评审](../../proposals/model-request-adaptation/review.md)，不是为了让实现通过而隐去已知发送事实。

相同耐久前缀可能对应锚点后零 send 或发送后崩溃。已确认请求责任的 interrupted 结算允许 `timing.sentAt:null`，只表示没有可用实际交给传输的时刻；已知实际时刻必须保留，禁止锚点／恢复时间代填。Pending 与普通独立 invoke 的实际发送时刻仍必有。null 不证明零 send、零费用，不授权重发；firstTokenAt 仍按 durable opened 与原时序规则。

参数三项由同次固定最终适配计划原样恢复，不把 requested 当 adapted，不据参数存在推断发生发送；真实发送须与计划相同。恢复保留原 owner 从同次传输／归一化边界掌握的可信实际账、头与身份，只把不可得部分记 unknown，不采任意 caller 的声称、不为核事实发 HTTP、不覆盖已经确认的完整响应批。ResponseId 幂等、完整批认回、实际旧任务停止和日志共同提交要求保持。

本次独立 architecture-reviewer 与 spec-reviewer 最终在所审范围均无阻断。初审的已知账／“全未知”冲突、词表／对象的过强排除以及两个来源版本残留已修；C-40 依据既有 RT8 S-54 纠正定义，不把 Upstream Send 改成登记过程。原“成功／失败记录产品来源归并”未裁项与 L1/L2 恢复交接继续保持。主线另将 Schema description 的旧概括与正文对齐，不改变验证谓词；该注释修订未声明独立复审。

[实际有限验证](../../evidence/2026-09-28-formal-model-recovery-timing/README.md)：10 个新 Schema 时序边界命中预期；RecoveryTiming 正配置无反例，4 负控分别命中指定断言。实际停止与权威前缀是有限模型前提，不是实际 I/O 证明；七份不变继承模型未在本轮重跑。冻结前 716 个既有规范资源必须逐字保持。

消费者不自动升级：core model-response 的纯判定与持久 Timing、runtime codec／恢复构造／S36、demo 与相关验证须沿明确提供者增补迁移；只升级相关精确引用。MP6、MS6、LC6、Directory5 与 runner5 不连锁升版，runner5 消费的 MR7 S-10/S-14/S-36 未变。运行旧格式兼容仍禁止，但精确依赖所需旧 Schema 继续按原字节使用。本决定只接受规范；提供者映射、真实 kill/reopen、已知／未知时刻、已知账保留、完整批竞争与零 HTTP、十三操作和37模型认证均须另行验收。
