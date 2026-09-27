# PF017 projection v6 · Docker 提供路径

本版对应PF017 rev5的单机部署、升级和§6.18不停服维护；Docker交付方式由用户明确，技术采用归[D-067](../../../../record/decisions/governance-docker-deployment-adoption/decision.md)。继承[v5](../v5/projection.md)的中心/账号/组织/租户与维护事实，不新增领域身份；容器ID只是部署资源定位。旧投影不改写，本版是Docker增量入口。

不变量/安全：同一中心身份与已确认业务事实跨容器保留；正常关闭没有有限强杀期限，source owner等任务/worker/句柄真实结束后释放；timer不启动已停中心；隔离根与标记不被挂载裁掉；备份成功/失败/未知分开，恢复不直接开放业务。进展以前置的文件系统/IO及Engine可用为条件，没有无限故障下的有限完成承诺。同机副本不兑现整机灾备。

领域操作前后置、拒绝/缺席、共同提交和失败集合继续归EC3 S55–S59及HT3 S20–S21，见provenance精确坐标；Bash不读写业务SQL或复制判定。八fiber与原app静态装配不变。新增Docker文件属于制品/部署适配，不注册service/event；源库/协调锁/备份根仍由原storage和entry owner掌握。跨进程后Engine退出与client退出不等于应用资源已结束，明确ID、实际退出与原结果共同观察。

具体命令、输入、路径、权限、超时/失败、日志、锁及自动恢复前提归已采用的[Docker映射](../../../../realization/apps/tenancy-host/docker.md)，精确快照由D-067固定。模型请求不在本增量。支持关系沿AI3/OG2/OE2/AR2/EC3/HT3，不因Docker迁到OG3或未来资产入口。

实施顺序及判据：①现有host生产清单→两个架构镜像、真实version/BUILD_ID/健康；②固定root helper/非root容器、两Compose、timer/离线任务，配置与隔离负例必须拒绝；③集成后重新生产最终归档、镜像和部署材料manifest，由独立QA跑治理/并发备份/正常停止>31秒/强杀/升级/日志/unknown/两离线任务；④Fable整体review，root核实际证据后才能接受交付。故障环境由独立verification owner先生产，不从旧systemd脚本假定Docker组合可用。

四层状态：既有语义已接受；Docker设计可实施；Docker绑定0；Docker产品验证未开始。已完成机制探针只证明其固定版本范围，不填补第三、四层。公司实际部署、独立灾备、安全再开放和原生amd64性能是保留边界。来源漂移时对照D-067快照复核，发布下一投影版本，不原地覆盖本版。
