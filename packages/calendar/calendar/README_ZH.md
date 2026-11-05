# @omne-harness/calendar

本成员提供无 Cordis 的 Calendar A1 实现，含五个纯日期函数、三历解析校验、查询与供应应用以及总工厂。版本仍为 `0.0.0`、private。Schedule 管理与预测已有本域实现，Job 执行仍为目标行为。真实跨域装配须由具名提供者给出证据。

公开协议由 [calendar-contract](../calendar-contract/README.md)拥有，服务定义由 [calendar-cordis-contract](../calendar-cordis-contract/README.md)拥有。SQL、来源获取、种子和运行器归 [calendar-local](../calendar-local/README.md)，工具贡献归 [calendar-tools](../calendar-tools/README.md)。

## 使用与消费边界

从[根入口](src/index.ts)使用 classifyDay、countWorkingDays、shiftWorkingDays、listWorkingDays、selectNthWorkingDay。输入是通过公开 schema 校验的不可变 snapshot，结果保留失败判别与 CalculationBasis，不需要网络、存储或 Cordis。

createCalendarQueries 接受本机 repository、authority、environment、clock 和 catalog。createCalendarSupplyApplication 接受本域存储、来源、政策与资格端口。createCalendarApplication 的依赖分为 repository、persistence、queries、supply，返回查询和供应应用。精确依赖以根入口导出的源码定义为准，参见[公开 API 说明](docs/public-api-design.md#应用工厂与供应数据约束)。工厂配置不是服务 DTO。

## 契约与内部设计

[SPEC](SPEC.md)拥有必要行为与持续验证义务。[内部设计](docs/internals.md)解释版本、供应、恢复和实际存储限制。[关键流程](docs/key-flows.md)说明交接、失败和关闭。[组入口](../README.md)导航相邻拥有者。

## 配置、运行与验证

Node >=24，ESM。纯计算无需配置。查询需要可信资格与同 revision 的有效环境，供应需要合法系统 scope、材料保管和发布端口。外域权限、设置、通知与 Tool 宿主的真实采用尚未完成；夹具符合性不等于系统接入。SQL L-1/L-4、断电耐久和目标运行环境证据继续按提供者契约核对。

在工作区使用 `pnpm --filter @omne-harness/calendar build`、`pnpm --filter @omne-harness/calendar typecheck`、`pnpm --filter @omne-harness/calendar test`。持续用例位于 `tests/public-entry.spec.ts`、`tests/queries/`、`tests/supply/`、`tests/supply-application/` 和 `tests/workload.spec.ts`。这些命令是复跑入口，本页不记录单次通过数量。单次独立验收结论记录在交付报告中。

## 维护

同步行为、公开定义、流程及双语入口。公开类型/schema 是形状唯一源。保留不可变历史、原操作和 unknown，不把本域通过扩展成系统接受。全部源义务见[完整映射](../../schedule/schedule/SPEC.md#来源与目标验收映射)。

函数语义与证明义务见[函数契约](docs/functions-and-totalization.md)。按 [verification](verification/README.md) 准备工具后执行 `pnpm --filter @omne-harness/calendar verify:formal`。这是显式成员守护入口，尚未接入根 check；有限模型通过不代表生产实现精化已获证明。
