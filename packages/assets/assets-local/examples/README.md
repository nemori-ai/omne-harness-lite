# 资产与设置手动验收

这个终端示例调用真实的 Identity SQL、SQLite Worker、资产本地拥有者和 Settings 应用服务。它复用测试目录中的装配辅助函数来创建隔离的示例账号、租户、类别与数据库。辅助函数不替代本例的资格、持有或配置提供者。它不是最终产品 UI，也不连接用户真实账号。

在仓库根执行以下命令。Node 版本遵循仓库 package.json。

```sh
pnpm --filter @omne-harness/assets-local... -r build
node --conditions=source --experimental-strip-types packages/assets/assets-local/examples/settings-governance.ts
```

示例输出逐步 JSON，每次在任务 tmp 下创建独立数据库。第一行给出数据库路径。保留该目录便于检查，不会自动删除已有数据。

1. 查看 `one-catalog-two-targets`。同一个目录包含独立功能和资产配置，并带可读标题、说明及默认值。
2. 查看 `save` 与 `same-operation-replay`。原操作重复调用返回同一结果，不再次增加修订。
3. 查看 `new-definition-needs-decision`。拥有者发布新版后，旧配置不能直接作为当前有效结果采用。
4. 查看 `explicit-maintenance-adoption` 与 `effective-value-after-upgrade`。部署维护者明确保留或丢弃旧值后，新定义恢复可求值状态。
5. 查看 `real-membership-revocation`。真实成员撤权完成后，读取返回 `forbidden`。

修改同目录 `settings-governance.json` 的 `enabled`，再运行命令。将 `enabled` 改为 `false`，并分别设置 `retainOnUpgrade` 为 `true` 和 `false`。保留时有效值应为 `false`，丢弃时应恢复新版默认值 `true`。也可以把自有输入路径作为命令的第一个参数。非法输入在创建数据库之前失败。

`explicit-maintenance-adoption` 使用受信部署能力。普通用户与 agent 工具不能直接持有这项能力。保存成功、重新采用成功与具体业务执行采用是三个事实，本例不启动 Session、Job 或 Calendar 消费者。脚本断言通过是可复跑作者证据，不能代替用户亲手验收。
