import { BarChart3, DatabaseBackup, KeyRound, Link, Mail, Save, Settings } from "lucide-react";
import { updateGradeMapping } from "./actions";
import { BackupIntervalForm } from "./backup-interval-form";
import { BackupNowForm } from "./backup-now-form";
import { GoogleAnalyticsForm } from "./google-analytics-form";
import { ICalForm } from "./ical-form";
import { RestoreUploadForm } from "./restore-upload-form";
import { loadSettingsPageData } from "./settings-page-data";
import { TokenPortalSettingsForm } from "./token-portal-settings-form";
import { TokenPortalPasswordForm } from "./token-portal-password-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { mapping, iCalUrl, googleAnalyticsId, backups, intervalDays, tokenPortal, warnings } =
    await loadSettingsPageData();
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://gshs.app"}/signup/request`;

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">System settings</h1>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((warning) => (
            <div
              key={warning}
              className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {warning}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        <div className="glass p-8 rounded-3xl">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Grade mapping
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Map each school grade to the correct class batch number.
          </p>

          <form action={updateGradeMapping} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(mapping).map(([grade, gisu]) => (
                <div key={grade} className="space-y-2">
                  <label className="text-sm font-bold block">Grade {grade}</label>
                  <div className="relative">
                    <input
                      name={`grade${grade}`}
                      type="number"
                      defaultValue={gisu}
                      required
                      className="w-full px-4 py-3 rounded-xl text-center font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      batch
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full py-3 font-bold rounded-xl flex items-center justify-center gap-2 mt-4">
              <Save className="w-4 h-4" />
              Save mapping
            </button>
          </form>
        </div>

        <div className="glass p-8 rounded-3xl">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Link className="w-5 h-5" />
            iCal sync
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Connect the school calendar with a public iCal URL.
          </p>
          <ICalForm initialUrl={iCalUrl} />
        </div>

        <div className="glass p-8 rounded-3xl">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Google Analytics
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Configure the measurement ID here instead of relying on environment variables.
          </p>
          <GoogleAnalyticsForm initialValue={googleAnalyticsId} />
        </div>
      </div>

      <div className="glass p-8 rounded-3xl space-y-8">
        <div className="space-y-2">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Token distribution portal
          </h2>
          <p className="text-sm text-slate-500">
            Share a temporary portal URL with students so they can receive their signup token by email.
          </p>
        </div>

        <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
          <TokenPortalSettingsForm
            enabled={tokenPortal.enabled}
            guidance={tokenPortal.guidance}
            portalUrl={portalUrl}
            todaySentCount={tokenPortal.todaySentCount}
            remainingDailyQuota={tokenPortal.remainingDailyQuota}
            isQuotaReached={tokenPortal.isQuotaReached}
            hasBrevoConfiguration={tokenPortal.hasBrevoConfiguration}
          />

          <div className="space-y-4 rounded-3xl border border-dashed p-5" style={{ borderColor: "var(--border)" }}>
            <div className="space-y-2">
              <h3 className="text-base font-bold flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                Portal password
              </h3>
              <p className="text-sm text-slate-500">
                Rotate the shared access password whenever you think it may have leaked.
              </p>
            </div>
            <TokenPortalPasswordForm hasPassword={tokenPortal.hasPassword} />
          </div>
        </div>
      </div>

      <div className="glass p-8 rounded-3xl space-y-6">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <DatabaseBackup className="w-5 h-5" />
          Backup and restore
        </h2>
        <p className="text-sm text-slate-500">
          Backup files are stored inside <code className="px-1 py-0.5 rounded bg-black/10">data_backup</code>{" "}
          or next to the SQLite database volume when running in Docker.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <BackupIntervalForm intervalDays={intervalDays} />
          <BackupNowForm />
          <RestoreUploadForm />
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Backup files</h3>
          <div className="space-y-2">
            {backups.map((backup) => (
              <div
                key={backup.file}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 rounded-xl border"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="text-sm">
                  <div className="font-mono">{backup.file}</div>
                  <div className="text-xs text-slate-500">
                    {backup.createdAt.toLocaleString("ko-KR")} · {(backup.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={`/admin/settings/backup-download/${encodeURIComponent(backup.file)}`}
                    className="px-3 py-2 rounded-lg border"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Download
                  </a>
                  {backup.hasMeta && (
                    <a
                      href={`/admin/settings/backup-download/${encodeURIComponent(`${backup.file}.json`)}`}
                      className="px-3 py-2 rounded-lg border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      View metadata
                    </a>
                  )}
                </div>
              </div>
            ))}
            {backups.length === 0 && (
              <p className="text-sm text-slate-500">No backup files were found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
