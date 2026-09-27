# SQLite完整校验与主线程响应 · 2026-09-26

对象：Node24.21.0，macOS arm64与Docker Linux arm64（固定node镜像sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6），1,000,000行、869,015,552字节、三个索引及一条外键的合成文件。脚本及四次运行原文完整保留；临时合成数据库每次finally删除。建fixture使用OFF同步仅为生成速度，不是拟采用生产配置。

直接在主线程运行integrity_check：首次Mac3388ms、Linux3357ms，同一10ms计时器相应延迟3388/3357ms；后续foreign_key_check分别144/110ms。两种检查都返回正常，没有故意损坏输入。

另一次先直接检查、再以单worker检查同一文件：Mac worker约5040ms后实际exit，期间主线程439次计时器tick、最大间隔22.2ms；Linux约3116ms退出、222次tick、最大间隔87.2ms。结果消息先于exit；Mac两者约44.5ms差。原始日志精确值优先。两次方式受缓存/宿主调度等影响，不作吞吐优劣比较，只观测主线程仍能调度。

官方采用版本文档通过Docker Node fetch取自https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/worker_threads.md，原文已存：exit是worker停止后的最终事件，消息先于exit。web工具官方API页面不可访问，未用它作为可读来源。

局限：这不是产品worker实现，没有真实员工HTTPS请求、clock续约、故障退出/取消、低速磁盘或并发负载。最大间隔不是SLA。不能从此推出任意文件/设备/OS下一样可用，更不能以消息代替真实退出。消费者为storage-sql维护执行绑定，方案采用另归design决定。
