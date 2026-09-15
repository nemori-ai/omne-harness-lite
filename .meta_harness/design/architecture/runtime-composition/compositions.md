# 共同提交与释放视图

发布提交必须同时确认精确 preparing 尝试、稳定 owner、Factory/必要资源、当前权限和 Session attachment，且撤销不能穿过检查与 ready 设置之间。
任何异步 I/O 在门外准备；提交内不等待、不调用插件回调。发布后通知可以失败，但不否决已提交事实。

退出按消费者先于提供者的真实使用关系释放。attachment 结果未知时保留原责任；旧 release 只能作用于原 registration，不能撤掉新代际。
计划卸载先协作收口，异常丢失封闭受影响准入并报告失败/未知；依赖恢复不会复活旧实例。

精确规范见 [binding v1](../../spec/compositions/agent-session-binding/v1/contract.md)，provider 落点见 [core-agent](../../providers/core-agent/design.md)。
