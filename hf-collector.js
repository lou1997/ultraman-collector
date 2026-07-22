// Hugging Face Docker 用的采集服务
// 职责：从 B站 采集数据，发送给 Cloudflare Worker 存储

const http = require('http');
const WORKER_URL = process.env.WORKER_URL || 'https://ultraman.shiyijin.dpdns.org';
const INTERVAL = parseInt(process.env.INTERVAL) || 5 * 60 * 1000; // 默认5分钟
const PORT = process.env.PORT || 7860;
let collectCount = 0;
let timer = null;

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
  setTimeout(() => process.exit(0), 5000); // 5秒后强制退出
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
  const timeout = setTimeout(() => controller.abort(), 15000); // 15秒超时

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

// 发送数据给 Cloudflare Worker
async function sendToWorker(votes) {
  console.log(`[Sender] Sending ${Object.keys(votes).length} votes to worker...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15秒超时

  try {
    const response = await fetch(`${WORKER_URL}/api/input`, {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ votes })
    });

    clearTimeout(timeout);

    const result = await response.json();
    console.log(`[Sender] Response:`, result);
    return result;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// 主循环
async function main() {
  console.log('=== Ultraman Vote Collector ===');
  console.log(`Worker URL: ${WORKER_URL}`);
  console.log(`Interval: ${INTERVAL / 1000} seconds`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  async function collect() {
    collectCount++;
    try {
      const votes = await fetchVoteData();
      if (Object.keys(votes).length > 0) {
        await sendToWorker(votes);
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
