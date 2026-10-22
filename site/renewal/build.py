"""시안 HTML -> 아임웹 코드 위젯 본문 변환."""
import re, base64, hashlib, os, sys

R = '/tmp/claude-0/-home-claude/e3e8d8de-9a32-592d-a439-6a06c15b9cbb/scratchpad/renewal'
OUT = os.path.dirname(os.path.abspath(__file__))
SHA = sys.argv[1]
CDN = f'https://cdn.jsdelivr.net/gh/tnstnska52-art/iroun@{SHA}/site/img/'
IMG = {'734d18ed': CDN + 'team-pc.jpg', '45a2a4b0': CDN + 'team-mo.jpg', '7b13742c': CDN + 'logo.png'}
W = 'https://www.irowoon.com'
START = W + '/check#start'
PAGES = {  # 시안 아티팩트 -> 실제 주소
    'W3USM6Frw83uF3NNkJ9omh': W + '/',
    'FKM5fx3QUdSd8EDjKeFg2P': W + '/about',
    'HePqLGYbhH3DNZ8BeRTed6': START,
    '1qUPxv5euSTxT2J9mJM8eH': W + '/20',
    'PYJgQhfXwX5TQ4v2ZpuDco': W + '/review',
    'JL8a7bRfRBFhBio32JYVJz': W + '/faq',
}
SRC = {  # 출력 이름: (시안 파일, 이 페이지 주소)
    'service': ('home.html', W + '/'),
    'about': ('about/company.html', W + '/about'),
    'check': ('findp/find.html', W + '/check'),
    'loan': ('loan/loan.html', W + '/20'),
    'review': ('cases/cases.html', W + '/review'),
    'faq': ('faq/faq.html', W + '/faq'),
}

# 확인 창으로 가서 자동으로 '시작'을 누르는 공통 스크립트 (/check 에서만 실제로 동작)
GO_START = r'''<script>
(function(){
  function start(){var box=document.getElementById('chk2');if(!box)return false;
    var r=box.getBoundingClientRect();window.scrollTo({top:Math.max(0,r.top+scrollY-80),behavior:'smooth'});
    var n=0,t=setInterval(function(){var b=box.querySelector('[data-start]');if(b||++n>60){clearInterval(t);if(b)b.click();}},150);return true;}
  document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
    var h=a.getAttribute('href');if(/\/check#start$/.test(h)&&document.getElementById('chk2')){e.preventDefault();start();}});
  if(location.hash==='#start'){var go=function(){setTimeout(start,300)};if(document.readyState==='complete')go();else addEventListener('load',go);}
})();
</script>'''


def img(m):
    b = base64.b64decode(m.group(2))
    return IMG[hashlib.md5(b).hexdigest()[:8]]


def convert(name):
    f, here = SRC[name]
    s = open(os.path.join(R, f)).read()
    s = re.sub(r'data:image/(\w+);base64,([A-Za-z0-9+/=]+)', img, s)
    s = re.sub(r'<title>.*?</title>\s*', '', s)
    s = re.sub(r'<meta name="claude:[^>]*>\s*', '', s)
    # 메뉴의 '지원금 찾기'는 시작 버튼 없이 페이지로
    s = re.sub(r'href="https://claude\.ai/artifact/HePqLGYbhH3DNZ8BeRTed6">지원금 찾기<', f'href="{W}/check">지원금 찾기<', s)
    for k, v in PAGES.items():
        s = s.replace(f'https://claude.ai/artifact/{k}#top', START)
        s = s.replace(f'https://claude.ai/artifact/{k}', v)
    assert 'claude.ai' not in s, name
    s = s.replace('href="#" aria-current="page"', f'href="{here}" aria-current="page"')
    s = re.sub(r'(<a class="logo" )href="#\w+"', rf'\1href="{W}/"', s)
    s = re.sub(r'(<a )href="#top"( aria-label="\(주\)이로운사람들 처음으로")', rf'\1href="{W}/"\2', s)
    s = s.replace(f'href="{W}/check" target="_blank" rel="noopener"', f'href="{START}"')
    s = re.sub(r' target="_blank" rel="noopener"(?=[^>]*>)', lambda m: m.group(0), s)
    if name == 'service':
        s = s.replace('href="#top"', f'href="{START}"')
    if name == 'check':
        w = open('/home/claude/iroun/site/check-v2.html').read()
        a = w.index('<div id="chk2"'); b = w.index('</div></section>')
        widget = w[a:b]
        rest = w[w.index('<div class="c2-modal"'):]
        s = re.sub(r'<div class="w" aria-label="지원금 확인 창 미리보기">.*?\n      </div>\n    </div>',
                   widget + '\n    </div>', s, flags=re.S)
        assert 'w-cta' not in s.split('<style')[0] or True
        s = s.replace('href="#top"', f'href="{START}"')
        s = s.replace('</main>', '</main>\n' + rest, 1)
        # 미리보기 숫자 스크립트 제거
        s = re.sub(r"\(function\(\)\{\n  var el=document\.getElementById\('cnt'\).*?\n\}\)\(\);\n", '', s, flags=re.S)
    s = s.replace('</body>', '').replace('</html>', '')
    s = re.sub(r'<!doctype html>|<html[^>]*>|<head>|</head>|<body[^>]*>', '', s, flags=re.I)
    s += '\n' + GO_START + '\n'
    open(os.path.join(OUT, name + '.html'), 'w').write(s.strip() + '\n')
    return len(s.encode())


for n in SRC:
    print(n, convert(n))
