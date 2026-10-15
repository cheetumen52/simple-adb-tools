import { ExternalLink, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { ExtraType } from "../../lib/deeplinks";
import { newDraft, useDeepLinks } from "../../state/deeplinks";
import { useT } from "../../i18n";
import { Button, Card, CardTitle, Kicker, Pill, TextField } from "../../components/ui";

const TYPES: ExtraType[] = ["string", "int", "long", "float", "bool"];

function Editor() {
  const dl = useDeepLinks();
  const t = useT();
  const m = t.deeplinks;
  const d = dl.draft;
  return (
    <Card highlight>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row top">
          <CardTitle kicker={m.openKicker} title={m.openTitle} subtitle={m.openSubtitle} />
          <div className="spacer" />
          {d.editing && <Button small icon={<Plus size={13} />} onClick={newDraft}>{m.newLink}</Button>}
        </div>
        <div className="row">
          <TextField placeholder={m.placeholder} value={d.url} onChange={(url) => dl.setDraft({ url })} onSubmit={() => void dl.open()} />
          <Button variant="primary" small icon={<ExternalLink size={13} />} disabled={!d.url.trim()} onClick={() => void dl.open()}>{t.common.open}</Button>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Kicker muted>{m.targetApp}</Kicker>
          <select className="field" style={{ width: 280 }} value={d.pkg ?? ""} onChange={(e) => dl.setDraft({ pkg: e.target.value || null })}>
            <option value="">{m.anyApp}</option>
            {[...new Set([...(d.pkg ? [d.pkg] : []), ...dl.packages])].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <Kicker muted>{m.extras}</Kicker>
            <Button variant="link" onClick={dl.addExtra}>+ {m.addExtra}</Button>
          </div>
          {d.extras.map((e, i) => (
            <div key={i} className="row">
              <TextField placeholder={m.key} value={e.key} onChange={(key) => dl.updateExtra(i, { key })} style={{ width: 180 }} />
              <select className="field" style={{ width: 90 }} value={e.type} onChange={(ev) => dl.updateExtra(i, { type: ev.target.value as ExtraType })}>
                {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <TextField placeholder={e.type === "bool" ? "true / false" : m.value} value={e.value} onChange={(value) => dl.updateExtra(i, { value })} />
              <Button variant="plain" icon={<X size={14} />} onClick={() => dl.removeExtra(i)} />
            </div>
          ))}
        </div>
        <div className="row">
          <TextField placeholder={m.name} value={d.name} mono={false} onChange={(name) => dl.setDraft({ name })} onSubmit={dl.saveDraft} />
          <Button small icon={<Save size={13} />} disabled={!d.url.trim()} onClick={dl.saveDraft}>{d.editing ? m.update : m.save}</Button>
        </div>
      </div>
    </Card>
  );
}

function AppLinks() {
  const dl = useDeepLinks();
  const m = useT().deeplinks;
  return (
    <Card>
      <div className="stack" style={{ gap: 10 }}>
        <CardTitle kicker={m.appLinksKicker} title={dl.draft.pkg ?? "—"} subtitle={dl.draft.pkg ? m.appLinksHint : m.appLinksPick} />
        {dl.draft.pkg && dl.appLinksFor === dl.draft.pkg && dl.appLinks.length === 0 && <span className="caption">{m.appLinksNone}</span>}
        <div className="row wrap" style={{ gap: 6 }}>
          {dl.appLinks.map((url) => (
            <button key={url} className="chip mono-sm" onClick={() => dl.setDraft({ url })}>{url}</button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Saved() {
  const dl = useDeepLinks();
  const t = useT();
  const m = t.deeplinks;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Kicker muted>{m.savedKicker}</Kicker>
      {dl.saved.length === 0 ? (
        <Card><span className="caption">{m.savedEmpty}</span></Card>
      ) : (
        <div className="list">
          {dl.saved.map((link) => (
            <div key={link.id} className={`list-row${dl.draft.editing === link.id ? " selected" : ""}`}>
              <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                <span className="truncate" style={{ fontWeight: 600 }}>{link.name}</span>
                <span className="mono-sm c-muted truncate selectable">{link.url}</span>
              </div>
              {link.pkg && <Pill color="var(--text-muted)" dot={false}>{link.pkg}</Pill>}
              {link.extras.length > 0 && <Pill color="var(--accent)" dot={false}>{m.extrasCount(link.extras.length)}</Pill>}
              <Button small variant="primary" icon={<ExternalLink size={13} />} onClick={() => void dl.open(link)}>{t.common.open}</Button>
              <Button variant="plain" icon={<Pencil size={13} />} title={m.edit} onClick={() => dl.edit(link.id)} />
              <Button variant="plain" icon={<Trash2 size={14} />} title={m.delete} onClick={() => dl.remove(link.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeepLinksSection() {
  const dl = useDeepLinks();
  const m = useT().deeplinks;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Editor />
      <AppLinks />
      <Saved />
      {dl.history.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <Kicker muted>{m.historyKicker}</Kicker>
          <div className="row wrap" style={{ gap: 6 }}>
            {dl.history.map((url) => (
              <button key={url} className="chip mono-sm" onClick={() => { dl.setDraft({ url }); void dl.open({ url, pkg: null, extras: [] }); }}>↺ {url}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
