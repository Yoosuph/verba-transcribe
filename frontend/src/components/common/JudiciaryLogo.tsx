import React from 'react';

interface JudiciaryLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon' | 'crest' | 'watermark';
  className?: string;
  showText?: boolean;
  lightMode?: boolean;
}

export const JudiciaryLogo: React.FC<JudiciaryLogoProps> = ({
  size = 'md',
  variant = 'full',
  className = '',
  showText = true,
  lightMode = false,
}) => {
  // Dimension mapping
  const sizeMap = {
    xs: { icon: 24, text: 'text-[10px]', subtext: 'text-[7px]' },
    sm: { icon: 32, text: 'text-xs', subtext: 'text-[8px]' },
    md: { icon: 44, text: 'text-sm', subtext: 'text-[10px]' },
    lg: { icon: 60, text: 'text-base', subtext: 'text-xs' },
    xl: { icon: 84, text: 'text-xl', subtext: 'text-sm' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;
  const iconPx = currentSize.icon;

  // The Emblem SVG: Scales of Justice + Nigerian Green/White Shield + Laurel Wreath
  const EmblemSVG = (
    <svg
      width={iconPx}
      height={iconPx}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0 drop-shadow-sm"
    >
      <defs>
        {/* Nigerian Green Gradient */}
        <linearGradient id="ngGreenGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#008751" />
          <stop offset="100%" stopColor="#045936" />
        </linearGradient>

        {/* Judicial Gold Gradient */}
        <linearGradient id="judicialGold" x1="20" y1="20" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="40%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>

        {/* Subtle Brass Ring */}
        <linearGradient id="goldRim" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D97706" />
          <stop offset="50%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* Shadow filter for emblem depth */}
        <filter id="emblemShadow" x="0" y="0" width="120" height="120" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#043320" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Outer Golden Border Circle */}
      <circle cx="60" cy="60" r="56" fill="#043C25" stroke="url(#goldRim)" strokeWidth="2.5" />

      {/* Inner Nigerian Flag Roundel (Green - White - Green) */}
      <g clipPath="url(#roundelClip)">
        {/* Left Green band */}
        <rect x="12" y="12" width="32" height="96" fill="#008751" />
        {/* Center White band */}
        <rect x="44" y="12" width="32" height="96" fill="#FFFFFF" />
        {/* Right Green band */}
        <rect x="76" y="12" width="32" height="96" fill="#008751" />
      </g>
      <clipPath id="roundelClip">
        <circle cx="60" cy="60" r="48" />
      </clipPath>

      {/* Circular Inner Shield Rim */}
      <circle cx="60" cy="60" r="48" fill="none" stroke="url(#judicialGold)" strokeWidth="1.8" />

      {/* ================= LAUREL WREATH ================= */}
      {/* Left Laurel Branch */}
      <path
        d="M32 78C26 70 24 55 30 42C31 40 33 42 33 44C28 54 30 66 36 74C37 75 35 77 34 78Z"
        fill="url(#judicialGold)"
      />
      <ellipse cx="28" cy="46" rx="4" ry="2" transform="rotate(-30 28 46)" fill="url(#judicialGold)" />
      <ellipse cx="25" cy="56" rx="4.5" ry="2" transform="rotate(-15 25 56)" fill="url(#judicialGold)" />
      <ellipse cx="26" cy="67" rx="4.5" ry="2" transform="rotate(10 26 67)" fill="url(#judicialGold)" />
      <ellipse cx="32" cy="77" rx="4" ry="2" transform="rotate(35 32 77)" fill="url(#judicialGold)" />

      {/* Right Laurel Branch */}
      <path
        d="M88 78C94 70 96 55 90 42C89 40 87 42 87 44C92 54 90 66 84 74C83 75 85 77 86 78Z"
        fill="url(#judicialGold)"
      />
      <ellipse cx="92" cy="46" rx="4" ry="2" transform="rotate(30 92 46)" fill="url(#judicialGold)" />
      <ellipse cx="95" cy="56" rx="4.5" ry="2" transform="rotate(15 95 56)" fill="url(#judicialGold)" />
      <ellipse cx="94" cy="67" rx="4.5" ry="2" transform="rotate(-10 94 67)" fill="url(#judicialGold)" />
      <ellipse cx="88" cy="77" rx="4" ry="2" transform="rotate(-35 88 77)" fill="url(#judicialGold)" />

      {/* ================= SCALES OF JUSTICE ================= */}
      {/* Central Pillar of Justice */}
      {/* Base Pedestal */}
      <path d="M48 90H72L69 86H51L48 90Z" fill="url(#judicialGold)" />
      <rect x="52" y="84" width="16" height="2.5" rx="1" fill="url(#judicialGold)" />

      {/* Vertical Column / Sword */}
      <rect x="58.5" y="30" width="3" height="54" fill="url(#judicialGold)" />

      {/* Golden Finial / Cross-Guard */}
      <circle cx="60" cy="27" r="4.5" fill="url(#judicialGold)" stroke="#B45309" strokeWidth="1" />
      <circle cx="60" cy="27" r="1.5" fill="#FFFFFF" />

      {/* Main Balance Crossbeam */}
      <path
        d="M32 38C42 36 50 35.5 60 35.5C70 35.5 78 36 88 38C89 38.2 89 39.5 88 39.5C78 37.8 70 37.5 60 37.5C50 37.5 42 37.8 32 39.5C31 39.5 31 38.2 32 38Z"
        fill="url(#judicialGold)"
      />

      {/* Center Pivot Bracket */}
      <path d="M57 34H63L61.5 40H58.5L57 34Z" fill="url(#judicialGold)" />

      {/* LEFT SCALE */}
      {/* Chains */}
      <line x1="33" y1="39" x2="26" y2="58" stroke="#D97706" strokeWidth="1" strokeDasharray="1.5 1" />
      <line x1="33" y1="39" x2="40" y2="58" stroke="#D97706" strokeWidth="1" strokeDasharray="1.5 1" />
      {/* Left Pan */}
      <path
        d="M23 58C23 64 43 64 43 58H23Z"
        fill="url(#judicialGold)"
        stroke="#B45309"
        strokeWidth="0.8"
      />
      <ellipse cx="33" cy="58" rx="10" ry="2" fill="url(#judicialGold)" />

      {/* RIGHT SCALE */}
      {/* Chains */}
      <line x1="87" y1="39" x2="80" y2="58" stroke="#D97706" strokeWidth="1" strokeDasharray="1.5 1" />
      <line x1="87" y1="39" x2="94" y2="58" stroke="#D97706" strokeWidth="1" strokeDasharray="1.5 1" />
      {/* Right Pan */}
      <path
        d="M77 58C77 64 97 64 97 58H77Z"
        fill="url(#judicialGold)"
        stroke="#B45309"
        strokeWidth="0.8"
      />
      <ellipse cx="87" cy="58" rx="10" ry="2" fill="url(#judicialGold)" />

      {/* ================= BANNER SCROLL ================= */}
      {/* Bottom Green Banner */}
      <path
        d="M26 95L34 91H86L94 95L88 103H32L26 95Z"
        fill="#045936"
        stroke="url(#judicialGold)"
        strokeWidth="1.2"
      />
      {/* Banner Ribbons Tails */}
      <path d="M26 95L18 100L22 92L26 95Z" fill="#008751" stroke="#B45309" strokeWidth="0.8" />
      <path d="M94 95L102 100L98 92L94 95Z" fill="#008751" stroke="#B45309" strokeWidth="0.8" />

      {/* Banner Text - Micro Inscription */}
      <text
        x="60"
        y="99"
        textAnchor="middle"
        fill="#FDE047"
        fontSize="6.5"
        fontWeight="800"
        fontFamily="sans-serif"
        letterSpacing="0.8"
      >
        JUSTICE &amp; INTEGRITY
      </text>
    </svg>
  );

  if (variant === 'icon' || variant === 'crest') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {EmblemSVG}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {EmblemSVG}

      {showText && (
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-extrabold tracking-tight uppercase leading-tight ${currentSize.text} ${
                lightMode ? 'text-slate-900' : 'text-emerald-950 dark:text-white'
              }`}
            >
              Judiciary of Nigeria
            </span>
            <span className="hidden xs:inline-flex items-center px-1.5 py-0.5 rounded bg-[#008751]/10 text-[#008751] font-bold text-[9px] tracking-wide uppercase border border-[#008751]/20">
              Official
            </span>
          </div>

          <span
            className={`font-semibold tracking-wider uppercase ${currentSize.subtext} ${
              lightMode ? 'text-[#008751]' : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            Court Proceedings &amp; Records Engine
          </span>
        </div>
      )}
    </div>
  );
};
