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

    def safe_load(_text):
        return {}

    yaml_stub.safe_load = safe_load
    sys.modules["yaml"] = yaml_stub


class TestContainerLabsTopoviewer(unittest.TestCase):
    def _import_routes(self):
        project_root = Path(__file__).resolve().parent.parent
        api_dir = project_root / "api"
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

    def test_build_cyto_elements_creates_group_and_edge(self):
        routes = self._import_routes()
        doc = {
            "topology": {
                "nodes": {
                    "r1": {
                        "kind": "huawei_vrp",
                        "image": "vrnetlab/huawei_vrp:ne40e",
                        "labels": {
                            "graph-level": 1,
                            "graph-icon": "router",
                            "graph-posX": 120,
                            "graph-posY": 80,
                        },
                    },
                    "r2": {
                        "kind": "linux",
                        "labels": {
                            "graph-group": "tier-1",
                            "graph-level": "1",
                            "graph-icon": "host",
                        },
                    },
                },
                "links": [{"endpoints": ["r1:eth1", "r2:eth2"]}],
            }
        }

        elements = routes._build_cyto_elements(doc)
        nodes = [e for e in elements if e.get("group") == "nodes"]
        edges = [e for e in elements if e.get("group") == "edges"]

        self.assertEqual(len(edges), 1)
        self.assertEqual(len(nodes), 3)

        r1 = next(n for n in nodes if n["data"]["id"] == "r1")
        r2 = next(n for n in nodes if n["data"]["id"] == "r2")
        group = next(n for n in nodes if n["data"]["id"] == "tier-1:1")

        self.assertEqual(r1["data"]["topoViewerRole"], "router")
        self.assertNotIn("parent", r1["data"])
        self.assertEqual(r1["position"]["x"], 120.0)
        self.assertEqual(r1["position"]["y"], 80.0)

        self.assertEqual(r2["data"]["topoViewerRole"], "host")
        self.assertEqual(r2["data"]["parent"], "tier-1:1")
        self.assertEqual(group["data"]["topoViewerRole"], "group")
        self.assertEqual(group["data"]["weight"], "1000")

        edge = edges[0]["data"]
        self.assertEqual(edge["source"], "r1")
        self.assertEqual(edge["target"], "r2")
        self.assertEqual(edge["sourceEndpoint"], "eth1")
        self.assertEqual(edge["targetEndpoint"], "eth2")
        self.assertEqual(edge["endpoints"], ["r1:eth1", "r2:eth2"])

    def test_build_cyto_elements_supports_endpoint_maps_and_role_guess(self):
        routes = self._import_routes()
        doc = {
            "topology": {
                "nodes": {
                    "n1": {"kind": "linux"},
                    "n2": {"kind": "bridge"},
                },
                "links": [
                    {
                        "endpoints": [
                            {"node": "n1", "interface": "eth3"},
                            {"node": "n2", "interface": "eth4"},
                        ]
                    }
                ],
            }
        }

        elements = routes._build_cyto_elements(doc)
        nodes = [e for e in elements if e.get("group") == "nodes"]
        edges = [e for e in elements if e.get("group") == "edges"]

        n1 = next(n for n in nodes if n["data"]["id"] == "n1")
        n2 = next(n for n in nodes if n["data"]["id"] == "n2")

        self.assertEqual(n1["data"]["topoViewerRole"], "host")
        self.assertEqual(n2["data"]["topoViewerRole"], "bridge")

        edge = edges[0]["data"]
        self.assertEqual(edge["sourceEndpoint"], "eth3")
        self.assertEqual(edge["targetEndpoint"], "eth4")
        self.assertEqual(edge["endpoints"], ["n1:eth3", "n2:eth4"])


if __name__ == "__main__":
    unittest.main()
