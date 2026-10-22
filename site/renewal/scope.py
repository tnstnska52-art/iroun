"""시안 CSS 선택자 앞에 #iru 를 붙여 아임웹 기본 CSS(.doz_sys ...)보다 우선하게 한다."""
import re, tinycss2

BASE = """#iru{font-family:var(--font);font-size:16px;line-height:1.6;color:var(--ink);font-weight:400;letter-spacing:normal;word-break:keep-all;text-align:left}
#iru :where(*:not(.c2x *)):where(*){font-family:inherit;line-height:inherit;letter-spacing:inherit;color:inherit;text-transform:none}
#iru :where(*:not(.c2x *)):where(p,span,li,dt,dd,a,label,em,i,u,section,article,ul,ol,dl,summary,details,nav,figure,blockquote,output,td,th,input,button,select,textarea){font-weight:inherit;font-size:inherit}
#iru :where(*:not(.c2x *)):where(b,strong){font-weight:bolder}
#iru :where(*:not(.c2x *)):where(h1,h2,h3,h4,h5,h6){font-weight:bold}
#iru :where(*:not(.c2x *)):where(h1){font-size:2em}#iru :where(*:not(.c2x *)):where(h2){font-size:1.5em}#iru :where(*:not(.c2x *)):where(h3){font-size:1.17em}#iru :where(*:not(.c2x *)):where(h4,h5,h6){font-size:1em}
#iru :where(*:not(.c2x *)):where(small){font-size:smaller}
#iru :where(*:not(.c2x *)):where(label,output,figure){margin:0;padding:0}
#iru :where(*:not(.c2x *)):where(a,img,span,input,button,svg){vertical-align:baseline}
#iru :where(*:not(.c2x *)):where(img){max-width:none}
#iru :where(*:not(.c2x *)):where(*){border-color:currentColor}#iru *:not(.c2x *)::before,#iru *:not(.c2x *)::after{border-color:currentColor}
#iru :where(*:not(.c2x *)):where(section){position:static}#iru :where(*:not(.c2x *)):where(i){display:inline}
#iru .wrap:not(.c2x *)::before,#iru .wrap:not(.c2x *)::after{content:none!important;display:none!important}
@media(max-width:900px){#iru header .hd{padding-left:max(16px,env(safe-area-inset-left,0px))!important;padding-right:max(16px,env(safe-area-inset-right,0px))!important}#iru header .mm-btn{margin-left:auto!important;margin-right:-10px!important}}
#iru .num:not(.c2x *){width:auto;min-width:0;max-width:none;height:auto;padding:0;border:0;border-radius:0}
"""


def split_sel(prelude):
    out, cur, depth = [], '', 0
    for ch in prelude:
        if ch in '([': depth += 1
        if ch in ')]': depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += ch
    out.append(cur)
    return [s.strip() for s in out if s.strip()]


NOTW = ':not(.c2x,.c2x *)'
PE = re.compile(r'((?:::?(?:before|after|placeholder|selection|marker|first-line|first-letter|-webkit-[\w-]+))+)$')


def guard(sel):
    """지원금 확인 창(#chk2, #c2-modal) 안쪽에는 시안 CSS가 닿지 않게 한다."""
    m = PE.search(sel)
    if m:
        return sel[:m.start()] + NOTW + m.group(1)
    return sel + NOTW


def pre(sel):
    if re.match(r'(:root|html)\b', sel) or sel.startswith('body'):
        return [sel]
    if sel.startswith('*'):
        return ['#iru' + sel[1:], guard('#iru ' + sel)]
    return [guard('#iru ' + sel)]


def walk(rules):
    out = []
    for r in rules:
        if r.type == 'qualified-rule':
            sels = [x for s in split_sel(tinycss2.serialize(r.prelude)) for x in pre(s)]
            out.append(', '.join(sels) + '{' + tinycss2.serialize(r.content) + '}')
        elif r.type == 'at-rule':
            kw = r.lower_at_keyword
            if kw in ('media', 'supports', 'container', 'layer') and r.content is not None:
                inner = tinycss2.parse_rule_list(r.content, skip_comments=True, skip_whitespace=True)
                out.append('@' + r.at_keyword + tinycss2.serialize(r.prelude) + '{' + walk(inner) + '}')
            else:
                out.append(tinycss2.serialize([r]))
    return '\n'.join(out)


def scope_css(css):
    rules = tinycss2.parse_stylesheet(css, skip_comments=True, skip_whitespace=True)
    return walk(rules)
