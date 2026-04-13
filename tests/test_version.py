import os
import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch


class TestVersion(unittest.TestCase):
    def _import_version(self):
        import sys
        from pathlib import Path

        project_root = Path(__file__).resolve().parent.parent
        api_dir = project_root / "api"
        sys.path.insert(0, str(api_dir))
        import version  # noqa: E402

        return version

    def test_normalize_tag_to_semver(self):
        version = self._import_version()

        self.assertEqual(version._normalize_tag_to_semver("v1.2.3"), (1, 2, 3))
        self.assertEqual(version._normalize_tag_to_semver("V1.2.3"), (1, 2, 3))
        self.assertEqual(version._normalize_tag_to_semver("1.2.3+build.7"), (1, 2, 3))
        self.assertEqual(version._normalize_tag_to_semver("1.2.3-rc.1"), (1, 2, 3))
        self.assertIsNone(version._normalize_tag_to_semver(""))
        self.assertIsNone(version._normalize_tag_to_semver("1.2"))
        self.assertIsNone(version._normalize_tag_to_semver("1.2.3.4"))
        self.assertIsNone(version._normalize_tag_to_semver("v1.a.3"))

    def test_is_newer(self):
        version = self._import_version()

        self.assertTrue(version._is_newer("v1.2.4", "1.2.3"))
        self.assertTrue(version._is_newer("1.10.0", "1.2.9"))
        self.assertFalse(version._is_newer("1.2.3", "1.2.3"))
        self.assertFalse(version._is_newer("1.2", "1.2.3"))
        self.assertFalse(version._is_newer("1.2.3", "1.2"))

    def test_get_app_version_from_env(self):
        version = self._import_version()
        with patch.dict(os.environ, {"APP_VERSION": "9.9.9"}):
            self.assertEqual(version.get_app_version(), "9.9.9")

    def test_get_app_version_from_cwd_file(self):
        version = self._import_version()

        with TemporaryDirectory() as tmp:
            old_cwd = os.getcwd()
            try:
                os.chdir(tmp)
                with open("VERSION", "w", encoding="utf-8") as f:
                    f.write("2.3.4\n")

                cwd_version_path = version.Path.cwd() / "VERSION"

                def _exists(self):
                    return self == cwd_version_path

                def _read_text(self, encoding="utf-8"):
                    if self == cwd_version_path:
                        return "2.3.4\n"
                    raise FileNotFoundError(str(self))

                with patch.dict(os.environ, {"APP_VERSION": ""}, clear=False), patch.object(
                    version.Path, "exists", _exists
                ), patch.object(version.Path, "read_text", _read_text):
                    self.assertEqual(version.get_app_version(), "2.3.4")
            finally:
                os.chdir(old_cwd)

    def test_check_for_update_cache(self):
        version = self._import_version()

        with patch.object(version, "get_app_version", return_value="1.0.0"), patch.object(
            version, "get_latest_github_release", return_value={"tag_name": "v1.0.1", "html_url": "x", "repo": "r", "source": "release"}
        ), patch.object(
            version,
            "get_update_helper_info",
            return_value={
                "project_dir": "/opt/eve-image-manager",
                "git_branch": "main",
                "git_remote_url": "https://github.com/example/repo.git",
                "dirty_worktree": False,
                "update_script_path": "/opt/eve-image-manager/scripts/update.sh",
                "update_script_exists": True,
                "update_command": "cd /opt/eve-image-manager && ./scripts/update.sh",
            },
        ):
            first = version.check_for_update(force=True)
            self.assertTrue(first["success"])
            self.assertTrue(first["update_available"])
            self.assertFalse(first["cached"])
            self.assertEqual(first["update_command"], "cd /opt/eve-image-manager && ./scripts/update.sh")

            second = version.check_for_update(force=False)
            self.assertTrue(second["success"])
            self.assertTrue(second["cached"])
            self.assertEqual(second["git_branch"], "main")

    def test_get_update_helper_info(self):
        version = self._import_version()

        with patch.object(version, "get_project_root", return_value=version.Path("/opt/eve-image-manager")), patch.object(
            version,
            "_run_git_command",
            side_effect=["version-check", "https://github.com/NetConfigAutomacao/netconfig-lab-image-manager.git", " M api/version.py"],
        ), patch.object(version.Path, "exists", return_value=True):
            info = version.get_update_helper_info()

        self.assertEqual(info["project_dir"], "/opt/eve-image-manager")
        self.assertEqual(info["git_branch"], "version-check")
        self.assertTrue(info["git_remote_url"].startswith("https://github.com/NetConfigAutomacao/"))
        self.assertTrue(info["dirty_worktree"])
        self.assertEqual(info["update_script_path"], "/opt/eve-image-manager/scripts/update.sh")
        self.assertEqual(info["update_command"], "cd /opt/eve-image-manager && ./scripts/update.sh")

    def test_get_project_root_supports_container_layout(self):
        version = self._import_version()

        def _exists(self):
            return self == version.Path("/app/VERSION")

        with patch.object(version, "__file__", "/app/version.py"), patch.object(version.Path, "exists", _exists):
            root = version.get_project_root()

        self.assertEqual(root, version.Path("/app"))


if __name__ == "__main__":
    unittest.main()
