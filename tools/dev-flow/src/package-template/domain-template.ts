import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { object, older, version, type FileTemplate, type LayoutRules } from './model.ts'
import { fileList, layoutRules, stringArray, TEMPLATE_DIRECTORY } from './template.ts'

export const DOMAIN_TEMPLATE_DIRECTORY = join(dirname(TEMPLATE_DIRECTORY), 'domain')
export interface DomainManifest {
  readonly format: 1
  readonly id: 'package-domain'
  readonly version: string
  readonly common: readonly FileTemplate[]
  readonly requiredFiles: readonly string[]
  readonly layout: LayoutRules
  /** Exact historical versions only. These are structural rules, never old template bodies. */
  readonly previousVersions: Readonly<
    Record<string, { readonly requiredFiles: readonly string[]; readonly layout: LayoutRules }>
  >
}
export function readDomainTemplate(directory = DOMAIN_TEMPLATE_DIRECTORY): DomainManifest {
  const value: unknown = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
  if (
    !object(value) ||
    value['format'] !== 1 ||
    value['id'] !== 'package-domain' ||
    !version(value['version']) ||
    !fileList(value['common']) ||
    !stringArray(value['requiredFiles']) ||
    !layoutRules(value['layout']) ||
    !object(value['previousVersions'])
  )
    throw new Error('Invalid domain template manifest')
  for (const [key, rules] of Object.entries(value['previousVersions'])) {
    if (
      !version(key) ||
      !object(rules) ||
      !stringArray(rules['requiredFiles']) ||
      !layoutRules(rules['layout']) ||
      !older(key, value['version'])
    )
      throw new Error('Invalid historical domain template rules')
  }
  return {
    format: 1,
    id: 'package-domain',
    version: value['version'],
    common: value['common'],
    requiredFiles: value['requiredFiles'],
    layout: value['layout'],
    previousVersions: value['previousVersions'] as DomainManifest['previousVersions'],
  }
}
export function groupName(value: string): string {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value))
    throw new Error('Use a lowercase leaf group name')
  return value
}
