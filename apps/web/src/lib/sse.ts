// SSE 客户端封装
export type SSEEventHandler<T> = (data: T) => void
export type SSEErrorHandler = (err: Event) => void

export function connectSSE<T>(
  url: string,
  onEvent: SSEEventHandler<T>,
  onError?: SSEErrorHandler,
): () => void {
  const es = new EventSource(url)

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as T
      onEvent(data)
    } catch {
      // ignore parse errors
    }
  }

  if (onError) es.onerror = onError

  return () => es.close()
}
