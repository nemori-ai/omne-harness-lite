# 模型消息投影与最终请求的离线计量

先构建本成员及依赖，再执行生产公开函数的计量：

```sh
mkdir -p tmp/session-agent-runtime-phase1/verification
scripts/with-test-slot.sh node --experimental-strip-types examples/model-invocation-minimal-demo/tests/fixtures/profile-message-projection.ts > tmp/session-agent-runtime-phase1/verification/production-projection-profile.json
```

程序构造256、512和1024条同分布日志。它分别计量冷建、追加一条、外部工具键变化后的全量重建、消息列表展开，以及真实Pi transport的OpenRouter请求规划和序列化。它不发送HTTP请求。

程序验证追加访问计数只增加一条、旧前缀引用被复用、源输入不变、重建等于固定前缀投影。消息身份列表由夹具原件独立给出。最终生产序列化必须保留业务提醒，排除attempt事实和其他事实正文。复杂工具、compaction和原模型回复关联由投影包的独立测试负责，本计量不替代它们。

输出包含节点计数、CPU、墙钟、堆增量和消息／请求字节数。堆增量含垃圾回收与共享模块初始化噪声，不是常驻内存上界。缓存显式限制规范化输入字节、条目及块数；上限不能被解释为JavaScript对象堆占用的精确限制。短计时不证明渐进复杂度。

本程序的范围是生产日志投影、缓存和最终模型序列化。它不证明完整模型调用、校准历史、SQL读取、调度或远端服务的总成本，也不证明上游精确token数。生产路径的其他成本须分别计量并注明范围。运行输出属于任务tmp，不提交中间读数。
