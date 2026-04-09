export type ApiHealth = 'online' | 'degraded' | 'offline'
export type DeviceStatus = 'online' | 'idle' | 'offline' | 'warning'
export type McpStatus = 'ready' | 'draft' | 'error'
export type TransportType = 'stdio' | 'http' | 'ws'
export type ScopeType = 'local' | 'team' | 'sandbox'
export type InteractionTone = 'success' | 'warning' | 'error' | 'info'

export interface AuthState {
  isAuthenticated: boolean
  requiresPasswordSetup: boolean
}

export interface DeviceRecord {
  id: string
  name: string
  category: string
  status: DeviceStatus
  battery: number
  connection: string
  location: string
  notes: string
  lastSeen: string
}

export interface McpToolRecord {
  id: string
  name: string
  tool: string
  transport: TransportType
  scope: ScopeType
  status: McpStatus
  command: string
  endpoint: string
  notes: string
  lastEdited: string
}

export interface RecentInteraction {
  id: string
  title: string
  detail: string
  time: string
  tone: InteractionTone
}

export interface ApiSnapshot {
  status: ApiHealth
  latencyMs: number
  endpoint: string
  lastSync: string
}

export interface AppSettings {
  apiBaseUrl: string
  discoveryWindowSeconds: number
  allowRemoteMcp: boolean
  motionEnabled: boolean
}

export interface DashboardData {
  api: ApiSnapshot
  devices: DeviceRecord[]
  recentInteractions: RecentInteraction[]
  toolSummary: {
    ready: number
    draft: number
    error: number
  }
  tools: McpToolRecord[]
}

export interface McpWorkspace {
  templates: Array<{
    description: string
    endpointHint: string
    id: string
    label: string
    recommendedCommand: string
    transport: TransportType
  }>
  tools: McpToolRecord[]
}

export interface DeviceWorkspace {
  devices: DeviceRecord[]
  discoveryPool: DeviceRecord[]
}

interface PersistedState {
  api: ApiSnapshot
  devices: DeviceRecord[]
  discoveryPool: DeviceRecord[]
  password: string | null
  recentInteractions: RecentInteraction[]
  settings: AppSettings
  tools: McpToolRecord[]
}

const STORAGE_KEY = 'clankassist.mock.api'

const defaultState: PersistedState = {
  password: null,
  api: {
    status: 'online',
    latencyMs: 38,
    endpoint: 'http://localhost:6001',
    lastSync: '14 seconds ago',
  },
  devices: [
    {
      id: 'device-ember',
      name: 'Workshop Deck',
      category: 'Controller',
      status: 'online',
      battery: 91,
      connection: 'USB-C',
      location: 'Bench A',
      notes: 'Primary rig with recording profile loaded.',
      lastSeen: 'Live now',
    },
    {
      id: 'device-quill',
      name: 'Pocket Relay',
      category: 'Handheld',
      status: 'idle',
      battery: 64,
      connection: 'Wi-Fi',
      location: 'Field kit',
      notes: 'Ready for sync jobs and quick playback checks.',
      lastSeen: '3 min ago',
    },
    {
      id: 'device-torque',
      name: 'Stage Brick',
      category: 'Audio node',
      status: 'warning',
      battery: 27,
      connection: 'Bluetooth',
      location: 'Studio 2',
      notes: 'Battery trending low after last test cycle.',
      lastSeen: '1 min ago',
    },
  ],
  discoveryPool: [
    {
      id: 'device-lattice',
      name: 'Lattice Sensor',
      category: 'Sensor',
      status: 'online',
      battery: 88,
      connection: 'Wi-Fi',
      location: 'Loading bay',
      notes: 'Recently seen on the local mesh.',
      lastSeen: 'fresh signal',
    },
    {
      id: 'device-rivet',
      name: 'Rivet Beacon',
      category: 'Beacon',
      status: 'idle',
      battery: 72,
      connection: 'Bluetooth',
      location: 'Storage lane',
      notes: 'Broadcasting maintenance tags only.',
      lastSeen: 'queued for pairing',
    },
  ],
  tools: [
    {
      id: 'tool-local-shell',
      name: 'Local Shell Bridge',
      tool: 'Command Runner',
      transport: 'stdio',
      scope: 'local',
      status: 'ready',
      command: 'node ./mcp/shell-bridge.js',
      endpoint: '',
      notes: 'Runs local command macros and device scripts.',
      lastEdited: 'today, 09:14',
    },
    {
      id: 'tool-cloud-cache',
      name: 'Cloud Cache Probe',
      tool: 'HTTP Probe',
      transport: 'http',
      scope: 'team',
      status: 'draft',
      command: '',
      endpoint: 'https://cache.internal.local/mcp',
      notes: 'Used for remote cache inspection and warm-up checks.',
      lastEdited: 'today, 08:41',
    },
    {
      id: 'tool-telemetry',
      name: 'Telemetry Stream',
      tool: 'Event Stream',
      transport: 'ws',
      scope: 'sandbox',
      status: 'error',
      command: '',
      endpoint: 'wss://telemetry.internal/ws',
      notes: 'Socket auth token expired on last run.',
      lastEdited: 'yesterday, 18:52',
    },
  ],
  recentInteractions: [
    {
      id: 'interaction-1',
      title: 'Device sweep completed',
      detail: 'Three units responded, one new beacon identified.',
      time: '8 min ago',
      tone: 'success',
    },
    {
      id: 'interaction-2',
      title: 'HTTP probe degraded',
      detail: 'Cloud Cache Probe exceeded the expected latency budget.',
      time: '14 min ago',
      tone: 'warning',
    },
    {
      id: 'interaction-3',
      title: 'Playback macro archived',
      detail: 'Last operator session was preserved for review.',
      time: '36 min ago',
      tone: 'info',
    },
  ],
  settings: {
    apiBaseUrl: 'http://localhost:6001',
    discoveryWindowSeconds: 45,
    allowRemoteMcp: true,
    motionEnabled: true,
  },
}

const mcpTemplates: McpWorkspace['templates'] = [
  {
    id: 'command-runner',
    label: 'Command Runner',
    description: 'Wrap a local script or binary as an MCP tool.',
    recommendedCommand: 'node ./mcp/tool.js',
    endpointHint: '',
    transport: 'stdio',
  },
  {
    id: 'http-bridge',
    label: 'HTTP Bridge',
    description: 'Proxy a REST or RPC service through a single MCP endpoint.',
    recommendedCommand: '',
    endpointHint: 'https://service.internal/mcp',
    transport: 'http',
  },
  {
    id: 'event-stream',
    label: 'Event Stream',
    description: 'Attach to a live websocket for telemetry or control events.',
    recommendedCommand: '',
    endpointHint: 'wss://service.internal/ws',
    transport: 'ws',
  },
]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function delay<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(clone(value)), ms)
  })
}

function readState() {
  if (typeof window === 'undefined') {
    return clone(defaultState)
  }

  const rawState = window.localStorage.getItem(STORAGE_KEY)

  if (!rawState) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState))
    return clone(defaultState)
  }

  try {
    return {
      ...clone(defaultState),
      ...JSON.parse(rawState),
    } as PersistedState
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState))
    return clone(defaultState)
  }
}

function writeState(nextState: PersistedState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
}

function appendInteraction(state: PersistedState, interaction: Omit<RecentInteraction, 'id'>) {
  state.recentInteractions.unshift({
    id: createId('interaction'),
    ...interaction,
  })

  state.recentInteractions = state.recentInteractions.slice(0, 6)
}

export async function getAuthState(): Promise<AuthState> {
  const state = readState()

  return delay({
    isAuthenticated: false,
    requiresPasswordSetup: !state.password,
  }, 120)
}

export async function createPassword(password: string): Promise<AuthState> {
  if (password.trim().length < 4) {
    throw new Error('Use at least four characters for the shell password.')
  }

  const state = readState()

  if (state.password) {
    throw new Error('A password is already configured for this shell.')
  }

  state.password = password

  appendInteraction(state, {
    title: 'Password initialized',
    detail: 'Initial operator access was configured locally.',
    time: 'now',
    tone: 'success',
  })

  writeState(state)

  return delay({
    isAuthenticated: true,
    requiresPasswordSetup: false,
  }, 220)
}

export async function loginWithPassword(password: string): Promise<AuthState> {
  const state = readState()

  if (!state.password) {
    throw new Error('No password exists yet. Use the first-run setup flow.')
  }

  if (state.password !== password) {
    throw new Error('Incorrect password.')
  }

  appendInteraction(state, {
    title: 'Operator authenticated',
    detail: 'Access granted to the local command deck.',
    time: 'now',
    tone: 'success',
  })

  writeState(state)

  return delay({
    isAuthenticated: true,
    requiresPasswordSetup: false,
  }, 180)
}

export async function logoutSession() {
  return delay(true, 80)
}

export async function getDashboardData(): Promise<DashboardData> {
  const state = readState()

  return delay({
    api: state.api,
    devices: state.devices,
    recentInteractions: state.recentInteractions,
    tools: state.tools,
    toolSummary: {
      ready: state.tools.filter((tool) => tool.status === 'ready').length,
      draft: state.tools.filter((tool) => tool.status === 'draft').length,
      error: state.tools.filter((tool) => tool.status === 'error').length,
    },
  })
}

export async function getMcpWorkspace(): Promise<McpWorkspace> {
  const state = readState()

  return delay({
    templates: mcpTemplates,
    tools: state.tools,
  })
}

export async function createMcpTool(input: Omit<McpToolRecord, 'id' | 'lastEdited'>) {
  const state = readState()

  const newTool: McpToolRecord = {
    ...input,
    id: createId('tool'),
    lastEdited: 'now',
  }

  state.tools.unshift(newTool)
  appendInteraction(state, {
    title: `${newTool.name} created`,
    detail: `New ${newTool.transport.toUpperCase()} tool staged in ${newTool.scope} scope.`,
    time: 'now',
    tone: 'info',
  })
  writeState(state)

  return delay(newTool, 200)
}

export async function updateMcpTool(
  toolId: string,
  updates: Omit<McpToolRecord, 'id' | 'lastEdited'>,
) {
  const state = readState()
  const index = state.tools.findIndex((tool) => tool.id === toolId)

  if (index === -1) {
    throw new Error('That MCP tool no longer exists.')
  }

  const existingTool = state.tools[index]

  if (!existingTool) {
    throw new Error('That MCP tool no longer exists.')
  }

  const nextTool: McpToolRecord = {
    ...existingTool,
    ...updates,
    id: existingTool.id,
    lastEdited: 'just now',
  }

  state.tools[index] = nextTool

  appendInteraction(state, {
    title: `${nextTool.name} updated`,
    detail: `Configuration saved for the ${nextTool.tool} definition.`,
    time: 'now',
    tone: 'success',
  })
  writeState(state)

  return delay(nextTool, 200)
}

export async function getDeviceWorkspace(): Promise<DeviceWorkspace> {
  const state = readState()

  return delay({
    devices: state.devices,
    discoveryPool: state.discoveryPool,
  })
}

export async function discoverDevices() {
  const state = readState()

  if (state.discoveryPool.length > 0) {
    const discovered = state.discoveryPool[0]

    if (discovered) {
      state.devices.unshift(discovered)
      state.discoveryPool = state.discoveryPool.slice(1)

      appendInteraction(state, {
        title: `${discovered.name} paired`,
        detail: `${discovered.category} promoted from discovery queue into the active roster.`,
        time: 'now',
        tone: 'success',
      })
    }
  } else {
    appendInteraction(state, {
      title: 'Discovery sweep complete',
      detail: 'No additional devices responded during this pass.',
      time: 'now',
      tone: 'info',
    })
  }

  writeState(state)

  return delay({
    devices: state.devices,
    discoveryPool: state.discoveryPool,
  }, 260)
}

export async function updateDevice(
  deviceId: string,
  updates: Omit<DeviceRecord, 'id' | 'battery' | 'connection' | 'category' | 'lastSeen'>,
) {
  const state = readState()
  const index = state.devices.findIndex((device) => device.id === deviceId)

  if (index === -1) {
    throw new Error('That device no longer exists.')
  }

  const existingDevice = state.devices[index]

  if (!existingDevice) {
    throw new Error('That device no longer exists.')
  }

  const nextDevice: DeviceRecord = {
    ...existingDevice,
    ...updates,
    id: existingDevice.id,
    lastSeen: 'updated now',
  }

  state.devices[index] = nextDevice

  appendInteraction(state, {
    title: `${nextDevice.name} updated`,
    detail: 'Device metadata saved to the local workspace.',
    time: 'now',
    tone: 'info',
  })
  writeState(state)

  return delay(nextDevice, 180)
}

export async function getSettings() {
  const state = readState()

  return delay(state.settings, 120)
}

export async function saveSettings(settings: AppSettings) {
  const state = readState()

  state.settings = settings
  state.api.endpoint = settings.apiBaseUrl
  appendInteraction(state, {
    title: 'Settings saved',
    detail: `Shell configuration updated against ${settings.apiBaseUrl}.`,
    time: 'now',
    tone: 'success',
  })
  writeState(state)

  return delay(state.settings, 180)
}
