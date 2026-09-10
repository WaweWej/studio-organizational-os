"""Per-command Sites Git authentication; credentials arrive on stdin and are not saved."""
import json
import os
import subprocess
import sys
import termios

if sys.stdin.isatty():
    attributes = termios.tcgetattr(sys.stdin.fileno())
    attributes[3] &= ~termios.ECHO
    termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, attributes)
print('Ready for temporary source credential.', flush=True)
request = json.loads(sys.stdin.readline())
token = request['token']
remote = request['remote_url']
branch = request['branch']
action = request['action']
if not remote.startswith('https://') or action not in ['inspect', 'push']:
    raise SystemExit('Unsupported source operation.')
environment = dict(os.environ, GIT_TERMINAL_PROMPT='0')
base = ['git', '-c', 'http.extraHeader=Authorization: Bearer ' + token]
commands = [['ls-remote', '--heads', remote, branch]] if action == 'inspect' else [['push', remote, 'HEAD:refs/heads/' + branch]]
for command in commands:
    result = subprocess.run(base + command, text=True, capture_output=True, env=environment)
    print((result.stdout + result.stderr).replace(token, '[redacted]'), end='', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
