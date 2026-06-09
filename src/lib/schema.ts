import { SITE_TITLE, SITE_NAME } from '../consts';

const SITE = 'https://gm.21ideas.org';
const LOGO = `${SITE}/android-chrome-512x512.png`; // 512x512, in public/
const ORG_ID = `${SITE}/#org`;

export function organizationNode() {
	return {
		'@type': 'NewsMediaOrganization',
		'@id': ORG_ID,
		name: SITE_NAME,
		alternateName: SITE_TITLE,
		url: SITE,
		logo: { '@type': 'ImageObject', url: LOGO, width: 512, height: 512 },
		sameAs: [
			'https://t.me/bitcoin21ideas',
			'https://github.com/21ideas-org/gm-web',
			'https://21ideas.org',
		],
	};
}

export function websiteNode() {
	return {
		'@type': 'WebSite',
		'@id': `${SITE}/#website`,
		url: SITE,
		name: SITE_NAME,
		inLanguage: 'ru-RU',
		publisher: { '@id': ORG_ID },
	};
}

export function newsArticleNode(o: {
	title: string;
	description: string;
	slug: string;
	pubDate: Date;
	image: string;
}) {
	const url = `${SITE}/digests/${o.slug}/`;
	const iso = o.pubDate.toISOString();
	return {
		'@type': 'NewsArticle',
		'@id': `${url}#article`,
		headline: o.title, // keep <=110 chars for Google News
		description: o.description,
		inLanguage: 'ru-RU',
		datePublished: iso,
		dateModified: iso,
		image: [o.image],
		url,
		mainEntityOfPage: { '@type': 'WebPage', '@id': url },
		isAccessibleForFree: true,
		author: { '@id': ORG_ID }, // org-as-author (bot-generated digest)
		publisher: { '@id': ORG_ID },
		articleSection: 'Биткоин',
	};
}

export function breadcrumbNode(o: { slug: string; dateLabel: string }) {
	const url = `${SITE}/digests/${o.slug}/`;
	return {
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE}/` },
			{ '@type': 'ListItem', position: 2, name: 'Дайджесты', item: `${SITE}/digests/` },
			{ '@type': 'ListItem', position: 3, name: o.dateLabel, item: url },
		],
	};
}

export function graph(nodes: object[]) {
	return { '@context': 'https://schema.org', '@graph': nodes };
}
