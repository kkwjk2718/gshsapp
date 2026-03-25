"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  GraduationCap,
  Hash,
  KeyRound,
  Radio,
  Search,
  Shield,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";

import {
  changeUserGisu,
  changeUserRole,
  deleteUserAccount,
  resetPassword,
} from "./actions";
import { formatKST } from "@/lib/date-utils";
import { canChangeGisu, ROLE_LABELS, type UserRole } from "@/lib/user-roles";

interface User {
  id: string;
  name: string;
  userId: string;
  role: string;
  studentId: string | null;
  gisu: number | null;
  createdAt: Date;
}

interface UserGroupListProps {
  users: User[];
  currentAdminId: string;
}

interface NewPasswordInfo {
  user: User;
  pass: string;
}

type TabKey = "STUDENT" | "GRADUATE" | "TEACHER" | "BROADCAST" | "ADMIN";

const TAB_ITEMS: Array<{
  id: TabKey;
  label: string;
  icon: typeof UserIcon;
}> = [
  { id: "STUDENT", label: "학생", icon: UserIcon },
  { id: "GRADUATE", label: "졸업생", icon: GraduationCap },
  { id: "TEACHER", label: "교사", icon: GraduationCap },
  { id: "BROADCAST", label: "방송부", icon: Radio },
  { id: "ADMIN", label: "관리자", icon: Shield },
];

function getRoleLabel(role: string) {
  return ROLE_LABELS[role as UserRole] ?? role;
}

function getRoleChangeSummary(role: string) {
  if (role === "ADMIN") {
    return "관리자로 변경되면 기수는 제거되고, 기존 학생번호는 유지됩니다.";
  }

  if (role === "BROADCAST") {
    return "방송부 권한은 학생 메타데이터를 그대로 유지합니다.";
  }

  if (role === "GRADUATE") {
    return "졸업생 권한은 학생번호와 기수를 유지하지만, 학생 전용 핵심 기능 접근은 제한됩니다.";
  }

  if (role === "TEACHER") {
    return "교사 권한으로 변경되면 학생번호와 기수가 모두 제거됩니다.";
  }

  return "학생 권한으로 변경하면 4자리 학생번호로 기수를 다시 계산합니다.";
}

function getGisuGroupLabel(gisu: number | null) {
  return gisu ? `${gisu}기` : "기수 미설정";
}

function getAvatarTone(role: string) {
  if (role === "ADMIN") return "bg-indigo-500";
  if (role === "TEACHER") return "bg-emerald-500";
  if (role === "BROADCAST") return "bg-rose-500";
  if (role === "GRADUATE") return "bg-sky-500";
  return "bg-slate-400";
}

export function UserGroupList({ users, currentAdminId }: UserGroupListProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>("STUDENT");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newPasswordInfo, setNewPasswordInfo] = useState<NewPasswordInfo | null>(null);
  const [copied, setCopied] = useState(false);

  const [selectedRoleUser, setSelectedRoleUser] = useState<User | null>(null);
  const [nextRole, setNextRole] = useState<string>("STUDENT");
  const [nextStudentId, setNextStudentId] = useState("");
  const [roleChangeError, setRoleChangeError] = useState<string | null>(null);

  const [selectedGisuUser, setSelectedGisuUser] = useState<User | null>(null);
  const [nextGisu, setNextGisu] = useState("");
  const [gisuChangeError, setGisuChangeError] = useState<string | null>(null);

  const [selectedDeleteUser, setSelectedDeleteUser] = useState<User | null>(null);
  const [deleteConfirmLoginId, setDeleteConfirmLoginId] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isResetPending, startResetTransition] = useTransition();
  const [isRolePending, startRoleTransition] = useTransition();
  const [isGisuPending, startGisuTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();

  const lowerSearch = search.trim().toLowerCase();
  const isSearching = lowerSearch.length > 0;

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (isSearching) {
        return (
          user.name.toLowerCase().includes(lowerSearch) ||
          user.userId.toLowerCase().includes(lowerSearch) ||
          (user.studentId ?? "").toLowerCase().includes(lowerSearch)
        );
      }

      return user.role === activeTab;
    });
  }, [users, activeTab, isSearching, lowerSearch]);

  const groupedUsers = useMemo(() => {
    if (isSearching) {
      const groups: Record<string, User[]> = {
        STUDENT: [],
        GRADUATE: [],
        TEACHER: [],
        BROADCAST: [],
        ADMIN: [],
      };

      for (const user of filteredUsers) {
        if (!groups[user.role]) {
          groups[user.role] = [];
        }
        groups[user.role].push(user);
      }

      return groups;
    }

    if (activeTab !== "STUDENT" && activeTab !== "GRADUATE") {
      return null;
    }

    const groups: Record<string, User[]> = {};
    for (const user of filteredUsers) {
      const label = getGisuGroupLabel(user.gisu);
      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(user);
    }

    return groups;
  }, [activeTab, filteredUsers, isSearching]);

  const isSelfAdminDemotion =
    !!selectedRoleUser &&
    selectedRoleUser.id === currentAdminId &&
    selectedRoleUser.role === "ADMIN" &&
    nextRole !== "ADMIN";

  const handleResetPassword = (user: User) => {
    if (!confirm(`${user.name} 계정의 비밀번호를 초기화할까요?`)) {
      return;
    }

    startResetTransition(async () => {
      const formData = new FormData();
      formData.append("userId", user.id);

      const result = await resetPassword(formData);
      if (result.success) {
        const match = result.success.match(/New password is: (.*)$/);
        if (match?.[1]) {
          setNewPasswordInfo({ user, pass: match[1] });
          return;
        }
      }

      alert(result.error || result.success || "비밀번호 초기화 중 오류가 발생했습니다.");
    });
  };

  const handleCopyPassword = async () => {
    if (!newPasswordInfo) return;
    await navigator.clipboard.writeText(newPasswordInfo.pass);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenRoleModal = (user: User) => {
    setSelectedRoleUser(user);
    setNextRole(user.role);
    setNextStudentId(user.studentId ?? "");
    setRoleChangeError(null);
  };

  const handleRoleChange = () => {
    if (!selectedRoleUser) return;

    setRoleChangeError(null);
    startRoleTransition(async () => {
      const formData = new FormData();
      formData.append("userId", selectedRoleUser.id);
      formData.append("targetRole", nextRole);
      formData.append("studentId", nextStudentId);

      const result = await changeUserRole(formData);
      if (result.error) {
        setRoleChangeError(result.error);
        return;
      }

      setSelectedRoleUser(null);
      alert(result.success ?? "권한이 변경되었습니다.");
      router.refresh();
    });
  };

  const handleOpenGisuModal = (user: User) => {
    setSelectedGisuUser(user);
    setNextGisu(user.gisu ? String(user.gisu) : "");
    setGisuChangeError(null);
  };

  const handleGisuChange = () => {
    if (!selectedGisuUser) return;

    setGisuChangeError(null);
    startGisuTransition(async () => {
      const formData = new FormData();
      formData.append("userId", selectedGisuUser.id);
      formData.append("gisu", nextGisu);

      const result = await changeUserGisu(formData);
      if (result.error) {
        setGisuChangeError(result.error);
        return;
      }

      setSelectedGisuUser(null);
      alert(result.success ?? "기수가 변경되었습니다.");
      router.refresh();
    });
  };

  const handleOpenDeleteModal = (user: User) => {
    setSelectedDeleteUser(user);
    setDeleteConfirmLoginId("");
    setDeleteError(null);
  };

  const handleDeleteUser = () => {
    if (!selectedDeleteUser) return;

    setDeleteError(null);
    startDeleteTransition(async () => {
      const formData = new FormData();
      formData.append("userId", selectedDeleteUser.id);
      formData.append("confirmLoginId", deleteConfirmLoginId);

      const result = await deleteUserAccount(formData);
      if (result.error) {
        setDeleteError(result.error);
        return;
      }

      setSelectedDeleteUser(null);
      alert(result.success ?? "사용자를 삭제했습니다.");
      router.refresh();
    });
  };

  const renderUserRow = (user: User) => (
    <div
      key={user.id}
      className="flex items-center justify-between gap-4 border-b border-slate-800 p-4 last:border-0"
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${getAvatarTone(user.role)}`}
        >
          {user.name[0]}
        </div>

        <div>
          <div className="font-bold text-slate-100">{user.name}</div>
          <div className="text-xs text-slate-500">
            {user.userId} · {getRoleLabel(user.role)}
            {user.studentId ? ` · 학번 ${user.studentId}` : ""}
            {user.gisu ? ` · ${user.gisu}기` : ""}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden text-right text-xs text-slate-400 md:block">
          {formatKST(user.createdAt, "yyyy.MM.dd")}
        </div>

        <button
          onClick={() => handleOpenRoleModal(user)}
          disabled={isRolePending}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-50"
        >
          권한 변경
        </button>

        {canChangeGisu(user.role) ? (
          <button
            onClick={() => handleOpenGisuModal(user)}
            disabled={isGisuPending}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:opacity-50"
          >
            기수 변경
          </button>
        ) : null}

        <button
          onClick={() => handleResetPassword(user)}
          disabled={isResetPending}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-indigo-300 disabled:opacity-50"
          title="비밀번호 초기화"
        >
          <KeyRound className="h-4 w-4" />
        </button>

        <button
          onClick={() => handleOpenDeleteModal(user)}
          disabled={isDeletePending}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-rose-300 disabled:opacity-50"
          title="사용자 삭제"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {newPasswordInfo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="glass relative w-full max-w-sm rounded-3xl p-8">
            <button
              onClick={() => setNewPasswordInfo(null)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="mb-2 text-lg font-bold">비밀번호 초기화 완료</h2>
            <p className="mb-4 text-sm text-slate-400">
              <span className="font-semibold text-indigo-300">{newPasswordInfo.user.name}</span> 계정의 새 비밀번호입니다.
              이 창을 닫으면 다시 확인할 수 없습니다.
            </p>
            <div className="flex gap-2 rounded-xl bg-slate-800 p-4">
              <code className="flex-1 select-all font-mono text-lg font-bold">{newPasswordInfo.pass}</code>
              <button onClick={handleCopyPassword} className="rounded-lg bg-slate-700 p-2 text-slate-300">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedRoleUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="glass relative w-full max-w-md rounded-3xl p-8 space-y-6">
            <button
              onClick={() => setSelectedRoleUser(null)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-200"
              aria-label="권한 변경 닫기"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-100">권한 변경</h2>
              <p className="text-sm text-slate-400">
                <span className="font-semibold text-indigo-300">{selectedRoleUser.name}</span> ({selectedRoleUser.userId}) 계정의
                권한을 변경합니다.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300 space-y-1">
              <div>현재 권한: <span className="font-semibold text-slate-100">{getRoleLabel(selectedRoleUser.role)}</span></div>
              <div>현재 학번: <span className="font-semibold text-slate-100">{selectedRoleUser.studentId ?? "없음"}</span></div>
              <div>현재 기수: <span className="font-semibold text-slate-100">{selectedRoleUser.gisu ? `${selectedRoleUser.gisu}기` : "없음"}</span></div>
            </div>

            <div className="space-y-3">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">변경할 권한</span>
                <select
                  value={nextRole}
                  onChange={(event) => setNextRole(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="STUDENT">학생</option>
                  <option value="GRADUATE">졸업생</option>
                  <option value="TEACHER">교사</option>
                  <option value="BROADCAST">방송부</option>
                  <option value="ADMIN">관리자</option>
                </select>
              </label>

              {nextRole === "STUDENT" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">학생번호</span>
                  <input
                    value={nextStudentId}
                    onChange={(event) => setNextStudentId(event.target.value)}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="예: 1304"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
              ) : null}

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                {getRoleChangeSummary(nextRole)}
              </div>

              {isSelfAdminDemotion ? (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                  현재 로그인한 관리자 계정의 ADMIN 권한은 해제할 수 없습니다.
                </div>
              ) : null}

              {roleChangeError ? (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {roleChangeError}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedRoleUser(null)}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleRoleChange}
                disabled={isRolePending || nextRole === selectedRoleUser.role || isSelfAdminDemotion}
                className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRolePending ? "변경 중..." : "권한 변경 적용"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedGisuUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="glass relative w-full max-w-md rounded-3xl p-8 space-y-6">
            <button
              onClick={() => setSelectedGisuUser(null)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-200"
              aria-label="기수 변경 닫기"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-100">기수 변경</h2>
              <p className="text-sm text-slate-400">
                <span className="font-semibold text-sky-300">{selectedGisuUser.name}</span> ({selectedGisuUser.userId}) 계정의 기수를
                변경합니다.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300 space-y-1">
              <div>현재 역할: <span className="font-semibold text-slate-100">{getRoleLabel(selectedGisuUser.role)}</span></div>
              <div>현재 기수: <span className="font-semibold text-slate-100">{selectedGisuUser.gisu ? `${selectedGisuUser.gisu}기` : "없음"}</span></div>
              <div>현재 학번: <span className="font-semibold text-slate-100">{selectedGisuUser.studentId ?? "없음"}</span></div>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">새 기수</span>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={nextGisu}
                  onChange={(event) => setNextGisu(event.target.value)}
                  inputMode="numeric"
                  placeholder="예: 42"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </label>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
              학생, 방송부, 졸업생 계정만 기수를 변경할 수 있습니다. 졸업생도 조기졸업 등 상황에 맞게 2기·3기처럼 직접 조정할 수 있습니다.
            </div>

            {gisuChangeError ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                {gisuChangeError}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedGisuUser(null)}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleGisuChange}
                disabled={isGisuPending}
                className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGisuPending ? "변경 중..." : "기수 변경 적용"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDeleteUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="glass relative w-full max-w-md rounded-3xl p-8 space-y-6">
            <button
              onClick={() => setSelectedDeleteUser(null)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-200"
              aria-label="사용자 삭제 닫기"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-100">사용자 삭제</h2>
              <p className="text-sm text-slate-400">
                <span className="font-semibold text-rose-300">{selectedDeleteUser.name}</span> ({selectedDeleteUser.userId}) 계정을 삭제합니다.
              </p>
            </div>

            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              사용자 삭제 시 해당 사용자가 작성한 공지, 일정, 신청곡, 개인 일정, 알림, 오류 신고와 감사 로그가 함께 정리됩니다.
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">
                삭제를 진행하려면 로그인 ID <span className="font-bold text-rose-300">{selectedDeleteUser.userId}</span> 를 입력하세요.
              </span>
              <input
                value={deleteConfirmLoginId}
                onChange={(event) => setDeleteConfirmLoginId(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder={selectedDeleteUser.userId}
              />
            </label>

            {selectedDeleteUser.id === currentAdminId ? (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                현재 로그인한 관리자 계정은 삭제할 수 없습니다.
              </div>
            ) : null}

            {deleteError ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                {deleteError}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedDeleteUser(null)}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={isDeletePending || selectedDeleteUser.id === currentAdminId}
                className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeletePending ? "삭제 중..." : "사용자 삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div
            className={`flex w-fit shrink-0 rounded-xl bg-slate-800 p-1 transition-opacity ${
              isSearching ? "pointer-events-none opacity-50" : "opacity-100"
            }`}
          >
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                  activeTab === tab.id
                    ? "bg-slate-700 text-indigo-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:ml-auto md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="이름, 아이디, 학번 검색..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="glass min-h-[300px] overflow-hidden rounded-3xl">
          {isSearching ? (
            <div className="divide-y divide-slate-800">
              <div className="bg-indigo-900/20 p-4 text-sm font-bold text-indigo-400">
                검색 결과: {filteredUsers.length}명
              </div>

              {groupedUsers && Object.entries(groupedUsers).map(([role, groupUsers]) => {
                if (groupUsers.length === 0) return null;

                return (
                  <div key={role}>
                    <div className="border-y border-slate-800 bg-slate-800/50 p-3 text-xs font-bold text-slate-500">
                      {getRoleLabel(role)} ({groupUsers.length})
                    </div>
                    {groupUsers.map(renderUserRow)}
                  </div>
                );
              })}

              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-slate-500">검색 결과가 없습니다.</div>
              ) : null}
            </div>
          ) : activeTab === "STUDENT" || activeTab === "GRADUATE" ? (
            <div className="divide-y divide-slate-800">
              {groupedUsers && Object.entries(groupedUsers)
                .sort(([left], [right]) => right.localeCompare(left))
                .map(([groupLabel, groupUsers]) => (
                  <div key={groupLabel}>
                    <button
                      onClick={() => setExpandedGroup(expandedGroup === groupLabel ? null : groupLabel)}
                      className="flex w-full items-center justify-between bg-slate-900/30 p-4 text-left transition-colors hover:bg-slate-800"
                    >
                      <div className="flex items-center gap-2 font-bold text-slate-300">
                        {expandedGroup === groupLabel ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {groupLabel}
                      </div>
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400">{groupUsers.length}명</span>
                    </button>

                    {expandedGroup === groupLabel ? (
                      <div className="border-t border-slate-800 bg-slate-950 pl-4">
                        {groupUsers.map(renderUserRow)}
                      </div>
                    ) : null}
                  </div>
                ))}

              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-slate-500">표시할 사용자가 없습니다.</div>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filteredUsers.length > 0 ? (
                filteredUsers.map(renderUserRow)
              ) : (
                <div className="p-12 text-center text-slate-500">표시할 사용자가 없습니다.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
