import { type FormEvent, useState } from 'react';

export function CreateFolderDialog({
  parentPath,
  saving,
  onClose,
  onCreate,
}: {
  parentPath: string | null;
  saving: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="tree-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <h2>새 폴더</h2>
        <div className="sub">{parentPath ? `${parentPath} 아래에 생성` : '루트에 생성'}</div>
        <input className="gd-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" disabled={!name.trim() || saving}>
            {saving ? '생성 중...' : '생성'}
          </button>
        </div>
      </form>
    </div>
  );
}
