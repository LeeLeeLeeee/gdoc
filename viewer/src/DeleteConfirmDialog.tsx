import { type FormEvent, useState } from 'react';

/**
 * Destructive confirmation. The delete button stays disabled until the exact
 * name is typed, so an accidental click cannot remove anything.
 */
export function DeleteConfirmDialog({
  title,
  targetName,
  counts,
  saving,
  onClose,
  onDelete,
}: {
  title: string;
  targetName: string;
  counts?: { docs: number; folders: number };
  saving: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === targetName;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!matches || saving) return;
    await onDelete();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="tree-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p className="sub">
          <strong>{targetName}</strong>
          {counts && ` — 문서 ${counts.docs}개 · 폴더 ${counts.folders}개가 삭제됩니다`}
        </p>
        <p className="delete-warning">
          하이라이트 · 메모 · 공유 링크도 함께 삭제되며 <strong>되돌릴 수 없습니다.</strong>
        </p>
        <label className="sub" htmlFor="delete-confirm-input">
          계속하려면 <code>{targetName}</code> 을(를) 그대로 입력하세요.
        </label>
        <input
          id="delete-confirm-input"
          className="gd-input"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoFocus
          autoComplete="off"
        />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-danger" disabled={!matches || saving}>
            {saving ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </form>
    </div>
  );
}
