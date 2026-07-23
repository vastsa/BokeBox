import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import './custom.css'

function NotFound() {
  const isEn =
    typeof window !== 'undefined' &&
    window.location.pathname.includes('/en')

  if (isEn) {
    return h('div', { class: 'bokebox-notfound' }, [
      h('img', { src: '/img/logo.webp', alt: 'BokeBox', width: '96', height: '96' }),
      h('h1', 'Page not found'),
      h('p', 'This URL may have moved with the docs restructure. Try home or search.'),
      h('p', { class: 'bokebox-notfound-actions' }, [
        h('a', { href: '/en/' }, 'Home'),
        h('span', ' · '),
        h('a', { href: '/en/guide/getting-started' }, 'Getting started'),
        h('span', ' · '),
        h('a', { href: '/en/guide/faq' }, 'FAQ'),
        h('span', ' · '),
        h('a', { href: '/' }, '中文'),
      ]),
    ])
  }

  return h('div', { class: 'bokebox-notfound' }, [
    h('img', { src: '/img/logo.webp', alt: 'BokeBox', width: '96', height: '96' }),
    h('h1', '页面不存在'),
    h('p', '链接可能已迁移到新的文档结构。试试首页或搜索。'),
    h('p', { class: 'bokebox-notfound-actions' }, [
      h('a', { href: '/' }, '回到首页'),
      h('span', ' · '),
      h('a', { href: '/guide/getting-started' }, '快速开始'),
      h('span', ' · '),
      h('a', { href: '/guide/faq' }, 'FAQ'),
      h('span', ' · '),
      h('a', { href: '/en/' }, 'English'),
    ]),
  ])
}

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      'not-found': () => h(NotFound),
    })
  },
} satisfies Theme
