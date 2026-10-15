#!/usr/bin/env python3
import os,secrets
# Generate runtime credentials only on the destination; never ship local .env files.
try:
    descriptor=os.open('.env',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
except FileExistsError:
    print('Existing staging .env preserved')
else:
    with os.fdopen(descriptor,'w') as f:
        f.write('DIDAR_DB_PASSWORD='+secrets.token_hex(32)+'\nJWT_SECRET='+secrets.token_hex(32)+'\nCOOKIE_SECRET='+secrets.token_hex(32)+'\nMERCUR_BACKEND_URL=http://localhost:9000\nSTOREFRONT_URL=http://localhost:3000\n')
    print('Staging runtime configuration generated; no credential values logged')
