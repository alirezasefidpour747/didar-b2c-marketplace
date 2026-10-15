import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const hex=()=>randomBytes(32).toString('hex')
if(!existsSync('.env')) writeFileSync('.env',`DIDAR_DB_PASSWORD=${hex()}\nJWT_SECRET=${hex()}\nCOOKIE_SECRET=${hex()}\nMERCUR_BACKEND_URL=http://localhost:9000\nSTOREFRONT_URL=http://localhost:3000\n`,{mode:0o600})
console.log('Docker configuration present; existing values preserved. No demo accounts seeded in production.')
