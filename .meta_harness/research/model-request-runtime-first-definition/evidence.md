# 可复核的来源与观察

## 第一方刷新

- 精确对象：`openai/gpt-6-sol`、所选 `/data/endpoints/1/tag = openai`；snapshot 2026-09-28，endpoint body SHA256 `01a5532f0e23e9cf1c7109d42adbdf650dca3a58b029a1401a3e94c2ed423db1`。
- 来源：[OpenRouter endpoint](https://openrouter.ai/api/v1/models/openai/gpt-6-sol/endpoints)、[Sol型号页](https://developers.openai.com/api/docs/models/gpt-6-sol)、[GPT6指南](https://developers.openai.com/api/docs/guides/latest-model)、[图像指南](https://developers.openai.com/api/docs/guides/images-vision)。来源立场为厂商文档/元数据；不是本次执行验证。
- 取得方式：精确 endpoint 一次无Authorization GET，HTTP200，02:46:33 UTC；无凭据访问、无重试、无重定向。官方文档用 OpenAI documentation MCP search/fetch；JSON工具结果完整保留，取得日期2026-09-28，未提供工具独立时间戳。脚本、收据、原始body、工具结果及派生Markdown均在原件包内。
- 输入坐标：endpoint `/data/architecture`；所选 `/data/endpoints/1/max_prompt_tokens`、`max_completion_tokens`、`pricing`、`supported_parameters`、`supports_implicit_caching`。型号页 Current snapshot details、reasoning.effort 和函数调用说明；GPT6 guide Update API and model parameters/Unsupported parameters；image guide Image input requirements。
- 支持范围：这些源声明的身份、能力、数值、价格及限制条件；不证明桥接域全值兑现、媒体传输、真实缓存命中/到期、实际费用或formal official供给。

恢复：在空临时目录解包 `primary-facts-2026-09-28.tar.gz`，按包内 `MANIFEST.json` 核每成员byte数和SHA256；外层按[SHA256SUMS](SHA256SUMS)核归档。manifest及外层provenance不互相自指。

## 既有事实复核

既有commit `474966ad82e4768f00adf8887156941a6af78c38` 的[原件归档](../model-request-adaptation/first-two-openai-routes-2026-09-27.tar.gz) SHA256 `f7f4509648450cb30db1f0079e9ba8110afe961ea47724d65725bef5fdfa038d`，原manifest 62工件逐byte及摘要核对，无不一致；manifest自身作为第63成员保留。此次新包只含新刷新和交接，不复制一份旧研究权威。对该旧run的缓存和账务没有改写或新增执行。

## 未执行与资源状态

无模型POST、无环境密钥读取、无受控server、无Agent/连接池或lease；HTTP GET已完成。FD2/FD3依赖合法全定义，未运行；没有以fixture伪造成功。没有源码变更，未运行pnpm build/type/tests或全仓检查。事实包摘要与来源恢复核对只支持归档完整性。
