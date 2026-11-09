/**
 * 휴대폰에서 읽기 쉽게 긴 문장을 짧은 줄로 나눈다.
 * - 문장마다 따로 묶고(마침표·줄바꿈 기준), 한 줄은 max 글자(기본 15자, 띄어쓰기 포함) 안으로 단어 단위로 끊는다.
 * - 쉼표 뒤에서 먼저 끊고, 한 단어가 max보다 길면 그 단어만 한 줄에 둔다(단어 중간은 자르지 않는다).
 * - 문장 끝 마침표는 짧은 줄에서 군더더기라 뺀다.
 */
export const LINE_MAX = 15;

export function sentences(text: string): string[] {
  return (text ?? '')
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?。])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim().replace(/[.。]$/, ''))
    .filter(Boolean);
}

/** 한 문장을 max 글자 안의 줄들로 나눈다. */
export function wrap(sentence: string, max = LINE_MAX): string[] {
  const words = sentence.split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max) {
      cur = next;
      // 쉼표로 끝나면 줄이 덜 찼어도 여기서 끊는다(뜻이 나뉘는 곳)
      if (/[,，]$/.test(w) && cur.length >= Math.floor(max / 2)) { lines.push(cur); cur = ''; }
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 글 전체 → 문장별 줄 묶음 */
export function shortLines(text: string, max = LINE_MAX): string[][] {
  return sentences(text).map((s) => wrap(s, max));
}
