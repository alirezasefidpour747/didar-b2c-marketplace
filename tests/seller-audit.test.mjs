import test from 'node:test'
import assert from 'node:assert/strict'
import {validateAuditContext,applicationSource} from '../verification/seller-journey/audit.mjs'
const make=()=>({browser:{source_sha:applicationSource,origin:'https://127.0.0.1:12345',fixture_file:'/tmp/private/credentials.json'},ids:Object.fromEntries(['api','storefront','postgres','redis'].map(x=>[x,'a'.repeat(64)]))})
const env={GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/audit/seller-journey-feedback-loop'}
test('bounded disposable loopback QA permitted',()=>assert.doesNotThrow(()=>validateAuditContext(make(),'/tmp/evidence',env)))
for(const [name,mutate] of [['public target',c=>c.browser.origin='https://didar.example.com'],['plain HTTP',c=>c.browser.origin='http://127.0.0.1:12345'],['wrong accepted source',c=>c.browser.source_sha='a'.repeat(40)],['credential upload',c=>c.browser.fixture_file='/tmp/evidence/fixture.json'],['unknown container',c=>c.ids.api='not-a-container']])test(name+' rejected',()=>{const c=make();mutate(c);assert.throws(()=>validateAuditContext(c,'/tmp/evidence',env))})
test('non-Actions and untrusted branch rejected',()=>{for(const e of [{...env,GITHUB_ACTIONS:'false'},{...env,GITHUB_REF:'refs/heads/main'}])assert.throws(()=>validateAuditContext(make(),'/tmp/evidence',e))})
