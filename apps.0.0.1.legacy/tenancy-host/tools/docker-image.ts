import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { cp, link, lstat, mkdir, mkdtemp, open, readFile, realpath, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, inventory, type Entry } from '@omne-harness-lite/artifact-builder'

const baseDigest = 'sha256:64af3819f9275802414d7cdc38c27e9d82bd564dec4d4da87d008255d36c63b4'
const distribution = 'tenancy-host-docker/1'
const nodeVersion = '24.21.0'
const manifestLimit = 8 * 1024 * 1024
const dockerfile = fileURLToPath(new URL('../deploy/docker/Dockerfile', import.meta.url))
const healthScript = fileURLToPath(new URL('../deploy/docker/health.mjs', import.meta.url))
const maximumOutput = 65_536

export class ImageBuildError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

function reject(code: string): never {
  throw new ImageBuildError(code)
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function regularText(path: string, maximum: number): Promise<string> {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.size > maximum) reject('invalid-app-manifest')
  return readFile(path, 'utf8')
}

async function portableFiles(app: string, files: readonly Entry[]): Promise<void> {
  for (const entry of files) {
    if (entry.kind !== 'file') continue
    const segments = entry.path.split('/')
    const basename = segments.at(-1) ?? ''
    if (
      basename === '.env' ||
      basename.startsWith('.env.') ||
      /\.(?:node|exe|dll|dylib|so|pem|key|sqlite|sqlite3|db)$/i.test(basename) ||
      segments.some(part => part === 'vitest' || part === 'jest' || part === '__tests__')
    )
      reject('nonportable-or-private-app-file')
    const handle = await open(join(app, entry.path), 'r')
    try {
      const header = Buffer.alloc(4)
      await handle.read(header, 0, 4, 0)
      if (
        header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
        header.subarray(0, 2).equals(Buffer.from([0x4d, 0x5a])) ||
        ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca'].includes(
          header.toString('hex'),
        )
      )
        reject('nonportable-or-private-app-file')
    } finally {
      await handle.close()
    }
  }
}

export async function verifyHostApp(app: string): Promise<{ buildId: string; version: string }> {
  if (!isAbsolute(app) || resolve(app) !== app) reject('app-path-invalid')
  const appStat = await lstat(app)
  if (!appStat.isDirectory() || (await realpath(app)) !== app) reject('app-path-invalid')
  const manifestText = await regularText(join(app, 'build-info.json'), manifestLimit)
  const marker = await regularText(join(app, 'BUILD_ID'), 65)
  let manifest: unknown
  let appPackage: unknown
  try {
    manifest = JSON.parse(manifestText)
    appPackage = JSON.parse(await regularText(join(app, 'package.json'), manifestLimit))
  } catch {
    reject('invalid-app-manifest')
  }
  if (!record(manifest) || !record(appPackage)) reject('invalid-app-manifest')
  if (
    Object.keys(manifest).sort().join(',') !== 'buildId,files,format,node,pnpm,version' ||
    manifest.format !== 'omne-tenancy-host-build/1' ||
    manifest.node !== nodeVersion ||
    manifest.pnpm !== '10.28.1' ||
    typeof manifest.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(manifest.version) ||
    appPackage.name !== '@omne-harness-lite/tenancy-host' ||
    appPackage.version !== manifest.version ||
    typeof manifest.buildId !== 'string' ||
    !/^[0-9a-f]{64}$/.test(manifest.buildId) ||
    marker !== `${manifest.buildId}\n` ||
    !Array.isArray(manifest.files)
  )
    reject('invalid-app-manifest')
  const actual = (await inventory(app)).filter(
    entry => entry.path !== 'BUILD_ID' && entry.path !== 'build-info.json',
  )
  if (JSON.stringify(manifest.files) !== JSON.stringify(actual)) reject('app-files-mismatch')
  const calculated = createHash('sha256').update(JSON.stringify(actual)).digest('hex')
  if (calculated !== manifest.buildId) reject('app-build-id-mismatch')
  await portableFiles(app, actual)
  return { buildId: calculated, version: manifest.version }
}

interface CommandResult {
  stdout: string
}
async function run(
  command: string,
  args: readonly string[],
  limit = maximumOutput,
): Promise<CommandResult> {
  return new Promise((yes, no) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    let failed = false
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (part: string) => {
      stdout += part
      if (Buffer.byteLength(stdout) > limit) {
        failed = true
        child.kill('SIGKILL')
      }
    })
    child.once('error', () => no(new ImageBuildError('command-unavailable')))
    child.once('close', code => {
      if (failed) no(new ImageBuildError('command-output-too-large'))
      else if (code !== 0) no(new ImageBuildError('command-failed'))
      else yes({ stdout })
    })
  })
}

async function runQuiet(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((yes, no) => {
    const child = spawn(command, [...args], { stdio: 'ignore' })
    child.once('error', () => no(new ImageBuildError('command-unavailable')))
    child.once('close', code => (code === 0 ? yes() : no(new ImageBuildError('command-failed'))))
  })
}

export interface ImageBuildResult {
  readonly path: string
  readonly sha256: string
  readonly imageId: string
  readonly platform: 'linux/arm64' | 'linux/amd64'
  readonly buildId: string
  readonly baseDigest: string
}

export async function buildTenancyImage(
  app: string,
  platform: ImageBuildResult['platform'],
  output: string,
): Promise<ImageBuildResult> {
  if (process.versions.node !== nodeVersion) reject('node-version-mismatch')
  if (
    !isAbsolute(output) ||
    resolve(output) !== output ||
    !output.endsWith('.tar') ||
    !['linux/arm64', 'linux/amd64'].includes(platform)
  )
    reject('arguments-invalid')
  try {
    await lstat(output)
    reject('output-exists')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const original = await verifyHostApp(app)
  const deploymentPairs: readonly (readonly [string, string])[] = [
    [dockerfile, join(app, 'deploy/docker/Dockerfile')],
    [healthScript, join(app, 'deploy/docker/health.mjs')],
  ]
  for (const [source, packaged] of deploymentPairs) {
    try {
      if (!(await lstat(packaged)).isFile() || (await digest(source)) !== (await digest(packaged)))
        reject('deployment-files-mismatch')
    } catch {
      reject('deployment-files-mismatch')
    }
  }
  const staging = await mkdtemp(join(dirname(output), '.omne-image-'))
  const tag = `omne-tenancy-i1:${randomUUID()}`
  let tagged = false
  try {
    const context = join(staging, 'context')
    await mkdir(context)
    await cp(app, join(context, 'app'), { recursive: true, verbatimSymlinks: true })
    await cp(dockerfile, join(context, 'Dockerfile'))
    const copied = await verifyHostApp(join(context, 'app'))
    if (copied.buildId !== original.buildId || copied.version !== original.version)
      reject('app-changed-during-copy')
    const localVersion = await run(
      process.execPath,
      [join(context, 'app/dist/cli.js'), '--version'],
      512,
    )
    const expectedVersion = `tenancy-host ${copied.version} ${copied.buildId}\n`
    if (localVersion.stdout !== expectedVersion) reject('app-version-mismatch')
    await runQuiet('docker', [
      'build',
      '--platform',
      platform,
      '--tag',
      tag,
      '--file',
      join(context, 'Dockerfile'),
      '--label',
      `org.opencontainers.image.version=${copied.version}`,
      '--label',
      `ai.nemori.omne.host-build-id=${copied.buildId}`,
      '--label',
      `ai.nemori.omne.distribution=${distribution}`,
      context,
    ])
    tagged = true
    const inspected = await run('docker', ['image', 'inspect', tag], maximumOutput)
    let images: unknown
    try {
      images = JSON.parse(inspected.stdout)
    } catch {
      reject('image-inspection-invalid')
    }
    if (!Array.isArray(images) || images.length !== 1 || !record(images[0]))
      reject('image-inspection-invalid')
    const image = images[0]
    const config = image.Config
    const labels = record(config) ? config.Labels : undefined
    if (
      typeof image.Id !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/.test(image.Id) ||
      image.Os !== 'linux' ||
      image.Architecture !== platform.slice('linux/'.length) ||
      !record(labels) ||
      labels['org.opencontainers.image.version'] !== copied.version ||
      labels['ai.nemori.omne.host-build-id'] !== copied.buildId ||
      labels['ai.nemori.omne.distribution'] !== distribution
    )
      reject('image-identity-mismatch')
    const imageVersion = await run(
      'docker',
      ['run', '--rm', '--network', 'none', '--platform', platform, image.Id, '--version'],
      512,
    )
    if (imageVersion.stdout !== expectedVersion) reject('image-version-mismatch')
    const runtimeVersion = await run(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--platform',
        platform,
        '--entrypoint',
        'node',
        image.Id,
        '--version',
      ],
      128,
    )
    if (runtimeVersion.stdout !== `v${nodeVersion}\n`) reject('node-version-mismatch')
    const archive = join(staging, 'image.tar')
    await runQuiet('docker', ['save', '--output', archive, tag])
    const sha256 = await digest(archive)
    await link(archive, output)
    // The image is also a local deliverable; the unique tag cannot replace another build.
    tagged = false
    return {
      path: output,
      sha256,
      imageId: image.Id,
      platform,
      buildId: copied.buildId,
      baseDigest,
    }
  } finally {
    try {
      if (tagged) await runQuiet('docker', ['image', 'rm', tag])
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
}

async function main(args: readonly string[]): Promise<void> {
  if (
    args.length !== 6 ||
    args[0] !== '--app' ||
    args[2] !== '--platform' ||
    args[4] !== '--output'
  )
    reject('arguments-invalid')
  const platform = args[3]
  if (platform !== 'linux/arm64' && platform !== 'linux/amd64') reject('arguments-invalid')
  const result = await buildTenancyImage(args[1] ?? '', platform, args[5] ?? '')
  await new Promise<void>((yes, no) =>
    process.stdout.write(`${JSON.stringify(result)}\n`, error => (error ? no(error) : yes())),
  )
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2)).catch(error => {
    const code = error instanceof ImageBuildError ? error.code : 'unexpected-failure'
    process.stderr.write(`omne-image-build: ${code}; a published complete output may remain\n`)
    process.exitCode = 1
  })
}
