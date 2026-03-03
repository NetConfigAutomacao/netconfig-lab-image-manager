import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


def _install_flask_stub():
    flask_stub = sys.modules.get("flask") or types.ModuleType("flask")

    class DummyFlask:
        def __init__(self, *args, **kwargs):
            pass

        def route(self, *args, **kwargs):
            def decorator(func):
                return func

            return decorator

    class DummyRequest:
        @staticmethod
        def get_json(silent=True):
            return {}

        form = {}
        args = {}

    def dummy_jsonify(*args, **kwargs):
        return {"args": args, "kwargs": kwargs}

    if not hasattr(flask_stub, "Flask"):
        flask_stub.Flask = DummyFlask
    if not hasattr(flask_stub, "jsonify"):
        flask_stub.jsonify = dummy_jsonify
    if not hasattr(flask_stub, "request"):
        flask_stub.request = DummyRequest()
    sys.modules["flask"] = flask_stub


def _import_ishare2_api():
    module_name = "ishare2_api_module"
    if module_name in sys.modules:
        loaded = sys.modules[module_name]
        if hasattr(loaded, "_run_pull_with_repo_fallback"):
            return loaded
        del sys.modules[module_name]

    try:
        import flask
        if not hasattr(flask, "Flask"):
            _install_flask_stub()
    except ModuleNotFoundError:
        _install_flask_stub()

    project_root = Path(__file__).resolve().parent.parent
    module_path = project_root / "ishare2" / "api.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class _DummyUrlResponse:
    def __init__(self, payload: str):
        self._payload = payload.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self._payload


class TestIshare2Api(unittest.TestCase):
    def test_detect_labhub_quota_issue_matches_patterns(self):
        ishare2_api = _import_ishare2_api()

        info = ishare2_api._detect_labhub_quota_issue(
            "HTTP 429 Too Many Requests",
            "Download quota exceeded for this file",
        )

        self.assertTrue(info["detected"])
        self.assertIn("too_many_requests", info["matches"])
        self.assertIn("download_quota", info["matches"])

    def test_detect_labhub_quota_issue_without_match(self):
        ishare2_api = _import_ishare2_api()

        info = ishare2_api._detect_labhub_quota_issue("operation completed", "")

        self.assertFalse(info["detected"])
        self.assertEqual(info["matches"], [])

    def test_discover_repo_prefixes_from_labhub(self):
        ishare2_api = _import_ishare2_api()
        html = """
        <a href="/2:/">repo2</a>
        <a href="/0:/">repo0</a>
        <a href="/1:/">repo1</a>
        <a href="/1:/">repo1-dup</a>
        """

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            return_value=_DummyUrlResponse(html),
        ):
            prefixes = ishare2_api._discover_repo_prefixes_from_labhub()

        self.assertEqual(prefixes, ["/0:", "/1:", "/2:"])

    def test_discover_repo_prefixes_handles_request_error(self):
        ishare2_api = _import_ishare2_api()

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=ishare2_api.urllib.error.URLError("offline"),
        ):
            prefixes = ishare2_api._discover_repo_prefixes_from_labhub()

        self.assertEqual(prefixes, [])

    def test_run_pull_with_repo_fallback_succeeds_on_second_repo(self):
        ishare2_api = _import_ishare2_api()
        attempts = []

        with patch.object(
            ishare2_api,
            "_run_pull_command",
            side_effect=[
                (1, "first fail", "quota exceeded"),
                (0, "fallback ok", ""),
            ],
        ) as run_pull, patch.object(
            ishare2_api,
            "_discover_repo_prefixes_from_labhub",
            return_value=["/0:", "/1:"],
        ):
            result = ishare2_api._run_pull_with_repo_fallback(
                "qemu",
                "51",
                on_attempt=attempts.append,
            )

        self.assertEqual(result["rc"], 0)
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["fallback_prefix"], "/1:")
        self.assertEqual(result["tested_prefixes"], ["/0:", "/1:"])
        self.assertEqual(attempts, ["/0:", "/1:"])

        first_call = run_pull.call_args_list[0]
        self.assertEqual(first_call.args, ("qemu", "51"))
        self.assertEqual(first_call.kwargs, {})

        second_call = run_pull.call_args_list[1]
        self.assertEqual(second_call.args, ("qemu", "51"))
        self.assertEqual(
            second_call.kwargs,
            {"overwrite": True, "forced_prefix": "/1:"},
        )

    def test_run_pull_with_repo_fallback_fails_after_all_attempts(self):
        ishare2_api = _import_ishare2_api()

        with patch.object(
            ishare2_api,
            "_run_pull_command",
            side_effect=[
                (1, "fail /0", "err0"),
                (1, "fail /1", "err1"),
                (1, "fail /2", "err2"),
            ],
        ), patch.object(
            ishare2_api,
            "_discover_repo_prefixes_from_labhub",
            return_value=["/0:", "/1:", "/2:"],
        ):
            result = ishare2_api._run_pull_with_repo_fallback("qemu", "99")

        self.assertEqual(result["rc"], 1)
        self.assertFalse(result["fallback_used"])
        self.assertTrue(result["fallback_attempted"])
        self.assertEqual(result["fallback_prefixes"], ["/1:", "/2:"])
        self.assertEqual(result["tested_prefixes"], ["/0:", "/1:", "/2:"])


if __name__ == "__main__":
    unittest.main()
