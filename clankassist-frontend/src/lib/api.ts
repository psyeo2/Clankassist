import { getDefaultApiBaseUrl } from '@/lib/env'

type ApiEnvelope<T> = {
  status: number
  message: string
  data: T
}

type AuthKind = 'admin' | 'none'

type RequestOptions = {
  auth?: AuthKind
  body?: BodyInit | null
  headers?: HeadersInit
  method?: string
  parseAs?: 'blob' | 'json' | 'text'
  retryOnUnauthorized?: boolean
}

type StoredSession = {
  accessToken: string
  refreshToken: string
}

const SESSION_STORAGE_KEY = 'clankassist.session'

let refreshPromise: Promise<boolean> | null = null

export interface AuthState {
  isAuthenticated: boolean
  requiresPasswordSetup: boolean
}

export interface DashboardData {
  apiBaseUrl: string
  deviceCount: number
  approvedDeviceCount: number
  integrationCount: number
  publishedResourceCount: number
  publishedToolCount: number
  resourceCount: number
  toolCount: number
}

export interface AdminDeviceRecord {
  id: string
  device_key: string
  name: string
  status: 'approved' | 'pending' | 'rejected' | 'revoked'
  capabilities: unknown[]
  metadata: Record<string, unknown>
  last_seen_at: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface CreatedDeviceToken {
  token: {
    id: string
    device_id: string
    prefix: string
    name: string
    created_by: string
    status: string
    last_used_at: string | null
    revoked_at: string | null
    expires_at: string | null
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
  }
  bearer_token: string
}

export interface IntegrationRecord {
  id: string
  key: string
  display_name: string
  description: string
  transport: 'http'
  base_url_env_var: string
  auth_strategy: 'none' | 'bearer_env' | 'api_key_header_env' | 'api_key_query_env' | 'basic_env'
  auth_config: Record<string, unknown>
  default_headers: Record<string, unknown>
  allowed_hosts: unknown[]
  timeout_ms: number
  metadata: Record<string, unknown>
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface ToolRecord {
  id: string
  name: string
  integration_id: string
  integration_key: string
  integration_display_name: string
  current_published_version_id: string | null
  published_version_number: number | null
  enabled: boolean
  planner_visible: boolean
  created_at: string
  updated_at: string
}

export interface ToolVersionRecord {
  id: string
  tool_id: string
  version_number: number
  description: string
  input_schema: Record<string, unknown>
  result_schema: Record<string, unknown>
  execution_summary: string | null
  execution_mode: 'http'
  execution_spec: Record<string, unknown>
  metadata: Record<string, unknown>
  status: 'draft' | 'validated' | 'published' | 'archived'
  created_at: string
  updated_at: string
}

export interface ResourceRecord {
  id: string
  uri: string
  name: string
  mime_type: string | null
  description: string
  current_published_version_id: string | null
  published_version_number: number | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface ResourceVersionRecord {
  id: string
  resource_id: string
  version_number: number
  text_content: string | null
  load_mode: 'static' | 'http'
  load_spec: Record<string, unknown>
  metadata: Record<string, unknown>
  status: 'draft' | 'validated' | 'published' | 'archived'
  created_at: string
  updated_at: string
}

export interface DeviceRespondResult {
  audioUrl?: string
  contentType: string
  json?: unknown
  text?: string
}

const readApiBaseUrl = () => getDefaultApiBaseUrl()

const readSession = (): StoredSession | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (
      typeof parsed.accessToken === 'string' &&
      parsed.accessToken &&
      typeof parsed.refreshToken === 'string' &&
      parsed.refreshToken
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
      }
    }
  } catch {
    // ignore and clear below
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY)
  return null
}

const writeSession = (session: StoredSession) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

const clearSession = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

const joinApiUrl = (path: string) => {
  const base = readApiBaseUrl().replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

const extractErrorMessage = async (response: Response): Promise<string> => {
  const contentType = response.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as ApiEnvelope<Record<string, unknown> | null>
      return payload.message || 'Request failed.'
    }

    const text = await response.text()
    return text || 'Request failed.'
  } catch {
    return `Request failed with status ${response.status}.`
  }
}

const refreshAdminSession = async (): Promise<boolean> => {
  const session = readSession()
  if (!session?.refreshToken) {
    clearSession()
    return false
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(joinApiUrl('/api/v1/admin/refresh'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refresh_token: session.refreshToken,
          }),
        })

        if (!response.ok) {
          clearSession()
          return false
        }

        const payload = (await response.json()) as ApiEnvelope<{
          access_token: string
          refresh_token: string
        }>

        writeSession({
          accessToken: payload.data.access_token,
          refreshToken: payload.data.refresh_token,
        })

        return true
      } catch {
        clearSession()
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }

  return refreshPromise
}

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const session = readSession()
  const headers = new Headers(options.headers)

  if (options.auth === 'admin' && session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`)
  }

  const response = await fetch(joinApiUrl(path), {
    method: options.method ?? 'GET',
    headers,
    body: options.body,
  })

  if (response.status === 401 && options.auth === 'admin' && options.retryOnUnauthorized !== false) {
    const refreshed = await refreshAdminSession()
    if (refreshed) {
      return request<T>(path, {
        ...options,
        retryOnUnauthorized: false,
      })
    }
  }

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  const parseAs = options.parseAs ?? 'json'

  if (parseAs === 'blob') {
    return (await response.blob()) as T
  }

  if (parseAs === 'text') {
    return (await response.text()) as T
  }

  const payload = (await response.json()) as ApiEnvelope<T>
  return payload.data
}

export async function getAuthState(): Promise<AuthState> {
  const setup = await request<{ setup_completed_at: string | null; setup_required: boolean }>(
    '/api/v1/admin/setup/status',
    {
      auth: 'none',
    },
  )

  if (setup.setup_required) {
    clearSession()
    return {
      isAuthenticated: false,
      requiresPasswordSetup: true,
    }
  }

  const session = readSession()
  if (!session?.accessToken) {
    return {
      isAuthenticated: false,
      requiresPasswordSetup: false,
    }
  }

  try {
    await request<{ devices: AdminDeviceRecord[] }>('/api/v1/admin/devices', {
      auth: 'admin',
    })

    return {
      isAuthenticated: true,
      requiresPasswordSetup: false,
    }
  } catch {
    clearSession()
    return {
      isAuthenticated: false,
      requiresPasswordSetup: false,
    }
  }
}

export async function createPassword(password: string): Promise<AuthState> {
  const payload = await request<{
    access_token: string
    refresh_token: string
  }>('/api/v1/admin/setup', {
    auth: 'none',
    body: JSON.stringify({
      password,
      password_confirmation: password,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  writeSession({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  })

  return {
    isAuthenticated: true,
    requiresPasswordSetup: false,
  }
}

export async function loginWithPassword(password: string): Promise<AuthState> {
  const payload = await request<{
    access_token: string
    refresh_token: string
  }>('/api/v1/admin/login', {
    auth: 'none',
    body: JSON.stringify({
      password,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  writeSession({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  })

  return {
    isAuthenticated: true,
    requiresPasswordSetup: false,
  }
}

export async function logoutSession() {
  try {
    await request<null>('/api/v1/admin/logout', {
      auth: 'admin',
      method: 'POST',
    })
  } finally {
    clearSession()
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const [devicesPayload, integrationsPayload, toolsPayload, resourcesPayload] = await Promise.all([
    request<{ devices: AdminDeviceRecord[] }>('/api/v1/admin/devices', { auth: 'admin' }),
    request<{ integrations: IntegrationRecord[] }>('/api/v1/admin/integrations', { auth: 'admin' }),
    request<{ tools: ToolRecord[] }>('/api/v1/admin/tools', { auth: 'admin' }),
    request<{ resources: ResourceRecord[] }>('/api/v1/admin/resources', { auth: 'admin' }),
  ])

  return {
    apiBaseUrl: readApiBaseUrl(),
    deviceCount: devicesPayload.devices.length,
    approvedDeviceCount: devicesPayload.devices.filter((device) => device.status === 'approved').length,
    integrationCount: integrationsPayload.integrations.length,
    toolCount: toolsPayload.tools.length,
    publishedToolCount: toolsPayload.tools.filter((tool) => tool.published_version_number !== null).length,
    resourceCount: resourcesPayload.resources.length,
    publishedResourceCount: resourcesPayload.resources.filter(
      (resource) => resource.published_version_number !== null,
    ).length,
  }
}

export async function listDevices() {
  const payload = await request<{ devices: AdminDeviceRecord[] }>('/api/v1/admin/devices', {
    auth: 'admin',
  })

  return payload.devices
}

export async function createDevice(input: {
  capabilities?: string[]
  device_key: string
  metadata?: Record<string, unknown>
  name: string
  status?: 'approved' | 'pending' | 'rejected' | 'revoked'
}) {
  return request<AdminDeviceRecord>('/api/v1/admin/devices', {
    auth: 'admin',
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function issueDeviceToken(
  deviceId: string,
  input: {
    expires_at?: string
    metadata?: Record<string, unknown>
    name?: string
  } = {},
) {
  return request<CreatedDeviceToken>(`/api/v1/admin/devices/${deviceId}/tokens`, {
    auth: 'admin',
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function listIntegrations() {
  const payload = await request<{ integrations: IntegrationRecord[] }>('/api/v1/admin/integrations', {
    auth: 'admin',
  })

  return payload.integrations
}

export async function createIntegration(input: {
  allowed_hosts?: string[]
  auth_config?: Record<string, unknown>
  auth_strategy?: IntegrationRecord['auth_strategy']
  base_url_env_var: string
  default_headers?: Record<string, unknown>
  description?: string
  display_name: string
  enabled?: boolean
  key: string
  metadata?: Record<string, unknown>
  timeout_ms?: number
  transport?: 'http'
}) {
  return request<IntegrationRecord>('/api/v1/admin/integrations', {
    auth: 'admin',
    body: JSON.stringify({
      transport: 'http',
      ...input,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function listTools() {
  const payload = await request<{ tools: ToolRecord[] }>('/api/v1/admin/tools', {
    auth: 'admin',
  })

  return payload.tools
}

export async function createTool(input: {
  enabled?: boolean
  integration_id?: string
  integration_key?: string
  name: string
  planner_visible?: boolean
}) {
  return request<ToolRecord>('/api/v1/admin/tools', {
    auth: 'admin',
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function listToolVersions(toolId: string) {
  const payload = await request<{ versions: ToolVersionRecord[] }>(
    `/api/v1/admin/tools/${toolId}/versions`,
    {
      auth: 'admin',
    },
  )

  return payload.versions
}

export async function createToolVersion(
  toolId: string,
  input: {
    description: string
    execution_spec?: Record<string, unknown>
    execution_summary?: string | null
    input_schema?: Record<string, unknown>
    metadata?: Record<string, unknown>
    result_schema?: Record<string, unknown>
    status?: 'archived' | 'draft' | 'validated'
  },
) {
  return request<ToolVersionRecord>(`/api/v1/admin/tools/${toolId}/versions`, {
    auth: 'admin',
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function publishToolVersion(toolId: string, input: { note?: string; version_id?: string; version_number?: number }) {
  return request<{
    action: 'publish' | 'rollback'
    tool: ToolRecord
    version: ToolVersionRecord
  }>(`/api/v1/admin/tools/${toolId}/publish`, {
    auth: 'admin',
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function listResources() {
  const payload = await request<{ resources: ResourceRecord[] }>('/api/v1/admin/resources', {
    auth: 'admin',
  })

  return payload.resources
}

export async function createResource(input: {
  description?: string
  enabled?: boolean
  mime_type?: string | null
  name: string
  uri: string
}) {
  return request<ResourceRecord>('/api/v1/admin/resources', {
    auth: 'admin',
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function listResourceVersions(resourceId: string) {
  const payload = await request<{ versions: ResourceVersionRecord[] }>(
    `/api/v1/admin/resources/${resourceId}/versions`,
    {
      auth: 'admin',
    },
  )

  return payload.versions
}

export async function createResourceVersion(
  resourceId: string,
  input: {
    blob_content_base64?: string
    load_mode?: 'http' | 'static'
    load_spec?: Record<string, unknown>
    metadata?: Record<string, unknown>
    status?: 'archived' | 'draft' | 'validated'
    text_content?: string | null
  },
) {
  return request<ResourceVersionRecord>(`/api/v1/admin/resources/${resourceId}/versions`, {
    auth: 'admin',
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function publishResourceVersion(
  resourceId: string,
  input: { note?: string; version_id?: string; version_number?: number },
) {
  return request<{
    action: 'publish' | 'rollback'
    resource: ResourceRecord
    version: ResourceVersionRecord
  }>(`/api/v1/admin/resources/${resourceId}/publish`, {
    auth: 'admin',
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function callDeviceRespondText(input: {
  deviceToken: string
  output: 'audio' | 'json' | 'text'
  text: string
}): Promise<DeviceRespondResult> {
  const response = await fetch(joinApiUrl(`/api/v1/respond?output=${input.output}`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.deviceToken}`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: input.text,
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'

  if (contentType.includes('application/json')) {
    return {
      contentType,
      json: await response.json(),
    }
  }

  if (contentType.startsWith('text/')) {
    return {
      contentType,
      text: await response.text(),
    }
  }

  const blob = await response.blob()
  return {
    audioUrl: URL.createObjectURL(blob),
    contentType,
  }
}

export async function callDeviceRespondAudio(input: {
  deviceToken: string
  file: File
  output: 'audio' | 'json' | 'text'
}): Promise<DeviceRespondResult> {
  const formData = new FormData()
  formData.append('file', input.file, input.file.name)

  const response = await fetch(joinApiUrl(`/api/v1/respond?output=${input.output}`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.deviceToken}`,
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'

  if (contentType.includes('application/json')) {
    return {
      contentType,
      json: await response.json(),
    }
  }

  if (contentType.startsWith('text/')) {
    return {
      contentType,
      text: await response.text(),
    }
  }

  const blob = await response.blob()
  return {
    audioUrl: URL.createObjectURL(blob),
    contentType,
  }
}

export async function getApiBaseUrl() {
  return readApiBaseUrl()
}
