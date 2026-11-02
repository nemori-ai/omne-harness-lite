# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 测试文件、测试辅助代码，以及 `fixtures/` 下的夹具与子进程脚本。

## 边界

全部行为用例在真实 `@omne-harness/sqlite-provider` 上运行，每个用例或每次 `create` 新建一个临时存储根目录。scrypt 用较小的 N（`tests/fixtures/scrypt.ts`），只有插件的端到端用例用 `SCRYPT_PROFILE`。故障注入只包装 `SqlStorage`，产品代码不认识夹具。用例经 `dist` 导入本成员，改源码后先构建。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。新增慢用例时在文件开头写 `@module-tag slow` 或给用例加 `tags: ['slow']`，并写明慢的原因。

## 本包事实

| 文件                           | 义务                                                           | 层                              |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------- |
| `operations-contract.spec.ts`  | R4-1：identity 契约套件，两组配置                              | 慢：每个用例起新的存储与 Worker |
| `restart.spec.ts`              | R4-2：两个子进程共用一个存储根                                 | 慢：起子进程                    |
| `credential-storage.spec.ts`   | R4-3：数据库文件与输出里没有凭据与凭证                         | 快                              |
| `register-transaction.spec.ts` | R4-4：单事务回滚、结果未知、输入上界                           | 快                              |
| `standing.spec.ts`             | R4-5：读口不区分未知租户与非成员                               | 快                              |
| `stopped.spec.ts`              | SPEC IS-07：停止后的答复与在途调用                             | 快                              |
| `scrypt-mapping.spec.ts`       | SPEC IS-04：scrypt 拒绝的映射与假材料                          | 快                              |
| `public-entry.spec.ts`         | 两个入口的导出、材料、组合与配置校验                           | 快                              |
| `cordis-entry.spec.ts`         | 插件：非法配置、缺时钟 PENDING、两键、注入时钟与截止时刻、撤除 | 快加一条慢用例                  |

未覆盖：应用层贯通、多进程并发、闰秒、时序侧信道。负责人是本成员的写者。
