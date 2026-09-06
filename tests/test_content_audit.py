import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_audit():
    spec = importlib.util.spec_from_file_location("content_audit", ROOT / "tools/content_audit.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ContentAuditTests(unittest.TestCase):
    def test_generated_classic_profile_is_closed(self):
        module = load_audit()
        report = module.audit()
        self.assertTrue(report["ok"], report["failures"])
        self.assertEqual(report["maps"]["expected"], 570)
        self.assertEqual(report["maps"]["exported"], 570)
        self.assertEqual(report["maps"]["dependencyMissing"], {})
        self.assertEqual(report["routes"]["missingDestinations"], [])
        self.assertEqual(report["routes"]["unknownDestinations"], [])
        self.assertEqual(report["sourceLocks"]["map"]["locked"], 3)

    def test_markdown_report_mentions_declared_uncertainty(self):
        module = load_audit()
        report = module.audit()
        rendered = module.markdown(report)
        self.assertIn("内容审计", rendered)
        self.assertIn("已声明待校准项", rendered)
        self.assertIn("参考客户端", rendered)
        json.dumps(report, ensure_ascii=False)


if __name__ == "__main__":
    unittest.main()
