import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

// Run real SQLite statements against an isolated in-memory schema, never user data.
export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  const prepare = (sql) => {
    let values = [];
    return {
      bind(...args) {
        values = args;
        return this;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...values) };
      },
      async first() {
        return sqlite.prepare(sql).get(...values) || null;
      },
      async run() {
        const result = sqlite.prepare(sql).run(...values);
        return {
          success: true,
          meta: { changes: Number(result.changes) },
          results: [],
        };
      },
    };
  };
  const db = {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return {
    sqlite,
    db,
    context: { db, org: 'test-a', actor: 'me', name: 'Test owner' },
  };
}
