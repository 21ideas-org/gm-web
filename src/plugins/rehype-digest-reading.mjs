// The marked Markdown paragraph remains an ordinary linked paragraph in RSS.
export function rehypeDigestReading() {
  return tree => {
    for (const [index, paragraph] of (tree.children ?? []).entries()) {
      if (paragraph.type !== 'element' || paragraph.tagName !== 'p') continue;
      const link = paragraph.children?.find(child => child.tagName === 'a' &&
        child.properties?.title === 'Материал 21ideas по теме' &&
        /^https:\/\/21ideas\.org\//.test(child.properties?.href));
      if (!link) continue;
      const preceding = tree.children.slice(0, index).filter(node => node.type === 'element');
      if (preceding.at(-1)?.tagName !== 'p' || preceding.at(-2)?.tagName !== 'h4') continue;
      delete link.properties.title;
      tree.children[index] = { type: 'element', tagName: 'aside', properties: { className: ['reading-note'] },
        children: [paragraph] };
      break;
    }
  };
}
