import React from 'react';

/** Editorial atlas illustrations for 见界 · LATTICE. Solid paper, pine ink and amber. */

const ink = '#164E46';
const paper = '#F7F4EC';
const amber = '#D9A441';
const sage = '#9EAF99';
const rule = '#BBC6B4';

export const Sparkle: React.FC<{ x: number; y: number; s?: number; color?: string }> = ({ x, y, s = 8, color = ink }) => (
  <path
    d={`M ${x} ${y - s} Q ${x + s * 0.15} ${y - s * 0.15} ${x + s} ${y} Q ${x + s * 0.15} ${y + s * 0.15} ${x} ${y + s} Q ${x - s * 0.15} ${y + s * 0.15} ${x - s} ${y} Q ${x - s * 0.15} ${y - s * 0.15} ${x} ${y - s} Z`}
    fill={color}
  />
);

/** Shared open-page mark. Keep span > svg + span for mark-only CSS. */
export const Logo: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
    <svg width={size} height={size * 0.9} viewBox="0 0 32 32" fill="none" role="img" aria-label="见界 · LATTICE" focusable="false">
      <path d="M16 10C12 7 7 7 3 8v17c5-1 9 0 13 3 4-3 8-4 13-3V8c-4-1-9-1-13 2Z" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" fill={paper} />
      <path d="M16 10v18 M16 6v4" stroke={ink} strokeWidth="1.8" /><circle cx="16" cy="4" r="2" fill={amber} />
    </svg>
    <span style={{ fontWeight: 700, fontSize: size * 0.75, letterSpacing: '0.04em', color: ink, whiteSpace: 'nowrap' }}>见界 · LATTICE</span>
  </span>
);

/** Orbiting atlas guide, retaining its legacy public name. */
export const Ufo: React.FC<{ size?: number }> = ({ size = 70 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size * 0.62} viewBox="0 0 100 62" fill="none">
    <circle cx="50" cy="30" r="23" fill={sage} opacity="0.25" />
    <ellipse cx="50" cy="33" rx="42" ry="13" transform="rotate(-12 50 33)" stroke={rule} />
    <path d="M50 45 Q37 36 23 39 V16 Q38 14 50 24 Q62 14 77 16 V39 Q63 36 50 45Z" fill={paper} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M50 24 V45 M29 23 Q39 22 44 28 M29 29 Q38 28 44 34 M56 28 Q64 22 71 23 M56 34 Q64 28 71 29" stroke={ink} strokeWidth="1.2" />
    <path d="M18 44 L50 10 L83 39" stroke={ink} strokeDasharray="2 4" />
    <circle cx="50" cy="10" r="4" fill={amber} /><circle cx="18" cy="44" r="2.5" fill={ink} /><circle cx="83" cy="39" r="2.5" fill={ink} />
  </svg>
);

/** UFO inside a soft white circular badge. */
export const UfoBadge: React.FC<{ size?: number }> = ({ size = 96 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: '#F7F4EC',
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
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 170 170" fill="none">
    <circle cx="88" cy="88" r="62" fill={sage} opacity="0.16" />
    <path d="M26 154 H150 M26 159 H48" stroke={rule} strokeWidth="0.8" />
    {/* motion squiggles */}
    <path d="M18 118 q6 -4 12 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M14 130 q7 -5 14 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* rocket body */}
    <path d="M60 108 Q100 128 138 96 Q142 92 138 88 Q98 60 62 88 Q52 96 60 108 Z" fill="#F7F4EC" stroke={ink} strokeWidth="2.4" />
    {/* rocket nose + fins in periwinkle */}
    <path d="M138 96 Q152 92 150 84 Q140 80 132 86 Z" fill="#9EAF99" stroke={ink} strokeWidth="2" />
    <path d="M64 106 Q52 118 44 112 Q50 100 60 96 Z" fill="#9EAF99" stroke={ink} strokeWidth="2" />
    <circle cx="112" cy="92" r="7" fill="#F7F4EC" stroke={ink} strokeWidth="2" />
    {/* flames */}
    <path d="M52 100 q-14 2 -22 12 M54 106 q-10 6 -14 14" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    {/* rider: body */}
    <path d="M88 84 q-2 -18 6 -26" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <circle cx="98" cy="48" r="9" fill="#F7F4EC" stroke={ink} strokeWidth="2.2" />
    {/* hair bun */}
    <circle cx="104" cy="40" r="4.5" fill={ink} />
    <path d="M90 46 q8 -10 16 -2" stroke={ink} strokeWidth="2" fill={ink} />
    {/* raised waving arm */}
    <path d="M92 62 q-10 -12 -16 -20" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* pencil/pointer in other hand */}
    <path d="M94 64 q10 2 18 6" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <path d="M112 70 l10 3 -8 4 z" fill="#D9A441" stroke={ink} strokeWidth="1.4" />
    {/* legs side-saddle */}
    <path d="M88 84 q-8 8 -16 12 M90 86 q-4 10 -12 16" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <Sparkle x={140} y={40} s={6} /><Sparkle x={30} y={50} s={5} /><Sparkle x={120} y={140} s={5} />
  </svg>
);

/** Astronaut (onboarding step 5 top illustration). */
export const Astronaut: React.FC<{ size?: number }> = ({ size = 105 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size * 1.1} viewBox="0 0 105 115" fill="none">
    <circle cx="52" cy="55" r="43" fill={sage} opacity="0.16" />
    <path d="M9 102 H95 M9 107 H31" stroke={rule} strokeWidth="0.8" />
    <circle cx="52" cy="34" r="14" fill="#F7F4EC" stroke={ink} strokeWidth="2.2" />
    <circle cx="52" cy="34" r="9" fill="#E4EADC" stroke={ink} strokeWidth="1.6" />
    <path d="M44 52 q8 -6 16 0 l4 20 q-12 6 -24 0 z" fill="#F7F4EC" stroke={ink} strokeWidth="2.2" />
    <path d="M42 58 q-12 2 -18 -8 M62 58 q12 0 16 -10" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <path d="M46 74 q-4 12 -12 18 M58 74 q2 12 10 18" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <Sparkle x={16} y={20} s={5} /><Sparkle x={90} y={16} s={6} /><Sparkle x={88} y={60} s={4} />
    <circle cx="20" cy="90" r="6" stroke={ink} strokeWidth="1.8" fill="#E4EADC" />
    <circle cx="92" cy="94" r="4" stroke={ink} strokeWidth="1.6" fill="#F7F4EC" />
  </svg>
);

/** Person writing at desk with 5 stars (onboarding step 6 / "Still there?" popup). */
export const DeskWriter: React.FC<{ size?: number; stars?: boolean }> = ({ size = 110, stars = true }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 110 110" fill="none">
    <circle cx="55" cy="62" r="38" fill={sage} opacity="0.16" />
    <path d="M17 104 H93 M17 109 H39" stroke={rule} strokeWidth="0.8" />
    {/* 5 stars arc */}
    {stars && [22, 38, 54, 70, 86].map((x, i) => (
      <path key={i} d={`M ${x} ${16 + Math.abs(i - 2) * 3} l2.2 4.4 4.8 0.7 -3.5 3.4 0.8 4.8 -4.3 -2.2 -4.3 2.2 0.8 -4.8 -3.5 -3.4 4.8 -0.7 z`} fill="#D9A441" stroke={ink} strokeWidth="1.2" />
    ))}
    {/* head */}
    <circle cx="55" cy="46" r="8" fill="#F7F4EC" stroke={ink} strokeWidth="2.2" />
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
    <path d="M56 78 h22 v6 h-22 z" fill="#F7F4EC" stroke={ink} strokeWidth="1.8" />
    {/* pencil cup */}
    <path d="M24 72 h10 v12 h-10 z" fill="#F7F4EC" stroke={ink} strokeWidth="1.8" />
    <path d="M27 72 l-2 -8 M31 72 l3 -8" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
    {/* book stack */}
    <path d="M84 76 h14 M86 80 h12" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** Person sitting cross-legged petting a cat (onboarding step 8). */
export const CatPerson: React.FC<{ size?: number }> = ({ size = 105 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size * 0.85} viewBox="0 0 105 90" fill="none">
    <circle cx="53" cy="45" r="36" fill={sage} opacity="0.16" />
    <path d="M17 85 H89 M17 90 H39" stroke={rule} strokeWidth="0.8" />
    <circle cx="42" cy="22" r="9" fill="#F7F4EC" stroke={ink} strokeWidth="2.2" />
    <path d="M33 20 q9 -11 18 -1" stroke={ink} strokeWidth="2.2" fill={ink} />
    <path d="M36 34 q-6 14 2 24" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    {/* crossed legs */}
    <path d="M24 66 q14 -8 28 0 q-14 8 -28 0 Z" fill="#F7F4EC" stroke={ink} strokeWidth="2.2" />
    <path d="M38 60 q10 -6 20 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* arm petting */}
    <path d="M44 42 q14 4 22 12" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* cat */}
    <ellipse cx="80" cy="62" rx="13" ry="8" fill="#F7F4EC" stroke={ink} strokeWidth="2" />
    <circle cx="90" cy="55" r="6" fill="#F7F4EC" stroke={ink} strokeWidth="2" />
    <path d="M87 50 l-2 -5 4 3 M93 50 l2 -5 -4 3" fill="#F7F4EC" stroke={ink} strokeWidth="1.6" />
    <path d="M68 60 q-8 -2 -10 -8" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    <Sparkle x={12} y={14} s={4} /><Sparkle x={96} y={20} s={5} />
  </svg>
);

/** A reader within an open architectural atlas, for the welcome-back screen. */
export const WelcomeReader: React.FC<{ size?: number }> = ({ size = 260 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size * 0.94} viewBox="0 0 260 245" fill="none">
    <path d="M51 201 V96 a79 79 0 0 1 158 0 V201Z" fill={sage} opacity="0.3" />
    <path d="M67 201 V98 a63 63 0 0 1 126 0 V201 M83 201 V100 a47 47 0 0 1 94 0 V201" stroke={rule} />
    <circle cx="191" cy="49" r="21" fill={amber} />
    <path d="M27 210 H230 M36 218 H94 M159 218 H217" stroke={ink} strokeWidth="1.2" />
    <path d="M39 67 L130 31 L225 107 L187 189" stroke={ink} strokeWidth="0.8" strokeDasharray="3 5" />
    <circle cx="39" cy="67" r="4" fill={ink} /><circle cx="130" cy="31" r="3" fill={amber} /><circle cx="225" cy="107" r="4" fill={ink} />
    <path d="M88 171 H161 V182 H88Z M98 182 V207 M153 182 V207" fill={ink} stroke={ink} strokeWidth="2" />
    <path d="M109 147 L150 149 L148 172 L125 178 L113 204 H99 L108 168Z" fill={ink} />
    <path d="M145 169 L168 194 L158 203 L129 177" fill={ink} />
    <path d="M99 207 H114 M158 204 L171 196" stroke={ink} strokeWidth="3" strokeLinecap="round" />
    <path d="M108 102 Q128 91 144 104 L154 149 Q128 160 102 149Z" fill={paper} stroke={ink} strokeWidth="1.8" />
    <circle cx="126" cy="78" r="18" fill={paper} stroke={ink} strokeWidth="1.8" />
    <path d="M108 78 Q100 53 123 55 Q147 52 145 78 L138 69 Q122 75 108 78Z" fill={ink} />
    <circle cx="133" cy="80" r="1.5" fill={ink} /><path d="M132 89 H138" stroke={ink} />
    <path d="M107 110 L90 128 L114 137 M144 110 L164 128 L142 139" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    <path d="M128 128 Q114 117 99 120 L106 149 Q118 148 130 156 Q140 146 155 146 L160 117 Q143 118 128 128Z" fill={amber} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M128 128 L130 156 M107 129 L121 135 M109 136 L122 141 M137 134 L151 126 M137 141 L150 133" stroke={ink} />
    <path d="M33 179 Q36 151 28 133 Q47 137 45 158 M35 169 Q58 163 56 145 Q38 147 35 169 M30 180 H50 L47 202 H34Z" fill={sage} stroke={ink} strokeWidth="1.2" />
    <path d="M185 174 H214 V184 H185Z M181 185 H216 V195 H181Z M187 196 H218 V206 H187Z" fill={paper} stroke={ink} strokeWidth="1.2" />
    <path d="M190 179 H207 M186 190 H209 M192 201 H211" stroke={sage} />
  </svg>
);

/** Award figure: curly-haired person holding a yellow phone (award 1). */
export const AwardPhone: React.FC<{ size?: number }> = ({ size = 160 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 160 160" fill="none">
    <circle cx="80" cy="82" r="62" fill={sage} opacity="0.16" />
    <path d="M18 148 H142 M18 153 H40" stroke={rule} strokeWidth="0.8" />
    {/* curly hair */}
    <circle cx="80" cy="34" r="15" fill="#F7F4EC" stroke={ink} strokeWidth="2.4" />
    <path d="M64 30 q-4 -10 6 -12 q2 -8 10 -6 q8 -4 12 4 q8 0 6 10 q4 8 -4 12" stroke={ink} strokeWidth="2.2" fill={ink} />
    {/* face */}
    <circle cx="75" cy="36" r="1.4" fill={ink} /><circle cx="85" cy="36" r="1.4" fill={ink} />
    <path d="M76 42 q4 3 8 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* cream long-sleeve top */}
    <path d="M64 54 q16 -8 32 0 l4 34 q-20 8 -40 0 z" fill="#F7F4EC" stroke={ink} strokeWidth="2.4" />
    {/* arms holding phone at chest */}
    <path d="M66 60 q-8 10 0 20 M94 60 q8 10 0 20" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* yellow phone */}
    <rect x="72" y="66" width="16" height="24" rx="3" fill="#D9A441" stroke={ink} strokeWidth="2" transform="rotate(-8 80 78)" />
    <circle cx="80" cy="86" r="1.6" fill={ink} />
    {/* black wide pants */}
    <path d="M66 92 l-6 44 q8 4 14 0 l4 -36 M94 92 l6 44 q-8 4 -14 0 l-4 -36" fill="#164E46" stroke={ink} strokeWidth="2.2" />
    {/* shoes */}
    <path d="M56 138 q8 6 16 2 M88 140 q8 4 16 -2" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </svg>
);

/** Award figure: person holding a yellow plaque aloft with confetti (awards 2/3). */
export const AwardPopper: React.FC<{ size?: number }> = ({ size = 170 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 170 160" fill="none">
    <circle cx="84" cy="80" r="62" fill={sage} opacity="0.16" />
    <path d="M22 146 H146 M22 151 H44" stroke={rule} strokeWidth="0.8" />
    {/* confetti burst: yellow squares/sparkles + ink squiggles, up-right */}
    <rect x="104" y="14" width="6" height="6" fill="#D9A441" transform="rotate(18 107 17)" />
    <rect x="132" y="26" width="5" height="5" fill="#D9A441" transform="rotate(-14 134 28)" />
    <rect x="118" y="48" width="4.5" height="4.5" fill="#D9A441" transform="rotate(30 120 50)" />
    <rect x="146" y="52" width="5" height="5" fill="none" stroke={ink} strokeWidth="1.5" transform="rotate(12 148 54)" />
    <rect x="96" y="34" width="4" height="4" fill="none" stroke={ink} strokeWidth="1.5" transform="rotate(-24 98 36)" />
    <circle cx="140" cy="10" r="2.2" fill="#D9A441" />
    <circle cx="112" cy="66" r="2" fill="none" stroke={ink} strokeWidth="1.4" />
    <circle cx="154" cy="34" r="2" fill="#D9A441" />
    <Sparkle x={124} y={8} s={5} color="#D9A441" /><Sparkle x={156} y={20} s={4} color="#D9A441" />
    <Sparkle x={88} y={18} s={4} color="#D9A441" /><Sparkle x={142} y={72} s={5} />
    <path d="M96 56 q8 -6 12 2 q-8 4 -12 -2 M128 40 q6 -8 12 -2 M150 44 q6 -4 10 2" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M108 78 q4 4 10 2" stroke="#D9A441" strokeWidth="2" fill="none" strokeLinecap="round" />
    {/* person leaning back, facing right */}
    <circle cx="56" cy="38" r="14" fill="#F7F4EC" stroke={ink} strokeWidth="2.4" />
    {/* curly hair: puffs */}
    <path d="M42 34 q-6 -10 4 -14 q0 -9 10 -8 q6 -7 13 -2 q9 -2 9 7 q6 5 0 11 q2 8 -6 9 l-2 -6 q4 -5 0 -9 q-4 -6 -10 -3 q-8 -3 -11 4 q-7 1 -5 9 z" fill={ink} />
    <circle cx="52" cy="40" r="1.4" fill={ink} /><circle cx="61" cy="40" r="1.4" fill={ink} />
    <path d="M52 46 q4 3 8 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* cream long-sleeve top */}
    <path d="M42 58 q14 -8 30 -2 l6 34 q-20 10 -38 2 z" fill="#F7F4EC" stroke={ink} strokeWidth="2.4" />
    {/* arms raised holding plaque */}
    <path d="M66 62 q16 -8 24 -16 M68 74 q14 -2 24 -12" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* yellow plaque tilted up-right */}
    <g transform="rotate(-18 92 48)">
      <rect x="78" y="34" width="30" height="22" rx="2.5" fill="#D9A441" stroke={ink} strokeWidth="2" />
      <path d="M83 41 h20 M83 47 h14" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
    </g>
    {/* black wide pants */}
    <path d="M44 92 l-8 44 q8 4 14 0 l6 -34 M76 94 l4 44 q8 2 14 -2 l-4 -40" fill="#164E46" stroke={ink} strokeWidth="2.2" />
    <path d="M32 138 q8 6 16 2 M80 140 q8 4 16 -2" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </svg>
);

/** Trophy person mid-jump (UNIT COMPLETE / onboarding finale). */
export const TrophyPerson: React.FC<{ size?: number }> = ({ size = 150 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size * 1.15} viewBox="0 0 150 172" fill="none">
    <circle cx="76" cy="84" r="62" fill={sage} opacity="0.16" />
    <path d="M14 150 H138 M14 155 H36" stroke={rule} strokeWidth="0.8" />
    {/* trophy aloft */}
    <g transform="translate(96 6)">
      <path d="M10 8 h24 v10 q0 10 -12 12 q-12 -2 -12 -12 z" fill="#D9A441" stroke={ink} strokeWidth="2.2" />
      <path d="M10 10 q-8 0 -6 8 q2 6 8 4 M34 10 q8 0 6 8 q-2 6 -8 4" stroke={ink} strokeWidth="2" fill="none" />
      <path d="M22 30 v6 M14 40 h16 l-2 -4 h-12 z" stroke={ink} strokeWidth="2.2" fill="#D9A441" />
      <text x="22" y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>1</text>
    </g>
    {/* motion ticks */}
    <path d="M86 14 l-6 -6 M84 26 l-8 -2" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
    {/* head */}
    <circle cx="66" cy="56" r="13" fill="#F7F4EC" stroke={ink} strokeWidth="2.4" />
    <circle cx="72" cy="46" r="6" fill={ink} />
    <path d="M54 52 q10 -12 22 -4" stroke={ink} strokeWidth="2.2" fill={ink} />
    <circle cx="62" cy="58" r="1.3" fill={ink} /><circle cx="71" cy="58" r="1.3" fill={ink} />
    <path d="M62 64 q4 3 8 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* body */}
    <path d="M58 72 q14 -6 24 2 l2 30 q-16 8 -30 0 z" fill="#F7F4EC" stroke={ink} strokeWidth="2.4" />
    {/* right arm up to trophy */}
    <path d="M78 76 q14 -10 20 -28" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* left arm trailing */}
    <path d="M56 80 q-14 6 -20 16" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* jumping legs (knees tucked) */}
    <path d="M60 106 q-12 8 -10 22 q8 4 14 -2 M80 106 q10 10 6 24 q-8 4 -14 -2" fill="#164E46" stroke={ink} strokeWidth="2.2" />
    <path d="M46 130 q8 6 16 0 M74 132 q8 6 16 0" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <Sparkle x={18} y={30} s={6} /><Sparkle x={136} y={60} s={5} /><Sparkle x={30} y={100} s={4} />
  </svg>
);

/** Skateboard kid (LECTURE COMPLETE practice prompt). */
export const SkaterKid: React.FC<{ size?: number }> = ({ size = 150 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 150 150" fill="none">
    <circle cx="77" cy="77" r="57" fill={sage} opacity="0.16" />
    <path d="M20 138 H134 M20 143 H42" stroke={rule} strokeWidth="0.8" />
    <circle cx="78" cy="34" r="12" fill="#F7F4EC" stroke={ink} strokeWidth="2.4" />
    <path d="M66 30 q10 -12 24 -2 q0 6 -4 6 q-10 -6 -20 2 z" fill={ink} />
    {/* torso leaning */}
    <path d="M70 50 q14 -2 20 8 l-4 24 q-14 4 -24 -4 z" fill="#F7F4EC" stroke={ink} strokeWidth="2.4" />
    {/* arms out for balance */}
    <path d="M70 56 q-16 -2 -26 -10 M88 60 q14 2 24 -4" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* crouched legs */}
    <path d="M68 84 q-10 10 -4 22 M86 86 q8 8 4 20" stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
    {/* skateboard */}
    <path d="M40 116 q35 10 70 0 q4 6 -4 8 q-31 8 -62 0 q-8 -2 -4 -8 Z" fill="#D9A441" stroke={ink} strokeWidth="2.2" />
    <circle cx="58" cy="130" r="5" fill="#F7F4EC" stroke={ink} strokeWidth="2" />
    <circle cx="94" cy="130" r="5" fill="#F7F4EC" stroke={ink} strokeWidth="2" />
    {/* speed lines */}
    <path d="M16 100 h20 M22 112 h16" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    <Sparkle x={124} y={26} s={5} />
  </svg>
);

/** Handshake line illustration (affiliate banner). */
export const Handshake: React.FC<{ size?: number }> = ({ size = 52 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size * 0.78} viewBox="0 0 52 40" fill="none">
    <path d="M4 12 l10 -6 10 8 12 -4 12 8" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M24 14 l-8 10 q-2 3 1 5 q3 2 5 -1 l4 -6 M24 14 q4 -2 6 0 l8 6" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M22 26 l3 3 M27 28 l3 3" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/** Small atlas globe for inline headings. */
export const PlanetDoodle: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 34 34" fill="none" style={{ verticalAlign: '-6px', display: 'inline-block' }}>
    <circle cx="17" cy="17" r="12" fill={paper} stroke={ink} strokeWidth="1.5" />
    <ellipse cx="17" cy="17" rx="5" ry="12" stroke={ink} /><path d="M5 17 H29 M8 10 Q17 14 26 10 M8 24 Q17 20 26 24" stroke={ink} />
    <circle cx="26" cy="9" r="3.5" fill={amber} />
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
      background: amber,
      overflow: 'hidden',
      boxShadow: ring ? '0 0 0 2px #F7F4EC, 0 0 0 4px #164E46' : '0 0 0 1.5px #164E46',
      flexShrink: 0,
    }}
  >
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 36 36">
      {/* cat head rising from the bottom, ear tufts poking into the amber */}
      <path d="M2 36 V24 L5 11 L11 17 Q18 13 25 17 L31 11 L34 24 V36 Z" fill="#164E46" />
      {/* wide cream eyes */}
      <ellipse cx="14" cy="24" rx="3.2" ry="3.9" fill="#F5EFE3" />
      <ellipse cx="22" cy="24" rx="3.2" ry="3.9" fill="#F5EFE3" />
    </svg>
  </div>
);

/* ---------------- Course cover art ---------------- */

export type CoverKind =
  | 'sociology' | 'bio' | 'ml' | 'ai' | 'history' | 'prompt' | 'psych' | 'sat' | 'philo' | 'stats';

/* 封面主题:每科专属底色(深浅交替成书架节奏),徽标用 ink/acc/paper 三色绘制。
   约束:禁止 <defs>/渐变 id(lattice-brand 测试要求同页多实例无 id 冲突),只用纯色。 */
interface CoverTheme {
  bg: string; // 封面底色
  ink: string; // 主线稿色
  acc: string; // 点缀色
  paper: string; // 高光/纸色
}
const AMBER = '#D9A441';
const CREAM = '#F7F4EC';
const INK = ink;

const coverTheme: Record<CoverKind, CoverTheme> = {
  sociology: { bg: '#C3CFB4', ink: INK, acc: AMBER, paper: CREAM }, // 灰绿
  bio: { bg: '#164E46', ink: CREAM, acc: AMBER, paper: CREAM }, // 深墨绿
  ml: { bg: '#EFD9A7', ink: INK, acc: AMBER, paper: CREAM }, // 暖杏
  ai: { bg: '#22364A', ink: CREAM, acc: AMBER, paper: CREAM }, // 深夜蓝
  history: { bg: '#C07551', ink: INK, acc: AMBER, paper: CREAM }, // 赤陶
  prompt: { bg: '#10261F', ink: INK, acc: AMBER, paper: CREAM }, // 墨黑绿
  psych: { bg: '#CDB8C8', ink: INK, acc: AMBER, paper: CREAM }, // 雾紫
  sat: { bg: AMBER, ink: INK, acc: CREAM, paper: CREAM }, // 金榜
  philo: { bg: '#EFE6CE', ink: INK, acc: AMBER, paper: CREAM }, // 羊皮纸
  stats: { bg: '#B9CCDD', ink: INK, acc: AMBER, paper: CREAM }, // 雾蓝
};

const plates: Record<CoverKind, (t: CoverTheme) => React.ReactNode> = {
  /* 社会学：三环相扣——个体、群体、制度的交叠 */
  sociology: (t) => (
    <>
      <circle cx="72" cy="76" r="27" stroke={t.ink} strokeWidth="2.6" />
      <circle cx="128" cy="76" r="27" stroke={t.ink} strokeWidth="2.6" />
      <circle cx="100" cy="56" r="27" fill={t.paper} fillOpacity=".5" stroke={t.ink} strokeWidth="2.6" />
      <circle cx="100" cy="68" r="7" fill={t.acc} />
      <path d="M50 116 H150" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
      <circle cx="42" cy="116" r="3" fill={t.ink} />
      <circle cx="158" cy="116" r="3" fill={t.ink} />
    </>
  ),
  /* 生物学：直立双螺旋,碱基横档与琥珀节点 */
  bio: (t) => (
    <>
      <path d="M76 118 C76 96, 124 92, 124 70 C124 48, 76 44, 76 22" stroke={t.ink} strokeWidth="3" />
      <path d="M124 118 C124 96, 76 92, 76 70 C76 48, 124 44, 124 22" stroke={t.ink} strokeWidth="3" />
      <path d="M86 32 H114 M90 52 H110 M96 70 H104 M90 88 H110 M86 106 H114" stroke={t.ink} strokeWidth="1.8" strokeOpacity=".75" />
      <circle cx="76" cy="22" r="4.5" fill={t.acc} />
      <circle cx="124" cy="22" r="4.5" fill={t.acc} />
      <circle cx="76" cy="118" r="4.5" fill={t.acc} />
      <circle cx="124" cy="118" r="4.5" fill={t.acc} />
      <circle cx="100" cy="70" r="6" fill={t.acc} />
    </>
  ),
  /* 机器学习：决策树——根节点菱形分裂,叶节点交替落定 */
  ml: (t) => (
    <>
      <path d="M100 24 L118 42 L100 60 L82 42 Z" fill={t.acc} />
      <path d="M92 56 L72 80 M108 56 L128 80" stroke={t.ink} strokeWidth="2.6" />
      <circle cx="66" cy="88" r="10" fill={t.ink} />
      <circle cx="134" cy="88" r="10" fill={t.paper} stroke={t.ink} strokeWidth="2.4" />
      <path d="M62 96 L50 114 M70 96 L82 114 M130 96 L118 114 M138 96 L150 114" stroke={t.ink} strokeWidth="2" />
      <circle cx="48" cy="119" r="4.5" fill={t.acc} />
      <circle cx="84" cy="119" r="4.5" fill={t.ink} />
      <circle cx="116" cy="119" r="4.5" fill={t.ink} />
      <circle cx="152" cy="119" r="4.5" fill={t.acc} />
    </>
  ),
  /* 人工智能：核心芯片,引脚信号与虚线轨道 */
  ai: (t) => (
    <>
      <ellipse cx="100" cy="70" rx="80" ry="46" stroke={t.ink} strokeOpacity=".3" strokeWidth="1.4" strokeDasharray="2 5" />
      <rect x="76" y="46" width="48" height="48" rx="9" stroke={t.ink} strokeWidth="3" />
      <rect x="92" y="62" width="16" height="16" rx="3" fill={t.acc} />
      <path d="M88 46 V30 M100 46 V28 M112 46 V30 M88 94 V110 M100 94 V112 M112 94 V110" stroke={t.ink} strokeWidth="2" />
      <path d="M76 58 H60 M76 70 H58 M76 82 H60 M124 58 H140 M124 70 H142 M124 82 H140" stroke={t.ink} strokeWidth="2" />
      <circle cx="100" cy="25" r="3.5" fill={t.acc} />
      <circle cx="145" cy="70" r="3.5" fill={t.acc} />
      <circle cx="55" cy="70" r="3.5" fill={t.ink} />
      <circle cx="100" cy="115" r="3.5" fill={t.ink} />
    </>
  ),
  /* 历史：拱门石柱与烈日——文明遗迹的剪影 */
  history: (t) => (
    <>
      <circle cx="146" cy="40" r="14" fill={t.acc} />
      <path d="M64 116 V74 A20 20 0 0 1 104 74 V116 Z" fill={t.paper} />
      <path d="M75 116 V82 A9 9 0 0 1 93 82 V116 Z" fill={t.bg} />
      <path d="M56 116 H112 M60 123 H108" stroke={t.paper} strokeWidth="3" strokeLinecap="round" />
      <path d="M58 64 H110" stroke={t.paper} strokeWidth="4" strokeLinecap="round" />
      <path d="M138 92 L141 98 L138 104 L135 98 Z" fill={t.paper} stroke="none" />
    </>
  ),
  /* 前端与代码工程：高对比终端窗口——琥珀光标静待输入 */
  prompt: (t) => (
    <>
      <circle cx="100" cy="70" r="48" fill={t.acc} fillOpacity=".13" stroke="none" />
      <rect x="56" y="40" width="88" height="60" rx="8" fill={t.paper} />
      <path d="M64 40 H136 A8 8 0 0 1 144 48 V54 H56 V48 A8 8 0 0 1 64 40 Z" fill={t.ink} />
      <circle cx="65" cy="47" r="2.2" fill={t.acc} />
      <circle cx="73" cy="47" r="2.2" fill={t.paper} />
      <circle cx="81" cy="47" r="2.2" fill={t.paper} fillOpacity=".55" />
      <path d="M66 66 L74 72 L66 78" stroke={t.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82 72 H102" stroke={t.ink} strokeWidth="3" strokeLinecap="round" />
      <rect x="110" y="66" width="10" height="13" rx="2" fill={t.acc} />
      <path d="M66 89 H120" stroke={t.ink} strokeWidth="2" strokeDasharray="4 4" strokeOpacity=".45" />
    </>
  ),
  /* 心理学：侧脸剪影,颅内一枚琥珀色的念头 */
  psych: (t) => (
    <>
      <path
        d="M126 118 V100 C140 92 146 78 142 62 C138 44 122 32 102 32 C82 32 66 46 64 64 C63 71 64 77 66 82 L58 94 L68 96 L70 104 C71 112 78 118 86 118 Z"
        fill={t.paper}
        fillOpacity=".45"
        stroke={t.ink}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="100" cy="62" r="12" fill={t.acc} />
      <path d="M100 46 V39 M112 51 L117 45 M88 51 L83 45" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
      <circle cx="100" cy="62" r="4" fill={t.ink} />
    </>
  ),
  /* 考试与进阶：同心靶心,一箭中的 */
  sat: (t) => (
    <>
      <circle cx="96" cy="68" r="34" stroke={t.ink} strokeWidth="2.6" />
      <circle cx="96" cy="68" r="23" stroke={t.ink} strokeWidth="2.2" />
      <circle cx="96" cy="68" r="12" fill={t.ink} />
      <circle cx="96" cy="68" r="4" fill={t.acc} />
      <path d="M146 26 L103 61" stroke={t.ink} strokeWidth="3" strokeLinecap="round" />
      <path d="M116 50 L104 61 L117 63" stroke={t.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M146 26 l9 -3 M146 26 l3 9" stroke={t.ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M50 118 H142" stroke={t.ink} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  /* 哲学：一个大问号——一切学问始于发问 */
  philo: (t) => (
    <>
      <path
        d="M92 46 C92 34 102 28 112 28 C124 28 132 36 132 46 C132 57 122 61 116 68 C112 73 111 78 111 84"
        stroke={t.ink}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="111" cy="101" r="6.5" fill={t.acc} />
      <path d="M62 44 V104 M158 44 V104" stroke={t.ink} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M84 116 H138" stroke={t.ink} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  /* 数学与统计：填满的钟形曲线,置信区间与均值虚线 */
  stats: (t) => (
    <>
      <path d="M44 114 C68 114 74 46 100 46 C126 46 132 114 156 114 Z" fill={t.ink} fillOpacity=".88" stroke="none" />
      <path d="M92 114 V62 C95 55 105 55 108 62 V114 Z" fill={t.acc} fillOpacity=".92" stroke="none" />
      <path d="M100 52 V114" stroke={t.paper} strokeWidth="1.6" strokeDasharray="3 4" />
      <path d="M40 114 H160" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
      <circle cx="100" cy="46" r="5" fill={t.acc} stroke={t.ink} strokeWidth="1.5" />
      <circle cx="66" cy="96" r="3" fill={t.paper} />
      <circle cx="134" cy="96" r="3" fill={t.paper} />
    </>
  ),
};

const CoverArt: React.FC<{ kind: CoverKind }> = ({ kind }) => {
  if (!Object.prototype.hasOwnProperty.call(plates, kind)) return null;
  const t = coverTheme[kind];
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 200 140" width="200" height="140" fill="none">
      {/* 藏书票签名:细内框 + 左上角琥珀菱标 + 右下短刻线,全套封面统一 */}
      <rect x="10" y="10" width="180" height="120" rx="8" stroke={t.ink} strokeOpacity=".3" strokeWidth="1.4" />
      <path d="M18 14 L22 18 L18 22 L14 18 Z" fill={t.acc} stroke="none" />
      <path d="M168 122 H178" stroke={t.ink} strokeWidth="1.6" strokeOpacity=".5" strokeLinecap="round" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {plates[kind](t)}
      </g>
    </svg>
  );
};

/** Course cover: hand-drawn art on a tinted (or gradient) ground. `flat` = no radius/shadow chrome of its own. */
export const CourseCover: React.FC<{ kind: CoverKind; flat?: boolean; style?: React.CSSProperties }> = ({ kind, flat, style }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      background: coverTheme[kind]?.bg,
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

/** Amber print swash behind hero words (marketplace). */
export const HighlightSwash: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ position: 'relative', display: 'inline-block', padding: '0 4px' }}>
    <svg aria-hidden="true" focusable="false"
      style={{ position: 'absolute', left: -6, right: -6, top: '52%', width: 'calc(100% + 12px)', height: '62%', zIndex: 0 }}
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
    >
      <path d="M2 12 Q 25 4 50 9 T 98 8 L 97 17 Q 60 20 30 17 T 2 15 Z" fill="#DCC48F" opacity="0.85" />
    </svg>
    <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
  </span>
);

/** Sage paper highlight for testimonial quotes. */
export const MintMark: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      background: 'linear-gradient(180deg, transparent 55%, #DCE5D5 55%, #DCE5D5 92%, transparent 92%)',
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
