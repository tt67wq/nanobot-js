import { writeFileSync, existsSync, mkdirSync, createReadStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * 飞书图片处理模块
 */
export class FeishuImageHandler {
  private apiClient: any;

  constructor(apiClient: any) {
    this.apiClient = apiClient;
  }

  /**
   * 从飞书下载图片
   */
  async downloadImage(imageKey: string, messageId?: string): Promise<string | null> {
    if (!this.apiClient) {
      return null;
    }

    try {
      const tempDir = join(tmpdir(), 'nanobot_feishu_images');
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      let response: any;

      if (messageId) {
        response = await this.apiClient.im.messageResource.get({
          path: { message_id: messageId, file_key: imageKey },
          params: { type: 'image' },
        });
      } else {
        response = await this.apiClient.im.image.get({
          path: { image_key: imageKey },
        });
      }

      if (response.code !== undefined && response.code !== 0) {
        return null;
      }

      let ext = 'png';
      if (response.headers && response.headers['content-type']) {
        const contentType = response.headers['content-type'];
        if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
        else if (contentType.includes('gif')) ext = 'gif';
        else if (contentType.includes('webp')) ext = 'webp';
      }

      const imagePath = join(tempDir, `feishu_${imageKey}_${Date.now()}.${ext}`);

      if (response.data && Buffer.isBuffer(response.data)) {
        writeFileSync(imagePath, response.data);
      } else if (typeof response.writeFile === 'function') {
        await response.writeFile(imagePath);
      } else if (typeof response.getReadableStream === 'function') {
        const stream = response.getReadableStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        writeFileSync(imagePath, Buffer.concat(chunks));
      } else {
        return null;
      }

      return imagePath;

    } catch {
      return null;
    }
  }

  /**
   * 上传图片到飞书，返回可访问的 URL
   */
  async uploadImage(imagePath: string): Promise<string | null> {
    if (!this.apiClient) {
      return null;
    }

    try {
      const response = await this.apiClient.im.image.create({
        data: {
          image_type: 'message',
          image: createReadStream(imagePath) as any,
        },
      }) as any;

      if (response.code !== undefined && response.code !== 0) {
        return null;
      }

      const imageKey = response.data?.image_key || response.image_key;
      if (!imageKey) {
        return null;
      }

      return `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}`;

    } catch {
      return null;
    }
  }
}
