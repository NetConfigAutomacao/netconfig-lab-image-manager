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
    def __init__(self, payload: str, url: str = "https://labhub.eu.org/0:/"):
        self._payload = payload.encode("utf-8")
        self._url = url

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self._payload

    def geturl(self):
        return self._url


def _urlopen_map(payloads):
    def _side_effect(req, timeout=0):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        if url not in payloads:
            raise AssertionError(f"unexpected urlopen request: {url}")
        payload = payloads[url]
        if isinstance(payload, Exception):
            raise payload
        if isinstance(payload, tuple):
            body, final_url = payload
        else:
            body, final_url = payload, url
        return _DummyUrlResponse(body, url=final_url)

    return _side_effect


def _clear_ishare2_caches(ishare2_api):
    ishare2_api._LABHUB_PREFIX_CONTENT_CACHE.clear()
    ishare2_api._REPO_API_CONTENT_CACHE.clear()
    ishare2_api._REPO_API_LISTING_CACHE.clear()
    ishare2_api._LABHUB_LISTING_CACHE.clear()


class TestIshare2Api(unittest.TestCase):
    def setUp(self):
        _clear_ishare2_caches(_import_ishare2_api())

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

    def test_labhub_prefix_has_content_accepts_non_empty_listing(self):
        ishare2_api = _import_ishare2_api()
        ishare2_api._LABHUB_PREFIX_CONTENT_CACHE.clear()
        payloads = {
            "https://labhub.eu.org/0:/addons/dynamips/": '{"data":{"files":[{"name":"c7200.image","mimeType":"application/x-executable","link":"/download.aspx?file=1"}]}}',
        }

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=_urlopen_map(payloads),
        ):
            self.assertTrue(ishare2_api._labhub_prefix_has_content("/0:"))

    def test_labhub_prefix_has_content_accepts_file_in_subfolder(self):
        ishare2_api = _import_ishare2_api()
        ishare2_api._LABHUB_PREFIX_CONTENT_CACHE.clear()
        payloads = {
            "https://labhub.eu.org/0:/addons/dynamips/": '{"data":{"files":[]}}',
            "https://labhub.eu.org/0:/addons/iol/": '{"data":{"files":[{"name":"bin","mimeType":"application/vnd.google-apps.folder","link":null}]}}',
            "https://labhub.eu.org/0:/addons/iol/bin/": '{"data":{"files":[{"name":"i86bi.bin","mimeType":"application/x-executable","link":"/download.aspx?file=2"}]}}',
        }

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=_urlopen_map(payloads),
        ):
            self.assertTrue(ishare2_api._labhub_prefix_has_content("/0:"))

    def test_labhub_prefix_has_content_rejects_empty_listing(self):
        ishare2_api = _import_ishare2_api()
        ishare2_api._LABHUB_PREFIX_CONTENT_CACHE.clear()
        payloads = {
            "https://labhub.eu.org/1:/addons/dynamips/": '{"data":{"files":[]}}',
            "https://labhub.eu.org/1:/addons/iol/": '{"data":{"files":[{"name":"bin","mimeType":"application/vnd.google-apps.folder","link":null}]}}',
            "https://labhub.eu.org/1:/addons/iol/bin/": '{"data":{"files":[]}}',
            "https://labhub.eu.org/1:/addons/qemu/": '{"data":{"files":[{"name":"Vendor","mimeType":"application/vnd.google-apps.folder","link":null}]}}',
            "https://labhub.eu.org/1:/addons/qemu/Vendor/": '{"data":{"files":[]}}',
        }

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=_urlopen_map(payloads),
        ):
            self.assertFalse(ishare2_api._labhub_prefix_has_content("/1:"))

    def test_labhub_prefix_has_content_rejects_redirected_listing(self):
        ishare2_api = _import_ishare2_api()
        ishare2_api._LABHUB_PREFIX_CONTENT_CACHE.clear()
        payloads = {
            "https://labhub.eu.org/1:/addons/dynamips/": (
                '{"data":{"files":[{"name":"c7200.image","mimeType":"application/x-executable","link":"/download.aspx?file=1"}]}}',
                "https://labhub.eu.org/0:/addons/dynamips/",
            ),
            "https://labhub.eu.org/1:/addons/iol/": (
                '{"data":{"files":[{"name":"bin","mimeType":"application/vnd.google-apps.folder","link":null}]}}',
                "https://labhub.eu.org/0:/addons/iol/",
            ),
            "https://labhub.eu.org/1:/addons/qemu/": (
                '{"data":{"files":[{"name":"Vendor","mimeType":"application/vnd.google-apps.folder","link":null}]}}',
                "https://labhub.eu.org/0:/addons/qemu/",
            ),
        }

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=_urlopen_map(payloads),
        ):
            self.assertFalse(ishare2_api._labhub_prefix_has_content("/1:"))

    def test_repo_api_repository_has_content_accepts_netconfig_file_listing(self):
        ishare2_api = _import_ishare2_api()
        ishare2_api._REPO_API_CONTENT_CACHE.clear()
        repository = {
            "id": ishare2_api._NETCONFIG_REPO_ID,
            "host": ishare2_api._NETCONFIG_REPO_HOST,
            "prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
            "protocol": "https",
            "kind": "catalog",
        }
        payloads = {
            "https://repo.netconfig.com.br/api/item?path=addons%2Fdynamips": '{"currentPath":"addons/dynamips","entries":[]}',
            "https://repo.netconfig.com.br/api/item?path=addons%2Fiol": '{"currentPath":"addons/iol","entries":[{"name":"gen.py","path":"addons/iol/gen.py","kind":"file","size":1056}]}',
        }

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=_urlopen_map(payloads),
        ):
            self.assertTrue(ishare2_api._repo_api_repository_has_content(repository))

    def test_repo_api_repository_has_content_accepts_netconfig_file_in_subfolder(self):
        ishare2_api = _import_ishare2_api()
        ishare2_api._REPO_API_CONTENT_CACHE.clear()
        repository = {
            "id": ishare2_api._NETCONFIG_REPO_ID,
            "host": ishare2_api._NETCONFIG_REPO_HOST,
            "prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
            "protocol": "https",
            "kind": "catalog",
        }
        payloads = {
            "https://repo.netconfig.com.br/api/item?path=addons%2Fdynamips": '{"currentPath":"addons/dynamips","entries":[]}',
            "https://repo.netconfig.com.br/api/item?path=addons%2Fiol": '{"currentPath":"addons/iol","entries":[{"name":"bin","path":"addons/iol/bin","kind":"folder","size":0}]}',
            "https://repo.netconfig.com.br/api/item?path=addons%2Fiol%2Fbin": '{"currentPath":"addons/iol/bin","entries":[{"name":"i86bi.bin","path":"addons/iol/bin/i86bi.bin","kind":"file","size":42}]}',
        }

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=_urlopen_map(payloads),
        ):
            self.assertTrue(ishare2_api._repo_api_repository_has_content(repository))

    def test_repo_api_repository_has_content_rejects_empty_netconfig_listing(self):
        ishare2_api = _import_ishare2_api()
        ishare2_api._REPO_API_CONTENT_CACHE.clear()
        repository = {
            "id": ishare2_api._NETCONFIG_REPO_ID,
            "host": ishare2_api._NETCONFIG_REPO_HOST,
            "prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
            "protocol": "https",
            "kind": "catalog",
        }
        payloads = {
            "https://repo.netconfig.com.br/api/item?path=addons%2Fdynamips": '{"currentPath":"addons/dynamips","entries":[]}',
            "https://repo.netconfig.com.br/api/item?path=addons%2Fiol": '{"currentPath":"addons/iol","entries":[]}',
            "https://repo.netconfig.com.br/api/item?path=addons%2Fqemu": '{"currentPath":"addons/qemu","entries":[{"name":"Vendor","path":"addons/qemu/Vendor","kind":"folder","size":0}]}',
            "https://repo.netconfig.com.br/api/item?path=addons%2Fqemu%2FVendor": '{"currentPath":"addons/qemu/Vendor","entries":[]}',
        }

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=_urlopen_map(payloads),
        ):
            self.assertFalse(ishare2_api._repo_api_repository_has_content(repository))

    def test_repository_has_image_content_rejects_missing_netconfig_qemu_image(self):
        ishare2_api = _import_ishare2_api()
        repository = {
            "id": ishare2_api._NETCONFIG_REPO_ID,
            "host": ishare2_api._NETCONFIG_REPO_HOST,
            "prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
            "protocol": "https",
            "kind": "catalog",
        }
        payloads = {
            "https://repo.netconfig.com.br/api/item?path=addons%2Fqemu%2Fcsr1000v-17-03-06": '{"message":"Failed to list directory","error":"ENOENT"}',
            "https://repo.netconfig.com.br/api/item?path=addons%2Fqemu": '{"currentPath":"addons/qemu","entries":[{"name":"other-image","path":"addons/qemu/other-image","kind":"folder","size":0}]}',
        }

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=_urlopen_map(payloads),
        ):
            self.assertFalse(
                ishare2_api._repository_has_image_content(
                    repository,
                    "qemu",
                    "csr1000v-17-03-06",
                )
            )

    def test_repository_has_image_content_rejects_empty_labhub_qemu_folder(self):
        ishare2_api = _import_ishare2_api()
        repository = {
            "id": "/0:",
            "host": ishare2_api._LABHUB_HOST,
            "prefix": "/0:",
            "protocol": "https",
            "kind": "labhub",
        }
        payloads = {
            "https://labhub.eu.org/0:/addons/qemu/csr1000v-17-03-06/": '{"data":{"files":[]}}',
        }

        with patch.object(
            ishare2_api.urllib.request,
            "urlopen",
            side_effect=_urlopen_map(payloads),
        ):
            self.assertFalse(
                ishare2_api._repository_has_image_content(
                    repository,
                    "qemu",
                    "csr1000v-17-03-06",
                )
            )

    def test_filter_search_sections_with_available_repositories_uses_union_of_names(self):
        ishare2_api = _import_ishare2_api()
        sections = [
            {
                "type": "QEMU",
                "label": "QEMU",
                "items": [
                    {"id": 282, "name": "csr1000v-17-03-06", "size": "1 GiB"},
                    {"id": 283, "name": "csr1000v-17-03-08a-serial", "size": "1 GiB"},
                ],
            },
            {
                "type": "DYNAMIPS",
                "label": "DYNAMIPS",
                "items": [
                    {"id": 10, "name": "c7200.image", "size": "100 MiB"},
                ],
            },
        ]

        with patch.object(
            ishare2_api,
            "_available_image_names_for_type",
            side_effect=lambda image_type: {
                "qemu": {"csr1000v-17-03-06", "csr1000v-17-03-08a-serial"},
                "dynamips": {"c7200.image"},
            }.get(image_type, set()),
        ):
            filtered = ishare2_api._filter_search_sections_with_available_repositories(sections)

        self.assertEqual(len(filtered), 2)
        self.assertEqual(
            [item["name"] for item in filtered[0]["items"]],
            ["csr1000v-17-03-06", "csr1000v-17-03-08a-serial"],
        )
        self.assertEqual([item["name"] for item in filtered[1]["items"]], ["c7200.image"])

    def test_build_repository_candidates_filters_empty_labhub_prefixes(self):
        ishare2_api = _import_ishare2_api()

        with patch.object(
            ishare2_api,
            "_STATIC_REPOSITORIES",
            [
                {
                    "id": ishare2_api._NETCONFIG_REPO_ID,
                    "host": ishare2_api._NETCONFIG_REPO_HOST,
                    "prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
                    "protocol": "https",
                    "kind": "catalog",
                },
            ],
        ), patch.object(
            ishare2_api,
            "_discover_repo_prefixes_from_labhub",
            return_value=["/0:", "/1:", "/2:"],
        ), patch.object(
            ishare2_api,
            "_repository_has_content",
            side_effect=lambda repository: repository.get("id") in {
                ishare2_api._NETCONFIG_REPO_ID,
                "/0:",
                "/2:",
            },
        ):
            candidates = ishare2_api._build_repository_candidates()

        self.assertEqual(
            [candidate["id"] for candidate in candidates],
            [
                ishare2_api._NETCONFIG_REPO_ID,
                "/0:",
                "/2:",
            ],
        )

    def test_build_repository_candidates_filters_default_empty_prefixes(self):
        ishare2_api = _import_ishare2_api()

        with patch.object(
            ishare2_api,
            "_STATIC_REPOSITORIES",
            [
                {
                    "id": ishare2_api._NETCONFIG_REPO_ID,
                    "host": ishare2_api._NETCONFIG_REPO_HOST,
                    "prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
                    "protocol": "https",
                    "kind": "catalog",
                },
            ],
        ), patch.object(
            ishare2_api,
            "_discover_repo_prefixes_from_labhub",
            return_value=[],
        ), patch.object(
            ishare2_api,
            "_repository_has_content",
            side_effect=lambda repository: repository.get("id") in {
                ishare2_api._NETCONFIG_REPO_ID,
                "/0:",
            },
        ):
            candidates = ishare2_api._build_repository_candidates()

        self.assertEqual(
            [candidate["id"] for candidate in candidates],
            [
                ishare2_api._NETCONFIG_REPO_ID,
                "/0:",
            ],
        )

    def test_run_pull_with_repo_fallback_succeeds_on_second_repo(self):
        ishare2_api = _import_ishare2_api()
        attempts = []
        ordered_repos = [
            {
                "id": ishare2_api._NETCONFIG_REPO_ID,
                "host": ishare2_api._NETCONFIG_REPO_HOST,
                "prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
                "protocol": "https",
                "kind": "catalog",
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
            ishare2_api._NETCONFIG_REPO_ID: 15.1,
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
        self.assertEqual(result["tested_prefixes"], [ishare2_api._NETCONFIG_REPO_ID, "/0:"])
        self.assertEqual(attempts, [ishare2_api._NETCONFIG_REPO_ID, "/0:"])
        self.assertEqual(result["ranked_prefixes"], [ishare2_api._NETCONFIG_REPO_ID, "/0:"])
        self.assertEqual(result["latency_ms"], latency_map)
        self.assertEqual(len(result["attempt_details"]), 2)
        self.assertEqual(result["attempt_details"][0]["repo_id"], ishare2_api._NETCONFIG_REPO_ID)
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
                "forced_prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
                "forced_hostname": ishare2_api._NETCONFIG_REPO_HOST,
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
                "id": ishare2_api._NETCONFIG_REPO_ID,
                "host": ishare2_api._NETCONFIG_REPO_HOST,
                "prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
                "protocol": "https",
                "kind": "catalog",
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
            ishare2_api._NETCONFIG_REPO_ID: 14.2,
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
        self.assertEqual(result["tested_prefixes"], [ishare2_api._NETCONFIG_REPO_ID, "/0:", "/1:"])
        self.assertEqual(result["ranked_prefixes"], [ishare2_api._NETCONFIG_REPO_ID, "/0:", "/1:"])
        self.assertEqual(result["latency_ms"], latency_map)
        self.assertEqual(len(result["attempt_details"]), 3)
        self.assertEqual(result["attempt_details"][0]["reason_code"], "not_found")
        self.assertEqual(result["attempt_details"][1]["reason_code"], "timeout")
        self.assertEqual(result["attempt_details"][2]["reason_code"], "quota")

    def test_run_pull_with_repo_fallback_skips_repositories_without_selected_qemu_image(self):
        ishare2_api = _import_ishare2_api()
        repositories = [
            {
                "id": ishare2_api._NETCONFIG_REPO_ID,
                "host": ishare2_api._NETCONFIG_REPO_HOST,
                "prefix": ishare2_api._NETCONFIG_REPO_PREFIX,
                "protocol": "https",
                "kind": "catalog",
            },
            {
                "id": "/0:",
                "host": ishare2_api._LABHUB_HOST,
                "prefix": "/0:",
                "protocol": "https",
                "kind": "labhub",
            },
        ]

        with patch.object(
            ishare2_api,
            "_build_repository_candidates",
            return_value=repositories,
        ), patch.object(
            ishare2_api,
            "_repository_has_image_content",
            return_value=False,
        ), patch.object(
            ishare2_api,
            "_run_pull_command",
        ) as run_pull:
            result = ishare2_api._run_pull_with_repo_fallback(
                "qemu",
                "282",
                image_name="csr1000v-17-03-06",
            )

        self.assertEqual(result["rc"], 1)
        self.assertEqual(result["tested_prefixes"], [])
        self.assertEqual(result["ranked_prefixes"], [])
        self.assertEqual(result["skipped_prefixes"], [ishare2_api._NETCONFIG_REPO_ID, "/0:"])
        self.assertIn("csr1000v-17-03-06", result["stderr"])
        run_pull.assert_not_called()

    def test_summarize_attempts_for_user(self):
        ishare2_api = _import_ishare2_api()

        summary = ishare2_api._summarize_attempts_for_user(
            [
                {
                    "repo_id": "repo.netconfig.com.br",
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

        self.assertIn("repo.netconfig.com.br (101.5ms): imagem não encontrada neste repositório", summary)
        self.assertIn("/0: (300.0ms): sucesso", summary)


if __name__ == "__main__":
    unittest.main()
