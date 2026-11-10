# harness-server 测试导航

本目录放 `@omne-harness/harness-server` 的持续测试。行为条款归 [SPEC.md](../SPEC.md)。测试使用合成清单与替身，不使用真实 SQL 提供者、真实身份或真实存储。

## 现有测试

| 文件                  | 层   | 覆盖                                                                             |
| --------------------- | ---- | -------------------------------------------------------------------------------- |
| `types.spec-d.ts`     | 类型 | 冻结类型 `src/types.ts` 的形状探针                                               |
| `plugin-tree.spec.ts` | fast | 边界 schema、两层层叠、运维操作、最终树打印                                      |
| `trust.spec.ts`       | fast | 可见性矩阵、机制探针（N-8）、子 fiber 消费（N-4）、会话工作主体（N-1、N-2）      |
| `readiness.spec.ts`   | fast | 就绪、缺项与阻塞链、fiber 状态映射                                               |
| `aa-rows.spec.ts`     | fast | 行快照与应用装配页的差分，输入在 `tests/fixtures/aa/`                            |
| `aa-source.spec.ts`   | fast | 受信名读法与签发调用点白名单（E1、E2），每个负控在临时迷你仓库里搭               |
| `stubs-sync.spec.ts`  | fast | 替身清单与行快照同步，受信名在行的可见集合内                                     |
| `shutdown.spec.ts`    | fast | 有序关闭的阶段次序、截止时间、幂等、报告闩锁、登记准入（N-7）、运行期换代（N-3） |
| `s0-process.spec.ts`  | slow | 启动 `dist/bin.js`，断言退出码与 JSON 输出，输入在 `tests/fixtures/process/`     |
| `e2e-identity/`       | slow | 租户身份 AC-9 端到端（K10）：真实 `serve` 进程两次与 `omne` CLI 走完步骤 1 至 13 |
| `local/`              | fast | 本机单用户档：位置规则（含 Linux XDG）、配置文件、运维者层默认值、`setup` 的次序与权限、`serve` 读取配置 |
| `local/setup-serve-process.spec.ts` | slow | `setup` 后 `serve` 不带参数就绪，CLI 不给地址也能注册，哨兵密钥不外泄；没有 `setup` 时的提示 |
| `history-cost/` | 脚本 | C8 历史成本：在发行树上逐次调用，按阶段统计 Tool、宿主与其他 SQL 语句、读写行数与逻辑字节，并记录每次调用的墙钟时间。用法见 `run.ts` 文件头，不由 vitest 运行 |

真实模式（`serve`）的用例、行用例与 R9 贯通用例（`tests/r9/`）列在 [real-mode.md](../docs/real-mode.md#真实模式的测试)。

## 运行

在成员目录运行：

```sh
pnpm run typecheck
pnpm run test:fast
pnpm run build
pnpm run test:slow
pnpm run check:aa-rows
```

慢层启动 `dist/bin.js`，所以要先运行 `pnpm run build`。`check:aa-rows` 比较行快照与应用装配页，并扫描源码：受信表里的名字只经 `env.readTrusted` 或受信表列为可见的行读取（E1），`issueActingForTenant(` 与 `issueSystem(` 只出现在 `scripts/aa-trust-config.json` 列出的文件（E2）。该文件的 `pending` 列出计划要进受信表、表里还没有的名字，这些名字的违规只报告不失败，进表后同样的规则才强制。

## 未覆盖

- 不适用：真实 SQL 提供者、真实身份、HTTP 和租户路径。S0 不接这些。
- 对 `ctx.reflect.store` 的反射遍历是已记录的非保证，不测试。
