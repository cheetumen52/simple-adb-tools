import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Sparkles } from "lucide-react";
import { BRAND, TABS, useApp } from "./state/app";
import { allReady, useToolchain } from "./state/toolchain";
import { useInstaller } from "./state/installer";
import { useWireless } from "./state/wireless";
import { useUpdates } from "./state/updates";
import { useToolset } from "./state/toolset";
import { useDrag, type DropTarget } from "./state/drag";
import { native } from "./lib/native";
import { BrandMark, Button, Kicker } from "./components/ui";
import { RequirementsView } from "./views/RequirementsView";
import { InstallView } from "./views/InstallView";
import { ToolsetView } from "./views/ToolsetView";
import { SupportView } from "./views/SupportView";

let started = false;

async function startup() {
  if (started) return;
  started = true;
  await useApp.getState().init();
  await useToolchain.getState().check();
  if (!allReady(useToolchain.getState())) useApp.getState().setTab("requirements");
  await useInstaller.getState().start();
  useWireless.getState().start();
  useUpdates.getState().start();

  const deliverOpened = async () => {
    const files = await native.takePendingFiles();
    if (files.length) useInstaller.getState().enqueueInstall(files, useInstaller.getState().reinstallMode);
  };
  await listen("open-files", () => void deliverOpened());
  await deliverOpened();

  const targetAt = (x: number, y: number): DropTarget => {
    const ratio = window.devicePixelRatio || 1;
    const el = document.elementFromPoint(x / ratio, y / ratio)?.closest("[data-drop]");
    return (el?.getAttribute("data-drop") as DropTarget) ?? null;
  };
  await getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === "over") useDrag.setState({ over: targetAt(p.position.x, p.position.y) });
    else if (p.type === "leave") useDrag.setState({ over: null });
    else if (p.type === "drop") {
      const target = targetAt(p.position.x, p.position.y);
      useDrag.setState({ over: null });
      if (target === "push") void useToolset.getState().push(p.paths);
      else useInstaller.getState().enqueueInstall(p.paths, useInstaller.getState().reinstallMode);
    }
  });
}

function Header() {
  const { tab, setTab, paths } = useApp();
  const toolchain = useToolchain();
  const update = useUpdates((s) => s.state);
  const alert = toolchain.checkedOnce && !allReady(toolchain);
  return (
    <header className={`header${paths?.platform === "macos" ? " mac" : ""}`} data-tauri-drag-region>
      <BrandMark size={30} arrow />
      <div className="stack" style={{ gap: 2 }} data-tauri-drag-region>
        <div className="brand-name">{BRAND.appName}</div>
        <Kicker muted>by {BRAND.company}</Kicker>
      </div>
      <div className="spacer" data-tauri-drag-region />
      {update.kind === "available" && (
        <Button variant="primary" small icon={<Sparkles size={13} />} onClick={() => void openUrl(update.url)} title="Otevře stránku s novou verzí na GitHubu">
          Nová verze {update.tag}
        </Button>
      )}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            <span className="num">{t.number}</span>
            {t.short}
            {t.id === "requirements" && alert && <span className="dot" style={{ background: "var(--warn)" }} />}
          </button>
        ))}
      </nav>
    </header>
  );
}

export default function App() {
  const tab = useApp((s) => s.tab);

  useEffect(() => {
    void startup();
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length) {
        e.preventDefault();
        useApp.getState().setTab(TABS[n - 1].id);
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (e.shiftKey) void useToolchain.getState().check();
        else void useInstaller.getState().restartAdb();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <Header />
      <div className="content">
        {tab === "requirements" && <RequirementsView />}
        {tab === "install" && <InstallView />}
        {tab === "toolset" && <ToolsetView />}
        {tab === "support" && <SupportView />}
      </div>
    </div>
  );
}
