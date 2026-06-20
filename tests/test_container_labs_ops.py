import sys
import types
import unittest
from pathlib import Path


def _install_flask_stub():
    if "flask" in sys.modules:
        return
    flask_stub = types.ModuleType("flask")

    class DummyBlueprint:
        def __init__(self, *args, **kwargs):
            pass

        def route(self, *args, **kwargs):
            def decorator(func):
                return func

            return decorator

    class DummyRequest:
        form = {}

    def dummy_jsonify(*args, **kwargs):
        return {"args": args, "kwargs": kwargs}

    flask_stub.Blueprint = DummyBlueprint
    flask_stub.jsonify = dummy_jsonify
    flask_stub.request = DummyRequest()
    sys.modules["flask"] = flask_stub


def _install_yaml_stub():
    if "yaml" in sys.modules:
        return
    yaml_stub = types.ModuleType("yaml")
    yaml_stub.safe_load = lambda _text: {}
    sys.modules["yaml"] = yaml_stub


def _import_routes():
    project_root = Path(__file__).resolve().parent.parent
    api_dir = project_root / "api"
    if str(api_dir) not in sys.path:
        sys.path.insert(0, str(api_dir))
    try:
        import flask  # noqa: F401
    except ModuleNotFoundError:
        _install_flask_stub()
    try:
        import yaml  # noqa: F401
    except ModuleNotFoundError:
        _install_yaml_stub()
    import container_labs_routes  # noqa: E402
    return container_labs_routes


class TestContainerLabsOps(unittest.TestCase):
    def test_container_name_validation(self):
        r = _import_routes()
        self.assertTrue(r._is_safe_container_name("clab-bgp-spine1"))
        self.assertTrue(r._is_safe_container_name("clab-lab_1.node-2"))
        self.assertFalse(r._is_safe_container_name(""))
        self.assertFalse(r._is_safe_container_name("a b"))
        self.assertFalse(r._is_safe_container_name("a;rm -rf /"))
        self.assertFalse(r._is_safe_container_name("a$(whoami)"))
        self.assertFalse(r._is_safe_container_name("a/b"))

    def test_logs_cmd_quotes_container(self):
        r = _import_routes()
        cmd = r._runtime_logs_cmd("clab-bgp-spine1", 50)
        self.assertIn("docker logs --tail 50 clab-bgp-spine1", cmd)
        self.assertIn("podman logs --tail 50 clab-bgp-spine1", cmd)
        self.assertIn("__NO_RUNTIME__", cmd)

    def test_exec_cmd_quotes_command(self):
        r = _import_routes()
        cmd = r._runtime_exec_cmd("clab-bgp-spine1", "ip route; echo hi")
        # O comando do usuário deve ir entre aspas (shlex.quote), não solto.
        self.assertIn("docker exec clab-bgp-spine1 sh -c ", cmd)
        self.assertIn("'ip route; echo hi'", cmd)

    def test_topology_target_cmd_builds_deploy(self):
        r = _import_routes()
        cmd = r._topology_target_cmd("/opt/containerlab/labs", "bgp", "bgp.clab.yml", "deploy --reconfigure")
        self.assertIn("base='/opt/containerlab/labs'", cmd)
        self.assertIn("lab='bgp'", cmd)
        self.assertIn("file='bgp.clab.yml'", cmd)
        self.assertIn("containerlab deploy --reconfigure -t", cmd)
        self.assertIn("__NO_CONTAINERLAB__", cmd)

    def test_normalize_inspect_containers_key(self):
        r = _import_routes()
        rows = r._normalize_inspect(
            {"containers": [
                {"name": "clab-bgp-spine1", "kind": "nokia_srlinux", "image": "srl:23", "state": "running", "ipv4_address": "172.20.20.2/24"},
            ]}
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "clab-bgp-spine1")
        self.assertEqual(rows[0]["kind"], "nokia_srlinux")
        self.assertEqual(rows[0]["state"], "running")
        self.assertEqual(rows[0]["ipv4"], "172.20.20.2/24")

    def test_normalize_inspect_list_and_grouped(self):
        r = _import_routes()
        as_list = r._normalize_inspect([{"name": "n1", "State": "running"}])
        self.assertEqual(as_list[0]["name"], "n1")
        self.assertEqual(as_list[0]["state"], "running")
        grouped = r._normalize_inspect({"bgp": [{"name": "n2"}], "other": [{"name": "n3"}]})
        names = sorted(row["name"] for row in grouped)
        self.assertEqual(names, ["n2", "n3"])

    def test_normalize_inspect_handles_garbage(self):
        r = _import_routes()
        self.assertEqual(r._normalize_inspect(None), [])
        self.assertEqual(r._normalize_inspect("nope"), [])


if __name__ == "__main__":
    unittest.main()
