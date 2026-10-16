import pg from '../../packages/api/node_modules/pg/lib/index.js'
// Independent suites share a disposable database, but not an authentication-attempt budget.
// Never run this preparation against owner or configured application databases.
const url=new URL(process.env.DATABASE_URL || 'invalid:')
if(process.env.DIDAR_DISPOSABLE_QA!=='true' || url.hostname!=='127.0.0.1' || url.pathname!=='/didar_qa') throw new Error('Disposable browser fixture database required')
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL})
try{await pool.query('DELETE FROM didar_login_attempt');console.log('Disposable browser authentication window prepared; production rate limits unchanged.')}finally{await pool.end()}
