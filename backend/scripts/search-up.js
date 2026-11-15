// npm run search:up
// Starts SnackHub's own Elasticsearch in Docker on this laptop (127.0.0.1:9201, security off,
// 512 MB): the container is made the first time and started again after that. Port 9201 keeps
// it apart from any other project's Elasticsearch on 9200. Needs Docker Desktop running.
// Then `npm run search:reindex` fills it.
import { execFileSync } from 'node:child_process';

const NAME = 'snackhub-elastic';
const IMAGE = 'docker.elastic.co/elasticsearch/elasticsearch:8.15.0';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

try {
  docker('info', '--format', '{{.ServerVersion}}');
} catch {
  console.error('Docker is not running. Start Docker Desktop, then run this again.');
  process.exit(1);
}
const exists = docker('ps', '-a', '--filter', `name=^${NAME}$`, '--format', '{{.Names}}') === NAME;
if (exists) docker('start', NAME);
else {
  console.log(`Downloading and starting ${IMAGE} (the first time takes a few minutes)...`);
  docker('run', '-d', '--name', NAME, '--restart', 'unless-stopped', '-p', '127.0.0.1:9201:9200', '-e', 'discovery.type=single-node', '-e', 'xpack.security.enabled=false', '-e', 'ES_JAVA_OPTS=-Xms512m -Xmx512m', '-v', 'snackhub-elastic:/usr/share/elasticsearch/data', IMAGE);
}
for (let i = 0; i < 60; i += 1) {
  try {
    const res = await fetch('http://127.0.0.1:9201/_cluster/health', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      console.log('Elasticsearch is up on http://127.0.0.1:9201. Next: npm run search:reindex');
      process.exit(0);
    }
  } catch {
    // still starting
  }
  await new Promise((r) => setTimeout(r, 2000));
}
console.error('Elasticsearch did not answer within two minutes. Check: docker logs snackhub-elastic');
process.exit(1);
