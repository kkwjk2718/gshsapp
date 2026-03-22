import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "GSHS.app 개인정보 처리방침 안내",
  alternates: { canonical: "/privacy" },
};

const dataRows = [
  {
    category: "계정 및 본인 식별 정보",
    items: "아이디, 비밀번호 해시, 이름, 권한, 학번 또는 교직원 식별 정보, 기수, 이메일(선택)",
    purpose: "로그인, 권한 판별, 개인화된 화면 제공, 계정 보호",
    retention: "회원 탈퇴 또는 운영상 계정 삭제 시까지",
  },
  {
    category: "서비스 이용 중 작성한 데이터",
    items: "공지 작성 내용, 학사 일정, 개인 D-Day, 기상곡 신청 정보, 오류 신고 내용, 알림 데이터",
    purpose: "사용자 요청 처리, 기능 제공, 운영 이력 관리",
    retention: "기능 운영 목적이 유지되는 동안 또는 사용자가 삭제 요청할 때까지",
  },
  {
    category: "자동 생성 로그",
    items: "접속 IP, 브라우저 정보, 요청 경로, 페이지 조회 기록, 급식 조회 기록, 로그인/로그아웃 기록",
    purpose: "장애 대응, 보안 점검, 통계 집계, 비정상 이용 탐지",
    retention: "운영 및 보안 목적 범위에서 보관 후 순환 삭제",
  },
  {
    category: "운영·관리 데이터",
    items: "초대 토큰 사용 이력, 관리자 작업 감사 로그, 시스템 설정 값",
    purpose: "권한 발급 관리, 관리 기능 추적, 서비스 설정 유지",
    retention: "운영 목적 달성 시까지 또는 별도 정책 변경 시까지",
  },
];

export default function PrivacyPage() {
  return (
    <div className="mobile-page mobile-safe-bottom mx-auto max-w-4xl space-y-8">
      <div className="space-y-3 border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">개인정보 처리방침</h1>
        <p className="text-sm text-slate-500">최종 수정일: 2026년 3월 22일</p>
        <p className="max-w-3xl text-sm leading-6 text-slate-500">
          GSHS.app은 경남과학고등학교 학생과 교직원이 학교 생활 정보를 편하게 확인할 수 있도록 제공되는 서비스입니다.
          본 방침은 현재 서비스에 실제로 구현된 계정, 공지, 급식 조회, 기상곡 신청, 알림, 오류 신고, 관리자 운영 기능을 기준으로 작성되었습니다.
        </p>
      </div>

      <article className="space-y-8 text-sm leading-7 text-slate-600 dark:text-slate-300">
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">1. 수집하는 개인정보와 처리 목적</h2>
          <p>
            서비스는 계정 로그인, 개인화된 정보 제공, 운영 안정성 확보를 위해 필요한 최소 범위의 개인정보와 접속 로그를 처리합니다.
            아래 표는 실제 서비스 기능과 데이터베이스 구조를 기준으로 정리한 처리 항목입니다.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/70">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-100">구분</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-100">처리 항목</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-100">처리 목적</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-100">보관 기준</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {dataRows.map((row) => (
                  <tr key={row.category}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{row.category}</td>
                    <td className="px-4 py-3">{row.items}</td>
                    <td className="px-4 py-3">{row.purpose}</td>
                    <td className="px-4 py-3">{row.retention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">2. 개인정보 처리의 구체적인 목적</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>로그인 및 권한 확인: 학생, 교사, 관리자별로 접근 가능한 기능을 구분합니다.</li>
            <li>개인화 기능 제공: 개인 D-Day, 시간표, 알림, 내 정보 화면 등 사용자별 화면을 구성합니다.</li>
            <li>학교 정보 제공: 급식, 학사일정, 공지사항, 교내 사이트 등 학교 생활 정보를 제공합니다.</li>
            <li>운영 및 보안 관리: 관리자 작업 내역, 시스템 로그, 오류 신고, 접속 로그를 통해 장애와 오남용을 대응합니다.</li>
            <li>통계 집계: 페이지 조회, 급식 조회 등 비식별 통계를 이용해 서비스 이용 흐름을 파악합니다.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">3. 외부 서비스와 정보 처리</h2>
          <p>GSHS.app은 일부 기능 제공을 위해 아래 외부 서비스 또는 외부 연결을 사용합니다.</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              학교 정보 API(예: 급식, 시간표): 사용자가 요청한 학교 생활 정보를 조회하기 위해 서버가 외부 교육 정보 API를 호출합니다.
              일반적으로 사용자 비밀번호나 본문 데이터가 외부로 전송되지는 않습니다.
            </li>
            <li>
              Google Analytics: 관리자가 설정 화면에서 측정 ID를 활성화한 경우 방문 통계 수집을 위해 브라우저 정보와 페이지 이동 정보가 Google에 전송될 수 있습니다.
            </li>
            <li>
              외부 링크: 사용자가 학교 홈페이지, 교내 사이트, 링크모음 등 외부 사이트를 열면 해당 사이트의 정책이 별도로 적용됩니다.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">4. 보관 위치와 보호 조치</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>서비스 데이터는 운영 서버의 SQLite 데이터베이스와 백업 파일로 보관됩니다.</li>
            <li>비밀번호는 원문이 아닌 해시 형태로 저장되며, 운영자가 원문 비밀번호를 조회할 수 없습니다.</li>
            <li>운영 서버는 인증된 관리자 계정과 제한된 배포 권한을 가진 사용자만 접근할 수 있도록 관리됩니다.</li>
            <li>배포 전 자동 백업과 복원 점검 절차를 두어 데이터 손실 가능성을 줄이고 있습니다.</li>
            <li>접속 로그와 시스템 로그는 장애 분석과 보안 점검 범위에서만 접근됩니다.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">5. 개인정보의 보관 기간과 파기</h2>
          <p>
            개인정보는 처리 목적이 유지되는 동안에만 보관합니다. 계정 삭제, 기능 삭제, 운영 정책 변경, 법령상 보존 의무 종료 등의 사유가 발생하면
            지체 없이 삭제 또는 비식별화합니다.
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>계정 정보: 계정이 유지되는 동안 보관하며, 삭제 요청 또는 운영 삭제 시 제거합니다.</li>
            <li>알림, 개인 D-Day, 기상곡 신청, 오류 신고: 기능 운영에 필요한 기간 동안 보관합니다.</li>
            <li>시스템 로그와 접속 기록: 장애 대응과 보안 점검에 필요한 범위에서 일정 기간 보관 후 순환 삭제합니다.</li>
            <li>백업 파일: 서비스 안정성 확보를 위해 별도 보관되며, 운영 정책에 따라 교체 또는 파기됩니다.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">6. 이용자의 권리</h2>
          <p>이용자는 자신의 개인정보에 대해 아래 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>내 정보 확인 및 일부 정보 수정 요청</li>
            <li>개인정보 처리에 대한 문의 또는 오류 정정 요청</li>
            <li>계정 삭제 또는 서비스 이용 중단 요청</li>
            <li>부당한 권한 부여, 알림 오류, 계정 오용에 대한 조사 요청</li>
          </ul>
          <p>
            실제 정정이나 삭제는 서비스 안정성과 학교 운영 정책을 함께 검토한 뒤 처리될 수 있으며, 필요한 경우 본인 확인 절차가 진행됩니다.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">7. 문의처</h2>
          <p>
            개인정보 관련 문의, 정정·삭제 요청, 서비스 운영 관련 문의는 아래 주소로 연락해 주세요.
          </p>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="font-semibold text-slate-900 dark:text-white">관리 연락처</div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">admin@gshs.app</div>
          </div>
        </section>
      </article>
    </div>
  );
}
