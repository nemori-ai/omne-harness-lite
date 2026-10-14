# @omne-harness/json-text

[English](README.md)

严格 JSON 文本读取器。实现归 Issue #242。

## 职责与状态

本成员是共同的 JSON 文本读取器。它在调用方给出的预算内读取一份不可信的 JSON 文档。已接受的契约在架构页「公共 JSON 文本读取」。叶子名 `json-text` 在本分支确定。#242 当时没有裁定名字，并禁止从旧目录猜测。

今天已经实现 `readJsonBytes`、`readJsonText`、公开结果类型、六项预算和失败顺序。包内测试覆盖这些行为。负责人尚未接受这份实现。本包不提供分块读取。本包不导入 Cordis、身份、时间，也不导入两棵 legacy 树。

## 使用

```ts
import { readJsonText } from '@omne-harness/json-text'

const read = readJsonText('{"id":"a","limit":9007199254740993}', {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 4_096,
  maxMembers: 256,
  maxStringLength: 4_096,
  maxNumberLength: 64,
})
if (read.kind === 'ok') {
  // read.value keeps key order in `entries` and each number as its source `lexeme`.
  // Run the field owner's { parse, encode } here.
}
```

输入是 `Uint8Array` 时调用 `readJsonBytes(bytes, limits)`。唯一的运行时依赖是 `jsonc-parser`。本包没有 Cordis 入口。`files` 只发布 `dist`。`source` 导出条件指向 `src/index.ts`。

## 契约

行为拥有者是 `packages/common/README.md` 指向的架构节。本页不复制签名和失败种类。公开形状在 `src/types.ts`。读取成功不表示对象存在，也不表示调用方获得授权。

停止顺序在上面指向的架构节。`tests/read-json.spec.ts` 用字面用例锁住这个顺序。

## 设计

`src/read.ts` 核对参数，解码字节，然后对 `jsonc-parser` 扫描器的 token 跑一个扫描循环。循环维护一个未闭合容器的栈。每个容器记录它下一个接受的 token。循环在第一次契约失败时返回，所以失败结果不带部分值。读取器不用 `jsonc-parser` 的 visitor，因为 visitor 在出错之后继续扫描，也会扫描重复键的值。

扫描器把 `01` 拆成两个数字，并把 `1.` 当成一个数字。所以读取器取从 token 起点开始的整段数字字符，再按 RFC 8259 的数字语法核对。输入结束时，扫描器报告字符串结束，并丢掉更早的非法转义或控制字符。读取器在使用解码长度之前，把原始 token 当作 JSON 字符串前缀来核对。`src/index.ts` 只再导出两个函数和公开类型。扫描器 token 不公开。

## 配置与运行

`limits` 没有默认值。每个字段都必须是 1 到 `Number.MAX_SAFE_INTEGER` 的整数。其他值抛 `TypeError`。本包不读环境变量，也不创建时钟、数据库或进程。

## 验证

适用的测试是单元测试和从公开入口做的契约测试。`tests/consumption-sample.spec.ts` 是独立消费检查。它只在 `kind === 'ok'` 之后运行局部 `{ parse, encode }`，并核对 `src` 只导入自身模块和 `jsonc-parser`。测试使用真实的 `jsonc-parser`。集成测试和端到端旅程不适用，因为本包没有存储、服务或用户旅程。

在本目录运行：

```sh
pnpm run build
pnpm test
```

`pnpm test` 先构建，再运行 Vitest。测试不测性能。

## 维护

后续的配置读取、协议解码和持久记录读取是消费者。它们不在本包里实现。公开读取结果变化时，#242 和这些消费者一起改。

workspace catalog 钉住 `jsonc-parser` 的版本。`jsonc-parser` 把扫描器 token 码声明为 ambient const enum，所以 `src/read.ts` 复制了这些码。改 `jsonc-parser` 版本之前，先重新核对这些码。
