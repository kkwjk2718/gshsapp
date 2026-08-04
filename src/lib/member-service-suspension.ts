export const MEMBER_SERVICE_SUSPENDED = true;

export const MEMBER_SERVICE_SUSPENSION_TITLE = "회원 기능 일시 비활성화 안내";

export const MEMBER_SERVICE_SUSPENSION_SUMMARY =
  "학교 검토가 완료될 때까지 로그인과 회원 전용 기능을 일시적으로 중지했습니다.";

export function isMemberServiceSuspended() {
  return MEMBER_SERVICE_SUSPENDED;
}
