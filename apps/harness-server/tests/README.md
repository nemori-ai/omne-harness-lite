# harness-server 测试导航

本目录放 `@omne-harness/harness-server` 的持续测试。行为条款归 [SPEC.md](../SPEC.md)。测试使用合成清单与替身，不使用真实 SQL 提供者、真实身份或真实存储。

## 现有测试

| 文件 | 层 | 覆盖 |
| --- | --- | --- |
| `types.spec-d.ts` | 类型 | 冻结类型 `src/types.ts` 的形状探针 |

## 计划测试

下列文件由 S0 其他子闭包写入。合回之前它们不存在，本表不表示它们已经通过。

| 文件 | 层 | 覆盖 |
| --- | --- | --- |
| `plugin-tree.spec.ts` | fast | 边界 schema、两层层叠、运维操作、最终树打印 |
| `trust.spec.ts`、`readiness.spec.ts` | fast | 可见性矩阵、就绪、缺项与阻塞链 |
| `aa-rows.spec.ts`、`stubs-sync.spec.ts` | fast | 行快照与应用装配页的差分 |
| `shutdown.spec.ts` | fast | 有序关闭的阶段次序、截止时间、幂等和报告闩锁 |
| `s0-process.spec.ts` | slow | 启动 `dist/bin.js`，断言退出码与 JSON 输出 |

## 运行

在成员目录运行：

```sh
pnpm exec vitest run --mode fast
pnpm run typecheck
```

慢层用 `--mode slow`，它需要先运行 `pnpm run build`。

## 未覆盖

- 不适用：真实 SQL 提供者、真实身份、HTTP 和租户路径。S0 不接这些。
- 对 `ctx.reflect.store` 的反射遍历是已记录的非保证，不测试。
