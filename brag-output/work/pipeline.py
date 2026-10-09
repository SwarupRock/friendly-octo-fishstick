"""Run Svarah's real pipeline offline (mock mode, throwaway DB) to get genuine output for the video."""
import json, os, sys, tempfile
from pathlib import Path
out = Path(sys.argv[1]); tmp = Path(tempfile.mkdtemp(prefix="brag-"))
os.environ.update(TITAN_MODE="mock", TITAN_STT_PROVIDER="auto", TITAN_EXTRACTION_PROVIDER="auto",
    TITAN_SEAL_SECRET="brag-seal", TITAN_AUTH_SECRET="brag-auth",
    TITAN_DATABASE_URL=f"sqlite:///{(tmp/'b.db').as_posix()}", TITAN_ASSETS_DIR=str(tmp/"assets"))
for k in ("TITAN_AGNES_API_BASE","TITAN_AGNES_API_KEY","TITAN_SARVAM_API_KEY","TITAN_WINDSOR_API_KEY",
          "TITAN_AGNES_INTERFACE_VERIFIED","TITAN_SARVAM_INTERFACE_VERIFIED"): os.environ.pop(k, None)
from app import config; config._load_dotenv = lambda path: None
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app) as c:
    from app.config import get_settings
    from app.db import get_session_factory
    from app.models import User
    from app.security import mint_token, owner_uid_for_email
    uid = owner_uid_for_email("brag@titan.test")
    with get_session_factory()() as s:
        s.add(User(owner_uid=uid, email="brag@titan.test", display_name="Sharma Cafe", password_hash=None, is_demo=True)); s.commit()
    tok, _ = mint_token(uid=uid, email="brag@titan.test", settings=get_settings())
    c.headers["Authorization"] = f"Bearer {tok}"
    r = c.post("/api/campaigns", json={"text": sys.argv[2]}).json()
    cid, sid = r["id"], r["factsheet"]["id"]
    res = {"created": r}
    res["lock"] = c.post(f"/api/factsheets/{sid}/lock").json()
    res["plan"] = c.post(f"/api/campaigns/{cid}/plan").json()
    res["captions"] = c.post(f"/api/campaigns/{cid}/assets/captions").json()
    res["posters"] = c.post(f"/api/campaigns/{cid}/assets/posters", json={"variants": 1}).json()
    res["verify"] = c.post(f"/api/campaigns/{cid}/verify").json()
    res["assets"] = c.get(f"/api/campaigns/{cid}/assets").json()
    pid = res["posters"][0]["id"]
    (out/"poster.png").write_bytes(c.get(f"/api/campaigns/assets/{pid}/file").content)
    (out/"pipeline.json").write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(r["factsheet"]["facts"], indent=1))
    for a in res["assets"]:
        print(a["kind"], a.get("locale"), a.get("status"), a.get("asset_status"), (a.get("provenance") or {}).get("channel"), repr(a.get("text_content"))[:300])
