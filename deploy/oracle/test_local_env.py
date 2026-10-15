"""Verify append-only migration of restored local environment files."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts' / 'cloud-env.mjs'


class LocalEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'packages/api').mkdir(parents=True)
        (self.root / 'apps/storefront').mkdir(parents=True)
        self.config = self.root / 'packages/api/.env'

    def tearDown(self):
        self.temp.cleanup()

    def run_script(self):
        result = subprocess.run(['node', str(SCRIPT)], cwd=self.root, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_legacy_file_gets_only_one_appended_flag(self):
        original = '# keep exact existing bytes\nJWT_SECRET=public-fixture-value\nDATABASE_URL=fixture'
        self.config.write_text(original)
        output = self.run_script()
        expected = original + '\nDIDAR_ENVIRONMENT=local\n'
        self.assertEqual(self.config.read_text(), expected)
        self.run_script()
        self.assertEqual(self.config.read_text(), expected)
        self.assertNotIn('public-fixture-value', output)

    def test_explicit_environment_is_preserved(self):
        for original in ('DIDAR_ENVIRONMENT=staging\n', 'export DIDAR_ENVIRONMENT=local\n', 'DIDAR_ENVIRONMENT=\n'):
            self.config.write_text(original)
            self.run_script()
            self.assertEqual(self.config.read_text(), original)

    def test_new_file_has_private_local_configuration(self):
        self.run_script()
        self.assertIn('DIDAR_ENVIRONMENT=local\n', self.config.read_text())
        self.assertEqual(self.config.stat().st_mode & 0o777, 0o600)

    def test_existing_storefront_file_is_preserved(self):
        existing = self.root / 'apps/storefront/.env.local'
        original = 'MEDUSA_BACKEND_URL=http://local-fixture:9000\n'
        existing.write_text(original)
        self.run_script()
        self.assertEqual(existing.read_text(), original)


if __name__ == '__main__':
    unittest.main()
