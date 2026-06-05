import { getCollection } from 'astro:content';

export async function getAllTags(): Promise<string[]> {
	const posts = await getCollection('digests', ({ data }) => !data.draft);
	const tags = posts.flatMap((post) => post.data.tags);
	return [...new Set(tags)].sort();
}

export async function tagCounts(): Promise<Map<string, number>> {
	const posts = await getCollection('digests', ({ data }) => !data.draft);
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.data.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return counts;
}
