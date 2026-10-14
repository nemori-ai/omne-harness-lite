# @omne-harness/legal-identity

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

module 变体草稿。行为归 Issue #243。

## 职责与状态

本成员拥有合法身份文本、相等判断、租户组合，以及唯一的 `IDENTITY_TYPE_NAMES`。位置 `packages/common/legal-identity` 是共同组说明里已经采用的目标。

今天已经有的是 RFC-0003 的包文件、module 变体，以及 `IDENTITY_TYPE_NAMES`。按家族解析、编码、相等和 `tenant()` 还没有实现，归 #243。本包不导入 JSON 读取器、数据库、Cordis、身份服务，也不导入两棵 legacy 树。解析成功不表示对象存在、成员有效或操作获准。

## 使用

现在可以读取 `IDENTITY_TYPE_NAMES`。解析和 `tenant()` 还没有实现。依赖为空。本包没有 Cordis 入口。

`files` 只发布 `dist`。`build` 先删除 `dist` 再编译。`tsconfig.build.json` 打开 `erasableSyntaxOnly`。源码条件没有写入导出，因为条件名尚未决定。

## 契约

行为拥有者是共同组说明和已接受的 #221 决定。本页不复制家族文法。#243 实现该契约。`LoginIdentifier` 仍是账号属性，不是身份类型名。

## 设计

内部模块还没有。解析函数是建立合法值的唯一路径。类型断言不是这条路径。

## 配置与运行

本包不读环境变量，也不创建账号、凭证、时钟或进程。

## 验证

适用的测试是单元测试、从公开入口做的契约测试，以及独立消费检查。集成测试和端到端旅程不适用。本包没有存储、身份服务或用户旅程。Session 和授权的测试留在各自的拥有者。

这份草稿里没有测试文件。没有可观察结果的断言不算上述测试。#243 在实现契约时补上测试。届时在本目录运行 `pnpm test` 和 `pnpm build`。

## 维护

已点名的消费者是 `packages/identity/identity`、`packages/session/session`，以及 `tools/ts-checks` 的 `identity-shapes`。该检查从本包导入 `IDENTITY_TYPE_NAMES`。解析、编码和 `tenant()` 仍归 #243。

适用的测试是 `tests/identity-type-names.spec.ts` 里的单元和契约检查。它通过包名导入本包。集成测试和端到端测试不适用。本包没有存储、应用服务或用户旅程。
