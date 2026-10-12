# 准入提供者的管理边界

业务行为归 [定义拥有者](../../core/tool-admission/SPEC.md)。此页只约束管理装配绑定。

AL-1：managedToolAdmissionLocal 在资源创建前登记本行 ready/close。固定 host 拥有原准入根和日志借用，动态子 fiber 发布定义 Service。子发布撤除立即关闭该根的新判断与核验，等待原操作排空，不释放固定 host 的日志借用；实际根 close 仍由已登记行负责。撤除不停止其他固定消费者或已准入作者。

AL-2：host Ready 以原根创建及实际子发布初始化完成为依据。贡献依赖缺席由领域协议处理，不能从动态声明推断准入可用。最终 host 关闭等待原根和实际子发布完成，不用子 fiber 身份代替物理资源排空。

AL-3：inspectAdmissionPublication 只返回该实际 host 已持有的原发布 fiber，未知 host 同步拒绝。此观察口不创建提供者，不授予 token，不证明业务准入可用。独立撤除后仍返回原身份，不能悄悄换成固定 host 或后继实例。
