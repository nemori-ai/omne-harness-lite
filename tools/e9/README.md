# E9 长会话记录工具

本工具为 #979 r2 保存事件和逐轮记录，导出离线曲线，并执行中位数门和逐段增长门。DP1 C、墙钟余额、Linux fsync 首测和 DP2 B 采用 [Reduce 批复 R2-D17](https://github.com/nemori-ai/omne-harness-lite/issues/979#issuecomment-6576165103)。工具使用 Node 标准库，没有独立编译或类型检查入口。Node 版本沿项目 `engines.node`。

```sh
node tools/e9/cli.mjs run --root <检出绝对路径> --out <新归档目录> --adapter <本地适配模块绝对路径> --timeout-ms 1800000
node tools/e9/cli.mjs compare --before <前次归档> --after <本次归档>
node tools/e9/cli.mjs selftest --out <新自检目录>
node --test tools/e9/*.test.mjs
```

`run` 经目标检出的 `scripts/with-test-slot.mjs` 持有名额。`--timeout-ms` 是适配器总时限，默认 1800000 毫秒。适配器收到超时的 `abortSignal`，工具保存已有轮次并调用 `close()`。两秒后仍未退出时，父进程清理适配器进程树。名额包装另有三十秒余量。Windows 使用 `taskkill /PID /T /F`，POSIX 使用独立进程组。退出、超时、取消和清理结果写入 `processes.json`。工具不能撤回外部模型或工具效果。

归档目录必须新建。已有归档拒绝覆盖。退出码为通过 `0`、已发现失败或输入损坏 `1`、命令参数错误 `2`、等件或不可比 `3`。`--threshold` 可显式设置正数阈值，归档记录 CLI 来源。缺省 1.5 的来源仍为 R2-D1 第 5 条初值。

## 适配器输入边界

适配模块由调用者显式选择。事件不能指定执行代码。模块必须导出 `workload` 和 `open(context)`。

```js
export const workload = {
  kind: 'product', // 合成输入必须写 synthetic。
  definition: '本次固定工作负载及观察方法的版本标识',
  modelDelayMs: 100,
  toolDelayMs: 100,
}

export async function open({ root, out, abortSignal }) {
  return {
    async nextRound(round) {
      // 只在该轮真实完成后返回该轮完整事件数组。
      return events
    },
    async close() {
      // 释放适配器创建的资源。
    },
  }
}
```

工具串行等待 `nextRound(round)`，最多 200 轮。`logCount` 达到 10000 后不再请求下一轮。HTTP 受理不能替代完成事件。适配器负责证明四段含义、完成关联、固定延迟实际执行和 fsync 观察来源。`close()` 失败独立进入诊断，不能覆盖更早错误。需要其他资源或外部效果时，由调用方提供授权。

事件 schema 为 1。每个事件包含 `schemaVersion: 1`、非空 `runId`、从 1 连续递增的 `round` 和 `eventKind`。一次运行的 `runId` 必须一致。时间事件使用有限非负 `startMs`、`endMs`，且 `endMs >= startMs`。

时间事件的 `clock` 是 `{ processId, clockId, generation }`，三个值均为非空字符串。它声明单调时钟及代次。工具不支持跨时钟换算。缺失或不合格的时钟产生未测量值。

| eventKind        | 额外字段和含义                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `round-complete` | 时间区间和累计实际日志条数 `logCount`。每轮恰好一条。                                                                                               |
| `stage`          | 时间区间和 `stage`。键为 `sessionIO`、`projectionInterpretation`、`requestAssembly`、`agentProgression`。重复调用用多条完整区间事件表达。           |
| `external-wait`  | 时间区间、`provider: 'model'` 或 `'tool'`、非空 `invocationId`、有限非负 `definedDelayMs`。每轮调用标识唯一。区间记录实际等待，不能用配置延迟代替。 |
| `fsync-count`    | 每轮至多一条总计数。含非负安全整数 `count`、`source`、非空 `traceRef`、非空 `roundAssociation`。最后两项分别指向原始观察及解释轮关联的证明。        |

`fsync-count.source` 只接受 `strace`、`provider-observer` 或 `synthetic`。前两者分别声明系统调用跟踪或真实提供者观察，调用者必须保留对应证据。它们不能表示逻辑提交次数。`synthetic` 仅可用于合成工作负载。缺少 fsync 事件时记未测量，不能把 Windows 计数写成 0。Linux 的真实 trace 和轮关联由联调 B 交付，本工具不安装跟踪器，也不从上层提交数推算系统调用数。

所有收到的事件先按原字段保存为 `events.jsonl`，每行一条。非法事件、重复完成或错轮输入不会静默丢弃，运行记失败。`progress.jsonl` 保存已验证轮次，异常后也保留。`adapter-result.json` 保留首错和关闭诊断。输入必须可用 JSON 表达。

## 测量与判定

轮区间和所有参与扣除的外部等待必须同进程、同 `clockId`、同 `generation`。等待区间必须落在轮区间内。缺失等待记录或时钟不匹配时，`ownOverhead` 未测量。工具先求等待区间并集，再从轮时间扣除，得到非负墙钟余额。该数值不是 CPU 工作量，并行本地计算可能与被扣除的等待重叠。

每段独立计算自己的区间并集，结果为 inclusive duration。重复区间和原时钟保留在逐轮 `intervals` 中。缺段不能补零。四段不相加冒充轮总值。每段固定样本跨轮必须具有相同进程、时钟和代次。阶段可使用自己的拥有进程，与轮区间的时钟不同。

逐轮 `endToEnd`、`ownOverhead`、四个 `stages`、`fsync` 使用以下形状。时间单位为 `ms`，fsync 单位为 `count`。

```json
{ "state": "measured", "value": 12.5, "unit": "ms", "source": "实际观察来源" }
```

```json
{ "state": "unmeasured", "reason": "实际缺测原因" }
```

中位数门使用第 11 至 30 轮和第 181 至 200 轮的 `ownOverhead`。后窗中位数除以前窗，结果不超过阈值时该门通过。缺窗、缺测、时钟代次改变、前窗中位数为零或数值超出有限范围时等件。

四段各自执行 DP2 B。固定第 11 至 200 轮分为 19 个连续十轮块。每块轮号中点为 x，耗时中位数为 y。OLS 同时满足以下条件时，该段失败。

- 斜率 b > 0。
- R² >= 0.95。
- b × 180 > 3 × 残差 MAD。

MAD 是残差相对残差中位数的绝对偏差中位数。常量方差为 0 时不增长。近零实测值使用同一规则。缺样本、缺测或时钟资格失败时等件。非法、非有限或负时间拒绝。统计量超出有限数值范围时等件。摘要保留每块中位数、斜率、R²、MAD 和预测增长。该门只判断 200 轮内的形状，不能证明复杂度或因果关系。

总判定汇总中位数门和四段门。任何已证实失败优先。缺轮、缺测或缺 fsync 不能通过。`selftest` 提供完整合法四段和合成 fsync，分别断言平稳通过、整体增长失败、单段增长失败、缺测及缺窗等件。单段增长负控的总中位数比值为 1，仍因逐段门失败。所有合成结果明确标记 `synthetic`，不构成产品 E9 结果。

## 归档与比较

归档有 `summary.json`、`rounds.jsonl`、`curves.svg` 和 `curves.html`。适配运行另有原始事件、进度、适配器诊断及进程记录。曲线无需网络，悬浮文本显示段名、轮次和绝对毫秒值。缺测不画点，原因保留在 JSONL。

方法元数据固定 `definitionId: e9-wall-residue-ols-r2-d17-v1` 和 `eventSchemaVersion: 1`。`compare` 重算摘要，核对原始记录，拒绝缺测或执行失败的档案。完整适配档案还回放原始事件，核对派生轮次。比较要求方法、阈值及来源、时钟资格、工作负载、平台、OS、Node、核数和名额状态可比。SHA 可以不同，结果列出两端完整 SHA。

## 当前限制

真实产品的完成、四段和外部等待事件尚待各语义拥有者及 Reduce 接线。获准在它们落地前使用合成记录交付本设施，真实 A②/A③ 由联调 B 验证。

没有 `--adapter` 时仍走原产品探针。缺应用构建时等件。有构建时仅经真实 serve、SQLite 和公开 CLI 完成注册、登录与建会话，不发送模型或工具输入。它复用 `tools/joint-a/support.mjs` 的 `operatorLayer`。状态与登录文件放在归档目录，应只保存在本机任务证据区。该探针的等待状态不能用合成结果替换。

CLI 返回可信的 `basis-unavailable` 响应且退出码为 `4` 时，探针记录等件并保留原退出码。它表示采用依据不可用，不是已成功创建会话。其他非成功响应和无法解析的回复仍按探针失败记录。

本目录不写产品埋点，不改装配，不将 E9 加入准入。Windows 原生 fsync、Linux 真实跟踪、观察扰动和完整产品闭环均不由合成自检证明。
