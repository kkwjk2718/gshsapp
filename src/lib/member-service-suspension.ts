export const MEMBER_SERVICE_SUSPENDED = true;

export const MEMBER_SERVICE_SUSPENSION_NOTICE_STORAGE_KEY =
  "gshs-member-service-suspension-notice-20260407-v1";

export const MEMBER_SERVICE_SUSPENSION_TITLE = "회원 기능 일시 비활성화 안내";

export const MEMBER_SERVICE_SUSPENSION_PARAGRAPHS = [
  "안녕하세요. 경남과학고등학교 정보부 부장 김건우입니다.",
  "현재 gshs.app의 회원가입 및 회원 기능 운영과 관련하여, 개인정보 수집·이용 절차 및 교내 서비스 운영 기준에 대한 추가 검토가 필요한 상황입니다. 이에 따라 검토가 완료될 때까지 로그인 기능 및 회원 전용 기능을 일시적으로 비활성화하고자 합니다.",
  "아울러 학교 측 안내에 따라 해당 사항은 학교운영위원회 심의 절차를 거칠 예정이며, 회원 기능의 재개 여부와 향후 운영 방향은 심의 이후에 결정될 것으로 예상됩니다. 관련 사항이 정리되는 대로 다시 안내드리겠습니다.",
  "이번 조치는 보다 안전하고 적절한 서비스 운영을 위한 조치이며, 기존 가입자분들께서는 일부 기능(회원 전용 기능 등) 이용에 제한이 있을 수 있습니다. 이용에 불편을 드리게 된 점 양해 부탁드립니다.",
  "감사합니다.",
] as const;

export const MEMBER_SERVICE_SUSPENSION_SUMMARY =
  "학교 검토가 완료될 때까지 로그인과 회원 전용 기능을 일시적으로 중지했습니다.";

export function isMemberServiceSuspended() {
  return MEMBER_SERVICE_SUSPENDED;
}
