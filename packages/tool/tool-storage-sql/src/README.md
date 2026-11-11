# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出（仅绑定变体）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

`ledger-wire.ts` 放记录仓共用的地址、写入与断言编码和 SQL 结果映射。 `ledger-keeper.ts` 是记录仓的快照保管者（TS-16）：决定是不读写存储的全函数，`Crossings` 判断读取途中有没有提交经过，`keeping` 把两者接到记录仓端口上。

`index.ts` 是根入口。`ledger-store.ts` 与 `body-store.ts` 是两个端口适配器，`tenant.ts` 解析租户的事务域并构造提交请求，`json.ts` 做严格 JSON 编码，`options.ts` 放选项，`materials.ts` 描述静态材料。`worker/` 是在 SQL 提供者的 Worker 内运行的模块：`participant.ts`（`tool` 参加者的账本写入与到期索引）、`participant-body.ts`（正文命令）、`migration.ts`、三个读 handler（`read-ledger.ts`、`read-body.ts`、`read-due.ts`），以及它们共用的 `schema.ts`、`facts.ts`、`support.ts`。Worker 模块只导入 `sql-contract` 的根与 `./worker` 入口。负责人是 tool-exec 线。

正文的期限、授权与回收时机归 Tool 账本，不在这些适配器内。
