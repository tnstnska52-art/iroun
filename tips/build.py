"""지원금 꿀팁 글 생성기: 글 원본(JSON) -> 아임웹 게시글 본문 HTML.

아임웹 글쓰기 창은 <style> 블록을 쓰지 못해서 모든 스타일을 요소마다 직접 넣는다.
사용법: python3 tips/build.py tips/posts/<slug>.json   -> tips/html/<slug>.html 생성
"""
import json, os, sys, html as H

A = "#1c5cab"; SOFT = "#e6effa"; LINE = "#dbe2ea"; MUTED = "#56626f"; INK = "#131c26"
BLUE = "#2a78d6"; ORG = "#eb6834"; TRACK = "#e9eef4"; MARK = "#fff3c4"
OK = "#0a7a0a"; NO = "#c23030"
WRAP = f"max-width:720px;margin:0 auto;font-size:17px;line-height:1.8;color:{INK};word-break:keep-all;"
TD = f"padding:12px 16px;text-align:left;vertical-align:top;border-top:1px solid {LINE};"
TH = f"background:{SOFT};padding:12px 16px;text-align:left;font-weight:700;white-space:nowrap;border-top:1px solid {LINE};"


def cell(v):
    """표 칸: 'O'/'X' 로 시작하면 가능/불가 표시로 바꾼다. 나머지는 HTML 그대로."""
    if v == "O":
        return f'<span style="color:{OK};font-weight:700;white-space:nowrap;">○ 가능</span>'
    if v == "X":
        return f'<span style="color:{NO};font-weight:700;white-space:nowrap;">✕ 불가</span>'
    return v


def p(t, small=False):
    if small:
        return f'<p style="margin:0 0 16px;font-size:14px;color:{MUTED};">{t}</p>'
    return f'<p style="margin:0 0 16px;">{t}</p>'


def h2(n, t):
    return (f'<h2 style="font-size:23px;line-height:1.4;margin:48px 0 14px;font-weight:700;">'
            f'<span style="color:{A};margin-right:8px;">{n}</span>{t}</h2>')


def h3(t):
    return f'<h3 style="font-size:19px;line-height:1.45;margin:28px 0 8px;font-weight:700;">{t}</h3>'


def table(t):
    s = f'<div style="overflow-x:auto;margin:18px 0;border:1px solid {LINE};border-radius:12px;"><table style="border-collapse:collapse;width:100%;font-size:16px;line-height:1.6;margin:0;">'
    if t.get("caption"):
        s += f'<caption style="caption-side:top;text-align:left;font-weight:700;padding:14px 16px 10px;color:{INK};">{t["caption"]}</caption>'
    if t.get("head"):
        s += "<thead><tr>" + "".join(f'<th style="{TH}">{h}</th>' for h in t["head"]) + "</tr></thead>"
    s += "<tbody>"
    for r in t["rows"]:
        s += "<tr>" + "".join(
            f'<td style="{TD}{"font-weight:700;white-space:nowrap;" if i == 0 and t.get("first_th") else ""}">{cell(c)}</td>'
            for i, c in enumerate(r)) + "</tr>"
    return s + "</tbody></table></div>"


def chart(c):
    """막대그래프. rows: [{label, value(표시 글자), a(숫자), b(숫자, 있으면 누적), note}]"""
    rows = c["rows"]
    mx = max(r["a"] + r.get("b", 0) for r in rows) or 1
    s = (f'<div style="border:1px solid {LINE};border-radius:12px;padding:20px;margin:18px 0;">'
         f'<p style="margin:0 0 2px;font-weight:700;font-size:16px;">{c["title"]}</p>'
         f'<p style="margin:0 0 14px;font-size:14px;color:{MUTED};line-height:1.5;">{c["sub"]}</p>')
    if c.get("legend"):
        a, b = c["legend"]
        s += (f'<p style="margin:0 0 14px;font-size:14px;color:{MUTED};">'
              f'<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:{BLUE};margin-right:6px;"></span>{a} &nbsp;&nbsp; '
              f'<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:{ORG};margin-right:6px;"></span>{b}</p>')
    for r in rows:
        wa = f'{round(r["a"] / mx * 100, 1):g}'; wb = f'{round(r.get("b", 0) / mx * 100, 1):g}'
        note = r.get("note")
        s += f'<p style="margin:0 0 5px;font-size:15px;line-height:1.5;">{r["label"]} <strong style="float:right;">{r["value"]}</strong></p>'
        s += (f'<div style="height:18px;background:{TRACK};border-radius:4px;overflow:hidden;margin:0 0 {"4px" if note else "14px"};font-size:0;">'
              f'<div style="display:inline-block;height:18px;width:{wa}%;background:{BLUE};"></div>')
        if r.get("b"):
            s += f'<div style="display:inline-block;height:18px;width:{wb}%;background:{ORG};"></div>'
        s += "</div>"
        if note:
            s += f'<p style="margin:0 0 14px;font-size:14px;color:{MUTED};">{note}</p>'
    return s + "</div>"


def steps(st):
    s = ""; key = st.get("key")
    for i, (t, d) in enumerate(st["items"], 1):
        bg = SOFT if i == key else "#ffffff"; bd = A if i == key else LINE
        s += (f'<div style="border:1px solid {bd};background:{bg};border-radius:12px;padding:14px 16px;margin:0 0 10px;line-height:1.6;">'
              f'<strong><span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;background:{A};color:#ffffff;margin-right:10px;">{i}</span>{t}</strong>'
              f'<br><span style="font-size:15px;color:{MUTED};">{d}</span></div>')
    return s


def cards(items):
    return "".join(
        f'<div style="border:1px solid {LINE};border-radius:12px;padding:16px;margin:0 0 10px;"><strong style="font-size:17px;">{t}</strong>'
        f'<br><span style="font-size:15px;color:{MUTED};line-height:1.6;">{d}</span><br><strong style="color:{A};font-size:15px;">{big}</strong></div>'
        for t, d, big in items)


def faq(items):
    return "".join(
        f'<div style="border:1px solid {LINE};border-radius:12px;padding:16px 18px;margin:0 0 10px;"><p style="margin:0 0 6px;font-weight:700;">Q. {q}</p><p style="margin:0;">{a}</p></div>'
        for q, a in items)


def ul(items):
    return '<ul style="padding-left:22px;margin:0 0 16px;">' + "".join(f'<li style="margin:6px 0;">{x}</li>' for x in items) + "</ul>"


def links(items):
    """함께 보면 좋은 글: [[제목, 주소], ...] (같은 게시판의 관련 글 2~3개)"""
    lis = "".join(f'<li style="margin:6px 0;"><a href="{u}" style="color:{A};">{t}</a></li>' for t, u in items)
    return (f'<div style="border:1px solid {LINE};border-radius:12px;padding:16px 20px;margin:24px 0;">'
            f'<p style="margin:0 0 6px;font-weight:700;">함께 보면 좋은 글</p><ul style="padding-left:20px;margin:0;">{lis}</ul></div>')


def warn(t):
    return f'<div style="background:{MARK};border-radius:12px;padding:16px 18px;margin:18px 0;">{t}</div>'


def updates_box(ups):
    """변경 안내: 가장 최근 변경이 위로. 기존 본문은 그대로 두고 맨 위에만 붙는다."""
    items = "".join(f'<li style="margin:6px 0;"><strong>{u["date"]}</strong> {u["text"]}</li>'
                    for u in sorted(ups, key=lambda u: u["date"], reverse=True))
    return (f'<div style="border:2px solid {A};background:{SOFT};border-radius:12px;padding:16px 20px;margin:18px 0;">'
            f'<p style="margin:0 0 6px;font-weight:700;font-size:17px;color:{A};">변경 안내</p>'
            f'<ul style="padding-left:20px;margin:0;">{items}</ul></div>')


BLOCKS = {"p": p, "note": lambda t: p(t, True), "h3": h3, "table": table, "chart": chart,
          "steps": steps, "cards": cards, "faq": faq, "list": ul, "warn": warn, "links": links}


def render(spec):
    h = f'<div style="{WRAP}">'
    h += p(spec["intro"])
    upd = spec.get("updated") or spec["published"]
    h += p(f'업데이트 {upd} · 읽는 시간 {spec.get("read_min", 5)}분', True)
    if spec.get("updates"):
        h += updates_box(spec["updates"])
    sm = spec["summary"]
    h += (f'<div style="border:1px solid {LINE};border-left:5px solid {A};border-radius:12px;padding:18px 20px;margin:18px 0;">'
          f'<p style="margin:0 0 8px;font-weight:700;font-size:18px;">{sm["title"]}</p><ol style="margin:0;padding-left:22px;">'
          + "".join(f'<li style="margin:6px 0;">{x}</li>' for x in sm["items"]) + "</ol></div>")
    h += table(dict(spec["glance"], first_th=True))
    for n, sec in enumerate(spec["sections"], 1):
        h += h2(n, sec["h2"])
        for b in sec["blocks"]:
            (k, v), = b.items()
            h += BLOCKS[k](v)
    if spec.get("related"):
        h += links(spec["related"])
    c = spec["cta"]
    h += (f'<div style="background:{SOFT};border:1px solid {A};border-radius:14px;padding:24px 20px;margin:36px 0;">'
          f'<p style="margin:0 0 8px;font-weight:700;font-size:21px;">{c["title"]}</p><p style="margin:0 0 14px;">{c["text"]}</p>'
          f'<a href="{c.get("href", "https://www.irowoon.com/check#start")}" style="display:inline-block;background:{A};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">{c.get("button", "내 지원금 확인하기")}</a></div>')
    src = spec["sources"]
    h += (f'<div style="font-size:14px;color:{MUTED};line-height:1.7;border-top:1px solid {LINE};margin-top:32px;padding-top:16px;">'
          f'<strong>기준과 출처</strong> ({src["checked"]} 확인)<br>' + "<br>".join(src["items"]) + f'<br>{src["note"]}</div>')
    return h + "</div>"


def check(spec, out):
    """발행 전 최소 점검. 실패하면 발행하지 않는다."""
    must = ["title", "keywords", "intro", "published", "summary", "glance", "sections", "cta", "sources"]
    miss = [k for k in must if not spec.get(k)]
    assert not miss, f"빠진 항목: {miss}"
    assert 20 <= len(spec["title"]) <= 60, f"제목 길이 {len(spec['title'])}자 (20~60자)"
    assert len(spec["sections"]) >= 4, "본문 섹션은 4개 이상"
    assert spec["sources"]["items"], "출처 없음"
    for bad in ["무조건", "100% 승인", "100% 지급", "확정 지급", "누구나 받는"]:
        assert bad not in out, f"과장 표현 '{bad}' 포함"
    assert "<script" not in out and "<style" not in out, "script/style 블록은 아임웹 글쓰기 창에서 동작하지 않음"


if __name__ == "__main__":
    path = sys.argv[1]
    spec = json.load(open(path, encoding="utf-8"))
    out = render(spec)
    check(spec, out)
    od = os.path.join(os.path.dirname(os.path.abspath(__file__)), "html")
    os.makedirs(od, exist_ok=True)
    name = os.path.splitext(os.path.basename(path))[0]
    open(os.path.join(od, name + ".html"), "w", encoding="utf-8").write(out)
    print(name, len(out), "chars")
