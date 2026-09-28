# 模型适配研究演进

## 2026-09-28：补充输入计量来源

用户要求对新版 Claude 及其他估算路径开展社区／第一方调查；三路分别核对 Anthropic 与 pi/OpenCode/DSH、OpenAI/Google/xAI、DeepSeek/Qwen/Moonshot/ZAI。主线核关键原文并独立重跑作者离线探针，66 项 Claude 历史计数、五类合成文本、名称映射、公开模板与图片尺寸公式结果一致。新增[报告](reports/2026-09-28-input-meter-sources.md)与 241 成员归档；没有新的厂商请求、精度认证或设计采用。之前的缓存、路由和付费实验仍保持原范围。

## 2026-09-27：首两个固定 OpenAI route 复核

新增两条精确route免费GET及官方型号、图像、缓存和changelog原文复核，62工件与原manifest分别保全。保留原生与bridge差别、输入约束未知及条件参数规则缺口；没有填成完整定义或认证。源取得的时刻精度、首次工具失败及有限范围见[报告](reports/2026-09-27-first-two-openai-routes.md)，此前37目录和付费观察不改。

## 2026-09-27：补充

新增此前未覆盖的37项第一方字段重算、222工件字节核验，以及15次OpenRouter非流式reasoning／tools／历史提醒回放样例。原162次缓存暖读、费用未知协调假设和Cordis原型结论保持原run范围；没有推广到完整定义、native-wire、TTL或生产认证。OpenRouter完整Chat schema现可定位developer；原“该次检索未找到”仍为历史检索事实，未推翻一个本来就没有作出的不支持结论。详见[本轮报告](reports/2026-09-27-first-party-and-joint.md)和[来源](evidence.md#2026-09-27-第一方与组合复核)。
