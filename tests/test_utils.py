import unittest
from unittest.mock import MagicMock, patch


class TestUtils(unittest.TestCase):
    def _import_utils(self):
        import sys
        from pathlib import Path

        project_root = Path(__file__).resolve().parent.parent
        api_dir = project_root / "api"
        sys.path.insert(0, str(api_dir))
        import utils  # noqa: E402

        return utils

    def test_run_ssh_command_builds_expected_command(self):
        utils = self._import_utils()

        mock_proc = MagicMock()
        mock_proc.communicate.return_value = ("ok", "")
        mock_proc.returncode = 0

        with patch.object(utils.subprocess, "Popen", return_value=mock_proc) as popen, patch(
            "builtins.print"
        ):
            rc, out, err = utils.run_ssh_command("10.0.0.1", "user", "pass", "echo hi")

        self.assertEqual(rc, 0)
        self.assertEqual(out, "ok")
        self.assertEqual(err, "")

        args, kwargs = popen.call_args
        cmd = args[0]
        self.assertIn("sshpass", cmd[0])
        self.assertIn("-p", cmd)
        self.assertIn("ssh", cmd)
        self.assertIn("StrictHostKeyChecking=no", cmd)
        self.assertIn("UserKnownHostsFile=/dev/null", cmd)
        self.assertIn("PreferredAuthentications=password", cmd)
        self.assertIn("PubkeyAuthentication=no", cmd)
        self.assertIn("user@10.0.0.1", cmd)
        self.assertEqual(cmd[-1], "echo hi")
        self.assertTrue(kwargs.get("text"))

    def test_detect_platform_eve_ng(self):
        utils = self._import_utils()

        with patch.object(utils, "run_ssh_command", return_value=(0, "EVE-NG 5.0.0", "")):
            name, raw, source = utils.detect_platform("ip", "u", "p")
        self.assertEqual(name, "eve-ng")
        self.assertIn("eve", raw.lower())
        self.assertEqual(source, "/etc/issue")

    def test_detect_platform_pnetlab(self):
        utils = self._import_utils()

        with patch.object(utils, "run_ssh_command", return_value=(0, "PNETLab 5", "")):
            name, raw, source = utils.detect_platform("ip", "u", "p")
        self.assertEqual(name, "pnetlab")
        self.assertIn("pnetlab", raw.lower())
        self.assertIn("/etc/pnetlab-release", source)

    def test_get_resource_usage_parses_values_and_calculates_mem_percent(self):
        utils = self._import_utils()

        ssh_out = "\n".join(
            [
                "CPU=12",
                "MEM_TOTAL_MB=1000",
                "MEM_USED_MB=250",
                "MEM_FREE_MB=750",
                "DISK_TOTAL_KB=100",
                "DISK_USED_KB=10",
                "DISK_FREE_KB=90",
                "DISK_PCT=10",
            ]
        )

        with patch.object(utils, "run_ssh_command", return_value=(0, ssh_out, "")):
            result = utils.get_resource_usage("ip", "u", "p")

        self.assertEqual(result["ssh_rc"], 0)
        self.assertEqual(result["cpu_percent"], 12.0)
        self.assertEqual(result["mem_total_mb"], 1000.0)
        self.assertEqual(result["mem_used_mb"], 250.0)
        self.assertAlmostEqual(result["mem_percent"], 25.0)
        self.assertEqual(result["disk_percent"], 10.0)

    def test_scp_upload_builds_expected_command(self):
        utils = self._import_utils()

        mock_proc = MagicMock()
        mock_proc.communicate.return_value = ("", "warn")
        mock_proc.returncode = 0

        with patch.object(utils.subprocess, "Popen", return_value=mock_proc) as popen, patch(
            "builtins.print"
        ):
            rc, out, err = utils.scp_upload("10.0.0.2", "user", "pass", "/tmp/a", "/remote/b")

        self.assertEqual(rc, 0)
        self.assertEqual(out, "")
        self.assertEqual(err, "warn")

        args, _kwargs = popen.call_args
        cmd = args[0]
        self.assertIn("sshpass", cmd[0])
        self.assertIn("scp", cmd)
        self.assertIn("/tmp/a", cmd)
        self.assertIn("user@10.0.0.2:/remote/b", cmd)


if __name__ == "__main__":
    unittest.main()
