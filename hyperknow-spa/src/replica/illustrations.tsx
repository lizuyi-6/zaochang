import React from 'react';

/**
 * Hand-drawn ink-style SVG illustration library for the Hyperknow 1:1 replica.
 * Style: black ink linework (#1A1A1A, ~2.5px strokes), white fills,
 * sparse yellow (#F7CE46) / lime (#A3E635) accents, 4-point sparkles.
 */

const ink = '#1A1A1A';

export const Sparkle: React.FC<{ x: number; y: number; s?: number; color?: string }> = ({ x, y, s = 8, color = ink }) => (
  <path
    d={`M ${x} ${y - s} Q ${x + s * 0.15} ${y - s * 0.15} ${x + s} ${y} Q ${x + s * 0.15} ${y + s * 0.15} ${x} ${y + s} Q ${x - s * 0.15} ${y + s * 0.15} ${x - s} ${y} Q ${x - s * 0.15} ${y - s * 0.15} ${x} ${y - s} Z`}
    fill={color}
  />
);

/** Hyperknow logo mark + wordmark. */
export const Logo: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
    <svg width={size} height={size * 0.9} viewBox="0 0 37 33" fill="none">
      <path
        d="M36.5 10.7L27.7 5.6c-.3-.2-.7-.2-1 0L18 10.7 9.8 15.4l-3-1.7c-.5-.3-1.1-.1-1.4.4-.3.5-.1 1.1.4 1.4l3 1.7v2.4c0 .6.4 1 .9 1s.9-.4.9-1v-2.4l5.5-3.1 5.4-3.1 5.1 2.9v5.9l-5.1 2.9-1.8-1c-.5-.3-1.1-.1-1.4.4-.3.5-.1 1.1.4 1.4l2.2 1.3c.2.1.5.1.7 0l5.8-3.3c.2-.1.3-.4.3-.6v-6.7c0-.3-.2-.5-.4-.6z"
        fill={ink}
      />
      <path d="M17.9 10.7L9.2 5.6c-.3-.2-.7-.2-1 0L-.6 10.7v6.7c0 .3.2.5.4.6l8.8 5.1 5.5 3.1 3.8 2.2" stroke={ink} strokeWidth="2" fill="none" strokeLinejoin="round" transform="translate(1,0)" />
    </svg>
    <span style={{ fontWeight: 700, fontSize: size * 0.75, letterSpacing: '-0.02em', color: ink }}>Hyperknow</span>
  </span>
);

/** UFO doodle (Orbie) — hand-drawn saucer with dome and stars. */
export const Ufo: React.FC<{ size?: number }> = ({ size = 70 }) => (
  <svg width={size} height={size * 0.62} viewBox="0 0 100 62" fill="none">
    {/* dome */}
    <path d="M38 26 Q40 12 50 12 Q60 12 62 26" stroke={ink} strokeWidth="2.2" fill="#fff" />
    {/* speckles in dome */}
    <circle cx="46" cy="20" r="0.9" fill={ink} /><circle cx="52" cy="17" r="0.9" fill={ink} /><circle cx="56" cy="22" r="0.9" fill={ink} />
    {/* hull */}
    <path d="M14 34 Q50 20 86 34 Q50 44 14 34 Z" stroke={ink} strokeWidth="2.2" fill="#fff" />
    <path d="M22 36 Q50 46 78 36" stroke={ink} strokeWidth="2" fill="none" />
    <path d="M30 39 Q50 47 70 39" stroke={ink} strokeWidth="1.6" fill="none" />
    {/* lights */}
    <circle cx="36" cy="35.5" r="1.4" fill={ink} /><circle cx="50" cy="37.5" r="1.4" fill={ink} /><circle cx="64" cy="35.5" r="1.4" fill={ink} />
    {/* stars */}
    <Sparkle x={16} y={12} s={5} /><Sparkle x={84} y={10} s={6} /><Sparkle x={92} y={26} s={4} /><Sparkle x={8} y={28} s={4} />
  </svg>
);

/** UFO inside a soft white circular badge. */
export const UfoBadge: React.FC<{ size?: number }> = ({ size = 96 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Ufo size={size * 0.72} />
  </div>
);

/** Rocket-riding girl (onboarding steps 2/3). */
export const RocketGirl: React.FC<{ size?: number }> = ({ size = 170 }) => (
  <svg width={size} height={size} viewBox="0 0 170 170" fill="none">
    {/* motion squiggles */}
    <path d="M18 118 q6 -4 12 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M14 130 q7 -5 14 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* rocket body */}
    <path d="M60 108 Q100 128 138 96 Q142 92 138 88 Q98 60 62 88 Q52 96 60 108 Z" fill="#fff" stroke={ink} strokeWidth="2.4" />
    {/* rocket nose + fins in periwinkle */}
    <path d="M138 96 Q152 92 150 84 Q140 80 132 86 Z" fill="#C7D2FE" stroke={ink} strokeWidth="2" />
    <path d="M64 106 Q52 118 44 112 Q50 100 60 96 Z" fill="#C7D2FE" stroke={ink} strokeWidth="2" />
    <circle cx="112" cy="92" r="7" fill="#fff" stroke={ink} strokeWidth="2" />
    {/* flames */}
    <path d="M52 100 q-14 2 -22 12 M54 106 q-10 6 -14 14" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    {/* rider: body */}
    <path d="M88 84 q-2 -18 6 -26" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <circle cx="98" cy="48" r="9" fill="#fff" stroke={ink} strokeWidth="2.2" />
    {/* hair bun */}
    <circle cx="104" cy="40" r="4.5" fill={ink} />
    <path d="M90 46 q8 -10 16 -2" stroke={ink} strokeWidth="2" fill={ink} />
    {/* raised waving arm */}
    <path d="M92 62 q-10 -12 -16 -20" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* pencil/pointer in other hand */}
    <path d="M94 64 q10 2 18 6" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <path d="M112 70 l10 3 -8 4 z" fill="#F7CE46" stroke={ink} strokeWidth="1.4" />
    {/* legs side-saddle */}
    <path d="M88 84 q-8 8 -16 12 M90 86 q-4 10 -12 16" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <Sparkle x={140} y={40} s={6} /><Sparkle x={30} y={50} s={5} /><Sparkle x={120} y={140} s={5} />
  </svg>
);

/** Astronaut (onboarding step 5 top illustration). */
export const Astronaut: React.FC<{ size?: number }> = ({ size = 105 }) => (
  <svg width={size} height={size * 1.1} viewBox="0 0 105 115" fill="none">
    <circle cx="52" cy="34" r="14" fill="#fff" stroke={ink} strokeWidth="2.2" />
    <circle cx="52" cy="34" r="9" fill="#EEF2FF" stroke={ink} strokeWidth="1.6" />
    <path d="M44 52 q8 -6 16 0 l4 20 q-12 6 -24 0 z" fill="#fff" stroke={ink} strokeWidth="2.2" />
    <path d="M42 58 q-12 2 -18 -8 M62 58 q12 0 16 -10" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <path d="M46 74 q-4 12 -12 18 M58 74 q2 12 10 18" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <Sparkle x={16} y={20} s={5} /><Sparkle x={90} y={16} s={6} /><Sparkle x={88} y={60} s={4} />
    <circle cx="20" cy="90" r="6" stroke={ink} strokeWidth="1.8" fill="#E9F5CF" />
    <circle cx="92" cy="94" r="4" stroke={ink} strokeWidth="1.6" fill="#fff" />
  </svg>
);

/** Person writing at desk with 5 stars (onboarding step 6 / "Still there?" popup). */
export const DeskWriter: React.FC<{ size?: number; stars?: boolean }> = ({ size = 110, stars = true }) => (
  <svg width={size} height={size} viewBox="0 0 110 110" fill="none">
    {/* 5 stars arc */}
    {stars && [22, 38, 54, 70, 86].map((x, i) => (
      <path key={i} d={`M ${x} ${16 + Math.abs(i - 2) * 3} l2.2 4.4 4.8 0.7 -3.5 3.4 0.8 4.8 -4.3 -2.2 -4.3 2.2 0.8 -4.8 -3.5 -3.4 4.8 -0.7 z`} fill="#F7CE46" stroke={ink} strokeWidth="1.2" />
    ))}
    {/* head */}
    <circle cx="55" cy="46" r="8" fill="#fff" stroke={ink} strokeWidth="2.2" />
    <circle cx="60" cy="39" r="4" fill={ink} />
    <path d="M47 44 q8 -9 16 -2" stroke={ink} strokeWidth="2" fill={ink} />
    {/* body leaning over desk */}
    <path d="M50 56 q-8 10 -6 22" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    {/* arm writing */}
    <path d="M52 60 q10 4 14 12" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <path d="M66 72 l4 8" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
    {/* desk */}
    <path d="M14 84 h82" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
    <path d="M20 84 v14 M90 84 v14" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
    {/* notebook */}
    <path d="M56 78 h22 v6 h-22 z" fill="#fff" stroke={ink} strokeWidth="1.8" />
    {/* pencil cup */}
    <path d="M24 72 h10 v12 h-10 z" fill="#fff" stroke={ink} strokeWidth="1.8" />
    <path d="M27 72 l-2 -8 M31 72 l3 -8" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
    {/* book stack */}
    <path d="M84 76 h14 M86 80 h12" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** Person sitting cross-legged petting a cat (onboarding step 8). */
export const CatPerson: React.FC<{ size?: number }> = ({ size = 105 }) => (
  <svg width={size} height={size * 0.85} viewBox="0 0 105 90" fill="none">
    <circle cx="42" cy="22" r="9" fill="#fff" stroke={ink} strokeWidth="2.2" />
    <path d="M33 20 q9 -11 18 -1" stroke={ink} strokeWidth="2.2" fill={ink} />
    <path d="M36 34 q-6 14 2 24" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    {/* crossed legs */}
    <path d="M24 66 q14 -8 28 0 q-14 8 -28 0 Z" fill="#fff" stroke={ink} strokeWidth="2.2" />
    <path d="M38 60 q10 -6 20 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* arm petting */}
    <path d="M44 42 q14 4 22 12" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* cat */}
    <ellipse cx="80" cy="62" rx="13" ry="8" fill="#fff" stroke={ink} strokeWidth="2" />
    <circle cx="90" cy="55" r="6" fill="#fff" stroke={ink} strokeWidth="2" />
    <path d="M87 50 l-2 -5 4 3 M93 50 l2 -5 -4 3" fill="#fff" stroke={ink} strokeWidth="1.6" />
    <path d="M68 60 q-8 -2 -10 -8" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    <Sparkle x={12} y={14} s={4} /><Sparkle x={96} y={20} s={5} />
  </svg>
);

/** Running/striding reader with floating books (welcome-back screen). */
export const WelcomeReader: React.FC<{ size?: number }> = ({ size = 260 }) => (
  <svg width={size} height={size * 0.94} viewBox="0 0 260 245" fill="none">
    {/* floating books / stars */}
    <g stroke={ink} strokeWidth="2" fill="#fff">
      <rect x="30" y="30" width="34" height="24" rx="2" transform="rotate(-12 47 42)" />
      <rect x="196" y="22" width="30" height="22" rx="2" transform="rotate(10 211 33)" />
      <rect x="215" y="120" width="26" height="20" rx="2" transform="rotate(-8 228 130)" />
    </g>
    <rect x="34" y="34" width="10" height="17" fill="#A3B54A" opacity="0.85" transform="rotate(-12 47 42)" />
    <Sparkle x={90} y={18} s={7} /><Sparkle x={170} y={60} s={6} /><Sparkle x={240} y={70} s={5} />
    {/* motion lines */}
    <path d="M18 150 h26 M24 166 h22" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    {/* person: head */}
    <circle cx="130" cy="72" r="16" fill="#fff" stroke={ink} strokeWidth="2.6" />
    <path d="M114 66 q14 -16 30 -4 q2 6 -2 8 q-14 -8 -28 2 z" fill={ink} />
    {/* body striding */}
    <path d="M126 92 q-6 26 4 44" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
    {/* legs */}
    <path d="M130 136 q-14 18 -30 30 M132 136 q10 20 26 28" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M96 168 l-8 4 M160 166 l8 6" stroke={ink} strokeWidth="3" strokeLinecap="round" />
    {/* arms holding open book */}
    <path d="M124 100 q-18 6 -24 16 M134 102 q16 4 24 14" stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
    {/* open book */}
    <path d="M100 112 q16 -6 28 2 q12 -8 28 -2 l0 22 q-14 -6 -28 2 q-12 -8 -28 -2 z" fill="#fff" stroke={ink} strokeWidth="2.2" />
    <path d="M128 114 v20" stroke={ink} strokeWidth="1.4" />
    <path d="M106 118 q9 -4 17 1 M106 124 q9 -4 17 1 M135 118 q9 -4 16 0 M135 124 q9 -4 16 0" stroke={ink} strokeWidth="1" fill="none" />
    {/* notepad */}
    <rect x="60" y="120" width="22" height="28" rx="2" fill="#A3B54A" opacity="0.85" stroke={ink} strokeWidth="1.8" transform="rotate(-14 71 134)" />
  </svg>
);

/** Award figure: curly-haired person holding a yellow phone (award 1). */
export const AwardPhone: React.FC<{ size?: number }> = ({ size = 160 }) => (
  <svg width={size} height={size} viewBox="0 0 160 160" fill="none">
    {/* curly hair */}
    <circle cx="80" cy="34" r="15" fill="#fff" stroke={ink} strokeWidth="2.4" />
    <path d="M64 30 q-4 -10 6 -12 q2 -8 10 -6 q8 -4 12 4 q8 0 6 10 q4 8 -4 12" stroke={ink} strokeWidth="2.2" fill={ink} />
    {/* face */}
    <circle cx="75" cy="36" r="1.4" fill={ink} /><circle cx="85" cy="36" r="1.4" fill={ink} />
    <path d="M76 42 q4 3 8 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* cream long-sleeve top */}
    <path d="M64 54 q16 -8 32 0 l4 34 q-20 8 -40 0 z" fill="#FDFCF7" stroke={ink} strokeWidth="2.4" />
    {/* arms holding phone at chest */}
    <path d="M66 60 q-8 10 0 20 M94 60 q8 10 0 20" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* yellow phone */}
    <rect x="72" y="66" width="16" height="24" rx="3" fill="#F7CE46" stroke={ink} strokeWidth="2" transform="rotate(-8 80 78)" />
    <circle cx="80" cy="86" r="1.6" fill={ink} />
    {/* black wide pants */}
    <path d="M66 92 l-6 44 q8 4 14 0 l4 -36 M94 92 l6 44 q-8 4 -14 0 l-4 -36" fill="#1F2937" stroke={ink} strokeWidth="2.2" />
    {/* shoes */}
    <path d="M56 138 q8 6 16 2 M88 140 q8 4 16 -2" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </svg>
);

/** Award figure: person holding a yellow plaque aloft with confetti (awards 2/3). */
export const AwardPopper: React.FC<{ size?: number }> = ({ size = 170 }) => (
  <svg width={size} height={size} viewBox="0 0 170 160" fill="none">
    {/* confetti burst: yellow squares/sparkles + ink squiggles, up-right */}
    <rect x="104" y="14" width="6" height="6" fill="#F5C518" transform="rotate(18 107 17)" />
    <rect x="132" y="26" width="5" height="5" fill="#F5C518" transform="rotate(-14 134 28)" />
    <rect x="118" y="48" width="4.5" height="4.5" fill="#F5C518" transform="rotate(30 120 50)" />
    <rect x="146" y="52" width="5" height="5" fill="none" stroke={ink} strokeWidth="1.5" transform="rotate(12 148 54)" />
    <rect x="96" y="34" width="4" height="4" fill="none" stroke={ink} strokeWidth="1.5" transform="rotate(-24 98 36)" />
    <circle cx="140" cy="10" r="2.2" fill="#F5C518" />
    <circle cx="112" cy="66" r="2" fill="none" stroke={ink} strokeWidth="1.4" />
    <circle cx="154" cy="34" r="2" fill="#F5C518" />
    <Sparkle x={124} y={8} s={5} color="#F5C518" /><Sparkle x={156} y={20} s={4} color="#F5C518" />
    <Sparkle x={88} y={18} s={4} color="#F5C518" /><Sparkle x={142} y={72} s={5} />
    <path d="M96 56 q8 -6 12 2 q-8 4 -12 -2 M128 40 q6 -8 12 -2 M150 44 q6 -4 10 2" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M108 78 q4 4 10 2" stroke="#F5C518" strokeWidth="2" fill="none" strokeLinecap="round" />
    {/* person leaning back, facing right */}
    <circle cx="56" cy="38" r="14" fill="#fff" stroke={ink} strokeWidth="2.4" />
    {/* curly hair: puffs */}
    <path d="M42 34 q-6 -10 4 -14 q0 -9 10 -8 q6 -7 13 -2 q9 -2 9 7 q6 5 0 11 q2 8 -6 9 l-2 -6 q4 -5 0 -9 q-4 -6 -10 -3 q-8 -3 -11 4 q-7 1 -5 9 z" fill={ink} />
    <circle cx="52" cy="40" r="1.4" fill={ink} /><circle cx="61" cy="40" r="1.4" fill={ink} />
    <path d="M52 46 q4 3 8 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* cream long-sleeve top */}
    <path d="M42 58 q14 -8 30 -2 l6 34 q-20 10 -38 2 z" fill="#FDFCF7" stroke={ink} strokeWidth="2.4" />
    {/* arms raised holding plaque */}
    <path d="M66 62 q16 -8 24 -16 M68 74 q14 -2 24 -12" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* yellow plaque tilted up-right */}
    <g transform="rotate(-18 92 48)">
      <rect x="78" y="34" width="30" height="22" rx="2.5" fill="#F5C518" stroke={ink} strokeWidth="2" />
      <path d="M83 41 h20 M83 47 h14" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
    </g>
    {/* black wide pants */}
    <path d="M44 92 l-8 44 q8 4 14 0 l6 -34 M76 94 l4 44 q8 2 14 -2 l-4 -40" fill="#1F2937" stroke={ink} strokeWidth="2.2" />
    <path d="M32 138 q8 6 16 2 M80 140 q8 4 16 -2" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </svg>
);

/** Trophy person mid-jump (UNIT COMPLETE / onboarding finale). */
export const TrophyPerson: React.FC<{ size?: number }> = ({ size = 150 }) => (
  <svg width={size} height={size * 1.15} viewBox="0 0 150 172" fill="none">
    {/* trophy aloft */}
    <g transform="translate(96 6)">
      <path d="M10 8 h24 v10 q0 10 -12 12 q-12 -2 -12 -12 z" fill="#F7CE46" stroke={ink} strokeWidth="2.2" />
      <path d="M10 10 q-8 0 -6 8 q2 6 8 4 M34 10 q8 0 6 8 q-2 6 -8 4" stroke={ink} strokeWidth="2" fill="none" />
      <path d="M22 30 v6 M14 40 h16 l-2 -4 h-12 z" stroke={ink} strokeWidth="2.2" fill="#F7CE46" />
      <text x="22" y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>1</text>
    </g>
    {/* motion ticks */}
    <path d="M86 14 l-6 -6 M84 26 l-8 -2" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
    {/* head */}
    <circle cx="66" cy="56" r="13" fill="#fff" stroke={ink} strokeWidth="2.4" />
    <circle cx="72" cy="46" r="6" fill={ink} />
    <path d="M54 52 q10 -12 22 -4" stroke={ink} strokeWidth="2.2" fill={ink} />
    <circle cx="62" cy="58" r="1.3" fill={ink} /><circle cx="71" cy="58" r="1.3" fill={ink} />
    <path d="M62 64 q4 3 8 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* body */}
    <path d="M58 72 q14 -6 24 2 l2 30 q-16 8 -30 0 z" fill="#FDFCF7" stroke={ink} strokeWidth="2.4" />
    {/* right arm up to trophy */}
    <path d="M78 76 q14 -10 20 -28" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* left arm trailing */}
    <path d="M56 80 q-14 6 -20 16" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* jumping legs (knees tucked) */}
    <path d="M60 106 q-12 8 -10 22 q8 4 14 -2 M80 106 q10 10 6 24 q-8 4 -14 -2" fill="#1F2937" stroke={ink} strokeWidth="2.2" />
    <path d="M46 130 q8 6 16 0 M74 132 q8 6 16 0" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <Sparkle x={18} y={30} s={6} /><Sparkle x={136} y={60} s={5} /><Sparkle x={30} y={100} s={4} />
  </svg>
);

/** Skateboard kid (LECTURE COMPLETE practice prompt). */
export const SkaterKid: React.FC<{ size?: number }> = ({ size = 150 }) => (
  <svg width={size} height={size} viewBox="0 0 150 150" fill="none">
    <circle cx="78" cy="34" r="12" fill="#fff" stroke={ink} strokeWidth="2.4" />
    <path d="M66 30 q10 -12 24 -2 q0 6 -4 6 q-10 -6 -20 2 z" fill={ink} />
    {/* torso leaning */}
    <path d="M70 50 q14 -2 20 8 l-4 24 q-14 4 -24 -4 z" fill="#FDFCF7" stroke={ink} strokeWidth="2.4" />
    {/* arms out for balance */}
    <path d="M70 56 q-16 -2 -26 -10 M88 60 q14 2 24 -4" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* crouched legs */}
    <path d="M68 84 q-10 10 -4 22 M86 86 q8 8 4 20" stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
    {/* skateboard */}
    <path d="M40 116 q35 10 70 0 q4 6 -4 8 q-31 8 -62 0 q-8 -2 -4 -8 Z" fill="#F7CE46" stroke={ink} strokeWidth="2.2" />
    <circle cx="58" cy="130" r="5" fill="#fff" stroke={ink} strokeWidth="2" />
    <circle cx="94" cy="130" r="5" fill="#fff" stroke={ink} strokeWidth="2" />
    {/* speed lines */}
    <path d="M16 100 h20 M22 112 h16" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    <Sparkle x={124} y={26} s={5} />
  </svg>
);

/** Handshake line illustration (affiliate banner). */
export const Handshake: React.FC<{ size?: number }> = ({ size = 52 }) => (
  <svg width={size} height={size * 0.78} viewBox="0 0 52 40" fill="none">
    <path d="M4 12 l10 -6 10 8 12 -4 12 8" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M24 14 l-8 10 q-2 3 1 5 q3 2 5 -1 l4 -6 M24 14 q4 -2 6 0 l8 6" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M22 26 l3 3 M27 28 l3 3" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/** Planet doodle used inside the home H1. */
export const PlanetDoodle: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" fill="none" style={{ verticalAlign: '-6px', display: 'inline-block' }}>
    <circle cx="17" cy="17" r="8" stroke={ink} strokeWidth="2" fill="#FDFCF7" />
    <ellipse cx="17" cy="18" rx="14" ry="4.5" stroke={ink} strokeWidth="1.8" fill="none" transform="rotate(-16 17 18)" />
    <circle cx="13" cy="14" r="1" fill={ink} /><circle cx="20" cy="19" r="1" fill={ink} />
    <Sparkle x={28} y={6} s={3.4} /><Sparkle x={5} y={9} s={2.6} />
  </svg>
);

/** Google "G" mark. */
export const GoogleG: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.58 2.68-3.9 2.68-6.62z" fill="#4285F4" />
    <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" fill="#34A853" />
    <path d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" fill="#FBBC05" />
    <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335" />
  </svg>
);

/** Two-tone avatar: amber sky, black cat silhouette with ear tufts, cream eyes, orange ring. */
export const AvatarCat: React.FC<{ size?: number; ring?: boolean }> = ({ size = 36, ring = false }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'linear-gradient(180deg, #FCB33C 0%, #F59E0B 100%)',
      overflow: 'hidden',
      boxShadow: ring ? '0 0 0 2px #fff, 0 0 0 4px #F4732A' : '0 0 0 1.5px #F4732A',
      flexShrink: 0,
    }}
  >
    <svg width={size} height={size} viewBox="0 0 36 36">
      {/* cat head rising from the bottom, ear tufts poking into the amber */}
      <path d="M2 36 V24 L5 11 L11 17 Q18 13 25 17 L31 11 L34 24 V36 Z" fill="#232328" />
      {/* wide cream eyes */}
      <ellipse cx="14" cy="24" rx="3.2" ry="3.9" fill="#F5EFE3" />
      <ellipse cx="22" cy="24" rx="3.2" ry="3.9" fill="#F5EFE3" />
    </svg>
  </div>
);

/* ---------------- Course cover art ---------------- */

export type CoverKind =
  | 'sociology' | 'bio' | 'ml' | 'ai' | 'history' | 'prompt' | 'psych' | 'sat' | 'philo' | 'stats';

const coverBg: Record<CoverKind, string> = {
  sociology: '#F2F1EC',
  bio: '#F5F6D8',
  ml: '#F3E9D2',
  ai: 'linear-gradient(180deg, #E5EEDC 0%, #8E968A 55%, #474B4B 100%)',
  history: 'linear-gradient(180deg, #DDDFF5 0%, #8A8DA6 55%, #484B57 100%)',
  prompt: 'linear-gradient(180deg, #E5EEDC 0%, #8E968A 55%, #474B4B 100%)',
  psych: 'linear-gradient(180deg, #FBF2D2 0%, #A79F7E 55%, #4A4636 100%)',
  sat: 'linear-gradient(180deg, #D6E8F8 0%, #7E8CA8 55%, #3E4450 100%)',
  philo: '#C7BFA8',
  stats: '#DCEBDC',
};

const CoverArt: React.FC<{ kind: CoverKind }> = ({ kind }) => {
  switch (kind) {
    case 'bio':
      return (
        <svg viewBox="0 0 200 140" width="200" height="140">
          {/* DNA double helix: two crossing strands + rungs */}
          <g stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round">
            <path d="M124.0 12.0 L 123.8 14.0 L 123.3 16.0 L 122.5 17.9 L 121.3 19.9 L 119.8 21.9 L 118.0 23.9 L 116.0 25.9 L 113.8 27.8 L 111.3 29.8 L 108.7 31.8 L 106.0 33.8 L 103.1 35.8 L 100.3 37.7 L 97.4 39.7 L 94.5 41.7 L 91.8 43.7 L 89.1 45.7 L 86.7 47.6 L 84.4 49.6 L 82.3 51.6 L 80.5 53.6 L 79.0 55.6 L 77.7 57.5 L 76.8 59.5 L 76.2 61.5 L 76.0 63.5 L 76.1 65.5 L 76.6 67.4 L 77.4 69.4 L 78.5 71.4 L 79.9 73.4 L 81.6 75.4 L 83.6 77.3 L 85.8 79.3 L 88.2 81.3 L 90.8 83.3 L 93.5 85.3 L 96.4 87.2 L 99.2 89.2 L 102.1 91.2 L 104.9 93.2 L 107.7 95.2 L 110.4 97.1 L 112.9 99.1 L 115.2 101.1 L 117.3 103.1 L 119.2 105.1 L 120.8 107.0 L 122.1 109.0 L 123.0 111.0 L 123.7 113.0 L 124.0 115.0 L 123.9 116.9 L 123.5 118.9 L 122.8 120.9 L 121.7 122.9 L 120.4 124.9" />
            <path d="M76.0 12.0 L 76.2 14.0 L 76.7 16.0 L 77.5 17.9 L 78.7 19.9 L 80.2 21.9 L 82.0 23.9 L 84.0 25.9 L 86.2 27.8 L 88.7 29.8 L 91.3 31.8 L 94.0 33.8 L 96.9 35.8 L 99.7 37.7 L 102.6 39.7 L 105.5 41.7 L 108.2 43.7 L 110.9 45.7 L 113.3 47.6 L 115.6 49.6 L 117.7 51.6 L 119.5 53.6 L 121.0 55.6 L 122.3 57.5 L 123.2 59.5 L 123.8 61.5 L 124.0 63.5 L 123.9 65.5 L 123.4 67.4 L 122.6 69.4 L 121.5 71.4 L 120.1 73.4 L 118.4 75.4 L 116.4 77.3 L 114.2 79.3 L 111.8 81.3 L 109.2 83.3 L 106.5 85.3 L 103.6 87.2 L 100.8 89.2 L 97.9 91.2 L 95.1 93.2 L 92.3 95.2 L 89.6 97.1 L 87.1 99.1 L 84.8 101.1 L 82.7 103.1 L 80.8 105.1 L 79.2 107.0 L 77.9 109.0 L 77.0 111.0 L 76.3 113.0 L 76.0 115.0 L 76.1 116.9 L 76.5 118.9 L 77.2 120.9 L 78.3 122.9 L 79.6 124.9" />
          </g>
          <g stroke={ink} strokeWidth="1.5" strokeLinecap="round">
            <path d="M77.5 17.8 h45.1 M88.1 29.3 h23.9 M95.7 40.9 h8.6 M81.5 52.4 h37.0 M76.0 64.0 h48.0 M81.8 75.5 h36.5 M96.1 87.1 h7.8 M87.7 98.6 h24.6 M77.3 110.2 h45.4 M77.6 121.7 h44.8" />
          </g>
          {/* cell / organelle at right */}
          <path d="M148 88 q16 -12 26 2 q-12 12 -26 -2 z" fill="#fff" stroke={ink} strokeWidth="1.8" />
          <circle cx="160" cy="89" r="2.6" stroke={ink} strokeWidth="1.3" fill="none" />
          <circle cx="152" cy="91" r="1.2" fill={ink} /><circle cx="167" cy="92" r="1.2" fill={ink} />
          {/* motion ticks top-left */}
          <path d="M46 40 q6 -8 14 -6 M42 52 q4 -6 12 -5" stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <Sparkle x={40} y={24} s={6} /><Sparkle x={162} y={30} s={5} /><Sparkle x={52} y={112} s={4} />
        </svg>
      );
    case 'sociology':
      return (
        <svg viewBox="0 0 200 120" width="200" height="120">
          <g stroke={ink} strokeWidth="1.8" fill="none" strokeLinejoin="round">
            <path d="M40 88 l20 -10 20 10 -20 10 z" fill="#E8E4D8" />
            <path d="M40 88 v-24 l20 -10 v24 M80 88 v-24 l-20 -10 v24" />
            <path d="M60 54 v-18 l14 7 v18" fill="#DCE4EC" />
            <path d="M94 92 l18 -9 18 9 -18 9 z" fill="#E4DCD0" />
            <path d="M94 92 v-20 l18 -9 v20 M130 92 v-20 l-18 -9 v20" />
            <path d="M112 63 v-26 l12 6 v26" fill="#D8E2D8" />
            <path d="M130 70 l14 -7 14 7 -14 7 z" fill="#E8E4D8" />
            <path d="M130 70 v-16 l14 -7 v16 M158 70 v-16 l-14 -7 v16" />
          </g>
          <circle cx="52" cy="30" r="6" stroke={ink} strokeWidth="1.6" fill="#F2D8C8" />
          <Sparkle x={150} y={26} s={5} /><Sparkle x={36} y={52} s={4} />
        </svg>
      );
    case 'ml':
      return (
        <svg viewBox="0 0 200 120" width="200" height="120">
          {/* presenter at whiteboard */}
          <rect x="96" y="22" width="72" height="48" rx="4" fill="#fff" stroke={ink} strokeWidth="2" />
          <path d="M104 60 l14 -16 8 8 12 -14 12 10" stroke={ink} strokeWidth="1.8" fill="none" />
          <circle cx="118" cy="44" r="3" fill="#F7CE46" stroke={ink} strokeWidth="1.4" />
          <path d="M104 34 h20 M104 40 h14" stroke={ink} strokeWidth="1.4" />
          <circle cx="58" cy="42" r="10" fill="#fff" stroke={ink} strokeWidth="2" />
          <path d="M48 38 q8 -12 20 -4" fill={ink} />
          <path d="M50 54 q10 -6 18 0 l2 24 q-12 5 -22 0 z" fill="#E8B4A0" stroke={ink} strokeWidth="2" />
          <path d="M68 58 q12 -4 22 -10" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M52 82 v22 M66 82 v22" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
          <Sparkle x={176} y={20} s={5} /><Sparkle x={26} y={24} s={4} />
        </svg>
      );
    case 'ai':
      return (
        <svg viewBox="0 0 200 140" width="200" height="140">
          <g stroke={ink} strokeWidth="1.1" opacity="0.75">
            {/* connections */}
            <path d="M46 30 L86 24 M46 30 L86 56 M46 30 L86 88 M46 62 L86 24 M46 62 L86 56 M46 62 L86 88 M46 62 L86 116 M46 94 L86 56 M46 94 L86 88 M46 94 L86 116 M86 24 L126 36 M86 56 L126 36 M86 56 L126 70 M86 88 L126 70 M86 88 L126 104 M86 116 L126 104 M126 36 L162 56 M126 70 L162 56 M126 70 L162 88 M126 104 L162 88" fill="none" />
          </g>
          <g stroke={ink} strokeWidth="1.8">
            <circle cx="46" cy="30" r="6" fill="#3E4A42" /><circle cx="46" cy="62" r="6" fill="#fff" /><circle cx="46" cy="94" r="6" fill="#3E4A42" />
            <circle cx="86" cy="24" r="6" fill="#fff" /><circle cx="86" cy="56" r="6" fill="#3E4A42" /><circle cx="86" cy="88" r="6" fill="#fff" /><circle cx="86" cy="116" r="6" fill="#3E4A42" />
            <circle cx="126" cy="36" r="6" fill="#3E4A42" /><circle cx="126" cy="70" r="6" fill="#fff" /><circle cx="126" cy="104" r="6" fill="#3E4A42" />
            <circle cx="162" cy="56" r="7" fill="#fff" /><circle cx="162" cy="88" r="7" fill="#3E4A42" />
          </g>
          <circle cx="20" cy="116" r="4" fill="#fff" stroke={ink} strokeWidth="1.6" />
          <path d="M26 108 q6 -6 12 -4" stroke={ink} strokeWidth="1.4" fill="none" />
          <Sparkle x={178} y={24} s={5} color="#F7CE46" /><Sparkle x={182} y={118} s={4} color="#F7CE46" />
        </svg>
      );
    case 'history':
      return (
        <svg viewBox="0 0 200 140" width="200" height="140">
          {/* globe */}
          <circle cx="118" cy="76" r="34" fill="#fff" stroke={ink} strokeWidth="2.2" />
          <path d="M118 42 q-20 18 0 68 M118 42 q20 18 0 68 M88 66 q30 10 60 0 M90 90 q28 8 56 0" stroke={ink} strokeWidth="1.4" fill="none" />
          {/* ship */}
          <path d="M148 34 q10 8 20 0 l-3 10 h-14 z" fill="#fff" stroke={ink} strokeWidth="1.8" />
          <path d="M156 34 v-14 M163 34 v-10 M156 22 h14" stroke={ink} strokeWidth="1.4" />
          {/* crown */}
          <path d="M88 34 l6 -12 6 8 6 -8 6 12 z" fill="#F7CE46" stroke={ink} strokeWidth="1.8" />
          {/* person pushing */}
          <circle cx="46" cy="56" r="9" fill="#fff" stroke={ink} strokeWidth="2" />
          <circle cx="46" cy="48" r="7" fill={ink} />
          <path d="M40 68 q12 -4 18 4 l14 -6" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M44 86 l-6 22 M52 86 l6 22" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
          <Sparkle x={180} y={110} s={5} color="#F7CE46" />
        </svg>
      );
    case 'prompt':
      return (
        <svg viewBox="0 0 200 140" width="200" height="140">
          {/* robot head from speech bubbles */}
          <rect x="66" y="30" width="66" height="46" rx="12" fill="#fff" stroke={ink} strokeWidth="2.2" />
          <rect x="80" y="44" width="52" height="34" rx="10" fill="#E5EEDC" stroke={ink} strokeWidth="1.8" />
          <circle cx="96" cy="60" r="4" fill={ink} /><circle cx="116" cy="60" r="4" fill={ink} />
          <path d="M100 70 q6 4 12 0" stroke={ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M98 30 v-12 M98 14 l-3 -4 M98 14 l3 -4" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="98" cy="8" r="3" fill="#F7CE46" stroke={ink} strokeWidth="1.6" />
          {/* rivets */}
          <circle cx="72" cy="36" r="1.2" fill={ink} /><circle cx="126" cy="36" r="1.2" fill={ink} />
          {/* gear */}
          <circle cx="150" cy="100" r="10" fill="#fff" stroke={ink} strokeWidth="2" />
          <circle cx="150" cy="100" r="3.5" stroke={ink} strokeWidth="1.6" fill="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <rect key={a} x="147.5" y="86" width="5" height="5" fill={ink} transform={`rotate(${a} 150 100)`} />
          ))}
          {/* lever */}
          <path d="M44 108 v-24" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="44" cy="80" r="5" fill="#F7CE46" stroke={ink} strokeWidth="1.8" />
          <Sparkle x={60} y={116} s={4} /><Sparkle x={170} y={30} s={5} color="#F7CE46" />
        </svg>
      );
    case 'psych':
      return (
        <svg viewBox="0 0 200 140" width="200" height="140">
          {/* brain: left + right hemispheres with squiggle folds */}
          <g stroke={ink} strokeWidth="2" fill="#fff" strokeLinejoin="round">
            <path d="M98 30 q-12 -12 -28 -6 q-18 -6 -26 8 q-14 0 -14 16 q-12 6 -6 20 q-8 10 2 18 q-4 14 10 18 q2 14 18 12 q10 8 22 2 q14 4 22 -6 l0 -76 q0 -4 0 -6 z" />
          </g>
          <path d="M98 30 v82" stroke={ink} strokeWidth="1.8" />
          <g stroke={ink} strokeWidth="1.4" fill="none" strokeLinecap="round">
            <path d="M66 40 q10 -6 18 2 q-12 2 -10 12" />
            <path d="M48 52 q12 -4 14 8 q-14 0 -12 12" />
            <path d="M70 78 q10 -4 14 6 q-10 4 -8 14" />
            <path d="M46 88 q10 -2 12 8" />
            <path d="M126 40 q-10 -6 -18 2 q12 2 10 12" />
            <path d="M144 52 q-12 -4 -14 8 q14 0 12 12" />
            <path d="M122 78 q-10 -4 -14 6 q10 4 8 14" />
            <path d="M146 88 q-10 -2 -12 8" />
          </g>
          {/* brain stem */}
          <path d="M92 116 q0 10 -8 12 M104 116 q2 8 8 10" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          {/* neuron sparkle at right */}
          <circle cx="168" cy="52" r="5" fill="#F7CE46" stroke={ink} strokeWidth="1.6" />
          <path d="M168 40 v-8 M176 58 l8 6 M161 57 l-7 7" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="168" cy="29" r="2.2" fill={ink} /><circle cx="187" cy="66" r="2.2" fill={ink} /><circle cx="151" cy="66" r="2.2" fill={ink} />
          <Sparkle x={34} y={110} s={5} /><Sparkle x={180} y={100} s={4} color="#F7CE46" />
        </svg>
      );
    case 'sat':
      return (
        <svg viewBox="0 0 200 140" width="200" height="140">
          <g transform="translate(0,-16)">
          {/* person leaning in from the left */}
          <circle cx="52" cy="66" r="10" fill="#fff" stroke={ink} strokeWidth="2" />
          <path d="M42 62 q2 -12 14 -12 q10 0 10 8 q-8 -4 -14 0 q-6 1 -10 4 z" fill={ink} />
          <path d="M44 78 q14 -4 20 6 l6 26 q-14 6 -26 0 l-4 -22 q0 -8 4 -10 z" fill="#fff" stroke={ink} strokeWidth="2" />
          <path d="M62 84 q16 -6 26 -16" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M50 110 l-8 18 M64 110 l6 18" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
          {/* checklist: stacked radio circles with grad cap on top */}
          <g stroke={ink} strokeWidth="1.8" fill="#fff">
            <circle cx="150" cy="58" r="7" />
            <circle cx="150" cy="78" r="7" />
            <circle cx="150" cy="98" r="7" />
            <circle cx="150" cy="118" r="7" />
          </g>
          <circle cx="150" cy="78" r="3" fill={ink} />
          <path d="M162 58 h20 M162 78 h14 M162 98 h20 M162 118 h14" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
          {/* graduation cap */}
          <path d="M150 26 l26 10 -26 10 -26 -10 z" fill={ink} />
          <path d="M150 36 v10 M168 40 v12 q-6 6 -12 2" stroke={ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <circle cx="170" cy="56" r="2.6" fill="#F7CE46" stroke={ink} strokeWidth="1.4" />
          <path d="M112 40 q6 -8 14 -6 M110 52 q4 -6 12 -4" stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <Sparkle x={120} y={112} s={5} /><Sparkle x={186} y={30} s={4} color="#F7CE46" />
          </g>
        </svg>
      );
    case 'philo':
      return (
        <svg viewBox="0 0 200 120" width="200" height="120">
          {/* Kandinsky-style geometric composition */}
          <circle cx="60" cy="52" r="26" fill="#172A54" />
          <circle cx="60" cy="52" r="13" fill="#C8B394" />
          <path d="M104 78 a26 26 0 0 1 52 0 z" fill="#C35426" />
          <path d="M104 78 a26 26 0 0 1 26 -26 v26 z" fill="#F8B61A" />
          <g fill="#1A1A1A">{[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={14 + i * 9} y={94} width="4.5" height={i % 2 ? 14 : 20} />)}</g>
          <path d="M150 24 l16 0 0 16 -16 0 z" fill="#20557F" />
          <path d="M158 66 q14 6 10 22 q-16 2 -20 -12 q2 -10 10 -10 z" fill="#fff" stroke="#1A1A1A" strokeWidth="2" />
          <circle cx="154" cy="74" r="1.8" fill="#1A1A1A" /><circle cx="161" cy="78" r="1.8" fill="#1A1A1A" /><circle cx="156" cy="83" r="1.8" fill="#1A1A1A" />
          <path d="M30 24 q10 -8 20 0 q-10 8 -20 0 z" fill="#C35426" />
        </svg>
      );
    case 'stats':
      return (
        <svg viewBox="0 0 200 120" width="200" height="120">
          {/* bell curve + bars */}
          <path d="M30 96 q40 -8 52 -44 q6 -18 18 -18 q12 0 18 18 q12 36 52 44" fill="none" stroke={ink} strokeWidth="2.2" />
          <path d="M100 34 v62" stroke={ink} strokeWidth="1.2" strokeDasharray="3 4" />
          <g stroke={ink} strokeWidth="1.6" fill="#fff">
            <rect x="40" y="76" width="12" height="20" /><rect x="56" y="66" width="12" height="30" fill="#C9DEC9" />
            <rect x="132" y="70" width="12" height="26" fill="#C9DEC9" /><rect x="148" y="80" width="12" height="16" />
          </g>
          <Sparkle x={170} y={26} s={5} /><Sparkle x={30} y={40} s={4} />
        </svg>
      );
  }
};

/** Course cover: hand-drawn art on a tinted (or gradient) ground. `flat` = no radius/shadow chrome of its own. */
export const CourseCover: React.FC<{ kind: CoverKind; flat?: boolean; style?: React.CSSProperties }> = ({ kind, flat, style }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      background: coverBg[kind],
      borderRadius: flat ? 0 : 14,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style,
    }}
  >
    <CoverArt kind={kind} />
  </div>
);

/* ---------------- Inline text decorations ---------------- */

/** Blue brush swash behind hero words (marketplace). */
export const HighlightSwash: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ position: 'relative', display: 'inline-block', padding: '0 4px' }}>
    <svg
      style={{ position: 'absolute', left: -6, right: -6, top: '52%', width: 'calc(100% + 12px)', height: '62%', zIndex: 0 }}
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
    >
      <path d="M2 12 Q 25 4 50 9 T 98 8 L 97 17 Q 60 20 30 17 T 2 15 Z" fill="#C8DCFA" opacity="0.85" />
    </svg>
    <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
  </span>
);

/** Mint hand-drawn highlight for testimonial quotes. */
export const MintMark: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      background: 'linear-gradient(180deg, transparent 55%, #CDEBC5 55%, #CDEBC5 92%, transparent 92%)',
      borderRadius: 2,
      padding: '0 1px',
    }}
  >
    {children}
  </span>
);

/* ---------------- Board annotations (whiteboard) ---------------- */

/** Pale-yellow hand-drawn highlighter swash. Animates in with a left→right wipe. */
export const BoardHighlight: React.FC<{ w: number; h?: number; animate?: boolean; color?: string }> = ({
  w,
  h = 22,
  animate = false,
  color = '#FCF6DA',
}) => (
  <svg
    width={w}
    height={h}
    viewBox={`0 0 ${w} ${h}`}
    style={animate ? { animation: 'wb-highlight-wipe 0.45s ease-out both' } : undefined}
  >
    <path
      d={`M2 ${h * 0.28} Q ${w * 0.3} ${h * 0.08} ${w * 0.55} ${h * 0.2} T ${w - 2} ${h * 0.3} L ${w - 3} ${h * 0.82} Q ${w * 0.6} ${h * 0.98} ${w * 0.35} ${h * 0.85} T 3 ${h * 0.78} Z`}
      fill={color}
    />
  </svg>
);

/** Freehand red ellipse annotation. Animates with a draw-on stroke. */
export const BoardCircle: React.FC<{ w: number; h: number; animate?: boolean; color?: string }> = ({
  w,
  h,
  animate = false,
  color = '#C44918',
}) => {
  const rx = w / 2 - 3;
  const ry = h / 2 - 3;
  const cx = w / 2;
  const cy = h / 2;
  // slightly irregular ellipse path
  const d = `M ${cx - rx} ${cy} C ${cx - rx} ${cy - ry * 1.15}, ${cx - rx * 0.5} ${cy - ry * 1.05}, ${cx} ${cy - ry}
    C ${cx + rx * 0.6} ${cy - ry * 1.1}, ${cx + rx} ${cy - ry * 0.55}, ${cx + rx * 0.97} ${cy}
    C ${cx + rx * 1.05} ${cy + ry * 0.6}, ${cx + rx * 0.45} ${cy + ry * 1.1}, ${cx - 1} ${cy + ry * 0.98}
    C ${cx - rx * 0.55} ${cy + ry * 1.08}, ${cx - rx * 1.02} ${cy + ry * 0.5}, ${cx - rx} ${cy + 1} Z`;
  const len = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2) * 1.15;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        style={
          animate
            ? { strokeDasharray: len, strokeDashoffset: len, animation: 'wb-circle-draw 0.9s ease-in-out forwards' }
            : undefined
        }
      />
    </svg>
  );
};

/** Hand-drawn underline stroke. */
export const BoardUnderline: React.FC<{ w: number; animate?: boolean; color?: string }> = ({ w, animate = false, color = '#C44918' }) => {
  const d = `M2 3 Q ${w * 0.25} 6 ${w * 0.5} 3.5 T ${w - 2} 4`;
  return (
    <svg width={w} height={8} viewBox={`0 0 ${w} 8`} style={{ overflow: 'visible' }}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        style={animate ? { strokeDasharray: w + 8, strokeDashoffset: w + 8, animation: 'wb-circle-draw 0.5s ease-out forwards' } : undefined}
      />
    </svg>
  );
};

/** Small yellow pencil that rides the handwriting head. */
export const BoardPencil: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" style={{ transform: 'rotate(35deg)', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))' }}>
    <rect x="7.6" y="1.5" width="4.8" height="12" rx="1" fill="#F2C94C" stroke="#8A6D1A" strokeWidth="0.9" />
    <path d="M7.6 13.5 L10 18.6 L12.4 13.5 Z" fill="#F5D0A9" stroke="#8A6D1A" strokeWidth="0.9" />
    <path d="M9.3 17 L10 18.6 L10.7 17 Z" fill="#3A3A3A" />
    <rect x="7.6" y="1.5" width="4.8" height="2.6" rx="1" fill="#ED93B1" stroke="#8A6D1A" strokeWidth="0.8" />
  </svg>
);
