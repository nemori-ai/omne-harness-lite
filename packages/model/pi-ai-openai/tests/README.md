# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

全部测试在快层。它们不起子进程、不开端口、不访问网络，也不等待真实时间。

- 真实依赖：pi-ai-transport 的家族表、网关引擎与 `./testing` 的夹具检查；tokenizer-tiktoken 与 js-tiktoken 的 o200k 秩数据；model-contract 的请求校验与回放投影。没有替身。
- 测试配置在 [support/openai.ts](support/openai.ts)：解码器限额与 10% 余量是测试参数，不是包的默认值。整个测试进程共用一个家族，所以 tokenizer 只初始化一次。
- 请求经 `judgeFixedModelRequest` 构造，所以消息与采用的身份是真实的品牌值。
- 回放夹具的用例表在 [support/legacy-cases.ts](support/legacy-cases.ts)，对照表与有意不同见 [fixtures/README.md](fixtures/README.md)。

两个脚本：

- `pnpm run fixtures` 运行 `support/write-fixtures.ts`，把用例表写成 `fixtures/records` 与 `fixtures/cases`。
- `pnpm run fingerprints` 运行 `support/append-fingerprints.ts`，为新记录追加指纹行。

### 迁入的封存测试

封存件在 `packages.0.0.1.legacy/model/pi-ai-transport/tests/`。下表列出 OpenAI 相关的测试文件与去向。

| 封存测试 | 去向 |
| --- | --- |
| `refusal-stream.spec.ts` | 解码相关的用例迁入回放夹具，见 [fixtures/README.md](fixtures/README.md)。RF-V7、RF-V9 与超大事件不迁入：它们检查连接、取消、计时与 SSE 上限，归共享传输 |
| `openai-encrypted-replay.spec.ts` | 流与第二轮请求迁入 `records/openai%2Fgpt-5.6-{sol,terra,luna}/1`。不迁入：三轮的边际计量、上游输出量的回放估算与校准选择，这些属于不迁入的完整输出组计量 |
| `openai-encrypted-input.spec.ts` | 带加密推理的历史没有估算，迁入 `meter.spec.ts`；可见推理保留估算，迁入同一文件。不迁入：旧定义修订与 `mp4-18` 的绑定检查，本线不迁冻结旧修订 |
| `openai-family-policy.spec.ts` | 型号、强度、图片规则与 Pro 范围迁入 `records.spec.ts`；加密项的分类迁入 `rules.spec.ts`。不迁入：原始工厂输出与旧来源记录，它们只作研究 |
| `official-openai-definitions.spec.ts` | 12 个型号、能力与限额迁入 `records.spec.ts` 与 `profiles.spec.ts`。不迁入：自动缓存 TTL 与不可变副本，缓存不加标记，记录由家族表冻结 |
| `official-openai-routes.spec.ts` | 参数子集、developer 提醒与孤立调用迁入 `records.spec.ts` 与 `plan.spec.ts`。不迁入：跨路由回放被拒，现行契约改为略去并记诊断，见 `cross-family-replay.spec.ts` |
| `openai-astra-images.spec.ts`、`openai-pro-images.spec.ts`、`openai-sol-luna-images.spec.ts` | 补丁规则的金值迁入 `meter.spec.ts`。不迁入：data URL 解码、image-size 读头、单帧 GIF 与 4 MiB PNG 的字节核验，它们归媒体读取（4.4） |
| `openai-input-meter.spec.ts` | o200k 独立向量迁入 `meter.spec.ts`。不迁入：旧绑定、完整请求计量与准入余量，它们归完整请求计量（4.3） |
| `openai-usage-scope.spec.ts` | Pro 的输入范围未知迁入 `rules.spec.ts`。不迁入：观测锚点与读取器修订，它们属于校准 |
| `openai-gpt6-text-meter.spec.ts`、`openai-visible-history-candidate.spec.ts`、`openai-luna-completion.spec.ts`、`openai-remaining-meters-astra.spec.ts`、`openai-remaining-meters-pro.spec.ts` | 不迁入。它们检查旧完整、边际与回放计量的固定样本与旧绑定，属于不迁入的历史计量与可选校准 |
| `openai-output-history.spec.ts`、`openai-family-original-output.spec.ts`、`openai-family-current.spec.ts`、`openai-priority-family-integration.spec.ts` | 不迁入。它们依赖调用方携带的原响应与完整输出组，迁移清单把这些机制标为弃 |
| `acceptance-calibration-openai.spec.ts`、`openai-sol-calibration.spec.ts`、`openai-unbound-calibration.spec.ts`、`openai-calibration.test.mjs` | 不迁入。可选校准归后续校准线 |

### 未覆盖

- 经真实传输与本地 HTTPS 服务的回放、符合性套件 transport 组与真实路由，归后续联调与 #466。
- 解码器不产生 `account` 事实，用量规则只经直接调用验证。
- 带图片事实的表示由测试构造。引擎目前给出的表示没有媒体事实。
