import { BatteryCharging, BatteryLow, BatteryFull, Cable, Moon, PlugZap, RefreshCw, RotateCcw, Unplug, Wifi } from "lucide-react";
import { isWireless } from "../../lib/parse";
import { DEV_TOGGLES, useToolset, type DevToggle } from "../../state/toolset";
import { FONT_SCALES, useTesting, type BatteryAction } from "../../state/testing";
import { useT } from "../../i18n";
import { Button, Card, CardTitle, Kicker, Pill, Spinner, Switch, TextField } from "../../components/ui";
import { useDevice } from "./shared";

const PROXY_PRESETS: [string, string][] = [["Charles", "8888"], ["Proxyman", "9090"], ["mitmproxy", "8080"]];
const BATTERY: [BatteryAction, typeof BatteryLow][] = [
  ["low", BatteryLow], ["unplug", Unplug], ["charging", BatteryCharging], ["full", BatteryFull], ["doze", Moon], ["reset", RotateCcw],
];
/** darkMode and animationsOff live in the display card. */
const DEV_CARD: DevToggle[] = DEV_TOGGLES.filter((id) => id !== "darkMode" && id !== "animationsOff");

function Chips<T extends string | number | null>({ options, value, onPick }: { options: [T, string][]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="subnav" style={{ flexWrap: "wrap" }}>
      {options.map(([v, label]) => (
        <button key={String(v)} className={`subtab${v === value ? " active" : ""}`} onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  );
}

function ProxyCard() {
  const ts = useTesting();
  const m = useT().testing;
  const ip = ts.localIps[0];
  return (
    <Card highlight={!!ts.proxy}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row top">
          <CardTitle kicker={m.proxyKicker} title={m.proxyTitle} subtitle={m.proxySubtitle} />
          <div className="spacer" />
          <Pill color={ts.proxy ? "var(--accent)" : "var(--text-muted)"}>{ts.proxy ? m.proxyNow(ts.proxy) : m.proxyNone}</Pill>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Kicker muted>{m.port}</Kicker>
          <TextField value={ts.proxyPort} onChange={(v) => ts.setPort(v.replace(/\D/g, ""))} style={{ width: 76 }} />
          <Chips options={PROXY_PRESETS.map(([name, port]) => [port, `${name} ${port}`] as [string, string])} value={ts.proxyPort} onPick={ts.setPort} />
        </div>
        <div className="row wrap">
          <Button variant="primary" small icon={<Cable size={13} />} disabled={!ts.proxyPort} onClick={() => void ts.proxyViaAdb()}>{m.viaAdb}</Button>
          {ip && <Button small icon={<Wifi size={13} />} disabled={!ts.proxyPort} onClick={() => void ts.proxyViaLan(ip)}>{m.viaLan(ip)}</Button>}
          <Button small disabled={!ts.proxy} onClick={() => void ts.clearProxy()}>{m.off}</Button>
        </div>
        <span className="caption">{m.viaAdbHelp} {ip ? m.viaLanHelp : ""}</span>
      </div>
    </Card>
  );
}

function NetworkCard() {
  const ts = useTesting();
  const device = useDevice();
  const m = useT().testing;
  const wireless = !!device && isWireless(device);
  const airplaneSupported = (ts.sdk ?? 0) >= 30;
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <CardTitle kicker={m.networkKicker} title={m.networkTitle} />
        <Switch label={m.airplane} checked={!!ts.airplane} disabled={!airplaneSupported || ts.airplane == null || wireless} onChange={(v) => void ts.setAirplane(v)} />
        <Switch label={m.wifi} checked={!!ts.wifi} disabled={ts.wifi == null || wireless} onChange={(v) => void ts.setWifi(v)} />
        <Switch label={m.data} checked={!!ts.data} disabled={ts.data == null} onChange={(v) => void ts.setData(v)} />
        {wireless && <span className="caption c-warn">{m.wifiOverWifi}</span>}
        {!airplaneSupported && ts.sdk != null && <span className="caption">{m.airplaneOld}</span>}
      </div>
    </Card>
  );
}

function DisplayCard() {
  const ts = useTesting();
  const tool = useToolset();
  const m = useT().testing;
  const physical = ts.density?.physical ?? null;
  const current = ts.density?.override ?? physical;
  const smaller = physical ? Math.round((physical * 0.85) / 10) * 10 : null;
  const larger = physical ? Math.round((physical * 1.15) / 10) * 10 : null;
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <CardTitle kicker={m.displayKicker} title={m.displayTitle} />
        <div className="stack" style={{ gap: 6 }}>
          <Kicker muted>{m.fontScale}</Kicker>
          <Chips options={FONT_SCALES.map((s) => [s, `${s}×`] as [number, string])} value={ts.fontScale ?? 1} onPick={(v) => void ts.setFontScale(v)} />
        </div>
        {physical && (
          <div className="stack" style={{ gap: 6 }}>
            <Kicker muted>{m.density} · {current} dpi</Kicker>
            <Chips
              options={[[smaller, m.densitySmaller], [null, m.densityDefault], [larger, m.densityLarger]] as [number | null, string][]}
              value={ts.density?.override ?? null}
              onPick={(v) => void ts.setDensity(v)}
            />
          </div>
        )}
        <div className="row wrap" style={{ gap: 18 }}>
          <Switch label={m.darkMode} checked={!!tool.toggles.darkMode} disabled={tool.toggles.darkMode === undefined} onChange={(v) => void tool.setToggle("darkMode", v)} />
          <Switch label={m.animationsOff} checked={!!tool.toggles.animationsOff} disabled={tool.toggles.animationsOff === undefined} onChange={(v) => void tool.setToggle("animationsOff", v)} />
        </div>
      </div>
    </Card>
  );
}

function BatteryCard() {
  const ts = useTesting();
  const m = useT().testing;
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row top">
          <CardTitle kicker={m.batteryKicker} title={m.batteryTitle} subtitle={ts.battery?.level != null ? m.batteryNow(ts.battery.level, ts.battery.plugged) : undefined} />
          <div className="spacer" />
          {ts.battery?.plugged ? <PlugZap size={16} color="var(--light-cyan)" /> : null}
        </div>
        <div className="grid-3">
          {BATTERY.map(([action, Icon]) => (
            <Button key={action} small icon={<Icon size={13} />} onClick={() => void ts.batteryAction(action)}>{m.battery[action]}</Button>
          ))}
        </div>
        <span className="caption">{m.batteryHelp}</span>
      </div>
    </Card>
  );
}

function LanguageCard() {
  const ts = useTesting();
  const m = useT().testing;
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <CardTitle kicker={m.languageKicker} title={m.languageTitle} subtitle={ts.locales ? m.languageNow(ts.locales) : undefined} />
        <div><Button small onClick={() => void ts.openLocaleSettings()}>{m.languageSettings}</Button></div>
        <span className="caption">{m.languageHint}</span>
      </div>
    </Card>
  );
}

function DeveloperCard() {
  const tool = useToolset();
  const t = useT();
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <CardTitle kicker={t.testing.developerKicker} title={t.testing.developerTitle} />
        <div className="grid-2" style={{ gap: 14 }}>
          {DEV_CARD.map((id) => {
            const on = tool.toggles[id];
            return (
              <div key={id} className="row top" style={{ gap: 12 }}>
                <div className="stack" style={{ gap: 3, flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{t.toolset.developer.toggles[id].title}</span>
                  <span className="caption">{t.toolset.developer.toggles[id].help}</span>
                </div>
                {on === undefined ? <Spinner /> : <Switch label="" checked={on} onChange={(v) => void tool.setToggle(id, v)} />}
              </div>
            );
          })}
        </div>
        <span className="caption">{t.toolset.developer.hint}</span>
      </div>
    </Card>
  );
}

export function TestingSection() {
  const loading = useTesting((s) => s.loading);
  const t = useT();
  const reload = () => {
    void useTesting.getState().load();
    void useToolset.getState().loadToggles();
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <ProxyCard />
      <div className="grid-2">
        <NetworkCard />
        <DisplayCard />
      </div>
      <div className="grid-2">
        <BatteryCard />
        <LanguageCard />
      </div>
      <DeveloperCard />
      <div className="row">
        <div className="spacer" />
        {loading && <Spinner />}
        <Button small icon={<RefreshCw size={13} />} onClick={reload}>{t.toolset.developer.reload}</Button>
      </div>
    </div>
  );
}
