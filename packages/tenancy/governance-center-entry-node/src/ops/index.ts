// 运维面（入口契约 S-25、S-26；https-json/1 S-20、S-21）。导入白名单：kernel-basis、storage 协议、offer-expiry、
// Node 内置、cordis、zod、公共事件与精确叶子。纯工厂从根导出；本文件保留本目录的绑定汇总。
export { governanceCenterOpsPlugin } from './plugin.ts'
export { GovernanceCenterOpsConfigSchema, type GovernanceCenterOpsConfig } from './config.ts'
