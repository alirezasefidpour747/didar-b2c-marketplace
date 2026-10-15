#!/usr/bin/env python3
"""Create destination-only staging secrets; reject demo-enabled deployment config."""
import os
import secrets
import stat
from pathlib import Path


def main():
    config = Path('.env')
    try:
        descriptor = os.open(config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        print('Existing staging .env preserved')
    else:
        with os.fdopen(descriptor, 'w') as target:
            target.write('DIDAR_ENVIRONMENT=staging\nDIDAR_SEED_DEMO=false\n')
            for key in ('DIDAR_DB_PASSWORD', 'JWT_SECRET', 'COOKIE_SECRET'):
                target.write(key + '=' + secrets.token_hex(32) + '\n')
            target.write('MERCUR_BACKEND_URL=http://localhost:9000\nSTOREFRONT_URL=http://localhost:3000\n')
        print('Staging runtime configuration generated; no credential values logged')
    assert stat.S_IMODE(config.stat().st_mode) & 0o077 == 0, 'Set .env permissions to 0600 before staging'
    values = dict(line.split('=', 1) for line in config.read_text().splitlines() if '=' in line and not line.lstrip().startswith('#'))
    assert values.get('DIDAR_ENVIRONMENT') == 'staging', 'Set DIDAR_ENVIRONMENT=staging in destination .env'
    assert values.get('DIDAR_SEED_DEMO') == 'false', 'Set DIDAR_SEED_DEMO=false in destination .env'
    for key in ('DIDAR_DB_PASSWORD', 'JWT_SECRET', 'COOKIE_SECRET'):
        assert len(values.get(key, '')) >= 32, key + ' requires at least 32 characters'


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit('Staging configuration blocked: ' + str(error))
