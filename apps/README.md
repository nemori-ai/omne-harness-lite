# 产品应用

这里放可启动的产品应用及其装配入口。各应用在自己的成员目录维护 `package.json`、
`src/`、启动配置与测试，消费 [packages/](../packages/README.md) 中的公开能力；
可复用行为由所属包维护。应用目录不自动等于微服务，也不要求为每个接口创建独立应用。
完整归属规则见[源码布局](../docs/workspace.md)。

## 现状

| 应用 | 是什么 | 状态 |
| --- | --- | --- |
| [`tenancy-host`](tenancy-host/README.md) | 治理中心作为一个可部署应用：租户领域四个插件、存储与时钟、入口层与运维面装在一个进程里；迁移合成与升级守卫、两步开闸、逆序撤除；`keygen`／`serve` 两条子命令 | 当前SQLite装配范围与未实现/验证边界见[应用SPEC](tenancy-host/SPEC.md) |

[治理CLI](cli/README.md)已按D049建立文件输入增量；只装配CG2/CLS，尚无TUI或Agent据点，独立安装制品待验证。

正式会话产品由 [CLI](cli/README.md) 承载。已删除模型请求示例装配；原示例不再作为实现或验收入口。

## 历史

2026-09-20 与 packages/ 一同回退到骨架：此前的 `local-harness` 装配基线及其契约随旧设计链退役，
原件在 Git 历史（`git log --oneline -- apps/local-harness`）。
