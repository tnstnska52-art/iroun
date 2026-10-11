import { isAxiosLike } from './util';
export const DISCLAIMER = '이로운사람들 서비스 · 정부기관이 아닙니다';
export const USER_RECORD_NOTICE = '이 기록은 본인이 직접 남긴 것이며, 해당 기관이 확인한 내용이 아닙니다.';
export const STAGES = ['관심', '신청 준비', '신청함', '결과 확인', '지급 확인'] as const;
export const PROVINCES = ['서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원특별자치도','충청북도','충청남도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도'];

export function apiErrorMessage(e: unknown, fallback = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'): string {
  if (isAxiosLike(e)) {
    if (e.status === 401) return '로그인이 필요하거나 로그인 시간이 만료되었습니다. 다시 로그인해 주세요.';
    if (e.status === 403) return '이 작업을 할 수 있는 권한이 없습니다.';
    if (e.status === 404) return '요청한 정보를 찾을 수 없습니다.';
    if (e.status === 503) return '서버가 잠시 응답하지 않습니다. 1~2분 뒤 다시 시도해 주세요.';
    if (e.status === 429) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    if (e.status >= 500) return '서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (isNetworkError(e)) return '인터넷 연결이 끊겼거나 서버에 닿지 않습니다. 연결을 확인하고 다시 시도해 주세요.';
  return fallback;
}
export function isNetworkError(e: unknown): boolean {
  if (!e || isAxiosLike(e)) return false;
  const m = String((e as { message?: unknown }).message ?? e);
  return e instanceof TypeError || /network|fetch|timeout|offline|abort/i.test(m);
}

const CLERK: Record<string, string> = {
  form_identifier_not_found: '가입된 번호를 찾을 수 없어요. 번호를 확인하거나 새로 가입해 주세요.',
  form_password_incorrect: '비밀번호가 맞지 않습니다. 다시 입력해 주세요.',
  form_password_pwned: '이 비밀번호는 유출 이력이 있어 사용할 수 없습니다. 다른 비밀번호를 정해 주세요.',
  form_password_length_too_short: '비밀번호가 너무 짧습니다. 8자 이상으로 입력해 주세요.',
  form_password_not_strong_enough: '비밀번호가 쉬워 보입니다. 숫자와 문자를 섞어 주세요.',
  form_identifier_exists: '이미 가입된 번호예요. 로그인해 주세요.',
  form_code_incorrect: '인증번호가 맞지 않아요. 문자를 다시 확인해 주세요.',
  verification_expired: '인증번호 유효시간이 지났습니다. 새 인증번호를 받아 주세요.',
  verification_failed: '인증에 실패했습니다. 새 인증번호를 받아 주세요.',
  too_many_requests: '시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요.',
  form_param_format_invalid: '입력 형식이 올바르지 않습니다. 휴대폰 번호를 확인해 주세요.',
  form_param_nil: '필수 항목이 비어 있습니다.',
  network_error: '인터넷 연결을 확인해 주세요.',
};
export function clerkErrorMessage(e: unknown): string {
  const any = e as { errors?: { code?: string }[]; code?: string } | null;
  const code = any?.errors?.[0]?.code ?? any?.code;
  if (code && CLERK[code]) return CLERK[code];
  return '처리 중 문제가 생겼습니다. 입력한 내용을 확인하고 다시 시도해 주세요.';
}
