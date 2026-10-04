import _robotsParser from 'robots-parser';

type RobotsParserFn = typeof _robotsParser.default;
const robotsParser = _robotsParser as unknown as RobotsParserFn;

const USER_AGENT = 'distributed-crawler/0.1';

const cache = new Map<string, ReturnType<RobotsParserFn>>();

export async function canCrawl(url: string): Promise<boolean> {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.origin}/robots.txt`;

    let robots = cache.get(parsedUrl.origin);

    if (!robots) {
        const response = await fetch(robotsUrl, {
            headers: {
                'User-Agent': USER_AGENT,
            },
            signal: AbortSignal.timeout(10_000),
        });

        // 404 means the site has no robots.txt.
        if (response.status === 404) {
            robots = robotsParser(robotsUrl, '');
        } else if (response.ok) {
            const content = await response.text();
            robots = robotsParser(robotsUrl, content);
        } else {
            // For now, don't crawl if robots.txt can't be reached normally.
            return false;
        }

        cache.set(parsedUrl.origin, robots);
    }

    return robots.isAllowed(url, USER_AGENT) ?? false;
}