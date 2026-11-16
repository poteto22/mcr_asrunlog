import mysql from 'mysql2/promise';

const TABLE = process.env.LOG_TABLE || 'asrunlog';
if (!/^[A-Za-z0-9_]+$/.test(TABLE)) {
  throw new Error(`Invalid LOG_TABLE name: ${TABLE}`);
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'readonly_user',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'playout',
  dateStrings: true,
  connectTimeout: 3000,
  waitForConnections: true,
  connectionLimit: 5
});

export async function getLogs(date) {
  const [rows] = await pool.query(
    `SELECT title, startTime, endTime, duration FROM \`${TABLE}\`
     WHERE \`date\` = ?
     ORDER BY startTime IS NULL DESC, startTime`,
    [date]
  );
  return rows;
}

export async function closePool() {
  await pool.end();
}
