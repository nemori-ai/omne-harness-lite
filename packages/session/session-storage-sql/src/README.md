# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出（仅绑定变体）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

根入口 [index.ts](../src/index.ts) 导出 `createSessionStorage`、`createSessionStoragePair`、`createSessionPrincipalBindings`、`sessionStorageMaterials`、`SESSION_PARTICIPANT` 与四个类型。没有 `cordis.ts`，会话存储组合由应用承担（[装配边界](../docs/cordis.md)）。

| 文件 | 内容 |
| --- | --- |
| `index.ts` | 端口工厂、端口对工厂与读口的导出 |
| `port.ts` | 一个上下文上的端口面。公开端口与委派视图共用它 |
| `entries.ts` | `commitEntries` 的端口侧：不问访问检查，编码参加者事实，经 `commit.ts` 的尝试代次提交 |
| `delegated.ts` | 委派入口：视图以绑定作为取访问的一步，不调用访问检查；绑定外的调用与 `commitEntries` 答 `denied` |
| `bindings.ts` | 会话归属读口：按租户与会话读权威状态行，不调用访问检查 |
| `commit.ts` | 写路径：尝试代次 `commitFacts`、`commit`、`queryOperation`、`queryControlOperation` |
| `reads.ts` | 读路径：核权、事务域、handler 调用、历史与 epoch 视图读、`pending`、系统读 |
| `context.ts` | 选项、唯一的取访问点 `qualify` 与上下文里可替换的取访问步骤、事务域解析、`snapshot` 读的封装 |
| `cursor.ts` | 签名游标的签发与验证 |
| `codec.ts` | 值的 JSON 形式与租户、工作区身份的互转 |
| `materials.ts` | 参加者、迁移与八个读 handler 的静态材料及文件摘要 |
| `worker/` | Worker 内模块：`participant.ts`、`entries.ts`（`commitEntries` 的判定）、`migration.ts`、`schema.ts`、`support.ts` 与 `read-*.ts` 八个 handler |

`worker/` 下的模块在提供者的 Worker 里运行，不导入端口侧的文件。设计目标里的重建与 PostgreSQL 方言没有进入。`package.json` 的依赖见[公开接口导航](../docs/public-api.md)与[内部架构](../docs/architecture.md#模块与依赖)。
