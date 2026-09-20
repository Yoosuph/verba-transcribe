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
    <div className="w-full sm:max-w-[430px] mx-auto h-[100dvh] sm:h-[860px] sm:max-h-[94vh] sm:my-auto sm:rounded-3xl sm:border sm:border-slate-800/80 sm:shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative transition-colors duration-300">
      <div
        className={`w-full h-full flex flex-col overflow-hidden relative ${
          isRoyal ? 'bg-[#2838E8]' : 'bg-[#F8FAFC]'
        }`}
      >
        {children}
      </div>
    </div>
  );
};
