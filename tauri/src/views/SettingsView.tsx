import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowDownCircle, BadgeCheck, Coffee, HelpCircle, Languages, RefreshCw, Sparkles, Stethoscope } from "lucide-react";
import { BRAND, tabNumber, useApp } from "../state/app";
import { useUpdates } from "../state/updates";
import { diagnostics } from "../state/installer";
import { CHANGELOG, localizedNotes, noteItems, type ChangelogRelease } from "../lib/changelog";
import { shortTime } from "../lib/format";
import { LANGUAGES, systemLang, useI18n, useT, type LangSetting } from "../i18n";
import { BrandMark, Button, Card, Kicker, SectionHeader, Spinner } from "../components/ui";

function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  return [on, () => { setOn(true); window.setTimeout(() => setOn(false), 1800); }];
}

function LanguageCard() {
  const { setting, setSetting } = useI18n();
  const m = useT().settings;
  const options: [LangSetting, string][] = [["system", m.languageSystem], ...LANGUAGES.map((l): [LangSetting, string] => [l.id, l.name])];
  const systemName = LANGUAGES.find((l) => l.id === systemLang())?.name ?? "English";
  return (
    <Card>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ width: 26, display: "flex", justifyContent: "center" }}>
          <Languages size={20} color="var(--accent)" />
        </div>
        <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
          <Kicker muted>{m.languageKicker}</Kicker>
          <span className="title-sm">{m.languageTitle}</span>
          {setting === "system" && <span className="caption">{m.languageSystemHint(systemName)}</span>}
        </div>
        <div className="subnav">
          {options.map(([id, label]) => (
            <button key={id} className={`subtab${setting === id ? " active" : ""}`} onClick={() => setSetting(id)}>{label}</button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function UpdateCard() {
  const { state, lastChecked, check, install } = useUpdates();
  const version = useApp((s) => s.version);
  const lang = useI18n((s) => s.lang);
  const m = useT().settings;
  const checked = lastChecked ? m.lastChecked(shortTime(lastChecked)) : null;
  const title =
    state.kind === "checking" ? m.checking
    : state.kind === "upToDate" ? m.upToDate(version)
    : state.kind === "available" ? m.available(state.tag)
    : state.kind === "installing" ? m.installing(state.tag)
    : state.kind === "failed" ? m.checkFailed
    : m.version(version);
  const subtitle =
    state.kind === "failed" ? state.reason
    : state.kind === "available" ? (state.autoInstall ? m.autoInstallHint(version) : `${m.installedVersion(version)} ${checked ?? ""}`)
    : state.kind === "installing" ? (state.progress != null ? m.downloaded(Math.round(state.progress * 100)) : m.preparing)
    : checked ?? m.checksRepo(BRAND.repo);
  const notes = state.kind === "available" ? noteItems(localizedNotes(state.notes, lang)) : [];
  return (
    <Card highlight={state.kind === "available" || state.kind === "installing"}>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ width: 26, display: "flex", justifyContent: "center" }}>
          {state.kind === "checking" || state.kind === "installing" ? <Spinner />
            : state.kind === "available" ? <Sparkles size={20} color="var(--accent)" />
            : state.kind === "upToDate" ? <BadgeCheck size={20} color="var(--light-cyan)" />
            : <HelpCircle size={20} color="var(--text-muted)" />}
        </div>
        <div className="stack" style={{ gap: 3, flex: 1 }}>
          <Kicker muted>{m.updateKicker}</Kicker>
          <span className="title-sm">{title}</span>
          <span className="caption">{subtitle}</span>
        </div>
        {state.kind === "available" && state.autoInstall && (
          <Button variant="primary" small icon={<ArrowDownCircle size={13} />} onClick={() => void install()}>{m.updateRestart}</Button>
        )}
        {state.kind === "available" && !state.autoInstall && (
          <Button variant="primary" small icon={<ArrowDownCircle size={13} />} onClick={() => void openUrl(state.url)}>{m.download(state.tag)}</Button>
        )}
        {state.kind === "installing" && state.progress != null && <span className="mono c-accent">{Math.round(state.progress * 100)} %</span>}
        <Button small icon={<RefreshCw size={13} />} disabled={state.kind === "checking" || state.kind === "installing"} onClick={() => void check()}>{m.check}</Button>
      </div>
      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )}
    </Card>
  );
}

function ReleaseNotes({ release }: { release: ChangelogRelease }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {release.groups.map((g) => (
        <div key={g.title} className="stack" style={{ gap: 4 }}>
          <span className="kicker muted" style={{ letterSpacing: "0.12em" }}>{g.title}</span>
          <ul className="notes">{g.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

function ChangelogCard() {
  const version = useApp((s) => s.version);
  const lang = useI18n((s) => s.lang);
  const m = useT().settings;
  const releases = CHANGELOG[lang];
  if (!releases.length) return null;
  const current = releases.find((r) => r.version === version) ?? releases[0];
  const older = releases.filter((r) => r !== current);
  const heading = (r: ChangelogRelease) => `${m.version(r.version)}${r.date ? ` · ${r.date}` : ""}`;
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <div className="stack" style={{ gap: 3 }}>
          <Kicker muted>{m.changelogKicker}</Kicker>
          <span className="title-sm">{heading(current)}</span>
        </div>
        <ReleaseNotes release={current} />
        {older.map((r) => (
          <details key={r.version} className="release-details">
            <summary>{heading(r)}</summary>
            <ReleaseNotes release={r} />
          </details>
        ))}
      </div>
    </Card>
  );
}

export function SettingsView() {
  const [qr, setQr] = useState("");
  const [copiedLink, flashLink] = useFlash();
  const [copiedDiag, flashDiag] = useFlash();
  const version = useApp((s) => s.version);
  const t = useT();
  const m = t.settings;

  useEffect(() => {
    void QRCode.toDataURL(BRAND.support, { margin: 0, width: 352, errorCorrectionLevel: "M", color: { dark: "#0a0d12", light: "#ffffff" } }).then(setQr);
  }, []);

  return (
    <div className="scroll">
      <div className="page">
        <SectionHeader number={tabNumber("settings")} kicker={m.kicker} title={m.title} lede={m.lede} />
        <LanguageCard />
        <UpdateCard />
        <ChangelogCard />
        <Card highlight style={{ padding: 22 }}>
          <div className="row" style={{ gap: 26 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 12, boxShadow: "0 0 40px rgba(1,181,213,0.25)" }}>
              {qr && <img src={qr} width={176} height={176} alt={m.qrAlt} style={{ display: "block", imageRendering: "pixelated" }} />}
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <Kicker>{m.supportKicker} · paypal</Kicker>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{m.supportTitle}</span>
              <span className="caption">{m.supportText}</span>
              <span className="selectable" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600 }}>paypal.me/cheetumen52</span>
              <span className="caption">{m.scanHint}</span>
              <div className="row" style={{ marginTop: 4 }}>
                <Button variant="primary" icon={<Coffee size={14} />} onClick={() => void openUrl(BRAND.support)}>{m.openPaypal}</Button>
                <Button onClick={() => { void navigator.clipboard.writeText(BRAND.support); flashLink(); }}>{copiedLink ? t.common.copied : m.copyLink}</Button>
              </div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div className="stack" style={{ gap: 8 }}>
            <Kicker muted>{m.bugKicker}</Kicker>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{m.bugTitle}</span>
            <span className="caption">{m.bugText}</span>
            <div className="row" style={{ marginTop: 2 }}>
              <Button small onClick={() => void openUrl(BRAND.web)}>hejzlar-development.cz ↗</Button>
              <Button small icon={<Stethoscope size={13} />} onClick={() => { void navigator.clipboard.writeText(diagnostics()); flashDiag(); }}>
                {copiedDiag ? t.common.copied : m.copyDiagnostics}
              </Button>
            </div>
          </div>
        </Card>
        <div className="row" style={{ gap: 10, marginTop: 6 }}>
          <BrandMark size={18} />
          <span className="mono-sm c-muted">{BRAND.appName} {version}  ·  © 2026 {BRAND.company}</span>
        </div>
      </div>
    </div>
  );
}
