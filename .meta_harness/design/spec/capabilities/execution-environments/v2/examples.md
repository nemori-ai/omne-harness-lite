# 规范实例：落点、起停与每个失败值的反例

属于 `capability.execution-environments` v2 的规范工件。本契约**不附 Schema**，这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前三节各走通一条路径，第四节给每个失败值一个反例。

**两条读法上的边界：**

- **标识串只是占位**：`T1`、`S1`、`E1`、`G1` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `T1`、`T2` | 两个租户身份 |
| `S1` | `T1` 持有的一个会话；`S2` 是 `T2` 持有的一个会话 |
| `Shell`、`Browser`、`Computer`、`Read`、`Fetch` | 五个工具；在 `T1` 下的执行环境权限分别是 `always-allow`、`auto_place`、`never-allow`、没有值、`always-allow`；`Fetch` 另声明了目标环境 |
| 拓展件子进程的宿主机允许 | 验收装配里给了（测试种子） |

## 1. 取引用、判落点

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `resolveSessionEnvironment(T1, S1)` | `{ ref: E1 }` | [S-11](contract.md#s-11-resolvesessionenvironment) |
| 2 | 再取一次 | 同一个 `E1` | [S-11](contract.md#s-11-resolvesessionenvironment) ⑦ |
| 3 | `resolveSessionEnvironment(T2, S2)` | `{ ref: E2 }`，`E2 ≠ E1` | [S-5](contract.md#s-5-执行环境引用) |
| 4 | `placeExecution(T1, E1, Shell)` | `{ landing: host }` | [S-6](contract.md#s-6-落点判断本版只有宿主机) 第 4 条 |
| 5 | `placeExecution(T1, E1, Browser)` | `{ landing: host }`——`auto_place` 不是 `never-allow`，本版没有别的候选 | [S-6](contract.md#s-6-落点判断本版只有宿主机) 第 4 条 |
| 6 | `placeExecution(T1, E1, Computer)` | **`noLanding{ why: hostNotAllowed }`**——不回退，也没有沙箱可去 | [S-6](contract.md#s-6-落点判断本版只有宿主机) 第 2 条 |
| 7 | `placeExecution(T1, E1, Read)` | **`noLanding{ why: hostNotAllowed }`**——没有值不是允许 | [S-8](contract.md#s-8-缺席时的默认答案) |
| 8 | `placeExecution(T1, E1, Fetch)` | **`noLanding{ why: requirementNotJudged }`**——本版判不了宿主机满不满足它的目标环境 | [S-6](contract.md#s-6-落点判断本版只有宿主机) 第 3 条 |
| 9 | 把 `Shell` 在 `T1` 下改成 `never-allow`，再做第 4 步 | **`noLanding{ why: hostNotAllowed }`**——每次现判，不缓存第 4 步的答案 | [S-12](contract.md#s-12-placeexecution) ④⑦ |

## 2. 起、等、停

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `startProcess(T1, E1, { program: "/bin/sh", arguments: ["-c", "echo hi; sleep 600 &"], environment: {PATH: "/usr/bin:/bin"}, workingDirectory: "/work", input: 空 })` | `{ processGroup: G1 }`——`sh` 起来了，它在后台又起了一个 `sleep` | [S-13](contract.md#s-13-startprocess) |
| 2 | `processOutcome(T1, E1, G1)` | `{ ended: exited{ code: 0 }, stdout: "hi\n", stderr: 空, truncated: {stdout: false, stderr: false} }`——**只说 `sh` 自己**；`sleep` 还在 | [S-14](contract.md#s-14-processoutcome) |
| 3 | 再取一次 | 同一份结果 | [S-14](contract.md#s-14-processoutcome) ⑦ |
| 4 | `stopProcessGroup(T1, E1, G1)` | `confirmedGone`——`sleep` 随组停下 | [S-15](contract.md#s-15-stopprocessgroup)、[S-7](contract.md#s-7-进程组) |
| 5 | `processOutcome(T1, E1, G1)` | **`referenceNotValid`**——确认停下之后引用失效 | [S-7](contract.md#s-7-进程组) 末条 |
| 6 | 起一个一直不退出的进程得 `G2`；`stopProcessGroup(T1, E1, G2)` | `stopGrace` 之后强制结束，`stopReplyBound` 之内答 `confirmedGone`；再取 `G2` 的结果前它已失效 | [S-15](contract.md#s-15-stopprocessgroup) ④ |
| 7 | 起 `G3`，调用方在 `processOutcome` 等待中放弃 | **进程照跑**；放弃等待不停任何东西 | [S-14](contract.md#s-14-processoutcome) 末条 |

## 3. 停不下来与撤除

| 步 | 情形 | 预期 | 依据 |
|---|---|---|---|
| 1 | `G4` 里的一个进程确认不了退出（故障注入） | `stopProcessGroup` 在 `stopReplyBound` 之内答 **`notConfirmed`**；调用方（兼容件）按报错交回「已请求停止、未确认退出」，不挂起 | [S-15](contract.md#s-15-stopprocessgroup) |
| 2 | 故障解除 | 本能力**继续停** `G4`；调用方再停一次，答 `confirmedGone` | [S-15](contract.md#s-15-stopprocessgroup) 末段第一条 |
| 3 | 本能力撤除，`G5` 还在跑、有一次 `processOutcome` 在等它 | 那次等待以 **`environmentsWithdrawn`** 收；`G5` 被停；撤除之后新来的请求得 `environmentsWithdrawn` | [S-17](contract.md#s-17-撤除重启与在途) |
| 4 | 本能力重新装上，拿 `E1`、`G5` 来问 | 都是 **`referenceNotValid`**；要重新取引用 | [S-5](contract.md#s-5-执行环境引用)、[S-17](contract.md#s-17-撤除重启与在途) |

## 4. 每个失败值一个反例

| 失败值 | 调用 | 为什么 | 依据 |
|---|---|---|---|
| `invalidInput` | `resolveSessionEnvironment(T1, 缺席)`；`startProcess` 的 `launch` 缺 `workingDirectory` | 身份参数没有默认值；`launch` 全部必带 | [S-8](contract.md#s-8-缺席时的默认答案)、[S-13](contract.md#s-13-startprocess) ① |
| `environmentsWithdrawn` | 撤除开始之后的 `placeExecution(T1, E1, Shell)` | 这一次没有结论 | [S-17](contract.md#s-17-撤除重启与在途) |
| `referenceNotValid` | `placeExecution(T2, E1, Shell)`——`E1` 是 `T1` 的 | 与「从没发过」同一个值，不透露它属于谁 | [S-5](contract.md#s-5-执行环境引用) |
| `unavailable` | 执行环境权限的来路读失败时 `placeExecution(T1, E1, Shell)` | 读不到不是允许，也不是不许 | [S-6](contract.md#s-6-落点判断本版只有宿主机) 第 1 条 |
| `noLanding{hostNotAllowed}` | 装配里没有拓展件子进程的宿主机允许时 `startProcess(T1, E1, …)` | 缺席即不许；**什么都没起** | [S-6](contract.md#s-6-落点判断本版只有宿主机) 末段 |
| `noLanding{requirementNotJudged}` | 第 1 节第 8 步 | 判不出满足就不落 | [S-6](contract.md#s-6-落点判断本版只有宿主机) 第 3 条 |
| `startFailed{programNotFound}` | `program: "no-such-tool"`，`launch.environment` 的搜索路径里没有它 | 开始之前判出；进程从没跑过 | [S-13](contract.md#s-13-startprocess) ⑥ |
| `startFailed{launchRefused}` | `workingDirectory` 指向一个不存在的目录 | 找得到程序，操作系统不让它起来 | [S-13](contract.md#s-13-startprocess) ⑥ |

**次序回归例**：

1. 撤除中、引用也是别人的：`environmentsWithdrawn`（先于 `referenceNotValid`）。
2. 引用是别人的、权限来路也读不到：`referenceNotValid`（先于 `unavailable`）——不去读别人的权限。
3. 权限读不到、目标环境也声明了：`unavailable`（先于 `noLanding`）。
4. `never-allow` 且声明了目标环境：`noLanding{hostNotAllowed}`（先于 `requirementNotJudged`）。
