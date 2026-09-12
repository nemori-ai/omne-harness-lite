# 产品应用

本目录承载可启动的产品应用及其装配入口。各应用在自己的成员目录维护
`package.json`、`src/`、启动配置与测试，消费 [packages/](../packages/README.md)
中的公开能力；可复用行为由所属包维护。

应用目录不自动等于微服务，也不要求为每个接口创建独立应用。完整归属规则见
[workspace 规范](../docs/maintenance/workspace.md)。目前尚无可启动的产品应用，
待具体入口确定后再创建成员和构建配置。
