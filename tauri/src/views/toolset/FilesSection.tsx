import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ArrowUp, Download, File, Folder, FolderPlus, Link2, Pencil, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { crumbs, validName, type FileEntry } from "../../lib/files";
import { bytes } from "../../lib/format";
import { filesParent, SHORTCUTS, STORAGE_ROOT, useFiles } from "../../state/files";
import { useDrag } from "../../state/drag";
import { useT } from "../../i18n";
import { Button, Card, ConfirmDialog, Spinner, TextField, type ConfirmRequest } from "../../components/ui";

function NameEditor({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const t = useT();
  return (
    <div className="row" style={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
      <TextField value={value} onChange={setValue} placeholder={t.files.folderName} onSubmit={() => onDone(validName(value) ? value.trim() : null)} />
      <Button small variant="primary" disabled={!validName(value)} onClick={() => onDone(value.trim())}>{initial ? t.files.rename : t.files.create}</Button>
      <Button variant="plain" icon={<X size={14} />} onClick={() => onDone(null)} />
    </div>
  );
}

function EntryRow({ entry, onConfirm }: { entry: FileEntry; onConfirm: (r: ConfirmRequest) => void }) {
  const f = useFiles();
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const isDir = entry.type !== "file";
  const Icon = entry.type === "dir" ? Folder : entry.type === "link" ? Link2 : File;
  const openIt = () => isDir && void f.open(`${f.path.replace(/\/+$/, "")}/${entry.name}`);
  return (
    <div className={`list-row file-row${isDir ? " clickable" : ""}`} onClick={openIt}>
      <Icon size={15} color={isDir ? "var(--accent)" : "var(--text-muted)"} />
      {renaming ? (
        <NameEditor initial={entry.name} onDone={(name) => { setRenaming(false); if (name) void f.rename(entry, name); }} />
      ) : (
        <>
          <span className="truncate selectable" style={{ flex: 1, fontWeight: isDir ? 500 : 400 }} title={entry.target ? `${entry.name} → ${entry.target}` : entry.name}>{entry.name}</span>
          <span className="mono-sm c-muted" style={{ width: 70, textAlign: "right" }}>{entry.size != null ? bytes(entry.size) : ""}</span>
          <span className="mono-sm c-muted" style={{ width: 112 }}>{entry.modified}</span>
          <div className="row file-actions" onClick={(e) => e.stopPropagation()}>
            {f.busy === entry.name ? <Spinner /> : (
              <Button variant="plain" icon={<Download size={14} />} title={t.files.download} disabled={isDir && !!f.app} onClick={() => void f.pull(entry)} />
            )}
            <Button variant="plain" icon={<Pencil size={13} />} title={t.files.rename} onClick={() => setRenaming(true)} />
            <Button
              variant="plain"
              icon={<Trash2 size={14} />}
              title={t.files.delete}
              onClick={() => onConfirm({ title: t.files.deleteTitle(entry.name), message: t.files.deleteMessage, confirm: t.files.delete, action: () => void f.remove(entry) })}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function FilesSection() {
  const f = useFiles();
  const t = useT();
  const m = t.files;
  const over = useDrag((s) => s.over) === "files";
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const parent = filesParent();

  useEffect(() => {
    if (f.app !== null && f.debuggable === null) void f.loadDebuggable();
  }, [f.app, f.debuggable]);

  const upload = async () => {
    const picked = await openDialog({ multiple: true, directory: false });
    const list = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (list.length) await f.upload(list);
  };
  const appMode = f.app !== null;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Card compact>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row wrap">
            <div className="subnav">
              <button className={`subtab${!appMode ? " active" : ""}`} onClick={() => void f.setApp(null)}>{m.storage}</button>
              <button className={`subtab${appMode ? " active" : ""}`} onClick={() => useFiles.setState({ app: "", entries: [] })} title={m.appDataHelp}>{m.appData}</button>
            </div>
            {appMode && (
              f.debuggable === null ? <span className="row caption"><Spinner /> {m.loadingApps}</span>
              : f.debuggable.length === 0 ? <span className="caption">{m.noDebuggable}</span>
              : (
                <select className="field" style={{ width: 260 }} value={f.app ?? ""} onChange={(e) => void f.setApp(e.target.value)}>
                  <option value="" disabled>{m.pickApp}</option>
                  {f.debuggable.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )
            )}
            <div className="spacer" />
            {f.loading && <Spinner />}
            <Button small icon={<RefreshCw size={13} />} title={t.common.refresh} onClick={() => void f.refresh()} />
          </div>
          {(!appMode || f.app) && (
            <div className="row wrap" style={{ gap: 6 }}>
              <Button small icon={<ArrowUp size={13} />} disabled={!parent} onClick={() => parent && void f.open(parent)} title={m.up} />
              <div className="crumbs">
                {crumbs(f.path).map(([name, path]) => (
                  <button key={path} className="crumb" onClick={() => void f.open(path)}>{name}</button>
                ))}
              </div>
              <div className="spacer" />
              <Button small icon={<FolderPlus size={13} />} onClick={() => setCreating(true)}>{m.newFolder}</Button>
              <Button small variant="primary" icon={<Upload size={13} />} onClick={() => void upload()}>{m.upload}</Button>
            </div>
          )}
          {!appMode && (
            <div className="row wrap" style={{ gap: 6 }}>
              {SHORTCUTS.map((name) => (
                <Button key={name} small variant="plain" onClick={() => void f.open(`${STORAGE_ROOT}/${name}`)}>{name}</Button>
              ))}
            </div>
          )}
        </div>
      </Card>
      {(!appMode || f.app) && (
        <div className={`list files-list${over ? " drop-over" : ""}`} data-drop="files">
          {creating && (
            <div className="list-row">
              <FolderPlus size={15} color="var(--accent)" />
              <NameEditor initial="" onDone={(name) => { setCreating(false); if (name) void f.mkdir(name); }} />
            </div>
          )}
          {f.error && <div className="list-row caption c-warn">{f.error}</div>}
          {!f.error && !f.loading && f.entries.length === 0 && <div className="list-row caption">{m.empty}</div>}
          {f.entries.map((e) => <EntryRow key={e.name} entry={e} onConfirm={setConfirm} />)}
        </div>
      )}
      {(!appMode || f.app) && (
        <div className="row">
          <span className="caption">{m.dropHint}</span>
          <div className="spacer" />
          <span className="mono-sm c-muted">{m.items(f.entries.length)}</span>
        </div>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
