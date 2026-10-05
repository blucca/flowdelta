"""Run the complete core and browser regression suite with this Python environment."""
import json
from pathlib import Path
import subprocess
import sys

from browser_support import ARTIFACTS, artifact_dir

SCRIPTS = Path(__file__).resolve().parent
SUITES = [
    ('editable', 'editable-acceptance-test.py'),
    ('values', 'value-ui-test.py'),
    ('swiftia', 'swiftia-smoke.py'),
    ('contact', 'contact-smoke.py'),
]


def main():
    report_path = ARTIFACTS / 'results.json'
    report_path.unlink(missing_ok=True)
    results = {}
    for suite, script in SUITES:
        path = artifact_dir(suite) / 'checks.json'
        path.unlink(missing_ok=True)
        subprocess.run([sys.executable, str(SCRIPTS / script)], check=True)
        results[suite] = json.loads(path.read_text())
    report = results.pop('editable')
    report['existing_browser_regressions'] = {
        name: {
            'passed': sum(bool(check['pass']) for check in checks),
            'failed': sum(not check['pass'] for check in checks),
            'checks': checks,
        }
        for name, checks in results.items()
    }
    groups = [report['browser'], *report['existing_browser_regressions'].values()]
    report['browser_totals'] = {key: sum(group[key] for group in groups) for key in ('passed', 'failed')}
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'core': report['core_tests'], 'browser': report['browser_totals'],
                      'results': str(report_path)}, indent=2))


if __name__ == '__main__':
    main()
