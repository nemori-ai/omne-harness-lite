# D1-R1 目录共同额度修订证据

本目录支持[候选修订](../../observability-directory.md)，状态为待评审/接受。
输入为 `82b2baf7f88bcbe8b089b9c53278135a545169b7`，本次没有修改产品实现、
正式规格或根依赖配置。产品反例与设计机制探针分别保留，不把候选探针称为
D1-R1 产品 GREEN。

## 产品反例原件

实施作者固定提交 `fefb6c5b7ff9b82dc9f1a7648d58409f4a0a165d`：

- [product-red-d1-r1.log](product-red-d1-r1.log) 精确复制原提交的
  `docs/proposals/core-capabilities/implementation/evidence/p1-diagnostics/reviewer-remediation/red-d1-r1.log`。
- [product-red-source.txt](product-red-source.txt) 精确复制原提交的
  `packages/observation/diagnostics/tests/reviewer-regressions.spec.ts`，保留源文件
  全文便于核对；本次只消费其中 `D1-R1 shared directory budgets` 的两条测试，
  没有评审或修改其余测试所涉问题。

原执行命令：

```bash
pnpm --filter @omne-harness-lite/diagnostics exec vitest run tests/reviewer-regressions.spec.ts -t 'D1-R1'
```

原日志记录 2 failed / 7 skipped / exit 1。挂起旧来源真实 fs.write 后创建新
来源，目录大小为 3356 bytes，超过 2400；两次 prepare 后并发放行真实
`open('wx')`，得到 2 个文件，超过 maxFiles=1。本作者通过 git show 读取并保留
固定原件，没有在本树重跑旧产品或修改实施者的工作树。

## 新机制的实际测量

[probe.mjs](probe.mjs) 是独立 Node 脚本，只用 Node 内置文件 API；内存 Ledger
是这个探针的算术与所有权模型，不是产品实现或建议增加的公共抽象。它在
Node v24.18.0 / Linux 5.15.0-1084-aws / x64 实际创建、写入、stat、关闭文件。
[probe-result.json](probe-result.json) 保留原始 stdout；命令 exit 0。

| 场景 | 实际观察 |
|---|---|
| 旧、新来源共享 pending 字节 | 历史文件 40 bytes；旧来源预留 35 尚未写入，新来源申请 26 被拒绝、25 成功；总 charge 100、reserved 60，物理 stat 不能借出 pending |
| 部分写与核对失败 | 实际只写旧来源前 10 bytes，再人为进入错误/未知路径；最终 stat 的注入失败保留剩余 25，不能借出 1 byte；关闭且 stat 成功后才退 25，重用余额后实际目录恰为 100 |
| 并发 slot 和同源重复 | maxFiles=1，open 前暂停；同源调用共享同一 Promise/handle，另一来源被拒绝，实际目录尚为 0；放行后只有 1 文件，source.close 后仍占 slot |
| 准备失败 | open 前人为失败释放无资源 slot；open 后人为失败确认关闭 fd，空文件原件保留并占用唯一 slot |
| 未提交字节退还 | 明确尚未调用文件 write 的预留退还后可再次借记；最终实际写入 20 bytes |

前两行为同一连续场景，因此脚本结果包含 4 个 case。部分写不是声称内核本次
自然返回短写：脚本主动只提交前缀，再注入后续失败；设计要测的是剩余未知量
不会提前释放。所有写入都是探针占位字节，不声称 JSONL 来源协议或 Pino/Sonic
集成成立。结果文件明确列出未测量范围：产品 R1、Sonic 回调/drop 接线、flock
产品集成、fd close 歧义、root owner shutdown、重启和原生安装。

从包含本稿的检出根执行，使用不存在的目录（脚本拒绝重用旧目录）：

```bash
node docs/proposals/core-capabilities/implementation/evidence/observability-directory/probe.mjs \
  tmp/observability-directory/replay-01
```

本次 sandbox 为 `tmp/observability-directory/run-01`。脚本所有打开的文件 handle
最终计数为 0，保留 6 个文件共 120 bytes 供查验；文件内容完全由脚本重建。
不含密钥、环境变量内容、模型调用或外部 exporter。脚本、原始日志与来源复制的
SHA-256 归 [manifest.json](manifest.json)。

## 沿用而未重跑的原语证据

[P0 锁探针](../p0-lock-probe/README.md)固定 `fs-ext@2.1.1` 的官方发行物、构建
工具链及两次实际运行，同进程独立 fd、两进程、SIGSTOP/SIGKILL、close 后释放
与稳定 dev/inode 均已测。原始脚本、summary、hub-summary 和 toolchain 哈希
仍由该证据目录拥有。本次复用其 Linux 本地锁前提，没有重新安装 native addon，
没有把 P0 的 syscall 语义当作本次目录 factory/close 已实现的证据。

[原观测探针](../observability-design/README.md)的固定 Pino/Sonic/OTel 选型及
12+7 实验不受本修订改变，本次不重启 DSH/Cordis 或日志全栈调研。目录唯一性、
共同额度与失败保有的正式集成验证仍归 D1 作者，最低场景在候选正文中列出。

## 本树交付检查

使用本树 `tmp/observability-directory/venv` 与本树源码，执行
`make docs-check BASELINE=82b2baf`，原始结果归 [docs-check.log](docs-check.log)。
最终 exit 0，检查 419 份 Markdown。首次检查因尚未写入 diff-check.log 导致
错链而失败，原输出保留于 [docs-check-initial.log](docs-check-initial.log)，补齐
该证据后重跑通过。`git diff --check` 与 staged 检查结果归
[diff-check.log](diff-check.log)。这些检查只覆盖文档
机械约束和空白，不等于架构接受、产品测试通过或正式规范发布。
