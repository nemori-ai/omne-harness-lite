# P0 records 端口与 codec 实施证据

## 交付身份与范围

- 实施提交：`00a4b20`（`feat(records): add durable ports and strict journal codec`）。
- 施工基线：`73ac35ec99a875106514beffcc6ca7ed7ba8adeb`；分支/工作树为
  `impl/dsh-p0-records` / `.worktrees/dsh-p0-records`。
- 接受的实施输入：`shared-interfaces.md` 的 `8f4cfa9` 版本，以及 catalog 中
  accepted 的 `data.agent-runtime-identity` v1、`data.core-work` v1、
  `capability.durable-records` v1、`composition.core-work-coordination` v1。
  records 从 `@omne-harness-lite/work-data` 默认公开入口消费共享类型及严格 JSON
  parser/copy/schema/canonical codec，没有复制共享 DTO 或跨 `src/` 导入。
- 本增量实现 `@omne-harness-lite/records` 默认入口、records 实施数据与 DR ports、
  opaque `PreparedOperation`/`PreparedCommit` 类型，以及严格 `core-journal/1`
  `encodeEnvelope`/`decodeLine`。包是 private、UNLICENSED、0.0.0、ESM、
  Node `>=24 <25`，provenance 的 `files` 为空并列出全部产品源码。
- 本增量没有 writer 实现、文件 I/O、锁、durability/recovery、admission、业务 reducer
  或 Cordis 依赖；没有导出 `createJsonlProvider` 或 `DomainLock`，也不导入
  diagnostics/observability 类型。codec 成功只证明单个完整行有效。

源码环境为 Node `v24.18.0`、pnpm `10.28.1`、TypeScript `6.0.3`、Vitest
`4.1.8`、`@types/node` `24.13.4`，运行于 Linux `5.15.0-1084-aws` x86-64。
依赖准备使用 `pnpm install --lockfile=false --ignore-scripts`，没有修改根锁文件或
运行安装脚本。

## TDD 测量

三轮行为测量均先让包与公共类型可编译，再观察目标行为的实际失败：

1. G01 固定字面量首次运行：`1 failed`；断言在 `encodeEnvelope` 返回
   `ok:false` 处失败，原因是 compile-only codec 明确未实现。加入规范 payload、
   UTF-8 byte length、SHA-256、精确四字段外层和单 LF 的最小编码后，
   `1 passed`，输出逐字匹配固定 1,294-byte 行。
2. 加入 G01/G10 双向固定字节与 G02–G09 后，校准测试夹具后实际结果为
   `6 failed | 7 passed`：失败集中在未实现 decode 及 encode 尚未拒绝
   digest/principal/counter/owner/tenant 等不一致。加入严格物理行、双层词法解析、
   envelope shape 与跨字段验证后，这些目标行为转绿。
3. 代码复核新增 system scope 多余 `tenantId` 与 `maxBytes`/`maxPayloadBytes`
   独立边界测试，实际结果为 `2 failed | 13 passed`。收紧 union shape 并令
   payload 容量在 encode/decode 对称后，最终为 `2 test files / 15 tests passed`。

固定夹具不是由 `encodeEnvelope` 动态生成。测试直接保存 G01/G10 的完整外层
字面量（含文件末尾 LF），并独立断言：

| fixture | 固定物理长度 | 固定物理行 SHA-256 |
|---|---:|---|
| G01 | 1,294 bytes | `922232e653e4196bcdda9624769766eb65784c624caf2661f38051543917e63a` |
| G10 | 1,747 bytes | `f29ce05cd8e294b61d0e1ffeb6ed79745dcba2792d96bc4dfe0577f07a06fef8` |

G02–G09 覆盖后续 epoch/普通操作、同租户两 stream 的规范顺序、UTF-8 与 JS
string length 差异、false/null/缺失 optional/空数组、外层/payload/canonicalInput/
嵌套重复键、不支持数字及非 JSON 运行时值、无 LF/CRLF/BOM/内嵌 LF/非法 UTF-8/
完整行损坏、同 operation/input 的不同拟提交结果、摘要与主体映射、counter、
stream owner/order/tenant、未知字段、非规范文本、容量、冲突记录与 outcome 一致性。
解码结果及全部嵌套数据被深冻结；getter 未被调用。

最终包内命令（均针对 `00a4b20` 产品内容）为：

```text
pnpm --filter @omne-harness-lite/records build
  exit 0
pnpm --filter @omne-harness-lite/records typecheck
  exit 0
pnpm --filter @omne-harness-lite/records test
  Test Files  2 passed (2)
  Tests       15 passed (15)
```

仓库当前没有配置独立 lint/formatter，未将 `tsc` 冒充 lint；格式边界另由
`git diff --check` 验证。证据文档完成后执行
`make docs-check BASELINE=73ac35e`，结果为 `PASS: 400 Markdown files`；该结构检查
不替代产品行为证据。

## 真实产物与公开消费

先构建全部 16 个产品成员（只运行 build，未重复旧 14 fork tests），随后运行：

```text
pnpm --filter @omne-harness-lite/package-checks check
  exit 0
  PASS: 16 product members, dependency boundaries, 94 upstream source records
  PASS: isolated records, 2 declared product artifact(s), strict declarations + runtime
  PASS: isolated tarball consumer, ownership, dependency removal, factory removal and initiator
  PASS: isolated composition, 16 declared product artifact(s), strict declarations + runtime
```

另外从实际打包的 records/work-data tarball 建立忽略根 workspace 的隔离 consumer，
通过默认包名导入，不使用源码 alias 或仓库内路径：

```text
pnpm install --ignore-workspace --lockfile=false --ignore-scripts
pnpm --ignore-workspace run typecheck
  exit 0
pnpm --ignore-workspace test
  PASS: records tarball default entry encoded and decoded fixed G01 bytes
```

隔离 consumer 验证公开 DR port/opaque token 类型可编译、G01 编码的固定物理长度与
SHA-256、解码及深冻结。实际 tarball 保存在 spoke 的忽略目录
`tmp/p0-records/tarballs/` 供整合前复核：

- records：`f34289b5d28b313e3fff7578afd7ca6250ef3784da30ac013b6f4ec4fc8ec0f0`
- work-data：`dd1b58f7bc83cadb73983c1c937b509e3071f7fc93e1b35ff7c70ad38d0fe478`

records tarball 只含 `dist/index.{js,d.ts}`、README、package.json 和 provenance；
其 dependency 被打包为 `@omne-harness-lite/work-data: 0.0.0`。consumer 明确用
work-data tarball override 满足这个尚未发布的 private 依赖。

## 验收对应与剩余责任

- A30 的本任务切片有直接证据：默认公开入口、唯一 work-data 依赖、禁止导出项、
  provenance、依赖无环检查、独立 tarball 类型/运行消费均通过。根
  `pnpm-lock.yaml` 仍须由整合者为 records leaf importer 更新并在 HUB 复验。
- A31 的本任务切片有三轮真实 RED/GREEN、固定黄金字节、严格反例、类型检查和
  最终产物检查。没有故障替身或真实持久提供者，因此不声称验证 durability。
- G09 中“同键重试返回原结果”和受控 digest collision、G10 中冲突回执在修订变化/
  重启后的稳定认回，都需要 P1 writer 的 operation index、序列与恢复状态；P0 只
  验证两份 envelope 均保留相同 canonical input identity，且不会由 codec 擅自合并。
- A05–A08、完整 DR、跨行连续性、owner 授权、writer epoch 获取、去重/冲突恢复、
  fsync/部分写入/崩溃/锁与 admission 仍归 P1 及组合验证，均未在本增量宣称通过。
- 实现完成和上述检查通过不构成独立评审或最终 accepted；接受权仍归主调度协调者。
