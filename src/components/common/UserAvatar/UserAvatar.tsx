import { useState } from 'react';

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  className: string;
  fallbackClassName: string;
}

function initials(name?: string | null, email?: string | null): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length > 1) return `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return email?.trim().charAt(0).toUpperCase() || '?';
}

/** Avatar image with a deterministic initials fallback for missing or failed URLs. */
export function UserAvatar({ src, name, email, className, fallbackClassName }: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt=""
        className={className}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  return <span className={fallbackClassName} aria-hidden="true">{initials(name, email)}</span>;
}
