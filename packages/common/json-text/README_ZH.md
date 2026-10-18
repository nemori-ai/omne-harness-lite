# @omne-harness/json-text

[English](README.md)

严格 JSON 文本读取器、值树判定与值树原样写出。读取器归 Issue #242，判定与写出归 Issue #373。

## 职责与状态

本成员是共同的 JSON 文本读取器。它在调用方给出的预算内读取一份不可信的 JSON 文档。它也判定在内存里构造的值树，并把值树原样写回文本。契约在架构页「公共 JSON 文本读取」。叶子名 `json-text` 在本分支确定。#242 当时没有裁定名字，并禁止从旧目录猜测。

今天已经实现 `readJsonBytes`、`readJsonText`、公开结果类型、六项预算和失败顺序。[#242](https://github.com/nemori-ai/omne-harness-lite/issues/242#issuecomment-6173933512) 已于 2026-10-15 接受这部分读取实现。Issue #373 新增 `judgeJsonValue` 与类型 `JsonTreePath`、`JsonValueJudgment`，已于 2026-10-18 接受。`writeJsonText` 依 [RFC-0010](../../../docs/rfcs/RFC-0010-json-text-lossless-writer.md) 加入，2026-10-18 接受。包内测试覆盖全部这些行为。`writeJsonText` 是「原样写出」：它保留数字词法和成员顺序，不加空白。它不是规范写出。规范写出（RFC 8785，排序键并规范化数字，用于摘要）仍在本包之外。本包不提供分块读取。本包不导入 Cordis、身份、时间，也不导入两棵 legacy 树。

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

判定在内存里构造的值树，并把树写成文本：

```ts
import { judgeJsonValue, writeJsonText } from '@omne-harness/json-text'

const judged = judgeJsonValue(candidate)
if ('ok' in judged) {
  // judged.ok is a frozen copy. A number keeps its lexeme.
  const text = writeJsonText(judged.ok) // no space, keys in the order of `entries`
} else {
  // judged.rejected is the reason. judged.path is the structural path of the field.
}
```

输入是 `Uint8Array` 时调用 `readJsonBytes(bytes, limits)`。唯一的运行时依赖是 `jsonc-parser`。本包没有 Cordis 入口。`files` 只发布 `dist`。`source` 导出条件指向 `src/index.ts`。

## 契约

行为拥有者是 `packages/common/README.md` 指向的架构节。本页不复制签名、失败原因、路径规则和 `writeJsonText` 的 `TypeError` 情形。公开形状在 `src/types.ts`。读取成功不表示对象存在，也不表示调用方获得授权。

停止顺序在上面指向的架构节。`tests/read-json.spec.ts` 用字面用例锁住这个顺序。`tests/judge-json-value.spec.ts` 锁住每种拒绝原因及其路径、访问上限、两条保证（不调用 getter、异常不外泄）、冻结的副本，以及 10 万层深的树。`tests/judge-json-value-walk.spec.ts` 锁住对象环、不是对象的根、不是字符串的 `kind`，以及读不了的列表。`tests/write-json-text.spec.ts` 锁住文本格式、与 `readJsonText` 的往返、宽树与深树，以及 `TypeError` 情形。`tests/read-long-keys.spec.ts` 锁住长键的重复键检查。`writeJsonText` 期望收到 `judgeJsonValue` 接受的树，或 `readJsonText` 的产出。重复键、环和共用子树是前置条件，调用方违反时的行为不在测试里锁定。

## 设计

`src/read.ts` 核对参数，解码字节，然后对 `jsonc-parser` 扫描器的 token 跑一个扫描循环。循环维护一个未闭合容器的栈。每个容器记录它下一个接受的 token。循环在第一次契约失败时返回，所以失败结果不带部分值。读取器不用 `jsonc-parser` 的 visitor，因为 visitor 在出错之后继续扫描，也会扫描重复键的值。

扫描器把 `01` 拆成两个数字，并把 `1.` 当成一个数字。所以读取器取从 token 起点开始的整段数字字符，再按 RFC 8259 的数字语法核对。输入结束时，扫描器报告字符串结束，并丢掉更早的非法转义或控制字符。读取器在使用解码长度之前，把原始 token 当作 JSON 字符串前缀来核对。读取器在键本身出现时、按文本顺序发现重复键，所以失败顺序不变。不足 256 个单元的键放在原生 `Set` 里。更长的键放进按摘要分的桶，摘要带每进程随机种子。原因是引擎对 16 384 个单元以上的字符串只按长度哈希，长度相同的长键放进 `Set` 会使耗时变成二次方。键只有在桶内完全相等时才算重复。`src/judge.ts` 用显式的栈和「当前路径上的容器」集合走树，所以深树不会压垮调用栈，环检查的代价也不随深度逐节点增长。它按键给条目下标排序来找重复键，而不用键的哈希集合，因为长度相同的长键会使集合的耗时变成二次方。它只为拒绝结果构造路径。`src/write.ts` 同样用显式的栈。写出函数和判定函数都用 `src/read.ts` 的数字语法，所以三者共用一条规则。`src/index.ts` 只再导出四个函数和公开类型。扫描器 token 不公开。

## 配置与运行

`limits` 没有默认值。每个字段都必须是 1 到 `Number.MAX_SAFE_INTEGER` 的整数。其他值抛 `TypeError`。`judgeJsonValue` 有可选的 `maxVisits`，默认 1 000 000。列表的槽位在读取之前计入：列表比剩余额度长时，结果是指向该列表的 `budget`，一个槽位也不读。`limits` 的 `maxVisits` 读取时抛出异常，也抛 `TypeError`。`writeJsonText` 没有大小上限，字节预算由调用方承担。本包不读环境变量，也不创建时钟、数据库或进程。

## 验证

适用的测试是单元测试和从公开入口做的契约测试。`tests/consumption-sample.spec.ts` 是独立消费检查。它只在 `kind === 'ok'` 之后运行局部 `{ parse, encode }`，并核对 `src` 只导入自身模块和 `jsonc-parser`。测试使用真实的 `jsonc-parser`。集成测试和端到端旅程不适用，因为本包没有存储、服务或用户旅程。

在本目录运行：

```sh
pnpm run build
pnpm test
```

`pnpm test` 先构建，再运行 Vitest。慢层的测试测读取器、判定函数和写出函数处理 999 个 50 000 单元等长键的耗时。其余测试不测性能。

## 维护

后续的配置读取、协议解码、持久记录读取，以及持有值树的成员（例如工具调用参数）是消费者。它们不在本包里实现。公开读取结果变化时，#242 和这些消费者一起改。

workspace catalog 钉住 `jsonc-parser` 的版本。`jsonc-parser` 把扫描器 token 码声明为 ambient const enum，所以 `src/read.ts` 复制了这些码。改 `jsonc-parser` 版本之前，先重新核对这些码。
