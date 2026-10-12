# 工具名字封口的规范输入

行为归 [SPEC](../../SPEC.md#原文参数与调用责任)，形状归 [公开 Schema](../../schema/content-blocks.schema.json)。下列原值及判据为独立回归输入，不是开发记录。

## v3 窄修订的规范对照

每一行均为本版本的规范实例；Schema 只判表示，拒绝值及派发限制按所列条款。
除两行明确切换参数分支外，反例从首行只改一个成员。`tool` 长度超 128 的未解析分支允许，正常 ModelToolName 仍有原上限。

### 坏名未解析完整调用

校验对象：`$defs/ContentBlock`。预期 Schema：`通过`；契约结果：`—`。S-12：原名原文保留，不执行、不解析。

```json
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
```

### 合法模型名

校验对象：`$defs/ContentBlock`。预期 Schema：`通过`；契约结果：`—`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_bad",
  "tool": "read_file",
  "rawArguments": "{\"x\":1}",
  "unparseable": true
}
```

### 空名字

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_bad",
  "tool": "",
  "rawArguments": "{\"x\":1}",
  "unparseable": true
}
```

### 非字符串名字

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_bad",
  "tool": 5,
  "rawArguments": "{\"x\":1}",
  "unparseable": true
}
```

### 缺tool

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_bad",
  "rawArguments": "{\"x\":1}",
  "unparseable": true
}
```

### 缺CallId

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "tool": "bad:name",
  "rawArguments": "{\"x\":1}",
  "unparseable": true
}
```

### 缺rawArguments

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
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
  "unparseable": true
}
```

### 缺unparseable

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
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
  "rawArguments": "{\"x\":1}"
}
```

### 混参数

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
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
  "unparseable": true,
  "arguments": {}
}
```

### 标false

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
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
  "unparseable": false
}
```

### 额外成员

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
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
  "unparseable": true,
  "extra": 0
}
```

### 完整标记缺席

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "callId": "call_bad",
  "tool": "bad:name",
  "rawArguments": "{\"x\":1}",
  "unparseable": true
}
```

### 坏名正常参数

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
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
```

### 正常名正常参数

校验对象：`$defs/ContentBlock`。预期 Schema：`通过`；契约结果：`—`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_bad",
  "tool": "read_file",
  "arguments": {}
}
```

### 129字符坏名未解析

校验对象：`$defs/ContentBlock`。预期 Schema：`通过`；契约结果：`—`。S-12、S-26：只改变列明的条件；正常参数仍遵守原 ModelToolName。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_bad",
  "tool": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "rawArguments": "{\"x\":1}",
  "unparseable": true
}
```

## v3 名字长度边界对照

以下对照限定正常参数与工具指认的值域；完整未解析分支仍保留收到的非空原名。

### 128字符正常参数

校验对象：`$defs/ContentBlock`。预期 Schema：`通过`；契约结果：`—`。S-12、S-26：正常 arguments 分支仍受原 ModelToolName 的 128 字符上限约束。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_bad",
  "tool": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "arguments": {}
}
```

### 129字符正常参数

校验对象：`$defs/ContentBlock`。预期 Schema：`拒绝`；契约结果：`malformed`。S-12、S-26：正常 arguments 分支仍受原 ModelToolName 的 128 字符上限约束。

```json
{
  "id": "b_bad",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_bad",
  "tool": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "arguments": {}
}
```
