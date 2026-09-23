# 产品应用

这里放可启动的产品应用及其装配入口。各应用在自己的成员目录维护 `package.json`、
`src/`、启动配置与测试，消费 [packages/](../packages/README.md) 中的公开能力；
可复用行为由所属包维护。应用目录不自动等于微服务，也不要求为每个接口创建独立应用。
完整归属规则见[源码布局](../docs/workspace.md)。

## 现状

| 应用 | 是什么 | 状态 |
| --- | --- | --- |
| [`tenancy-host`](tenancy-host/README.md) | 治理中心作为一个可部署应用：租户领域四个插件、存储与时钟、入口层与运维面装在一个进程里；迁移合成与升级守卫、两步开闸、逆序撤除；`keygen`／`serve` 两条子命令 | 已建包（阶段 2 波次 3）；sqlite 上装配级测试通过，pg 首跑见其 README「验证」与节点 verification。设计：[realization/apps/tenancy-host](../.meta_harness/design/realization/apps/tenancy-host/README.md) |

客户端一侧（`apps/cli` 的据点进程与客户端代理）尚未建包。

## 历史

2026-09-20 与 packages/ 一同回退到骨架：此前的 `local-harness` 装配基线及其契约随旧设计链退役，
原件在 Git 历史（`git log --oneline -- apps/local-harness`）。
