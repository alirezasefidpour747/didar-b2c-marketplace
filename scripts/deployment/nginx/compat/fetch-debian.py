#!/usr/bin/env python3
"""Authenticate and extract exact Debian candidates; never install host packages."""
import datetime
import email.utils
import hashlib
import json
import lzma
import pathlib
import shutil
import subprocess
import sys

EXPECTED = {
    'nginx': ('1.26.3-3+deb13u9', '29258fa0e2f4c9162a95eda2c36cf84ee8f57289a14c58fb7e6d3868c61a5db3'),
    'nginx-common': ('1.26.3-3+deb13u9', 'd0eab69fa763305d11bd623418118b61da1738aacd1390cd4465b7773289df1c'),
    'libnginx-mod-stream': ('1.26.3-3+deb13u9', '31503877739cdb8f0423ad3b43ac36d73beb50d6a0d4ff05b190b377c5014d2a'),
    'libnginx-mod-http-js': ('0.8.9-1', '2892f45cb35b3893f4d331d817ad88f5fece1934dc8b83acfe6eaa6d321a6e2c'),
    'njs': ('0.8.9-1', '6a411db62c936cbd9d1edf913f3ae8db2b7cf86a7a71f6e162b43a4c8e6a179b'),
}

def main():
    if len(sys.argv) not in [2, 3] or (len(sys.argv) == 3 and sys.argv[2] not in ['--runtime-context', '--daemon-context']):
        raise SystemExit('Usage: fetch-debian.py <new-evidence-directory> [--runtime-context|--daemon-context]')
    runtime_context = len(sys.argv) == 3 and sys.argv[2] == '--runtime-context'
    daemon_context = len(sys.argv) == 3 and sys.argv[2] == '--daemon-context'
    pins = json.loads(pathlib.Path(__file__).with_name('runtime-pins.json' if runtime_context else 'daemon-pins.json').read_text()) if (runtime_context or daemon_context) else EXPECTED
    directory = pathlib.Path(sys.argv[1]).resolve()
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    receipts = []
    def run(*args):
        observed = subprocess.run(args, capture_output=True, text=True)
        record = {'argv': list(args), 'exit_code': observed.returncode, 'stdout': observed.stdout, 'stderr': observed.stderr}
        receipts.append(record)
        (directory / 'process-exits.json').write_text(json.dumps(receipts, indent=2) + '\n')
        if observed.returncode != 0:
            raise RuntimeError('PROCESS_FAILED: ' + args[0])
        return observed.stdout
    def download(url, destination):
        run('curl', '--fail', '--silent', '--show-error', '--proto', '=https', url, '-o', str(destination))
    try:
        indexes = []
        for suite, base in [('trixie-security', 'https://security.debian.org/debian-security/'), ('trixie', 'https://deb.debian.org/debian/')]:
            signed = directory / (suite + '-InRelease')
            release = directory / (suite + '-Release')
            index = directory / (suite + '-Packages.xz')
            download(base + 'dists/' + suite + '/InRelease', signed)
            run('sqv', '--keyring=/usr/share/keyrings/debian-archive-keyring.pgp', '--cleartext', '--output=' + str(release), str(signed))
            text = release.read_text()
            # Security repositories expire. Do not accept a stale signed snapshot.
            until = next((line[13:] for line in text.splitlines() if line.startswith('Valid-Until: ')), None)
            if until and email.utils.parsedate_to_datetime(until) <= datetime.datetime.now(datetime.timezone.utc):
                raise RuntimeError('EXPIRED_DEBIAN_INDEX')
            download(base + 'dists/' + suite + '/main/binary-amd64/Packages.xz', index)
            sha_lines = text.split('SHA256:\n', 1)[1].split('\n')
            matches = [line.split() for line in sha_lines if line.startswith(' ') and line.split()[-1] == 'main/binary-amd64/Packages.xz']
            if len(matches) != 1 or int(matches[0][1]) != index.stat().st_size or matches[0][0] != hashlib.sha256(index.read_bytes()).hexdigest():
                raise RuntimeError('SIGNED_INDEX_HASH_MISMATCH')
            indexes.append((base, lzma.open(index, 'rt').read().split('\n\n')))
        packages = []
        for name, (version, expected_sha) in pins.items():
            match = next(((base, b) for base, blocks in indexes for b in blocks if b.startswith('Package: ' + name + '\n') and '\nVersion: ' + version + '\n' in b), None)
            if match is None:
                raise RuntimeError('PIN_NOT_IN_CURRENT_SIGNED_INDEX: ' + name)
            base, block = match
            fields = dict(line.split(': ', 1) for line in block.splitlines() if ': ' in line and not line.startswith(' '))
            if fields.get('Architecture') not in ['amd64', 'all'] or fields.get('SHA256') != expected_sha:
                raise RuntimeError('PACKAGE_PIN_MISMATCH')
            relative = pathlib.PurePosixPath(fields['Filename'])
            if not str(relative).startswith('pool/') or '..' in relative.parts:
                raise RuntimeError('UNSAFE_PACKAGE_PATH')
            archive = directory / relative.name
            download(base + str(relative), archive)
            if hashlib.sha256(archive.read_bytes()).hexdigest() != expected_sha or archive.stat().st_size != int(fields['Size']):
                raise RuntimeError('PACKAGE_HASH_MISMATCH')
            run('dpkg-deb', '--extract', str(archive), str(directory / 'root'))
            fields['url'] = base + str(relative)
            packages.append(fields)
        metadata = {'status': 'PASS', 'scope': 'isolated extraction, no installation', 'architecture': 'amd64', 'packages': packages}
        (directory / 'packages.json').write_text(json.dumps(metadata, indent=2) + '\n')
        if runtime_context or daemon_context:
            shutil.copyfile(pathlib.Path(__file__).with_name('Dockerfile' if runtime_context else 'Dockerfile.daemon'), directory / 'Dockerfile')
            (directory / '.dockerignore').write_text('*\n!Dockerfile\n!root/\n!root/**\n')
            target = directory / 'root/opt/didar/nginx'
            target.mkdir(parents=True, exist_ok=True)
            if runtime_context:
                for filename in ['auth.mjs', 'sign.mjs']:
                    shutil.copyfile(pathlib.Path(__file__).parent.parent / filename, target / filename)
            shutil.copyfile(directory / 'packages.json', directory / 'root/opt/didar/debian-package-provenance.json')
        print(json.dumps({'status': 'PASS', 'packages': len(packages), 'runtime_context': runtime_context, 'daemon_context': daemon_context}))
    except BaseException as error:
        (directory / 'failure.json').write_text(json.dumps({'status': 'FAIL', 'error': str(error)}) + '\n')
        raise

if __name__ == '__main__':
    main()
