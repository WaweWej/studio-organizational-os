"""Create a consistent, standalone backup of the local workspace database."""
import datetime
import pathlib
import sqlite3

root = pathlib.Path(__file__).resolve().parent.parent
candidates = list((root / '.wrangler/state/v3/d1').rglob('*.sqlite'))
matching = []
for path in candidates:
    connection = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='organizations'").fetchone():
        matching.append(path)
    connection.close()
if len(matching) != 1:
    raise SystemExit('Expected exactly one local workspace database; no backup was created.')
destination = root / 'work/backups' / datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
destination.mkdir(parents=True, exist_ok=False)
source = sqlite3.connect(f'file:{matching[0]}?mode=ro', uri=True)
target = sqlite3.connect(destination / 'workspace.sqlite')
source.backup(target)
target.execute('PRAGMA journal_mode=DELETE')
assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
target.close()
source.close()
(destination / 'workspace.sqlite').chmod(0o600)
print(destination / 'workspace.sqlite')
