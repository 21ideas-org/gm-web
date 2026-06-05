import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const digests = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/digests' }),
	schema: z.object({
		title: z.string(), // "Доброе утро, биткоинер — 5 июня 2026"
		description: z.string(), // teaser → Discord/Telegram
		pubDate: z.coerce.date(),
		draft: z.boolean().default(false),
		tags: z.array(z.string()).default([]), // present but unsurfaced in v1
	}),
});

const projects = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
	schema: z.object({
		name: z.string(),
		description: z.string(),
		status: z.enum(['LIVE', 'WIP', 'ARCHIVED']),
		url: z.url().optional(), // canonical link to the project / channel
		repo: z.url().optional(), // source repository (optional second link)
		stack: z.array(z.string()).optional(), // ecosystem links don't need a tech stack
		featured: z.boolean().default(false),
		order: z.number().default(0),
	}),
});

export const collections = { digests, projects };
