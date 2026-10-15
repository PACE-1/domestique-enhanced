"""The release gate must fail closed even when its diagnostic reruns pass."""
import os
from pathlib import Path
import subprocess

import pytest

GATE = Path(__file__).resolve().parent.parent / 'tools' / 'gate.sh'


def _run(tmp_path, bulk=0, serial=0, *, known=False, timeout=False):
    (tmp_path / 'tests').mkdir()
    node = 'tests/test_probe.py::test_failure'
    (tmp_path / 'tests' / 'known-failures-clean-main.txt').write_text(node if known else '')
    fake = tmp_path / 'python'
    fake.write_text('''#!/usr/bin/env python3
import os, sys, time
from pathlib import Path
args = sys.argv[1:]
with Path(os.environ['CALLS']).open('a') as f:
    f.write(repr(args) + '\\n')
if '--tb=short' in args and not 'tests/' in args:
    print('1 passed')
    sys.exit(0)
serial = 'not hardware and release_serial' in args
if not serial and os.environ.get('SLOW'):
    time.sleep(5)
code = int(os.environ['SERIAL' if serial else 'BULK'])
if code == 1:
    print('FAILED tests/test_probe.py::test_failure - diagnostic failure')
print('test-run-status', code)
sys.exit(code)
''')
    fake.chmod(0o755)
    env = dict(os.environ, GATE_PYTHON=str(fake), GATE_OUT=str(tmp_path / 'logs'),
               BULK=str(bulk), SERIAL=str(serial), CALLS=str(tmp_path / 'calls'))
    if timeout:
        env.update(SLOW='1', GATE_BULK_TIMEOUT='0.1')
    return subprocess.run(['bash', str(GATE), str(tmp_path), 'probe'], env=env,
                          capture_output=True, text=True, timeout=15)


@pytest.mark.parametrize('code', [0, 1, 2, 3, 4, 5, 124, 137])
def test_gate_preserves_bulk_status(tmp_path, code):
    result = _run(tmp_path, bulk=code)
    assert result.returncode == code, result.stdout + result.stderr
    if code > 1:
        assert len((tmp_path / 'calls').read_text().splitlines()) == 1


def test_gate_preserves_serial_failure(tmp_path):
    assert _run(tmp_path, serial=1).returncode == 1


def test_historical_failure_is_still_a_failure(tmp_path):
    assert _run(tmp_path, bulk=1, known=True).returncode == 1
    assert not (tmp_path / 'logs/probe.alone.txt').read_text()


def test_passing_rerun_does_not_erase_original_failure(tmp_path):
    assert _run(tmp_path, bulk=1).returncode == 1
    assert 'test_failure' in (tmp_path / 'logs/probe.alone.txt').read_text()


def test_outer_timeout_fails_without_running_more_tests(tmp_path):
    result = _run(tmp_path, timeout=True)
    assert result.returncode == 124
    assert len((tmp_path / 'calls').read_text().splitlines()) == 1


def test_missing_interpreter_is_not_success(tmp_path):
    env = dict(os.environ, GATE_PYTHON=str(tmp_path / 'missing'))
    result = subprocess.run(['bash', str(GATE), str(tmp_path), 'probe'], env=env,
                            capture_output=True, text=True, timeout=5)
    assert result.returncode == 2
