# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员与 Cordis 无关，测试直接调用工厂，不装载 Cordis。身份桥、证据桥、时钟、空闲输入、Context 输入、会话工作主体与出站端口在测试里用 session-contract 与 session-cordis-contract 的 `./testing` 替身，因为它们的真实实现归 session-adapters、应用装配与邻域。替身要能给出 `changed`、`commit-unknown`、`unavailable` 与缺席，并能让时钟前进，才能覆盖重做、未知结局与恢复的场景。存储有两种：session-contract 的内存替身对，以及 session-storage-sql 在真实 sqlite-provider 上的提供者对（慢层）。真实邻域协调者与跨进程的组合不在本目录。测试通过不代替规格或验收。

## 维护

公开行为或 SPEC 条款变化时，同步对应测试与本目录 `index.md`。工厂进入根入口时，同一次修改要更新导出测试。`SchedulingPolicy` 的初值改变时，同步核对初值的测试。

## 本包事实

| 文件 | 层 | 覆盖 |
| --- | --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 快 | 根入口的运行时导出（经 `dist`，先构建） |
| [conformance.spec.ts](conformance.spec.ts) | 快 | session-contract 的事务套件经四个面运行，内存替身对 |
| [conformance-sql.spec.ts](conformance-sql.spec.ts) | 慢 | 同一套件与计次、跨租户，真实 sqlite-provider 上的 SQL 提供者对 |
| [access.spec.ts](access.spec.ts) | 快 | 每次面操作一次 `check`、`changed` 重做不追加；CP-01 第 1 步的失败分支；调用方类；另一租户 |
| [pipeline.spec.ts](pipeline.spec.ts) | 快 | CP-01 的认回、事务外拒绝、材料拥有者、`changed` 上限、未知结局、通知与关闭 |
| [construction.spec.ts](construction.spec.ts) | 快 | 启动条件与 `SchedulingPolicy` 的逐字段核对 |
| [advance.spec.ts](advance.spec.ts) | 快 | S1、C2 的开 Run 顺序、会话槽引用的两组样例、S4、S3 |
| [complexity.spec.ts](complexity.spec.ts) | 快 | SS-02：两个历史规模下各面操作的确定性计数相同，并有一个负控 |

没有 `*.spec-d.ts` 类型测试。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：SPEC 中未实现的机制没有测试，[崩溃矩阵](../SPEC.md#cr-崩溃矩阵)与[故障场景](../docs/fault-scenarios.md)也没有运行器。覆盖范围见 SPEC 的[已有测试](../SPEC.md#已有测试)。具名维护者由负责人指定。
