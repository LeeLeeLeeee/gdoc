export type TreeContextMenuAction =
  | 'new-folder'
  | 'rename-folder'
  | 'delete-folder'
  | 'rename-file'
  | 'edit-file';

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
  const actions =
    target === 'empty'
      ? [{ id: 'new-folder' as const, label: '새 폴더' }]
      : target === 'folder'
        ? [
            { id: 'new-folder' as const, label: '하위 폴더 만들기' },
            { id: 'rename-folder' as const, label: '이름 변경' },
            { id: 'delete-folder' as const, label: '빈 폴더 삭제' },
          ]
        : [
            { id: 'rename-file' as const, label: '이름 변경' },
            { id: 'edit-file' as const, label: '메타정보 편집' },
          ];

  return (
    <div className="tree-menu-backdrop" onMouseDown={onClose}>
      <div className="tree-menu" style={{ left: x, top: y }} onMouseDown={(event) => event.stopPropagation()}>
        {actions.map((action) => (
          <button key={action.id} type="button" onClick={() => onAction(action.id)}>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
