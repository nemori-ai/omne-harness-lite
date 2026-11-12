# acceptance

本目录承载独立验收者维护的场景、操作说明与固定输入。

## 允许的内容

可执行场景 `*.acceptance.ts`、操作说明，以及 `fixtures/` 下的固定输入。

## 边界

验收文件归负责的人与验收角色，实施角色只运行、不修改。有可执行场景时，包根必须有 `vitest.acceptance.config.ts` 与 `package.json` 的 `acceptance` 脚本；只有本目录的入口文件时，不要求配置，测试运行器也不选本包跑验收。

## 维护

写入第一个场景时，由验收的拥有者一并加入配置与脚本。

## 本包事实

本成员是纯契约成员，没有可运行的服务，所以没有验收场景。对本成员的独立核对经两条路：纯函数与包格式规则的测试在 `tests/`；端口实现方用 `./testing` 导出的符合性套件证明合规。可运行的验收场景随通用实现成员 `@omne-harness/skill` 与本地宿主 `@omne-harness/skill-host-local` 建立。负责人：PanQiWei。
