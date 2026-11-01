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
| `stubs-sync.spec.ts`  | fast | 替身清单与行快照同步，受信名在行的可见集合内                                     |
| `shutdown.spec.ts`    | fast | 有序关闭的阶段次序、截止时间、幂等、报告闩锁、登记准入（N-7）、运行期换代（N-3） |
| `s0-process.spec.ts`  | slow | 启动 `dist/bin.js`，断言退出码与 JSON 输出，输入在 `tests/fixtures/process/`     |

## 运行

在成员目录运行：

```sh
pnpm run typecheck
pnpm run test:fast
pnpm run build
pnpm run test:slow
pnpm run check:aa-rows
```

慢层启动 `dist/bin.js`，所以要先运行 `pnpm run build`。`check:aa-rows` 比较行快照与应用装配页。

## 未覆盖

- 不适用：真实 SQL 提供者、真实身份、HTTP 和租户路径。S0 不接这些。
- 对 `ctx.reflect.store` 的反射遍历是已记录的非保证，不测试。
