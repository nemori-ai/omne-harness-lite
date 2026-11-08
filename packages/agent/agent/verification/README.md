# verification

<!-- documentation:placeholder -->

本目录承载本包的持续验证资源：模型、论证或证明。

## 允许的内容

<!-- documentation:placeholder -->

`models/` 下的形式模型，`proofs/` 下的论证或证明，以及说明文件。

## 边界

<!-- documentation:placeholder -->

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。单次运行的原始输出留任务 tmp，不进本目录。

## 维护

<!-- documentation:placeholder -->

被验证的承诺变化时，同步模型、证明与本目录 `index.md`。

## 本包事实

[原动作资格的局部安全性](proofs/action-qualification.md) 给出原位置、材料及精确 Tool 采用的判定条件，并区分只读观察与提交时核回。运行守护覆盖真实 Loop 与 Session SQL 组合，不授予完整权限链接受。

<!-- documentation:placeholder -->

[Model 结果接收模型](model-reception/README.md) 检查共同提交、原操作认回、账目发送时序和实例分离后的责任保留。它是有限安全性模型，不证明产品实现精化、生产耐久或 Model ACK。

[Run 驱动生命周期模型](run-lifecycle/README.md) 检查对外发起至多一次、步数上限、失败不静默、结果唤醒、准入不可用整批拒绝和每步提交有界。它的机读守卫在 `run-lifecycle/guards/`，由本包 vitest 配置收进 `test:fast`；loop 测试目录开放后迁到 `tests/`。它是有限模型，不证明产品实现符合模型。

[Run 取消与单调用中断模型](cancellation/README.md) 检查取消、单调用中断与模型请求、工具动作和结果接收之间的交错。它是有限模型，不证明产品实现符合模型，也不证明外部服务最终响应。

[执行槽预占模型](reservation/README.md) 检查本地同步预占报告与空闲回收的交错。运行守护使用真实 runtime 与 host，外部 report 失败及无限系统活性不在模型范围。

[节点失败收尾模型](failure-closure/README.md) 检查原写、故障保持、责任收场和旧结果隔离。有条件活性只覆盖已列出的有限责任与公平性前提。
[故障来源隔离](failure-provenance/README.md) 说明共享 Failure 的来源隔离性质、归纳前提、有限正负控和真实 coordinator 配对守护。
