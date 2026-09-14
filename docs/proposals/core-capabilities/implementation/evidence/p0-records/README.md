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

## 独立评审后的 parser capacity 修复

独立 reviewer 针对固定产品 `00a4b20` 发现 encode/decode 的可复现不对称：将 G01
的 `outcome.result` 换成 127 层单元素数组包裹的 `0`，使用
`maxDepth=256`、`maxNodes=512`、`maxPayloadBytes=4096`、`maxLineBytes=8192`，
对象复制和 canonical 编码会接受该值，但 work-data 的严格文本 parser 在标量叶
深度 129 处按其已接受的实现上限返回 capacity。因此 encode 可能成功返回一行，
而同 limits 的 decode 拒绝该行。

修复提交为 `1a237da`（`fix(records): keep encode within parser capacity`）。先加入
边界测试并实际运行，结果为 `1 failed | 16 passed`：126 层结果的标量叶深度为
128，encode 与随后 decode 均成功；127 层时测试要求受控 capacity，原实现却返回
`ok:true`。`canonicalInput.arguments` 的相邻 127/128 层测试确认该内层路径已经由
现有 `validateEnvelope` 通过同一 parser 正确守住，无需另改。生成的外层对象深度
固定且比合法 envelope 更浅，没有同类受影响的深度路径。

最小修复是在 canonical payload 生成后，用公开 work-data `parseJson` 与 decode
相同的 `maxPayloadBytes/maxDepth/maxNodes` 重新核对文本可解析性；失败原样映射为
前缀 `/payload` 的深冻结 `Checked` capacity。没有复制 parser、调大实现上限、
修改规格或改变公开接口。测试同时确认相邻成功路径仍可 decode，两次 encode
各自返回调用者独占、彼此无别名的 `Uint8Array`；字节元素允许调用者修改，修改
一份不会影响另一份。最终受影响检查为：

```text
pnpm --filter @omne-harness-lite/records build
  exit 0
pnpm --filter @omne-harness-lite/records typecheck
  exit 0
pnpm --filter @omne-harness-lite/records test
  Test Files  2 passed (2)
  Tests       17 passed (17)
```

`1a237da` 的 records tarball SHA-256 为
`6c332570464f2cf403572b0e03477b0e8ec28c65c6008d733ae47daa6292a774`。使用
`--ignore-workspace --lockfile=false --ignore-scripts --force` 从该 tarball 重新安装
隔离 consumer 后，公开类型检查和运行验证通过：

```text
PASS: records tarball fixed G01 bytes, parser depth parity, immutable failure and owned bytes
```

随后重新运行完整 package checker，退出码 0；其中 `isolated records`、
`isolated tarball consumer` 与 16-member `isolated composition` 均通过。此修复只
闭合单行 codec 自洽性，未扩大到原文列出的 P1 writer、跨行或耐久恢复范围。

## HUB 整合与原始证据保全

`bbb4a3e` 合入修订后，`c1783fd` 只增加 records 的根锁 importer。主调度实际
执行 16 包构建、records typecheck/17 tests、16 个独立 tarball 和 16 包组合消费，
均退出 0；[HUB 汇总](hub-summary.json)记录来源、环境、黄金文件和四份压缩日志。
独立复核已闭合深度反例；本次接受限于 records 端口与单行 codec。

[作者 tool 原始输出](author-tool-output.json.gz)从实际子会话逐行提取 13 个执行
事件，只含 tool 输出、时间、调用 ID 和原行哈希（不含行尾换行），没有提示词或
推理内容。它保留中间失败、夹具校正、关键 RED/GREEN 与产物执行。最初未提交
的 compile-only stub 没有精确源码快照，因此不能声称所有早期失败都可从 Git
逐字复建；深度回归可从 `316b896` 加 `1a237da` 的测试差异复现。

[产物清单](author-artifacts.json)和[归档](author-artifacts.tar.gz)保全作者的两个
tarball 与三份消费者文件，已从归档逐项重读核对哈希。它们可用于复查作者
独立产物行为，不能把同一会话自报当成额外的 HUB 实际运行。
