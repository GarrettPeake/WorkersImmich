/**
 * Minimal Socket.IO / Engine.IO v4 stub for Cloudflare Workers.
 *
 * The Immich frontend uses Socket.IO to determine server online status
 * and to receive the server version. This stub implements just enough
 * of the Engine.IO v4 + Socket.IO v4 wire protocol over WebSocket
 * to satisfy those needs.
 */

const SERVER_VERSION = { major: 2, minor: 5, patch: 2 };

export function handleSocketIO(request: Request): Response {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    // Socket.IO polling transport probe — return a valid EIO open packet
    // so the client doesn't error, but we only really support websocket.
    const sid = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const open = JSON.stringify({
      sid,
      upgrades: ['websocket'],
      pingInterval: 25000,
      pingTimeout: 20000,
    });
    // Engine.IO polling encodes as: <length>:0<json>
    const body = `${open.length + 1}:0${open}`;
    return new Response(body, {
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  server.accept();

  const sid = crypto.randomUUID().replace(/-/g, '').slice(0, 20);

  // Engine.IO OPEN packet (type 0)
  server.send(
    '0' +
      JSON.stringify({
        sid,
        upgrades: [],
        pingInterval: 25000,
        pingTimeout: 20000,
      }),
  );

  server.addEventListener('message', (event) => {
    const data = typeof event.data === 'string' ? event.data : '';

    // Socket.IO CONNECT to default namespace (type 4, subtype 0 → "40")
    if (data === '40' || data === '40/' || data.startsWith('40{')) {
      // CONNECT ACK
      server.send('40' + JSON.stringify({ sid }));
      // Emit on_server_version event (type 4, subtype 2 → "42")
      server.send('42' + JSON.stringify(['on_server_version', SERVER_VERSION]));
    }

    // Engine.IO PING from client (type 2) → respond with PONG (type 3)
    if (data === '2') {
      server.send('3');
    }

    // Engine.IO PONG from client (type 3) — no action needed
  });

  // Send periodic pings to keep the connection alive
  const pingInterval = setInterval(() => {
    try {
      server.send('2'); // Engine.IO PING
    } catch {
      clearInterval(pingInterval);
    }
  }, 25000);

  server.addEventListener('close', () => {
    clearInterval(pingInterval);
  });

  server.addEventListener('error', () => {
    clearInterval(pingInterval);
  });

  return new Response(null, { status: 101, webSocket: client });
}
