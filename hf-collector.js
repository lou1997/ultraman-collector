// Hugging Face Docker 用的采集服务
// 职责：从 B站 采集数据，发送给 Cloudflare Worker 存储

const WORKER_URL = process.env.WORKER_URL || 'https://ultraman.shiyijin.dpdns.org';
const INTERVAL = parseInt(process.env.INTERVAL) || 5 * 60 * 1000; // 默认5分钟

// 从B站获取投票数据
async function fetchVoteData() {
  const voteId = '23ERA1wloghvx0200';
  const groupId = '24ERA1wloghvt0g00';
  const apiUrl = `https://api.bilibili.com/x/activity_components/vote_new/search?vote_id=${voteId}&group_id=${groupId}&keyword=&ps=50&pn=1`;

  console.log(`[Fetcher] Fetching from Bilibili...`);

  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com/blackboard/era/yPzdu1cQxeYNK7dd.html',
      'Origin': 'https://www.bilibili.com',
      'Accept': 'application/json, text/plain, */*',
    },
  });

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
}

// 发送数据给 Cloudflare Worker
async function sendToWorker(votes) {
  console.log(`[Sender] Sending ${Object.keys(votes).length} votes to worker...`);

  const response = await fetch(`${WORKER_URL}/api/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ votes })
  });

  const result = await response.json();
  console.log(`[Sender] Response:`, result);
  return result;
}

// 主循环
async function main() {
  console.log('=== Ultraman Vote Collector ===');
  console.log(`Worker URL: ${WORKER_URL}`);
  console.log(`Interval: ${INTERVAL / 1000} seconds`);
  console.log('');

  async function collect() {
    try {
      const votes = await fetchVoteData();
      if (Object.keys(votes).length > 0) {
        await sendToWorker(votes);
      }
    } catch (error) {
      console.error('[Error]', error.message);
    }
  }

  // 立即执行一次
  await collect();

  // 定时执行
  setInterval(collect, INTERVAL);
}

main();
