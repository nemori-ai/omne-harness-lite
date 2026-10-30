# 派发简报检查

`brief-check-cli.ts` 在派发前检查一份闭包规格。它查规格缺节、描述性写范围、基线上不存在的路径、验收里不存在的脚本，以及漏在写范围外的调用方。检查项、输出与退出码的承诺归 [SPEC](SPEC.md)。闭包规格的固定写法归 `delegate` 技能的 `references/closure-spec.md`。

命令只读规格文件，并用 `git` 读 `--base` 提交上的内容。它不写文件，不改工作树，不访问网络。

## 用法

在仓库根运行：

```sh
node --experimental-strip-types tools/dev-flow/src/delegate/brief-check-cli.ts \
  --spec <闭包规格.md> --base <提交> [--root <检出>] [--json] [--strict]
```

| 选项       | 必需 | 内容                                                                             |
| ---------- | ---- | -------------------------------------------------------------------------------- |
| `--spec`   | 是   | 闭包规格文件。相对路径按启动 pnpm 的目录（`INIT_CWD`）解析，没有时按当前目录解析 |
| `--base`   | 是   | 闭包的基线。可以写提交号、分支或标签，必须能解析成一个提交                       |
| `--root`   | 否   | 检出目录。缺省为当前目录所属的 git 根                                            |
| `--json`   | 否   | 输出 `{"errors":[…],"warnings":[…]}`，每项含 `item`、`message`、`line`           |
| `--strict` | 否   | 把第 4 项的警告升为错误                                                          |

默认输出每条发现一行，前缀 `error:` 或 `warning:`。没有发现时标准输出为空。

退出码：`0` 没有错误（可以有警告），`1` 有错误，`2` 用法、读文件或 git 错误（标准错误一行 `brief-check: …`）。

## 在哪里用

- 写完闭包规格、派发之前，用规格里的基线运行一次。
- 有错误时先改规格，不派发。
- 第 4 项的警告提示“可能漏掉的调用方”。把调用方加进写范围，或写进「排除的调用方」并给出停止条件。派发前对关键规格可加 `--strict`。

## 实现

- `brief-check.ts`：解析规格与全部检查，导出 `checkBrief`；`gitRepository` 经 git 读 `--base` 上的文件与 `git grep` 结果。检查函数只依赖 `BriefRepository` 接口。
- `brief-check-cli.ts`：参数、路径、输出与退出码。
- 测试 `tests/delegate-brief-check.spec.ts` 在临时 git 仓库上运行全部检查。
