// config/db.js  ────────────────────────────────────────────────────
import sql   from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const cfg = {
  server     : 'localhost',
  database   : process.env.MSSQL_DATABASE ?? 'ROTLAI_BEST',
  authentication: {
    type   : 'ntlm',
    options: {
      userName : 'administrator',
      password : 'Pa$$w0rd2025!@#',
      domain   : 'ROTLDEV1'
    }
  },
  options: {
    encrypt              : false,
    trustServerCertificate: true,
    instanceName         : 'SQLEXPRESS'
  }
};

const pool = new sql.ConnectionPool(cfg)
  .connect()
  .then(p => { console.log('✅  MSSQL connected'); return p; })
  .catch(err => {
    console.error('❌  MSSQL connection error:', err);
    process.exit(1);
  });

export default pool;          //  ← export-יחיד ES-module
