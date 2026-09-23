# 产品应用

**当前没有可启动的应用。**

这里放可启动的产品应用及其装配入口。各应用在自己的成员目录维护 `package.json`、
`src/`、启动配置与测试，消费 [packages/](../packages/README.md) 中的公开能力；
可复用行为由所属包维护。应用目录不自动等于微服务，也不要求为每个接口创建独立应用。
完整归属规则见[源码布局](../docs/workspace.md)。

## 现状

租户领域的装配节点 `apps/tenancy-host`（名字已拍板，D-027）已在
[realization/apps](../.meta_harness/design/realization/README.md) 起草：它只写了存储（含迁移与真实外键）、
时钟与密钥三半，入口层身份核实等客户端与据点进程之间的契约起草后再补。
装配是**最后一层**：包已就位（`core/`、`infra/`）但四个 tenancy 插件的实现在第二程，
所以这里暂不建目录——建了也起不来。

## 历史

2026-09-20 与 packages/ 一同回退到骨架：此前的 `local-harness` 装配基线及其契约随旧设计链退役，
原件在 Git 历史（`git log --oneline -- apps/local-harness`）。
