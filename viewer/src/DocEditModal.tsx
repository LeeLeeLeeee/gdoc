import { type FormEvent, useMemo, useState } from 'react';
import type { DocSummary } from '../../shared/buildTree';
import type { UpdateDocMetaRequest } from './useUpdateDocMeta';
import { X } from './icons';

type Props = {
  doc: DocSummary;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (patch: UpdateDocMetaRequest) => Promise<void>;
};

export function DocEditModal({ doc, saving, error, onClose, onSave }: Props) {
  const [title, setTitle] = useState(doc.title);
  const [tags, setTags] = useState(doc.tags.join(', '));
  const [category, setCategory] = useState(doc.category);
  const [visibility, setVisibility] = useState<'public' | 'private'>(doc.visibility);

  const normalizedTags = useMemo(
    () =>
      tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tags],
  );
  const canSave = Boolean(title.trim() && category.trim()) && !saving;
  const visibilityChanged = visibility !== doc.visibility;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    await onSave({
      title: title.trim(),
      tags: normalizedTags,
      category: category.trim(),
      visibility,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="doc-edit-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">문서 편집</div>
            <h2>{doc.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={14} />
          </button>
        </div>

        <label className="form-row">
          <span>제목</span>
          <input className="gd-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className="form-row">
          <span>Path</span>
          <div className="readonly-field" title={doc.path}>{doc.path}</div>
        </label>

        <label className="form-row">
          <span>태그</span>
          <input
            className="gd-input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="effect, docs"
          />
        </label>

        <label className="form-row">
          <span>카테고리</span>
          <input className="gd-input" value={category} onChange={(event) => setCategory(event.target.value)} />
        </label>

        <label className="form-row">
          <span>타입</span>
          <div className="readonly-field">{doc.type}</div>
        </label>

        <label className="form-row">
          <span>공개 범위</span>
          <div className="visibility-control" role="radiogroup" aria-label="공개 범위">
            <button
              type="button"
              className={visibility === 'private' ? 'on' : ''}
              role="radio"
              aria-checked={visibility === 'private'}
              onClick={() => setVisibility('private')}
            >
              비공개
            </button>
            <button
              type="button"
              className={visibility === 'public' ? 'on' : ''}
              role="radio"
              aria-checked={visibility === 'public'}
              onClick={() => setVisibility('public')}
            >
              공개
            </button>
          </div>
        </label>

        {visibilityChanged && (
          <div className="edit-warning">
            공개 범위를 바꾸면 문서 저장 위치가 함께 변경될 수 있습니다.
          </div>
        )}
        {error && <div className="error-text modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" disabled={!canSave}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}
