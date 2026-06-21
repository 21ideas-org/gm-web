import { getCollection } from 'astro:content';
import { SITE_NAME } from '../consts';
import { formatRuDate } from '../lib/date';
import { TAGS, tagItemCounts } from '../lib/tags';

// /llms.txt — a concise, machine-readable map of the site for LLMs / answer engines
// (llmstxt.org convention: H1 name → blockquote summary → context → link sections).
// Built at build time from the content collections; the daily rebuild keeps it fresh.
// Adoption by the big labs is still unproven (Google has said it doesn't use it), so this
// is cheap, on-brand insurance — not a load-bearing channel. The real AI-retrieval path is
// the search index (IndexNow→Bing→ChatGPT, news sitemap→Google→Gemini).
const SITE = 'https://gm.21ideas.org';
const RECENT = 30; // latest digests to list inline; the full archive is linked below

export async function GET() {
	const digests = (await getCollection('digests', (p) => !p.data.draft)).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
	const recent = digests.slice(0, RECENT);

	const counts = await tagItemCounts();
	const hubs = TAGS.map((t) => ({ ...t, count: counts.get(t.slug) ?? 0 }))
		.filter((t) => t.count > 0)
		.sort((a, b) => b.count - a.count);

	const recentList = recent
		.map(
			(p) =>
				`- [Выпуск за ${formatRuDate(p.data.pubDate)}](${SITE}/digests/${p.id}/): ${p.data.description}`,
		)
		.join('\n');

	const hubList = hubs
		.map((t) => `- [${t.hubTitle}](${SITE}/tags/${t.slug}/): ${t.hubDesc}`)
		.join('\n');

	const text = `# ${SITE_NAME}

> Ежедневный биткоин-онли новостной дайджест на русском языке: краткая сводка главных событий сети Биткоин за минувшие сутки, со ссылками на первоисточники.

«Доброе утро, биткоинер» (gm_₿) — ежедневный новостной дайджест на русском языке, посвящённый исключительно биткоину. Каждое утро выходит короткая сводка значимых событий за последние 24 часа: цена и рынок, майнинг, Lightning и второй слой, разработка протокола, регулирование, институциональные инвесторы и биткоин-казначейства, безопасность и расследования. Каждый пункт сопровождается ссылкой на первоисточник; выпуск открывается блоком статистики сети (цена, хешрейт, мемпул, обратный отсчёт до халвинга). Выпуски формируются автоматически (ИИ-сборка с кураторской проверкой) и публикуются с 2025 года. Материал носит исключительно информационный характер — без рекламы, инвестиционных рекомендаций и альткоинов. Проект некоммерческий, входит в образовательную экосистему 21ideas.

## Последние выпуски

${recentList}

## Топики

${hubList}

## Ресурсы

- [О проекте](${SITE}/about/): что такое gm_₿, как устроены дайджесты и как за ними следить
- [Все выпуски](${SITE}/digests/): полный архив ежедневных дайджестов
- [RSS-лента](${SITE}/rss.xml): подписка с полным текстом выпусков
- [Telegram](https://t.me/bitcoin21ideas): ежедневные анонсы свежих выпусков
- [Исходный код](https://github.com/21ideas-org/gm-web): сайт с открытым исходным кодом (MIT)
- [21ideas](https://21ideas.org): образовательная биткоин-экосистема, частью которой является проект
`;

	return new Response(text, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
