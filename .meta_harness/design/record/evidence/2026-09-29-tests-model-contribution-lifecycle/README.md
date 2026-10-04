# 模型贡献热更新、自定义及等待状态实际验收

2026-09-29。root依用户完整纵线技术验收委托，核对独立逐门结果及HUB复验后，接受本轮D4模型贡献范围。新绑定0；这不是十三操作整体、D6、逐模型D7或用户最终签收。未来修改对应实现须重验受影响门。

## 输入与原始结果

[inputs.json](inputs.json)保存精确源码修订、命令、环境和逐文件SHA；`inputs/`保存三份实际测试输入和独立接受依据，完整源码从相应Git提交重现。`outputs/`保存未改写的独立及HUB输出。独立原始失败/临时数据库、TLS材料及负控制品仍由主线私有退役归档保全；本包不发布凭据或数据库。

HUB结果：生产transport贡献7测、真实应用scope2测、实际等待/冷恢复2测均通过。独立两项行为变异（旧lease错取新phi、忽略basis身份）由正常对照通过而各自AssertionError检出；原dist未改。包类型及构建范围沿[独立首批报告](inputs/independent-README.md)，本包不把spoke构建伪称HUB全量构建。

## D4逐门接受范围

| 门 | 实际事实 |
|---|---|
| 纯入口/可信官方与自定义 | 公开root/plugin import零网络；真实Cordis、官方Claude贡献与声明式custom scope，actual public/service同生产wire与binding |
| 原调用固定/新调用换代 | 原A lease在B登记、A退役后仍固定原plan/reader/phi/全部binding；新basis用旧锚全量重算；无隐式版本回退 |
| 实际排空/撤除/部分失败 | 真实TLS reader、回调/引用保留、force只发取消，实际完成后一次cleanup；失败新fiber不遮旧pending |
| 组织/租户/配置/凭据 | 真实SQLite目录及成员邀请/加入/撤销、登录撤销，跨组织租户拒绝、配置历史不变；凭据轮换新读新值、旧已取得值不变；错误scope不启用source |
| 取得结果三分 | 实际service非法配置invalidInput、缺定义unavailable、合法配置真正发送结算；拒绝零HTTP和零模型锚 |
| 三等待状态 | awaiting_decision、reply_pending、resumable均保留原生产registry引用，原贡献退役等待；结算或原调用交回后实际排空 |
| 冷恢复旧精确绑定 | 独占真实worker SIGKILL并观察exit/close/socket结束；只有B时reconcile不发请求且旧A续接拒绝；恢复A后原callId与完整旧快照续接，不读取当前选择B替换历史 |

后四项历史义务的精确说明及首次失败保留见[独立补充](inputs/independent-followup.md)。没有通过更改产品或降低断言使本验收通过。

## 前提与不承担的声明

这是有限实际场景，不是形式证明。TLS服务在本机、凭据是测试值，无付费OpenRouter调用；37型号认证另做。reader为同binary中随原plan固定的生产实现，未承诺任意JS模块在线补丁。当前目录底层scope读并非登录认证API，撤销检查使用实际写入/应用准入，不凭scope可见性推断授权。

生产Run终结、真实卡片和完整Loop不在D4；冷恢复的退出事实只认该测试独占启动并已观察结束的精确worker，不能推广成任意进程恒真。此scope接受不抹除整仓实现映射元数据检查的既有失败。
