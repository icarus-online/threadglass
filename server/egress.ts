// Chromium's CONNECT tunnel connects to a validated, pinned IP. DNS rebinding
// cannot change the destination between validation and connection.
import http from 'node:http';
import net from 'node:net';
import { allowedResource, resolvePublic } from './security.ts';
export async function createEgress() {
  const sockets = new Set<net.Socket>();
  const server = http.createServer((_req, res) => {
    res.writeHead(403).end();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('connect', (req, client, head) => {
    void (async () => {
      try {
        if (!req.url || !/^[-a-z0-9.]+:443$/i.test(req.url)) throw new Error('Invalid tunnel');
        const host = req.url.slice(0, -4);
        if (!allowedResource('https://' + host)) throw new Error('Host not allowed');
        const address = await resolvePublic(host);
        if (client.destroyed) return;
        const remote = net.connect({ host: address.address, family: address.family, port: 443 });
        sockets.add(remote);
        remote.once('close', () => sockets.delete(remote));
        remote.setTimeout(30_000, () => remote.destroy());
        remote.once('connect', () => {
          if (client.destroyed) {
            remote.destroy();
            return;
          }
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) remote.write(head);
          client.pipe(remote);
          remote.pipe(client);
        });
        remote.on('error', () => client.destroy());
        client.on('error', () => remote.destroy());
        client.once('close', () => remote.destroy());
      } catch {
        client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
