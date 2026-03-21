import Link from "next/link";
import { SidebarNav } from "./SidebarNav";

export function Sidebar() {
  return (
    <aside
      className="sidebar-shell hidden md:flex fixed left-0 top-0 w-56 border-r backdrop-blur-xl z-50"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div className="flex h-full w-full flex-col px-3 py-4">
        <div className="sidebar-brand px-2 pb-4 pt-1">
          <Link href="/" className="text-[1.9rem] font-bold leading-none text-[color:var(--foreground)]">
            GSHS.app
          </Link>
        </div>
        <SidebarNav />
      </div>
    </aside>
  );
}
