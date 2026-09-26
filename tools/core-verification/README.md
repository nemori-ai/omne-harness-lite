# Core 开发验证

本开发成员承接核心包的真实组合验证，产品包通过公开构建入口消费。依赖全部是开发依赖，
不会令 core 产品包反向依赖 infra。

当前交付仅包含存储一致性套件有效性自测，依据
[storage 实现设计 P-10／C-11／C-12](../../.meta_harness/design/realization/packages/core/storage/design.md#要求到协议再到会红的测试)
与 [验证义务及覆盖缺口](../../.meta_harness/design/realization/packages/core/storage/verification.md#覆盖缺口)。
P／C 编号是该节点的协议与用例编号，没有独立契约坐标。

从仓库根准备锁定环境并运行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @omne-harness-lite/core-verification... run build
pnpm --filter @omne-harness-lite/core-verification run typecheck
pnpm --filter @omne-harness-lite/core-verification run test
```

两条稳定用例：

| Test ID | 实际判据 |
|---|---|
| `storage.conformance.real-sqlite` | 未改动的公开 `openStorage` 在临时文件 SQLite／WAL 上运行完整套件，19 条全部通过，零跳过 |
| `storage.conformance.detects-disabled-foreign-keys` | 测试侧复用公开 `SqlStorage` 和 `NodeSqliteDriver`，仅在写连接取得后、事务开始前关闭并读回确认 `foreign_keys`；同一完整套件中恰 C-11／C-12 因期望 `ReferenceViolation` 而收到 `undefined` 失败，其余 17 条通过 |

子进程退出码、信号、超时、机器报告与目标断言分别检查；启动错误、缺依赖、没有测试、
任意其它错误、跳过或超时不能满足预期失败。错误提供者只是开发侧包装，不是另一套
产品行为或内存替身；SQLite 的写事务、错误映射、读快照和句柄关闭仍由真实公开实现承担。

每次执行在根 `tmp/core-verification/` 创建唯一目录，保存子进程原始 stdout／stderr、
JSON 报告、执行参数和外键注入观察。父测试拥有子进程及私有数据库目录：结束后删除
自己的临时数据库，保留原始证据；超时停止该次进程组。HUB 验收应保存这些唯一证据再退休工作树。

本成员没有 PostgreSQL、跨进程持久、租户装配外键或断电保证的验收覆盖，也不声称覆盖
所有可能错误。后续两条 core 组合线在实际公开接口可用后接入，不预先以 fixture 补造行为。
