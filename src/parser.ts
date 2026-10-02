import * as cheerio from 'cheerio';

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');

    if (!href) {
      return;
    }

    try {
      const url = new URL(href, baseUrl);

      // only crawling http..s pages
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return;
      }
      // remove fragments: /docs#id --> /docs
      url.hash = '';
      links.add(url.toString());
    } catch {
      // ignore invalid URLs
    }
  })

  return [...links];
}
