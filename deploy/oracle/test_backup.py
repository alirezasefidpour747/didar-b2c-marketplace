"""Backup script integration with fake Docker only; no live database or image changes."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().with_name('backup.sh')


class BackupScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.backups = root / 'backups'
        self.log = root / 'docker.jsonl'
        self.env = dict(os.environ, DIDAR_BACKUP_DIR=str(self.backups), TEST_DOCKER_LOG=str(self.log))
        binary = root / 'docker'
        binary.write_text('''#!/usr/bin/python3
import json,os,pathlib,sys
args=sys.argv[1:]
with open(os.environ['TEST_DOCKER_LOG'],'a') as f: f.write(json.dumps(args)+'\\n')
if 'pg_dump' in args:
    if os.environ.get('TEST_DUMP_FAIL')=='yes': sys.exit(1)
    sys.stdout.buffer.write(b'PGDMP-fake-archive')
elif 'pg_restore' in args:
    assert '--list' in args
    assert sys.stdin.buffer.read()==b'PGDMP-fake-archive'
    if os.environ.get('TEST_ARCHIVE_FAIL')=='yes': sys.exit(1)
elif 'ps' in args: print('container-'+args[-1])
elif args[0]=='inspect': print('sha256:previous-image')
elif args[0]=='cp': pathlib.Path(args[-1],'asset.txt').write_text('native-file-fixture')
elif args[:2]==['image','tag']: pass
else: sys.exit(2)
''')
        binary.chmod(0o700)
        self.env['PATH'] = str(root) + os.pathsep + self.env['PATH']

    def tearDown(self):
        self.temp.cleanup()

    def run_script(self):
        return subprocess.run(['bash', str(SCRIPT)], env=self.env, capture_output=True, text=True, timeout=10)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_private_backup_and_retained_actual_images(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        snapshots = list(self.backups.iterdir())
        self.assertEqual(len(snapshots), 1)
        snapshot = snapshots[0]
        self.assertEqual(snapshot.stat().st_mode & 0o777, 0o700)
        self.assertEqual((snapshot / 'database.dump').stat().st_mode & 0o777, 0o600)
        self.assertEqual((snapshot / 'database.dump').read_bytes(), b'PGDMP-fake-archive')
        tags = [call for call in self.calls() if call[:2] == ['image', 'tag']]
        self.assertEqual(len(tags), 2)
        self.assertTrue(all(call[2] == 'sha256:previous-image' for call in tags))
        self.assertIn('api=didar-gold-api:rollback-', (snapshot / 'images.txt').read_text())
        self.assertTrue((snapshot / 'native-uploads' / 'asset.txt').exists())

    def test_dump_failure_aborts_before_image_changes(self):
        self.env['TEST_DUMP_FAIL'] = 'yes'
        self.assertNotEqual(self.run_script().returncode, 0)
        self.assertFalse(any(call[:2] == ['image', 'tag'] for call in self.calls()))
        self.assertFalse(list(self.backups.glob('*/database.dump')))

    def test_bad_archive_aborts_before_image_changes(self):
        self.env['TEST_ARCHIVE_FAIL'] = 'yes'
        self.assertNotEqual(self.run_script().returncode, 0)
        self.assertFalse(any(call[:2] == ['image', 'tag'] for call in self.calls()))
        self.assertFalse(list(self.backups.glob('*/database.dump')))


if __name__ == '__main__':
    unittest.main()
