import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { AlertCircle, AlertTriangle, ArrowDownCircle, CheckCircle2, FolderOpen, Hand, RefreshCw, RotateCw, Smartphone, XCircle } from "lucide-react";
import type { ToolName, ToolStatus } from "../lib/native";
import { isReady } from "../lib/parse";
import { tabNumber, useApp } from "../state/app";
import { allReady, useToolchain } from "../state/toolchain";
import { useInstaller } from "../state/installer";
import { Button, Card, Pill, Progress, SectionHeader, Spinner } from "../components/ui";

const TOOLS: { tool: ToolName; title: string; requirement: string; description: string; size: string }[] = [
  { tool: "adb", title: "Android Debug Bridge (adb)", requirement: "Povinné", description: "Komunikuje s telefonem: instalace, odinstalace, screenshoty.", size: "16 MB" },
  {
    tool: "aapt2",
    title: "Android Asset Packaging Tool (aapt2)",
    requirement: "Doporučené",
    description: "Čte z APK název aplikace, balíček a verzi. Bez něj nepůjde reinstall ani porovnání s verzí v telefonu.",
    size: "4,5 MB",
  },
  {
    tool: "scrcpy",
    title: "scrcpy",
    requirement: "Volitelné",
    description: "Zrcadlení obrazovky telefonu s ovládáním myší a klávesnicí, se zvukem i nahráváním. Open source od Genymobile.",
    size: "13 MB",
  },
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

function ToolCard({ tool, title, requirement, description, size }: (typeof TOOLS)[number]) {
  const tc = useToolchain();
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
            <Pill color={tool === "adb" ? "var(--accent)" : "var(--text-muted)"} dot={false}>{requirement}</Pill>
          </div>
          <div className="caption">{description}</div>
          {status.kind === "checking" && <div className="mono c-muted">Hledám…</div>}
          {status.kind === "missing" && <div className="mono c-warn">Nenašel jsem v Android SDK, v PATH ani ve složce appky.</div>}
          {status.kind === "found" && (
            <div className="stack" style={{ gap: 2 }}>
              <span className="mono c-cyan">verze {status.version}</span>
              <span className="mono-sm c-muted truncate selectable">{status.path}</span>
            </div>
          )}
          {status.kind === "broken" && (
            <div className="stack" style={{ gap: 2 }}>
              <span className="mono c-danger">Nejde spustit: {status.error}</span>
              {/cpu/i.test(status.error) && <span className="mono-sm c-warn">Binárka je pro Intel. Doinstaluj Rosettu: softwareupdate --install-rosetta</span>}
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
                    Stáhnout a nainstalovat ({size})
                  </Button>
                  {tool === "adb" && <Button small onClick={() => void tc.chooseAdb()}>Vybrat ručně…</Button>}
                </>
              )}
              {status.kind === "found" && (
                <>
                  <Button small icon={<FolderOpen size={13} />} onClick={() => void revealItemInDir(status.path)}>Ukázat ve složce</Button>
                  {status.managed && (
                    <Button small icon={<RefreshCw size={13} />} disabled={!!tc.installing} onClick={() => void tc.install(tool)}>Aktualizovat</Button>
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

const STEPS = [
  "Nastavení → O telefonu → 7× klepni na „Číslo sestavení“.",
  "V Možnostech pro vývojáře zapni „Ladění USB“. Xiaomi a Huawei chtějí i „Instalace přes USB“.",
  "Připoj telefon kabelem a na displeji potvrď „Povolit ladění USB“.",
];

function DeviceCard() {
  const { devices, running, restartAdb } = useInstaller();
  const adbReady = useToolchain((s) => s.adb.kind === "found");
  const platform = useApp((s) => s.paths?.platform);
  const ready = devices.filter(isReady).length;
  const unauthorized = devices.some((d) => d.state === "unauthorized");
  return (
    <Card>
      <div className="row top" style={{ gap: 14 }}>
        <div style={{ width: 26, display: "flex", justifyContent: "center", paddingTop: 2 }}>
          {ready ? <CheckCircle2 size={22} color="var(--light-cyan)" /> : unauthorized ? <Hand size={22} color="var(--warn)" /> : <Smartphone size={22} color="var(--warn)" />}
        </div>
        <div className="stack" style={{ flex: 1, gap: 8 }}>
          <div className="row">
            <span className="title-sm">Telefon s laděním USB</span>
            {ready ? <Pill>Připojeno: {ready}</Pill> : unauthorized ? <Pill color="var(--warn)">Čeká na potvrzení</Pill> : <Pill color="var(--text-muted)">Nepřipojeno</Pill>}
          </div>
          {STEPS.map((step, i) => (
            <div key={i} className="row top" style={{ gap: 10 }}>
              <span className="mono-sm c-accent" style={{ paddingTop: 1 }}>{String(i + 1).padStart(2, "0")}</span>
              <span className="caption secondary">{step}</span>
            </div>
          ))}
          {platform === "windows" && (
            <div className="caption c-warn">Windows: pokud telefon nevidíš, nainstaluj ovladač USB od výrobce (Samsung, Xiaomi…) nebo Google USB Driver.</div>
          )}
          <div>
            <Button small icon={<RotateCw size={13} />} disabled={!adbReady || running} onClick={() => void restartAdb()}>Restartovat adb</Button>
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
  return (
    <div className="scroll">
      <div className="page">
        <SectionHeader
          number={tabNumber("requirements")}
          kicker="systémové požadavky"
          title={ready ? "Všechno je připravené" : "Co appka potřebuje"}
          lede="Bez adb to nepojede. Co chybí, stáhnu sám, přímo od Googlu. Bez Android Studia, bez admin hesla."
          trailing={<Button small icon={<RotateCw size={13} />} onClick={() => void tc.check()}>Zkontrolovat znovu</Button>}
        />
        {TOOLS.map((t) => <ToolCard key={t.tool} {...t} />)}
        <DeviceCard />
        {tc.error && <div className="row caption c-danger"><XCircle size={14} /> {tc.error}</div>}
        <div className="stack" style={{ gap: 4 }}>
          <div className="caption">
            adb a aapt2 stahuji z dl.google.com, scrcpy z jeho oficiálních vydání na GitHubu (s kontrolou SHA‑256). Stažením adb a aapt2 souhlasíš s licenčními podmínkami Android SDK.
          </div>
          <div className="row" style={{ gap: 16 }}>
            <Button variant="link" onClick={() => void openUrl("https://developer.android.com/studio/terms")}>Licenční podmínky Android SDK ↗</Button>
            <Button variant="link" onClick={() => void openUrl("https://github.com/Genymobile/scrcpy")}>scrcpy na GitHubu (Apache 2.0) ↗</Button>
          </div>
        </div>
        {ready && (
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button variant="primary" onClick={() => setTab("install")}>Pokračovat na instalaci →</Button>
          </div>
        )}
      </div>
    </div>
  );
}
