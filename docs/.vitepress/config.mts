import { defineConfig } from 'vitepress'

const repo = 'https://github.com/vastsa/BokeBox'

export default defineConfig({
  title: 'BokeBox',
  description:
    'BokeBox · 私人 AI 播客工作室：多源内容转化为可收听的私人播客。开源 · LGPL-3.0',
  lang: 'zh-CN',
  // 本地 / 自定义域用 '/'；GitHub Pages 项目站由 CI 传入 --base /BokeBox/
  base: process.env.DOCS_BASE || '/',
  cleanUrls: true,
  // 本地推广草稿与包 README 不进入文档站
  srcExclude: [
    '**/promo/**',
    'README.md',
    // 兼容跳转页仅服务 GitHub 浏览，不进入文档站信息架构
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
    hostname: process.env.DOCS_SITE_URL || 'https://vastsa.github.io/BokeBox/',
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
    ['meta', { property: 'og:title', content: 'BokeBox · 私人 AI 播客工作室' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          '内容进匣，AI 成播。多源输入、人设音色可定制、MCP 与插件扩展、本地私有部署。',
      },
    ],
    [
      'meta',
      {
        property: 'og:image',
        content:
          'https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp',
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
  themeConfig: {
    logo: '/img/logo.webp',
    siteTitle: 'BokeBox',
    outline: {
      level: [2, 3],
      label: '本页目录',
    },
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
    nav: [
      {
        text: '指南',
        items: [
          { text: '快速开始', link: '/guide/getting-started' },
          { text: '做完第一期', link: '/guide/first-episode' },
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
          { text: 'Source 插件', link: '/development/source-plugin' },
          { text: 'TTS 插件', link: '/development/tts-plugin' },
          { text: 'Schedule 插件', link: '/development/schedule-plugin' },
          { text: 'Design Tokens', link: '/development/web-design-tokens' },
          { text: '贡献文档', link: '/development/contributing-docs' },
        ],
      },
      { text: '运维', link: '/ops/ci-cd' },
      {
        text: 'GitHub',
        link: repo,
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '做完第一期', link: '/guide/first-episode' },
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
            { text: 'Source 开发', link: '/development/source-plugin' },
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
            { text: 'Source 插件开发', link: '/development/source-plugin' },
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
    },
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: '在 GitHub 上编辑此页',
    },
    footer: {
      message: `Released under the <a href="${repo}/blob/main/LICENSE">LGPL-3.0</a> License.`,
      copyright: `Copyright © 2024-present <a href="${repo}">BokeBox</a>`,
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
  },
  vite: {
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
})
