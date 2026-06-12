/**
 * WebSocket client for real-time document sync.
 *
 * Connects to same-origin `/ws` with the server-injected `WS_TOKEN`,
 * subscribes to a document id, and handles `doc-changed` events.
 * Auto-reconnects with exponential backoff on disconnect.
 */

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10000;
const RECONNECT_FACTOR = 2;

interface DocChangedEvent {
  type: "doc-changed";
  id: string;
  version: string;
  origin: string;
}

export type ConnectionStatus = "connected" | "reconnecting" | "offline";

interface WsClientCallbacks {
  onDocChanged: (event: DocChangedEvent) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

interface WsClientConfig {
  docId: string;
  callbacks: WsClientCallbacks;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_MIN_MS;
  private connecting = false;
  private status: ConnectionStatus = "offline";

  private readonly docId: string;
  private readonly callbacks: WsClientCallbacks;

  constructor(config: WsClientConfig) {
    this.docId = config.docId;
    this.callbacks = config.callbacks;
  }

  connect(): void {
    if (this.connecting || this.ws?.readyState === WebSocket.OPEN) return;

    this.connecting = true;
    this.setStatus("reconnecting");

    try {
      const config = (window as unknown as Record<string, unknown>).__DOC_COLLAB_CONFIG as
        | { wsToken: string }
        | undefined;
      if (!config?.wsToken) {
        this.setStatus("offline");
        this.connecting = false;
        return;
      }

      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${location.host}/ws?token=${encodeURIComponent(config.wsToken)}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connecting = false;
        this.reconnectDelay = RECONNECT_MIN_MS;
        this.setStatus("connected");
        // Subscribe to the document.
        this.ws?.send(JSON.stringify({ type: "subscribe", ids: this.docId }));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as DocChangedEvent;
          if (data.type === "doc-changed") {
            this.callbacks.onDocChanged(data);
          }
        } catch {
          // Ignore malformed messages.
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.connecting = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // onclose will fire after onerror; no action needed here.
      };
    } catch {
      this.connecting = false;
      this.setStatus("offline");
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connecting = false;
    this.setStatus("offline");
  }

  get isConnected(): boolean {
    return this.status === "connected";
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.callbacks.onStatusChange?.(status);
    }
  }

  private scheduleReconnect(): void {
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(
      this.reconnectDelay * RECONNECT_FACTOR,
      RECONNECT_MAX_MS,
    );
  }
}
