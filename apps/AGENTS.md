# 应用装配的边界

这里关注产品如何组装和启动。入口索引见 [README](README.md)，应用与包的分工归
[源码布局](../docs/maintenance/workspace.md)。

应用拥有启动入口、配置接入和装配；可复用能力回到 [packages/](../packages/README.md)
的所属包，通过公开入口组合。应用目录的出现不自动决定进程或微服务拓扑。

当前装配设计随应用维护，按[设计归属](../docs/maintenance/organization.md#当前实现设计的归属)
引用提供包，说明实际选择、就绪和退出责任；计划不另立一份长期装配权威。

调整已有装配时沿成员的契约和验证完成；若需要绕开包边界，或改变身份传递、
授权、生命周期或失败语义，先通过
[architecture-design](../.agents/skills/architecture-design/SKILL.md) 核对权威设计。
启动参数与构建命令放在应用自己的说明或脚本中，不扩充常驻提示。
