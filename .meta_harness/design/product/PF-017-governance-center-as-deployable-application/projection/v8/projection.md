# PF017 projection v8 · 健康探针同进程公开CLI调用

对应PF017 rev5，继承[v7](../v7/projection.md)的所有领域、部署和停止保证，仅由[D072](../../../../record/decisions/governance-docker-health-binding/decision.md)精化健康包装器调用路径。不新增领域对象、能力、契约、Fiber或存储；公开CLI main为原入口，客户端仍用原Unix socket和HT3。

探针由Docker exec启动，在同一进程调用原main及ops full-health参数，不产生CLI后代。5秒期限含动态加载，调用前与结果成功前核单调截止；MainIo.shutdownSignal沿既有AbortController关闭读socket。64KiB按字节累计，严格体检及失败集合保持，完成/错误清理自身计时器。绑定权威为[当前节点](../../../../realization/apps/tenancy-host/docker.md)，本投影只记录快照。

顺序：局部源码/公开main真实socket与截止清理检查→整合和新制品重建→独立最终镜像正常健康及请求在途时Docker较短外期限取消/无后代/断开→Fable定向复核与root接受。源码不变的旧证据只保持原覆盖，不迁移BUILD或虚称新执行；旧I3已运行范围保留。设计接受不表示实现/验证完成，公司实装与独立灾备等既有边界不变。
