# src

本目录承载本包的公开定义和目录服务。[index.ts](index.ts) 是根入口，[cordis.ts](cordis.ts) 是 `./cordis` 入口。本文件与 [index.md](index.md) 是文档导航，不替代行为规格。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口 `.` 只导出类型，`./cordis` 导出 Cordis 定义。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不含值，也没有到 Cordis 的边：构建后的 `index.js` 没有任何导入，`index.d.ts` 也不引用 `@deepseek-ai/cordis`。要用 Cordis `Context` 的类型，包括 `AgentPublicationAuthority`，都在 `cordis.ts`。Cordis 值、服务类、键常量、`Context` 与 `Events` 增补和目录插件只从 `cordis.ts` 导出。源码不导入 `agent` 与 `agent-host-local`。非类型行为的规则在 [Cordis 页](../docs/cordis.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开入口，要同步 `package.json` 的 `exports`、[docs/public-api.md](../docs/public-api.md) 和本目录的 [index.md](index.md)。新增 Agent 接缝时，先在 Cordis 页的服务键表登记键和类，再在 `cordis.ts` 加类、键常量和 `Context` 增补。服务类的方法写成 `abstract readonly <操作>: <端口>['<操作>']`，不复制签名。

## 本包事实

[index.ts](index.ts) 导出三个类型：`AgentLocalRoute`、`AgentRegistrationInput`、`AgentWithdrawalInput`。

[cordis.ts](cordis.ts) 导出：

- 接口 `AgentPublicationAuthority`（宿主的同步核验，`check` 收调用方的 Cordis `Context`）和上面三个类型的再导出。
- 17 个抽象 Service 和对应的 17 个键常量。每个类在 `static readonly provide` 写键一次，键常量取自它。`AgentInstanceHostService` 另有进程内的 `route`。
- 具体的 `AgentInstancesService` 和键常量 `agentInstancesKey`。它是实例目录：`register`、`withdraw`、`resolve`、`connect`。状态放在构造函数的闭包里，不挂在实例属性上，因为任何能读 `ctx.agentInstances` 的插件都能读到实例属性。`register` 与 `withdraw` 是普通函数，使 Cordis 把 `this.ctx` 绑到调用方，登记随调用方 fiber 撤除。
- 目录插件 `agentInstancesPlugin`：静态 `inject` 为 `agentPublicationAuthority` 与 `agentAccessCheck`，`Config` 是拒绝未知键的空对象。
- `Context` 增补 18 个键，`Events` 增补 `agent-cordis-contract/instance-retired`。

已知的取舍：目录保留已结束的登记记录，使迟到的旧撤除和重复的旧操作仍有答案。记录的保留期限没有规格，本版不清理。
