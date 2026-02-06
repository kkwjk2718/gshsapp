export default function PrivacyPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-8">
       <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">개인정보 처리방침</h1>
          <p className="text-slate-500">최종 수정일: 2025년 11월 20일</p>
       </div>

       <article className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 space-y-6">
          <section>
             <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">1. 총칙</h2>
             <p>
                'GSHS.app'(이하 '본 서비스')은 경남과학고등학교 학생 및 교직원의 개인정보를 소중하게 생각하며, '개인정보 보호법' 등 관련 법령을 준수하기 위해 노력하고 있습니다.
                본 개인정보 처리방침은 이용자가 안심하고 서비스를 이용할 수 있도록 개인정보 수집 목적, 항목, 보유 기간 및 보호 조치 등을 설명합니다.
             </p>
          </section>

          <section>
             <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">2. 수집하는 개인정보의 항목 및 수집 방법</h2>
             <p>본 서비스는 회원가입, 원활한 서비스 제공, 커뮤니티 운영 등을 위해 최소한의 개인정보를 수집하고 있습니다.</p>
             <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li><strong>필수 수집 항목:</strong> 이름, 아이디(학번 또는 교직원 번호), 비밀번호(암호화 저장), 이메일 주소, 학년/반/번호(학생의 경우).</li>
                <li><strong>자동 수집 항목:</strong> 서비스 이용 기록, 접속 로그, 쿠키, 접속 IP 정보, 기기 정보.</li>
             </ul>
          </section>

          <section>
             <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">3. 개인정보의 수집 및 이용 목적</h2>
             <p>수집한 개인정보는 다음의 목적을 위해서만 이용됩니다.</p>
             <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li><strong>회원 관리:</strong> 본인 확인, 개인 식별, 불량 회원의 부정 이용 방지, 가입 의사 확인.</li>
                <li><strong>서비스 제공:</strong> 맞춤형 시간표/급식 정보 제공, 기상곡 신청 및 관리, 공지사항 전달.</li>
                <li><strong>커뮤니케이션:</strong> 공지사항 전달, 불만 처리 등 원활한 의사소통 경로 확보.</li>
             </ul>
          </section>

          <section>
             <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">4. 개인정보의 보유 및 이용 기간</h2>
             <p>
                이용자의 개인정보는 원칙적으로 개인정보 수집 및 이용 목적이 달성된 후에는 지체 없이 파기합니다. 
                단, 다음의 정보에 대해서는 아래의 이유로 명시한 기간 동안 보존합니다.
             </p>
             <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li><strong>회원 가입 정보:</strong> 회원 탈퇴 시까지 (단, 재가입 방지 및 부정이용 기록 확인을 위해 탈퇴 후 30일간 보관).</li>
                <li><strong>로그 기록:</strong> 통신비밀보호법에 따라 3개월간 보관.</li>
             </ul>
          </section>

          <section>
             <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">5. 개인정보의 파기 절차 및 방법</h2>
             <p>
                개인정보 파기 시점 도래 시, 전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제하며, 종이 문서는 분쇄하거나 소각하여 파기합니다.
             </p>
          </section>

          <section>
             <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">6. 이용자의 권리와 행사 방법</h2>
             <p>
                이용자는 언제든지 자신의 개인정보를 조회하거나 수정할 수 있으며, 회원 탈퇴를 통해 개인정보 수집 및 이용 동의를 철회할 수 있습니다.
                개인정보 관련 문의는 정보부 또는 관리자에게 연락 바랍니다.
             </p>
          </section>
          
          <section>
             <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">7. 개인정보 보호책임자</h2>
             <p>본 서비스는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 관련 고충을 처리하기 위해 아래와 같이 책임자를 지정하고 있습니다.</p>
             <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li><strong>책임 부서:</strong> 경남과학고등학교 정보부</li>
                <li><strong>개발 및 운영 담당:</strong> 김건우</li>
                <li><strong>연락처:</strong> 학교 대표 전화 또는 정보부 내선 번호</li>
             </ul>
          </section>
       </article>
    </div>
  );
}
