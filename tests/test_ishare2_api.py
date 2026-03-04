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
        ordered_repos = [
            {
                "id": ishare2_api._HEXA_REPO_ID,
                "host": ishare2_api._HEXA_REPO_HOST,
                "prefix": ishare2_api._HEXA_REPO_PREFIX,
                "protocol": "https",
                "kind": "hexa",
            },
            {
                "id": "/0:",
                "host": ishare2_api._LABHUB_HOST,
                "prefix": "/0:",
                "protocol": "https",
                "kind": "labhub",
            },
        ]
        latency_map = {
            ishare2_api._HEXA_REPO_ID: 15.1,
            "/0:": 25.9,
        }

        with patch.object(
            ishare2_api,
            "_run_pull_command",
            side_effect=[
                (1, "first fail", "quota exceeded"),
                (0, "fallback ok", ""),
            ],
        ) as run_pull, patch.object(
            ishare2_api,
            "_build_repository_candidates",
            return_value=ordered_repos,
        ), patch.object(
            ishare2_api,
            "_order_repositories_by_latency",
            return_value=(ordered_repos, latency_map),
        ):
            result = ishare2_api._run_pull_with_repo_fallback(
                "qemu",
                "51",
                on_attempt=attempts.append,
            )

        self.assertEqual(result["rc"], 0)
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["fallback_prefix"], "/0:")
        self.assertEqual(result["tested_prefixes"], [ishare2_api._HEXA_REPO_ID, "/0:"])
        self.assertEqual(attempts, [ishare2_api._HEXA_REPO_ID, "/0:"])
        self.assertEqual(result["ranked_prefixes"], [ishare2_api._HEXA_REPO_ID, "/0:"])
        self.assertEqual(result["latency_ms"], latency_map)
        self.assertEqual(len(result["attempt_details"]), 2)
        self.assertEqual(result["attempt_details"][0]["repo_id"], ishare2_api._HEXA_REPO_ID)
        self.assertFalse(result["attempt_details"][0]["success"])
        self.assertEqual(result["attempt_details"][0]["reason_code"], "quota")
        self.assertEqual(result["attempt_details"][1]["repo_id"], "/0:")
        self.assertTrue(result["attempt_details"][1]["success"])

        first_call = run_pull.call_args_list[0]
        self.assertEqual(first_call.args, ("qemu", "51"))
        self.assertEqual(
            first_call.kwargs,
            {
                "overwrite": False,
                "forced_prefix": ishare2_api._HEXA_REPO_PREFIX,
                "forced_hostname": ishare2_api._HEXA_REPO_HOST,
                "forced_protocol": "https",
            },
        )

        second_call = run_pull.call_args_list[1]
        self.assertEqual(second_call.args, ("qemu", "51"))
        self.assertEqual(
            second_call.kwargs,
            {
                "overwrite": True,
                "forced_prefix": "/0:",
                "forced_hostname": ishare2_api._LABHUB_HOST,
                "forced_protocol": "https",
            },
        )

    def test_run_pull_with_repo_fallback_fails_after_all_attempts(self):
        ishare2_api = _import_ishare2_api()
        ordered_repos = [
            {
                "id": ishare2_api._HEXA_REPO_ID,
                "host": ishare2_api._HEXA_REPO_HOST,
                "prefix": ishare2_api._HEXA_REPO_PREFIX,
                "protocol": "https",
                "kind": "hexa",
            },
            {
                "id": "/0:",
                "host": ishare2_api._LABHUB_HOST,
                "prefix": "/0:",
                "protocol": "https",
                "kind": "labhub",
            },
            {
                "id": "/1:",
                "host": ishare2_api._LABHUB_HOST,
                "prefix": "/1:",
                "protocol": "https",
                "kind": "labhub",
            },
        ]
        latency_map = {
            ishare2_api._HEXA_REPO_ID: 14.2,
            "/0:": 31.0,
            "/1:": 35.0,
        }

        with patch.object(
            ishare2_api,
            "_run_pull_command",
            side_effect=[
                (1, "", "404 not found"),
                (1, "", "connection timed out"),
                (1, "", "download quota exceeded"),
            ],
        ), patch.object(
            ishare2_api,
            "_build_repository_candidates",
            return_value=ordered_repos,
        ), patch.object(
            ishare2_api,
            "_order_repositories_by_latency",
            return_value=(ordered_repos, latency_map),
        ):
            result = ishare2_api._run_pull_with_repo_fallback("qemu", "99")

        self.assertEqual(result["rc"], 1)
        self.assertFalse(result["fallback_used"])
        self.assertTrue(result["fallback_attempted"])
        self.assertEqual(result["fallback_prefixes"], ["/0:", "/1:"])
        self.assertEqual(result["tested_prefixes"], [ishare2_api._HEXA_REPO_ID, "/0:", "/1:"])
        self.assertEqual(result["ranked_prefixes"], [ishare2_api._HEXA_REPO_ID, "/0:", "/1:"])
        self.assertEqual(result["latency_ms"], latency_map)
        self.assertEqual(len(result["attempt_details"]), 3)
        self.assertEqual(result["attempt_details"][0]["reason_code"], "not_found")
        self.assertEqual(result["attempt_details"][1]["reason_code"], "timeout")
        self.assertEqual(result["attempt_details"][2]["reason_code"], "quota")

    def test_summarize_attempts_for_user(self):
        ishare2_api = _import_ishare2_api()

        summary = ishare2_api._summarize_attempts_for_user(
            [
                {
                    "repo_id": "repo.hexanetworks.com.br",
                    "latency_ms": 101.5,
                    "success": False,
                    "reason": "imagem não encontrada neste repositório",
                },
                {
                    "repo_id": "/0:",
                    "latency_ms": 300.0,
                    "success": True,
                    "reason": "",
                },
            ]
        )

        self.assertIn("repo.hexanetworks.com.br (101.5ms): imagem não encontrada neste repositório", summary)
        self.assertIn("/0: (300.0ms): sucesso", summary)


if __name__ == "__main__":
    unittest.main()
