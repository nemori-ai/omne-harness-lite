# Stream 冻结数组结构探针（2026-09-26）

实施者真实执行的两轮探针原件、第一轮勘误与范围登记。来源为 core-delivery-stream-assembly 工作树 a5c54b15 基线上临时脚本；逐文件摘要见 [scope.json](scope.json)。主调度独立复制并核字节；评审未运行产品符合性测试。

- [第一轮脚本](array-probe.mjs)、[原结果](array-probe.json)、[勘误](array-probe-errata.md)。直接数组槽查找、从已有 snapshot 建 settlement、未事后 GC 的堆差，不代表真实索引查找／直接 closeOut／稳定保留量。
- [第二轮脚本](array-probe-v2.mjs)、[原结果](array-probe-v2.json)。用 ExactDecimal 数学等值 findIndex，两读各自从 records 迭代物化；填序列最多查前256块，大规模并非最坏查找；堆字段如实为第二次 GC 前差。

两轮都只是冻结记录数组／共享片段链的结构观察；没有 AR／CB 判定、工具参数解析、语音或完整产品行为，没有成熟持久集合对照。不能据此宣称性能达标、形式证明或实现已接受。主调度在独立架构复核后采用最小结构及相应复查条件，映射见 [Stream 设计](../../../realization/packages/core/stream-assembly/design.md#2026-09-26-实施结构补正冻结数组与共享片段链)。首次真实实现必须另测实际 accept、直接 closeOut、密集快照、语音、参数封口及多份旧状态保留。

原脚本保留原相对导入。复跑时先从固定基线构建 Call Accounts 与 Content Blocks 的公开产物，将脚本原字节恢复到检出根 `tmp/w6-stream-assembly/`，再在该检出根按 scope.json 的命令运行；不要直接从证据目录执行而误用不存在的相对依赖。
