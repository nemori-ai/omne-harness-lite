// 构建后运行：把页面内联的第三方代码写到 dist，发布的包不再需要 React、@xyflow/react、antd、elkjs 与 esbuild。
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PAGE_ASSETS_FILE, buildPageAssets } from './flow/architecture/bundle.ts'

const target = fileURLToPath(new URL(`./flow/architecture/${PAGE_ASSETS_FILE}`, import.meta.url))
writeFileSync(target, JSON.stringify(buildPageAssets()))
process.stdout.write(`${target}\n`)
