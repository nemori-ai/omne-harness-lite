# 同会话模型切换与 demo 恢复宿主有限验收

2026-09-28，主调度在 model-request-runtime HUB 实际执行。新增模型生产认证0，真实付费请求0，新增bindings0。

源码226257ce：demo build/typecheck通过，22文件89测试通过；OS PTY通过。同一会话先Pro-0813后V4.1 Flash，实际受控TLS请求model字段改变、完整先前user/assistant/推理历史保留；重开仍为Flash。查询、未知命令、错误参数与失败选择不发HTTP；流输出、累计真实fixture usage/cost、Ctrl+C物理停止、503安全退出及raw mode恢复通过。两模型属于demo显式部署，不声称37模型就绪。启动读取异常仍关闭资源有单独回归。

源码3974433b：追加恢复时先停实际host再等待在途dispatch，避免app.close与reconcile等待持有HTTP的相互阻塞。build/typecheck通过，22文件90测试通过；真实TLS保持响应未结束，恢复后实际socket关闭，原调用interrupted，关闭完成，仅1个HTTP请求。该后继没有修改交互命令/模型配置/PTY脚本；PTY证据精确归前一个源码提交，不改写为新提交实跑。

恢复宿主还验证同代际已停且released原容器的完整原批重复认回、同session准入封门、其他session读取和JSONL未知写者留责。不能据此声称冷进程退出证明、未released旧owner交接、withRun/G28或完整十三操作已验收。CLI本轮没有自动恢复/重试命令。

保留失败：首接口56f588e6尚未合入UI消费者时，全套82通过/3交互失败（含SIGINT等待超时）；其旧demo未attach宿主。后续统一消费者后上述全套通过，旧日志未删除。spoke另修复异步启动查询前创建readline导致预先到达输入丢失，作者交接保全在main tmp退役归档，主线最终场景覆盖该路径。

## 可复跑入口

仓库根依次运行：

```sh
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo build
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo typecheck
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo test
python3 examples/model-invocation-minimal-demo/tests/pty-check.py
```

以上仅本地受控TLS，不读取生产密钥。附inputs.json列源码与测试SHA，manifest.json核本包全部原始日志及说明。既有真实OpenRouter三轮证据保持其[原范围](../2026-09-28-tests-model-invocation-demo-service/README.md)。
