# -*- coding: utf-8 -*-
"""registry-seed.json + mock_v2_template.html → mock-v2.html (실측 데이터를 넣은 시안)."""
import json
from pathlib import Path
H = Path(__file__).resolve().parent
seed = json.loads((H / "registry-seed.json").read_text(encoding="utf-8"))
t = (H / "mock_v2_template.html").read_text(encoding="utf-8")
t = t.replace("__SEED__", json.dumps(seed, ensure_ascii=False).replace("</", "<\\/")).replace("__MEASURED__", seed["measured_at"][:16].replace("T", " "))
(H / "mock-v2.html").write_text(t, encoding="utf-8")
print("mock-v2.html", len(t))
