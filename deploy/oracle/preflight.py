#!/usr/bin/env python3
"""Read-only guard for an already-provisioned Oracle A1 staging VM. No OCI writes."""
import json, os, platform, shutil, urllib.request

def main():
    assert os.environ.get('DIDAR_DEPLOY_ENV') == 'staging', 'Only DIDAR_DEPLOY_ENV=staging is allowed'
    assert os.environ.get('OCI_ALWAYS_FREE_CONFIRMED') == 'yes', 'Confirm eligibility and remaining account-wide Always Free allowance in Oracle Console first'
    assert platform.machine() in ('aarch64','arm64'), 'Build on the ARM64 VM; do not transfer x64 node_modules/images'
    assert os.cpu_count() <= 2, 'Target exceeds the requested 2 OCPU/CPU ceiling'
    with open('/etc/didar-staging-only') as f:
        assert f.read().strip() == 'didar-staging-only', 'Host must be independently marked staging-only before deployment'
    with open('/etc/os-release') as f:
        assert 'ID=ubuntu' in f.read(), 'Expected Ubuntu Linux'
    request=urllib.request.Request('http://169.254.169.254/opc/v2/instance/',headers={'Authorization':'Bearer Oracle'})
    # Link-local IMDS request bypasses Internet proxy only; no metadata/credentials are logged.
    client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with client.open(request,timeout=5) as r: data=json.load(r)
    assert data.get('shape') == 'VM.Standard.A1.Flex', 'Only eligible Ampere A1 shape allowed'
    shape=data.get('shapeConfig',{})
    assert 0 < shape.get('ocpus',0) <= 2, 'Requested limit: at most 2 OCPUs'
    assert 0 < shape.get('memoryInGBs',0) <= 12, 'Requested limit: at most 12 GB RAM'
    assert shutil.disk_usage('.').free >= 20*1024**3, 'At least 20 GiB free disk needed for build/migration'
    print('PASS: existing Ubuntu ARM64 A1 staging host is within 2 OCPU / 12 GB limits; no resources provisioned')
if __name__ == '__main__':
    try: main()
    except Exception as e: raise SystemExit('Oracle staging preflight blocked: '+str(e))
