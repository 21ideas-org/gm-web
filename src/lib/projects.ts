import { getCollection } from 'astro:content';
import type { Locale } from './locale';

export async function localizedProjects(locale: Locale) {
  const projects = await getCollection('projects');
  return projects
    .filter(project => locale === 'ru' || project.data.en)
    .map(project => ({
      ...project,
      data: {
        ...project.data,
        ...(locale === 'en' ? project.data.en : {}),
        telegram: locale === 'en' ? undefined : project.data.telegram,
      },
    }))
    .sort((a, b) => a.data.order - b.data.order);
}
