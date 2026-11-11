# src

本目录承载本包的公开定义与实现。[index.ts](index.ts) 是根入口，[cordis.ts](cordis.ts) 是 Cordis 绑定入口，[send-resources.ts](send-resources.ts) 与 [assembly.ts](assembly.ts) 是根入口导出的发送资源与本地装配，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口及它到达的 [credential-port.ts](credential-port.ts) 不导入 `@deepseek-ai/cordis`、model-cordis-contract、settings-local 或 cordis.ts。send-resources.ts 与 assembly.ts 不导入 Cordis、credential-port.ts 或任何 `testing` 模块，也不写路由地址、代理或限额的默认值。选层与判读规则不在本目录，来自 model-contract。非类型行为写在包根 [SPEC.md](../SPEC.md)。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、[公开接口](../docs/public-api.md)与本目录 `index.md`。

## 本包事实

本目录已实现设置域秘密保管之上的 Model 凭据端口与凭据服务、生产发送资源与本地 Model 装配。秘密保管的文件实现在 settings-local 的 `src/secrets/`。其他宿主能力没有实现。
