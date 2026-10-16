"""Deployment guard/order tests. Docker commands are mocked; these are not server tests."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent.parent
SHA = '00447d39ffa64881c35813b5242b95fd356c84bb'


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.root = self.base / 'staging'
        self.root.mkdir()
        self.env = dict(os.environ, DIDAR_STAGING_ROOT=str(self.root))

    def tearDown(self):
        self.temp.cleanup()

    def config(self):
        return subprocess.run(['node', str(TOOLS / 'init-env.mjs')], env=self.env, capture_output=True)

    def test_configuration_is_private_and_repeat_preserves_every_byte(self):
        self.assertEqual(self.config().returncode, 0)
        file = self.root / 'shared/staging.env'
        original = file.read_bytes()
        self.assertEqual(file.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.config().returncode, 0)
        self.assertEqual(original, file.read_bytes())
        for key in ('JWT_SECRET', 'COOKIE_SECRET', 'DIDAR_DB_PASSWORD'):
            value = next(line.split('=', 1)[1] for line in original.decode().splitlines() if line.startswith(key + '='))
            self.assertEqual(len(value), 64)
        self.assertNotEqual(original.split(b'JWT_SECRET=')[1][:64], original.split(b'COOKIE_SECRET=')[1][:64])

    def test_unsafe_configuration_is_rejected_without_overwrite_or_value_disclosure(self):
        self.config()
        file = self.root / 'shared/staging.env'
        unsafe = file.read_text().replace('DIDAR_ENVIRONMENT=staging', 'DIDAR_ENVIRONMENT=production')
        file.write_text(unsafe)
        result = self.config()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(file.read_text(), unsafe)
        self.assertNotIn(unsafe.split('JWT_SECRET=')[1][:64].encode(), result.stderr)

    def test_world_readable_configuration_is_rejected(self):
        self.config()
        (self.root / 'shared/staging.env').chmod(0o644)
        self.assertNotEqual(self.config().returncode, 0)

    def mock_commands(self):
        (self.root / 'repository').mkdir()
        (self.root / 'repository/.git').mkdir()
        previous = self.root / 'releases/old'
        previous.mkdir(parents=True)
        (previous / 'DEPLOYED_COMMIT').write_text('previous')
        (self.root / 'current').symlink_to(previous)
        bindir = self.base / 'bin'
        bindir.mkdir()
        archive = self.base / 'uploads.tar.gz'
        with tarfile.open(archive, 'w:gz') as target:
            pass
        self.log = self.base / 'commands.log'
        self.env.update(PATH=str(bindir) + ':' + os.environ['PATH'],
                        MOCK_LOG=str(self.log), MOCK_UPLOADS=str(archive),
                        SOURCE_REPO=str(REPO), REAL_GIT=shutil.which('git'))
        scripts = {
            'git': '''#!/bin/bash
if [[ "$3" == fetch ]]; then exit 0; fi
exec "$REAL_GIT" -C "$SOURCE_REPO" "${@:3}"
''',
            'df': '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nmock 104857600 0 104857600 0%% /\\n"\n',
            'docker': '''#!/bin/bash
echo "$*" >> "$MOCK_LOG"
case "$*" in
  *"build api"*) [[ "${MOCK_FAIL:-}" != build ]] || exit 42 ;;
  *"pg_dump"*) echo fake-custom-dump ;;
  *"--entrypoint tar"*) cat "$MOCK_UPLOADS" ;;
  *"-T migrate"*) [[ "${MOCK_FAIL:-}" != migrate ]] || exit 43 ;;
esac
exit 0
''',
            'curl': '''#!/bin/bash
case "$*" in
  *health*) echo OK ;;
  *catalog*) echo '{"products":[],"rate":{"rate_irr":1}}' ;;
esac
''',
        }
        for name, contents in scripts.items():
            file = bindir / name
            file.write_text(contents)
            file.chmod(0o755)
        self.config()
        self.config_bytes = (self.root / 'shared/staging.env').read_bytes()

    def update(self, sha=SHA):
        return subprocess.run(['bash', str(TOOLS / 'update.sh'), sha], env=self.env, capture_output=True)

    def test_branch_names_and_short_hashes_are_refused(self):
        for ref in ('main', SHA[:7], 'HEAD', ''):
            self.assertEqual(self.update(ref).returncode, 2)

    def test_repeat_update_keeps_configuration_data_names_and_fixed_source(self):
        self.mock_commands()
        for _ in range(2):
            result = self.update()
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            current = (self.root / 'current').resolve()
            self.assertEqual((current / 'DEPLOYED_COMMIT').read_text().strip(), SHA)
            source = subprocess.check_output(['git', 'show', f'{SHA}:package.json'], cwd=REPO)
            self.assertEqual((current / 'package.json').read_bytes(), source)
            self.assertEqual((self.root / 'shared/staging.env').read_bytes(), self.config_bytes)
        self.assertEqual(len(list((self.root / 'backups').glob('*/database.dump'))), 2)
        log = self.log.read_text()
        self.assertLess(log.index('pg_dump'), log.index('-T migrate'))
        self.assertLess(log.index('build storefront'), log.index('stop api storefront'))
        self.assertNotIn('down', log)
        self.assertNotIn('prune', log)
        self.assertNotIn('volume rm', log)
        self.assertTrue(all('didar-staging-phase2' in line for line in log.splitlines() if 'compose --' in line))

    def test_failed_build_never_stops_existing_application(self):
        self.mock_commands()
        self.env['MOCK_FAIL'] = 'build'
        self.assertEqual(self.update().returncode, 42)
        self.assertEqual((self.root / 'current').resolve().name, 'old')
        self.assertNotIn('stop api storefront', self.log.read_text())
        self.assertEqual((self.root / 'shared/staging.env').read_bytes(), self.config_bytes)

    def test_failed_migration_keeps_previous_pointer_backup_and_stops_apps(self):
        self.mock_commands()
        self.env['MOCK_FAIL'] = 'migrate'
        result = self.update()
        self.assertEqual(result.returncode, 43)
        self.assertEqual((self.root / 'current').resolve().name, 'old')
        self.assertEqual(len(list((self.root / 'backups').glob('*/database.dump'))), 1)
        log = self.log.read_text()
        self.assertEqual(log.count('stop api storefront'), 2)
        self.assertNotIn('up -d --wait --wait-timeout 300 api', log)
        self.assertNotIn('restore --clean', log)
        self.assertEqual((self.root / 'shared/staging.env').read_bytes(), self.config_bytes)


if __name__ == '__main__':
    unittest.main()
