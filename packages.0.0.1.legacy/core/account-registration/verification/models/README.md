# 注册与清除的分步模型

[Registration.tla](Registration.tla) 约束 [注册行为](../../SPEC.md) 的独立提交步骤及跨步不变量。

| 配置 | 输入与检查 |
| --- | --- |
| basic.cfg | 两 attempts；无故障／放弃／到期，核六个安全不变量及 OrganizationBeforeActivation |
| crash.cfg | 三 attempts；三种开关启用，核相同安全性质，包含清除交错与已提交而回执未达 |
| progress.cfg | 两 attempts；Failures／Abandoning=FALSE、Expiring=TRUE，核 TypeOK 与 EventualOutcome；Spec 公平性是前提 |

正配置均应无反例，不预填运行结果。ActivatedHasPersonalOrganization、OnePersonalOrganizationPerAccount、NoOrphanPersonalOrganization 禁止补偿式“修好”后掩盖中间非法状态。unknown 回执不是无效果，模型保留已提交的持久状态。

模型不证明依据不可伪造、多账号绑定、真 SQL 约束、外层错误映射、close／排空或入口授权。真实提交后丢回执须独立注入，提交前失败不能代替。progress 不覆盖 produce 碰到已过期占用后的即时一次 retry，不证明真实故障必恢复或秒数上界。

从本目录用 TLC、单 worker、配对 cfg 与工作树 tmp metadir 执行；输出不入 Git。
