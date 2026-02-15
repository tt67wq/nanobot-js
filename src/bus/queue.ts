import type { InboundMessage, OutboundMessage } from './events';

type MessageHandler = (msg: OutboundMessage) => Promise<void>;

export class MessageBus {
  private inbound: InboundMessage[] = [];
  private outbound: OutboundMessage[] = [];
  private outboundSubscribers: Map<string, MessageHandler[]> = new Map();
  private running = false;

  async publishInbound(msg: InboundMessage): Promise<void> {
    this.inbound.push(msg);
  }

  async consumeInbound(): Promise<InboundMessage> {
    while (this.inbound.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.inbound.shift()!;
  }

  async publishOutbound(msg: OutboundMessage): Promise<void> {
    this.outbound.push(msg);
  }

  async consumeOutbound(): Promise<OutboundMessage> {
    while (this.outbound.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.outbound.shift()!;
  }

  subscribeOutbound(channel: string, callback: MessageHandler): void {
    const handlers = this.outboundSubscribers.get(channel) ?? [];
    handlers.push(callback);
    this.outboundSubscribers.set(channel, handlers);
  }

  async dispatchOutbound(): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        const msg = await this.getNextOutbound(1000);
        if (msg) {
          const subscribers = this.outboundSubscribers.get(msg.channel) ?? [];
          for (const callback of subscribers) {
            try {
              await callback(msg);
            } catch (e) {
              console.error(`Error dispatching to ${msg.channel}:`, e);
            }
          }
        }
      } catch {
        // Timeout - continue loop
      }
    }
  }

  private async getNextOutbound(timeoutMs: number): Promise<OutboundMessage | null> {
    const start = Date.now();
    while (this.outbound.length === 0) {
      if (Date.now() - start > timeoutMs) {
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.outbound.shift()!;
  }

  stop(): void {
    this.running = false;
  }

  get inboundSize(): number {
    return this.inbound.length;
  }

  get outboundSize(): number {
    return this.outbound.length;
  }
}
