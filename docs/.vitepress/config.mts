import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'BokeBox',
  description:
    'BokeBox · 私人 AI 播客工作室：多源内容转化为可收听的私人播客。开源 · LGPL-3.0',
  lang: 'zh-CN',
  // 以仓库 docs/ 为站点根；GitHub Pages 可按需改 base
  base: '/',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: [
    // 本地开发 API / 示例命令中的地址
    /^https?:\/\/localhost/,
    // monorepo 外目录（构建时不在 docs 根下）
    /\.\.\/\.\.\/examples\//,
    /\.\.\/\.\.\/apps\//,
  ],
  head: [
    ['link', { rel: 'icon', href: '/img/logo.webp', type: 'image/webp' }],
    ['meta', { name: 'theme-color', content: '#7C5CFF' }],
    [
      'meta',
      {
        property: 'og:title',
        content: 'BokeBox · 私人 AI 播客工作室',
      },
    ],
    [
      'meta',
      {
        property: 'og:description',
        content: '内容进匣，AI 成播。多源输入、人设音色可定制、MCP 与插件扩展、本地私有部署。',
      },
    ],
    [
      'meta',
      {
        property: 'og:image',
        content: 'https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp',
      },
    ],
  ],
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
      { text: '指南', link: '/guide/getting-started' },
      { text: '插件', link: '/plugins/source' },
      { text: '开发', link: '/development/source-plugin' },
      { text: '运维', link: '/ops/ci-cd' },
      {
        text: 'GitHub',
        link: 'https://github.com/vastsa/BokeBox',
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '项目介绍', link: '/guide/introduction' },
          ],
        },
      ],
      '/plugins/': [
        {
          text: '插件说明',
          items: [
            { text: 'Source 插件', link: '/plugins/source' },
            { text: 'ASR / TTS 插件', link: '/plugins/asr-tts' },
            { text: 'Schedule 订阅插件', link: '/plugins/schedule' },
          ],
        },
      ],
      '/development/': [
        {
          text: '插件开发',
          items: [
            { text: 'Source 插件开发', link: '/development/source-plugin' },
            { text: 'TTS 插件开发', link: '/development/tts-plugin' },
            { text: 'Schedule 插件开发', link: '/development/schedule-plugin' },
          ],
        },
        {
          text: '前端',
          items: [
            { text: 'Design Tokens', link: '/development/web-design-tokens' },
          ],
        },
      ],
      '/ops/': [
        {
          text: '运维与发布',
          items: [{ text: 'Docker CI/CD', link: '/ops/ci-cd' }],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/vastsa/BokeBox' },
    ],
    editLink: {
      pattern: 'https://github.com/vastsa/BokeBox/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },
    footer: {
      message:
        'Released under the <a href="https://github.com/vastsa/BokeBox/blob/main/LICENSE">LGPL-3.0</a> License.',
      copyright:
        'Copyright © 2024-present <a href="https://github.com/vastsa/BokeBox">BokeBox</a>',
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
  // public 目录：docs/public 下的文件会原样拷贝到站点根
  // 图片仍放在 docs/img，通过 rewrites / 直接引用 /img 路径
  vite: {
    // monorepo 根有其他 vite 项目时，避免错误解析
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
})
