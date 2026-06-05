// Custom Shiki themes that map only to the site's token palette.
// Three syntax colors: comments (--dim), keywords/keys/builtins/vars (--accent),
// strings (--muted). Everything else falls back to --text.

const sharedTokenScopes = {
	comment: [
		'comment',
		'comment.block',
		'comment.line',
		'punctuation.definition.comment',
	],
	accent: [
		'keyword',
		'keyword.control',
		'keyword.operator.new',
		'storage',
		'storage.type',
		'storage.modifier',
		'constant',
		'constant.language',
		'constant.numeric',
		'constant.character',
		'support.type.property-name',
		'meta.object-literal.key',
		'entity.name.tag',
		'entity.name.function',
		'entity.other.attribute-name',
		'support.function',
		'support.function.builtin',
		'variable.language',
		'variable.other.normal.shell',
		'variable.other.readwrite',
		'punctuation.definition.variable',
		'markup.heading',
		'markup.bold',
	],
	string: [
		'string',
		'string.quoted',
		'string.template',
		'string.unquoted.argument.shell',
		'punctuation.definition.string',
		'meta.string',
		'markup.inline.raw',
	],
};

function buildTheme({ name, type, bg, fg, dim, accent, muted }) {
	return {
		name,
		type,
		colors: {
			'editor.background': bg,
			'editor.foreground': fg,
		},
		tokenColors: [
			{
				scope: sharedTokenScopes.comment,
				settings: { foreground: dim, fontStyle: 'italic' },
			},
			{
				scope: sharedTokenScopes.accent,
				settings: { foreground: accent },
			},
			{
				scope: sharedTokenScopes.string,
				settings: { foreground: muted },
			},
		],
	};
}

export const gmDark = buildTheme({
	name: 'gm-dark',
	type: 'dark',
	bg: '#121216',
	fg: '#e6e6ea',
	dim: '#44444f',
	accent: '#ffb000',
	muted: '#8a8a96',
});

export const gmLight = buildTheme({
	name: 'gm-light',
	type: 'light',
	bg: '#efece4',
	fg: '#1a1a1a',
	dim: '#a8a190',
	accent: '#9a6700',
	muted: '#5b5a52',
});
