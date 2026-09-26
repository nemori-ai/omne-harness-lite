# PF016 rev7 · 可搬运文件CLI与实际中心进程

2026-09-25，接[v3](../v3/projection.md)既有治理CLI行为；D050只补编译模块闭包、完整归档独占发布及纯BUILD_ID显示，无新领域对象、契约操作或Cordis运行时结构。CQ1/CG2/CLS1条款、失败次序与身份固定规则不变，v3仍是行为投影依据。

打包先构建CLI依赖，再收集生产包；执行者保持源/dist稳定，工具核锁/config不变。递归核文件/相对链接，完整归档后link独占目标；已有目标拒绝，输出失败可能已发布，不能删除或声称未发布。临时目录归工具；SIGKILL可留暂存，不保证无法执行的finally。文件摘要不认证来源；Node24.21.0为运行前提，无自动安装/迁移/上传。详见[packaging](../../../../realization/apps/cli/packaging.md)及D050。

实施判据：实际tar/link与故障控制、解包清单/BUILD_ID重算、仓库外实际客户端连接独立keygen/serve中心进程。已在macOS arm64、Linux arm64/amd64实现对应运行，89项应用测试，正式凭据成本、正常重启与SIGKILL重启保持身份并拒绝旧登录。运行包2026-09-25-tests-cli-portable-host限定单OS/container loopback，不是物理机损毁或服务管理器安装。

下一步仍为TUI、员工安装与中心部署服务管理、每日备份及安全恢复；旧TTY密码候选的帧可信性未闭。§14 canonical候选B因为长输入时身份滚出屏被否，不能为缩短交付削减PF016 §6.3。新的终端适配器必须另审再实施；不以本版投影宣布完整目标完成。
