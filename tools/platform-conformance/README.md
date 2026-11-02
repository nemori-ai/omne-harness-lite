# 执行环境的平台符合性运行器

本工具在一个给定检出上运行现有 Vitest 用例，保存进程输出、原始 JSON 和三态报告。它不修改产品用例，不构建产品，不切换被测检出的提交。双平台演示需要分别运行两次，并核对报告里的完整 SHA 相同。

采用依据是 #979 revision 2 的成果 B。执行环境的验证责任见 [契约 SPEC](../../packages/execution/execution-environment-contract/SPEC.md#组合与验证) 与 [宿主提供者 SPEC](../../packages/execution/execution-environment-host-local/SPEC.md#组合与验证)。本目录拥有命令、报告格式和工具测试。

## 运行

先在目标检出安装依赖，按成员要求构建被测依赖闭包。`--sha` 必须是该检出的完整 HEAD，且能从当前 `origin` 分支到达。运行器通过 `git ls-remote --heads origin` 读取当前远端分支，再核对提交关系。远端不可读、提交未发布或本地缺少远端 tip 对象时，报告明确失败。工具不会为调用者 fetch 或 checkout。

```sh
node tools/platform-conformance/cli.mjs run \
  --root . --sha <完整提交SHA> \
  --member packages/execution/execution-environment-host-local \
  --test tests/contract-conformance.spec.ts \
  --test tests/host-command.spec.ts \
  --test tests/host-command-frames.spec.ts \
  --out tmp/platform/windows-<唯一运行名>
```

每个 `--member` 后面跟它自己的一个或多个 `--test`。成员路径相对于检出根，用例路径相对于成员目录。路径使用 `/`。可以继续给下一组 `--member` 和 `--test`，也可以用 `--manifest <JSON文件>` 替代所有成员参数。

```json
[
  {
    "member": "packages/execution/execution-environment-host-local",
    "tests": ["tests/contract-conformance.spec.ts", "tests/host-command.spec.ts"]
  },
  {
    "member": "packages/execution/another-provider",
    "tests": ["tests/platform.spec.ts"]
  }
]
```

工具不限制成员名或用例名。每个成员必须能解析它已安装的 `vitest/package.json`。运行器经 Node 直接运行该成员的 `vitest.mjs`，不使用 shell 拼接。没有 mode 过滤，快慢层一起运行。子进程设置 `NO_COLOR=1`、`FORCE_COLOR=0` 和 `OMNE_HOST_COMMAND_LINUX=1`。最后一项启用现有宿主命令的 Linux 实跑条件，Windows 上的平台跳过仍会保留。

入口经目标检出的 `scripts/with-test-slot.mjs` 持有运行名额。只有环境里已有 `OMNE_TEST_SLOT_HELD` 时才按该脚本的嵌套约定放行。成员测试本身不独立取得名额。`--timeout-ms` 设置每个子进程的时限，默认 `900000`，即 15 分钟。名额包装有额外 30 秒收尾时间。取消或超时会终止本工具拥有的进程树。Windows 使用 `taskkill /T /F`，POSIX 使用 `ps` 查后代，再终止后代和进程组。

## WSL 独立检出

先发布请求的提交。以下命令在已有工具检出的 WSL 会话内运行，不能在 Windows PowerShell 中直接运行。`prepare-wsl` 自动经调用工具所在检出的名额入口包装。目标必须是不存在的新目录，且位于 WSL 文件系统中。它拒绝 `/mnt/<盘符>` 和解析到该位置的路径。

```sh
node tools/platform-conformance/cli.mjs prepare-wsl \
  --root "$HOME/dev_repos/omne-platform-<唯一运行名>" \
  --remote https://github.com/nemori-ai/omne-harness-lite.git \
  --branch PanQiWei/m2-toolchain-w2 --sha <完整提交SHA>
```

命令只接受 HTTPS 或 SSH 远端。它执行 `git clone --no-checkout --branch`，在新检出里切到指定 SHA，核对远端可达性，然后执行 `pnpm install --frozen-lockfile --ignore-scripts`。依赖安装在该 WSL 检出中，不读取 Windows `node_modules`。准备记录保存在新检出的 `.git/platform-conformance-prepare.json`，失败时保留已创建的目录与可观察步骤，供调用者处理。它不修改已有 WSL 检出。

准备完成后，按目标成员要求在 WSL 检出内构建依赖闭包，再运行相同的 `run` 命令。WSL 发行版、内核和 Linux systemd 用户服务可用性都会写入报告。Linux 上 `systemctl --user show --property=Version --value` 必须成功，探测不满足时不能通过。探测只保存版本属性，不采集用户服务环境变量。

## 输出与判定

`--out` 必须为空目录或不存在的目录，防止旧报告被当成本次结果。

前提探测尚未执行时，报告保留 `probes` 和 pnpm 版本的未观察原因。名额等待超时明确记录 `slotHeld: false`。其他中断若未留下子报告，历史名额状态记为 `null` 并说明未知，不能据包装进程退出推断从未取得名额。

| 文件                   | 内容                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `report.json`          | 请求和实际完整 SHA、检出路径、平台版本、Node/pnpm 版本、探测、运行时间、名额状态、逐成员逐文件通过/失败/跳过数、跳过原因、原始退出码、结论 |
| `member-N.vitest.json` | Vitest 原始 JSON，原样保留                                                                                                                 |
| `member-N.stdout.log`  | Vitest 标准输出，运行期间持续保存                                                                                                          |
| `member-N.stderr.log`  | Vitest 标准错误，运行期间持续保存                                                                                                          |

| 退出码 | 结论                                                                           |
| ------ | ------------------------------------------------------------------------------ |
| `0`    | `passed`，所有请求用例实际通过且前提满足                                       |
| `1`    | `failed`，提交核对失败、断言失败或套件进程失败                                 |
| `2`    | 输入错误，包括非法参数、路径和重复输出目录                                     |
| `3`    | `incomplete`，缺报告、空集合、漏文件、缺用例、任何跳过、探测不满足或运行被中断 |

失败优先于未完整运行。进程退出 0 不能代替对 JSON 中每条断言的核对。`pending`、`skipped`、`todo` 和其他未通过状态都作为未运行记录。若 Vitest JSON 没暴露跳过原因，报告写明 `unknown: Vitest JSON did not expose a skip reason`，结论仍是未完整运行。

Windows 上现有 Linux 专属用例的跳过是本设施的负控。该报告不能当成 Windows 产品通过。工具测试使用临时 Git 仓库、真实子进程和具名报告 fixture，另有已安装 Vitest 的 JSON 实跑验证。它们只验证设施，不证明真实产品或另一平台已经符合契约。

## 工具验证

```sh
node --test tools/platform-conformance/*.test.mjs
node --check tools/platform-conformance/cli.mjs
```

本目录仅含 Node 标准库 `.mjs`，没有编译或 TypeScript 检查入口。独立评审、双平台同 SHA 的产品实跑和最终接受由交付负责人组织。
