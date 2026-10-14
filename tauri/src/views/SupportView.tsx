import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowDownCircle, BadgeCheck, Coffee, HelpCircle, RefreshCw, Sparkles, Stethoscope } from "lucide-react";
import { BRAND, tabNumber, useApp } from "../state/app";
import { useUpdates } from "../state/updates";
import { diagnostics } from "../state/installer";
import { BrandMark, Button, Card, Kicker, SectionHeader, Spinner } from "../components/ui";

function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  return [on, () => { setOn(true); window.setTimeout(() => setOn(false), 1800); }];
}

function UpdateCard() {
  const { state, lastChecked, check } = useUpdates();
  const version = useApp((s) => s.version);
  const checked = lastChecked ? `Naposledy ověřeno ${lastChecked.toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" })}` : null;
  const title =
    state.kind === "checking" ? "Hledám novou verzi…"
    : state.kind === "upToDate" ? `Máš nejnovější verzi ${version}`
    : state.kind === "available" ? `K dispozici je verze ${state.tag}`
    : state.kind === "failed" ? "Aktualizace se nepodařilo ověřit"
    : `Verze ${version}`;
  const subtitle =
    state.kind === "failed" ? state.reason
    : state.kind === "available" ? `Nainstalováno ${version}. ${checked ?? ""}`
    : checked ?? `Kontroluji vydání v repozitáři ${BRAND.repo} na GitHubu.`;
  return (
    <Card highlight={state.kind === "available"}>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ width: 26, display: "flex", justifyContent: "center" }}>
          {state.kind === "checking" ? <Spinner />
            : state.kind === "available" ? <Sparkles size={20} color="var(--accent)" />
            : state.kind === "upToDate" ? <BadgeCheck size={20} color="var(--light-cyan)" />
            : <HelpCircle size={20} color="var(--text-muted)" />}
        </div>
        <div className="stack" style={{ gap: 3, flex: 1 }}>
          <Kicker muted>aktualizace</Kicker>
          <span className="title-sm">{title}</span>
          <span className="caption">{subtitle}</span>
        </div>
        {state.kind === "available" && (
          <Button variant="primary" small icon={<ArrowDownCircle size={13} />} onClick={() => void openUrl(state.url)}>Stáhnout {state.tag}</Button>
        )}
        <Button small icon={<RefreshCw size={13} />} disabled={state.kind === "checking"} onClick={() => void check()}>Zkontrolovat</Button>
      </div>
    </Card>
  );
}

export function SupportView() {
  const [qr, setQr] = useState("");
  const [copiedLink, flashLink] = useFlash();
  const [copiedDiag, flashDiag] = useFlash();
  const version = useApp((s) => s.version);

  useEffect(() => {
    void QRCode.toDataURL(BRAND.support, { margin: 0, width: 352, errorCorrectionLevel: "M", color: { dark: "#0a0d12", light: "#ffffff" } }).then(setQr);
  }, []);

  return (
    <div className="scroll">
      <div className="page">
        <SectionHeader
          number={tabNumber("support")}
          kicker="support"
          title="Ušetřily ti Simple ADB tools čas?"
          lede="Simple ADB tools jsou zdarma. Bez reklam, bez sledování, bez předplatného. Jestli ti ušetřily pár minut s adb, můžeš mi poslat na kafe."
        />
        <UpdateCard />
        <Card highlight style={{ padding: 22 }}>
          <div className="row" style={{ gap: 26 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 12, boxShadow: "0 0 40px rgba(1,181,213,0.25)" }}>
              {qr && <img src={qr} width={176} height={176} alt="QR kód na PayPal" style={{ display: "block", imageRendering: "pixelated" }} />}
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <Kicker>paypal</Kicker>
              <span className="selectable" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600 }}>paypal.me/cheetumen52</span>
              <span className="caption">Naskenuj telefonem, nebo klikni. Částku si zvolíš sám.</span>
              <div className="row" style={{ marginTop: 4 }}>
                <Button variant="primary" icon={<Coffee size={14} />} onClick={() => void openUrl(BRAND.support)}>Otevřít PayPal</Button>
                <Button onClick={() => { void navigator.clipboard.writeText(BRAND.support); flashLink(); }}>{copiedLink ? "Zkopírováno ✓" : "Kopírovat odkaz"}</Button>
              </div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div className="stack" style={{ gap: 8 }}>
            <Kicker muted>chyba nebo nápad</Kicker>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Něco nefunguje?</span>
            <span className="caption">Napiš mi přes web. Do zprávy vlož diagnostiku, ušetří nám to pár koleček.</span>
            <div className="row" style={{ marginTop: 2 }}>
              <Button small onClick={() => void openUrl(BRAND.web)}>hejzlar-development.cz ↗</Button>
              <Button small icon={<Stethoscope size={13} />} onClick={() => { void navigator.clipboard.writeText(diagnostics()); flashDiag(); }}>
                {copiedDiag ? "Zkopírováno ✓" : "Kopírovat diagnostiku"}
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
