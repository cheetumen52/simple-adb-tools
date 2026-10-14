import { useEffect, useRef } from "react";
import { CheckCircle2, OctagonX } from "lucide-react";
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

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div className="logpanel" style={{ height }}>
      <div className="bar">
        <Kicker muted>{t.log.kicker}</Kicker>
        {lastResult === true && <CheckCircle2 size={13} color="var(--light-cyan)" />}
        {lastResult === false && <OctagonX size={13} color="var(--danger)" />}
        <div className="spacer" />
        <Button variant="link" onClick={() => void copy()} disabled={!lines.length}>{t.log.copy}</Button>
        <Button variant="link" onClick={clear} disabled={!lines.length}>{t.log.clear}</Button>
      </div>
      <div className="lines">
        {!lines.length && <div className="c-muted">{t.log.empty}</div>}
        {lines.map((l) => (
          <div key={l.id} className="logline">
            <span className="t">{timeOfDay(l.time)}</span>
            <span className={`log-${l.kind}`}>{prefix[l.kind] + l.text}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
