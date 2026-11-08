# 计量快照模型与源码映射

本模型对应 [SPEC](../SPEC.md) 的完整计量输入一致性。[证明](proofs/measurement-snapshot.md)给出逐动作人工归纳；[模型](models/measurement/MeasurementSnapshot.tla)定义行为。它不证明供应商算法或tokenizer实现。

| 模型状态或动作 | [measurement.ts](../src/chat-completions/measurement.ts) 的实际对应 | 责任 |
| --- | --- | --- |
| external | 调用方交入的measure与calibration，包含全部嵌套数据 | 调用方可在首await后修改自己的对象 |
| Begin、owned | measureCalibrated在await前对消费facts与calibration执行structuredClone | transport拥有本次调用的自有值；未消费的assembled不进入快照 |
| countSource、CountFinished | calibratedAmount消费owned.tokenInput、units、calibration与media，再await tokenizer | family/transport拥有计量语义，tokenizer只计给定序列 |
| Digest | calibratedDigest读取同一measure与calibration快照 | 摘要来源与计数来源一致 |
| Checks | inputCheck和exactChecks读取同一measure快照 | context、limits、supplier、media、requestBytes不会因外部mutation改变 |
| Mutate | 任意调用方异步修改，模型可在每两步之间发生 | 无需假定调用方对象在等待期间被冻结 |

规则配置与函数是提供者能力，不是本次输入数据。它们必须保持本次调用的规则含义。主体身份不在本模型中，也不克隆或序列化principal。Model.acquire对完整profile的自有快照属于 [Model preparation](../../model/src/preparation/resources.ts)，必须在第一个供应商异步取得之前完成。RQ还有自己在复用key之前取得快照的义务，不能以transport已经快照取代它。

## 执行

设置 `TLA2TOOLS_JAR` 后，在仓库根运行。输出目录必须尚不存在。

```sh
python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/model/pi-ai-transport/verification/models/measurement tmp/tokenizer-formal-snapshot
```

共用runner仅提供工具执行与严格判读，不拥有本成员语义。它固定一个TLC worker、768 MiB堆和每配置120秒上限，保存输入和工具摘要、命令、输出与退出码。完整说明见 [runner拥有者](../../tokenizer-tiktoken/verification/formal-mapping.md#可复跑入口)。

[expect.txt](models/measurement/expect.txt)逐项列出结果。positive将四个输入分量各取0/1，并允许任意外部mutation。bad-live-digest在await后从external生成摘要，必须命中DigestSnapshot；bad-live-checks从external生成预算检查，必须命中CheckSnapshot。正控要求退出0及TLC完成文字，负控要求退出12及指定不变量违例。

[chat-completions-measurement.spec.ts](../tests/chat-completions-measurement.spec.ts) 的异步mutation场景承担实现符合性。源码负对照、单次结果和源码修订留任务tmp，不能把模型变异当源码变异。模型不做TypeScript精化、结构克隆运行时、哈希抗碰撞、序列化键序、校准算术、BPE或完整应用性能证明。
