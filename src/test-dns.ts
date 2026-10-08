import { request } from 'undici';
import { createDnsAgent, getDnsStats } from './dns.js';

async function main() {
  const agent1 = createDnsAgent();

  await request('https://example.com/', {
    dispatcher: agent1,
  });

  console.log('after first request:', getDnsStats());

  await agent1.close();

  const agent2 = createDnsAgent();

  await request('https://example.com/', {
    dispatcher: agent2,
  });

  console.log('after second request:', getDnsStats());

  await agent2.close();
}

main().catch(console.error);