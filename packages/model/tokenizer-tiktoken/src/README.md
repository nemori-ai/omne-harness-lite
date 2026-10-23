# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出（仅绑定变体）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

本目录有五个源码文件：

- `index.ts`：根入口，导出 `createTiktokenTokenizer` 与两个资源类型。
- `resources.ts`：资源类型 `TiktokenRanks` 与 `TiktokenResources`。
- `tokenizer.ts`：初始化核对与 `count`。
- `digest.ts`：资源的规范 JSON 与 SHA-256 摘要。
- `engine-version.ts`：读取实际安装的 js-tiktoken 版本。

本包没有 `cordis.ts`，理由见 [docs/cordis.md](../docs/cordis.md)。
