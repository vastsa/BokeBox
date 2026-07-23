import { defineConfig, type DefaultTheme } from 'vitepress'

const repo = 'https://github.com/vastsa/BokeBox'

function navZh(): DefaultTheme.NavItem[] {
  return [
    {
      text: '指南',
      items: [
        { text: '快速开始', link: '/guide/getting-started' },
        { text: '做完第一期', link: '/guide/first-episode' },
        { text: '设置中心', link: '/guide/settings' },
        { text: '项目介绍', link: '/guide/introduction' },
        { text: '功能清单', link: '/guide/features' },
        { text: '制作流水线', link: '/guide/pipeline' },
        { text: '定时订阅', link: '/guide/schedule' },
        { text: '架构概览', link: '/guide/architecture' },
        { text: '配置与环境变量', link: '/guide/configuration' },
        { text: '部署', link: '/guide/deployment' },
        { text: 'MCP 接入', link: '/guide/mcp' },
        { text: '常见问题', link: '/guide/faq' },
      ],
    },
    {
      text: '插件',
      items: [
        { text: '插件总览', link: '/plugins/' },
        { text: 'Source', link: '/plugins/source' },
        { text: 'ASR / TTS', link: '/plugins/asr-tts' },
        { text: 'Schedule', link: '/plugins/schedule' },
      ],
    },
    {
      text: '开发',
      items: [
        { text: '开发总览', link: '/development/' },
        { text: '示例插件', link: '/development/examples' },
        { text: '安装与管理', link: '/development/plugin-install' },
        { text: 'Source 插件', link: '/development/source-plugin' },
        { text: 'ASR 插件', link: '/development/asr-plugin' },
        { text: 'TTS 插件', link: '/development/tts-plugin' },
        { text: 'Schedule 插件', link: '/development/schedule-plugin' },
        { text: 'Design Tokens', link: '/development/web-design-tokens' },
        { text: '贡献文档', link: '/development/contributing-docs' },
      ],
    },
    { text: '运维', link: '/ops/ci-cd' },
    { text: 'GitHub', link: repo },
  ]
}

function navEn(): DefaultTheme.NavItem[] {
  return [
    {
      text: 'Guide',
      items: [
        { text: 'Getting started', link: '/en/guide/getting-started' },
        { text: 'First episode', link: '/en/guide/first-episode' },
        { text: 'Settings', link: '/en/guide/settings' },
        { text: 'Introduction', link: '/en/guide/introduction' },
        { text: 'Features', link: '/en/guide/features' },
        { text: 'Pipeline', link: '/en/guide/pipeline' },
        { text: 'Schedules', link: '/en/guide/schedule' },
        { text: 'Architecture', link: '/en/guide/architecture' },
        { text: 'Configuration', link: '/en/guide/configuration' },
        { text: 'Deployment', link: '/en/guide/deployment' },
        { text: 'MCP', link: '/en/guide/mcp' },
        { text: 'FAQ', link: '/en/guide/faq' },
      ],
    },
    {
      text: 'Plugins',
      items: [
        { text: 'Overview', link: '/en/plugins/' },
        { text: 'Source', link: '/en/plugins/source' },
        { text: 'ASR / TTS', link: '/en/plugins/asr-tts' },
        { text: 'Schedule', link: '/en/plugins/schedule' },
      ],
    },
    {
      text: 'Development',
      items: [
        { text: 'Overview', link: '/en/development/' },
        { text: 'Examples', link: '/en/development/examples' },
        { text: 'Install & manage', link: '/en/development/plugin-install' },
        { text: 'Source plugins', link: '/en/development/source-plugin' },
        { text: 'ASR plugins', link: '/en/development/asr-plugin' },
        { text: 'TTS plugins', link: '/en/development/tts-plugin' },
        { text: 'Schedule plugins', link: '/en/development/schedule-plugin' },
        { text: 'Design Tokens', link: '/en/development/web-design-tokens' },
        { text: 'Contributing docs', link: '/en/development/contributing-docs' },
      ],
    },
    { text: 'Ops', link: '/en/ops/ci-cd' },
    { text: 'GitHub', link: repo },
  ]
}

function sidebarZh(): DefaultTheme.Sidebar {
  return {
    '/guide/': [
      {
        text: '入门',
        items: [
          { text: '快速开始', link: '/guide/getting-started' },
          { text: '做完第一期', link: '/guide/first-episode' },
          { text: '设置中心', link: '/guide/settings' },
          { text: '项目介绍', link: '/guide/introduction' },
          { text: '功能清单', link: '/guide/features' },
          { text: '常见问题', link: '/guide/faq' },
        ],
      },
      {
        text: '使用',
        items: [
          { text: '制作流水线', link: '/guide/pipeline' },
          { text: '定时订阅', link: '/guide/schedule' },
          { text: 'MCP 接入', link: '/guide/mcp' },
        ],
      },
      {
        text: '部署与架构',
        items: [
          { text: '架构概览', link: '/guide/architecture' },
          { text: '配置与环境变量', link: '/guide/configuration' },
          { text: '部署', link: '/guide/deployment' },
        ],
      },
    ],
    '/plugins/': [
      {
        text: '插件说明',
        items: [
          { text: '插件总览', link: '/plugins/' },
          { text: 'Source 插件', link: '/plugins/source' },
          { text: 'ASR / TTS 插件', link: '/plugins/asr-tts' },
          { text: 'Schedule 订阅插件', link: '/plugins/schedule' },
        ],
      },
      {
        text: '去写插件',
        items: [
          { text: '开发总览', link: '/development/' },
          { text: '示例插件', link: '/development/examples' },
          { text: '安装与管理', link: '/development/plugin-install' },
          { text: 'Source 开发', link: '/development/source-plugin' },
          { text: 'ASR 开发', link: '/development/asr-plugin' },
          { text: 'TTS 开发', link: '/development/tts-plugin' },
          { text: 'Schedule 开发', link: '/development/schedule-plugin' },
        ],
      },
    ],
    '/development/': [
      {
        text: '插件开发',
        items: [
          { text: '开发总览', link: '/development/' },
          { text: '示例插件', link: '/development/examples' },
          { text: '安装与管理', link: '/development/plugin-install' },
          { text: 'Source 插件开发', link: '/development/source-plugin' },
          { text: 'ASR 插件开发', link: '/development/asr-plugin' },
          { text: 'TTS 插件开发', link: '/development/tts-plugin' },
          { text: 'Schedule 插件开发', link: '/development/schedule-plugin' },
        ],
      },
      {
        text: '前端与文档',
        items: [
          { text: 'Design Tokens', link: '/development/web-design-tokens' },
          { text: '贡献文档', link: '/development/contributing-docs' },
        ],
      },
      {
        text: '背景',
        items: [
          { text: '架构概览', link: '/guide/architecture' },
          { text: '插件总览', link: '/plugins/' },
        ],
      },
    ],
    '/ops/': [
      {
        text: '运维与发布',
        items: [
          { text: 'Docker CI/CD', link: '/ops/ci-cd' },
          { text: '部署指南', link: '/guide/deployment' },
          { text: '环境变量', link: '/guide/configuration' },
          { text: '常见问题', link: '/guide/faq' },
        ],
      },
    ],
  }
}

function sidebarEn(): DefaultTheme.Sidebar {
  return {
    '/en/guide/': [
      {
        text: 'Start',
        items: [
          { text: 'Getting started', link: '/en/guide/getting-started' },
          { text: 'First episode', link: '/en/guide/first-episode' },
          { text: 'Settings', link: '/en/guide/settings' },
          { text: 'Introduction', link: '/en/guide/introduction' },
          { text: 'Features', link: '/en/guide/features' },
          { text: 'FAQ', link: '/en/guide/faq' },
        ],
      },
      {
        text: 'Usage',
        items: [
          { text: 'Pipeline', link: '/en/guide/pipeline' },
          { text: 'Schedules', link: '/en/guide/schedule' },
          { text: 'MCP', link: '/en/guide/mcp' },
        ],
      },
      {
        text: 'Deploy & architecture',
        items: [
          { text: 'Architecture', link: '/en/guide/architecture' },
          { text: 'Configuration', link: '/en/guide/configuration' },
          { text: 'Deployment', link: '/en/guide/deployment' },
        ],
      },
    ],
    '/en/plugins/': [
      {
        text: 'Plugin docs',
        items: [
          { text: 'Overview', link: '/en/plugins/' },
          { text: 'Source', link: '/en/plugins/source' },
          { text: 'ASR / TTS', link: '/en/plugins/asr-tts' },
          { text: 'Schedule', link: '/en/plugins/schedule' },
        ],
      },
      {
        text: 'Build plugins',
        items: [
          { text: 'Dev overview', link: '/en/development/' },
          { text: 'Examples', link: '/en/development/examples' },
          { text: 'Install & manage', link: '/en/development/plugin-install' },
          { text: 'Source dev', link: '/en/development/source-plugin' },
          { text: 'ASR dev', link: '/en/development/asr-plugin' },
          { text: 'TTS dev', link: '/en/development/tts-plugin' },
          { text: 'Schedule dev', link: '/en/development/schedule-plugin' },
        ],
      },
    ],
    '/en/development/': [
      {
        text: 'Plugin development',
        items: [
          { text: 'Overview', link: '/en/development/' },
          { text: 'Examples', link: '/en/development/examples' },
          { text: 'Install & manage', link: '/en/development/plugin-install' },
          { text: 'Source plugins', link: '/en/development/source-plugin' },
          { text: 'ASR plugins', link: '/en/development/asr-plugin' },
          { text: 'TTS plugins', link: '/en/development/tts-plugin' },
          { text: 'Schedule plugins', link: '/en/development/schedule-plugin' },
        ],
      },
      {
        text: 'Frontend & docs',
        items: [
          { text: 'Design Tokens', link: '/en/development/web-design-tokens' },
          { text: 'Contributing docs', link: '/en/development/contributing-docs' },
        ],
      },
      {
        text: 'Background',
        items: [
          { text: 'Architecture', link: '/en/guide/architecture' },
          { text: 'Plugins overview', link: '/en/plugins/' },
        ],
      },
    ],
    '/en/ops/': [
      {
        text: 'Ops & release',
        items: [
          { text: 'Docker CI/CD', link: '/en/ops/ci-cd' },
          { text: 'Deployment', link: '/en/guide/deployment' },
          { text: 'Configuration', link: '/en/guide/configuration' },
          { text: 'FAQ', link: '/en/guide/faq' },
        ],
      },
    ],
  }
}

export default defineConfig({
  title: 'BokeBox',
  description:
    'BokeBox · private AI podcast studio. Multi-source content to spoken episodes. Open source · LGPL-3.0',
  // 本地 / 自定义域用 '/'；GitHub Pages 项目站由 CI 传入 DOCS_BASE
  base: process.env.DOCS_BASE || '/',
  cleanUrls: true,
  srcExclude: [
    '**/promo/**',
    'README.md',
    'source-plugins.md',
    'asr-tts-plugins.md',
    'schedule-plugins.md',
    'source-plugin-development.md',
    'tts-plugin-development.md',
    'schedule-plugin-development.md',
    'web-design-tokens.md',
    'ci-cd.md',
  ],
  lastUpdated: true,
  sitemap: {
    hostname: process.env.DOCS_SITE_URL || 'https://bkb-docs.aiuo.net/',
  },
  ignoreDeadLinks: [
    /^https?:\/\/localhost/,
    /\.\.\/\.\.\/examples\//,
    /\.\.\/\.\.\/apps\//,
  ],
  head: [
    ['link', { rel: 'icon', href: '/img/logo.webp', type: 'image/webp' }],
    ['meta', { name: 'theme-color', content: '#7C5CFF' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'BokeBox · private AI podcast studio' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Content in, private podcasts out. Multi-source input, persona & voice, MCP, plugins, self-hosted.',
      },
    ],
    [
      'meta',
      {
        property: 'og:image',
        content:
          'https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_en.webp',
      },
    ],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],
  markdown: {
    lineNumbers: false,
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'BokeBox',
      description:
        'BokeBox · 私人 AI 播客工作室：多源内容转化为可收听的私人播客。开源 · LGPL-3.0',
      themeConfig: {
        logo: '/img/logo.webp',
        siteTitle: 'BokeBox',
        nav: navZh(),
        sidebar: sidebarZh(),
        outline: { level: [2, 3], label: '本页目录' },
        search: {
          provider: 'local',
          options: {
            translations: {
              button: { buttonText: '搜索', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '没有找到相关结果',
                resetButtonTitle: '清除查询',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
        editLink: {
          pattern: `${repo}/edit/main/docs/:path`,
          text: '在 GitHub 上编辑此页',
        },
        footer: {
          message: `基于 <a href="${repo}/blob/main/LICENSE">LGPL-3.0</a> 开源`,
          copyright: `Copyright © 2024-present <a href="${repo}">BokeBox</a>`,
        },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: {
          text: '最后更新',
          formatOptions: { dateStyle: 'medium', timeStyle: 'short' },
        },
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '主题',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        langMenuLabel: '切换语言',
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'BokeBox',
      description:
        'BokeBox · private AI podcast studio — multi-source content to spoken episodes. Open source · LGPL-3.0',
      themeConfig: {
        logo: '/img/logo.webp',
        siteTitle: 'BokeBox',
        nav: navEn(),
        sidebar: sidebarEn(),
        outline: { level: [2, 3], label: 'On this page' },
        search: {
          provider: 'local',
          options: {
            translations: {
              button: { buttonText: 'Search', buttonAriaLabel: 'Search docs' },
              modal: {
                noResultsText: 'No results',
                resetButtonTitle: 'Clear',
                footer: {
                  selectText: 'select',
                  navigateText: 'navigate',
                  closeText: 'close',
                },
              },
            },
          },
        },
        editLink: {
          pattern: `${repo}/edit/main/docs/:path`,
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: `Released under the <a href="${repo}/blob/main/LICENSE">LGPL-3.0</a> License.`,
          copyright: `Copyright © 2024-present <a href="${repo}">BokeBox</a>`,
        },
        docFooter: { prev: 'Previous', next: 'Next' },
        lastUpdated: {
          text: 'Last updated',
          formatOptions: { dateStyle: 'medium', timeStyle: 'short' },
        },
        returnToTopLabel: 'Back to top',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Theme',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
        langMenuLabel: 'Language',
      },
    },
  },
  themeConfig: {
    logo: '/img/logo.webp',
    socialLinks: [{ icon: 'github', link: repo }],
    // 语言切换出现在导航
  },
  vite: {
    server: {
      fs: { allow: ['..'] },
    },
  },
})
