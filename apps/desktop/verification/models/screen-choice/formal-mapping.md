# ScreenChoice：一次截图只认一个答复

本目录的模型检查应用规格的一条承诺（「[不变式](../../../SPEC.md#不变式)」的 DT-50）：一次截图最多一个答复；答复只来自这次截图开的遮罩；一块屏成了在用的屏之后，别的屏交的结果不收。模型只证明列出的有限状态，不证明实现。

## 1. 建模的对象

主进程的一次截图（`src/main/device-screen.ts`），与每块屏上的遮罩页（`src/page/shot/`）。遮罩页是环境：可以被按下、交出图或取消、随时走掉；它们的请求以任意次序、可能迟到地到达主进程。主进程一次处理一个请求。

| 变量 | 含义 | 代码里 |
| --- | --- | --- |
| `phase` | 不在截、在选 | `choosing` 为 `null` 或不为 `null` |
| `capture` | 截图号 | `Choosing.capture` |
| `active` | 在用的屏 | `Choosing.active` |
| `page` | 每块屏的遮罩页做到了哪一步：关着、开着、按下了、交了 | 遮罩页的 `overlayChannel` |
| `inflight` | 在途的请求 | 遮罩页发出、主进程还没处理的 `active`、`choice` 与遮罩走了 |
| `answers` | 每次截图的答复 | `settle` 的调用 |

## 2. 动作与代码

| 动作 | 代码里的一步 |
| --- | --- |
| `Capture` | `POST /device/screen` 冻住画面、开遮罩（地址带截图号） |
| `Press(s)` | 遮罩页文档上捕获阶段的第一次 `pointerdown`，发 `POST /device/screen/active` |
| `Finish(s, k)` | 组件的 `onOk` 或 `onCancel`，发 `POST /device/screen/choice`（PNG 或空内容） |
| `Gone(s)` | 遮罩窗口被关、页面没加载出来、渲染进程没了，调 `gone(s)` |
| `Deliver(m)` | 主进程处理一个请求：读完请求体之后，核与结算在同一个同步步里，中间没有 `await` |
| `Settle` | `settle` 加上 `finally` 里的关遮罩与回来 |

## 3. 性质

- `OneAnswerPerCapture`：每次截图至多一个答复。
- `AnswerFromItsCapture`：答复来自这次截图开的遮罩。
- `AnswerFromActive`：有了在用的屏之后，答复只来自它。
- `NeverPicture`：见证，只在可达性配置里检查，被违反说明图能交出。

## 4. 配置与反例

| 配置 | 改了什么 | 期望 |
| --- | --- | --- |
| `positive` | 两块屏、两次截图 | 跑完无违例 |
| `ignore-capture` | 不核截图号 | 违反 `AnswerFromItsCapture`：上一次迟到的请求成为这一次的答复 |
| `no-lock` | 按下不锁别的屏，也不核在用的屏 | 违反 `AnswerFromActive` |
| `answer-when-idle` | 不在截也收答复 | 违反 `OneAnswerPerCapture` |
| `picture-reachable` | 只查见证 | 违反 `NeverPicture` |

## 5. 跑法

```sh
pnpm run check:formal-tools
python3 apps/desktop/verification/models/screen-choice/check.py --out <工作树外的目录>
```

`check.py` 只接受钉住的 TLC 1.7.4；日志、状态目录与带摘要的结果写到 `--out`。

## 6. 前提与没有覆盖的

- 主进程逐个处理请求；`chosen` 在读完请求体之后才核与结算。改成核完再 `await` 会让模型失真。
- 人只有一个指针，模型没用这条：它允许两块屏几乎同时按下，先到主进程的成为在用的屏。
- 遮罩页里的框选、标注与合成由组件负责，不在模型里。
