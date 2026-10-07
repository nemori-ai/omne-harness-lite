# 按会话装插件：试点续接入口

2026-10-06，本候选试点已接续到[Session／Agent Runtime第一期系统设计](../session-agent-runtime-phase1/README.md)。本文件只保留导航，不维护第二份会话作用域或生命周期承诺。

完整候选、责任与原执行连续性见[装配正文](../session-agent-runtime-phase1/cordis.md)；三个实质机制候选与取舍见仓库坐标`packages/core/session-runtime/adr/durable-coordination.md`（A1）、`packages/session/session-runtime-local/adr/session-context.md`（B2）与`packages/core/model-message-projection/adr/prefix-cache.md`（C2），这些设计准备槽尚非workspace成员；模型／探针限制及真实组合义务见[验证正文](../session-agent-runtime-phase1/verification.md)。

新机制仍未正式接受，产品包尚未建立，IC-17尚未在真实Session组合中验收。原试点不能作为实施采用依据；历史文本可按Git修订读取。本次没有将runtime卸载等同归档，也没有将原语探针提升为整体证明。
