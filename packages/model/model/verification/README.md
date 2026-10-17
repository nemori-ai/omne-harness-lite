# model 持续验证

PACKAGE_TEMPLATE_DRAFT

本目录维护本实现的验证责任。共同协议场景由 model-contract/verification 唯一维护，已有凭据判定的[可执行测试](../tests/judgment.spec.ts)，保管与插件的可执行测试在 [model-host-local](../../model-host-local/tests/credential.spec.ts)，尚无完整托管运行的可执行协议验证。安装与导入保证由 `install-closure` 脚本调用 [model-contract 的安装闭包设施](../../model-contract/tests/install/cli.ts)核对：策略在 [install-policy.json](../tests/fixtures/install-policy.json)，场景脚本在 [scenario.mjs](../tests/install/scenario.mjs)，场景只经消费目录里安装的包调用 `deliver` 与判定。本成员的这条命令已运行通过：`forbidden` 为空，全部检查含 `scenario-run` 通过，离线安装。该结论只覆盖 model 的生产安装闭包与场景里的三条发送路径及一次判定；model-host-local 的闭包、Cordis 装配与真实运行工厂不在其内。报告写在任务的 `tmp/`，不入库，重新核对时重跑命令。

[目录索引](index.md)。
