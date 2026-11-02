# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试数据文件与说明。

## 边界

固定输入不能代替规格；数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

`recordings/` 下有两份合成回放件，各在一个用例目录里：

- `recordings/openai-tool-call/synthetic.jsonl`
- `recordings/openai-tool-call-continued/synthetic.jsonl`

来源：手写的合成流，不来自任何真实请求，不含凭据。第一行是旁注（`model`、`payloadDigest`、`recordedAt`、`synthetic`），其余每行是一个 SSE 帧。`payloadDigest` 是 [`../support/recording-cases.ts`](../support/recording-cases.ts) 的用例定义所构造的请求的请求体摘要。该文件也定义读取格式：`readSyntheticRecording` 重建 SSE 字节并补上 `[DONE]`。代码不生成回放件；请求体变化时，摘要变，回放用例变红，失败信息给出新值，再手工改旁注。

读取方：慢层的 [`../recording-replay.spec.ts`](../recording-replay.spec.ts)，经 `readRecording` 与 `replayRound` 把回放件送入装配路径。其余测试不读本目录。

合成回放件只证明请求形状与延续轮的路径，不证明真实模型会怎样回答。真实录制到之后，真实回放件取代合成回放件，见 [`../README.md`](../README.md)。

测试的临时保管库在运行时用合成值建立，不依赖固定输入文件。
