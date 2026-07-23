// Hugging Face Docker 用的采集服务
// 职责：从 B站 采集数据，直接写入 Turso 数据库

const http = require('http');
const { createClient } = require('@libsql/client');

const TURSO_URL = process.env.TURSO_URL || 'libsql://ultraman-votes-shiyijin.aws-ap-northeast-1.turso.io';
const TURSO_TOKEN = process.env.TURSO_TOKEN || '';
const INTERVAL = parseInt(process.env.INTERVAL) || 5 * 60 * 1000; // 默认5分钟
const PORT = process.env.PORT || 7860;
let collectCount = 0;
let timer = null;

// Turso 客户端
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// 初始化数据库表
async function initDB() {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      is_active INTEGER DEFAULT 1
    )
  `);
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS vote_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      character_name TEXT NOT NULL,
      vote_count INTEGER NOT NULL DEFAULT 0,
      source TEXT DEFAULT 'bilibili'
    )
  `);
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS vote_hourly_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_name TEXT NOT NULL,
      hour_timestamp TEXT NOT NULL DEFAULT '',
      vote_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(character_name, hour_timestamp)
    )
  `);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_hourly_char_time ON vote_hourly_summary(character_name, hour_timestamp)`);
  console.log('[DB] Tables initialized');
}

// 简单的 HTTP 服务器（响应健康检查）
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      collections: collectCount,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Health check server running on port ${PORT}`);
});

// 优雅退出
process.on('SIGTERM', () => {
  console.log(`[Exit] Received SIGTERM after ${collectCount} collections. Cleaning up...`);
  if (timer) clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

process.on('SIGINT', () => {
  console.log(`[Exit] Received SIGINT after ${collectCount} collections. Cleaning up...`);
  if (timer) clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

// 从B站获取投票数据
async function fetchVoteData() {
  const voteId = '23ERA1wloghvx0200';
  const groupId = '24ERA1wloghvt0g00';
  const apiUrl = `https://api.bilibili.com/x/activity_components/vote_new/search?vote_id=${voteId}&group_id=${groupId}&keyword=&ps=50&pn=1`;

  console.log(`[Fetcher] Fetching from Bilibili...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/blackboard/era/yPzdu1cQxeYNK7dd.html',
        'Origin': 'https://www.bilibili.com',
        'Accept': 'application/json, text/plain, */*',
      },
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (data.code !== 0 || !data.data?.items) {
      console.error(`[Fetcher] API error:`, data.message);
      return [];
    }

    const votes = {};
    for (const item of data.data.items) {
      const name = item.item?.title;
      const count = item.vote || 0;
      if (name) {
        votes[name] = count;
      }
    }

    console.log(`[Fetcher] Got ${Object.keys(votes).length} characters`);
    return votes;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// 写入 Turso 数据库
async function saveToTurso(votes) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const statements = [];

  for (const [name, count] of Object.entries(votes)) {
    // 确保角色存在
    statements.push({
      sql: `INSERT OR IGNORE INTO characters (name, display_name) VALUES (?, ?)`,
      args: [name, name]
    });

    // 插入投票快照
    statements.push({
      sql: `INSERT INTO vote_snapshots (collected_at, character_name, vote_count, source) VALUES (?, ?, ?, 'bilibili')`,
      args: [now, name, count]
    });

    // 更新小时汇总
    const hourTimestamp = now.slice(0, 13) + ':00:00';
    statements.push({
      sql: `INSERT INTO vote_hourly_summary (character_name, hour_timestamp, vote_count)
            VALUES (?, ?, ?)
            ON CONFLICT(character_name, hour_timestamp) DO UPDATE SET vote_count = ?`,
      args: [name, hourTimestamp, count, count]
    });
  }

  await turso.batch(statements);
}

// 主循环
async function main() {
  console.log('=== Ultraman Vote Collector ===');
  console.log(`Turso URL: ${TURSO_URL}`);
  console.log(`Interval: ${INTERVAL / 1000} seconds`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  await initDB();

  async function collect() {
    collectCount++;
    try {
      const votes = await fetchVoteData();
      if (Object.keys(votes).length > 0) {
        await saveToTurso(votes);
        console.log(`[OK] Saved ${Object.keys(votes).length} characters to Turso`);
      }
      console.log(`[OK] Collection #${collectCount} completed at ${new Date().toISOString()}`);
    } catch (error) {
      console.error(`[Error] Collection #${collectCount} failed:`, error.message);
    }
  }

  // 立即执行一次
  await collect();

  // 定时执行
  timer = setInterval(collect, INTERVAL);
}

main();
