# @omne-harness/utc-instant

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

module 变体草稿。行为归 Issue #244。

## 职责与状态

本成员拥有 UTC 时间点、SI 时长和 `compareInstants`。位置 `packages/common/utc-instant` 是共同组说明里已经采用的目标。

今天已经有的是 RFC-0003 的包文件、module 变体，以及一个空的公开入口。解析、编码、精确比较和闰秒表还没有实现，归 #244。本包不提供持久业务时钟，也不提供 `Date.now` 默认值、数据库或 legacy 导入。#244 实现比较时，比较不得经过 `Date` 或 `Number`。

## 使用

现在没有可调用的示例。`src/index.ts` 不导出值。依赖为空。本包没有 Cordis 入口。

`files` 只发布 `dist`。`build` 先删除 `dist` 再编译。`tsconfig.build.json` 打开 `erasableSyntaxOnly`。源码条件没有写入导出，因为条件名尚未决定。

## 契约

行为拥有者是共同组说明和已接受的 #221 决定。本页不复制闰秒规则。`P1D` 不是时长。民用日期、时区计划和业务期限保持不同的值。#244 实现契约，并记录闰秒数据的版本。

## 设计

内部模块还没有。墙钟、单调钟和业务时钟仍是三个读取端口。本包不实现这些端口。

## 配置与运行

本包不读环境变量，也不等待墙钟。#244 加入闰秒数据时，该资源属于本成员，并带有来源、版本和失效日。

## 验证

适用的测试是单元测试、从公开入口做的契约测试、闰秒来源一旦存在后的核对，以及独立消费检查。集成测试和端到端旅程不适用。本包不证明持久时钟或物理时钟。

这份草稿里没有测试文件。没有可观察结果的断言不算上述测试。#244 在实现契约时补上测试。届时在本目录运行 `pnpm test` 和 `pnpm build`。

## 维护

已点名的消费者是 `packages/identity/identity` 和 `packages/tool/tool`。业务期限和租约恢复留在各自的拥有者。`compareInstants` 变化时，#244 和这些消费者一起改。
