# 2026-09-29 校准研究的离线证据

仅实验脚本、原始结果和来源摘要；解释见[报告](../../reports/2026-09-29-prefix-usage-calibration.md)。原始 HUB 临时目录为 `tmp/model-request-runtime/usage-calibration-research/`，源码/已构建依赖在冻结窗口复制，随后释放 HUB 构建。未发 HTTP/模型请求，未读取凭据/账本，未 build/delete HUB dist。

- `trial-{1,2,3}.json`：三个独立进程，每个1次cold first和3次warm。前两次用`bench-v1.mjs`，第三次`bench.mjs`新增 Linux VmHWM 观测；meter代码不变。
- `summary.json`、`summarize.py`：原始汇总与生成脚本；two-plan是算术估计。
- `fixture-meta.json`：准确本地tokenizer计数、合成规则、字节数与最终序列化SHA；不归档3.6MB合成输入，可以生成。
- `source-manifest.json`：67个复制文件的前后SHA、5个源文件SHA、直接依赖各文件SHA；源路径带原实验位置，仅用于追溯。没有归档node_modules或整dist。
- `environment-control.json`：`resourceUsage.maxRSS`继承launcher高水位的阴性对照；该指标不用于归因，第三次`/proc/self/status`的VmHWM可用。
- `math_check.py`：误差重置、aggregate不可辨识和仅旧usage无法准入的有限算术例子；不是形式模型验证。

## 重跑

需 Linux、原实验 Node v24.18.0、基线源码 `846d4c9096f5b4d18d07fa60c5c56cf29f53fe00` 的**独立、已构建 checkout**及原锁定依赖。本脚本不执行安装/build；按仓库开发指南准备独立checkout。编译器或依赖漂移导致SHA不符会拒绝；这比默默用新dist冒充原实验更诚实。依赖的间接依赖由package manager解析，manifest未逐文件封存全部传递依赖，故不是完全密闭环境重现。

```sh
python3 prepare_snapshot.py /absolute/matching-checkout /absolute/new-scratch
node --expose-gc /absolute/new-scratch/snapshot/bench.mjs generate
node --expose-gc /absolute/new-scratch/snapshot/bench-v1.mjs run 1
node --expose-gc /absolute/new-scratch/snapshot/bench-v1.mjs run 2
node --expose-gc /absolute/new-scratch/snapshot/bench.mjs run 3
python3 /absolute/new-scratch/summarize.py
python3 math_check.py
```

核对生成fixture SHA为`3b29f639eae8f8b7a518374ff7e00426a16cd99f2b8d0b004ad15588a8e3fef8`且token数1,001,641。脚本将fixture/results只写新scratch，不修改归档原始值。运行期间冻结依赖文件；外部依赖用已验证路径的链接，不能与安装/替换并行。

复核结果见 `archive-validation.json`：归档哈希、汇总可复现、数学例子及脚本语法检查。后续真实探针尚未运行，本目录不授权付费。
