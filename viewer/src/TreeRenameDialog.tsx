import { type FormEvent, useState } from 'react';

export function TreeRenameDialog({
  title,
  currentName,
  saving,
  onClose,
  onRename,
}: {
  title: string;
  currentName: string;
  saving: boolean;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(currentName);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onRename(name.trim());
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="tree-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <input className="gd-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" disabled={!name.trim() || saving}>
            {saving ? '변경 중...' : '변경'}
          </button>
        </div>
      </form>
    </div>
  );
}
