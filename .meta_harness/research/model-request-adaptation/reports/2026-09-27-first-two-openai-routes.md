# 首两个 OpenAI 固定 route 的第一方复核

2026-09-27。结论：两个固定目标的原生页及唯一所选 openai route 对身份、输入/输出模态和两个独立 token 上界提供直接值；逐图字节限制和部分参数条件仍未闭合，完整正式定义及认证仍为0/2。消费者为 model-request-runtime 纵线的 official definitions 与认证。调查不选择项目新政策，不把原生字段当 bridge 执行证明。

## 对象、取得与完整性

对象为 openai/gpt-6-sol@openai 与 openai/gpt-5.6-luna@openai，不替换型号或供应商。作者在HUB b20c408b开始；主线在ac977b7a读回其冻结62工件及全部来源摘要。实际新取得为2次不加载凭据的精确 endpoint GET，两次HTTP200、2026-09-27T23:30:08 UTC；官方文档由OpenAI documentation MCP取得Markdown/工具表示。初次型号页调用只记日期、没有独立时间戳，不能补成精确时刻。

[原件归档](../first-two-openai-routes-2026-09-27.tar.gz)含62工件及原SHA256-MANIFEST，共63成员、463186字节；SHA256 `f7f4509648450cb30db1f0079e9ba8110afe961ea47724d65725bef5fdfa038d`。原manifest SHA `41e2e353117c07fb30948dcb315ec1d542e24aa9b4c2ad8cab91c922727879a5`。主线解包逐项核字节数/摘要成功；原REPORT.md、FACTS.json、SOURCES.json、收据、脚本、首次工具失败与27个 prior 原件在包内，未改作者原字节。归档不含后来另写的设计边界读数或当前预算账本副本。

## 有直接来源的观察与不能填的字段

两个原生型号页与所选endpoint均直接给独立输入922000、输出128000；没有从总窗口相减。两页声明text/image输入、text输出；媒体声明不证明指定bridge已能消费媒体字节。逐图maxImageBytes未取得精确承诺，512MB总请求和30000patches/图不能代填逐图限制，也不能据小图成功宣称没有约束。

[Sol型号页](https://developers.openai.com/api/docs/models/gpt-6-sol)、[Luna型号页](https://developers.openai.com/api/docs/models/gpt-5.6-luna)及[SOL endpoint](https://openrouter.ai/api/v1/models/openai/gpt-6-sol/endpoints)、[Luna endpoint](https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints)的取得方式、原文件与JSON pointer在归档索引中。参数名出现不证明逐值支持域；未列不证明不支持。Sol采样参数与reasoningEffort有关的条件不能由相互独立的rule暗中表达，Luna精确条件未核实，不能照抄前代或兄弟型号。

## 缓存及版本复核信号

[原生缓存文档](https://developers.openai.com/api/docs/guides/prompt-caching)与[OpenRouter缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching)必须分别消费：本次原生显式TTL声明不能当成bridge通用块cache_control.ttl采纳，OpenRouter对OpenAI该块TTL的处理在原文索引中保留。automatic策略与显式配置、端点supports_implicit_caching元数据、实际暖读三者不能互换；本次没有模型请求、缓存命中或到期实验。

[官方changelog](https://developers.openai.com/api/docs/changelog)Sep25的图像编码修复是后续视觉验收的版本复核触发；未观察所选bridge部署，未据此证明以前样例失效。原生缓存lookup范围另有两次资料不一致的信号，保留为未闭事实，不据搜索摘录复刻机制。

## 有限范围与后续消费

本次新增付费0、无凭据访问/POST/重试；Chat reference MCP404、旧web入口错误均保全，失败不证明API不支持。此前暖读和研究账务仍在原run，归档不重置campaign预算。没有完整参数连续域、输入边界、native-wire、ordinary reminder优先级、当前公开流式制品或任何official认证。

后续所需证据是指定route参数条件、输入限制与实际媒体承载、当前公开路径的自动缓存及普通提醒；有限样例不推成全域事实。模型/route/native/gateway/账号或缓存文档变化触发复核。首次事实核验的判断保持未知，不能为进度填默认或谎报完整定义。
