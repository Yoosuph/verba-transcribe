import React from 'react';

interface PhoneFrameProps {
  children: React.ReactNode;
  theme?: 'light' | 'royal';
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  children,
  theme = 'light',
}) => {
  const isRoyal = theme === 'royal';

  return (
    <div className="w-full flex-1 min-h-0 h-full flex flex-col overflow-hidden relative transition-colors duration-300">
      <div
        className={`w-full h-full flex-1 min-h-0 flex flex-col overflow-hidden relative transition-colors duration-300 ${
          isRoyal
            ? 'bg-gradient-to-b from-[#005A34] via-[#044428] to-[#022C22] text-white'
            : 'bg-[#F8FAF9] text-slate-900'
        }`}
      >
        {children}
      </div>
    </div>
  );
};
