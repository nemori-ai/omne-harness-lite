# D-019 追加：fork 基线与托管（2026-09-25）

产品负责人裁定（[D-063 R-5](../assets-runtimes-rulings-2026-09-25/README.md)）：

- **基线**：pi 0.86.1，提交 `3390bd9`（本机存档 `tmp/sources/`，SHA256SUMS 在案）。
- **托管**：fork 作为本 monorepo 里一个包（候选路径 `packages/model/pi-ai-transport`，名字随节点立时定），许可文件随包记，上游追踪只按需要同步。
- **范围**：只取传输一层（请求发出、流片段接收、供应商错误映射）；流片段语法按 D-035 借用；其余 pi 代码不进来。
- **后果**：MRR 节点缺口 MRR-N4 有了闭合路径，真实供应商调用进实施程；`capability.model-request-runtime` 的传输适配从「内部依赖」改为可替换的公开构件（SYS-OPEN）。

D-019 的比较门（`gate-status-2026-09-23.md`）不改写；本页只追加。
