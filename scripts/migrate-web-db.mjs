import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const migrationUrl = new URL('../db/migrations/001_web_chats.sql', import.meta.url);
const source = await readFile(migrationUrl, 'utf8');
const statements = source
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const sql = neon(databaseUrl);
for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Applied ${statements.length} web chat migration statements.`);
