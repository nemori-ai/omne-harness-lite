# tests

本目录承载本包的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 和 `*.spec-d.ts` 测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。在本成员目录执行 `pnpm test` 和 `pnpm typecheck`。`pnpm test` 先构建，再从构建产物运行。

## 边界

测试通过包名消费真实入口，不深层导入源码。Cordis 用真实的 4.0.4。发布权威、主体资格核验和宿主是三个抽象定义的测试提供者，它们的真实提供者在 `agent-host-local` 和授权领域，不在本包；测试通过不证明那些提供者的行为。

- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有值导出；构建后的 `index.js` 没有任何导入；`index.d.ts` 及其传递的声明到 Cordis 没有任何边，类型边也没有。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：18 个键逐对等于类的 `provide`，并逐个等于写出的文本；目录插件的配置检查（缺省、`null`、空对象归一，其余值有一条带消息的 issue，`vendor` 名）；`./cordis` 的源码、`dist/cordis.js` 与 `dist/cordis.d.ts` 的导入图不含 `agent` 与 `agent-host-local`；构建后的声明里 18 个类各有 `@owner` 且没有 `@contract`，事件有 `@mode parallel` 与四个 `@param`；抽象类可被继承并经 `ctx.get` 取回，一个插件体可以提供几个定义；`AgentInstancesService` 对不合法输入返回具名失败，不抛出；目录插件的 `inject` 缺项时停在 PENDING、换提供者时重载、拒绝非空配置。
- [cordis-entry.spec-d.ts](cordis-entry.spec-d.ts)：类型测试，检查 `Context` 增补、键字面量、事件载荷和登记输入的类型。
- [registration.spec.ts](registration.spec.ts)：真实 Cordis 上的登记规则：认回与冲突（数据成员次序不同仍认回，范围、主体、状态任一不同即冲突）、发布权威先于写入、后继取代与代次、旧身份不删后继、fiber 卸载、撤除、监听失败不改变结果、`resolve` 与 `connect` 的核验次序、跨租户、宿主缺席与路由缺失。末尾几组用字面名字的测试检查：登记请求某一部分不合法时具名的 `invalid`、权威答复无已知形状、访问核验与宿主的几种不可答各有自己的文本、脱离服务调用 `register` 与 `withdraw`、被拒绝与被认回的请求不在调用方 fiber 上留下 effect、日志记录的名字。
- [module-graph.ts](module-graph.ts)：沿构建产物的导入图遍历，读文本，不用编译器接口。

## 维护

公开行为或 [Cordis 页](../docs/cordis.md)的条款变化时，同步对应测试与本目录的 [index.md](index.md)。新测试写明它会在什么缺陷下变红。

## 本包事实

[registration.spec.ts](registration.spec.ts) 的 `TestAuthority`、`TestAccess` 和 `TestHost` 是抽象定义的子类，只记录被问到的问题并按设定回答。`withdrawing` 状态的返回用一个不按 Cordis 行事的调用方上下文替身检查：它的 effect 不运行，或它的撤除函数抛错。真实 Cordis 的 effect 立即运行、立即结束，所以这两种情形只有替身能造出来；替身检查的是目录不信任调用方的 effect，不证明真实宿主会遇到。还没有覆盖的行为：同一撤除操作配不同登记的冲突（规格没有写）、登记记录的保留上限、登记身份生成失败（16 字节随机数的十六进制文本一定是合法身份，造不出这个失败）。

按用例名挑测试的运行（`make mutation` 只跑快层，用 vitest 的 `preParse`）看不见生成用例（`it.each`、`describe.each`）的名字：只被生成用例覆盖的变异体会因没有用例被选中而显示为存活。本包新增的测试都用字面名字。
