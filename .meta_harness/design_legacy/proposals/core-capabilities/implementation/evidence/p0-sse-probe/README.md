# P0 SSE 组件离线测量

本证据固定在仓库基线 `d938be5adf91843a3e1ca6055354bf1f1f5b6c61`、分支
`verify/dsh-p0-sse-probe`，执行者为 verification-developer `agt-031`。它只测量
Node 24 的 UTF-8 解码、成熟 SSE 分帧组件与有限 loopback HTTP 故障传输，支撑
[A23](../../acceptance.md) 的 P0 前置选择。它不完成 A23，
也不验证 A24 的 deferred receipt、路由兼容性或任何 MC 产品适配。

## 选择与依据

选择 `eventsource-parser@4.1.0`，精确 npm `gitHead` 为
`6519a0f70dfeb22f829e5c696da2cb4988d64c6a`，GitHub `v4.1.0` 注解 tag 解引用到同一
commit。发行时间为 2026-08-20；项目的 npm 发行历史始于 2022-09。该发行物为 MIT，
无运行时依赖，要求 Node `>=22.12`。本机 Node `v24.18.0` 满足要求。

采用它的直接依据是：

- [OpenRouter 官方流文档](https://openrouter.ai/docs/api-reference/streaming) 当前直接推荐
  `eventsource-parser`，并明确说明解析器只处理 SSE framing；JSON、流中 error、finish、
  usage 与 `[DONE]` 都须由协议消费者解释。
- [组件官方 README](https://github.com/rexxars/eventsource-parser/tree/v4.1.0) 提供
  `createParser` 及 `TextDecoderStream` → `EventSourceParserStream` 组合；发行物内包含
  TypeScript 源码，可与 npm `gitHead` 核对。
- 精确 tarball 的 npm integrity 为
  `sha512-+DHvQ1wLO//MK+1OZgcuXCbZFKgu3YjKPJt7n98rxX8vezL0ni+7s3ZQiM8bJkUEOk7MsuCycrPLj0FzUNf7Og==`，
  SHA-256 为 `95ce328c5c063b57c3da7cabc6ae0b54ebab4f054b57b7cb13ba6b5ac2b7241f`。
  `npm audit signatures` 实际确认一份 registry signature 和一份 provenance attestation。
- [WHATWG SSE 规范](https://html.spec.whatwg.org/multipage/server-sent-events.html)要求 UTF-8、
  接受 CRLF/LF/CR、以空行派发事件、连接多行 `data`，并在 EOF 丢弃未完成事件。

[sources.json](sources.json) 记录 2026-09-14T06:06:53Z 访问的精确 URL、响应 SHA-256、
WHATWG Last-Modified/ETag、OpenRouter 部署版本响应头，以及 npm/GitHub 发行物身份。
未比较替代组件，因为选定组件没有在任务要求的 framing 场景中出现具体不满足。

## 输入与实际结果

[scenario-spec.json](scenario-spec.json) 在运行前固定输入、预期与组件边界；
[result.json](result.json) 保存正常运行的原始 UTF-8 文本、字节 hex、传输 chunk hex、
解析事件、JSON 观测、socket/abort 观测与断言结果。正常运行 12/12 场景通过：

| 场景 | 对应要求 | 实际观测 |
|---|---|---|
| S01 | 单字节分块、多字节 UTF-8 | 每个 chunk 1 byte；中文、emoji 与 `é` 原样产生一个 data 事件 |
| S02 | 任意字节分块、多字节 UTF-8 | 非均匀切分及 33 个全部两段切分位置均与未切分 payload 一致 |
| S03 | CRLF/LF、多行 data、注释 | 两行 data 合并为 `first\nsecond`；heartbeat comment 被回调 |
| S04 | 同一 chunk 多帧 | `one`、`two` 两事件按顺序产生 |
| S05 | `[DONE]` | 组件原样产生字面量 data，不赋予终止含义 |
| S06 | finish、usage 尾帧、重复 finish | 三个 payload 全部按顺序产生；组件不去重、不结算 |
| S07 | 合法 SSE 中非法 JSON | SSE 无 parse error；payload 被原样交出，另行 `JSON.parse` 确认拒绝 |
| S08 | 流中 error 帧 | 顶层 `error.code=server_error` 与 `finish_reason=error` 原样交出，不被组件分类 |
| S09 | 未完成事件 EOF | 已有 data 行但缺空行，流关闭时不产生事件 |
| S10 | 无 finish 的 EOF | 完整 data 事件可见，但组件没有任何协议 finish 证据 |
| S11 | 实际连接断开 | 本机 server 写一完整帧和一部分帧后调用 socket destroy；客户端 body 以 `UND_ERR_SOCKET` 拒绝，只产生完整帧 |
| S12 | AbortSignal 中止 | 第一完整帧后 AbortController 实际中止；客户端拒绝，server 观察 request aborted/socket close，只产生完整帧 |

S11/S12 只绑定 `127.0.0.1` 的随机端口；探针只发两次请求，结束时断言实际计数，
没有另行实现服务器请求准入上限。结果记录服务端实际
write bytes、socket destroy 调用与 close/aborted 事件，未仅把预期故障写入断言。

测量工具的故障负控用 `--mutate S05-done-marker` 只污染验证视图中的 `[DONE]` 数据。
[negative-control.json](negative-control.json) 显示命令按预期退出 1，且唯一失败为 S05，
证明结果检查能检出观测值被篡改。首次正常探针出现的假阴性来自断言表达：组件事件对象
含值为 `undefined` 的 `id/event` 自有键，而 JSON 证据会省略这些键；另有组件 v4.1.0
`onComment` 对可选空格的行为与其 README 文字不一致。修正只比较本场景契约要求的 data，
并以实际 heartbeat 值检查注释回调；[measurement-correction.json](measurement-correction.json)
及其[重现脚本](measurement-correction.mjs)保存前后断言证据。该 comment 扩展差异不影响
WHATWG 要求的忽略语义或 OpenRouter heartbeat framing，但已作为组件维护风险保留。

## 重现

原始工作目录是
`/data/qiwei/repos/omne-harness-lite/.worktrees/dsh-p0-sse-probe/tmp/p0-sse-probe`。
联网只用于读取官方公开文档、GitHub 源码与 npm 包注册/下载；没有读取环境凭据，没有向
OpenRouter API 发请求。实际执行命令如下：

```sh
npm view eventsource-parser version dist.integrity dist.shasum dist.tarball repository.url gitHead license engines --json
git ls-remote https://github.com/rexxars/eventsource-parser.git refs/tags/v4.1.0 refs/tags/v4.1.0^{}
npm ci --ignore-scripts --no-audit --no-fund
npm audit signatures --ignore-scripts
node probe.mjs --output result.json
node probe.mjs --mutate S05-done-marker --output negative-control.json  # 预期退出 1
```

长期证据包含精确 tarball，因此可在不访问网络的临时目录重现。必须同时复制 lock，
因为探针会核对其 SHA-256：

```sh
cp package.json package-lock.json scenario-spec.json probe.mjs eventsource-parser-4.1.0.tgz "$TEMP_DIR/"
npm_config_offline=true npm install --ignore-scripts --no-save --package-lock=false \
  "$TEMP_DIR/eventsource-parser-4.1.0.tgz" --prefix "$TEMP_DIR" --no-audit --no-fund
node "$TEMP_DIR/probe.mjs" --output "$TEMP_DIR/result.json"
```

该离线 tarball 复现已实际运行并再次得到 12/12；原始输出保存在
[offline-repro-result.json](offline-repro-result.json)。第一次离线复现漏复制 lock，组件从
本地 tarball 安装成功，但探针按设计因缺少待核对的 `package-lock.json` 以 `ENOENT` 失败；
补齐固定输入后通过。

归档后的验证命令及结果：

```text
sha256sum -c MANIFEST.sha256   -> 11/11 OK
JSON parse/result invariants   -> PASS（正常 12/12；负控仅 S05 失败）
node --check probe.mjs measurement-correction.mjs -> exit 0
make docs-check               -> PASS（409 Markdown files）
git diff --cached --check      -> exit 0
```

## P4 消费责任与局限

本结果只支持“Node 的流式 UTF-8 decoder + `eventsource-parser@4.1.0` 能在这些输入上正确
分帧，并且 fetch 的 transport rejection 可与已分帧事件同时观察”。P4 的 MC owner/adapter
仍必须：

- 在 parser 前使用流式 UTF-8 解码，并把 socket/abort/clean EOF 分别传入终态分类；
- 对非 `[DONE]` data 做严格 JSON/协议校验，识别流中顶层 error，不能静默吞掉 S07/S08；
- 区分 finish frame、重复 finish 与携带 usage 的尾帧，保证 usage 只结算一次，缺 usage
  保持 unknown，迟到 usage 归原 attempt；
- 依 [MC-04/06](../../../../../../spec/capabilities/model-execution/v1/contract.md)决定
  success/partial/failed/cancelled/unknown；无 finish EOF、断连或 abort 不能被 framing 成功
  推成模型 success，半份工具参数不能执行；
- 为 `maxBufferSize` 选择有依据的产品容量，并验证溢出处理；本探针未测长行/无限 data；
- 独立完成 A24 deferred receipt 的 wire/路由兼容验证，以及实际 OpenRouter provider、
  cancellation、redirect、费用、真实 usage 与鉴权烟测。

因此本证据不是 A23/A24 通过、真实 OpenRouter 通过、产品 adapter 实现完成、独立架构评审
或最终接受。选定版本发布较新，本次有限场景不能代替后续锁定依赖的产品集成回归。

## HUB 复验与当前采用范围

主调度在 `db106159687450bfda818282da0b7162426751a6` 的独立临时目录，仅使用
归档 tarball、禁止网络和安装脚本，复现正常 12/12 与负控仅 S05 失败；两轮各有
两次实际 loopback 请求。11 份作者清单哈希通过，整合后的文档检查通过 414 份。
[HUB 汇总](hub-summary.json)、[正常原始结果](hub-result.json)和
[负控原始结果](hub-negative-control.json)保存绑定版本、命令、环境与结果。

本次接受为 P4 分帧组件的固定可行性输入，产品根依赖尚未接入；MC 终态、费用、
deferred receipt、长行/缓冲溢出和真实路由继续按原计划实施验证。作者原始结果
保持原运行身份，当前请求计数说明已按真实源码纠正；没有借此增加探针保证。

作者清点及 HUB 核对确认：20 份非缓存临时文件均与已保全输入/结果内容相同，
没有其它独有资产；执行者已释放，进程 cwd/exe/fd 无引用，spoke 已退役。
当时官方网页的原始正文/完整响应头、签名验证原始输出及 attestation JSON
没有落盘，sources.json 保留的是访问元数据与验证摘要；HUB 没有独立重验该签名
结论。初次测量和缺锁文件失败也没有原始日志，保留的修正探针与可重建输入只
支持各自范围。精确组件 tarball、正常/负控和 HUB 实际运行结果仍完整可复现。
