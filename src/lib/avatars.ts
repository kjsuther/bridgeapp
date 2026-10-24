export type AvatarStyle = 'cobalt' | 'coral' | 'mint' | 'gold';

export const AVATAR_STYLES: Record<AvatarStyle, { label: string; skin: string; shirt: string; accent: string }> = {
  cobalt: { label: 'Cobalt', skin: 'bg-amber-200', shirt: 'bg-blue-600', accent: 'bg-blue-300' },
  coral: { label: 'Coral', skin: 'bg-orange-200', shirt: 'bg-rose-600', accent: 'bg-rose-300' },
  mint: { label: 'Mint', skin: 'bg-emerald-200', shirt: 'bg-teal-600', accent: 'bg-teal-300' },
  gold: { label: 'Gold', skin: 'bg-yellow-200', shirt: 'bg-amber-600', accent: 'bg-amber-300' },
};

export const DEFAULT_AVATAR_STYLE: AvatarStyle = 'cobalt';

export function isAvatarStyle(value: string | null | undefined): value is AvatarStyle {
  return !!value && value in AVATAR_STYLES;
}
