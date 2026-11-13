# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

- `src/ports.ts`：本包要的两个端口，用自己的词声明。
- `src/contribution.ts`：四个处理函数、值树与普通 JSON 的互换、结果的映射。
- `src/cordis.ts`：插件，经 `defineAccessPlugin` 把贡献挂上登记表。
- `src/index.ts`：根入口。

依赖：协议契约 `@omne-harness/assets-protocol`、接入的 Cordis 契约 `@omne-harness/access-cordis-contract`、`@omne-harness/json-text`（值树的类型）、`@omne-harness/legal-identity`（租户的文本）与 Cordis。不导入设置的领域成员与身份的实现。没有状态，没有资源。

## 关键机制与理由

- **端口自己声明。** 设置端口的形状就是租户层读写面的形状，应用的行把树上的读写面原样交过来，结构上相容。读写面的键归应用，本包不认识它，所以插件收一个现取它的函数。
- **先换主体再做别的。** 主体只由身份签发；登录的账号不是目标租户的账号时由身份拒绝，读写面不被调用。读写面自己还会再核一次主体。
- **映射一对一。** 读写面的每个结果对一个线上结果，不合并、不改名。读写面已经区分「确定没有写」与「可能写了」，本包照搬；只有读写面抛出时本包自己判：读答 `basis-unavailable`，写答 `unknown`。

## 验证与维护

条款与用例的对应见 [SPEC.md](../SPEC.md#组合与验证)。读写面加结果或字段时，同步端口、映射、SPEC 的表与 `tests/operations.spec.ts`。
