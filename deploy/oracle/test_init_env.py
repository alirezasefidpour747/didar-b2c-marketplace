import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('init_env', Path(__file__).with_name('init-env.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StagingConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous = os.getcwd()
        os.chdir(self.temp.name)

    def tearDown(self):
        os.chdir(self.previous)
        self.temp.cleanup()

    def initialize(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            module.main()
        return output.getvalue()

    def test_generated_config_is_private_and_preserved(self):
        output = self.initialize()
        original = Path('.env').read_text()
        self.assertEqual(Path('.env').stat().st_mode & 0o777, 0o600)
        values = dict(line.split('=', 1) for line in original.splitlines())
        self.assertEqual(values['DIDAR_ENVIRONMENT'], 'staging')
        self.assertEqual(values['DIDAR_SEED_DEMO'], 'false')
        for key in ('DIDAR_DB_PASSWORD', 'JWT_SECRET', 'COOKIE_SECRET'):
            self.assertGreaterEqual(len(values[key]), 32)
            self.assertNotIn(values[key], output)
        self.initialize()
        self.assertEqual(Path('.env').read_text(), original)

    def test_rejects_demo_enabled_configuration(self):
        self.initialize()
        config = Path('.env')
        config.write_text(config.read_text().replace('DIDAR_SEED_DEMO=false', 'DIDAR_SEED_DEMO=true'))
        with self.assertRaisesRegex(AssertionError, 'DIDAR_SEED_DEMO=false'):
            self.initialize()

    def test_rejects_local_configuration(self):
        self.initialize()
        config = Path('.env')
        config.write_text(config.read_text().replace('DIDAR_ENVIRONMENT=staging', 'DIDAR_ENVIRONMENT=local'))
        with self.assertRaisesRegex(AssertionError, 'DIDAR_ENVIRONMENT=staging'):
            self.initialize()

    def test_rejects_readable_secrets(self):
        self.initialize()
        Path('.env').chmod(0o644)
        with self.assertRaisesRegex(AssertionError, 'permissions'):
            self.initialize()


if __name__ == '__main__':
    unittest.main()
