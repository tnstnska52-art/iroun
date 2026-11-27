"""인스타 카드뉴스 자동 게시 (GitHub Actions 에서 실행).

tips/cards/queue.json 의 pending 항목을 순서대로 여러 장짜리(캐러셀) 게시물로 올린다.
- 한 번 실행에 최대 MAX_POSTS 개, 게시 사이에 GAP_MINUTES 분 쉰다.
- 게시할 때마다 queue.json 에 결과(media_id, permalink)를 적고 바로 커밋한다.
- 토큰은 환경변수 IG_ACCESS_TOKEN(GitHub Secret)으로만 받는다. 저장소에 쓰지 않는다.
"""
import json, os, subprocess, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.abspath(__file__))
QUEUE = os.path.join(ROOT, "queue.json")
CONFIG = json.load(open(os.path.join(ROOT, "config.json"), encoding="utf-8"))
API = "https://graph.facebook.com/" + CONFIG.get("graph_version", "v21.0")
TOKEN = os.environ.get("IG_ACCESS_TOKEN", "")
IG_USER = CONFIG.get("ig_user_id", "")
REPO = CONFIG["repo"]
MAX_POSTS = int(os.environ.get("MAX_POSTS", CONFIG.get("max_posts_per_run", 3)))
GAP = int(os.environ.get("GAP_MINUTES", CONFIG.get("gap_minutes", 150)))
DRY = os.environ.get("DRY_RUN") == "1"
KST = timezone(timedelta(hours=9))


def call(method, path, **params):
    data = urllib.parse.urlencode({**params, "access_token": TOKEN}).encode()
    url = f"{API}/{path}"
    if method == "GET":
        req = urllib.request.Request(url + "?" + data.decode())
    else:
        req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:  # 토큰이 오류 메시지에 섞여 나오지 않도록 본문만 출력
        raise SystemExit(f"Graph API 오류 {e.code} ({path}): {e.read().decode()[:500]}")


def wait_ready(cid):
    for _ in range(30):
        st = call("GET", cid, fields="status_code").get("status_code")
        if st == "FINISHED":
            return
        if st in ("ERROR", "EXPIRED"):
            raise SystemExit(f"컨테이너 {cid} 상태 {st}")
        time.sleep(10)
    raise SystemExit(f"컨테이너 {cid} 준비 시간 초과")


def publish(item, sha):
    d = os.path.join(ROOT, item["set"])
    imgs = sorted([f for f in os.listdir(d) if f.endswith(".jpg")], key=lambda f: int(f.split(".")[0]))
    if not 2 <= len(imgs) <= 10:
        raise SystemExit(f"{item['set']}: 이미지 {len(imgs)}장 (2~10장이어야 함)")
    caption = open(os.path.join(d, "caption.txt"), encoding="utf-8").read()
    urls = [f"https://raw.githubusercontent.com/{REPO}/{sha}/tips/cards/{item['set']}/{f}" for f in imgs]
    if DRY:
        print("[DRY_RUN]", item["set"], len(urls), "장")
        return {"media_id": "dry-run", "permalink": ""}
    children = []
    for u in urls:
        c = call("POST", f"{IG_USER}/media", image_url=u, is_carousel_item="true")["id"]
        wait_ready(c)
        children.append(c)
    parent = call("POST", f"{IG_USER}/media", media_type="CAROUSEL", children=",".join(children), caption=caption)["id"]
    wait_ready(parent)
    mid = call("POST", f"{IG_USER}/media_publish", creation_id=parent)["id"]
    link = call("GET", mid, fields="permalink").get("permalink", "")
    return {"media_id": mid, "permalink": link}


def save_and_push(q, msg):
    json.dump(q, open(QUEUE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    if DRY:
        return
    subprocess.run(["git", "add", QUEUE], check=True)
    subprocess.run(["git", "commit", "-m", msg], check=True)
    subprocess.run(["git", "push"], check=True)


def main():
    if not DRY and (not TOKEN or not IG_USER):
        sys.exit("IG_ACCESS_TOKEN(Secret) 또는 config.json 의 ig_user_id 가 비어 있습니다.")
    sha = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    q = json.load(open(QUEUE, encoding="utf-8"))
    todo = [it for it in q["items"] if it.get("status") == "pending"][:MAX_POSTS]
    if not todo:
        print("게시할 항목 없음")
        return
    for n, it in enumerate(todo):
        if n:
            print(f"{GAP}분 대기")
            time.sleep(GAP * 60)
        res = publish(it, sha)
        it.update(status="posted", posted_at=datetime.now(KST).isoformat(timespec="minutes"), **res)
        save_and_push(q, f"인스타 게시: {it['set']} {res.get('permalink', '')}")
        print("게시 완료", it["set"], res.get("permalink"))


if __name__ == "__main__":
    main()
