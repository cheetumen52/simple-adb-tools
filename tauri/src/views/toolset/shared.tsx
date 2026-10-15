import { displayName } from "../../lib/parse";
import { readyDevices, useInstaller } from "../../state/installer";
import { currentDevice, useToolset } from "../../state/toolset";
import { Pill } from "../../components/ui";

/** The device the toolset works on; re-renders when the device list changes. */
export function useDevice() {
  const serial = useToolset((s) => s.serial);
  useInstaller((s) => s.devices);
  return currentDevice(serial);
}

export function DevicePicker() {
  const all = useInstaller((s) => s.devices);
  const devices = readyDevices({ devices: all });
  const device = useDevice();
  const set = useToolset((s) => s.set);
  if (devices.length > 1) {
    return (
      <select className="field" style={{ width: 200 }} value={device?.serial ?? ""} onChange={(e) => set({ serial: e.target.value })}>
        {devices.map((d) => <option key={d.serial} value={d.serial}>{displayName(d)}</option>)}
      </select>
    );
  }
  return device ? <Pill>{displayName(device)}</Pill> : null;
}

export function InfoGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="grid-2" style={{ gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label} className="stack" style={{ gap: 2 }}>
          <span className="kicker muted" style={{ letterSpacing: "0.12em" }}>{r.label}</span>
          <span className="mono selectable">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
