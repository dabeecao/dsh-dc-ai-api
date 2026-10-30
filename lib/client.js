// DC AI API — Client Settings & Dashboard UI
// Registers a dedicated settings section under Settings → DC AI API in DeepSeek Harness.
window.__ModuleLoader__.load({
  id: 'dsh-dc-ai-api',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useState, useEffect, useCallback, useMemo } = React
    const e = React.createElement

    // Design tokens matching DSH native theme variables
    const v = (name, fb) => `var(${name}, ${fb})`
    const T = {
      bg: v('--dsw-alias-bg-layer-1', 'rgba(128,128,128,0.06)'),
      bgCard: v('--dsw-alias-bg-layer-2', 'rgba(255,255,255,0.03)'),
      bgHover: v('--dsw-alias-interactive-bg-hover', 'rgba(128,128,128,0.1)'),
      border: v('--dsw-alias-border-l2', 'rgba(128,128,128,0.2)'),
      borderStrong: v('--dsw-alias-border-l3', 'rgba(128,128,128,0.38)'),
      danger: v('--dsw-static-red-500', '#ef4444'),
      dangerBg: 'rgba(239,68,68,0.12)',
      warning: '#f59e0b',
      warningBg: 'rgba(245,158,11,0.12)',
      success: v('--dsw-static-green-500', '#22c55e'),
      successBg: 'rgba(34,197,94,0.12)',
      accent: v('--dsw-alias-interactive-accent-default', '#3b82f6'),
      accentBg: 'rgba(59,130,246,0.12)',
      purple: '#a855f7',
      purpleBg: 'rgba(168,85,247,0.12)',
      cyan: '#06b6d4',
      cyanBg: 'rgba(6,182,212,0.12)',
      label: v('--dsw-alias-label-primary', 'inherit'),
      labelSec: v('--dsw-alias-label-secondary', 'rgba(128,128,128,0.7)'),
    }

    // ── SVG Icons ────────────────────────────────────────────────────────────
    function createSvgIcon(paths, viewBox = '0 0 24 24') {
      return (props) => {
        const size = props?.size || 15
        return e(
          'svg',
          {
            width: size,
            height: size,
            viewBox,
            fill: 'none',
            stroke: props?.color || 'currentColor',
            strokeWidth: props?.strokeWidth || 2,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            style: {
              display: 'inline-block',
              verticalAlign: 'middle',
              flexShrink: 0,
              ...(props?.style || {}),
            },
          },
          paths.map((p, i) => e(p.tag, { key: i, ...p.attrs })),
        )
      }
    }

    const Icons = {
      Refresh: createSvgIcon([
        { tag: 'path', attrs: { d: 'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' } },
        { tag: 'path', attrs: { d: 'M3 3v5h5' } },
        { tag: 'path', attrs: { d: 'M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16' } },
        { tag: 'path', attrs: { d: 'M16 21h5v-5' } },
      ]),
      Bolt: createSvgIcon([
        { tag: 'polygon', attrs: { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' } },
      ]),
      Chart: createSvgIcon([
        { tag: 'line', attrs: { x1: 18, y1: 20, x2: 18, y2: 10 } },
        { tag: 'line', attrs: { x1: 12, y1: 20, x2: 12, y2: 4 } },
        { tag: 'line', attrs: { x1: 6, y1: 20, x2: 6, y2: 14 } },
      ]),
      Cpu: createSvgIcon([
        { tag: 'rect', attrs: { x: 4, y: 4, width: 16, height: 16, rx: 2 } },
        { tag: 'rect', attrs: { x: 9, y: 9, width: 6, height: 6 } },
        { tag: 'path', attrs: { d: 'M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3' } },
      ]),
      Settings: createSvgIcon([
        { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3 } },
        {
          tag: 'path',
          attrs: {
            d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
          },
        },
      ]),
      User: createSvgIcon([
        { tag: 'path', attrs: { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' } },
        { tag: 'circle', attrs: { cx: 12, cy: 7, r: 4 } },
      ]),
      Key: createSvgIcon([
        { tag: 'path', attrs: { d: 'M21 2l-2 2m-1.5 1.5L16 4l-2 2 1.5 1.5M15 7l-9.5 9.5a3.5 3.5 0 1 0 5 5L20 12l2-2v-4h-4l-3 1' } },
      ]),
      Check: createSvgIcon([
        { tag: 'polyline', attrs: { points: '20 6 9 17 4 12' } },
      ]),
      Close: createSvgIcon([
        { tag: 'line', attrs: { x1: 18, y1: 6, x2: 6, y2: 18 } },
        { tag: 'line', attrs: { x1: 6, y1: 6, x2: 18, y2: 18 } },
      ]),
      Alert: createSvgIcon([
        { tag: 'circle', attrs: { cx: 12, cy: 12, r: 10 } },
        { tag: 'line', attrs: { x1: 12, y1: 8, x2: 12, y2: 12 } },
        { tag: 'line', attrs: { x1: 12, y1: 16, x2: 12.01, y2: 16 } },
      ]),
      Search: createSvgIcon([
        { tag: 'circle', attrs: { cx: 11, cy: 11, r: 8 } },
        { tag: 'line', attrs: { x1: 21, y1: 21, x2: 16.65, y2: 16.65 } },
      ]),
      Eye: createSvgIcon([
        { tag: 'path', attrs: { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' } },
        { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3 } },
      ]),
      EyeOff: createSvgIcon([
        {
          tag: 'path',
          attrs: {
            d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24',
          },
        },
        { tag: 'line', attrs: { x1: 1, y1: 1, x2: 23, y2: 23 } },
      ]),
      Sparkles: createSvgIcon([
        {
          tag: 'path',
          attrs: {
            d: 'm12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z',
          },
        },
      ]),
      EyeVision: createSvgIcon([
        { tag: 'path', attrs: { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' } },
        { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3 } },
      ]),
      Clock: createSvgIcon([
        { tag: 'circle', attrs: { cx: 12, cy: 12, r: 10 } },
        { tag: 'polyline', attrs: { points: '12 6 12 12 16 14' } },
      ]),
      Globe: createSvgIcon([
        { tag: 'circle', attrs: { cx: 12, cy: 12, r: 10 } },
        { tag: 'line', attrs: { x1: 2, y1: 12, x2: 22, y2: 12 } },
        { tag: 'path', attrs: { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' } },
      ]),
      CheckCircle: createSvgIcon([
        { tag: 'path', attrs: { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' } },
        { tag: 'polyline', attrs: { points: '22 4 12 14.01 9 11.01' } },
      ]),
    }

    // ── i18n Localization ────────────────────────────────────────────────────
    const L = {
      vi: {
        'plugin.title': 'DC AI Gateway',
        'plugin.subtitle': 'Cổng dịch vụ AI cao cấp — Tự động nhận diện hạn mức, suy luận (thinking) và thị giác (vision).',
        'status.online': 'Trực tuyến',
        'status.noKey': 'Chưa có key',
        'tab.billing': 'Hạn mức & Chi phí',
        'tab.models': 'Danh mục Mô hình',
        'tab.config': 'Kết nối & Khóa API',
        'btn.refresh': 'Làm mới',
        'btn.sync': 'Đồng bộ Models',
        'btn.save': 'Lưu cấu hình',
        'btn.saving': 'Đang lưu...',
        'btn.test': 'Kiểm tra kết nối',
        'btn.testing': 'Đang kiểm tra...',
        'btn.syncing': 'Đang đồng bộ...',
        'btn.refreshing': 'Đang tải...',
        'btn.retry': 'Thử lại',
        'btn.show': 'Hiện',
        'btn.hide': 'Ẩn',
        'billing.windowTitle': 'CHU KỲ 4 GIỜ HIỆN TẠI',
        'billing.resetIn': 'Reset sau {time}',
        'billing.available': 'khả dụng',
        'billing.used': 'Đã dùng',
        'billing.requests': 'Yêu cầu',
        'billing.windowTokens': 'Tokens phiên',
        'billing.resetAt': 'Reset lúc',
        'billing.dailyTitle': 'HẠN MỨC TRONG NGÀY',
        'billing.today': 'hôm nay',
        'billing.usageRate': 'Tỉ lệ dùng',
        'billing.todayTokens': 'Tokens hôm nay',
        'billing.dailyResetAt': 'Reset ngày',
        'billing.balanceTitle': 'SỐ DƯ & QUOTA',
        'billing.statusActive': 'Hoạt động tốt',
        'billing.spendable': 'khả dụng chi tiêu',
        'billing.plan': 'Gói cước',
        'billing.period': 'Cơ chế',
        'billing.hardLimit': 'Hard limit',
        'billing.softLimit': 'Soft limit',
        'billing.historyTitle': 'Lịch sử chu kỳ 4 giờ gần đây',
        'billing.historyCount': '{count} chu kỳ gần nhất',
        'billing.colWindow': 'Chu kỳ (Window)',
        'billing.colTime': 'Thời gian',
        'billing.colRequests': 'Yêu cầu (Requests)',
        'billing.colTokens': 'Tokens',
        'billing.colCost': 'Chi phí (USD)',
        'billing.currentBadge': 'Hiện tại',
        'billing.loading': 'Đang tải thông tin hạn mức...',
        'billing.errorTitle': 'Chưa thể tải dữ liệu hạn mức',
        'models.title': 'Danh mục Mô hình AI',
        'models.subtitle': 'Đã phân cấp mức độ suy luận chuẩn theo tài liệu của từng nhà cung cấp.',
        'models.filterAll': 'Tất cả ({count})',
        'models.filterThinking': 'Thinking ({count})',
        'models.filterVision': 'Vision ({count})',
        'models.searchPlaceholder': 'Tìm kiếm mô hình (DeepSeek, GPT, Gemini, Claude, Grok, Qwen, Agnes)...',
        'models.notFound': 'Không tìm thấy mô hình phù hợp.',
        'models.thinking3': 'Thinking (3 mức: Off/High/Max)',
        'models.thinking5': 'Thinking (5 mức: Off/Low/Med/High/Max)',
        'models.thinking4': 'Thinking (4 mức: Off/Low/Med/High)',
        'models.textOnly': 'Text-only',
        'models.vision': 'Vision',
        'models.tokensContext': 'tokens context',
        'models.maxOutput': 'max output',
        'config.title': 'Cấu hình Cổng Gateway & Khóa API',
        'config.baseURL': 'Địa chỉ Base URL Gateway:',
        'config.apiKey': 'Khóa API (DC_AI_API_KEY):',
        'config.keyStored': 'Đang lưu trữ ({masked})',
        'config.keyMissing': 'Chưa có khóa',
        'config.keyPlaceholder': 'Nhập dc_... tại đây',
        'config.keyChangePlaceholder': 'Nhập khóa mới nếu muốn thay đổi...',
        'config.protocolTitle': 'Giao thức API kết nối (Chỉ 1 Provider duy nhất):',
        'config.protoResponses': 'Responses API',
        'config.protoResponsesBadge': 'Khuyên dùng',
        'config.protoResponsesDesc': 'Chuẩn giao thức mới tối ưu vượt trội cho các mô hình suy luận sâu (reasoning / thinking models).',
        'config.protoCompletions': 'Chat Completions',
        'config.protoCompletionsBadge': 'Tiêu chuẩn',
        'config.protoCompletionsDesc': 'Chuẩn OpenAI /v1/chat/completions truyền thống, tương thích cao với mọi tool và streaming.',
        'msg.saveSuccess': 'Đã lưu cấu hình và đồng bộ nhà cung cấp thành công!',
        'msg.syncSuccess': 'Đã đồng bộ {count} mô hình từ gateway thành công!',
        'msg.refreshSuccess': 'Đã làm mới dữ liệu hạn mức và trạng thái thành công!',
        'test.success': 'Kết nối tốt ({latency}ms) — Tìm thấy {count} models',
        'test.fail': 'Lỗi: {error}',
        'common.loading': 'Đang kết nối DC AI Gateway...',
      },
      en: {
        'plugin.title': 'DC AI Gateway',
        'plugin.subtitle': 'High-performance AI Gateway — Automatic quota monitoring, reasoning (thinking), and vision detection.',
        'status.online': 'Online',
        'status.noKey': 'No API Key',
        'tab.billing': 'Quota & Billing',
        'tab.models': 'Model Catalog',
        'tab.config': 'Connection & API Key',
        'btn.refresh': 'Refresh',
        'btn.sync': 'Sync Models',
        'btn.save': 'Save Configuration',
        'btn.saving': 'Saving...',
        'btn.test': 'Test Connection',
        'btn.testing': 'Testing...',
        'btn.syncing': 'Syncing...',
        'btn.refreshing': 'Loading...',
        'btn.retry': 'Retry',
        'btn.show': 'Show',
        'btn.hide': 'Hide',
        'billing.windowTitle': 'CURRENT 4-HOUR WINDOW',
        'billing.resetIn': 'Resets in {time}',
        'billing.available': 'available',
        'billing.used': 'Used',
        'billing.requests': 'Requests',
        'billing.windowTokens': 'Window Tokens',
        'billing.resetAt': 'Resets at',
        'billing.dailyTitle': 'DAILY QUOTA',
        'billing.today': 'today',
        'billing.usageRate': 'Usage Rate',
        'billing.todayTokens': 'Today Tokens',
        'billing.dailyResetAt': 'Daily reset',
        'billing.balanceTitle': 'SPENDABLE BALANCE',
        'billing.statusActive': 'Active',
        'billing.spendable': 'spendable balance',
        'billing.plan': 'Plan',
        'billing.period': 'Period',
        'billing.hardLimit': 'Hard limit',
        'billing.softLimit': 'Soft limit',
        'billing.historyTitle': 'Recent 4-Hour Activity History',
        'billing.historyCount': '{count} recent windows',
        'billing.colWindow': 'Window',
        'billing.colTime': 'Time',
        'billing.colRequests': 'Requests',
        'billing.colTokens': 'Tokens',
        'billing.colCost': 'Cost (USD)',
        'billing.currentBadge': 'Current',
        'billing.loading': 'Loading quota and usage data...',
        'billing.errorTitle': 'Unable to load quota data',
        'models.title': 'AI Model Catalog',
        'models.subtitle': 'Reasoning levels are automatically configured per provider specification.',
        'models.filterAll': 'All ({count})',
        'models.filterThinking': 'Thinking ({count})',
        'models.filterVision': 'Vision ({count})',
        'models.searchPlaceholder': 'Search models (DeepSeek, GPT, Gemini, Claude, Grok, Qwen, Agnes)...',
        'models.notFound': 'No matching models found.',
        'models.thinking3': 'Thinking (3 levels: Off/High/Max)',
        'models.thinking5': 'Thinking (5 levels: Off/Low/Med/High/Max)',
        'models.thinking4': 'Thinking (4 levels: Off/Low/Med/High)',
        'models.textOnly': 'Text-only',
        'models.vision': 'Vision',
        'models.tokensContext': 'context tokens',
        'models.maxOutput': 'max output',
        'config.title': 'Gateway & API Key Configuration',
        'config.baseURL': 'Gateway Base URL:',
        'config.apiKey': 'API Key (DC_AI_API_KEY):',
        'config.keyStored': 'Key stored ({masked})',
        'config.keyMissing': 'No key configured',
        'config.keyPlaceholder': 'Enter dc_... here',
        'config.keyChangePlaceholder': 'Enter new key to change...',
        'config.protocolTitle': 'API Wire Protocol (Single Provider):',
        'config.protoResponses': 'Responses API',
        'config.protoResponsesBadge': 'Recommended',
        'config.protoResponsesDesc': 'Next-gen protocol optimized for deep reasoning and thinking models.',
        'config.protoCompletions': 'Chat Completions',
        'config.protoCompletionsBadge': 'Standard',
        'config.protoCompletionsDesc': 'Traditional OpenAI /v1/chat/completions, high compatibility with tools and streaming.',
        'msg.saveSuccess': 'Configuration saved and provider synced successfully!',
        'msg.syncSuccess': 'Successfully synced {count} models from gateway!',
        'msg.refreshSuccess': 'Successfully refreshed quota and status data!',
        'test.success': 'Connected successfully ({latency}ms) — Found {count} models',
        'test.fail': 'Error: {error}',
        'common.loading': 'Connecting to DC AI Gateway...',
      },
    }

    let ACTIVE_LANG = 'vi'
    try {
      const nav = typeof navigator !== 'undefined' && navigator.languages ? navigator.languages : (typeof navigator !== 'undefined' ? [navigator.language] : [])
      for (const tag of nav) {
        const primary = String(tag || '').toLowerCase().split('-')[0]
        if (primary === 'vi') { ACTIVE_LANG = 'vi'; break }
        if (primary === 'en') { ACTIVE_LANG = 'en'; break }
      }
    } catch { /* fallback to vi */ }

    // Helper for API calls
    async function apiCall(method, path, body) {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
      }
      if (body) opts.body = JSON.stringify(body)
      const res = await fetch(path, opts)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      return data
    }

    // Formatters
    function formatUSD(val) {
      if (typeof val !== 'number' || isNaN(val)) return '$0.00'
      return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: val < 1 && val > 0 ? 4 : 2 })
    }

    function formatTokens(count) {
      if (typeof count !== 'number' || isNaN(count)) return '0'
      if (count >= 1_000_000_000) return (count / 1_000_000_000).toFixed(2) + 'B'
      if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + 'M'
      if (count >= 1_000) return (count / 1_000).toFixed(1) + 'K'
      return count.toLocaleString()
    }

    function formatCountdown(seconds) {
      if (typeof seconds !== 'number' || seconds <= 0) return '0m'
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      if (h > 0) return `${h}h ${m}m`
      return `${m}m`
    }

    function formatDateTime(isoString) {
      if (!isoString) return '--'
      try {
        const d = new Date(isoString)
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
      } catch {
        return String(isoString)
      }
    }

    function DCAISettingsPage() {
      const [lang, setLang] = useState(ACTIVE_LANG)
      const [loading, setLoading] = useState(true)
      const [activeTab, setActiveTab] = useState('billing') // 'billing' | 'models' | 'config'

      // Local translation helper
      const t = useCallback((key, params) => {
        let text = L[lang]?.[key] ?? L.en?.[key] ?? key
        if (params) {
          for (const [k, val] of Object.entries(params)) {
            text = String(text).replace(new RegExp('\\{' + k + '\\}', 'g'), String(val))
          }
        }
        return text
      }, [lang])

      const [state, setState] = useState({
        baseURL: 'https://dc-ai.dabeecao.org',
        apiKeyConfigured: false,
        apiKeyMasked: '',
        api: 'openai-responses',
        displayName: 'DC AI',
        lastSyncAt: null,
        lastLive: false,
        modelsCount: 0,
        thinkingCount: 0,
        visionCount: 0,
        models: [],
      })

      const [billing, setBilling] = useState({
        loading: false,
        loaded: false,
        error: null,
        subscription: null,
        usage: null,
        fetchedAt: null,
      })

      // Form state
      const [apiKey, setApiKey] = useState('')
      const [showKey, setShowKey] = useState(false)
      const [baseURL, setBaseURL] = useState('https://dc-ai.dabeecao.org')
      const [apiProtocol, setApiProtocol] = useState('openai-responses')

      // Actions state
      const [saving, setSaving] = useState(false)
      const [testing, setTesting] = useState(false)
      const [syncing, setSyncing] = useState(false)
      const [refreshing, setRefreshing] = useState(false)
      const [notice, setNotice] = useState(null)
      const [error, setError] = useState(null)
      const [testResult, setTestResult] = useState(null)

      // Models search & filter
      const [search, setSearch] = useState('')
      const [modelFilter, setModelFilter] = useState('all') // 'all' | 'thinking' | 'vision'

      const fetchBillingData = useCallback(async () => {
        setBilling((prev) => ({ ...prev, loading: true, error: null }))
        try {
          const res = await apiCall('GET', '/dc-ai-api/billing')
          if (res && res.ok) {
            setBilling({
              loading: false,
              loaded: true,
              error: null,
              subscription: res.subscription && !res.subscription.error ? res.subscription : null,
              usage: res.usage && !res.usage.error ? res.usage : null,
              fetchedAt: res.fetchedAt,
            })
          } else {
            setBilling((prev) => ({
              ...prev,
              loading: false,
              loaded: true,
              error: res.error || t('billing.errorTitle'),
            }))
          }
        } catch (err) {
          setBilling((prev) => ({
            ...prev,
            loading: false,
            loaded: true,
            error: err.message,
          }))
        }
      }, [t])

      const refreshState = useCallback(async () => {
        try {
          const data = await apiCall('GET', '/dc-ai-api/state')
          if (data && data.ok) {
            setState(data)
            setBaseURL(data.baseURL || 'https://dc-ai.dabeecao.org')
            setApiProtocol(data.api || 'openai-responses')
          }
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        refreshState()
        fetchBillingData()
      }, [refreshState, fetchBillingData])

      const handleRefreshAll = async () => {
        setRefreshing(true)
        setNotice(null)
        setError(null)
        try {
          await Promise.all([refreshState(), fetchBillingData()])
          setNotice(t('msg.refreshSuccess'))
        } catch (err) {
          setError(err.message)
        } finally {
          setRefreshing(false)
        }
      }

      const handleSave = async () => {
        setSaving(true)
        setNotice(null)
        setError(null)
        try {
          const payload = {
            baseURL,
            api: apiProtocol,
          }
          if (apiKey.trim()) {
            payload.apiKey = apiKey.trim()
          }
          const res = await apiCall('POST', '/dc-ai-api/config', payload)
          if (res && res.ok) {
            setState(res)
            setApiKey('')
            setNotice(t('msg.saveSuccess'))
            fetchBillingData()
          } else {
            setError(res.error || 'Failed')
          }
        } catch (err) {
          setError(err.message)
        } finally {
          setSaving(false)
        }
      }

      const handleTest = async () => {
        setTesting(true)
        setTestResult(null)
        try {
          const res = await apiCall('POST', '/dc-ai-api/test', {
            baseURL,
            apiKey: apiKey.trim() || undefined,
          })
          setTestResult(res)
        } catch (err) {
          setTestResult({ ok: false, error: err.message })
        } finally {
          setTesting(false)
        }
      }

      const handleSync = async () => {
        setSyncing(true)
        setNotice(null)
        setError(null)
        try {
          const res = await apiCall('POST', '/dc-ai-api/sync', {})
          if (res && res.ok) {
            setState(res)
            setNotice(t('msg.syncSuccess', { count: res.modelsCount }))
          } else {
            setError(res.error || 'Sync failed')
          }
        } catch (err) {
          setError(err.message)
        } finally {
          setSyncing(false)
        }
      }

      const filteredModels = useMemo(() => {
        if (!state.models || state.models.length === 0) return []
        let list = state.models
        if (modelFilter === 'thinking') {
          list = list.filter((m) => !!m.thinking)
        } else if (modelFilter === 'vision') {
          list = list.filter((m) => m.input && m.input.includes('image'))
        }
        if (!search.trim()) return list
        const q = search.toLowerCase()
        return list.filter(
          (m) => m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q)),
        )
      }, [state.models, search, modelFilter])

      if (loading) {
        return e('div', { style: { padding: 48, textAlign: 'center', opacity: 0.7, fontSize: 14 } }, t('common.loading'))
      }

      // Reusable styles
      const cardStyle = {
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 18,
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }

      const buttonStyle = (primary = false) => ({
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 8,
        cursor: 'pointer',
        border: primary ? 'none' : `1px solid ${T.border}`,
        background: primary ? T.accent : T.bgHover,
        color: primary ? '#ffffff' : T.label,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        transition: 'all 0.15s ease',
      })

      const sub = billing.subscription
      const usage = billing.usage

      // Calculate usage metrics
      const windowRemainingUsd = sub?.window_limit?.remaining_usd ?? usage?.window_usage?.remaining_usd ?? sub?.remaining_spendable_usd ?? 0
      const windowLimitUsd = sub?.window_limit?.limit_usd ?? usage?.window_usage?.limit_usd ?? sub?.hard_limit_usd ?? 41.67
      const windowUsedUsd = usage?.window_usage?.used_usd ?? sub?.window_limit?.used_usd ?? (usage?.total_usage ? usage.total_usage / 100 : 0)
      const windowPercent = Math.min(100, Math.max(0, (windowUsedUsd / (windowLimitUsd || 1)) * 100))
      const windowResetSeconds = sub?.window_limit?.reset_in_seconds ?? usage?.window_usage?.reset_in_seconds ?? sub?.quota_reset_in_seconds ?? 0

      const dailyUsedUsd = sub?.used_today_usd ?? usage?.used_today_usd ?? 0
      const dailyLimitUsd = sub?.daily_limit_usd ?? usage?.daily_limit_usd ?? 200
      const dailyRemainingUsd = sub?.remaining_today_usd ?? Math.max(0, dailyLimitUsd - dailyUsedUsd)
      const dailyPercent = Math.min(100, Math.max(0, (dailyUsedUsd / (dailyLimitUsd || 1)) * 100))
      const dailyResetSeconds = sub?.daily_reset_in_seconds ?? usage?.daily_reset_in_seconds ?? 0

      const remainingSpendableUsd = sub?.remaining_spendable_usd ?? usage?.remaining_spendable_usd ?? windowRemainingUsd

      return e(
        'div',
        { style: { padding: '24px 32px', maxWidth: 960, margin: '0 auto', fontFamily: 'inherit' } },

        // Top Modern Header
        e(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 16,
            },
          },
          e(
            'div',
            null,
            e(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
              e('h2', { style: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' } }, t('plugin.title')),
              e(
                'span',
                {
                  style: {
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: 12,
                    background: state.apiKeyConfigured ? T.successBg : T.warningBg,
                    color: state.apiKeyConfigured ? T.success : T.warning,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  },
                },
                e('span', {
                  style: {
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: state.apiKeyConfigured ? T.success : T.warning,
                  },
                }),
                state.apiKeyConfigured ? t('status.online') : t('status.noKey'),
              ),
              sub?.account_name &&
                e(
                  'span',
                  {
                    style: {
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 9px',
                      borderRadius: 12,
                      background: T.bgHover,
                      color: T.labelSec,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    },
                  },
                  e(Icons.User, { size: 12, color: T.labelSec }),
                  sub.account_name,
                ),
              sub?.plan?.title &&
                e(
                  'span',
                  {
                    style: {
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 9px',
                      borderRadius: 12,
                      background: T.purpleBg,
                      color: T.purple,
                    },
                  },
                  sub.plan.title,
                ),
            ),
            e(
              'p',
              { style: { margin: '6px 0 0', fontSize: 13, color: T.labelSec } },
              t('plugin.subtitle'),
            ),
          ),

          // Header action buttons + Language Selector
          e(
            'div',
            { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            // Language selector button
            e(
              'div',
              {
                style: {
                  display: 'flex',
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: T.bgHover,
                },
              },
              e(
                'button',
                {
                  type: 'button',
                  style: {
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: lang === 'vi' ? T.accent : 'transparent',
                    color: lang === 'vi' ? '#ffffff' : T.labelSec,
                    transition: 'all 0.15s ease',
                  },
                  onClick: () => setLang('vi'),
                },
                'VI',
              ),
              e(
                'button',
                {
                  type: 'button',
                  style: {
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: lang === 'en' ? T.accent : 'transparent',
                    color: lang === 'en' ? '#ffffff' : T.labelSec,
                    transition: 'all 0.15s ease',
                  },
                  onClick: () => setLang('en'),
                },
                'EN',
              ),
            ),
            e(
              'button',
              {
                style: buttonStyle(false),
                onClick: handleRefreshAll,
                disabled: refreshing,
              },
              e(Icons.Refresh, { size: 14 }),
              refreshing ? t('btn.refreshing') : t('btn.refresh'),
            ),
            e(
              'button',
              {
                style: buttonStyle(true),
                onClick: handleSync,
                disabled: syncing,
              },
              e(Icons.Bolt, { size: 14 }),
              syncing ? t('btn.syncing') : t('btn.sync'),
            ),
          ),
        ),

        // Notifications
        notice &&
          e(
            'div',
            {
              style: {
                padding: '10px 16px',
                background: T.successBg,
                border: `1px solid ${T.success}`,
                borderRadius: 8,
                color: T.success,
                fontSize: 13,
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              },
            },
            e(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              e(Icons.CheckCircle, { size: 16, color: T.success }),
              e('span', null, notice),
            ),
            e(
              'button',
              {
                style: { background: 'none', border: 'none', color: T.success, cursor: 'pointer', display: 'flex', alignItems: 'center' },
                onClick: () => setNotice(null),
              },
              e(Icons.Close, { size: 14 }),
            ),
          ),

        error &&
          e(
            'div',
            {
              style: {
                padding: '10px 16px',
                background: T.dangerBg,
                border: `1px solid ${T.danger}`,
                borderRadius: 8,
                color: T.danger,
                fontSize: 13,
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              },
            },
            e(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              e(Icons.Alert, { size: 16, color: T.danger }),
              e('span', null, error),
            ),
            e(
              'button',
              {
                style: { background: 'none', border: 'none', color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center' },
                onClick: () => setError(null),
              },
              e(Icons.Close, { size: 14 }),
            ),
          ),

        // Modern Tab Bar
        e(
          'div',
          {
            style: {
              display: 'flex',
              gap: 8,
              borderBottom: `1px solid ${T.border}`,
              marginBottom: 20,
              paddingBottom: 2,
            },
          },
          [
            { id: 'billing', label: t('tab.billing'), icon: Icons.Chart },
            { id: 'models', label: `${t('tab.models')} (${state.modelsCount})`, icon: Icons.Cpu },
            { id: 'config', label: t('tab.config'), icon: Icons.Settings },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return e(
              'button',
              {
                key: tab.id,
                style: {
                  padding: '10px 18px',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? T.accent : T.labelSec,
                  background: isActive ? T.accentBg : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
                  borderRadius: '6px 6px 0 0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                },
                onClick: () => setActiveTab(tab.id),
              },
              e(tab.icon, { size: 15, color: isActive ? T.accent : T.labelSec }),
              tab.label,
            )
          }),
        ),

        // ================= TAB 1: BILLING & USAGE =================
        activeTab === 'billing' &&
          e(
            'div',
            null,
            billing.loading && !billing.loaded
              ? e('div', { style: { padding: 40, textAlign: 'center', opacity: 0.7 } }, t('billing.loading'))
              : billing.error
              ? e(
                  'div',
                  { style: { ...cardStyle, textAlign: 'center', padding: 32 } },
                  e('div', { style: { fontSize: 16, fontWeight: 600, color: T.warning, marginBottom: 8 } }, t('billing.errorTitle')),
                  e('div', { style: { fontSize: 13, color: T.labelSec, marginBottom: 16 } }, billing.error),
                  e('button', { style: buttonStyle(false), onClick: fetchBillingData }, e(Icons.Refresh, { size: 14 }), t('btn.retry')),
                )
              : e(
                  'div',
                  null,

                  // 3 Hero Metric Cards
                  e(
                    'div',
                    {
                      style: {
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: 16,
                        marginBottom: 20,
                      },
                    },

                    // Hero 1: Window Limit (4-Hour)
                    e(
                      'div',
                      { style: cardStyle },
                      e(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                        e('span', { style: { fontSize: 12, fontWeight: 600, color: T.accent, letterSpacing: '0.04em' } }, t('billing.windowTitle')),
                        e(
                          'span',
                          {
                            style: {
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: T.bgHover,
                              color: T.labelSec,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            },
                          },
                          e(Icons.Clock, { size: 11 }),
                          t('billing.resetIn', { time: formatCountdown(windowResetSeconds) }),
                        ),
                      ),
                      e(
                        'div',
                        { style: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 } },
                        e('span', { style: { fontSize: 26, fontWeight: 700 } }, formatUSD(windowRemainingUsd)),
                        e('span', { style: { fontSize: 13, color: T.labelSec } }, '/ ' + formatUSD(windowLimitUsd) + ' ' + t('billing.available')),
                      ),

                      // Progress Bar
                      e(
                        'div',
                        {
                          style: {
                            height: 6,
                            background: T.bgHover,
                            borderRadius: 3,
                            overflow: 'hidden',
                            marginBottom: 12,
                          },
                        },
                        e('div', {
                          style: {
                            width: `${windowPercent}%`,
                            height: '100%',
                            background: windowPercent > 90 ? T.danger : windowPercent > 70 ? T.warning : T.accent,
                            borderRadius: 3,
                            transition: 'width 0.4s ease',
                          },
                        }),
                      ),

                      // Sub-stats
                      e(
                        'div',
                        { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: T.labelSec } },
                        e('div', null, t('billing.used') + ': ', e('strong', { style: { color: T.label } }, formatUSD(windowUsedUsd))),
                        e('div', null, t('billing.requests') + ': ', e('strong', { style: { color: T.label } }, (sub?.window_limit?.total_requests ?? usage?.window_usage?.total_requests ?? 0) + ' reqs')),
                        e('div', null, t('billing.windowTokens') + ': ', e('strong', { style: { color: T.label } }, formatTokens(sub?.window_limit?.tokens ?? usage?.window_usage?.tokens ?? 0))),
                        e('div', null, t('billing.resetAt') + ': ', e('strong', { style: { color: T.label } }, formatDateTime(sub?.window_limit?.resets_at ?? usage?.window_usage?.resets_at))),
                      ),
                    ),

                    // Hero 2: Daily Quota
                    e(
                      'div',
                      { style: cardStyle },
                      e(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                        e('span', { style: { fontSize: 12, fontWeight: 600, color: T.purple, letterSpacing: '0.04em' } }, t('billing.dailyTitle')),
                        e(
                          'span',
                          {
                            style: {
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: T.bgHover,
                              color: T.labelSec,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            },
                          },
                          e(Icons.Clock, { size: 11 }),
                          t('billing.resetIn', { time: formatCountdown(dailyResetSeconds) }),
                        ),
                      ),
                      e(
                        'div',
                        { style: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 } },
                        e('span', { style: { fontSize: 26, fontWeight: 700 } }, formatUSD(dailyRemainingUsd)),
                        e('span', { style: { fontSize: 13, color: T.labelSec } }, '/ ' + formatUSD(dailyLimitUsd) + ' ' + t('billing.today')),
                      ),

                      // Progress Bar
                      e(
                        'div',
                        {
                          style: {
                            height: 6,
                            background: T.bgHover,
                            borderRadius: 3,
                            overflow: 'hidden',
                            marginBottom: 12,
                          },
                        },
                        e('div', {
                          style: {
                            width: `${dailyPercent}%`,
                            height: '100%',
                            background: dailyPercent > 90 ? T.danger : dailyPercent > 70 ? T.warning : T.purple,
                            borderRadius: 3,
                            transition: 'width 0.4s ease',
                          },
                        }),
                      ),

                      // Sub-stats
                      e(
                        'div',
                        { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: T.labelSec } },
                        e('div', null, t('billing.used') + ': ', e('strong', { style: { color: T.label } }, formatUSD(dailyUsedUsd))),
                        e('div', null, t('billing.usageRate') + ': ', e('strong', { style: { color: T.label } }, dailyPercent.toFixed(1) + '%')),
                        e('div', null, t('billing.todayTokens') + ': ', e('strong', { style: { color: T.label } }, formatTokens(usage?.used_today_tokens ?? 0))),
                        e('div', null, t('billing.dailyResetAt') + ': ', e('strong', { style: { color: T.label } }, formatDateTime(sub?.daily_resets_at ?? usage?.daily_resets_at))),
                      ),
                    ),

                    // Hero 3: Spendable Balance & Plan
                    e(
                      'div',
                      { style: cardStyle },
                      e(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                        e('span', { style: { fontSize: 12, fontWeight: 600, color: T.cyan, letterSpacing: '0.04em' } }, t('billing.balanceTitle')),
                        e(
                          'span',
                          {
                            style: {
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: T.successBg,
                              color: T.success,
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            },
                          },
                          e(Icons.Check, { size: 12, color: T.success }),
                          t('billing.statusActive'),
                        ),
                      ),
                      e(
                        'div',
                        { style: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 } },
                        e('span', { style: { fontSize: 26, fontWeight: 700 } }, formatUSD(remainingSpendableUsd)),
                        e('span', { style: { fontSize: 13, color: T.labelSec } }, t('billing.spendable')),
                      ),

                      // Info divider
                      e('div', { style: { height: 1, background: T.border, marginBottom: 12 } }),

                      // Sub-stats
                      e(
                        'div',
                        { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: T.labelSec } },
                        e('div', null, t('billing.plan') + ': ', e('strong', { style: { color: T.label } }, sub?.plan?.title || 'Pay-as-you-go')),
                        e('div', null, t('billing.period') + ': ', e('strong', { style: { color: T.label } }, (sub?.quota_period || 'window') + ' (4h)')),
                        e('div', null, t('billing.hardLimit') + ': ', e('strong', { style: { color: T.label } }, formatUSD(sub?.hard_limit_usd))),
                        e('div', null, t('billing.softLimit') + ': ', e('strong', { style: { color: T.label } }, formatUSD(sub?.soft_limit_usd))),
                      ),
                    ),
                  ),

                  // Recent Windows Activity Table
                  usage?.window_costs && usage.window_costs.length > 0
                    ? e(
                        'div',
                        { style: cardStyle },
                        e(
                          'div',
                          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 } },
                          e('h3', { style: { margin: 0, fontSize: 15, fontWeight: 650 } }, t('billing.historyTitle')),
                          e('span', { style: { fontSize: 12, color: T.labelSec } }, t('billing.historyCount', { count: usage.window_costs.length })),
                        ),

                        e(
                          'div',
                          { style: { overflowX: 'auto' } },
                          e(
                            'table',
                            { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' } },
                            e(
                              'thead',
                              null,
                              e(
                                'tr',
                                { style: { borderBottom: `1px solid ${T.border}`, color: T.labelSec, fontSize: 12 } },
                                e('th', { style: { padding: '8px 12px' } }, t('billing.colWindow')),
                                e('th', { style: { padding: '8px 12px' } }, t('billing.colTime')),
                                e('th', { style: { padding: '8px 12px', textAlign: 'right' } }, t('billing.colRequests')),
                                e('th', { style: { padding: '8px 12px', textAlign: 'right' } }, t('billing.colTokens')),
                                e('th', { style: { padding: '8px 12px', textAlign: 'right' } }, t('billing.colCost')),
                              ),
                            ),
                            e(
                              'tbody',
                              null,
                              usage.window_costs.map((w, idx) => {
                                const costUsd = typeof w.cost === 'number' ? w.cost / 100 : 0
                                const isCurrent = idx === usage.window_costs.length - 1
                                return e(
                                  'tr',
                                  {
                                    key: w.window_id || idx,
                                    style: {
                                      borderBottom: idx < usage.window_costs.length - 1 ? `1px solid ${T.border}` : 'none',
                                      background: isCurrent ? T.accentBg : 'transparent',
                                    },
                                  },
                                  e(
                                    'td',
                                    { style: { padding: '10px 12px', fontWeight: 600 } },
                                    w.window_id || `#${idx + 1}`,
                                    isCurrent &&
                                      e(
                                        'span',
                                        {
                                          style: {
                                            fontSize: 10,
                                            color: T.accent,
                                            marginLeft: 6,
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            background: T.bgHover,
                                          },
                                        },
                                        t('billing.currentBadge'),
                                      ),
                                  ),
                                  e('td', { style: { padding: '10px 12px', color: T.labelSec } }, `${formatDateTime(w.starts_at)} → ${formatDateTime(w.ends_at)}`),
                                  e('td', { style: { padding: '10px 12px', textAlign: 'right' } }, w.requests ?? 0),
                                  e('td', { style: { padding: '10px 12px', textAlign: 'right', fontWeight: 500 } }, formatTokens(w.tokens ?? 0)),
                                  e(
                                    'td',
                                    { style: { padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: costUsd > 10 ? T.danger : costUsd > 1 ? T.warning : T.label } },
                                    formatUSD(costUsd),
                                  ),
                                )
                              }),
                            ),
                          ),
                        ),
                      )
                    : null,
                ),
          ),

        // ================= TAB 2: MODELS CATALOG =================
        activeTab === 'models' &&
          e(
            'div',
            { style: cardStyle },
            e(
              'div',
              {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 12,
                },
              },
              e(
                'div',
                null,
                e('h3', { style: { margin: 0, fontSize: 16, fontWeight: 650 } }, t('models.title')),
                e('div', { style: { fontSize: 12, color: T.labelSec, marginTop: 2 } }, t('models.subtitle')),
              ),

              // Filter pills
              e(
                'div',
                { style: { display: 'flex', gap: 6 } },
                [
                  { id: 'all', label: t('models.filterAll', { count: state.modelsCount }) },
                  { id: 'thinking', label: t('models.filterThinking', { count: state.thinkingCount }) },
                  { id: 'vision', label: t('models.filterVision', { count: state.visionCount }) },
                ].map((f) => {
                  const isSel = modelFilter === f.id
                  return e(
                    'button',
                    {
                      key: f.id,
                      style: {
                        padding: '5px 12px',
                        fontSize: 12,
                        borderRadius: 6,
                        border: isSel ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                        background: isSel ? T.accentBg : 'transparent',
                        color: isSel ? T.accent : T.labelSec,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      },
                      onClick: () => setModelFilter(f.id),
                    },
                    f.label,
                  )
                }),
              ),
            ),

            // Search bar
            e(
              'div',
              { style: { marginBottom: 14, position: 'relative' } },
              e('input', {
                style: {
                  width: '100%',
                  padding: '9px 14px 9px 34px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: 'transparent',
                  color: T.label,
                  outline: 'none',
                  boxSizing: 'border-box',
                },
                value: search,
                onChange: (ev) => setSearch(ev.target.value),
                placeholder: t('models.searchPlaceholder'),
              }),
              e(
                'div',
                { style: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' } },
                e(Icons.Search, { size: 15 }),
              ),
            ),

            // Models list grid
            e(
              'div',
              {
                style: {
                  maxHeight: 460,
                  overflowY: 'auto',
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                },
              },
              filteredModels.length === 0
                ? e('div', { style: { padding: 32, textAlign: 'center', opacity: 0.6, fontSize: 13 } }, t('models.notFound'))
                : filteredModels.map((m, idx) => {
                    const isVision = m.input && m.input.includes('image')
                    const isThinking = !!m.thinking
                    const isDeepSeek = m.id.includes('deepseek') || m.id.startsWith('r1')
                    const isGPT = m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3')
                    const isGemini = m.id.includes('gemini')
                    const isClaude = m.id.includes('claude')

                    let thinkingBadgeLabel = t('models.filterThinking', { count: '' }).trim()
                    if (isThinking) {
                      if (isDeepSeek) thinkingBadgeLabel = t('models.thinking3')
                      else if (isGPT || isGemini || isClaude) thinkingBadgeLabel = t('models.thinking5')
                      else thinkingBadgeLabel = t('models.thinking4')
                    }

                    return e(
                      'div',
                      {
                        key: m.id || idx,
                        style: {
                          padding: '12px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderBottom: idx < filteredModels.length - 1 ? `1px solid ${T.border}` : 'none',
                          background: idx % 2 === 0 ? 'transparent' : T.bg,
                          gap: 12,
                        },
                      },
                      e(
                        'div',
                        { style: { flex: 1, minWidth: 0 } },
                        e('div', { style: { fontSize: 14, fontWeight: 600, color: T.label } }, m.name || m.id),
                        e(
                          'div',
                          { style: { fontSize: 12, color: T.labelSec, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' } },
                          e('span', { style: { fontFamily: 'monospace', opacity: 0.85 } }, m.id),
                          e('span', null, '•'),
                          e('span', null, (m.contextWindow ? m.contextWindow.toLocaleString() : '262,144') + ' ' + t('models.tokensContext')),
                          m.maxTokens && e('span', null, '• ' + m.maxTokens.toLocaleString() + ' ' + t('models.maxOutput')),
                        ),
                      ),
                      e(
                        'div',
                        { style: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 } },
                        isThinking &&
                          e(
                            'span',
                            {
                              style: {
                                fontSize: 11,
                                color: T.purple,
                                background: T.purpleBg,
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              },
                            },
                            e(Icons.Sparkles, { size: 12, color: T.purple }),
                            thinkingBadgeLabel,
                          ),
                        isVision
                          ? e(
                              'span',
                              {
                                style: {
                                  fontSize: 11,
                                  color: T.cyan,
                                  background: T.cyanBg,
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontWeight: 500,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                },
                              },
                              e(Icons.EyeVision, { size: 12, color: T.cyan }),
                              t('models.vision'),
                            )
                          : e(
                              'span',
                              {
                                style: {
                                  fontSize: 11,
                                  color: T.labelSec,
                                  background: T.bgHover,
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                },
                              },
                              t('models.textOnly'),
                            ),
                      ),
                    )
                  }),
            ),
          ),

        // ================= TAB 3: GATEWAY & AUTH SETTINGS =================
        activeTab === 'config' &&
          e(
            'div',
            { style: cardStyle },
            e('h3', { style: { margin: '0 0 16px', fontSize: 16, fontWeight: 650 } }, t('config.title')),

            // Base URL
            e(
              'div',
              { style: { marginBottom: 16 } },
              e('label', { style: { fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' } }, t('config.baseURL')),
              e(
                'div',
                { style: { position: 'relative' } },
                e('input', {
                  style: {
                    width: '100%',
                    padding: '9px 12px 9px 34px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: `1px solid ${T.border}`,
                    background: 'transparent',
                    color: T.label,
                    outline: 'none',
                    boxSizing: 'border-box',
                  },
                  value: baseURL,
                  onChange: (ev) => setBaseURL(ev.target.value),
                  placeholder: 'https://dc-ai.dabeecao.org',
                }),
                e(
                  'div',
                  { style: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' } },
                  e(Icons.Globe, { size: 15 }),
                ),
              ),
            ),

            // API Key
            e(
              'div',
              { style: { marginBottom: 18 } },
              e(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
                e('label', { style: { fontSize: 13, fontWeight: 600, margin: 0 } }, t('config.apiKey')),
                state.apiKeyConfigured
                  ? e(
                      'span',
                      {
                        style: {
                          fontSize: 12,
                          color: T.success,
                          background: T.successBg,
                          padding: '2px 8px',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        },
                      },
                      e(Icons.Check, { size: 12, color: T.success }),
                      t('config.keyStored', { masked: state.apiKeyMasked }),
                    )
                  : e(
                      'span',
                      {
                        style: {
                          fontSize: 12,
                          color: T.danger,
                          background: T.dangerBg,
                          padding: '2px 8px',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        },
                      },
                      e(Icons.Alert, { size: 12, color: T.danger }),
                      t('config.keyMissing'),
                    ),
              ),
              e(
                'div',
                { style: { display: 'flex', gap: 8 } },
                e(
                  'div',
                  { style: { position: 'relative', flex: 1 } },
                  e('input', {
                    style: {
                      width: '100%',
                      padding: '9px 12px 9px 34px',
                      fontSize: 13,
                      borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      background: 'transparent',
                      color: T.label,
                      outline: 'none',
                      boxSizing: 'border-box',
                    },
                    type: showKey ? 'text' : 'password',
                    value: apiKey,
                    onChange: (ev) => setApiKey(ev.target.value),
                    placeholder: state.apiKeyConfigured ? t('config.keyChangePlaceholder') : t('config.keyPlaceholder'),
                  }),
                  e(
                    'div',
                    { style: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' } },
                    e(Icons.Key, { size: 15 }),
                  ),
                ),
                e(
                  'button',
                  {
                    type: 'button',
                    style: buttonStyle(false),
                    onClick: () => setShowKey(!showKey),
                  },
                  showKey ? e(Icons.EyeOff, { size: 14 }) : e(Icons.Eye, { size: 14 }),
                  showKey ? t('btn.hide') : t('btn.show'),
                ),
              ),
            ),

            // Protocol Selection Card
            e(
              'div',
              { style: { marginBottom: 20 } },
              e('label', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' } }, t('config.protocolTitle')),
              e(
                'div',
                { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 } },
                // Option 1
                e(
                  'div',
                  {
                    style: {
                      border: apiProtocol === 'openai-responses' ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                      borderRadius: 8,
                      padding: '14px 16px',
                      cursor: 'pointer',
                      background: apiProtocol === 'openai-responses' ? T.accentBg : 'transparent',
                      transition: 'all 0.15s ease',
                    },
                    onClick: () => setApiProtocol('openai-responses'),
                  },
                  e(
                    'div',
                    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                    e('strong', { style: { fontSize: 14 } }, t('config.protoResponses')),
                    e(
                      'span',
                      {
                        style: {
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: T.accent,
                          color: '#fff',
                          fontWeight: 600,
                        },
                      },
                      t('config.protoResponsesBadge'),
                    ),
                  ),
                  e('div', { style: { fontSize: 12, color: T.labelSec, lineHeight: 1.4 } }, t('config.protoResponsesDesc')),
                ),
                // Option 2
                e(
                  'div',
                  {
                    style: {
                      border: apiProtocol === 'openai-completions' ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                      borderRadius: 8,
                      padding: '14px 16px',
                      cursor: 'pointer',
                      background: apiProtocol === 'openai-completions' ? T.accentBg : 'transparent',
                      transition: 'all 0.15s ease',
                    },
                    onClick: () => setApiProtocol('openai-completions'),
                  },
                  e(
                    'div',
                    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                    e('strong', { style: { fontSize: 14 } }, t('config.protoCompletions')),
                    e(
                      'span',
                      {
                        style: {
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: T.bgHover,
                          color: T.labelSec,
                        },
                      },
                      t('config.protoCompletionsBadge'),
                    ),
                  ),
                  e('div', { style: { fontSize: 12, color: T.labelSec, lineHeight: 1.4 } }, t('config.protoCompletionsDesc')),
                ),
              ),
            ),

            // Actions
            e(
              'div',
              { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
              e(
                'button',
                {
                  style: buttonStyle(true),
                  onClick: handleSave,
                  disabled: saving,
                },
                e(Icons.Check, { size: 14 }),
                saving ? t('btn.saving') : t('btn.save'),
              ),
              e(
                'button',
                {
                  style: buttonStyle(false),
                  onClick: handleTest,
                  disabled: testing,
                },
                e(Icons.Refresh, { size: 14 }),
                testing ? t('btn.testing') : t('btn.test'),
              ),
              testResult &&
                (testResult.ok
                  ? e(
                      'span',
                      {
                        style: {
                          fontSize: 13,
                          color: T.success,
                          background: T.successBg,
                          padding: '6px 12px',
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        },
                      },
                      e(Icons.CheckCircle, { size: 14, color: T.success }),
                      t('test.success', { latency: testResult.latencyMs, count: testResult.modelsCount }),
                    )
                  : e(
                      'span',
                      {
                        style: {
                          fontSize: 13,
                          color: T.danger,
                          background: T.dangerBg,
                          padding: '6px 12px',
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        },
                      },
                      e(Icons.Alert, { size: 14, color: T.danger }),
                      t('test.fail', { error: testResult.error }),
                    )),
            ),
          ),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (!slots) return

      slots.inject('settings.section', () =>
        slots.register(
          {
            name: 'settings.section',
            id: 'dc-ai-api',
            order: 35,
            label: () => 'DC AI API',
          },
          () => e(DCAISettingsPage, null),
        ),
      )
    }

    exports.name = 'dsh-dc-ai-api'
    exports.inject = ['slots', 'locale']
    exports.apply = apply
    return module.exports
  },
})
