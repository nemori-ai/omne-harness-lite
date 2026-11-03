# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 测试文件、测试辅助代码，以及 `fixtures/` 下的夹具与子进程脚本。

## 边界

全部行为用例在真实 `@omne-harness/sqlite-provider` 上运行，每个用例或每次 `create` 新建一个临时存储根目录。scrypt 用较小的 N（`tests/fixtures/scrypt.ts`），只有插件的端到端用例用 `SCRYPT_PROFILE`。故障注入只包装 `SqlStorage`，产品代码不认识夹具。负控把 `dist` 复制到包内 `tmp/mutants/`，改掉一项核对再运行套件，用完删除。用例经 `dist` 导入本成员，改源码后先构建。测试通过不代替规格或验收。

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
| `cordis-entry.spec.ts`         | 插件：非法配置、缺邀请时长、缺时钟 PENDING、三键、注入时钟与截止时刻、撤销、邀请时长、撤除 | 快加一条慢用例  |
| `governance-contract.spec.ts`  | AC-1：identity 治理契约套件，两组配置，接入故障与重启          | 慢：每个用例起新的存储与 Worker |
| `governance-negative.spec.ts`  | 负控：四项核对各去掉一项，对应用例变红；未改副本全部通过       | 慢：每项跑一遍套件              |
| `last-admin-concurrent.spec.ts` | AC-2：两位管理员互相移除或降级，50 次                         | 慢：50 个团队、100 次并发提交   |
| `governance-restart.spec.ts`   | AC-2：撤销跨进程保留；IS-09：从 001 升到 002                   | 慢：起子进程                    |
| `list-limit.spec.ts`           | IS-13：名单到上限时完整，超过时 `basis-unavailable`            | 慢：1001 份邀请                 |
| `governance-mapping.spec.ts`   | IS-10、IS-14：回滚、回复丢失、结果未知、空闲截止时刻不提前     | 快                              |
| `order-key.spec.ts`            | IS-10：排序键与 `compareInstants` 同序，SQL 与 JavaScript 一致 | 快                              |
| `combination-version.spec.ts`  | IS-01：改 `support` 的核对 SQL 改变组合版本；负控：版本只取清单时不变 | 快：复制 `dist`           |
| `governance-login-bounds.spec.ts` | IS-12：撤销已到期目标答 `no-change`、不写撤销行；IS-10、IS-11：读数早于签发时刻答 `basis-unavailable`；各有负控 | 慢：起存储与 Worker，重启两次 |

未覆盖：应用层贯通、公开协议到治理端口的映射、多进程并发、闰秒、时序侧信道。负责人是本成员的写者。
