import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

const port = Number(process.env.MYSQL_PORT || 3306);
if (port !== 3307) {
  console.error('Refusing to seed: MYSQL_PORT must be 3307 (dev database only).');
  process.exit(1);
}

const TABLE = process.env.LOG_TABLE || 'asrunlog';
if (!/^[A-Za-z0-9_]+$/.test(TABLE)) {
  throw new Error(`Invalid LOG_TABLE name: ${TABLE}`);
}

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port,
  user: 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'playout'
});

try {
  await conn.query(`CREATE USER IF NOT EXISTS 'readonly_user'@'%' IDENTIFIED BY ''`);
  await conn.query(`GRANT SELECT ON \`${process.env.MYSQL_DATABASE || 'playout'}\`.* TO 'readonly_user'@'%'`);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      uuid VARCHAR(40) PRIMARY KEY,
      \`date\` DATE,
      title VARCHAR(255),
      startTime TIME NULL,
      endTime TIME NULL,
      duration VARCHAR(16) NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  const data = JSON.parse(readFileSync(new URL('../asrunlog.json', import.meta.url), 'utf8'));
  const values = data.map(r => [r.uuid, r.date, r.title, r.startTime, r.endTime, r.duration]);

  if (values.length > 0) {
    await conn.query(
      `INSERT IGNORE INTO \`${TABLE}\` (uuid, \`date\`, title, startTime, endTime, duration) VALUES ?`,
      [values]
    );
  }
  console.log(`Seeded ${values.length} rows into ${TABLE} on port ${port}.`);
} finally {
  await conn.end();
}
