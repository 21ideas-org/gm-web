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

// Generic BreadcrumbList. Each crumb's `path` is site-relative ('' = home,
// 'digests/', `tags/${slug}/`, …); the trailing slash matches our canonical URLs.
export function breadcrumbNode(crumbs: { name: string; path: string }[]) {
	return {
		'@type': 'BreadcrumbList',
		itemListElement: crumbs.map((c, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: c.name,
			item: `${SITE}/${c.path}`,
		})),
	};
}

export function graph(nodes: object[]) {
	return { '@context': 'https://schema.org', '@graph': nodes };
}
