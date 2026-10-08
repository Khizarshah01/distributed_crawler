import dns from 'node:dns';
import { Agent } from 'undici';

type CachedAddress = {
  address: string;
  family: number;
};

type CacheEntry = {
  addresses: CachedAddress[];
  expiresAt: number;
};

const TTL_MS = 60_000;

const cache = new Map<string, CacheEntry>();

let cacheHits = 0;
let cacheMisses = 0;

function cachedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    address?: string | dns.LookupAddress[],
    family?: number,
  ) => void,
) {
  const family = options.family ?? 0;
  const key = `${hostname}:${family}`;

  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    cacheHits++;

    if (options.all) {
      callback(null, cached.addresses);
      return;
    }

    const address = cached.addresses[0];

    if (!address) {
      callback(new Error(`No address found for ${hostname}`));
      return;
    }

    callback(null, address.address, address.family);
    return;
  }

  cacheMisses++;

  dns.lookup(
    hostname,
    {
      family,
      all: true,
      hints: options.hints,
    },
    (error, addresses) => {
      if (error) {
        callback(error);
        return;
      }

      cache.set(key, {
        addresses,
        expiresAt: Date.now() + TTL_MS,
      });

      if (options.all) {
        callback(null, addresses);
        return;
      }

      const address = addresses[0];

      if (!address) {
        callback(new Error(`No address found for ${hostname}`));
        return;
      }

      callback(null, address.address, address.family);
    },
  );
}

export function createDnsAgent() {
  return new Agent({
    connect: {
      lookup: cachedLookup as any,
    },
  });
}

export const dnsAgent = createDnsAgent();

export function getDnsStats() {
  const total = cacheHits + cacheMisses;

  return {
    hits: cacheHits,
    misses: cacheMisses,
    entries: cache.size,
    hitRate: total === 0 ? 0 : cacheHits / total,
  };
}