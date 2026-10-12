## v3 窄修订的规范对照

每一行均为本版本的规范实例；Schema 只判表示，拒绝值及派发限制按所列条款。

### 坏名调用留在回复

校验对象：`$defs/AssistantMessage`。预期 Schema：`通过`；契约结果：`—`。S-9、S-31：同一个 CallId 留在唯一范围，配对仍由日志边界兑现。

```json
{
  "id": "msg_bad",
  "type": "assistant",
  "createdAt": "2026-09-26T00:00:00Z",
  "response": "resp_bad",
  "ending": "complete",
  "blocks": [
    {
      "id": "b_bad",
      "kind": "tool_call",
      "visibility": {
        "toHuman": true,
        "toModel": true
      },
      "complete": true,
      "callId": "call_bad",
      "tool": "bad:name",
      "rawArguments": "{\"x\":1}",
      "unparseable": true
    }
  ]
}
```

### 正常参数坏名仍拒

校验对象：`$defs/AssistantMessage`。预期 Schema：`拒绝`；契约结果：`malformed`。块表示拒绝沿 content-blocks/v3 原名返回。

```json
{
  "id": "msg_bad",
  "type": "assistant",
  "createdAt": "2026-09-26T00:00:00Z",
  "response": "resp_bad",
  "ending": "complete",
  "blocks": [
    {
      "id": "b_bad",
      "kind": "tool_call",
      "visibility": {
        "toHuman": true,
        "toModel": true
      },
      "complete": true,
      "callId": "call_bad",
      "tool": "bad:name",
      "arguments": {}
    }
  ]
}
```
