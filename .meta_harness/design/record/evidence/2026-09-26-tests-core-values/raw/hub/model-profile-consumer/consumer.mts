import assert from 'node:assert/strict'
import schema from '@omne-harness-lite/model-profile/schema' with {type:'json'}
import { LosslessNumber, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { parseScopeLayerIdentity } from '@omne-harness-lite/identity-values'
import {
  judgeModelProfileDocument, parameterNames, refMatches, validate,
  schemaId, SCHEMA_DEF_NAMES,
  type ModelProfile, type ModelProfileContent, type ModelProfileRef,
  type ModelProfileSnapshot, type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'

const profile: ModelProfile = {
  routeName:'a', origin:'official', providers:['p'], allowFallback:false,
  inputModalities:['text'], outputModalities:['text'],
  maxInputTokens:new LosslessNumber('1e400'), maxOutputTokens:new LosslessNumber('9007199254740992'),
  inputConstraints:{maxImageBytes:new LosslessNumber('1e400')}, registration:'listed',
  updatedAt:'2026-09-26T00:00:00+08:00',
}
const count: JsonNumber = profile.maxInputTokens
assert.equal(LosslessNumber.is(count), true)
assert.deepEqual(judgeModelProfileDocument('ModelProfile', profile), {ok:true})
assert.deepEqual(judgeModelProfileDocument('ModelProfile', {...profile, parameters:{maxOutputTokens:new LosslessNumber('9007199254740993')}}), {rejected:'max_output_exceeds_profile'})
assert.equal(validate('ModelProfile', {...profile, parameters:{maxOutputTokens:new LosslessNumber('9007199254740993')}}).valid, true)
assert.equal(schema.$id, schemaId)
assert.equal(SCHEMA_DEF_NAMES.length, 11)
const official: ModelProfileRef = {origin:'official',routeName:'a'}
assert.equal(refMatches(official, profile), true)
const scope = parseScopeLayerIdentity({layer:'organization',organization:'org_a'})
if ('invalidInput' in scope) throw new Error(scope.invalidInput)
const custom: ModelProfileRef = {origin:'custom',routeName:'a',scope:scope.ok}
assert.equal(refMatches(custom, {...profile,origin:'custom'},scope.ok), true)
const params: ModelRequestParameters = {seed:new LosslessNumber('-9007199254740993'),extra:{raw:new LosslessNumber('1e400')}}
assert.deepEqual(parameterNames(params), ['seed','raw'])
const {registration:_registration,updatedAt:_updatedAt,...content}: ModelProfileContent & Pick<ModelProfile,'registration'|'updatedAt'> = profile
const validContent: ModelProfileContent = content
assert.deepEqual(judgeModelProfileDocument('ModelProfileContent',validContent), {ok:true})
const snapshot: ModelProfileSnapshot = {
  providers:profile.providers, allowFallback:profile.allowFallback,
  inputModalities:profile.inputModalities, outputModalities:profile.outputModalities,
  maxInputTokens:profile.maxInputTokens,maxOutputTokens:profile.maxOutputTokens,updatedAt:profile.updatedAt,
}
assert.equal(validate('ModelProfileSnapshot',snapshot).valid, true)
console.log('PASS: public dist imports, declarations, Schema, exact counts and scope matching')
