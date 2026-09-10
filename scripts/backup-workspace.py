"""Create a consistent, standalone backup of the local workspace database."""
import datetime
import pathlib
import sqlite3

root = pathlib.Path(__file__).resolve().parent.parent
candidates = list((root / '.wrangler/state/v3/d1').rglob('*.sqlite'))
matching = []
def open_source(path):
    # A stopped preview can leave a WAL-mode database without its sidecars.
    # Immutable read mode is safe only after checking no active WAL exists.
    wal = pathlib.Path(str(path) + '-wal')
    mode = 'mode=ro' if wal.exists() else 'mode=ro&immutable=1'
    return sqlite3.connect(f'file:{path}?{mode}', uri=True)

for path in candidates:
    if path.name == 'metadata.sqlite':
        continue
    connection = open_source(path)
    if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='organizations'").fetchone():
        matching.append(path)
    connection.close()
if len(matching) != 1:
    raise SystemExit('Expected exactly one local workspace database; no backup was created.')
destination = root / 'work/backups' / datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
destination.mkdir(parents=True, exist_ok=False)
source = open_source(matching[0])
target = sqlite3.connect(destination / 'workspace.sqlite')
source.backup(target)
target.execute('PRAGMA journal_mode=DELETE')
assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
target.close()
source.close()
(destination / 'workspace.sqlite').chmod(0o600)
print(destination / 'workspace.sqlite')
