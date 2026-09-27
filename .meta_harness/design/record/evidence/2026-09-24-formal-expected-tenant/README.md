# 预期租户比较与提交保护 · 有限模型及Schema

2026-09-24，主线实跑；候选未接受，独立规格评审进行中。

ExpectedTenant：两个租户、一份共享登录选择、一个固定客户端预期及一个业务动作。
正常配置32 generated / 14 distinct，退出0；去掉比较与去掉保护分别退出12，均违反AppliedExpected。
反例分别为请求前选择已变、比较后提交前选择被另一客户端改动。effect取真实selected，不取负控开关。
模型不含成员授权、登录期限、多个业务效果、真实SQLite、网络、本地CLI状态或通知，不能据此声明生产闭环。

工具沿TLC 2.19 / tla2tools 1.7.4（jar SHA256 936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88），Docker本地JRE镜像ID及精确命令见results.json；不是远端仓库digest。无网络，单worker，日志保留。

entry候选Schema和examples快照22项检查通过，涵盖预期身份的条件必需/禁止、改密输入、两种拒绝及按路由失败码。只检查形状，不检查授权与共同提交。运行命令为 `uv run --locked python tmp/production-cli-onboarding/check-entry-schema.py`，脚本依工作区schema注册表；证据副本不声称脱离仓库单文件可执行。

本包run.py的Docker输入目录是执行时临时目录，模型/配置均已保留；jar按上述固定hash取得后放到输入目录才可重跑。
