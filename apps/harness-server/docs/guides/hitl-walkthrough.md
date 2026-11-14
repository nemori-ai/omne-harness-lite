# 亲手走一遍人工介入

本页给出步骤：一个人在自己的宿主上，用发行的 `serve` 和 `omne` 命令行，把 Ask 的出卡、答复、叫停和重启各走一遍。每一步写明应当看到什么。

规则不在本页。卡片与答复的规则归 [人工介入规格](../../../../packages/human-intervention/SPEC.md#卡片与答复)，命令行的三个 HITL 命令归 [CLI 规格](../../../cli/SPEC.md#hitl-命令)，应用怎样把 Tool 的等待接到 HITL 归 [Tool 运行时行](../rows/tool-runtime.md)。

## 准备

1. 按 [README「在本机运行服务」](../../README_ZH.md#在本机运行服务)构建、运行一次 `setup`，再运行 `serve`。`setup` 需要真实的模型凭据。
2. 另开一个终端，在仓库根目录注册并登录一个账号。凭据从标准输入读取，不回显。

   ```sh
   alias omne='node apps/cli/dist/bin.js'
   omne register --login-identifier alice
   omne login --login-identifier alice
   ```

发行的会话定义 `coding` 与 `assistant` 缺省是协作模式（`co-work`），Agent 可以调用 Ask。权限模式缺省是 `bypass-permissions`，Agent 的其他工具不会先问权限。

每个命令在标准输出写一个 JSON 对象（`read-history` 与 `read-session-diagnostics` 缺省写人读的文本）。下面只写要看的键。本页第一、二、三、五节的命令由用例 [release-walkthrough.spec.ts](../../tests/rows/tool-hitl/release-walkthrough.spec.ts) 在发行树上照次序走一遍；第五节第 4 步由 [release-cancel.spec.ts](../../tests/rows/tool-hitl/release-cancel.spec.ts) 守；第六节由 [release-restart.spec.ts](../../tests/rows/tool-hitl/release-restart.spec.ts) 守。

## 一、出卡

1. 建一个会话，记下结果里的 `session`。

   ```sh
   omne create-session --definition coding
   ```

2. 发一条让 Agent 提问的消息。

   ```sh
   omne send-input --session <会话> --text '动手之前，先用 Ask 工具问我：开发服务器用哪个端口？给两个选项 3000 和 8080。'
   ```

3. 从会话入口列卡，再从待办池列卡。

   ```sh
   omne list-cards --session <会话>
   omne list-cards
   ```

应当看到：两次的 `body.items` 里是同一张卡，`origin.kind` 是 `tool`，`origin.sessionRef` 是这个会话。记下这张卡的三个值：`card.ref.request.requestId`、`card.ref.cardId`、`card.revision`。

4. 读这张卡。

   ```sh
   omne read-card --request <requestId> --card <cardId>
   ```

应当看到：问题的文字、各选项和它们的标识，以及一句「跳过会怎样」（`declineConsequence`）。

## 二、答复

三种答复各用一个会话走一遍。每次先重复「一、出卡」的第 1 到第 3 步。

| 答复 | 命令 | 模型读到的结果 |
| --- | --- | --- |
| 选一项 | `omne submit-reply --request <requestId> --card <cardId> --revision <revision> --option <选项标识>` | 这一题选中了哪一项 |
| 写原话 | 同上，把 `--option …` 换成 `--text '用 9000'` | 这个人写的原话 |
| 跳过 | 同上，把 `--option …` 换成 `--decline` | 这个人没有回答 |

应当看到：`outcome` 是 `succeeded`，`body.kind` 是 `decided`。随后读会话历史：

```sh
omne read-history --session <会话>
```

应当看到：历史里有一条 Ask 的工具结果，只有一条；Agent 在它之后继续回答。历史里看不出卡片是从会话入口还是从待办池答的。

再走一张请求批准的卡：让 Agent「用 Ask 请求批准删除 build 目录」。选同意、选不同意、写原话、跳过，结果分别是已批准、未批准、没有准驳（附原话）、没有准驳。后两种都不是许可。

## 三、一张卡只有一个决定

对一张已经答过的卡再提交一次，换一个答复。

```sh
omne submit-reply --request <requestId> --card <cardId> --revision <revision> --text '改成 7000'
```

应当看到：`outcome` 仍是 `succeeded`，`body.kind` 是 `already-decided`，并带回原来的决定。会话历史没有变化。

## 四、等人的时候，别的照常

1. 在卡片还没答的时候，另建一个会话并发一条普通消息。应当看到它照常得到回答。
2. 在等人的那个会话里再发一条普通消息。应当看到这条消息被受理，卡片仍是待处理；它不会被当成卡片的答案。

第 2 步有一条已知限制，走之前先读：这条消息之后，这个会话当前的 Run 不会结束。答复卡片后 Ask 照常恢复，Agent 也会再回答一次，但 `read-session-diagnostics` 一直显示 `not ended`，这时在 `serve` 的终端按 Ctrl+C，退出码是 5。原因是把 Run 进行中受理的输入交给这个 Run 的那条链还没有建成（[#1197](https://github.com/nemori-ai/omne-harness-lite/issues/1197)），见 [Tool 运行时行的已知限制](../rows/tool-runtime.md#具名缺件与已知限制)。所以第 2 步请用一个单独的会话走，不要接着用它走第五、第六节。

## 五、叫停

1. 让一个会话出一张卡，不答。
2. 取这次 Run 的标识，再叫停它。诊断输出里每个 Run 一段，首行是 `Run <run> (…)`。

   ```sh
   omne read-session-diagnostics --session <会话>
   omne cancel-run --session <会话> --run <run> --urgency force
   ```

3. 列出失效的卡，再对这张卡提交一次答复。

   ```sh
   omne list-cards --session <会话> --state invalidated
   omne submit-reply --request <requestId> --card <cardId> --revision <revision> --text '太晚了'
   ```

应当看到：卡片在失效列表里，原因是被控制关闭；迟到的答复 `body.kind` 是 `invalidated`；这次 Run 已结束。会话历史里这次 Ask 有一条工具消息，排在 Run 的终态之前，文字是 `No result of this call is in the conversation: the run was cancelled before the call returned. …`。它由 Session 在结束 Run 的那一笔提交里写下，说的是发起方知道的事，不是 Ask 的答复。

4. 在这个会话里再发一条消息。

   ```sh
   omne send-input --session <会话> --text '继续。刚才那个问题不用问了。'
   ```

应当看到：新的一轮照常完成，Agent 的回答在历史末尾。上一轮没有结果的调用不会挡住它。

## 六、等人的时候停服，再重启

1. 让一个会话出一张卡，不答。
2. 在 `serve` 的终端按 Ctrl+C。应当看到进程以退出码 0 结束（`echo $?`）。
3. 再运行 `serve`。
4. 列卡。应当看到同一张卡仍是待处理。
5. 答复它，再读会话历史。应当看到 Ask 的结果出现一次，Agent 接着把这一轮做完。
6. 再按一次 Ctrl+C。应当看到退出码仍是 0。

## 本发行走不到的路径

- 归档会话：没有公开入口。
- 只结束一次工具调用：`stop-call --producer-kind tool` 答 `unsupported`。
- 插队（加急输入）：还没有实现。
- 通知收件箱：还没有实现；卡片只能靠列卡看到。
- 等人时发进同一会话的消息被这个 Run 处理：还没有实现（[#1197](https://github.com/nemori-ai/omne-harness-lite/issues/1197)）；消息被受理，但这个 Run 不会结束（见第四节）。
- 进程被强行杀死之后的接手：不在本页，停服要用 Ctrl+C。
