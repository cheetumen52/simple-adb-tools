import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, OctagonX } from "lucide-react";
import { load, save } from "../lib/storage";
import { useLog } from "../state/log";
import { useInstaller } from "../state/installer";
import { timeOfDay } from "../lib/format";
import { Button, Kicker } from "./ui";
import { useT } from "../i18n";

const prefix = { command: "$ ", output: "  ", info: "", success: "", error: "" } as const;

export function LogPanel({ height = 210 }: { height?: number }) {
  const lines = useLog((s) => s.lines);
  const { clear, copy } = useLog.getState();
  const lastResult = useInstaller((s) => s.lastResult);
  const end = useRef<HTMLDivElement>(null);
  const t = useT();
  const [collapsed, setCollapsed] = useState(() => load("logCollapsed", false));
  const toggle = () => {
    setCollapsed(!collapsed);
    save("logCollapsed", !collapsed);
  };
  const latest = lines.at(-1);

  useEffect(() => {
    if (!collapsed) end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, collapsed]);

  return (
    <div className={`logpanel${collapsed ? " collapsed" : ""}`} style={collapsed ? undefined : { height }}>
      <div className="bar">
        <button className="btn plain" onClick={toggle} title={collapsed ? t.log.expand : t.log.collapse}>
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <Kicker muted>{t.log.kicker}</Kicker>
        {collapsed && latest && <span className={`log-${latest.kind} mono-sm truncate`} style={{ flex: 1 }}>{latest.text}</span>}
        {lastResult === true && <CheckCircle2 size={13} color="var(--light-cyan)" />}
        {lastResult === false && <OctagonX size={13} color="var(--danger)" />}
        {!(collapsed && latest) && <div className="spacer" />}
        <Button variant="link" onClick={() => void copy()} disabled={!lines.length}>{t.log.copy}</Button>
        <Button variant="link" onClick={clear} disabled={!lines.length}>{t.log.clear}</Button>
      </div>
      {!collapsed && <div className="lines">
        {!lines.length && <div className="c-muted">{t.log.empty}</div>}
        {lines.map((l) => (
          <div key={l.id} className="logline">
            <span className="t">{timeOfDay(l.time)}</span>
            <span className={`log-${l.kind}`}>{prefix[l.kind] + l.text}</span>
          </div>
        ))}
        <div ref={end} />
      </div>}
    </div>
  );
}
