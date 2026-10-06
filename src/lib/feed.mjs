import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
const markdown = new MarkdownIt();
export const sanitizeFeedHtml = html => sanitizeHtml(html, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'img']),
  allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ['src', 'alt', 'title'] },
});
export const renderFeedContent = body => sanitizeFeedHtml(markdown.render(body));
