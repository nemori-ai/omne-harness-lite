# 新增一个协议与接入插件要改的登记

什么时候读：新建了 `<名>-protocol` 与 `<名>-access` 两个成员，要把它们装进服务端应用。给已有协议加操作不用读这一页。

路径都从执行仓库的根算起。行的标识下面写成 `<行>`，通常就是 `<名>-access`。

## 成员的登记

| 文件 | 加什么 | 不加会怎样 |
| --- | --- | --- |
| `docs/architecture/constraints.json` | 两个成员各一个条目：`id`、`paths`、`layer`、`domains`、`status`、`source`（指到包组的 `SPEC.md`）。照同类的现有条目写 | `lint:rules` 报成员没登记 |
| `docs/engineering/delivery-lines.json` | 协议契约进一条线的 `contracts` | 协议契约不算契约成员，没有 API 快照，破坏性改动不被拦 |
| `<协议成员>/api/<名>.api.md` | `pnpm exec omne-contract-api --write` 生成，只该多出这一份 | `contract-check` 变红 |
| `pnpm-lock.yaml` | 从分支现有的锁文件出发 `pnpm install --lockfile-only`，改完核相对起点没有删除 | 安装与准入失败 |
| 包组的 `SPEC.md` | 协议与接入插件各一小节；新的不变式接着现有编号往下编 | 规格与实现对不上 |

## 服务端应用的登记

| 文件 | 加什么 |
| --- | --- |
| `apps/harness-server/package.json` | 依赖里加接入插件成员 |
| `apps/harness-server/src/rows/<行>/index.ts` | 新的一行（`defineRow`） |
| `apps/harness-server/src/cordis.ts` | 导出这一行 |
| `apps/harness-server/config/serve.distribution.json` | 发行树加一行：`id`、`plugin`、`config` |
| `apps/harness-server/config/s0.distribution.json` | 替身发行树加一行，`plugin` 是替身插件 |
| `apps/harness-server/src/s0/stubs.ts` | 替身表加这一行与它注入的名字 |
| `apps/harness-server/src/s0/aa-rows.json` | 行清单加这一行；受信名表加它看得见的受信名 |
| `docs/architecture/runtime/application-assembly.md` | 行表加一行；依赖图加它的边；受信名表加一行。`check:aa-rows` 拿这份文档和上一份 JSON 比 |
| `apps/harness-server/tests/serve.spec.ts` | 行清单加 `<行>:real`；启动摘要里的行数与真实实现数各加一 |
| `apps/harness-server/tests/rows/<行>/` | 行的声明与配置的快层用例；起真实发行树走新地址的慢层用例 |
| 别处写死行数的用例 | 在 `apps/harness-server/tests` 里搜 `'s0-double'` 与现在的行数，命中的都加一。现有的有 `tests/serve-process.spec.ts`、`tests/r9/arrival.spec.ts`、`tests/r9/flow.ts` |
| `apps/harness-server/tests/rows/server-entry/access.spec.ts` | 慢层那条「发行答出的可用性快照」里的协议清单加上新协议 |

最后两行的用例多在慢层，成员的快层与 `check:aa-rows` 都查不出它们。改完点名跑一遍，不等准入来报。

两个人同时各加一行时，上面这些文件都会在同一处冲突。合并时两边都留，行数按加起来的写。

## 协议要新的授权行时

操作用到领域里一个以前没有对登录开放的读或写，授权表要加一行：`apps/harness-server/src/rows/authorization/` 下领域的策略文件，以及策略的两份用例里的行数与允许的格数。加之前先确认这个读或写该不该对登录开放，依据写在那一行的出处里。

## 改完跑什么

在 `apps/harness-server` 下：`pnpm run typecheck`、`pnpm run check:aa-rows`、点名跑 `tests/serve.spec.ts` 与 `tests/rows/<行>/`。在根下：`pnpm exec omne-contract-api --check`、`pnpm run lint:rules`、`pnpm run lint:deps`、`pnpm run check:docs`。
