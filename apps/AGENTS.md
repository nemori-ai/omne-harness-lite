# 应用装配的目标边界

本树尚无真实应用成员。[入口](README.md)列出装配角色。新增应用成员之前，先满足[建立与维护](README.md#建立与维护)。修改最小 CLI 的启动、命令解析或呈现之前，读[接入边界](../docs/package-organization.md#最小-cli-的接入边界)。

应用负责启动、配置、装配、就绪与退出；可复用行为回所属[能力组](../packages/README.md)，通过公开入口组合。应用与包、部署拓扑的边界归[系统架构](../docs/architecture/README.md)及[源码布局](../docs/workspace.md)。

旧应用从[legacy入口](../apps.0.0.1.legacy/README.md)查源，不把其名称或旧政策当作新架构约束。改变身份、授权、生命周期或故障语义时定位相应架构与契约拥有者；命令和配置留实际成员说明。
