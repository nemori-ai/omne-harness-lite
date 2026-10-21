# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员与 Cordis 无关，测试直接调用工厂，不装载 Cordis。事务端口、身份桥、证据桥、时钟、空闲输入、Context 输入与四个出站端口在测试里用替身，因为它们的真实实现归存储参加者、session-adapters 与邻域。替身要能给出 `changed`、`commit-unknown`、`unavailable` 与缺席，并能让时钟前进，才能覆盖重做、未知结局与恢复的场景。真实存储介质、真实邻域协调者与跨进程的组合不在本目录。测试通过不代替规格或验收。

## 维护

公开行为或 SPEC 条款变化时，同步对应测试与本目录 `index.md`。工厂进入根入口时，同一次修改要更新导出测试。`SchedulingPolicy` 的初值改变时，同步核对初值的测试。

## 本包事实

现在只有 [public-entry.spec.ts](public-entry.spec.ts)，它断言根入口没有导出。没有 `*.spec-d.ts` 类型测试。它只是骨架，不证明任何会话行为。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：SPEC 的[验证义务](../SPEC.md#vm-机制的持续验证义务)、[崩溃矩阵](../SPEC.md#cr-崩溃矩阵)与[故障场景](../verification/fault-scenarios.md)都还没有测试，随实现进入。具名维护者由负责人指定。
