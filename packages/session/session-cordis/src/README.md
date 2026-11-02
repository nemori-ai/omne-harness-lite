# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出（仅绑定变体）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

`index.ts` 为空。`cordis.ts` 导出 `SessionProvider` 与类型 `SessionProviderConfig`，实现分在同目录的几个文件里，见 [index.md](index.md)。

本成员是 `service-provider` 变体。`index.ts` 保持为空：不装配 Cordis 的宿主从 session 取工厂，本成员不转导出它。`cordis.ts` 导出 `SessionService` 的具体子类（即插件），它的静态 `Config` 在 `config.ts`。子类 `extends` 服务定义成员的抽象类，不写服务键。源码只导入 session-contract、session-cordis-contract、session、legal-identity、operation-result 与 `@deepseek-ai/cordis`，不导入任何邻域契约或存储后端（[SPEC 性质 11](../SPEC.md#撤除与换代)）。

当前缺口：受理槽与来源变化通知还没有服务键，租户枚举没有通道（[SPEC 的明确缺项](../SPEC.md#明确缺项)）。装配生命周期用装配入口的私有键，见 [SPEC 的实现现状](../SPEC.md#实现现状)。具名维护者由负责人指定。
