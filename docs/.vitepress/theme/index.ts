import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      'not-found': () =>
        h('div', { class: 'bokebox-notfound' }, [
          h('img', {
            src: '/img/logo.webp',
            alt: 'BokeBox',
            width: '96',
            height: '96',
          }),
          h('h1', '页面不存在'),
          h(
            'p',
            '链接可能已迁移到新的文档结构。试试首页或搜索。',
          ),
          h('p', { class: 'bokebox-notfound-actions' }, [
            h('a', { href: '/' }, '回到首页'),
            h('span', ' · '),
            h('a', { href: '/guide/getting-started' }, '快速开始'),
            h('span', ' · '),
            h('a', { href: '/guide/faq' }, 'FAQ'),
          ]),
        ]),
    })
  },
} satisfies Theme
