import unittest


class TestI18n(unittest.TestCase):
    def _import_i18n(self):
        import sys
        from pathlib import Path

        project_root = Path(__file__).resolve().parent.parent
        api_dir = project_root / "api"
        sys.path.insert(0, str(api_dir))
        import i18n  # noqa: E402

        return i18n

    def test_normalize_lang(self):
        i18n = self._import_i18n()

        self.assertEqual(i18n._normalize_lang(None), "pt")
        self.assertEqual(i18n._normalize_lang("pt-BR"), "pt")
        self.assertEqual(i18n._normalize_lang("es-ES"), "es")
        self.assertEqual(i18n._normalize_lang("en-US"), "en")
        self.assertEqual(i18n._normalize_lang("fr-FR"), "en")

    def test_translate_with_explicit_lang_and_format(self):
        i18n = self._import_i18n()

        msg = i18n.translate("images.delete_success", lang="pt", name="x")
        self.assertIn("removida", msg.lower())
        self.assertIn("x", msg)

    def test_translate_fallback_to_key(self):
        i18n = self._import_i18n()

        self.assertEqual(i18n.translate("missing.key", lang="en"), "missing.key")


if __name__ == "__main__":
    unittest.main()

