import sys
import types
import unittest
from pathlib import Path


def _stub_flask():
    if "flask" in sys.modules:
        return
    m = types.ModuleType("flask")

    class BP:
        def __init__(self, *a, **k):
            pass

        def route(self, *a, **k):
            def d(fn):
                return fn
            return d

    m.Blueprint = BP
    m.jsonify = lambda *a, **k: {"a": a, "k": k}
    m.Response = object
    m.request = type("R", (), {"form": {}})()
    sys.modules["flask"] = m


def _import_unl():
    api = Path(__file__).resolve().parent.parent / "api"
    if str(api) not in sys.path:
        sys.path.insert(0, str(api))
    try:
        import flask  # noqa
    except ModuleNotFoundError:
        _stub_flask()
    import importlib.util
    spec = importlib.util.spec_from_file_location("unl_routes", api / "unl_routes.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestUnl(unittest.TestCase):
    def test_safe_path(self):
        u = _import_unl()
        self.assertTrue(u._is_safe_unl_path("CCNA/lab1.unl"))
        self.assertFalse(u._is_safe_unl_path("/abs/lab.unl"))
        self.assertFalse(u._is_safe_unl_path("../lab.unl"))
        self.assertFalse(u._is_safe_unl_path("lab.txt"))
        self.assertFalse(u._is_safe_unl_path(""))

    def test_unl_to_elements(self):
        u = _import_unl()
        xml = (
            '<lab name="T" id="1"><topology>'
            '<nodes>'
            '<node id="1" name="R1" template="vios" image="x" type="qemu" left="100" top="120">'
            '<interface id="0" name="Gi0/0" type="ethernet" network_id="1"/></node>'
            '<node id="2" name="R2" template="vios" image="x" type="qemu" left="400" top="120">'
            '<interface id="0" name="Gi0/0" type="ethernet" network_id="1"/></node>'
            '</nodes>'
            '<networks><network id="1" type="bridge" name="Net1" left="250" top="250"/></networks>'
            '</topology></lab>'
        )
        els = u._unl_to_elements(xml)
        nodes = [e for e in els if e["group"] == "nodes"]
        edges = [e for e in els if e["group"] == "edges"]
        names = sorted(n["data"]["name"] for n in nodes)
        self.assertEqual(names, ["Net1", "R1", "R2"])
        self.assertEqual(len(edges), 2)
        r1 = next(n for n in nodes if n["data"]["name"] == "R1")
        self.assertEqual(r1["data"]["extraData"]["kind"], "vios")
        self.assertEqual(r1["position"], {"x": 100.0, "y": 120.0})

    def test_unl_bad_xml(self):
        u = _import_unl()
        self.assertEqual(u._unl_to_elements("<not><valid"), [])


if __name__ == "__main__":
    unittest.main()
