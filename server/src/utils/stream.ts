/**
 * Workers-compatible stream utilities replacing Node.js streams.
 */

/**
 * Convert a ReadableStream to an ArrayBuffer
 */
export async function streamToBuffer(stream: ReadableStream): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

/**
 * Convert an ArrayBuffer/Uint8Array to a ReadableStream
 */
export function bufferToStream(buffer: ArrayBuffer | Uint8Array): ReadableStream {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

/**
 * Create a text line stream (for JSON Lines streaming like the sync protocol)
 */
export function createJsonLinesStream(): {
  readable: ReadableStream;
  write: (obj: unknown) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;

  const readable = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  return {
    readable,
    write(obj: unknown) {
      controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
    },
    close() {
      controller.close();
    },
  };
}

/**
 * Pipe a ReadableStream through a transform and return a new ReadableStream
 */
export function pipeThrough<T>(
  source: ReadableStream<T>,
  transform: TransformStream<T, Uint8Array>,
): ReadableStream<Uint8Array> {
  return source.pipeThrough(transform);
}

/**
 * Convert a ReadableStream to a Uint8Array
 */
export async function streamToUint8Array(stream: ReadableStream): Promise<Uint8Array> {
  const buffer = await streamToBuffer(stream);
  return new Uint8Array(buffer);
}

/**
 * Convert a ReadableStream to a string
 */
export async function streamToString(stream: ReadableStream): Promise<string> {
  const buffer = await streamToBuffer(stream);
  return new TextDecoder().decode(buffer);
}
