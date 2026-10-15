#!/usr/bin/env python3
"""Static lockfile compatibility audit; not a substitute for native ARM execution."""
import json,re,pathlib
root=pathlib.Path(__file__).resolve().parents[2]
lock=json.loads(re.sub(r',\s*([}\]])',r'\1',(root/'bun.lock').read_text()))
packages=lock['packages']
required=['@swc/core-linux-arm64-gnu','@next/swc-linux-arm64-gnu','@img/sharp-linux-arm64','@esbuild/linux-arm64','@rollup/rollup-linux-arm64-gnu','@unrs/resolver-binding-linux-arm64-gnu','@turbo/linux-arm64']
for name in required:
    rows=[row for key,row in packages.items() if key==name or key.endswith('/'+name)]
    assert rows, 'Missing ARM64 lockfile artifact: '+name
    assert all(row[-1].startswith('sha512-') for row in rows), 'Missing package integrity: '+name
    print('PASS ARM64 artifact:',name)
# Flag architecture-restricted hard dependencies; optional platform alternatives are expected.
restricted={name for name,row in packages.items() if len(row)>2 and isinstance(row[2],dict) and row[2].get('cpu') and 'arm64' not in row[2]['cpu'] and (not row[2].get('os') or 'linux' in row[2]['os'])}
problems=[]
for name,row in packages.items():
    if len(row)<3 or not isinstance(row[2],dict): continue
    meta=row[2]
    if meta.get('os') and 'linux' not in meta['os']: continue
    if meta.get('cpu') and 'arm64' not in meta['cpu']: continue
    for dep in row[2].get('dependencies',{}):
        if dep in restricted: problems.append((name,dep))
assert not problems, 'Architecture-restricted hard dependencies require investigation: '+str(problems)
print('PASS: no Linux x64-only hard dependency found in lockfile metadata')
print('Native ARM64 build/runtime and registry image-manifest verification remain required.')
