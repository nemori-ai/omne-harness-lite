# Anthropic 缓存投影的窄证据

日期2026-09-29；解释与适用条件见[报告](../../reports/2026-09-29-anthropic-calibration-projection.md)。本目录没有发布契约、模型响应或性能基准结果。

- `sources.json`：本地基线/文件SHA、直接读取的第一方网页及章节、固定pi源码SHA、失败获取与未知范围。网页为滚动版本，不伪造下载hash。
- `projection-demo.mjs`：纯离线演示，从指定SHA的产品`plan.ts`提取真实addBreakpoint函数体，仅去掉已知TS签名；研究投影函数完全独立，不改产品。
- `projection-demo-result.json`：23项有限形状检查与6次append结果；P2标为未验证的上游等价假设，固定数组规避另标为结构观察。
- `validation.json`：来源校验、重跑/语法/JSON/本地链接检查；不冒称模型或完整planner验收。

重跑只需Node，本次v24.18.0。给定与`sources.json`一致的checkout，在新临时位置接收stdout即可；无需build、node_modules或网络。

```sh
node projection-demo.mjs /absolute/matching-checkout > /absolute/task-scratch/result.json
```

脚本先核`plan.ts` SHA，不符即拒绝，不静默测新版本。其JSON canonicalizer只用于这些合成普通JSON形状的等值比较，不是产品的无损JSON实现；未测试超大数字/完整codec。

观察边界：完整wire旧prefix在普通append中0/6相同，P1限定user文本去缓存标记后6/6相同；assistant/tool稳定数组可消除包装差异。这里只证明本地表示关系，没有调用tokenizer/HTTP/模型，没有确认OR服务端归一化，也没有测端到端提速。真实内容、role、工具id、reasoning、未知字段和非法TTL的负控仍可区分。

选定pi原件未整份复制：可从`sources.json`的固定public raw URL取得并核SHA；实验只依赖本项目指定源文件，无须下载pi。临时抓取的pi源码可再生，不是唯一证据；持久事实是版本/URL/摘要及报告中的有界观察。

omne-next参考见报告§5与sources.json：固定commit及现行middleware、装配、测试、设计原件SHA。读取时clean；仅只读，没有运行其测试或改其源码。可在该仓以`git show <记录commit>:<记录path>`复核SHA；未声称远端最新。
