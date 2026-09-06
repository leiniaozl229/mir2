#!/usr/bin/env python3
"""Wait for current container generation's internal backend connections."""
from datetime import datetime
from pathlib import Path
import json
import re
import subprocess
import time

root = Path(__file__).resolve().parents[1]
state = json.loads(subprocess.check_output([
    'docker', 'inspect', '--format', '{{json .State}}', 'mir2-engine-1'
]))
if not state['Running']:
    raise SystemExit('Engine container is not running')
started = datetime.fromisoformat(re.sub(r'\.(\d{6})\d+', r'.\1', state['StartedAt']).replace('Z', '+00:00')).timestamp()
checks = {'LoginGate.log': '账号服务器[127.0.0.1:5500]链接成功', 'DBSrv.log': '已打开', 'GameGate.log': '游戏引擎[127.0.0.1:5000]链接成功'}
end = time.monotonic() + 45
while time.monotonic() < end:
    ready = True
    for name, marker in checks.items():
        path = root / '.runtime/logs' / name
        if not path.exists() or path.stat().st_mtime < started or marker not in path.read_text():
            ready = False
    if ready:
        print('Current engine generation: selection and game backends connected')
        break
    time.sleep(.5)
else:
    raise SystemExit('Backend readiness timed out; inspect .runtime/logs')
