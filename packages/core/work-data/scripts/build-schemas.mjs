import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = resolve(process.argv[2] ?? join(packageRoot, 'src/schemas'))
const targetDirectory = resolve(process.argv[3] ?? join(packageRoot, 'dist/schemas'))

const resources = [
  {
    filename: 'agent-runtime-identity.schema.json',
    sha256: '37393c0774f7a71ee6bf663388a2ec27821740f98b19d487b1299d39829aca74',
    id: 'https://omne-harness-lite.invalid/spec/data/agent-runtime-identity/v1/schema.json',
    definitions: ['AgentRef', 'OpaqueId', 'SessionRef'],
  },
  {
    filename: 'core-work.schema.json',
    sha256: '1c11b06bb94756cfea6f162173c9f4070be71bf44eb09f8ddeb3e199d579c203',
    id: 'https://omne-harness-lite.invalid/spec/data/core-work/v1/schema.json',
    definitions: [
      'Action',
      'AuthorizationDeclaration',
      'BackgroundDeclaration',
      'Binding',
      'CallRef',
      'Command',
      'ContentBlock',
      'Decision',
      'DefinitionRef',
      'DefinitionVersion',
      'Input',
      'InputBlock',
      'MediaMetadata',
      'MediaRef',
      'MembershipRef',
      'Money',
      'OperationRef',
      'RequestRef',
      'ResourceRef',
      'RunRef',
      'SecretRef',
      'SessionRef',
      'StepRef',
      'ToolDefinition',
      'UserRef',
      'WorkOwner',
      'WorkRef',
    ],
  },
]

const verified = []
for (const resource of resources) {
  const source = join(sourceDirectory, resource.filename)
  const bytes = await readFile(source)
  const actualHash = createHash('sha256').update(bytes).digest('hex')
  if (actualHash !== resource.sha256) {
    throw new Error(`${resource.filename} SHA-256 mismatch: expected ${resource.sha256}, got ${actualHash}`)
  }
  const schema = JSON.parse(bytes.toString('utf8'))
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`${resource.filename} must contain a JSON object`)
  }
  if (schema.$id !== resource.id) {
    throw new Error(`${resource.filename} $id mismatch: expected ${resource.id}, got ${String(schema.$id)}`)
  }
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    throw new Error(`${resource.filename} is not draft 2020-12`)
  }
  const actualDefinitions = schema.$defs === null || typeof schema.$defs !== 'object' || Array.isArray(schema.$defs)
    ? []
    : Object.keys(schema.$defs).sort()
  if (JSON.stringify(actualDefinitions) !== JSON.stringify(resource.definitions)) {
    throw new Error(`${resource.filename} $defs mismatch: expected ${resource.definitions.join(',')}, got ${actualDefinitions.join(',')}`)
  }
  verified.push({ ...resource, source, bytes })
}

const allDefinitions = new Set(verified.flatMap(resource => resource.definitions))
if (allDefinitions.size !== 29) throw new Error(`expected 29 unique DataTypes definitions, got ${allDefinitions.size}`)

await mkdir(targetDirectory, { recursive: true })
for (const resource of verified) {
  await copyFile(resource.source, join(targetDirectory, resource.filename))
}
console.log('PASS: verified and copied 2 frozen schemas covering 29 DataTypes')
