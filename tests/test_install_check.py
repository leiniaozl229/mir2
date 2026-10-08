import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("install_check", Path(__file__).parents[1] / "scripts/install-check.py")
install_check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(install_check)


class InstallCheckTests(unittest.TestCase):
    def setUp(self):
        supported = patch.object(install_check, "node_supported", return_value=True)
        supported.start()
        self.addCleanup(supported.stop)

    def test_pinned_vite_node_requirement_rejects_old_and_unknown_versions(self):
        # Call the real implementation despite the prerequisite seam above.
        spec = importlib.util.spec_from_file_location("node_version_check", Path(__file__).parents[1] / "scripts/install-check.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for version, accepted in [("v18.20.0", False), ("v20.18.3", False), ("v20.19.0", True),
                                  ("v21.7.0", False), ("v22.11.0", False), ("v22.12.0", True),
                                  ("v24.0.0", True), ("v24.0.0-rc.1", False), (None, False)]:
            with self.subTest(version=version), patch.object(module, "probe", return_value=version), patch.object(module, "have", return_value=True):
                report = module.check("compose")
                self.assertEqual(report["tools"]["nodeVersionSupported"], accepted)
                self.assertEqual("tool:nodeVersionSupported" not in report["failures"], accepted)

    def test_compose_requires_docker_even_with_standalone_compose(self):
        with patch.object(install_check, "have", side_effect=lambda name: name != "docker"):
            report = install_check.check("compose")
        self.assertIn("tool:docker", report["failures"])
        self.assertTrue(report["tools"]["compose"])
        self.assertFalse(report["deliveryComplete"])

    def test_compose_checks_plugin_when_standalone_compose_absent(self):
        with patch.object(install_check, "have", side_effect=lambda name: name != "docker-compose"), \
                patch.object(install_check, "probe", return_value=None) as probe:
            report = install_check.check("compose")
        self.assertIn("tool:compose", report["failures"])
        probe.assert_called_once_with(["docker", "compose", "version"])

    def native_probe(self, argv):
        if argv[-1] == "--list-sdks":
            return "8.0.411 [sdk]\n10.0.100 [sdk]\n"
        return "Microsoft.NETCore.App 8.0.17 [shared]\nMicrosoft.AspNetCore.App 10.0.0 [shared]\n"

    def test_native_does_not_require_docker_or_claim_save_delivery(self):
        with patch.object(install_check.os, "name", "nt"), \
                patch.object(install_check, "have", side_effect=lambda name: name not in ("docker", "bash", "python3")), \
                patch.object(install_check, "probe", side_effect=self.native_probe):
            report = install_check.check("native-windows")
        self.assertTrue(report["ok"], report["failures"])
        self.assertNotIn("docker", report["tools"])
        self.assertFalse(report["deliveryComplete"])
        self.assertFalse(report["capabilities"]["backup"])
        self.assertFalse(report["capabilities"]["restore"])
        self.assertEqual(report["commands"]["backup"], [])
        self.assertEqual(report["commands"]["restore"], [])
        self.assertIn("native-backup-restore-not-implemented", report["deliveryGaps"])
        self.assertFalse(any("wait-ready.py" in cmd or "compose.sh" in cmd for commands in report["commands"].values() for cmd in commands))

    def test_net8_test_build_does_not_pass_stock_net10_gateway(self):
        with patch.object(install_check.os, "name", "nt"), patch.object(install_check, "have", return_value=True), \
                patch.object(install_check, "probe", side_effect=lambda argv: "8.0.411 [sdk]\n" if argv[-1] == "--list-sdks" else "Microsoft.NETCore.App 8.0.17 [shared]\n"):
            report = install_check.check("native-windows")
        self.assertIn("tool:gatewaySdk10", report["failures"])
        self.assertIn("tool:gatewayRuntime10", report["failures"])

    def test_native_paths_are_powershell_quoted_without_interpolation(self):
        dotnet = "C:/SDK's $(hidden)/dotnet.exe"
        with patch.object(install_check.os, "name", "nt"), patch.object(install_check, "have", return_value=True), \
                patch.object(install_check, "probe", side_effect=self.native_probe):
            report = install_check.check("native-windows", dotnet=dotnet)
        self.assertIn("'C:/SDK''s $(hidden)/dotnet.exe'", report["commands"]["install"][2])
        self.assertIn("'-DotNetPath'", report["commands"]["install"][1])

    def test_probe_failure_is_a_missing_prerequisite(self):
        with patch.object(install_check.os, "name", "nt"), patch.object(install_check, "have", return_value=True), \
                patch.object(install_check, "probe", return_value=None):
            report = install_check.check("native-windows")
        self.assertFalse(report["ok"])
        self.assertIn("tool:serverRuntime8", report["failures"])

    def test_mode_is_explicit_and_default_is_compose(self):
        with patch.object(install_check, "have", return_value=True):
            report = install_check.check()
        self.assertEqual(report["mode"], "compose")
        with self.assertRaises(ValueError):
            install_check.check("guess")


if __name__ == "__main__":
    unittest.main()
