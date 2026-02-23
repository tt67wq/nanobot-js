import { OpenAIProvider } from "../src/providers/openai";
import type { Message } from "../src/providers/base";

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
  console.error("❌ 请设置 DASHSCOPE_API_KEY 环境变量");
  console.log("   export DASHSCOPE_API_KEY='your-api-key'");
  process.exit(1);
}

async function main() {
  console.log("🧪 测试 OpenAI Provider + Qwen3.5-plus 图片理解\n");

  const provider = new OpenAIProvider(
    apiKey,
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  );

  const messages: Message[] = [
    {
      role: "system",
      content: "你是一个有帮助的助手。",
    },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241022/emyrja/dog_and_girl.jpeg",
          },
        },
        {
          type: "text",
          text: "图中描绘的是什么景象?",
        },
      ],
    },
  ];

  try {
    console.log("📤 发送图片理解请求...");
    console.log("   图片: https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241022/emyrja/dog_and_girl.jpeg");
    console.log("   模型: qwen3.5-plus\n");

    const response = await provider.chat({
      model: "qwen3.5-plus",
      messages,
      maxTokens: 1024,
    });

    console.log("✅ 响应成功!\n");
    console.log("📝 结果:");
    console.log("─".repeat(50));
    console.log(response.content);
    console.log("─".repeat(50));
    console.log(`\n📊 Finish Reason: ${response.finishReason}`);
    console.log(`📊 Usage: ${JSON.stringify(response.usage)}`);
  } catch (error) {
    console.error("❌ 请求失败:", error);
    process.exit(1);
  }
}

main();
