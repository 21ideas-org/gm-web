import { editionPublic } from './editions.mjs';
export type Locale = 'ru' | 'en';
export const EN_EDITION_PUBLIC = editionPublic(import.meta.env.EN_EDITION_PUBLIC);
export const localePath = (locale: Locale, path = '') => `${locale === 'en' ? '/en' : ''}/${path}`;
export const labels = {
  ru: {
    home: 'главная', digests: 'дайджесты', support: 'поддержать', about: 'о gm_₿',
    primary: 'Primary', theme: 'Переключить тему', dark: 'Включить тёмную тему', light: 'Включить светлую тему',
    breadcrumbs: 'Хлебные крошки', topics: 'Темы выпуска', adjacent: 'Adjacent posts', prev: '← пред', next: 'след →',
    supportProject: 'Поддержать проект', postSupport: 'На сегодня всё. Дайджест оказался полезным? Поддержи проект!',
    recent: 'последние выпуски', all: 'все выпуски', empty: 'Пока нет опубликованных выпусков.',
    archiveDescription: 'Все выпуски. В хронологическом порядке.',
  },
  en: {
    home: 'home', digests: 'digests', support: 'support', about: 'about gm_₿',
    primary: 'Primary navigation', theme: 'Toggle theme', dark: 'Switch to dark theme', light: 'Switch to light theme',
    breadcrumbs: 'Breadcrumbs', topics: 'Edition topics', adjacent: 'Adjacent editions', prev: '← previous', next: 'next →',
    supportProject: 'Support the project', postSupport: "That’s all for today. Found this digest useful? Support the project!",
    recent: 'latest editions', all: 'all editions', empty: 'No English editions have been published yet. Please check back soon.',
    archiveDescription: 'All English editions, newest first.',
  },
} as const;
