# 宿主错误投影的精确补充采用

状态：诊断接口设计已采用，M05冻结及产品实现仍未完成。
负责人 panqiwei 的既有整改委托下，主会话于 2026-10-05T02:43:35.551403+00:00 采用本补充。
来源是[原接缝决定](decision.md)、其架构判断依据及 BASE
`cdd05d1050dc9d7857f7eb3569d834ae4291c4d5` 的 failure.ts/boot.ts。
精确输入见[diagnostics-inputs.json](diagnostics-inputs.json)。

QA实施前冻结指出：原协议定义了 HostPluginPolicyError 的安全code/角色，但没有说清它经boot包装后的观察位置。
本次在[宿主集成](../../../architecture/identity-integration/host-integration.md#公开失败与结构化诊断)补齐：
boot仍只拒绝HostStartupFailure；安全cause及结构化日志暴露封闭code/已知role/合法rowId。
政策与结构错误为manifest；invalid-config保持原plugin；StartError仅在apply-failed且同一行已有原异常时沿原分类。
stopped等首个原因不能被迟到异常覆盖；UsageError不暗示loader已接管资源。
原HostStartupFailure.cause的进程内观察能力保持，任意对象不展开进日志。
print静态准备复用同一映射及原failed/usage退出码。

初始消息使用“通用树错误全部manifest”的过宽措辞；独立Expression指出可能覆盖真实migration阶段。
逐类型表及优先级修正后，消息复核与最终SHA终核均无阻断。原问题保留于任务记录。
本次只明确已接受的安全诊断与原错误能力如何组合，没有扩大产品语义或修改QA断言。

前一次[inputs.json](inputs.json)及接受事件不改写。M06此前完成记录保留，QA发现缺口后重新打开，
本次只关闭诊断表达缺口。主会话须读回独立M05冻结后才实施，新API/日志输出仍待实际验收。
