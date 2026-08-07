export type TreeContextMenuAction =
  | 'new-folder'
  | 'rename-folder'
  | 'delete-folder'
  | 'delete-folder-recursive'
  | 'rename-file'
  | 'edit-file'
  | 'delete-file';

export function TreeContextMenu({
  x,
  y,
  target,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  target: 'empty' | 'folder' | 'file';
  onAction: (action: TreeContextMenuAction) => void;
  onClose: () => void;
}) {
  const actions: { id: TreeContextMenuAction; label: string; danger?: boolean }[] =
    target === 'empty'
      ? [{ id: 'new-folder', label: '새 폴더' }]
      : target === 'folder'
        ? [
            { id: 'new-folder', label: '하위 폴더 만들기' },
            { id: 'rename-folder', label: '이름 변경' },
            { id: 'delete-folder', label: '빈 폴더 삭제' },
            { id: 'delete-folder-recursive', label: '폴더 통째로 삭제', danger: true },
          ]
        : [
            { id: 'rename-file', label: '이름 변경' },
            { id: 'edit-file', label: '메타정보 편집' },
            { id: 'delete-file', label: '삭제', danger: true },
          ];

  return (
    <div className="tree-menu-backdrop" onMouseDown={onClose}>
      <div className="tree-menu" style={{ left: x, top: y }} onMouseDown={(event) => event.stopPropagation()}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={action.danger ? 'menu-danger' : undefined}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
