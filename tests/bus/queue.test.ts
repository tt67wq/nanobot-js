import { describe, it, expect, beforeEach } from 'bun:test';
import { MessageBus } from '../../src/bus/queue';
import type { InboundMessage, OutboundMessage } from '../../src/bus/events';

describe('MessageBus', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe('publishInbound() and consumeInbound()', () => {
    it('should publish and consume inbound messages', async () => {
      const msg: InboundMessage = {
        channel: 'cli',
        senderId: 'user1',
        chatId: 'direct',
        content: 'Hello'
      };

      await bus.publishInbound(msg);
      const consumed = await bus.consumeInbound();
      
      expect(consumed).toEqual(msg);
    });

    it('should handle multiple inbound messages in order', async () => {
      const msg1: InboundMessage = { channel: 'cli', senderId: 'user1', chatId: 'chat1', content: 'First' };
      const msg2: InboundMessage = { channel: 'cli', senderId: 'user2', chatId: 'chat2', content: 'Second' };

      await bus.publishInbound(msg1);
      await bus.publishInbound(msg2);

      const consumed1 = await bus.consumeInbound();
      const consumed2 = await bus.consumeInbound();

      expect(consumed1.content).toBe('First');
      expect(consumed2.content).toBe('Second');
    });
  });

  describe('publishOutbound() and consumeOutbound()', () => {
    it('should publish and consume outbound messages', async () => {
      const msg: OutboundMessage = {
        channel: 'cli',
        chatId: 'direct',
        content: 'Response'
      };

      await bus.publishOutbound(msg);
      const consumed = await bus.consumeOutbound();
      
      expect(consumed).toEqual(msg);
    });
  });

  describe('subscribeOutbound()', () => {
    it('should subscribe to a channel and receive messages', async () => {
      const received: OutboundMessage[] = [];
      
      bus.subscribeOutbound('cli', async (msg) => {
        received.push(msg);
      });

      bus.dispatchOutbound();

      await bus.publishOutbound({ channel: 'cli', chatId: 'chat1', content: 'Test' });
      await bus.publishOutbound({ channel: 'cli', chatId: 'chat2', content: 'Test2' });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(received).toHaveLength(2);
      expect(received[0].content).toBe('Test');
      expect(received[1].content).toBe('Test2');
    });

    it('should not deliver messages to unsubscribed channels', async () => {
      const received: OutboundMessage[] = [];
      
      bus.subscribeOutbound('cli', async (msg) => {
        received.push(msg);
      });

      bus.dispatchOutbound();

      await bus.publishOutbound({ channel: 'feishu', chatId: 'chat1', content: 'Test' });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(received).toHaveLength(0);
    });
  });

  describe('inboundSize and outboundSize', () => {
    it('should return correct queue sizes', async () => {
      expect(bus.inboundSize).toBe(0);
      expect(bus.outboundSize).toBe(0);

      await bus.publishInbound({ channel: 'cli', senderId: 'u1', chatId: 'c1', content: 'm1' });
      await bus.publishInbound({ channel: 'cli', senderId: 'u2', chatId: 'c2', content: 'm2' });

      expect(bus.inboundSize).toBe(2);

      await bus.publishOutbound({ channel: 'cli', chatId: 'c1', content: 'r1' });

      expect(bus.outboundSize).toBe(1);

      await bus.consumeInbound();
      expect(bus.inboundSize).toBe(1);
    });
  });

  describe('stop()', () => {
    it('should stop the dispatcher', async () => {
      const dispatchPromise = bus.dispatchOutbound();
      bus.stop();
      
      await expect(dispatchPromise).resolves.toBeUndefined();
    });
  });
});
