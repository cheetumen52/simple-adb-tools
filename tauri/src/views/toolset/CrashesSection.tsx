import { useEffect } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { AlignLeft, Bug, Copy, RefreshCcw, Save, Trash2, X } from "lucide-react";
import { native } from "../../lib/native";
import { shQuote } from "../../lib/parse";
import { fileStamp, timeAgo } from "../../lib/format";
import { useCrashes, type CrashRecord } from "../../state/crashes";
import { useToolset } from "../../state/toolset";
import { log } from "../../state/log";
import { useT } from "../../i18n";
import { Button, Card, Kicker, Pill, Switch } from "../../components/ui";

const report = (e: CrashRecord) => [`${e.pkg} · ${e.device} · ${e.time}`, ...e.lines].join("\n");

function CrashCard({ event, open }: { event: CrashRecord; open: boolean }) {
  const t = useT();
  const m = t.crashes;
  const remove = useCrashes((s) => s.remove);

  const restart = async () => {
    const q = shQuote(event.pkg);
    log("command", `${t.actions.restart} ${event.pkg} → ${event.device}`);
    await native.run("adb", ["-s", event.serial, "shell", `am force-stop ${q}; monkey -p ${q} -c android.intent.category.LAUNCHER 1`], 30000);
  };
  const openLogcat = () => {
    const toolset = useToolset.getState();
    if (toolset.logcatRunning) toolset.stopLogcat();
    toolset.set({ serial: event.serial, logcatPackage: event.pkg, section: "logcat" });
    window.setTimeout(() => void useToolset.getState().startLogcat(), 300);
  };
  const saveReport = async () => {
    const path = await saveDialog({ defaultPath: `${event.pkg}_${event.kind}_${fileStamp()}.txt` });
    if (path) await native.writeText(path, report(event));
  };

  return (
    <Card danger={event.kind !== "anr"} compact>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row top" style={{ gap: 12 }}>
          <Bug size={18} color={event.kind === "anr" ? "var(--warn)" : "var(--danger)"} style={{ marginTop: 2 }} />
          <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
            <div className="row" style={{ minWidth: 0 }}>
              <Pill color={event.kind === "anr" ? "var(--warn)" : "var(--danger)"} dot={false}>{m.kinds[event.kind]}</Pill>
              <span className="mono truncate selectable" style={{ color: "var(--text-light)", fontWeight: 600 }}>{event.pkg}</span>
            </div>
            <span className="caption truncate selectable" title={event.title}>{event.title}</span>
            <span className="mono-sm c-muted">
              {event.device}  ·  {timeAgo(event.at)}{event.pid != null ? `  ·  ${m.pid(event.pid)}` : ""}
            </span>
          </div>
          <Button variant="plain" icon={<X size={14} />} title={m.remove} onClick={() => remove(event.id)} />
        </div>
        <details className="trace" open={open}>
          <summary>{m.trace(event.lines.length)}</summary>
          <pre className="console selectable">{event.lines.join("\n")}</pre>
        </details>
        <div className="row wrap">
          <Button small icon={<RefreshCcw size={13} />} onClick={() => void restart()}>{m.restartApp}</Button>
          <Button small icon={<AlignLeft size={13} />} onClick={openLogcat}>{m.appLogcat}</Button>
          <Button small icon={<Copy size={13} />} onClick={() => void navigator.clipboard.writeText(report(event))}>{m.copy}</Button>
          <Button small icon={<Save size={13} />} onClick={() => void saveReport()}>{m.save}</Button>
        </div>
      </div>
    </Card>
  );
}

export function CrashesSection() {
  const { enabled, notify, includeSystem, events, watching, setOption, markSeen, clear } = useCrashes();
  const m = useT().crashes;

  useEffect(() => {
    markSeen();
  }, [events.length, markSeen]);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card highlight={enabled}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row top" style={{ gap: 14 }}>
            <div className="stack" style={{ gap: 3, flex: 1 }}>
              <Kicker muted>{m.kicker}</Kicker>
              <span className="title-sm">{m.title}</span>
              <span className="caption">{enabled ? m.watching(watching.length) : m.off}</span>
            </div>
            <Switch label={m.enabled} checked={enabled} onChange={(v) => setOption("enabled", v)} />
          </div>
          <div className="row wrap" style={{ gap: 20 }}>
            <Switch label={m.notify} checked={notify} disabled={!enabled} onChange={(v) => setOption("notify", v)} />
            <Switch label={m.includeSystem} checked={includeSystem} disabled={!enabled} onChange={(v) => setOption("includeSystem", v)} />
            <div className="spacer" />
            {events.length > 0 && <Button small icon={<Trash2 size={13} />} onClick={clear}>{m.clearAll}</Button>}
          </div>
        </div>
      </Card>
      {events.length === 0 ? (
        <Card><span className="caption">{m.empty}</span></Card>
      ) : (
        events.map((e, i) => <CrashCard key={e.id} event={e} open={i === 0} />)
      )}
    </div>
  );
}
