/*
# Add profile identity and avatar preferences

1. New Columns
- `profiles.email`: The account email shown to authenticated table hosts when choosing players.
- `profiles.avatar_style`: The saved illustrated avatar choice used across the app, defaulting to `cobalt`.

2. Existing Data
- Populate `profiles.email` from the matching authenticated account for profiles that already exist.
- Preserve all existing display names and profile rows.

3. Security
- Keep the existing authenticated profile read policy so signed-in users can identify accounts when assigning seats.
- Keep the existing own-profile update policy so users can change only their own profile.

4. Important Notes
- Email is intentionally visible to signed-in club members because it is used to distinguish accounts with similar display names.
- No authentication records are changed.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_style text NOT NULL DEFAULT 'cobalt';

UPDATE profiles AS p
SET email = u.email
FROM auth.users AS u
WHERE u.id = p.id
  AND p.email IS NULL;
