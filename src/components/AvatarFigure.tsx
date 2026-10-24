import { AVATAR_STYLES, type AvatarStyle } from '@/lib/avatars';

export function AvatarFigure({ style, active = false }: { style: AvatarStyle; active?: boolean }) {
  const colors = AVATAR_STYLES[style];

  return (
    <div className={`relative h-12 w-10 ${active ? 'avatar-reach' : ''}`} aria-hidden="true">
      <div className={`absolute left-1/2 top-1 h-6 w-6 -translate-x-1/2 rounded-full ${colors.skin} shadow-sm`}>
        <span className={`absolute left-1/2 top-1 h-1.5 w-3 -translate-x-1/2 rounded-full ${colors.accent}`} />
      </div>
      <div className={`absolute bottom-0 left-1/2 h-7 w-9 -translate-x-1/2 rounded-t-[1rem] ${colors.shirt} shadow-md`}>
        <span className={`absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-full ${colors.accent}`} />
      </div>
    </div>
  );
}
