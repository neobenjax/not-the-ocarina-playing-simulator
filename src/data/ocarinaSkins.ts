import { DEFAULT_OCARINA_THEME, OcarinaTheme } from '../components/OcarinaSvg';
import { HoleId, OCARINA_HOLES } from '../types';

export const OCARINA_SKINS: OcarinaTheme[] = [
  DEFAULT_OCARINA_THEME,
  {
    id: 'forest-whisper',
    name: 'Forest Whisper',
    description: 'Carved woodland timber with emerald leaf accents.',
    bodyPrimary: '#8d5524',
    bodySecondary: '#4a2910',
    bodyStroke: '#e0a96d',
    bandColor: '#27ae60',
    bandAccent: '#a3e635',
    emblemColor: '#fde047',
    holeRim: '#d9a066',
    holeFill: '#1f1005',
    glowColor: '#4ade80',
  },
  {
    id: 'midnight-carnival',
    name: 'Midnight Carnival',
    description: 'Mystic violet lacquer with crimson & gold accents.',
    bodyPrimary: '#6d28d9',
    bodySecondary: '#2e1065',
    bodyStroke: '#f43f5e',
    bandColor: '#f59e0b',
    bandAccent: '#ef4444',
    emblemColor: '#fde047',
    holeRim: '#f43f5e',
    holeFill: '#140529',
    glowColor: '#e879f9',
  },
  {
    id: 'cyber-rune',
    name: 'Cyber Rune',
    description: 'Obsidian slate etched with glowing cyan circuits.',
    bodyPrimary: '#1e293b',
    bodySecondary: '#090d16',
    bodyStroke: '#00d2ff',
    bandColor: '#334155',
    bandAccent: '#00d2ff',
    emblemColor: '#00d2ff',
    holeRim: '#00d2ff',
    holeFill: '#020617',
    glowColor: '#38bdf8',
  },
  {
    id: 'solar-gold',
    name: 'Solar Gold',
    description: 'Forged in radiant amber ceramic with sunburst trim.',
    bodyPrimary: '#eab308',
    bodySecondary: '#854d0e',
    bodyStroke: '#fef08a',
    bandColor: '#fffbeb',
    bandAccent: '#f59e0b',
    emblemColor: '#ffffff',
    holeRim: '#fef08a',
    holeFill: '#2b1803',
    glowColor: '#fde047',
  },
  {
    id: 'ocean-pearl',
    name: 'Ocean Pearl',
    description: 'Iridescent deep-sea teal with silver coral filigree.',
    bodyPrimary: '#0d9488',
    bodySecondary: '#115e59',
    bodyStroke: '#99f6e4',
    bandColor: '#e0f2fe',
    bandAccent: '#38bdf8',
    emblemColor: '#f2c94c',
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
    <radialGradient id="custom-body" cx="55%" cy="38%" r="65%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#0f172a" />
    </radialGradient>
  </defs>

  <!-- Mouthpiece -->
  <path d="M 382 44 C 386 32, 412 32, 416 44 L 434 114 L 364 114 Z"
        fill="url(#custom-body)" stroke="#93c5fd" stroke-width="2.2" />

  <!-- Main Transverse Body -->
  <path d="M 102 226 C 138 176, 232 132, 346 126 C 418 122, 492 142, 514 196 C 532 242, 494 286, 414 294 C 314 304, 182 284, 108 244 C 94 236, 94 232, 102 226 Z"
        fill="url(#custom-body)" stroke="#93c5fd" stroke-width="3" />

  <!-- Wind-Star Crest -->
  <g transform="translate(399, 111)">
    <polygon points="0,-11 3.5,-3.5 11,0 3.5,3.5 0,11 -3.5,3.5 -11,0 -3.5,-3.5" fill="#f2c94c" />
  </g>

  <!-- Interactive Holes (DO NOT remove data-hole attributes) -->
  <g class="ocarina-hole" data-hole="hole-a" role="button" tabindex="0" aria-label="A (D5)">
    <circle class="hole-core" cx="248" cy="222" r="24" fill="#081226" stroke="#2f80ed" stroke-width="4" />
    <text class="hole-note-label" x="248" y="226" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">A</text>
  </g>
  <g class="ocarina-hole" data-hole="hole-down" role="button" tabindex="0" aria-label="Down (F5)">
    <circle class="hole-core" cx="320" cy="242" r="22" fill="#081226" stroke="#f2c94c" stroke-width="4" />
    <text class="hole-note-label" x="320" y="246" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">▼</text>
  </g>
  <g class="ocarina-hole" data-hole="hole-right" role="button" tabindex="0" aria-label="Right (A5)">
    <circle class="hole-core" cx="396" cy="214" r="22" fill="#081226" stroke="#27ae60" stroke-width="4" />
    <text class="hole-note-label" x="396" y="218" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">▶</text>
  </g>
  <g class="ocarina-hole" data-hole="hole-left" role="button" tabindex="0" aria-label="Left (B5)">
    <circle class="hole-core" cx="312" cy="174" r="22" fill="#081226" stroke="#ff6b35" stroke-width="4" />
    <text class="hole-note-label" x="312" y="178" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">◀</text>
  </g>
  <g class="ocarina-hole" data-hole="hole-up" role="button" tabindex="0" aria-label="Up (D6)">
    <circle class="hole-core" cx="382" cy="152" r="21" fill="#081226" stroke="#e74c3c" stroke-width="4" />
    <text class="hole-note-label" x="382" y="156" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">▲</text>
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
