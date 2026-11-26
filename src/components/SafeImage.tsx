import React, { useState } from 'react';
import { sanitizeMediaUrl } from '../lib/format';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export function SafeImage({ src, alt, className = '', loading = 'lazy' }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const safeUrl = sanitizeMediaUrl(src);

  if (!safeUrl || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-[#ebe3d7] text-[#78716c] ${className}`}
      >
        <span className="font-serif text-sm tracking-wide">Thelakkad Store</span>
      </div>
    );
  }

  return (
    <img
      src={safeUrl}
      alt={alt}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
