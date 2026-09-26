# SQLite FULL 档位验证 · 2026-09-24

采用范围为 [D-039](../../decisions/governance-sqlite-full/decision.md)。未提交源码由 [source-manifest](source-manifest.json) 定位；Node 24.21.0、macOS arm64，Vitest 4.1.11。

| 运行 | 结果 |
|---|---|
| storage-sql 全包测试 | 95 通过、4 个 PostgreSQL 测试因未配置数据库而跳过；含默认/NORMAL/FULL 实际读写句柄、重开、4 个读连接、迁移参数、非法配置、FULL 与 NORMAL 双份符合性及既有升级/故障测试 |
| tenancy-host lifecycle + upgrade | 38/38 通过；实际清单显式 FULL，既有启动/开闸/升级守卫回归 |
| 首次黑盒 e2e | 45/46；暂停前网卡地址已不在当前主机，来源地址测试 EADDRNOTAVAIL |
| 仅来源用例重跑 | 失败：旅程依赖前序注册/登录，过滤运行没有 ada1 夹具；未作产品失败结论 |
| 当前接口地址完整 e2e | 46/46；所有断言保留，只把测试允许的 alternate source 设为当前已配置非回环 IPv4 |

原始 JSON/log 全部保留，没有用最后成功覆盖失败。`e2e-current-source.json` 为最终完整运行；源码/测试未因环境失败而改弱。构建 storage-sql/tenancy-host、两成员 typecheck、20 条源码规则通过；docs/design 检查通过，已有正式形式任务仅核登记未执行。

复现：Node24 下运行 `pnpm --filter @omne-harness-lite/storage-sql test`；构建后 `TMPDIR=/tmp pnpm --filter @omne-harness-lite/tenancy-host test tests/lifecycle.spec.ts tests/upgrade.spec.ts`；黑盒另跑 `tests/e2e/e2e.spec.ts`，macOS 必须给 `OMNE_TEST_ALTERNATE_SOURCE_ADDRESS` 一个当前已分配且能连接回环监听的不同 IPv4。私钥来自既有测试夹具/临时部署，本证据不新增私钥副本。

本轮只在 macOS 跑 FULL 增量；未连接 PostgreSQL，未做 Linux FULL 回归、性能负载或物理断电。SIGKILL/重启不等于 OS/设备断电；FULL 的硬件前提归 D-039。同机备份不提供整机灾备保证。认证期限、CLI/TUI 与安全恢复仍未完成。
