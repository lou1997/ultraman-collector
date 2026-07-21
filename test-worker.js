// 测试 Worker API
const WORKER_URL = 'https://ultraman.shiyijin.dpdns.org';

async function test() {
  console.log('Testing Worker API...\n');

  // 测试首页
  try {
    const res = await fetch(WORKER_URL);
    console.log('GET /');
    console.log('  Status:', res.status);
    console.log('  Content-Type:', res.headers.get('content-type'));
    const html = await res.text();
    console.log('  HTML length:', html.length);
    console.log('  Has "加载中":', html.includes('加载中'));
  } catch (e) {
    console.log('  Error:', e.message);
  }

  // 测试 API
  try {
    const res = await fetch(`${WORKER_URL}/api/current`);
    console.log('\nGET /api/current');
    console.log('  Status:', res.status);
    const data = await res.json();
    console.log('  Data type:', Array.isArray(data) ? 'array' : typeof data);
    console.log('  Data length:', Array.isArray(data) ? data.length : 'N/A');
    if (Array.isArray(data) && data.length > 0) {
      console.log('  First item:', JSON.stringify(data[0]));
    } else {
      console.log('  Data:', JSON.stringify(data));
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

test();
