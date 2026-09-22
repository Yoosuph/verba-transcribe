import React from 'react';

interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon';
  lightMode?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  variant = 'full',
  lightMode = false,
  className = '',
}) => {
  const sizeMap = {
    xs: { box: 'w-6 h-6', icon: 'w-3.5 h-3.5', text: 'text-[10px]', sub: 'text-[7px]' },
    sm: { box: 'w-8 h-8', icon: 'w-4 h-4', text: 'text-xs', sub: 'text-[8px]' },
    md: { box: 'w-10 h-10', icon: 'w-5 h-5', text: 'text-sm', sub: 'text-[9px]' },
    lg: { box: 'w-14 h-14', icon: 'w-7 h-7', text: 'text-base', sub: 'text-[10px]' },
    xl: { box: 'w-20 h-20', icon: 'w-10 h-10', text: 'text-xl', sub: 'text-xs' },
  }[size];

  const iconColor = lightMode ? 'text-[#008751]' : 'text-emerald-400';
  const titleColor = lightMode ? 'text-slate-900' : 'text-white';
  const subColor = lightMode ? 'text-slate-500' : 'text-white/60';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`${sizeMap.box} rounded-xl flex items-center justify-center flex-shrink-0 ${
          lightMode
            ? 'bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 shadow-sm'
            : 'bg-gradient-to-br from-emerald-500/20 to-emerald-900/40 border border-emerald-400/30'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${sizeMap.icon} ${iconColor}`}
          aria-hidden="true"
        >
          {/* Soundwave mark */}
          <line x1="4" y1="10" x2="4" y2="14" />
          <line x1="8" y1="7" x2="8" y2="17" />
          <line x1="12" y1="4" x2="12" y2="20" />
          <line x1="16" y1="7" x2="16" y2="17" />
          <line x1="20" y1="10" x2="20" y2="14" />
        </svg>
      </div>
      {variant === 'full' && (
        <div className="leading-tight">
          <div className={`${sizeMap.text} font-bold tracking-tight ${titleColor}`}>
            Scribe
          </div>
          <div className={`${sizeMap.sub} font-medium tracking-wide ${subColor}`}>
            Meet · Transcribe · Summarize
          </div>
        </div>
      )}
    </div>
  );
};
