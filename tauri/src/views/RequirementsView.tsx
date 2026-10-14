import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { AlertCircle, AlertTriangle, ArrowDownCircle, CheckCircle2, FolderOpen, Hand, RefreshCw, RotateCw, Smartphone, XCircle } from "lucide-react";
import type { ToolName, ToolStatus } from "../lib/native";
import { isReady } from "../lib/parse";
import { tabNumber, useApp } from "../state/app";
import { allReady, useToolchain } from "../state/toolchain";
import { useInstaller } from "../state/installer";
import { Button, Card, Pill, Progress, SectionHeader, Spinner } from "../components/ui";
import { megabytes } from "../lib/format";
import { useT } from "../i18n";

const TOOLS: { tool: ToolName; title: string; requirement: "required" | "recommended" | "optional"; sizeMb: number }[] = [
  { tool: "adb", title: "Android Debug Bridge (adb)", requirement: "required", sizeMb: 16 },
  { tool: "aapt2", title: "Android Asset Packaging Tool (aapt2)", requirement: "recommended", sizeMb: 4.5 },
  { tool: "scrcpy", title: "scrcpy", requirement: "optional", sizeMb: 13 },
];

function StatusIcon({ status, optional }: { status: ToolStatus; optional: boolean }) {
  const size = 22;
  switch (status.kind) {
    case "checking":
      return <Spinner />;
    case "found":
      return <CheckCircle2 size={size} color="var(--light-cyan)" />;
    case "missing":
      return optional ? <AlertCircle size={size} color="var(--warn)" /> : <XCircle size={size} color="var(--danger)" />;
    case "broken":
      return <AlertTriangle size={size} color="var(--danger)" />;
  }
}

function ToolCard({ tool, title, requirement, sizeMb }: (typeof TOOLS)[number]) {
  const tc = useToolchain();
  const t = useT();
  const m = t.requirements;
  const status = tc[tool];
  const missing = status.kind === "missing" || status.kind === "broken";
  return (
    <Card highlight={tool !== "scrcpy" && missing}>
      <div className="row top" style={{ gap: 14 }}>
        <div style={{ width: 26, display: "flex", justifyContent: "center", paddingTop: 2 }}>
          <StatusIcon status={status} optional={tool !== "adb"} />
        </div>
        <div className="stack" style={{ flex: 1, minWidth: 0 }}>
          <div className="row">
            <span className="title-sm">{title}</span>
            <Pill color={tool === "adb" ? "var(--accent)" : "var(--text-muted)"} dot={false}>{m[requirement]}</Pill>
          </div>
          <div className="caption">{m[`${tool}Description` as const]}</div>
          {status.kind === "checking" && <div className="mono c-muted">{m.searching}</div>}
          {status.kind === "missing" && <div className="mono c-warn">{m.notFound}</div>}
          {status.kind === "found" && (
            <div className="stack" style={{ gap: 2 }}>
              <span className="mono c-cyan">{m.version(status.version)}</span>
              <span className="mono-sm c-muted truncate selectable">{status.path}</span>
            </div>
          )}
          {status.kind === "broken" && (
            <div className="stack" style={{ gap: 2 }}>
              <span className="mono c-danger">{m.cantRun(status.error)}</span>
              {/cpu/i.test(status.error) && <span className="mono-sm c-warn">{m.rosetta}</span>}
              <span className="mono-sm c-muted truncate">{status.path}</span>
            </div>
          )}
          {tc.installing === tool ? (
            <div className="row" style={{ marginTop: 6, gap: 10 }}>
              <Progress value={tc.progress} />
              <span className="mono-sm c-muted" style={{ width: 40, textAlign: "right" }}>{Math.round(tc.progress * 100)} %</span>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 6 }}>
              {missing && (
                <>
                  <Button variant="primary" small icon={<ArrowDownCircle size={13} />} disabled={!!tc.installing} onClick={() => void tc.install(tool)}>
                    {m.downloadInstall(megabytes(sizeMb))}
                  </Button>
                  {tool === "adb" && <Button small onClick={() => void tc.chooseAdb()}>{m.chooseManually}</Button>}
                </>
              )}
              {status.kind === "found" && (
                <>
                  <Button small icon={<FolderOpen size={13} />} onClick={() => void revealItemInDir(status.path)}>{t.common.showInFolder}</Button>
                  {status.managed && (
                    <Button small icon={<RefreshCw size={13} />} disabled={!!tc.installing} onClick={() => void tc.install(tool)}>{m.update}</Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function DeviceCard() {
  const { devices, running, restartAdb } = useInstaller();
  const adbReady = useToolchain((s) => s.adb.kind === "found");
  const platform = useApp((s) => s.paths?.platform);
  const ready = devices.filter(isReady).length;
  const unauthorized = devices.some((d) => d.state === "unauthorized");
  const t = useT();
  const m = t.requirements;
  return (
    <Card>
      <div className="row top" style={{ gap: 14 }}>
        <div style={{ width: 26, display: "flex", justifyContent: "center", paddingTop: 2 }}>
          {ready ? <CheckCircle2 size={22} color="var(--light-cyan)" /> : unauthorized ? <Hand size={22} color="var(--warn)" /> : <Smartphone size={22} color="var(--warn)" />}
        </div>
        <div className="stack" style={{ flex: 1, gap: 8 }}>
          <div className="row">
            <span className="title-sm">{m.phoneTitle}</span>
            {ready ? <Pill>{m.connectedCount(ready)}</Pill> : unauthorized ? <Pill color="var(--warn)">{m.awaitingConfirm}</Pill> : <Pill color="var(--text-muted)">{m.notConnected}</Pill>}
          </div>
          {m.steps.map((step, i) => (
            <div key={i} className="row top" style={{ gap: 10 }}>
              <span className="mono-sm c-accent" style={{ paddingTop: 1 }}>{String(i + 1).padStart(2, "0")}</span>
              <span className="caption secondary">{step}</span>
            </div>
          ))}
          {platform === "windows" && (
            <div className="caption c-warn">{m.windowsDriver}</div>
          )}
          <div>
            <Button small icon={<RotateCw size={13} />} disabled={!adbReady || running} onClick={() => void restartAdb()}>{t.common.restartAdb}</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function RequirementsView() {
  const tc = useToolchain();
  const setTab = useApp((s) => s.setTab);
  const ready = allReady(tc);
  const m = useT().requirements;
  return (
    <div className="scroll">
      <div className="page">
        <SectionHeader
          number={tabNumber("requirements")}
          kicker={m.kicker}
          title={ready ? m.titleReady : m.titleMissing}
          lede={m.lede}
          trailing={<Button small icon={<RotateCw size={13} />} onClick={() => void tc.check()}>{m.recheck}</Button>}
        />
        {TOOLS.map((t) => <ToolCard key={t.tool} {...t} />)}
        <DeviceCard />
        {tc.error && <div className="row caption c-danger"><XCircle size={14} /> {tc.error}</div>}
        <div className="stack" style={{ gap: 4 }}>
          <div className="caption">{m.sources}</div>
          <div className="row" style={{ gap: 16 }}>
            <Button variant="link" onClick={() => void openUrl("https://developer.android.com/studio/terms")}>{m.sdkTerms}</Button>
            <Button variant="link" onClick={() => void openUrl("https://github.com/Genymobile/scrcpy")}>{m.scrcpyRepo}</Button>
          </div>
        </div>
        {ready && (
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button variant="primary" onClick={() => setTab("install")}>{m.continue}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
