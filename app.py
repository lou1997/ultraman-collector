import os
import json
import time
import threading
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler

WORKER_URL = os.environ.get('WORKER_URL', 'https://ultraman.shiyijin.dpdns.org')
INTERVAL = int(os.environ.get('INTERVAL', '300'))  # 默认5分钟
collect_count = 0


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            'status': 'ok',
            'collections': collect_count,
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }).encode())

    def log_message(self, format, *args):
        pass  # 静默日志


def fetch_and_send():
    global collect_count
    vote_id = '23ERA1wloghvx0200'
    group_id = '24ERA1wloghvt0g00'
    url = f'https://api.bilibili.com/x/activity_components/vote_new/search?vote_id={vote_id}&group_id={group_id}&keyword=&ps=50&pn=1'

    while True:
        try:
            print(f'[{time.strftime("%H:%M:%S")}] Fetching from Bilibili...')
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com/blackboard/era/yPzdu1cQxeYNK7dd.html',
                'Origin': 'https://www.bilibili.com',
            })
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())

            if data.get('code') != 0 or not data.get('data', {}).get('items'):
                print(f'API error: {data.get("message")}')
                time.sleep(INTERVAL)
                continue

            votes = {}
            for item in data['data']['items']:
                name = item.get('item', {}).get('title')
                count = item.get('vote', 0)
                if name:
                    votes[name] = count

            print(f'Got {len(votes)} characters')

            # 发送到 Worker
            post_data = json.dumps({'votes': votes}).encode()
            req2 = urllib.request.Request(
                f'{WORKER_URL}/api/input',
                data=post_data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req2, timeout=15) as resp2:
                result = json.loads(resp2.read())
                print(f'Worker: {result}')
                collect_count += 1

        except Exception as e:
            print(f'Error: {e}')

        time.sleep(INTERVAL)


# 启动采集线程
t = threading.Thread(target=fetch_and_send, daemon=True)
t.start()

# 启动 HTTP 服务器
print(f'Worker URL: {WORKER_URL}')
print(f'Interval: {INTERVAL}s')
server = HTTPServer(('0.0.0.0', 7860), HealthHandler)
print('Server running on port 7860')
server.serve_forever()
