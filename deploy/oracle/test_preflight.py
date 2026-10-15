import io,json,unittest
from unittest.mock import patch,mock_open,MagicMock
import preflight

class CostBoundaryTests(unittest.TestCase):
    def run_guard(self,*,shape='VM.Standard.A1.Flex',ocpus=2,memory=12,machine='aarch64',env='staging',confirmed='yes',marker='didar-staging-only'):
        response=io.BytesIO(json.dumps({'shape':shape,'shapeConfig':{'ocpus':ocpus,'memoryInGBs':memory}}).encode())
        client=MagicMock();client.open.return_value.__enter__.return_value=response
        with patch.dict(preflight.os.environ,{'DIDAR_DEPLOY_ENV':env,'OCI_ALWAYS_FREE_CONFIRMED':confirmed}), patch.object(preflight.platform,'machine',return_value=machine), patch.object(preflight.os,'cpu_count',return_value=2), patch('builtins.open',side_effect=lambda path,*args,**kwargs: io.StringIO('ID=ubuntu\n' if path=='/etc/os-release' else marker)), patch.object(preflight.shutil,'disk_usage',return_value=MagicMock(free=30*1024**3)),patch.object(preflight.urllib.request,'build_opener',return_value=client):
            preflight.main()
    def test_accepts_requested_free_shape_and_limits(self): self.run_guard()
    def test_rejects_production(self):
        with self.assertRaises(AssertionError): self.run_guard(env='production')
    def test_rejects_unmarked_host(self):
        with self.assertRaises(AssertionError): self.run_guard(marker='')
    def test_rejects_x64(self):
        with self.assertRaises(AssertionError): self.run_guard(machine='x86_64')
    def test_rejects_more_than_two_ocpus(self):
        with self.assertRaises(AssertionError): self.run_guard(ocpus=3)
    def test_rejects_more_than_twelve_gb(self):
        with self.assertRaises(AssertionError): self.run_guard(memory=13)
    def test_rejects_other_shapes(self):
        with self.assertRaises(AssertionError): self.run_guard(shape='VM.Standard.E4.Flex')
    def test_requires_always_free_eligibility_confirmation(self):
        with self.assertRaises(AssertionError): self.run_guard(confirmed='no')
if __name__=='__main__': unittest.main()
