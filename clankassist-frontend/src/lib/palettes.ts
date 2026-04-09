export interface PaletteDefinition {
  colors: {
    accent: string
    background: string
    border: string
    muted: string
    primary: string
    secondary: string
    success: string
    surface: string
    surfaceStrong: string
    text: string
    warning: string
    danger: string
  }
  id: string
  name: string
}

export const palettes: PaletteDefinition[] = [
  {
    id: 'cyber-operator',
    name: 'Cyber Operator',
    colors: {
      background: '#0B0F14',
      surface: '#111827',
      surfaceStrong: '#172033',
      primary: '#3B82F6',
      secondary: '#8B5CF6',
      accent: '#22D3EE',
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      text: '#E5E7EB',
      muted: '#95A3B8',
      border: '#253046',
    },
  },
  {
    id: 'frost-minimal',
    name: 'Frost Minimal',
    colors: {
      background: '#F9FAFB',
      surface: '#FFFFFF',
      surfaceStrong: '#F1F5F9',
      primary: '#2563EB',
      secondary: '#7C3AED',
      accent: '#06B6D4',
      success: '#10B981',
      warning: '#D97706',
      danger: '#DC2626',
      text: '#111827',
      muted: '#6B7280',
      border: '#D1D5DB',
    },
  },
  {
    id: 'terminal-green',
    name: 'Terminal Green',
    colors: {
      background: '#050505',
      surface: '#0A0A0A',
      surfaceStrong: '#0F3D22',
      primary: '#22C55E',
      secondary: '#4ADE80',
      accent: '#86EFAC',
      success: '#22C55E',
      warning: '#EAB308',
      danger: '#DC2626',
      text: '#D1FAE5',
      muted: '#74C69D',
      border: '#14532D',
    },
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    colors: {
      background: '#0A0F1C',
      surface: '#121826',
      surfaceStrong: '#1E293B',
      primary: '#6366F1',
      secondary: '#A78BFA',
      accent: '#22D3EE',
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      text: '#E0E7FF',
      muted: '#94A3B8',
      border: '#2B3A67',
    },
  },
  {
    id: 'warm-industrial',
    name: 'Warm Industrial',
    colors: {
      background: '#121212',
      surface: '#1E1E1E',
      surfaceStrong: '#2A2A2A',
      primary: '#F97316',
      secondary: '#FACC15',
      accent: '#FB923C',
      success: '#22C55E',
      warning: '#FACC15',
      danger: '#DC2626',
      text: '#FAFAFA',
      muted: '#A3A3A3',
      border: '#525252',
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    colors: {
      background: '#0F172A',
      surface: '#1E293B',
      surfaceStrong: '#312E81',
      primary: '#EC4899',
      secondary: '#8B5CF6',
      accent: '#22D3EE',
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#F43F5E',
      text: '#F1F5F9',
      muted: '#F472B6',
      border: '#C026D3',
    },
  },
]

export const defaultPaletteId = 'deep-space'

export const paletteMap = Object.fromEntries(
  palettes.map((palette) => [palette.id, palette]),
) as Record<string, PaletteDefinition>
