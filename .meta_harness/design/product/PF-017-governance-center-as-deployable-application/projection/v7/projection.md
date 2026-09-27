# PF017 projection v7 · Docker 正常终止与退出核对

对应 PF017 rev5，继承[v6](../v6/projection.md)的部署边界；原R4技术选择由[D-070](../../../../record/decisions/core11-integration-coordination/decision.md#docker-r4)承接，三处停止控制绑定由[D-071](../../../../record/decisions/governance-docker-stop-adoption/decision.md)取代。不是新产品政策或领域状态，不改变 EC3／HT3 及租户／维护身份。

正常停止发一次显式TERM并等待实际退出；Engine受理、调用方退出与应用完成分别观察。完整wait退出码须与同ID的exited／ExitCode一致，空值/丢回执/矛盾保持unknown；初始exited不通过start补造意图。start失败同样等待，最终事实写stderr且start非零。离线任务具名Compose run、restart=no，已真实完成按原JSON/退出码结算，未知不重放或删除。配置、接口及细节只有[节点映射](../../../../realization/apps/tenancy-host/docker.md)一份权威。

不变量保持：正常IO没有强杀期限；资源实际结束前不释放owner；业务已确认持久性及隔离恢复不因Engine前提减弱。跨daemon人工停止标记依赖健康元数据、无并发shutdown或外部管理；clean0不是其无条件耐久证明。固定源码和V5 checkpoint反例支持这一限制，具体并发shutdown输出未测。没有新增服务、存储或第二重启管理者。

I2按固定快照修helper/Compose/操作说明与反例测试；整合后I3重新构建两架构最终制品，独立QA实际跑治理、长IO/关闭残余/第二owner/停止未知、timer、离线并发与取消，Fable审整体目标与实践，root决定最终接受。先导run不迁移BUILD_ID；amd64仿真按实际范围标注。当前语义与设计已接受，最终R5绑定和产品验证待完成；公司真实部署与独立灾备仍未验。精确输入归provenance，旧projection不覆盖。
