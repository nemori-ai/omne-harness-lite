# 注册公共承诺

本包拥有 RegistrationService、四种终结值、清除失败三分类及 RegistrationStopped。
根入口是纯定义；`./cordis` 拥有 Registration 和唯一 registration 服务键。
签名和分步编排归具体提供者。

本批迁入集成边界，业务继续沿已接受 AR2。精确来源及条款保留见
[身份迁移清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
主链的产生账号、建立个人组织、激活是三次独立提交，不能合成一笔事务。
每代捕获 accounts、organizations、organizationPurge；不得把新依赖换入旧调用。
停止后不进入下一步。已交出的步骤等待真实完成，不伪造回滚、补偿或成功。
注册停止返回 interrupted；清除链以 RegistrationStopped 拒绝，不新增正常失败值。

纯实例的 close 关闭自身资格并排空在途操作，独立调用与绑定使用同一关闭过程。
显式 isActive 与实例存活位共同决定资格；管理绑定同时检查装配代际和原 fiber 资格。
不能等入口排空结束、轮到 close 时才禁止续步。借入依赖在真实完成后才能释放。
本次不增加后台清扫调度器。

验证继续覆盖原步骤/重试/清除映射、各步停止及迟到结果、真实三次提交和崩溃恢复模型。
集成采用见[行为设计](../../../.meta_harness/design/architecture/identity-integration/behavior.md)。
