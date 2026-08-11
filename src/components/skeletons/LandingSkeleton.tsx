import React from 'react';

export const LandingSkeleton: React.FC = () => {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#030712]">
      {/* Background radial glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 20% 30%, rgba(29,170,88,0.07) 0%, transparent 70%), radial-gradient(ellipse 60% 55% at 80% 70%, rgba(36,132,198,0.09) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Floating background pills */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute left-[-8%] top-[18%] w-[580px] h-[130px] rounded-full border border-white/10 bg-gradient-to-r from-[#1DAA58]/10 to-transparent rotate-[12deg]" />
        <div className="absolute right-[-4%] top-[62%] w-[500px] h-[115px] rounded-full border border-white/10 bg-gradient-to-r from-[#2484C6]/10 to-transparent rotate-[-15deg]" />
        <div className="absolute left-[6%] bottom-[10%] w-[300px] h-[75px] rounded-full border border-white/10 bg-gradient-to-r from-[#008DA5]/10 to-transparent rotate-[-8deg]" />
      </div>

      {/* Landing Skeleton Content */}
      <div className="relative z-10 w-full max-w-2xl px-6 mx-auto text-center space-y-8 animate-pulse">
        {/* Logo placeholder */}
        <div className="flex justify-center">
          <img
            src="/mediant-logo.png"
            alt="Mediant Labs"
            style={{ height: 110, width: 'auto', objectFit: 'contain' }}
            className="opacity-90"
          />
        </div>

        {/* BRAN Wordmark */}
        <div>
          <h1
            className="font-black leading-none select-none"
            style={{
              fontSize: 'clamp(7rem, 18vw, 13rem)',
              backgroundImage: 'linear-gradient(135deg, #1DAA58 0%, #008DA5 50%, #2484C6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '-0.02em',
            }}
          >
            BRAN
          </h1>
        </div>

        {/* Description placeholder lines */}
        <div className="space-y-2 max-w-lg mx-auto">
          <div className="h-3.5 bg-white/10 rounded-full w-full" />
          <div className="h-3 bg-white/10 rounded-full w-4/5 mx-auto" />
        </div>

        {/* Log In button placeholder */}
        <div className="pt-2 flex flex-col items-center gap-3">
          <div
            className="h-12 w-36 rounded-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#1DAA58]/30 to-[#2484C6]/30 border border-white/10 shadow-lg"
          >
            <div className="w-4 h-4 rounded-full border-2 border-emerald-400/40 border-t-emerald-400 animate-spin" />
            <span className="text-xs font-bold text-white/60">Connecting...</span>
          </div>
          <p className="text-[10px] text-white/30 tracking-wide font-mono">Verifying secure connection...</p>
        </div>
      </div>

      {/* Footer copyright */}
      <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
        <p className="text-[10px] text-white/20">
          © 2026 Mediant Labs · BRAN Integrated Operational Engine
        </p>
      </div>
    </div>
  );
};

export default LandingSkeleton;
