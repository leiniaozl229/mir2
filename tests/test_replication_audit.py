import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('replication_audit', Path(__file__).resolve().parents[1] / 'tools/replication_audit.py')
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class ReplicationAuditTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'docs/replication').mkdir(parents=True)
        (self.root / 'source.ts').write_text('production', encoding='utf-8')
        self.ledgers = {}
        for domain, prefix in AUDIT.DOMAINS.items():
            entry = {'id': f'{prefix}-001', 'title': 'Specific requirement', 'status': 'partial', 'sourceEvidence': [{'path': 'source.ts', 'kind': 'contract', 'scope': 'Proposed until original runtime captured'}], 'implementation': ['source.ts'], 'acceptance': ['Run the original/browser open-close scenario'], 'verification': [], 'gaps': ['Original/browser proof missing']}
            self.ledgers[domain] = {'schemaVersion': 1, 'domain': domain, 'requirements': [entry]}
            if domain == 'ui':
                markdown = f'| **{entry["id"]}** Specific requirement | `partial` | Evidence |\n'
            elif domain == 'gameplay':
                markdown = f'| [{entry["id"]}](#{entry["id"].lower()}) | Specific requirement | 部分实现 |\n'
            else:
                markdown = f'### {entry["id"]} Specific requirement\n\n状态：`partial`。\n'
            (self.root / f'docs/{domain}-replication-inventory.md').write_text(markdown, encoding='utf-8')
        self.save()

    def save(self):
        for domain, data in self.ledgers.items():
            (self.root / f'docs/replication/{domain}.json').write_text(json.dumps(data), encoding='utf-8')

    def run_audit(self):
        self.save()
        return AUDIT.audit(self.root)

    def test_partial_entries_are_tracked_without_claiming_completion(self):
        report = self.run_audit()
        self.assertTrue(report['ok'], report['errors'])
        self.assertEqual(report['total'], 3)
        self.assertEqual(report['counts']['verified'], 0)
        self.assertEqual(len(report['warnings']), 3)

    def test_duplicate_ids_are_rejected(self):
        self.ledgers['ui']['requirements'].append(self.ledgers['ui']['requirements'][0].copy())
        self.assertIn('duplicate ID', ' '.join(self.run_audit()['errors']))

    def test_missing_implementation_cannot_be_recorded_as_landed(self):
        self.ledgers['ui']['requirements'][0]['implementation'] = ['absent.ts']
        self.assertFalse(self.run_audit()['ok'])

    def test_docs_cannot_silently_drop_a_requirement(self):
        (self.root / 'docs/ui-replication-inventory.md').write_text('UI-002', encoding='utf-8')
        self.assertIn('Markdown/JSON IDs differ', ' '.join(self.run_audit()['errors']))

    def test_markdown_status_must_match_json(self):
        (self.root / 'docs/ui-replication-inventory.md').write_text('| **UI-001** Specific requirement | `missing` | Evidence |\n', encoding='utf-8')
        self.assertIn('Markdown/JSON status differs: Markdown missing, JSON partial', ' '.join(self.run_audit()['errors']))

    def test_source_review_and_protocol_success_cannot_close_visual_acceptance(self):
        entry = self.ledgers['ui']['requirements'][0]
        entry.update(status='verified', gaps=[])
        entry['verification'] = [{'path': 'source.ts', 'kind': 'source_review', 'scope': 'Button exists'}]
        errors = ' '.join(self.run_audit()['errors'])
        for missing in ('original executable', 'browser interaction', 'original/browser comparison'):
            self.assertIn(missing, errors)

    def test_empty_acceptance_and_invalid_schema_are_rejected(self):
        self.ledgers['ui']['requirements'][0]['acceptance'] = []
        self.ledgers['gameplay']['schemaVersion'] = 2
        errors = ' '.join(self.run_audit()['errors'])
        self.assertIn('acceptance scenario', errors)
        self.assertIn('schemaVersion', errors)

    def test_malformed_arrays_report_errors_without_crashing(self):
        entry = self.ledgers['ui']['requirements'][0]
        entry.update(implementation=None, status=['verified'])
        entry['verification'] = [{'path': 'source.ts', 'kind': ['browser_runtime'], 'scope': 'invalid'}]
        self.assertFalse(self.run_audit()['ok'])
        entry['status'] = 'verified'
        self.assertFalse(self.run_audit()['ok'])

    def test_changed_capture_invalidates_verified_evidence(self):
        capture = self.root / 'capture.json'
        capture.write_text('original capture', encoding='utf-8')
        digest = hashlib.sha256(capture.read_bytes()).hexdigest()
        entry = self.ledgers['ui']['requirements'][0]
        entry.update(status='verified', gaps=[])
        (self.root / 'docs/ui-replication-inventory.md').write_text('| **UI-001** Specific requirement | `verified` | Evidence |\n', encoding='utf-8')
        entry['verification'] = [{'path': 'capture.json', 'kind': kind, 'scope': 'All listed scenarios', 'recordedAt': '2026-10-01T00:00:00Z', 'environment': 'Target original and production browser', 'sha256': digest} for kind in ('native_runtime', 'browser_runtime', 'visual_comparison')]
        self.assertTrue(self.run_audit()['ok'])
        capture.write_text('different capture', encoding='utf-8')
        self.assertIn('differs from recorded sha256', ' '.join(self.run_audit()['errors']))


if __name__ == '__main__':
    unittest.main()
