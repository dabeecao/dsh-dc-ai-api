// DC AI API — Client settings & dashboard UI.
// Registers a dedicated section under Settings → DC AI API in DeepSeek Harness.
//
// Copy goes through the DSH locale service: the plugin registers its own
// `dc-ai-api` namespace (zh + en) and adds Vietnamese as a language pack, so the
// section follows the GUI language instead of shipping its own VI/EN switch.
window.__ModuleLoader__.load({
  id: 'dsh-dc-ai-api',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useState, useEffect, useCallback, useMemo, useRef } = React
    const e = React.createElement

    const NS = 'dc-ai-api'

    // Design tokens matching DSH native theme variables.
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

    // ── SVG icons ───────────────────────────────────────────────────────────
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
            'aria-hidden': 'true',
            focusable: 'false',
            style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...(props?.style || {}) },
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
      Bolt: createSvgIcon([{ tag: 'polygon', attrs: { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' } }]),
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
      Check: createSvgIcon([{ tag: 'polyline', attrs: { points: '20 6 9 17 4 12' } }]),
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

    // ── Copy ────────────────────────────────────────────────────────────────
    const EN = {
      nav: 'DC AI API',
      title: 'DC AI Gateway',
      subtitle: 'Model provider, quota monitoring, reasoning levels, and vision detection.',
      'status.online': 'Connected',
      'status.noKey': 'No API key',
      'status.gateway': 'Live catalog',
      'status.snapshot': 'Offline catalog',
      'status.never': 'never',
      'tab.billing': 'Quota & Billing',
      'tab.models': 'Model Catalog',
      'tab.config': 'Connection & API Key',
      'btn.refresh': 'Refresh',
      'btn.sync': 'Sync models',
      'btn.save': 'Save configuration',
      'btn.saving': 'Saving…',
      'btn.test': 'Test connection',
      'btn.testing': 'Testing…',
      'btn.syncing': 'Syncing…',
      'btn.refreshing': 'Loading…',
      'btn.retry': 'Retry',
      'btn.show': 'Show',
      'btn.hide': 'Hide',
      'billing.windowTitle': 'CURRENT WINDOW',
      'billing.resetIn': 'Resets in {time}',
      'billing.available': 'available',
      'billing.used': 'Used',
      'billing.requests': 'Requests',
      'billing.windowTokens': 'Window tokens',
      'billing.resetAt': 'Resets at',
      'billing.dailyTitle': 'DAILY QUOTA',
      'billing.today': 'today',
      'billing.usageRate': 'Usage rate',
      'billing.todayTokens': 'Tokens today',
      'billing.dailyResetAt': 'Daily reset',
      'billing.balanceTitle': 'SPENDABLE BALANCE',
      'billing.statusActive': 'Active',
      'billing.spendable': 'spendable',
      'billing.plan': 'Plan',
      'billing.period': 'Period',
      'billing.hardLimit': 'Hard limit',
      'billing.softLimit': 'Soft limit',
      'billing.historyTitle': 'Recent window activity',
      'billing.historyCount': '{count} windows',
      'billing.colWindow': 'Window',
      'billing.colTime': 'Time',
      'billing.colRequests': 'Requests',
      'billing.colTokens': 'Tokens',
      'billing.colCost': 'Cost (USD)',
      'billing.currentBadge': 'Current',
      'billing.loading': 'Loading quota data…',
      'billing.errorTitle': 'Quota data unavailable',
      'billing.missingKey': 'Add an API key to load quota and billing data.',
      'billing.unavailable': 'Not reported by the gateway',
      'models.title': 'Model catalog',
      'models.subtitle': 'Reasoning levels and vision support are detected per model family.',
      'models.filterAll': 'All ({count})',
      'models.filterThinking': 'Thinking ({count})',
      'models.filterVision': 'Vision ({count})',
      'models.searchPlaceholder': 'Search models…',
      'models.notFound': 'No matching models.',
      'models.thinkingLevels': 'Thinking · {count} levels',
      'models.textOnly': 'Text only',
      'models.vision': 'Vision',
      'models.tokensContext': 'context',
      'models.maxOutput': 'max output',
      'models.empty': 'The catalog is empty. Sync the models to populate it.',
      'config.title': 'Gateway & API key',
      'setup.title': 'Set up DC AI',
      'setup.desc': 'Paste your DC AI Gateway API key to load the live model catalog and the quota dashboard.',
      'setup.submit': 'Save & connect',
      'setup.submitting': 'Connecting…',
      'config.baseURL': 'Gateway base URL',
      'config.apiKey': 'API key',
      'config.keyStored': 'Stored as {ref}',
      'config.keyMissing': 'Not configured',
      'config.keyPlaceholder': 'Paste your key (dc_…)',
      'config.keyChangePlaceholder': 'Paste a new key to replace the stored one',
      'config.keyHint': 'The key is written to the DSH credential store, never to the configuration file.',
      'update.title': 'Version',
      'update.current': 'Installed',
      'update.check': 'Check for updates',
      'update.checking': 'Checking…',
      'update.upToDate': 'You are on the latest version.',
      'update.available': 'Version {version} is available.',
      'update.open': 'Open releases',
      'update.failed': 'Could not check for updates: {error}',
      'update.note': 'This plugin ships from GitHub, so DeepSeek Harness does not track its updates. Use this check instead.',
      'config.privateTitle': 'Self-hosted gateway',
      'config.privateLabel': 'Allow a private gateway address',
      'config.privateDesc': 'Turn this on only if your DC AI gateway runs on localhost or your own network. It permits the plugin to reach loopback and private addresses.',
      'config.privateWarn': 'On: the gateway may point at a private address. Leave this off for the public gateway.',
      'config.modelsDevLabel': 'Enrich capabilities from models.dev',
      'config.modelsDevDesc': 'On: reasoning levels and vision support are refined with the public models.dev catalog. Off: the gateway metadata alone is used.',
      'config.keyRejected': 'The gateway rejected this API key. Nothing was saved — check the key and try again.',
      'config.keyUnverified': 'Could not verify the key with the gateway: {error}. Check the base URL and key, then try again.',
      'config.protocolTitle': 'Wire protocol',
      'config.protoResponses': 'Responses API',
      'config.protoResponsesBadge': 'Recommended',
      'config.protoResponsesDesc': 'Modern protocol for reasoning models; keeps thinking state across turns.',
      'config.protoCompletions': 'Chat Completions',
      'config.protoCompletionsBadge': 'Standard',
      'config.protoCompletionsDesc': 'OpenAI /v1/chat/completions; broadest tool and streaming compatibility.',
      'msg.saveSuccess': 'Configuration saved.',
      'msg.syncSuccess': 'Synced {count} models.',
      'msg.syncPartial': 'Sync finished with a warning: {error}',
      'msg.refreshSuccess': 'Refreshed.',
      'test.success': 'Connected in {latency} ms — {count} models.',
      'test.fail': 'Failed: {error}',
      'test.missingKey': 'Enter an API key first — the gateway refuses unauthenticated requests.',
      'common.loading': 'Connecting to the DC AI gateway…',
      'common.updated': 'Synced {time}',
      'common.source': 'Source',
      'common.error': 'Last error',
      'common.close': 'Dismiss',
    }

    const ZH = {
      nav: 'DC AI API',
      title: 'DC AI 网关',
      subtitle: '模型提供方、额度监控、思考等级与视觉能力识别。',
      'status.online': '已连接',
      'status.noKey': '未配置密钥',
      'status.gateway': '在线目录',
      'status.snapshot': '离线目录',
      'status.never': '从未',
      'tab.billing': '额度与计费',
      'tab.models': '模型目录',
      'tab.config': '连接与密钥',
      'btn.refresh': '刷新',
      'btn.sync': '同步模型',
      'btn.save': '保存配置',
      'btn.saving': '保存中…',
      'btn.test': '测试连接',
      'btn.testing': '测试中…',
      'btn.syncing': '同步中…',
      'btn.refreshing': '加载中…',
      'btn.retry': '重试',
      'btn.show': '显示',
      'btn.hide': '隐藏',
      'billing.windowTitle': '当前窗口',
      'billing.resetIn': '{time} 后重置',
      'billing.available': '可用',
      'billing.used': '已用',
      'billing.requests': '请求数',
      'billing.windowTokens': '窗口 Token',
      'billing.resetAt': '重置时间',
      'billing.dailyTitle': '每日额度',
      'billing.today': '今日',
      'billing.usageRate': '使用率',
      'billing.todayTokens': '今日 Token',
      'billing.dailyResetAt': '每日重置',
      'billing.balanceTitle': '可消费余额',
      'billing.statusActive': '正常',
      'billing.spendable': '可消费',
      'billing.plan': '套餐',
      'billing.period': '周期',
      'billing.hardLimit': '硬上限',
      'billing.softLimit': '软上限',
      'billing.historyTitle': '最近窗口活动',
      'billing.historyCount': '{count} 个窗口',
      'billing.colWindow': '窗口',
      'billing.colTime': '时间',
      'billing.colRequests': '请求数',
      'billing.colTokens': 'Token',
      'billing.colCost': '费用（USD）',
      'billing.currentBadge': '当前',
      'billing.loading': '正在加载额度数据…',
      'billing.errorTitle': '无法加载额度数据',
      'billing.missingKey': '添加 API 密钥后即可查看额度与计费。',
      'billing.unavailable': '网关未提供',
      'models.title': '模型目录',
      'models.subtitle': '思考等级与视觉能力按模型系列自动识别。',
      'models.filterAll': '全部（{count}）',
      'models.filterThinking': '思考（{count}）',
      'models.filterVision': '视觉（{count}）',
      'models.searchPlaceholder': '搜索模型…',
      'models.notFound': '没有匹配的模型。',
      'models.thinkingLevels': '思考 · {count} 级',
      'models.textOnly': '纯文本',
      'models.vision': '视觉',
      'models.tokensContext': '上下文',
      'models.maxOutput': '最大输出',
      'models.empty': '目录为空，请同步模型。',
      'config.title': '网关与 API 密钥',
      'setup.title': '设置 DC AI',
      'setup.desc': '粘贴 DC AI 网关的 API 密钥，即可加载实时模型目录与额度面板。',
      'setup.submit': '保存并连接',
      'setup.submitting': '正在连接…',
      'config.baseURL': '网关地址',
      'config.apiKey': 'API 密钥',
      'config.keyStored': '已存储为 {ref}',
      'config.keyMissing': '未配置',
      'config.keyPlaceholder': '粘贴密钥（dc_…）',
      'config.keyChangePlaceholder': '粘贴新密钥以替换已存储的密钥',
      'config.keyHint': '密钥写入 DSH 凭据存储，不会写入配置文件。',
      'update.title': '版本',
      'update.current': '已安装',
      'update.check': '检查更新',
      'update.checking': '检查中…',
      'update.upToDate': '已是最新版本。',
      'update.available': '有新版本 {version} 可用。',
      'update.open': '打开发布页',
      'update.failed': '无法检查更新：{error}',
      'update.note': '本插件从 GitHub 发布，DeepSeek Harness 不会跟踪其更新，请使用此检查。',
      'config.privateTitle': '自建网关',
      'config.privateLabel': '允许私有网关地址',
      'config.privateDesc': '仅当你的 DC AI 网关运行在本机或自有网络时才开启。开启后插件可访问回环与私有地址。',
      'config.privateWarn': '已开启：网关可指向私有地址。使用公共网关时请保持关闭。',
      'config.modelsDevLabel': '使用 models.dev 增强能力信息',
      'config.modelsDevDesc': '开启：用公开的 models.dev 目录补全思考等级与视觉支持。关闭：仅使用网关自身提供的元数据。',
      'config.keyRejected': '网关拒绝了此 API 密钥。未保存任何内容——请检查密钥后重试。',
      'config.keyUnverified': '无法连接网关验证密钥：{error}。请检查网关地址与密钥后重试。',
      'config.protocolTitle': '通信协议',
      'config.protoResponses': 'Responses API',
      'config.protoResponsesBadge': '推荐',
      'config.protoResponsesDesc': '面向推理模型的现代协议，可跨轮次保留思考状态。',
      'config.protoCompletions': 'Chat Completions',
      'config.protoCompletionsBadge': '标准',
      'config.protoCompletionsDesc': 'OpenAI /v1/chat/completions，工具与流式兼容性最好。',
      'msg.saveSuccess': '配置已保存。',
      'msg.syncSuccess': '已同步 {count} 个模型。',
      'msg.syncPartial': '同步完成但有警告：{error}',
      'msg.refreshSuccess': '已刷新。',
      'test.success': '连接成功，耗时 {latency} 毫秒 — {count} 个模型。',
      'test.fail': '失败：{error}',
      'test.missingKey': '请先输入 API 密钥——网关会拒绝未认证的请求。',
      'common.loading': '正在连接 DC AI 网关…',
      'common.updated': '同步于 {time}',
      'common.source': '来源',
      'common.error': '最近错误',
      'common.close': '关闭',
    }

    const VI = {
      nav: 'DC AI API',
      title: 'DC AI Gateway',
      subtitle: 'Nhà cung cấp model, theo dõi hạn mức, mức suy luận và nhận diện thị giác.',
      'status.online': 'Đã kết nối',
      'status.noKey': 'Chưa có khóa',
      'status.gateway': 'Danh mục trực tuyến',
      'status.snapshot': 'Danh mục ngoại tuyến',
      'status.never': 'chưa lần nào',
      'tab.billing': 'Hạn mức & Chi phí',
      'tab.models': 'Danh mục model',
      'tab.config': 'Kết nối & Khóa API',
      'btn.refresh': 'Làm mới',
      'btn.sync': 'Đồng bộ model',
      'btn.save': 'Lưu cấu hình',
      'btn.saving': 'Đang lưu…',
      'btn.test': 'Kiểm tra kết nối',
      'btn.testing': 'Đang kiểm tra…',
      'btn.syncing': 'Đang đồng bộ…',
      'btn.refreshing': 'Đang tải…',
      'btn.retry': 'Thử lại',
      'btn.show': 'Hiện',
      'btn.hide': 'Ẩn',
      'billing.windowTitle': 'CHU KỲ HIỆN TẠI',
      'billing.resetIn': 'Reset sau {time}',
      'billing.available': 'khả dụng',
      'billing.used': 'Đã dùng',
      'billing.requests': 'Yêu cầu',
      'billing.windowTokens': 'Token trong chu kỳ',
      'billing.resetAt': 'Reset lúc',
      'billing.dailyTitle': 'HẠN MỨC TRONG NGÀY',
      'billing.today': 'hôm nay',
      'billing.usageRate': 'Tỉ lệ dùng',
      'billing.todayTokens': 'Token hôm nay',
      'billing.dailyResetAt': 'Reset ngày',
      'billing.balanceTitle': 'SỐ DƯ KHẢ DỤNG',
      'billing.statusActive': 'Hoạt động',
      'billing.spendable': 'khả dụng chi tiêu',
      'billing.plan': 'Gói',
      'billing.period': 'Cơ chế',
      'billing.hardLimit': 'Giới hạn cứng',
      'billing.softLimit': 'Giới hạn mềm',
      'billing.historyTitle': 'Hoạt động các chu kỳ gần đây',
      'billing.historyCount': '{count} chu kỳ',
      'billing.colWindow': 'Chu kỳ',
      'billing.colTime': 'Thời gian',
      'billing.colRequests': 'Yêu cầu',
      'billing.colTokens': 'Token',
      'billing.colCost': 'Chi phí (USD)',
      'billing.currentBadge': 'Hiện tại',
      'billing.loading': 'Đang tải dữ liệu hạn mức…',
      'billing.errorTitle': 'Chưa tải được dữ liệu hạn mức',
      'billing.missingKey': 'Thêm khóa API để xem hạn mức và chi phí.',
      'billing.unavailable': 'Gateway không cung cấp',
      'models.title': 'Danh mục model',
      'models.subtitle': 'Mức suy luận và khả năng thị giác được nhận diện theo từng dòng model.',
      'models.filterAll': 'Tất cả ({count})',
      'models.filterThinking': 'Thinking ({count})',
      'models.filterVision': 'Vision ({count})',
      'models.searchPlaceholder': 'Tìm model…',
      'models.notFound': 'Không có model phù hợp.',
      'models.thinkingLevels': 'Thinking · {count} mức',
      'models.textOnly': 'Chỉ văn bản',
      'models.vision': 'Vision',
      'models.tokensContext': 'context',
      'models.maxOutput': 'output tối đa',
      'models.empty': 'Danh mục đang trống. Hãy đồng bộ model.',
      'config.title': 'Gateway & Khóa API',
      'setup.title': 'Thiết lập DC AI',
      'setup.desc': 'Dán khóa API của DC AI Gateway để tải danh mục model trực tiếp và bảng theo dõi hạn mức.',
      'setup.submit': 'Lưu & kết nối',
      'setup.submitting': 'Đang kết nối…',
      'config.baseURL': 'Địa chỉ gateway',
      'config.apiKey': 'Khóa API',
      'config.keyStored': 'Đang lưu ở {ref}',
      'config.keyMissing': 'Chưa cấu hình',
      'config.keyPlaceholder': 'Dán khóa (dc_…)',
      'config.keyChangePlaceholder': 'Dán khóa mới để thay khóa đã lưu',
      'config.keyHint': 'Khóa được ghi vào kho credential của DSH, không ghi vào tệp cấu hình.',
      'update.title': 'Phiên bản',
      'update.current': 'Đang cài',
      'update.check': 'Kiểm tra cập nhật',
      'update.checking': 'Đang kiểm tra…',
      'update.upToDate': 'Bạn đang dùng bản mới nhất.',
      'update.available': 'Đã có bản {version}.',
      'update.open': 'Mở trang phát hành',
      'update.failed': 'Không kiểm tra được cập nhật: {error}',
      'update.note': 'Plugin này phát hành qua GitHub nên DeepSeek Harness không theo dõi cập nhật. Hãy dùng nút kiểm tra này.',
      'config.privateTitle': 'Gateway tự host',
      'config.privateLabel': 'Cho phép địa chỉ gateway nội bộ',
      'config.privateDesc': 'Chỉ bật khi gateway DC AI của bạn chạy trên máy cục bộ hoặc mạng riêng. Khi bật, plugin được phép truy cập địa chỉ loopback và mạng nội bộ.',
      'config.privateWarn': 'Đang bật: gateway có thể trỏ vào địa chỉ nội bộ. Hãy tắt khi dùng gateway công khai.',
      'config.modelsDevLabel': 'Bổ sung thông tin từ models.dev',
      'config.modelsDevDesc': 'Bật: dùng danh mục công khai models.dev để xác định mức suy luận và khả năng thị giác. Tắt: chỉ dùng metadata do gateway cung cấp.',
      'config.keyRejected': 'Gateway đã từ chối khóa API này. Chưa lưu gì — hãy kiểm tra khóa và thử lại.',
      'config.keyUnverified': 'Không xác minh được khóa với gateway: {error}. Hãy kiểm tra địa chỉ gateway và khóa rồi thử lại.',
      'config.protocolTitle': 'Giao thức kết nối',
      'config.protoResponses': 'Responses API',
      'config.protoResponsesBadge': 'Khuyên dùng',
      'config.protoResponsesDesc': 'Giao thức hiện đại cho model suy luận, giữ trạng thái thinking giữa các lượt.',
      'config.protoCompletions': 'Chat Completions',
      'config.protoCompletionsBadge': 'Tiêu chuẩn',
      'config.protoCompletionsDesc': 'OpenAI /v1/chat/completions, tương thích tool và streaming tốt nhất.',
      'msg.saveSuccess': 'Đã lưu cấu hình.',
      'msg.syncSuccess': 'Đã đồng bộ {count} model.',
      'msg.syncPartial': 'Đồng bộ xong nhưng có cảnh báo: {error}',
      'msg.refreshSuccess': 'Đã làm mới.',
      'test.success': 'Kết nối tốt trong {latency} ms — {count} model.',
      'test.fail': 'Lỗi: {error}',
      'test.missingKey': 'Hãy nhập khóa API trước — gateway sẽ từ chối request chưa xác thực.',
      'common.loading': 'Đang kết nối DC AI Gateway…',
      'common.updated': 'Đồng bộ lúc {time}',
      'common.source': 'Nguồn',
      'common.error': 'Lỗi gần nhất',
      'common.close': 'Đóng',
    }

    // ── Formatting ──────────────────────────────────────────────────────────
    function formatUSD(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return `$${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: value > 0 && value < 1 ? 4 : 2,
      })}`
    }

    function formatTokens(count) {
      if (typeof count !== 'number' || !Number.isFinite(count)) return '—'
      if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(2)}B`
      if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
      if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
      return count.toLocaleString()
    }

    function formatCountdown(seconds) {
      // `undefined` means the gateway did not report a reset time — render the
      // same "—" every other missing value uses. Only a real 0 counts as
      // "resetting now", otherwise the card would claim a reset that never came.
      if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—'
      if (seconds <= 0) return '0m'
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      const secs = Math.floor(seconds % 60)
      if (hours > 0) return `${hours}h ${minutes}m`
      if (minutes > 0) return `${minutes}m ${secs}s`
      return `${secs}s`
    }

    function formatDateTime(value) {
      if (value === undefined || value === null || value === '') return '—'
      const date = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value)
      if (Number.isNaN(date.getTime())) return '—'
      return `${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${date.toLocaleDateString([], {
        day: '2-digit',
        month: '2-digit',
      })}`
    }

    /** Seconds until an absolute reset timestamp, or undefined when unknown. */
    function secondsUntil(value) {
      if (value === undefined || value === null || value === '') return undefined
      const date = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value)
      if (Number.isNaN(date.getTime())) return undefined
      return Math.max(0, Math.round((date.getTime() - Date.now()) / 1000))
    }

    // ── Transport ───────────────────────────────────────────────────────────
    const REQUEST_TIMEOUT_MS = 20000

    async function apiCall(method, path, body, signal) {
      const controller = new AbortController()
      const onAbort = () => controller.abort(signal?.reason)
      signal?.addEventListener('abort', onAbort, { once: true })
      const timer = setTimeout(() => controller.abort(new Error('timeout')), REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: 'same-origin',
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          const error = new Error(data.error || `HTTP ${response.status}`)
          if (data.code) error.code = data.code
          if (data.detail) error.detail = data.detail
          throw error
        }
        return data
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
    }

    // ── Shared styles ───────────────────────────────────────────────────────
    const cardStyle = {
      background: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: '20px 24px',
      marginBottom: 18,
    }

    const buttonStyle = (primary) => ({
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
      transition: 'background 0.15s ease, border-color 0.15s ease',
    })

    const inputStyle = {
      width: '100%',
      padding: '9px 12px 9px 34px',
      fontSize: 13,
      borderRadius: 6,
      border: `1px solid ${T.border}`,
      background: 'transparent',
      color: T.label,
      outline: 'none',
      boxSizing: 'border-box',
    }

    const fieldIconStyle = {
      position: 'absolute',
      left: 10,
      top: '50%',
      transform: 'translateY(-50%)',
      opacity: 0.5,
      pointerEvents: 'none',
    }

    function Metric({ label, value, tone }) {
      return e(
        'div',
        { style: { display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12, color: T.labelSec } },
        e('span', null, label),
        e('strong', { style: { color: tone || T.label, fontWeight: 600 } }, value),
      )
    }

    function ProgressBar({ percent, color }) {
      // "No data" is not "0% used": an empty bar would claim the quota is
      // untouched. A non-finite percent renders a hatched, undetermined bar
      // instead, matching the "—" every other missing value shows.
      const known = Number.isFinite(percent)
      if (!known) {
        return e('div', {
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuetext': '—',
          'aria-busy': false,
          style: {
            height: 6,
            borderRadius: 3,
            marginBottom: 12,
            background: `repeating-linear-gradient(45deg, ${T.bgHover} 0 6px, transparent 6px 12px)`,
            border: `1px dashed ${T.border}`,
          },
        })
      }
      const clamped = Math.min(100, Math.max(0, percent))
      return e(
        'div',
        {
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': Math.round(clamped),
          style: { height: 6, background: T.bgHover, borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
        },
        e('div', {
          style: {
            width: `${clamped}%`,
            height: '100%',
            background: clamped > 90 ? T.danger : clamped > 70 ? T.warning : color,
            borderRadius: 3,
            transition: 'width 0.4s ease',
          },
        }),
      )
    }

    function Banner({ tone, message, onClose, closeLabel }) {
      const palette =
        tone === 'danger'
          ? { bg: T.dangerBg, border: T.danger, fg: T.danger, Icon: Icons.Alert }
          : { bg: T.successBg, border: T.success, fg: T.success, Icon: Icons.CheckCircle }
      return e(
        'div',
        {
          role: tone === 'danger' ? 'alert' : 'status',
          'aria-live': tone === 'danger' ? 'assertive' : 'polite',
          style: {
            padding: '10px 16px',
            background: palette.bg,
            border: `1px solid ${palette.border}`,
            borderRadius: 8,
            color: palette.fg,
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          },
        },
        e(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } },
          e(palette.Icon, { size: 16, color: palette.fg }),
          e('span', { style: { overflowWrap: 'anywhere' } }, message),
        ),
        onClose &&
          e(
            'button',
            {
              type: 'button',
              'aria-label': closeLabel,
              style: {
                background: 'none',
                border: 'none',
                color: palette.fg,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 4,
              },
              onClick: onClose,
            },
            e(Icons.Close, { size: 14 }),
          ),
      )
    }

    // ── Settings page ───────────────────────────────────────────────────────
    function DCAISettingsPage({ t }) {
      const [loading, setLoading] = useState(true)
      const [activeTab, setActiveTab] = useState('billing')

      const [state, setState] = useState({
        baseURL: '',
        apiKeyConfigured: false,
        apiKeyEnv: 'DC_AI_API_KEY',
        api: 'openai-responses',
        displayName: 'DC AI',
        allowPrivateBaseURL: false,
        useModelsDev: true,
        lastSyncAt: null,
        lastLive: false,
        lastSource: 'none',
        lastError: null,
        modelsCount: 0,
        thinkingCount: 0,
        visionCount: 0,
        models: [],
      })

      const [billing, setBilling] = useState({
        loading: false,
        loaded: false,
        error: null,
        missingKey: false,
        subscription: null,
        usage: null,
        fetchedAt: null,
      })

      const [apiKey, setApiKey] = useState('')
      const [showKey, setShowKey] = useState(false)
      const [baseURL, setBaseURL] = useState('')
      const [apiProtocol, setApiProtocol] = useState('openai-responses')
      const [allowPrivate, setAllowPrivate] = useState(false)
      const [useModelsDev, setUseModelsDev] = useState(true)

      const [saving, setSaving] = useState(false)
      const [testing, setTesting] = useState(false)
      const [syncing, setSyncing] = useState(false)
      const [refreshing, setRefreshing] = useState(false)
      const [notice, setNotice] = useState(null)
      const [error, setError] = useState(null)
      const [testResult, setTestResult] = useState(null)
      const [update, setUpdate] = useState(null)
      const [checkingUpdate, setCheckingUpdate] = useState(false)

      const [search, setSearch] = useState('')
      const [modelFilter, setModelFilter] = useState('all')

      // Live countdown: the reset timestamps are absolute, so the remaining time
      // is recomputed every second — but only while a timestamp to count down
      // is actually on screen. Without one the ticker would re-render the
      // whole page every second for nothing.
      const [now, setNow] = useState(() => Date.now())
      const hasCountdown = Boolean(
        billing.subscription?.window_limit?.resets_at ||
          billing.usage?.window_usage?.resets_at ||
          billing.subscription?.daily_resets_at ||
          billing.usage?.daily_resets_at,
      )
      useEffect(() => {
        if (!hasCountdown) return undefined
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [hasCountdown])

      const mounted = useRef(true)
      useEffect(() => {
        mounted.current = true
        return () => {
          mounted.current = false
        }
      }, [])

      const fetchBillingData = useCallback(async (signal) => {
        setBilling((prev) => ({ ...prev, loading: true, error: null }))
        try {
          const res = await apiCall('GET', '/dc-ai-api/billing', undefined, signal)
          // Unmounted or aborted: nothing was verified, so this is not a success.
          if (!mounted.current) return false
          if (res && res.ok) {
            const subscription = res.subscription && !res.subscription.error ? res.subscription : null
            const usage = res.usage && !res.usage.error ? res.usage : null
            const failure = !subscription && !usage
            setBilling({
              loading: false,
              loaded: true,
              missingKey: false,
              error: failure
                ? res.subscription?.error || res.usage?.error || t('billing.errorTitle')
                : null,
              subscription,
              usage,
              fetchedAt: res.fetchedAt,
            })
            // A keyless gateway is not a failure: the card shows its own state.
            return !failure
          }
          setBilling((prev) => ({
            ...prev,
            loading: false,
            loaded: true,
            missingKey: res?.error === 'MISSING_KEY',
            error: res?.error === 'MISSING_KEY' ? null : res?.error || t('billing.errorTitle'),
          }))
          return res?.error === 'MISSING_KEY'
        } catch (err) {
          if (!mounted.current || err?.name === 'AbortError') return false
          setBilling((prev) => ({ ...prev, loading: false, loaded: true, error: err.message }))
          return false
        }
      }, [t])

      const refreshState = useCallback(async (signal) => {
        try {
          const data = await apiCall('GET', '/dc-ai-api/state', undefined, signal)
          if (!mounted.current) return false
          if (data && data.ok) {
            setState(data)
            setBaseURL((prev) => prev || data.baseURL || '')
            setApiProtocol(data.api || 'openai-responses')
            setAllowPrivate(Boolean(data.allowPrivateBaseURL))
            setUseModelsDev(data.useModelsDev !== false)
            return true
          }
          return false
        } catch (err) {
          if (!mounted.current || err?.name === 'AbortError') return false
          setError(err.message)
          return false
        } finally {
          if (mounted.current) setLoading(false)
        }
      }, [])

      useEffect(() => {
        const controller = new AbortController()
        void refreshState(controller.signal)
        void fetchBillingData(controller.signal)
        return () => controller.abort()
      }, [refreshState, fetchBillingData])

      const handleRefreshAll = async () => {
        setRefreshing(true)
        setNotice(null)
        setError(null)
        try {
          // Both helpers report their own failures instead of throwing, so the
          // success banner must be driven by their return value: announcing
          // "refreshed" next to a red error banner is worse than saying nothing.
          const [stateOk, billingOk] = await Promise.all([refreshState(), fetchBillingData()])
          if (stateOk && billingOk) setNotice(t('msg.refreshSuccess'))
          else setNotice(null)
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
            allowPrivateBaseURL: allowPrivate,
            useModelsDev,
          }
          if (apiKey.trim()) payload.apiKey = apiKey.trim()
          const res = await apiCall('POST', '/dc-ai-api/config', payload)
          if (res && res.ok) {
            setState(res)
            setApiKey('')
            setNotice(t('msg.saveSuccess'))
            void fetchBillingData()
          } else {
            setError(saveError(res?.code, res?.error))
          }
        } catch (err) {
          setError(saveError(err.code, err.message, err.detail))
        } finally {
          setSaving(false)
        }
      }

      /**
       * Map a config-write failure to localized copy: a rejected key and an
       * unverifiable one (gateway unreachable) both refuse the save, so the
       * message tells the user what to check.
       * @param {string | undefined} code - machine code from the route.
       * @param {string | undefined} fallback - raw error text.
       * @param {string | undefined} detail - underlying cause, when carried.
       * @returns {string} the message to render.
       */
      function saveError(code, fallback, detail) {
        if (code === 'INVALID_KEY') return t('config.keyRejected')
        if (code === 'VERIFY_FAILED') return t('config.keyUnverified', { error: detail || fallback || '' })
        return fallback || t('billing.errorTitle')
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

      const handleCheckUpdate = async () => {
        setCheckingUpdate(true)
        setUpdate(null)
        try {
          const res = await apiCall('GET', '/dc-ai-api/update')
          setUpdate(res)
        } catch (err) {
          setUpdate({ error: err.message })
        } finally {
          setCheckingUpdate(false)
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
            if (res.lastError) setError(t('msg.syncPartial', { error: res.lastError }))
            else setNotice(t('msg.syncSuccess', { count: res.modelsCount }))
          } else {
            setError(res?.lastError || res?.error || t('billing.errorTitle'))
          }
        } catch (err) {
          setError(err.message)
        } finally {
          setSyncing(false)
        }
      }

      const filteredModels = useMemo(() => {
        const list = Array.isArray(state.models) ? state.models : []
        const filtered =
          modelFilter === 'thinking'
            ? list.filter((m) => m.thinking)
            : modelFilter === 'vision'
              ? list.filter((m) => Array.isArray(m.input) && m.input.includes('image'))
              : list
        const query = search.trim().toLowerCase()
        if (!query) return filtered
        return filtered.filter(
          (m) => m.id.toLowerCase().includes(query) || (m.name && m.name.toLowerCase().includes(query)),
        )
      }, [state.models, search, modelFilter])

      if (loading) {
        return e(
          'div',
          { style: { padding: 48, textAlign: 'center', opacity: 0.7, fontSize: 14 }, role: 'status' },
          t('common.loading'),
        )
      }

      // Setup gate: without a configured key the dashboard would only show
      // offline catalog data and refused billing requests, so first-run users
      // get one focused card instead of the full page.
      if (!state.apiKeyConfigured) {
        return e(
          'div',
          { style: { padding: '48px 24px', maxWidth: 480, margin: '0 auto' } },
          e(
            'form',
            {
              style: { ...cardStyle, padding: '28px' },
              onSubmit: (ev) => {
                ev.preventDefault()
                handleSave()
              },
            },
            e(
              'div',
              { style: { display: 'flex', justifyContent: 'center', marginBottom: 14 } },
              e(
                'div',
                {
                  style: {
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: T.accentBg,
                    color: T.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                },
                e(Icons.Bolt, { size: 22 }),
              ),
            ),
            e('h2', { style: { margin: '0 0 6px', fontSize: 19, fontWeight: 700, textAlign: 'center', letterSpacing: '-0.02em' } }, t('setup.title')),
            e('p', { style: { margin: '0 0 20px', fontSize: 13, color: T.labelSec, textAlign: 'center', lineHeight: 1.5 } }, t('setup.desc')),

            error && e(Banner, { tone: 'danger', message: error, onClose: () => setError(null), closeLabel: t('common.close') }),

            e(
              'div',
              { style: { marginBottom: 14 } },
              e('label', { htmlFor: 'dc-ai-setup-url', style: { fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' } }, t('config.baseURL')),
              e(
                'div',
                { style: { position: 'relative' } },
                e('input', {
                  id: 'dc-ai-setup-url',
                  type: 'url',
                  inputMode: 'url',
                  style: inputStyle,
                  value: baseURL,
                  onChange: (ev) => setBaseURL(ev.target.value),
                  placeholder: 'https://dc-ai.dabeecao.org',
                }),
                e('div', { style: fieldIconStyle }, e(Icons.Globe, { size: 15 })),
              ),
            ),

            e(
              'div',
              { style: { marginBottom: 18 } },
              e('label', { htmlFor: 'dc-ai-setup-key', style: { fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' } }, t('config.apiKey')),
              e(
                'div',
                { style: { display: 'flex', gap: 8 } },
                e(
                  'div',
                  { style: { position: 'relative', flex: 1 } },
                  e('input', {
                    id: 'dc-ai-setup-key',
                    style: inputStyle,
                    type: showKey ? 'text' : 'password',
                    autoComplete: 'off',
                    spellCheck: false,
                    value: apiKey,
                    onChange: (ev) => setApiKey(ev.target.value),
                    placeholder: t('config.keyPlaceholder'),
                  }),
                  e('div', { style: fieldIconStyle }, e(Icons.Key, { size: 15 })),
                ),
                e(
                  'button',
                  {
                    type: 'button',
                    style: buttonStyle(false),
                    'aria-pressed': showKey,
                    onClick: () => setShowKey(!showKey),
                  },
                  showKey ? e(Icons.EyeOff, { size: 14 }) : e(Icons.Eye, { size: 14 }),
                  showKey ? t('btn.hide') : t('btn.show'),
                ),
              ),
            ),

            e(
              'button',
              { type: 'submit', style: { ...buttonStyle(true), width: '100%', justifyContent: 'center' }, disabled: saving || apiKey.trim().length === 0 },
              saving ? e(Icons.Refresh, { size: 14 }) : e(Icons.Check, { size: 14 }),
              saving ? t('setup.submitting') : t('setup.submit'),
            ),
            e('p', { style: { margin: '12px 0 0', fontSize: 11, color: T.labelSec, textAlign: 'center' } }, t('config.keyHint')),
          ),
        )
      }

      const sub = billing.subscription
      const usage = billing.usage

      // Every value falls back to `undefined` (rendered as "—") instead of a
      // plausible-looking default: a fabricated quota is worse than no quota.
      const windowRemainingUsd =
        sub?.window_limit?.remaining_usd ?? usage?.window_usage?.remaining_usd ?? sub?.remaining_spendable_usd
      const windowLimitUsd = sub?.window_limit?.limit_usd ?? usage?.window_usage?.limit_usd ?? sub?.hard_limit_usd
      const windowUsedUsd =
        usage?.window_usage?.used_usd ?? sub?.window_limit?.used_usd ?? (usage?.total_usage ? usage.total_usage / 100 : undefined)
      const windowPercent =
        typeof windowUsedUsd === 'number' && typeof windowLimitUsd === 'number' && windowLimitUsd > 0
          ? (windowUsedUsd / windowLimitUsd) * 100
          : undefined
      const windowResetAt = sub?.window_limit?.resets_at ?? usage?.window_usage?.resets_at
      const windowResetSeconds =
        secondsUntil(windowResetAt) ??
        sub?.window_limit?.reset_in_seconds ??
        usage?.window_usage?.reset_in_seconds

      const dailyUsedUsd = sub?.used_today_usd ?? usage?.used_today_usd
      const dailyLimitUsd = sub?.daily_limit_usd ?? usage?.daily_limit_usd
      const dailyRemainingUsd =
        sub?.remaining_today_usd ??
        (typeof dailyUsedUsd === 'number' && typeof dailyLimitUsd === 'number'
          ? Math.max(0, dailyLimitUsd - dailyUsedUsd)
          : undefined)
      const dailyPercent =
        typeof dailyUsedUsd === 'number' && typeof dailyLimitUsd === 'number' && dailyLimitUsd > 0
          ? (dailyUsedUsd / dailyLimitUsd) * 100
          : undefined
      const dailyResetAt = sub?.daily_resets_at ?? usage?.daily_resets_at
      const dailyResetSeconds = secondsUntil(dailyResetAt) ?? sub?.daily_reset_in_seconds

      const remainingSpendableUsd = sub?.remaining_spendable_usd ?? usage?.remaining_spendable_usd
      void now // recompute countdowns on every tick

      const sourceLabel =
        state.lastSource === 'gateway'
          ? t('status.gateway')
          : state.lastSource === 'snapshot'
            ? t('status.snapshot')
            : t('status.never')

      return e(
        'div',
        { style: { padding: '24px 32px', maxWidth: 960, margin: '0 auto', fontFamily: 'inherit' } },

        // Header
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
              e('h2', { style: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' } }, t('title')),
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
                  'aria-hidden': 'true',
                  style: {
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: state.apiKeyConfigured ? T.success : T.warning,
                  },
                }),
                state.apiKeyConfigured ? t('status.online') : t('status.noKey'),
              ),
              e(
                'span',
                {
                  title: `${t('common.source')}: ${sourceLabel}`,
                  style: {
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '3px 9px',
                    borderRadius: 12,
                    background: state.lastLive ? T.accentBg : T.bgHover,
                    color: state.lastLive ? T.accent : T.labelSec,
                  },
                },
                sourceLabel,
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
            e('p', { style: { margin: '6px 0 0', fontSize: 13, color: T.labelSec } }, t('subtitle')),
            e(
              'p',
              { style: { margin: '4px 0 0', fontSize: 11, color: T.labelSec } },
              t('common.updated', { time: formatDateTime(state.lastSyncAt) }),
            ),
          ),
          e(
            'div',
            { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            e(
              'button',
              { type: 'button', style: buttonStyle(false), onClick: handleRefreshAll, disabled: refreshing },
              e(Icons.Refresh, { size: 14 }),
              refreshing ? t('btn.refreshing') : t('btn.refresh'),
            ),
            e(
              'button',
              { type: 'button', style: buttonStyle(true), onClick: handleSync, disabled: syncing },
              e(Icons.Bolt, { size: 14 }),
              syncing ? t('btn.syncing') : t('btn.sync'),
            ),
          ),
        ),

        notice &&
          !error &&
          e(Banner, { tone: 'success', message: notice, onClose: () => setNotice(null), closeLabel: t('common.close') }),
        error && e(Banner, { tone: 'danger', message: error, onClose: () => setError(null), closeLabel: t('common.close') }),
        state.lastError &&
          state.apiKeyConfigured &&
          !error &&
          e(Banner, {
            tone: 'danger',
            message: `${t('common.error')}: ${state.lastError}`,
            onClose: () => setState((prev) => ({ ...prev, lastError: null })),
            closeLabel: t('common.close'),
          }),

        // Tabs
        e(
          'div',
          {
            role: 'tablist',
            'aria-label': t('title'),
            style: { display: 'flex', gap: 8, borderBottom: `1px solid ${T.border}`, marginBottom: 20, paddingBottom: 2 },
          },
          [
            { id: 'billing', label: t('tab.billing'), icon: Icons.Chart },
            { id: 'models', label: `${t('tab.models')} (${state.modelsCount})`, icon: Icons.Cpu },
            { id: 'config', label: t('tab.config'), icon: Icons.Settings },
          ].map((tab, index, all) => {
            const isActive = activeTab === tab.id
            return e(
              'button',
              {
                key: tab.id,
                id: `dc-ai-tab-${tab.id}`,
                type: 'button',
                role: 'tab',
                'aria-selected': isActive,
                'aria-controls': `dc-ai-panel-${tab.id}`,
                tabIndex: isActive ? 0 : -1,
                onKeyDown: (ev) => {
                  // ARIA tablist keyboard contract: Left/Right move between
                  // tabs, Home/End jump to the edges.
                  const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0
                  let next
                  if (step !== 0) next = all[(index + step + all.length) % all.length]
                  else if (ev.key === 'Home') next = all[0]
                  else if (ev.key === 'End') next = all[all.length - 1]
                  else return
                  ev.preventDefault()
                  setActiveTab(next.id)
                },
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
                  transition: 'color 0.15s ease, background 0.15s ease',
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

        // ── Billing ─────────────────────────────────────────────────────────
        activeTab === 'billing' &&
          e(
            'div',
            { role: 'tabpanel', id: 'dc-ai-panel-billing', 'aria-labelledby': 'dc-ai-tab-billing', tabIndex: 0 },
            billing.loading && !billing.loaded
              ? e('div', { style: { padding: 40, textAlign: 'center', opacity: 0.7 } }, t('billing.loading'))
              : billing.missingKey
                ? e(
                    'div',
                    { style: { ...cardStyle, textAlign: 'center', padding: 32 } },
                    e('div', { style: { fontSize: 14, color: T.labelSec } }, t('billing.missingKey')),
                  )
                : billing.error
                  ? e(
                      'div',
                      { style: { ...cardStyle, textAlign: 'center', padding: 32 } },
                      e('div', { style: { fontSize: 16, fontWeight: 600, color: T.warning, marginBottom: 8 } }, t('billing.errorTitle')),
                      e('div', { style: { fontSize: 13, color: T.labelSec, marginBottom: 16, overflowWrap: 'anywhere' } }, billing.error),
                      e(
                        'button',
                        { type: 'button', style: buttonStyle(false), onClick: () => fetchBillingData() },
                        e(Icons.Refresh, { size: 14 }),
                        t('btn.retry'),
                      ),
                    )
                  : e(
                      'div',
                      null,
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

                        // Window
                        e(
                          'div',
                          { style: cardStyle },
                          e(
                            'div',
                            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 } },
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
                            e('span', { style: { fontSize: 13, color: T.labelSec } }, `/ ${formatUSD(windowLimitUsd)} ${t('billing.available')}`),
                          ),
                          e(ProgressBar, { percent: windowPercent, color: T.accent }),
                          e(
                            'div',
                            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
                            e(Metric, { label: `${t('billing.used')}:`, value: formatUSD(windowUsedUsd) }),
                            e(Metric, {
                              label: `${t('billing.requests')}:`,
                              value: sub?.window_limit?.total_requests ?? usage?.window_usage?.total_requests ?? '—',
                            }),
                            e(Metric, {
                              label: `${t('billing.windowTokens')}:`,
                              value: formatTokens(sub?.window_limit?.tokens ?? usage?.window_usage?.tokens),
                            }),
                            e(Metric, { label: `${t('billing.resetAt')}:`, value: formatDateTime(windowResetAt) }),
                          ),
                        ),

                        // Daily
                        e(
                          'div',
                          { style: cardStyle },
                          e(
                            'div',
                            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 } },
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
                            e('span', { style: { fontSize: 13, color: T.labelSec } }, `/ ${formatUSD(dailyLimitUsd)} ${t('billing.today')}`),
                          ),
                          e(ProgressBar, { percent: dailyPercent, color: T.purple }),
                          e(
                            'div',
                            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
                            e(Metric, { label: `${t('billing.used')}:`, value: formatUSD(dailyUsedUsd) }),
                            e(Metric, {
                              label: `${t('billing.usageRate')}:`,
                              value:
                                typeof dailyUsedUsd === 'number' && typeof dailyLimitUsd === 'number'
                                  ? `${dailyPercent.toFixed(1)}%`
                                  : '—',
                            }),
                            e(Metric, { label: `${t('billing.todayTokens')}:`, value: formatTokens(usage?.used_today_tokens) }),
                            e(Metric, { label: `${t('billing.dailyResetAt')}:`, value: formatDateTime(dailyResetAt) }),
                          ),
                        ),

                        // Balance
                        e(
                          'div',
                          { style: cardStyle },
                          e(
                            'div',
                            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 } },
                            e('span', { style: { fontSize: 12, fontWeight: 600, color: T.cyan, letterSpacing: '0.04em' } }, t('billing.balanceTitle')),
                            sub &&
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
                          e('div', { style: { height: 1, background: T.border, marginBottom: 12 } }),
                          e(
                            'div',
                            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
                            e(Metric, { label: `${t('billing.plan')}:`, value: sub?.plan?.title || '—' }),
                            e(Metric, {
                              label: `${t('billing.period')}:`,
                              value: sub?.quota_period ? `${sub.quota_period}` : '—',
                            }),
                            e(Metric, { label: `${t('billing.hardLimit')}:`, value: formatUSD(sub?.hard_limit_usd) }),
                            e(Metric, { label: `${t('billing.softLimit')}:`, value: formatUSD(sub?.soft_limit_usd) }),
                          ),
                        ),
                      ),

                      // History
                      Array.isArray(usage?.window_costs) && usage.window_costs.length > 0
                        ? e(
                            'div',
                            { style: cardStyle },
                            e(
                              'div',
                              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8 } },
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
                                    e('th', { scope: 'col', style: { padding: '8px 12px' } }, t('billing.colWindow')),
                                    e('th', { scope: 'col', style: { padding: '8px 12px' } }, t('billing.colTime')),
                                    e('th', { scope: 'col', style: { padding: '8px 12px', textAlign: 'right' } }, t('billing.colRequests')),
                                    e('th', { scope: 'col', style: { padding: '8px 12px', textAlign: 'right' } }, t('billing.colTokens')),
                                    e('th', { scope: 'col', style: { padding: '8px 12px', textAlign: 'right' } }, t('billing.colCost')),
                                  ),
                                ),
                                e(
                                  'tbody',
                                  null,
                                  usage.window_costs.map((w, idx) => {
                                    // `cost` carries no unit suffix and is in cents.
                                    // Verified against the live gateway: `total_usage / 100`
                                    // matches `window_usage.used_usd` to twelve decimals, and
                                    // `total_usage` itself equals `daily_costs[].cost`. The
                                    // gateway mixes units, so only a field with an `_usd`
                                    // twin can be read directly — `hard_limit` is 1e-7 USD
                                    // while `hard_limit_usd` is USD. Values here are rounded
                                    // to two decimals, unlike `total_usage`.
                                    const costUsd = typeof w.cost === 'number' ? w.cost / 100 : undefined
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
                                      e('td', { style: { padding: '10px 12px', textAlign: 'right', fontWeight: 500 } }, formatTokens(w.tokens)),
                                      e(
                                        'td',
                                        {
                                          style: {
                                            padding: '10px 12px',
                                            textAlign: 'right',
                                            fontWeight: 600,
                                            color:
                                              typeof costUsd === 'number' && costUsd > 10
                                                ? T.danger
                                                : typeof costUsd === 'number' && costUsd > 1
                                                  ? T.warning
                                                  : T.label,
                                          },
                                        },
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

        // ── Models ──────────────────────────────────────────────────────────
        activeTab === 'models' &&
          e(
            'div',
            { style: cardStyle, role: 'tabpanel', id: 'dc-ai-panel-models', 'aria-labelledby': 'dc-ai-tab-models', tabIndex: 0 },
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
              e(
                'div',
                { role: 'group', style: { display: 'flex', gap: 6 } },
                [
                  { id: 'all', label: t('models.filterAll', { count: state.modelsCount }) },
                  { id: 'thinking', label: t('models.filterThinking', { count: state.thinkingCount }) },
                  { id: 'vision', label: t('models.filterVision', { count: state.visionCount }) },
                ].map((filter) => {
                  const isSelected = modelFilter === filter.id
                  return e(
                    'button',
                    {
                      key: filter.id,
                      type: 'button',
                      'aria-pressed': isSelected,
                      style: {
                        padding: '5px 12px',
                        fontSize: 12,
                        borderRadius: 6,
                        border: isSelected ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                        background: isSelected ? T.accentBg : 'transparent',
                        color: isSelected ? T.accent : T.labelSec,
                        cursor: 'pointer',
                      },
                      onClick: () => setModelFilter(filter.id),
                    },
                    filter.label,
                  )
                }),
              ),
            ),

            e(
              'div',
              { style: { marginBottom: 14, position: 'relative' } },
              e('label', { htmlFor: 'dc-ai-model-search', style: { position: 'absolute', left: -9999 } }, t('models.searchPlaceholder')),
              e('input', {
                id: 'dc-ai-model-search',
                type: 'search',
                style: { ...inputStyle, paddingLeft: 34 },
                value: search,
                onChange: (ev) => setSearch(ev.target.value),
                placeholder: t('models.searchPlaceholder'),
              }),
              e('div', { style: fieldIconStyle }, e(Icons.Search, { size: 15 })),
            ),

            e(
              'div',
              { style: { maxHeight: 460, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 8 } },
              filteredModels.length === 0
                ? e(
                    'div',
                    { style: { padding: 32, textAlign: 'center', opacity: 0.6, fontSize: 13 } },
                    state.modelsCount === 0 ? t('models.empty') : t('models.notFound'),
                  )
                : filteredModels.map((m, idx) => {
                    const isVision = Array.isArray(m.input) && m.input.includes('image')
                    const levelCount = Array.isArray(m.efforts) ? m.efforts.filter((level) => level !== 'off').length : 0
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
                          e('span', { 'aria-hidden': 'true' }, '•'),
                          e('span', null, `${m.contextWindow ? m.contextWindow.toLocaleString() : '—'} ${t('models.tokensContext')}`),
                          m.maxTokens && e('span', null, `• ${m.maxTokens.toLocaleString()} ${t('models.maxOutput')}`),
                        ),
                      ),
                      e(
                        'div',
                        { style: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 } },
                        m.thinking &&
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
                            t('models.thinkingLevels', { count: levelCount }),
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

        // ── Config ──────────────────────────────────────────────────────────
        activeTab === 'config' &&
          e(
            'div',
            { style: cardStyle, role: 'tabpanel', id: 'dc-ai-panel-config', 'aria-labelledby': 'dc-ai-tab-config', tabIndex: 0 },
            e('h3', { style: { margin: '0 0 16px', fontSize: 16, fontWeight: 650 } }, t('config.title')),

            e(
              'div',
              { style: { marginBottom: 16 } },
              e('label', { htmlFor: 'dc-ai-base-url', style: { fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' } }, t('config.baseURL')),
              e(
                'div',
                { style: { position: 'relative' } },
                e('input', {
                  id: 'dc-ai-base-url',
                  type: 'url',
                  inputMode: 'url',
                  style: inputStyle,
                  value: baseURL,
                  onChange: (ev) => setBaseURL(ev.target.value),
                  placeholder: 'https://dc-ai.dabeecao.org',
                }),
                e('div', { style: fieldIconStyle }, e(Icons.Globe, { size: 15 })),
              ),
            ),

            e(
              'div',
              { style: { marginBottom: 18 } },
              e(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 } },
                e('label', { htmlFor: 'dc-ai-api-key', style: { fontSize: 13, fontWeight: 600, margin: 0 } }, t('config.apiKey')),
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
                      t('config.keyStored', { ref: state.apiKeyEnv }),
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
                    id: 'dc-ai-api-key',
                    style: inputStyle,
                    type: showKey ? 'text' : 'password',
                    autoComplete: 'off',
                    spellCheck: false,
                    value: apiKey,
                    onChange: (ev) => setApiKey(ev.target.value),
                    placeholder: state.apiKeyConfigured ? t('config.keyChangePlaceholder') : t('config.keyPlaceholder'),
                  }),
                  e('div', { style: fieldIconStyle }, e(Icons.Key, { size: 15 })),
                ),
                e(
                  'button',
                  {
                    type: 'button',
                    style: buttonStyle(false),
                    'aria-pressed': showKey,
                    onClick: () => setShowKey(!showKey),
                  },
                  showKey ? e(Icons.EyeOff, { size: 14 }) : e(Icons.Eye, { size: 14 }),
                  showKey ? t('btn.hide') : t('btn.show'),
                ),
              ),
              e('p', { style: { margin: '6px 0 0', fontSize: 11, color: T.labelSec } }, t('config.keyHint')),
            ),

            e(
              'div',
              { style: { marginBottom: 20 } },
              e('div', { id: 'dc-ai-protocol-label', style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, t('config.protocolTitle')),
              e(
                'div',
                { role: 'radiogroup', 'aria-labelledby': 'dc-ai-protocol-label', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 } },
                [
                  {
                    id: 'openai-responses',
                    title: t('config.protoResponses'),
                    badge: t('config.protoResponsesBadge'),
                    badgePrimary: true,
                    desc: t('config.protoResponsesDesc'),
                  },
                  {
                    id: 'openai-completions',
                    title: t('config.protoCompletions'),
                    badge: t('config.protoCompletionsBadge'),
                    badgePrimary: false,
                    desc: t('config.protoCompletionsDesc'),
                  },
                ].map((option) => {
                  const isSelected = apiProtocol === option.id
                  return e(
                    'button',
                    {
                      key: option.id,
                      type: 'button',
                      role: 'radio',
                      'aria-checked': isSelected,
                      style: {
                        textAlign: 'left',
                        border: isSelected ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                        borderRadius: 8,
                        padding: '14px 16px',
                        cursor: 'pointer',
                        background: isSelected ? T.accentBg : 'transparent',
                        color: 'inherit',
                        font: 'inherit',
                      },
                      onClick: () => setApiProtocol(option.id),
                    },
                    e(
                      'div',
                      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 } },
                      e('strong', { style: { fontSize: 14 } }, option.title),
                      e(
                        'span',
                        {
                          style: {
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: option.badgePrimary ? T.accent : T.bgHover,
                            color: option.badgePrimary ? '#ffffff' : T.labelSec,
                            fontWeight: 600,
                          },
                        },
                        option.badge,
                      ),
                    ),
                    e('div', { style: { fontSize: 12, color: T.labelSec, lineHeight: 1.4 } }, option.desc),
                  )
                }),
              ),
            ),

            e(
              'div',
              { style: { marginBottom: 20 } },
              e('div', { id: 'dc-ai-advanced-label', style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, t('config.privateTitle')),
              e(
                'div',
                { role: 'group', 'aria-labelledby': 'dc-ai-advanced-label', style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                e(
                  'label',
                  {
                    htmlFor: 'dc-ai-allow-private',
                    style: {
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      border: `1px solid ${allowPrivate ? T.warning : T.border}`,
                      background: allowPrivate ? T.warningBg : 'transparent',
                      borderRadius: 8,
                      padding: '12px 14px',
                      cursor: 'pointer',
                    },
                  },
                  e('input', {
                    id: 'dc-ai-allow-private',
                    type: 'checkbox',
                    checked: allowPrivate,
                    onChange: (ev) => setAllowPrivate(ev.target.checked),
                    style: { marginTop: 2, flexShrink: 0 },
                  }),
                  e(
                    'div',
                    null,
                    e('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 3 } }, t('config.privateLabel')),
                    e('div', { style: { fontSize: 12, color: T.labelSec, lineHeight: 1.45 } }, t('config.privateDesc')),
                    allowPrivate &&
                      e(
                        'div',
                        { role: 'status', style: { fontSize: 12, color: T.warning, marginTop: 6, display: 'flex', gap: 5, alignItems: 'center' } },
                        e(Icons.Alert, { size: 12, color: T.warning }),
                        t('config.privateWarn'),
                      ),
                  ),
                ),
                e(
                  'label',
                  {
                    htmlFor: 'dc-ai-use-modelsdev',
                    style: {
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      border: `1px solid ${T.border}`,
                      borderRadius: 8,
                      padding: '12px 14px',
                      cursor: 'pointer',
                    },
                  },
                  e('input', {
                    id: 'dc-ai-use-modelsdev',
                    type: 'checkbox',
                    checked: useModelsDev,
                    onChange: (ev) => setUseModelsDev(ev.target.checked),
                    style: { marginTop: 2, flexShrink: 0 },
                  }),
                  e(
                    'div',
                    null,
                    e('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 3 } }, t('config.modelsDevLabel')),
                    e('div', { style: { fontSize: 12, color: T.labelSec, lineHeight: 1.45 } }, t('config.modelsDevDesc')),
                  ),
                ),
              ),
            ),

            e(
              'div',
              { style: { marginBottom: 20, borderTop: `1px solid ${T.border}`, paddingTop: 18 } },
              e(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 } },
                e('span', { style: { fontSize: 13, fontWeight: 600 } }, t('update.title')),
                e(
                  'span',
                  {
                    style: {
                      fontSize: 12,
                      fontFamily: 'var(--ui-mono, monospace)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: T.bgHover,
                      color: T.labelSec,
                    },
                  },
                  state.version ? `v${state.version}` : '—',
                ),
                e(
                  'button',
                  { type: 'button', style: buttonStyle(false), onClick: handleCheckUpdate, disabled: checkingUpdate },
                  e(Icons.Refresh, { size: 14 }),
                  checkingUpdate ? t('update.checking') : t('update.check'),
                ),
              ),
              update &&
                e(
                  'div',
                  { role: 'status', 'aria-live': 'polite', style: { fontSize: 12, lineHeight: 1.5 } },
                  update.error
                    ? e('span', { style: { color: T.labelSec } }, t('update.failed', { error: update.error }))
                    : update.outOfDate
                      ? e(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                          e(
                            'span',
                            {
                              style: {
                                color: T.warning,
                                background: T.warningBg,
                                padding: '4px 10px',
                                borderRadius: 6,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontWeight: 600,
                              },
                            },
                            e(Icons.Alert, { size: 12, color: T.warning }),
                            t('update.available', { version: `v${update.latest}` }),
                          ),
                          e(
                            'a',
                            {
                              href: update.releases,
                              target: '_blank',
                              rel: 'noreferrer noopener',
                              style: { color: T.accent, fontWeight: 600 },
                            },
                            t('update.open'),
                          ),
                        )
                      : e('span', { style: { color: T.success } }, t('update.upToDate')),
                ),
              e('p', { style: { margin: '8px 0 0', fontSize: 11, color: T.labelSec, lineHeight: 1.45 } }, t('update.note')),
            ),

            e(
              'div',
              { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
              e(
                'button',
                { type: 'button', style: buttonStyle(true), onClick: handleSave, disabled: saving },
                e(Icons.Check, { size: 14 }),
                saving ? t('btn.saving') : t('btn.save'),
              ),
              e(
                'button',
                { type: 'button', style: buttonStyle(false), onClick: handleTest, disabled: testing },
                e(Icons.Refresh, { size: 14 }),
                testing ? t('btn.testing') : t('btn.test'),
              ),
              testResult &&
                e(
                  'span',
                  {
                    role: 'status',
                    'aria-live': 'polite',
                    style: {
                      fontSize: 13,
                      color: testResult.ok ? T.success : T.danger,
                      background: testResult.ok ? T.successBg : T.dangerBg,
                      padding: '6px 12px',
                      borderRadius: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      overflowWrap: 'anywhere',
                    },
                  },
                  testResult.ok
                    ? e(Icons.CheckCircle, { size: 14, color: T.success })
                    : e(Icons.Alert, { size: 14, color: T.danger }),
                  testResult.ok
                    ? t('test.success', { latency: testResult.latencyMs, count: testResult.modelsCount })
                    : testResult.error === 'MISSING_KEY'
                      ? t('test.missingKey')
                      : t('test.fail', { error: testResult.error }),
                ),
            ),
          ),
      )
    }

    // ── Plugin ──────────────────────────────────────────────────────────────
    function apply(ctx) {
      const t = ctx.locale.bind(NS)

      // Dictionaries and the Vietnamese language pack are owned effects, so an
      // unload removes them. A second client plugin may already have registered
      // `vi`; that is not an error, and the namespace registration is skipped
      // when this bundle is re-evaluated.
      ctx.effect(() => {
        const disposers = []
        const attempt = (fn) => {
          try {
            const dispose = fn()
            if (typeof dispose === 'function') disposers.push(dispose)
          } catch (error) {
            if (!/already (registered|has locale)/i.test(String(error?.message))) throw error
          }
        }
        attempt(() => ctx.locale.register(NS, { zh: ZH, en: EN }))
        attempt(() => ctx.locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' }))
        attempt(() => ctx.locale.register(NS, 'vi', VI))
        return () => {
          for (const dispose of disposers.reverse()) dispose()
        }
      }, 'dc-ai-api: copy dictionaries')

      const slots = ctx.get('slots')
      if (!slots) return

      ctx.slots.inject('settings.section', () =>
        slots.register(
          {
            name: 'settings.section',
            id: NS,
            order: 35,
            label: () => t('nav'),
            locale: NS,
          },
          DCAISettingsPage,
        ),
      )
    }

    exports.name = 'dsh-dc-ai-api'
    exports.inject = ['slots', 'locale']
    exports.apply = apply
    return module.exports
  },
})
