import fs from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({
  connectionString: url,
  connectionTimeoutMillis: 5000,
});

async function withRetry<T>(fn: () => Promise<T>, attempts = 20): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw last;
}

try {
  const schema = await fs.readFile("src/db/schema.sql", "utf8");
  await withRetry(() => pool.query(schema));
  await pool.query(`
    INSERT INTO app_users (id,email,password_hash)
    VALUES ('00000000-0000-4000-8000-000000000001','ci@example.test','not-used')
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO tax_companies (id,user_id,legal_name,cnpj,regime)
    VALUES (
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
      'CI Test Company',
      '00000000000191',
      'mei'
    )
    ON CONFLICT (id) DO NOTHING
  `);
} finally {
  await pool.end();
}
