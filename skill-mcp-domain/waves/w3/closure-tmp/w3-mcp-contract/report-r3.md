# w3-mcp-contract 第 3 轮交回（#1119 r1，轮次 3）

写者 claude-opus-5-5@high。工作树 `/home/user/omne-harness-lite/.worktrees/w3-mcp-contract`，分支 `PanQiWei/skill-mcp-w3-mcp-contract`，第 2 轮头 `f06b4e632`，本轮头 `c407fab9d`。工作树干净。没有推送，没有开 PR。输入是闭包规格「追加记录」2026-11-04T11:05Z 的 D1–D6。

## 1. 结论

D1–D6 已做完，没有命中停止条件。
- **先红后绿**：新用例在未修的脚本化传输上 15 例红（`red-r2/step3-cases-before-fix.log`），修正后全绿。
- **D1 的违约变体**：评审者的 N2、N2b、N2c、N1d、N4c、N4d、N5c、N6b、N6c 各写成一条源码变异（M87–M95），每条都在补上的用例上变红。D2–D5 另有 8 条变异（M96–M103）。
- **重跑全部变异**：第 2 轮的 M53–M86 在本轮头上全部重跑，其中 10 条的锚点因 D6 拆分改到新位置。51/51 变红。
- **门禁**：最后一次改动之后全部门禁通过。评审者的真管道探针也已复跑，见第 5 节。

## 2. 提交

作者与提交者都是 PanQiWei <594557445@qq.com>。trailer 只有 `Harness: claude-code` 与 `Agent-Role: developer`。

| 提交 | 内容 |
| --- | --- |
| `93d80fca8` | feat：D1–D5 的用例与脚本化传输修正；D6 拆分 `modernPath` 与 `httpAnswer`；根导出 `FIRST_MODERN_PROTOCOL_VERSION`；SPEC 写回 |
| `c407fab9d` | test：套件拒绝列了旧版本的夹具，并加对应用例（D4） |

## 3. 落点

行号按 `c407fab9d`。简写：TT = `src/testing-transport.ts`，ST = `src/testing-scripted-transport.ts`，TC = `tests/transport-conformance.spec.ts`。套件现在 72 例，第 2 轮是 67 例。

| 条 | 落点 | 用例 |
| --- | --- | --- |
| D1-1 重试后核协商版本（N2、N2c） | TT:309 `versionsFrom` | TT:1175「-32022 with supported versions: one retry with the highest version in common, kept by every later request (item 7)」：重试之后的 discover、listActions、call、getTask 都带协商版本 |
| D1-1 stdio 取消通知（N2b） | — | TT:1213「stdio: after a -32022 retry the cancel notification carries the negotiated version (item 7)」 |
| D1-2 显式 HTTP 的旧一路请求头（N1d） | — | TT:933「streamable-http: on the legacy path each request carries the negotiated version in _meta and in MCP-Protocol-Version (item 7)」。它指定 `streamable-http`，不依赖材料次序 |
| D1-3 `call` 与 `listActions` 收到 400 正文（N4c、N4d） | — | TT:540「streamable-http: a 400 whose body is a JSON-RPC error is the error answer of listActions and of a sent call」 |
| D1-4 `getTask` 收到非对象 `error`（N5c） | — | TT:2103 的 `error-missing` 用例加一步：`getTask` 收到 `error: 'not an object'` |
| D1-5 旧版本列表（N6b、N6c） | — | TT:905 依次试三个值：`2024-01-01`（早于列表）、`2025-01-01`（在列表日期区间内但不在列表里）、夹具的现代版本。三者都答 `discover-shape` |
| D2 旧连接的 `_meta` 不声明任务扩展 | ST:547 `envelope`：`clientCapabilities` 随 `_meta` 版本变化，旧版本时用 `LEGACY_CAPABILITIES`；TT:339 `assertEnvelopes` 按版本核（现代版本必须声明，旧版本必须不声明）；SPEC T3 第 1 条 | TT 中「a legacy peer: discover falls back…」「after negotiation every request carries the negotiated version…」与 TT:933 |
| D3 `-32022` 与 SDK 对齐 | ST:490 `supportedOf`（非空文本列表，否则视为没有）；ST:849 `versionRetryOf`（没有现代版本时判旧对端，有现代版本但无共有版本时答 `discover-shape`，有共有版本时重试）；SPEC T3 第 5、6 条，两处差异只剩 `-32020`/`-32021` | TT:1262「-32022 without data.supported, or with legacy versions only, is a legacy peer; a failing initialize is reported (item 7)」；TT:1240「-32022 whose supported lists modern versions but none in common is discover-shape (item 7)」 |
| D3 附带：discover 结果没有共有版本 | ST:810 `probeOf`：判旧对端，与 SDK `classifyResult` 相同 | TT:1145「a discover result with no version in common is a legacy peer: discover falls back to initialize, whose failure is reported (item 7)」 |
| D4 夹具只列现代版本 | `src/revisions.ts:7` `FIRST_MODERN_PROTOCOL_VERSION`，`:10` `isModernProtocolVersion`；TT:250 `withPeer` 遇到旧版本即断言失败；ST:1085 `createScriptedTransportFactory` 遇到旧版本抛 `RangeError`；TC:76 `MODERN_VERSIONS = ['2027-01-01', '2026-07-28']`；SPEC 组合与验证的夹具段 | TC:131「fails each case before it opens a transport」；TC:483「refuses a legacy version among the versions it speaks on server/discover」 |
| D5 HTTP 上 discover 的 404/405 | ST:466 `modernErrorOf`，ST:477 `probeAnswerOf`（低于 500：正文是现代修订错误时按现代一路处理，否则判旧对端），ST:484 `errorAnswerOf`；SPEC T3 第 9 条 | TT:1002「streamable-http: a 404 or 405 answer to discover is a legacy peer unless its body is a JSON-RPC error of the modern revision (item 7)」 |
| D6 两个高 CC 函数 | 见第 6 节 | — |

SPEC 的位置：裁定 19（第 79–83 行）、三个入口表（加 `FIRST_MODERN_PROTOCOL_VERSION`）、T3 第 1、4、5、6、8、9 条与「报哪一条路」一条、T7 `discover-shape`、组合与验证的夹具段。

## 4. 变异表

全量在 `c407fab9d` 上跑，开始与结束时间记在 `red-r2/mutate-r3-full.start`。运行脚本是 `red-r2/mutate-r2.py`：每条改源码，重建 dist，跑用例，再用 `git checkout` 按字节还原并重建。原始输出在 `red/M*.log`，汇总在 `red/mutations-r2.json`，全表在 `red-r2/mutation-table-r3.md`。51/51 变红，退出码都是 1。

本轮新增的 17 条如下。评审变体与变异的对应：N2→M87，N2b→M88，N2c→M89，N1d→M90，N4c→M91，N4d→M92，N5c→M93，N6b→M94，N6c→M95。

| 变异 | 变红的用例（去掉两条违约包装用例，去重） | 退出码 |
| --- | --- | --- |
| M87 N2: tools/call keeps the highest version after a modern retry | T3 -32022 with supported versions: one retry with the highest version in common, kept by every later request (item 7) | 1 |
| M88 N2b: notifications/cancelled keeps the highest version | T3, T5 stdio: after a -32022 retry the cancel notification carries the negotiated version (item 7) | 1 |
| M89 N2c: tasks/* keep the highest version after a modern retry | T3 -32022 with supported versions: one retry with the highest version in common, kept by every later request (item 7) | 1 |
| M90 N1d: MCP-Protocol-Version header is the highest while _meta follows negotiation | T3 -32022 with supported versions: one retry with the highest version in common, kept by every later request (item 7)；T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 after negotiation every request carries the negotiated version, on the legacy path too (item 7)；T3 streamable-http: on the legacy path each request carries the negotiated version in _meta and in MCP-Protocol-Version (item 7) | 1 |
| M91 N4c: a 400 JSON-RPC answer to tools/call is not-sent | T1 streamable-http: a 400 whose body is a JSON-RPC error is the error answer of listActions and of a sent call | 1 |
| M92 N4d: a 400 JSON-RPC answer to tools/list is connection-unavailable | T1 streamable-http: a 400 whose body is a JSON-RPC error is the error answer of listActions and of a sent call | 1 |
| M93 N5c: getTask accepts an error that is not an object | T7 error-missing: failed without an error object, for getTask and getTaskResult; no error is made up | 1 |
| M94 N6b: legacy initialize accepts a version the transport speaks on discover | T3, T7 legacy: an initialize answer with a version outside LEGACY_PROTOCOL_VERSIONS is discover-shape: before the list, between its members, or modern | 1 |
| M95 N6c: legacy version checked by date range | T3, T7 legacy: an initialize answer with a version outside LEGACY_PROTOCOL_VERSIONS is discover-shape: before the list, between its members, or modern | 1 |
| M96 D2: the legacy connection _meta declares the tasks extension | T3 a legacy peer: discover falls back to initialize and initialized (item 7)；T3 after negotiation every request carries the negotiated version, on the legacy path too (item 7)；T3 streamable-http: on the legacy path each request carries the negotiated version in _meta and in MCP-Protocol-Version (item 7) | 1 |
| M97 D3: -32022 without a modern supported version is discover-shape | T3 -32022 without data.supported, or with legacy versions only, is a legacy peer; a failing initialize is reported (item 7) | 1 |
| M98 D3: -32022 supported versions are not filtered to modern ones | T3 -32022 without data.supported, or with legacy versions only, is a legacy peer; a failing initialize is reported (item 7) | 1 |
| M99 D3: a discover result with no version in common is discover-shape | T3 a discover result with no version in common is a legacy peer: discover falls back to initialize, whose failure is reported (item 7) | 1 |
| M100 D4: the scripted transport speaks a legacy version on discover | refuses a legacy version among the versions it speaks on server/discover | 1 |
| M101 D4: the suite accepts a fixture that lists a legacy version | fails each case before it opens a transport | 1 |
| M102 D5: a discover status other than 400 is not read | T3 streamable-http: a 404 or 405 answer to discover is a legacy peer unless its body is a JSON-RPC error of the modern revision (item 7) | 1 |
| M103 D5: a discover body of another status is ignored | T3 streamable-http: a 404 or 405 answer to discover is a legacy peer unless its body is a JSON-RPC error of the modern revision (item 7) | 1 |

第 2 轮的 M53–M86 在本轮头上 34/34 仍然变红。M58–M63、M71–M73、M75 的锚点随 D6 拆分改到新函数里，违约的含义不变。

评审者的 `probe-broken-r2*.mjs` 按 `f06b4e632` 的 dist 字节打补丁，本轮 dist 已变，没有原样重跑。它的 N 变体都在上表有对应变异。

## 5. 门禁

全部跑在 `c407fab9d`，日志在 `tmp/closures/w3-mcp-contract/gates-r3/`，汇总在 `gates.txt`。时间是 2026-11-04 UTC，取自 `date -u`。

| 命令 | 时间 | 结果 |
| --- | --- | --- |
| `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp --force` | 10:52:22–10:52:30 | 退出 0；16/16 tasks；mcp-contract 471 例、mcp 254 例通过 |
| `pnpm run lint:rules` | 10:52:30–10:53:02 | 退出 0 |
| `pnpm run lint:oxlint` | 10:52:30–10:52:33 | 退出 0 |
| `pnpm run lint:deps` | 10:52:30–10:53:19 | 退出 0 |
| `pnpm run format:check` | 10:52:30–10:52:34 | 退出 0 |
| `pnpm run check:docs` | 10:52:30–10:53:00 | 退出 0 |
| `git ls-files --eol \| grep -c w/crlf` | 10:53:21 | 2，同前两轮，是基线里的两份 legacy `LICENSE`，本闭包没有碰 |
| 评审者真管道探针 `probe-pipe-r2.mjs` 复跑（`gates-r3/probe-pipe-r2-rerun.log`） | 10:53:27 | 72 例中 45 通过、4 失败、23 不适用（全是 HTTP 用例） |

**真管道探针的 4 个失败是预期的**：评审者的真管道传输是按第 2 轮规则写的，这 4 条正好是本轮新规则在真管道上抓住旧行为。
- 两条是 D2：「a legacy peer…」与「after negotiation…」，报 `initialize: the tasks extension is declared on a legacy revision`。
- 两条是 D3：「a discover result with no version in common…」与「-32022 without data.supported…」，那个传输答 `discover-shape`，没有回退旧一路。

其余 45 条（含本轮新增的 N2b、N6 两条 stdio 用例与 T5 关闭次序）在真管道上通过。`w3-mcp-host` 的真实传输要按 D2、D3 实现。

## 6. D6：两个高 CC 函数

度量在 `pnpm run metrics --base 1cbee8026` 下得出，日志在 `gates-r3/metrics.log`。拆分只改了结构，行为由 471 例与 51 条变异钉住。

| 函数 | 第 2 轮 | 本轮 |
| --- | --- | --- |
| `ScriptedTransport.modernPath` | CC 19 | CC 3，只剩重试循环 |
| `probeOf`（新） | — | CC 10，对 `Wire` 六种结果的穷尽 `switch` |
| `probeErrorOf`（新） | — | CC 6，现代码、`-32601` 与其余错误 |
| `versionRetryOf`（新） | — | CC 3，D3 的三种 `-32022` |
| `ScriptedTransport.httpAnswer` | CC 14 | CC 5 |
| `refusesAuthorization`（新） | — | CC 3 |
| `authorizationRequired`（新） | — | CC 3 |
| `probeAnswerOf`（新） | — | CC 3，D5 |
| `errorAnswerOf`（新） | — | CC 3 |
| `modernErrorOf`（新） | — | CC 4 |

变更函数里仍超过 warn（10）的有四个，都没有拆，理由如下：
- **`t3Cases`（CC 14）**：它只是用例数组的构造器，复杂度来自各个用例体里的条件，用例之间互不调用。拆开只会把 T3 的用例分散到几个函数里，读者找条款反而更难。
- **`readTaskAnswer`（CC 12）、`ScriptedTransport.deliver`（CC 12）**：都是对封闭联合（`TaskStatus`、`PeerReply`）的穷尽 `switch`，带 `never` 分支。每一臂只有一两行，拆开会让「每种状态怎样读」不再在一处可见。
- **`readTask`（CC 11）**：是 T7 的几条前置检查依次排列，一条检查对应一个 `what`。拆开会把 T7 的对照分散。

## 7. 自定裁定与理由

1. **D3 附带对齐：`server/discover` 的结果读得懂但没有共有版本时，判旧对端并回退旧一路。** 第 1 轮写者曾裁定这种情况直接答 `discover-shape`，那不是 reduce 的已定事项。SDK 2.4.0 `classifyResult` 在可回退时判旧对端。裁定 D3 要求「与 SDK 仍然不同的地方只剩 -32020/-32021」，不对齐这一处，这句话就不成立。
2. **「现代修订」的定义是日期不早于 `2026-07-28`**，与 SDK 的 `isModernProtocolVersion` 相同。这个下界作为根导出常量 `FIRST_MODERN_PROTOCOL_VERSION` 公开，供真实传输按同一规则实现 D3、D4。判断函数 `isModernProtocolVersion` 不导出。
3. **测试夹具列两个现代版本 `['2027-01-01', '2026-07-28']`**，其中 `2027-01-01` 是只有脚本化传输会说的虚构未来修订。原因：只列一个版本时，`-32022` 重试协商出的版本就等于最高版本，N2、N2b、N2c 三个变体都抓不到。真实夹具通常只列 `['2026-07-28']`，这时这几条用例里的版本核对会退化成恒真，用例仍然能跑。
4. **D4 双重把关**：套件的 `withPeer` 遇到列了旧版本的夹具时先断言失败（M101 证明）；`createScriptedTransportFactory` 遇到旧版本抛 `RangeError`（M100 证明）。
5. **D5 只对 `server/discover` 生效，500 及以上的状态仍不在契约里。** SDK 对 5xx 答错误。契约要表达它，需要先定 5xx 在 T1 四种失败里归哪一种，这是新的可加条款，本轮没有写。非 `discover` 请求只读 400 的 JSON-RPC 正文，与第 2 轮相同。
6. **D2 的判断依据是每个请求自己 `_meta` 的版本**，不另设「连接已降级」标志。旧一路的 `initialize` 带旧版本，所以它的 `_meta` 也不声明任务扩展，与 `params.capabilities` 一致。

## 8. 写者声称的结构性改动（供 grep 核实）

- `src/revisions.ts`：新增 `export const FIRST_MODERN_PROTOCOL_VERSION`、`export function isModernProtocolVersion`。根入口只导出前者（`src/index.ts`、`tests/public-entry.spec.ts` 的 `ROOT`）。
- `src/testing-scripted-transport.ts`：
  - 新增 `type Probe`、`probeOf`、`probeErrorOf`、`versionRetryOf`、`supportedOf`、`refusesAuthorization`、`modernErrorOf`、`probeAnswerOf`、`errorAnswerOf`、`authorizationRequired`。
  - 删除 `insufficientScope` 局部变量（`grep -c insufficientScope` 为 0）。
  - `envelope` 按版本选能力。
  - `createScriptedTransportFactory` 遇到旧版本抛 `RangeError`。
- `src/testing-transport.ts`：新增 `versionsFrom`、`lastIndexOf`、`httpError`；`withPeer` 断言夹具版本都是现代版本；`assertEnvelopes` 的任务扩展检查随版本变化；新增 5 条用例（72−67），改 5 条用例。
- `tests/transport-conformance.spec.ts`：新增 `MODERN_VERSIONS` 与两条测试。
- 没有改：`package.json`、`acceptance/`、`schema/`、`documentation.json`、`docs/`、`packages/mcp/mcp/`、`packages/mcp/mcp-host-local/`、锁文件。

## 9. 没有覆盖到的项

- **SDK 对照只是读源码**：SDK 2.4.0 的对照只靠读 `probeClassifier.ts`、`protocolEras.ts` 与 `StreamableHTTPClientTransport` 的源码，没有拿 SDK 客户端对同一脚本做差分运行。
- **HTTP 用例没有真实传输**：真管道证据只覆盖 stdio。23 条 HTTP 用例没有在真实传输上跑过，归 `w3-mcp-host`。
- **5xx 未定**：HTTP 上 `discover` 收到 5xx 时怎样答，契约没有条款（见第 7 节第 5 条）。
- **写范围外的文档**：
  - `packages/mcp/mcp-contract/docs/public-api.md` 仍没有第 2、3 轮的新定义（`revisions.ts`、两个常量、`error-missing`、`ScriptSource`、`PeerRequestHeaders`），交给拥有者或波末写回。
  - 线规格 `waves/w3/mcp/spec.md` 已定事项 7 的文字没有随 D2–D5 更新。
