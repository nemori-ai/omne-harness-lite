# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

`host-history-independence.spec.ts`（慢层）在真实 SQLite 仓上用 `tool-host-local` 的公开工厂种入 2000 次 Tools 调用（启动、来源、控制、环境与保留作用域、转发槽与收到的副本、经真实账本驱动到 `done` 的结果交付），核对新调用仍能启动，并用计数记录仓核对一次 Tools 调用在宿主路径上读到的记录数与字节数在 20 与 2000 次历史下逐项相等，保留作用域记录的大小两次相等，收场记录数等于已停止的保留进程数，读一条收场事实恰读一条记录；`start-guards` 的大小只报告。每调用的值在 `fixtures/host-paths.ts`。`ledger-asserts.spec.ts` 核对读集断言在 SQL 操作执行时评估：排队中的提交在被断言域移动后落地时冲突，两个连接之间也是如此。测试提供者按 `READ_OUTPUT_BYTES` 复现真实提供者的读出上限，所以整域读取超限时与生产一样被拒绝。

测试在 node:sqlite 测试提供者（`fixtures/sqlite-storage.ts`）上运行本包真实的 Worker 模块。提供者每个事务域一个数据库文件，回执与参加者的写入在同一个事务里提交，所以关闭再打开同一目录可以认回已提交的操作。`fixtures/faults.ts` 在提供者之上一次布置一个故障：受理前拒绝、答复丢失、提交未执行、提交后抛错、延迟落地、提交前中断与读不可用。账本、保管与启动协调器的其他端口用 `@omne-harness/tool/testing` 与 `@omne-harness/tool-contract/testing` 的内存替身。测试提供者不建模 Worker、队列、组提交与断电，通过不证明这些性质。

`material-store.spec.ts` 用上述 SQLite 组合验证公开材料仓接口。`material-store-live.spec.ts` 在真实 sqlite-provider Worker 上运行 5 MiB 场景；只有一次删除回包丢失由包装器注入，字节和围栏仍由真实提供者提交。该测试关闭再打开提供者，不模拟操作系统断电。

