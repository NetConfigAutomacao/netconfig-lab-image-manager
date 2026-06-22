import sys
import types
import unittest
from pathlib import Path


def _real_flask_present():
    mod = sys.modules.get("flask")
    return mod is not None and hasattr(mod, "Flask") and isinstance(getattr(mod, "Flask"), type)


def _make_flask_stub():
    """Cria um módulo flask NOVO (sem mutar stubs de outros testes)."""
    mod = types.ModuleType("flask")

    class DummyBlueprint:
        def __init__(self, *a, **k):
            pass

        def route(self, *a, **k):
            def deco(fn):
                return fn
            return deco

    mod.Blueprint = DummyBlueprint
    mod.jsonify = lambda *a, **k: {"args": a, "kwargs": k}
    mod.Response = object
    mod.request = types.SimpleNamespace(headers={}, remote_addr="1.2.3.4", form={}, method="GET", path="/")
    mod.session = {}
    sys.modules["flask"] = mod


def _import_auth(password=None):
    import os
    if password is None:
        os.environ.pop("APP_PASSWORD", None)
    else:
        os.environ["APP_PASSWORD"] = password
    api_dir = Path(__file__).resolve().parent.parent / "api"
    if str(api_dir) not in sys.path:
        sys.path.insert(0, str(api_dir))
    if not _real_flask_present():
        _make_flask_stub()
    if "auth" in sys.modules:
        del sys.modules["auth"]
    import auth
    return auth


class TestAuth(unittest.TestCase):
    def setUp(self):
        # Guarda o módulo flask atual (stub de outro teste ou real) p/ restaurar.
        self._prev_flask = sys.modules.get("flask")

    def tearDown(self):
        # Restaura o estado anterior sem mutar o stub de outros testes.
        if self._prev_flask is not None:
            sys.modules["flask"] = self._prev_flask
        else:
            sys.modules.pop("flask", None)
        sys.modules.pop("auth", None)

    def test_auth_disabled_without_password(self):
        a = _import_auth(None)
        self.assertFalse(a.auth_enabled())
        self.assertFalse(a._check_password("anything"))

    def test_password_check_constant_time(self):
        a = _import_auth("s3cr3t")
        self.assertTrue(a.auth_enabled())
        self.assertTrue(a._check_password("s3cr3t"))
        self.assertFalse(a._check_password("wrong"))
        self.assertFalse(a._check_password(""))

    def test_secret_stable_from_password(self):
        a = _import_auth("pw-123")
        s1 = a.session_secret()
        a2 = _import_auth("pw-123")
        self.assertEqual(s1, a2.session_secret())
        a3 = _import_auth("pw-456")
        self.assertNotEqual(s1, a3.session_secret())

    def test_rate_limit(self):
        a = _import_auth("x")
        ip = "9.9.9.9"
        for _ in range(a._MAX_ATTEMPTS):
            self.assertFalse(a._rate_limited(ip))
            a._record_attempt(ip)
        self.assertTrue(a._rate_limited(ip))


if __name__ == "__main__":
    unittest.main()
