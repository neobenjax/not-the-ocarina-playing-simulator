import { DEFAULT_OCARINA_THEME, OcarinaTheme } from '../components/OcarinaSvg';
import { HoleId, OCARINA_HOLES } from '../types';

export const OCARINA_SKINS: OcarinaTheme[] = [
  DEFAULT_OCARINA_THEME,
  {
    id: 'kokiri-fairy',
    name: 'Fairy Ocarina',
    description: 'Carved Kokiri forest wood with emerald leaf accents.',
    bodyPrimary: '#8d5524',
    bodySecondary: '#4a2910',
    bodyStroke: '#e0a96d',
    bandColor: '#27ae60',
    bandAccent: '#a3e635',
    triforceColor: '#fde047',
    holeRim: '#d9a066',
    holeFill: '#1f1005',
    glowColor: '#4ade80',
  },
  {
    id: 'majoras-mask',
    name: "Majora's Mask",
    description: 'Mystic Termina violet lacquer with crimson & gold spikes.',
    bodyPrimary: '#6d28d9',
    bodySecondary: '#2e1065',
    bodyStroke: '#f43f5e',
    bandColor: '#f59e0b',
    bandAccent: '#ef4444',
    triforceColor: '#fde047',
    holeRim: '#f43f5e',
    holeFill: '#140529',
    glowColor: '#e879f9',
  },
  {
    id: 'sheikah-slate',
    name: 'Sheikah Tech',
    description: 'Ancient slate obsidian etched with glowing cyan runes.',
    bodyPrimary: '#1e293b',
    bodySecondary: '#090d16',
    bodyStroke: '#00d2ff',
    bandColor: '#334155',
    bandAccent: '#00d2ff',
    triforceColor: '#00d2ff',
    holeRim: '#00d2ff',
    holeFill: '#020617',
    glowColor: '#38bdf8',
  },
  {
    id: 'golden-triforce',
    name: 'Sacred Triforce',
    description: 'Forged in golden goddess light with radiant amber glow.',
    bodyPrimary: '#eab308',
    bodySecondary: '#854d0e',
    bodyStroke: '#fef08a',
    bandColor: '#fffbeb',
    bandAccent: '#f59e0b',
    triforceColor: '#ffffff',
    holeRim: '#fef08a',
    holeFill: '#2b1803',
    glowColor: '#fde047',
  },
  {
    id: 'zora-pearl',
    name: 'Zora Pearl',
    description: 'Iridescent Zora Domain teal with silver coral filigree.',
    bodyPrimary: '#0d9488',
    bodySecondary: '#115e59',
    bodyStroke: '#99f6e4',
    bandColor: '#e0f2fe',
    bandAccent: '#38bdf8',
    triforceColor: '#f2c94c',
    holeRim: '#99f6e4',
    holeFill: '#042f2e',
    glowColor: '#2dd4bf',
  },
];

export const OCARINA_SVG_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Custom Ocarina SVG Template
  Instructions:
  1. Keep viewBox="0 0 640 340" (or proportional) so it scales responsively.
  2. Keep the 5 elements with data-hole="hole-a", "hole-down", "hole-right", "hole-left", "hole-up".
  3. Customize colors, gradients, body shape, or add your own emblems/patterns!
  4. Avoid <script> tags (they are stripped for security).
-->
<svg class="ocarina-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 340">
  <defs>
    <radialGradient id="custom-body" cx="42%" cy="34%" r="68%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#0f172a" />
    </radialGradient>
  </defs>

  <!-- Mouthpiece -->
  <path d="M 102 204 L 188 184 L 204 236 L 114 252 C 102 254 94 242 94 228 C 94 214 96 206 102 204 Z"
        fill="url(#custom-body)" stroke="#93c5fd" stroke-width="2.5" />

  <!-- Main Body -->
  <path d="M 176 176 C 210 100, 320 68, 435 80 C 515 88, 566 130, 562 178 C 558 225, 498 264, 415 270 C 320 278, 224 264, 180 232 C 164 220, 166 196, 176 176 Z"
        fill="url(#custom-body)" stroke="#93c5fd" stroke-width="3" />

  <!-- Triforce Crest -->
  <g transform="translate(217, 190)">
    <polygon points="0,-16 -9,0 9,0" fill="#f2c94c" />
    <polygon points="-9,0 -18,16 0,16" fill="#f2c94c" />
    <polygon points="9,0 0,16 18,16" fill="#f2c94c" />
  </g>

  <!-- Interactive Holes (DO NOT remove data-hole attributes) -->
  <g class="ocarina-hole" data-hole="hole-a" role="button" tabindex="0" aria-label="A (D5)">
    <circle class="hole-core" cx="295" cy="200" r="24" fill="#081226" stroke="#2f80ed" stroke-width="4" />
    <text class="hole-note-label" x="295" y="204" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">A</text>
  </g>
  <g class="ocarina-hole" data-hole="hole-down" role="button" tabindex="0" aria-label="C-Down (F5)">
    <circle class="hole-core" cx="368" cy="222" r="22" fill="#081226" stroke="#f2c94c" stroke-width="4" />
    <text class="hole-note-label" x="368" y="226" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">C▼</text>
  </g>
  <g class="ocarina-hole" data-hole="hole-right" role="button" tabindex="0" aria-label="C-Right (A5)">
    <circle class="hole-core" cx="438" cy="186" r="22" fill="#081226" stroke="#27ae60" stroke-width="4" />
    <text class="hole-note-label" x="438" y="190" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">C▶</text>
  </g>
  <g class="ocarina-hole" data-hole="hole-left" role="button" tabindex="0" aria-label="C-Left (B5)">
    <circle class="hole-core" cx="356" cy="146" r="22" fill="#081226" stroke="#ff6b35" stroke-width="4" />
    <text class="hole-note-label" x="356" y="150" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">C◀</text>
  </g>
  <g class="ocarina-hole" data-hole="hole-up" role="button" tabindex="0" aria-label="C-Up (D6)">
    <circle class="hole-core" cx="422" cy="118" r="21" fill="#081226" stroke="#e74c3c" stroke-width="4" />
    <text class="hole-note-label" x="422" y="122" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">C▲</text>
  </g>
</svg>
`;

export interface SvgValidationResult {
  valid: boolean;
  sanitizedSvg?: string;
  error?: string;
}

export function sanitizeAndValidateCustomSvg(rawSvg: string): SvgValidationResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return { valid: false, error: 'Invalid SVG XML syntax. Please check your file.' };
  }

  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') {
    return { valid: false, error: 'Root element must be an <svg>.' };
  }

  // Strip scripts, foreignObject, and event handler attributes
  svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((el) => el.remove());
  svg.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on') || attr.value.toLowerCase().includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // Validate all 5 required data-hole attributes
  const missing: HoleId[] = [];
  for (const hole of OCARINA_HOLES) {
    if (!svg.querySelector(`[data-hole="${hole.id}"]`)) {
      missing.push(hole.id);
    }
  }
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required hole attributes: ${missing.join(', ')}. Keep all 5 data-hole attributes from the template.`,
    };
  }

  svg.classList.add('ocarina-svg');
  if (!svg.getAttribute('viewBox')) {
    svg.setAttribute('viewBox', '0 0 640 340');
  }

  const serializer = new XMLSerializer();
  return { valid: true, sanitizedSvg: serializer.serializeToString(svg) };
}
