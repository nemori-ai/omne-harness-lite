# 模型消息投影的算法验证

```sh
python3 packages/core/model-message-projection/verification/models/probe_projection.py > tmp/session-agent-runtime-phase1/verification/projection-probe.json
```

先创建输出父目录。程序以固定seed对简化文本块做冷／热差分，检查旧视图不可变、追加共享前缀、压缩与键／generation失效，以及不同N的访问计数。标准输出为本次结果；不在Git中保存运行输出。

本程序是独立算法模型，不是产品codec或生产实现。它不验证消息Schema、工具配对、字节成本、完整外部键、有界内存或并发发布。真实实现必须另验这些边界，直接捕获最终序列化messages；规模实验比较N/2N/4N，区分冷O(N+B)、热Δ／后缀和输出O(K+B)。

生产源码不得导入本探针。独立参考选择器可以慢，但生产路径不得反复回扫前缀。修改模型时同时核对SPEC中的成本与失效前提，不以短计时宣称渐进复杂度。
