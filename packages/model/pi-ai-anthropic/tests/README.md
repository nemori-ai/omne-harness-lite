# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

除下面两个慢层文件外，全部测试在快层。快层测试不起子进程、不开端口、不访问网络，也不等待真实时间。它们读取本包的 `claude.json`。

慢层有两个文件：

- `two-families.spec.ts`：用 openssl 子进程生成自签证书，启动本地 HTTPS 服务。本家族与 OpenAI 家族经同一 `composeFamilies` 交给真实的 `createPiTransport`。服务按请求体的型号回放两家每条记录的 `stream.sse`。用例核对发出的请求体等于 `request.json` 的 `body`，事实序列等于 `facts.json`，并对两家各一条记录运行符合性套件 transport 组。OpenAI 的夹具经开发依赖 `@omne-harness/pi-ai-openai` 的链接目录读取。计数发出次数用凭据槽的读取次数：传输只在 `start` 的同步调用中读取凭据一次。证书与服务的辅助代码在 [support/https-server.ts](support/https-server.ts)。
- `examples.spec.ts`：设置 `OMNE_LIVE_TESTS=1` 时，在子进程中运行两个示例，示例经 `HTTPS_PROXY` 向 OpenRouter 发出真实请求。没有设置时，它在运行时跳过。跨家族示例的期望 `replay summary:` 行不写死：用例按示例打印的 `reply state:` 行推出它们，所以上游是否返回推理状态不决定机制检查的结果。第 1 至 3 轮中某个家族没有一次回复带有推理状态时，用例失败，并说明这个家族的略去与带回路径没有得到检验。

- 真实依赖：pi-ai-transport 的家族表、网关引擎与 `./testing` 的夹具检查；tokenizer-tiktoken 与 `claude.json`；model-contract 的请求校验与回放投影。没有替身。
- 独立对照：`meter.spec.ts` 用 js-tiktoken/lite 直接载入 `claude.json`，核对特殊 token 字样的计数；用封存件记录的 @anthropic-ai/tokenizer 0.0.4 参考值 150 核对经 tokenizer-tiktoken 的计数。js-tiktoken 只是测试依赖。
- 测试配置在 [support/anthropic.ts](support/anthropic.ts)：解码器限额与 10% 余量是测试参数，不是包的默认值。整个测试进程共用一个家族，所以 tokenizer 只初始化一次。
- 请求经 `judgeFixedModelRequest` 构造，所以消息与采用的身份是真实的品牌值。
- 回放夹具的用例表在 [support/legacy-cases.ts](support/legacy-cases.ts)，对照表与有意不同见 [fixtures/README.md](fixtures/README.md)。
- 跨家族历史用纯数据构造：OpenAI 的消息只是带 OpenAI 回放范围与格式的 assistant 消息，`cross-family-replay.spec.ts` 不导入 OpenAI 家族。只有 `two-families.spec.ts` 导入 OpenAI 家族。

两个脚本都从 `dist` 载入本包，运行前先构建（`pnpm turbo run build --filter=@omne-harness/pi-ai-anthropic`）：

- `pnpm run fixtures` 运行 `support/write-fixtures.ts`，把用例表写成 `fixtures/records` 与 `fixtures/cases`。
- `pnpm run fingerprints` 运行 `support/append-fingerprints.ts`，为新记录追加指纹行。

### 迁入的封存测试

封存件在 `packages.0.0.1.legacy/model/pi-ai-transport/tests/`。下表列出 Anthropic 相关的测试文件与去向。

| 封存测试 | 去向 |
| --- | --- |
| `anthropic-family-current.spec.ts` | 三轮的流、请求与回放迁入 4 组记录夹具；未签名组、`[REDACTED]` 与拒绝文本迁入用例夹具；它们的下一次请求迁入 `cross-family-replay.spec.ts`；纯图片缓存迁入 `plan.spec.ts`；图片块估算迁入 `meter.spec.ts`。不迁入：经 Cordis 租约的三轮（服务登记归 model-host-local）、旧档案的缓存配置（缓存 TTL 现在是记录数据）、语音与视频（投影在发送前拒绝）、三轮的边际计量（完整输出组计量不迁入） |
| `anthropic-stream-late-signature.spec.ts` | 改变本家族结果的拼接用例与两轮回放迁入用例夹具与记录夹具，见 [fixtures/README.md](fixtures/README.md)。其余拼接规则归引擎，由 pi-ai-transport 的解码测试覆盖 |
| `usage-anthropic-public.spec.ts` | 缓存读写的用量迁入用例夹具 `usage-cache-read-and-write`。不迁入：观测锚点与校准 |
| `https.spec.ts` 中的余量为负 | 迁入用例夹具 `usage-negative-remainder` 与 `rules.spec.ts` |
| `official-anthropic-definitions.spec.ts` | 4 个型号、能力与限额迁入 `records.spec.ts` 与 `profiles.spec.ts`。不迁入：缓存配置的旧校验 |
| `official-anthropic-routes.spec.ts` | 固定服务方、`user` 提醒与参数子集迁入 `records.spec.ts`、`plan.spec.ts` 与回放夹具的请求体。不迁入：旧档案的离线合成与经 HTTPS 的发送。经真实传输的联调见 `two-families.spec.ts` |
| `anthropic-replay-policy.spec.ts` | 可以回放的项与反例迁入 `rules.spec.ts`。签名前缀的型号不迁入，见表后说明。旧工厂依据与输出组贡献也不迁入 |
| `anthropic-input-meter.spec.ts` | 独立参考值、特殊 token 文本、图片金值与签名组没有估算迁入 `meter.spec.ts`。不迁入：旧绑定检查、请求控制成员的过滤、data URL 与 MIME 核验（媒体读取归 4.4）、准入余量（完整请求计量归 4.3） |
| `anthropic-cache-target.spec.ts` | 文本与图片混合时标记在文本上，迁入 `plan.spec.ts`。空文本的用例（`:91-95`）也迁入 `plan.spec.ts`：引擎照原样写出空文本，所以图片加空文本的末条 user 消息不是只有图片的消息，没有标记位置。封存件不加标记，引擎返回 `unsupported`（`no-cache-target`）。这是引擎的行为，本包不另加规则 |
| `shared-family-cache-projection.spec.ts` | 不迁入。缓存标记由引擎按记录放置，本包不移除或改写标记 |
| `anthropic-output-history.spec.ts`、`shared-family-output-history.spec.ts`、`anthropic-family-public.spec.ts` | 不迁入。它们依赖调用方携带的原响应与完整输出组，迁移清单把这些机制标为弃 |

签名前缀的型号：封存件要求 `claude-opus-5.5` 与 `claude-fable-5.1` 有签名前缀，否则关闭推理。按项目约定，记录不关闭推理，所以这项检查不迁入。`cross-family-replay.spec.ts` 改为核对外来工具轮次之后保持请求的推理强度。依据：2026-10-22 经代理实测，网关在推理开启时接受外来工具轮次，这两个型号拒绝关闭推理，记录在 [#465 的实测记录](https://github.com/nemori-ai/omne-harness-lite/issues/465#issuecomment-6341479528)。

### 未覆盖

- 真实路由没有持续验证，示例只在手动运行时有证据。Model 的发送边界经本地凭据与本传输的组合尚未实现，归父卡 2.6（#466）。经本地 HTTPS 服务的回放与符合性套件 transport 组见 `two-families.spec.ts`。
- 带图片事实的表示由测试构造。引擎目前给出的表示没有媒体事实。
- 网关对 `reasoning.enabled: false`、推理开启时的外来工具轮次、图片 `detail` 与空 assistant 内容的接受没有持续验证。
