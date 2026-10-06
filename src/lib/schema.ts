import type { Locale } from './locale';
import { SITE_TITLE, SITE_NAME } from '../consts';

const SITE = 'https://gm.21ideas.org';
const LOGO = `${SITE}/android-chrome-512x512.png`; // 512x512, in public/
const ORG_ID = `${SITE}/#org`;

export function organizationNode(locale: Locale = 'ru') {
	return {
		'@type': 'NewsMediaOrganization',
		'@id': locale === 'en' ? `${SITE}/en/#org` : ORG_ID,
		name: locale === 'en' ? 'GM, bitcoiner' : SITE_NAME,
		alternateName: SITE_TITLE,
		url: locale === 'en' ? `${SITE}/en/` : SITE,
		logo: { '@type': 'ImageObject', url: LOGO, width: 512, height: 512 },
		sameAs: [
			'https://t.me/bitcoin21ideas',
			'https://github.com/21ideas-org/gm-web',
			'https://21ideas.org',
		],
	};
}

export function websiteNode(locale: Locale = 'ru') {
	return {
		'@type': 'WebSite',
		'@id': `${SITE}/${locale === 'en' ? 'en/' : ''}#website`,
		url: locale === 'en' ? `${SITE}/en/` : SITE,
		name: locale === 'en' ? 'GM, bitcoiner' : SITE_NAME,
		inLanguage: locale === 'en' ? 'en-US' : 'ru-RU',
		publisher: { '@id': locale === 'en' ? `${SITE}/en/#org` : ORG_ID },
	};
}

export function newsArticleNode(o: {
	title: string;
	description: string;
	slug: string;
	pubDate: Date;
	image: string;
	locale?: Locale;
}) {
	const locale = o.locale ?? 'ru';
	const url = `${SITE}/${locale === 'en' ? 'en/' : ''}digests/${o.slug}/`;
	const iso = o.pubDate.toISOString();
	return {
		'@type': 'NewsArticle',
		'@id': `${url}#article`,
		headline: o.title, // keep <=110 chars for Google News
		description: o.description,
		inLanguage: locale === 'en' ? 'en-US' : 'ru-RU',
		datePublished: iso,
		dateModified: iso,
		image: [o.image],
		url,
		mainEntityOfPage: { '@type': 'WebPage', '@id': url },
		isAccessibleForFree: true,
		author: { '@id': locale === 'en' ? `${SITE}/en/#org` : ORG_ID }, // org-as-author (bot-generated digest)
		publisher: { '@id': locale === 'en' ? `${SITE}/en/#org` : ORG_ID },
		articleSection: locale === 'en' ? 'Bitcoin' : 'Биткоин',
	};
}

// FAQPage — machine-readable Q&A lifted near-verbatim by assistants/answer engines. The questions
// MUST mirror visible on-page content (Google's policy; also keeps the two in sync). Note: Google no
// longer shows FAQ rich results for non-gov/health sites, so this is for extraction/entity value,
// not a SERP snippet. One FAQPage per page.
export function faqPageNode(qas: { q: string; a: string }[]) {
	return {
		'@type': 'FAQPage',
		mainEntity: qas.map((x) => ({
			'@type': 'Question',
			name: x.q,
			acceptedAnswer: { '@type': 'Answer', text: x.a },
		})),
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
