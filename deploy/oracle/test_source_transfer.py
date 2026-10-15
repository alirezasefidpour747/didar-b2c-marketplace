"""Exercise SSH guard/control flow with fake git/ssh; never contact a remote host."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().with_name('deploy-ssh.sh')


class SourceTransferTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.log = root / 'calls.jsonl'
        key = root / 'test-key'
        key.write_text('placeholder, not a key')
        self.env = dict(os.environ, OCI_STAGING_HOST='staging.example.test', OCI_STAGING_SSH_KEY=str(key), OCI_ALWAYS_FREE_CONFIRMED='yes', TEST_LOG=str(self.log), TEST_CLEAN='yes')
        for name, source in {
            'git': '''#!/usr/bin/python3
import os,sys
if sys.argv[1]=='rev-parse': print('a'*40)
elif sys.argv[1]=='diff': sys.exit(0 if os.environ['TEST_CLEAN']=='yes' else 1)
elif sys.argv[1]=='archive': sys.stdout.buffer.write(b'committed-source-only')
else: sys.exit(2)
''',
            'ssh': '''#!/usr/bin/python3
import json,os,sys
with open(os.environ['TEST_LOG'],'a') as f: f.write(json.dumps(sys.argv[1:])+'\\n')
if 'tar -xzf' in sys.argv[-1]:
    assert sys.stdin.buffer.read()==b'committed-source-only'
if os.environ.get('TEST_MARKER_FAIL')=='yes': sys.exit(1)
'''
        }.items():
            target = root / name
            target.write_text(source)
            target.chmod(0o700)
        self.env['PATH'] = str(root) + os.pathsep + self.env['PATH']

    def tearDown(self):
        self.temp.cleanup()

    def run_script(self):
        return subprocess.run(['bash', str(SCRIPT)], env=self.env, capture_output=True, text=True, timeout=10)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_uncommitted_source_blocks_upload(self):
        self.env['TEST_CLEAN'] = 'no'
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Commit tracked source changes', result.stderr)
        self.assertEqual(self.calls(), [])

    def test_missing_free_eligibility_blocks_ssh(self):
        self.env['OCI_ALWAYS_FREE_CONFIRMED'] = 'no'
        self.assertNotEqual(self.run_script().returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_unmarked_host_blocks_upload(self):
        self.env['TEST_MARKER_FAIL'] = 'yes'
        self.assertNotEqual(self.run_script().returncode, 0)
        self.assertEqual(len(self.calls()), 1)
        self.assertIn('$(cat /etc/didar-staging-only)', self.calls()[0][-1])

    def test_clean_source_uses_fresh_release_and_shared_destination_secrets(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual(len(calls), 3)
        for call in calls:
            self.assertIn('StrictHostKeyChecking=yes', call)
            self.assertIn('BatchMode=yes', call)
        self.assertIn('releases/' + 'a' * 40, calls[0][-1])
        self.assertIn('tar -xzf -', calls[1][-1])
        self.assertIn('ln -s ../../shared/.env .env', calls[2][-1])
        self.assertIn('&& cd ../.. && ln -sfn', calls[2][-1])
        self.assertNotIn('placeholder, not a key', json.dumps(calls))


if __name__ == '__main__':
    unittest.main()
