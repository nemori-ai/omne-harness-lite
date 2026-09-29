# Anthropic closeout 来源与离线证据

范围与局限归[报告](../../reports/2026-09-29-anthropic-closeout.md)。`sources.json`固定pi及Vercel源码与许可；SDK路径首次404和OpenAPI直接HTTP403也保留，后继正确路径另列。源文件仅供研究，不构成依赖升级。

无凭据重跑（仓库根，Node 24.18.0）：

```sh
node .meta_harness/research/model-request-adaptation/evidence/2026-09-29-anthropic-closeout/probe.mjs
```

`probe-result.json`记录39项断言、精确输入源哈希；执行原函数提取，不冒充完整生产调用。只去TypeScript类型；meter守卫用普通JSON有限数字fixture，无无损大数字、图像解码或真实分词测试。5m不是当前definition已供给值。首次运行在native片段TS类型未去除处报SyntaxError，修正提取器后39项通过，未改生产函数。

网页观察来自报告中直接打开的第一方URL，2026-09-29滚动正文。未下载到的HTTP正文不补造；浏览器读取和源码原件的来源强度分别记录。DSH与omne-next复用前轮固定本地来源，当前本机亲核函数，通用许可缺口如实保留。

无keys、环境文件、付费请求或费用ledger；本包不发布模型配置，不接受策略变化。真实cache、TTL过期、OR upstream body、usage残差与公开/service结果仍待原授权流程执行。
