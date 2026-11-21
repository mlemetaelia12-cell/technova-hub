import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  const sql = neon(process.env.DATABASE_URL);
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  // Schema contains static DDL only. Execute statements sequentially for Neon HTTP compatibility.
  for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) {
    await sql.query(statement);
  }
  console.log('TECHNOVA HUB database schema is ready.');
}
main().catch(error => { console.error(error); process.exit(1); });
