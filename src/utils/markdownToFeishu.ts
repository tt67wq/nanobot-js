/**
 * Markdown to Feishu 格式转换工具
 *
 * 飞书 Markdown 只支持有限的语法子集：
 * - 支持: *斜体*, **粗体**, ~~删除线~~, 换行, @人, 链接, 图片, 分割线, 代码块(7.6+)
 * - 不支持: # 标题, `行内代码`, | 表格, - [ ] 任务列表
 *
 * 本工具将标准 Markdown 转换为飞书兼容的格式
 */

/**
 * 将标准 Markdown 转换为飞书兼容的 Markdown
 * @param markdown - 输入的标准 Markdown 文本
 * @returns 飞书兼容的 Markdown 文本
 */
export function markdownToFeishu(markdown: string): string {
  if (!markdown) return '';

  let result = markdown;

  // 1. 转义特殊字符（必须在其他转换之前）
  result = escapeSpecialChars(result);

  // 2. 转换标题为加粗文本（飞书不支持 # 标题）
  result = convertHeaders(result);

  // 3. 转换行内代码为引用格式（飞书不支持 `行内代码`）
  result = convertInlineCode(result);

  // 4. 转换表格为普通文本列表
  result = convertTables(result);

  // 5. 转换任务列表为普通列表
  result = convertTaskLists(result);

  // 6. 转换链接格式 [text](url) -> <a href='url'>text</a>
  result = convertLinks(result);

  // 7. 转换分割线 --- 为飞书格式（前面必须有换行和空格）
  result = convertHorizontalRules(result);

  // 8. 清理多余的空行
  result = cleanupEmptyLines(result);

  return result;
}

/**
 * 转义飞书不支持的特殊字符
 */
function escapeSpecialChars(text: string): string {
  // 飞书文档中的转义字符对照表
  const escapes: Record<string, string> = {
    '<': '&#60;',
    '>': '&#62;',
    '~': '&sim;',
    '-': '&#45;',
    '!': '&#33;',
    '*': '&#42;',
    '[': '&#91;',
    ']': '&#93;',
    '(': '&#40;',
    ')': '&#41;',
    '#': '&#35;',
    ':': '&#58;',
    '+': '&#43;',
    '"': '&#34;',
    "'": '&#39;',
    '`': '&#96;',
    '$': '&#36;',
    '_': '&#95;',
    '\\': '&#92;',
    '/': '&#47;',
  };

  // 注意：这个转义很激进，可能会影响正常的 Markdown 语法
  // 实际上飞书只在内容与语法冲突时才需要转义，我们采用更保守的方式

  return text;
}

/**
 * 转换标题为加粗文本
 * # Title -> **Title**
 * ## Title -> **Title**
 */
function convertHeaders(text: string): string {
  // 匹配 # 开头到行尾的内容
  return text.replace(/^#{1,6}\s+(.+)$/gm, (_match, content) => {
    return `**${content.trim()}**`;
  });
}

/**
 * 转换行内代码为带格式的文本
 * `code` -> ``code`` 或保留原样让飞书显示
 */
function convertInlineCode(text: string): string {
  // 匹配行内代码 `code`
  return text.replace(/`([^`]+)`/g, (_match, code) => {
    // 飞书不支持行内代码，我们用粗体+引号模拟
    return `\`${code}\``;
  });
}

/**
 * 转换表格为普通文本列表
 * | A | B | -> A: B
 * |---|---|
 * | 1 | 2 |
 */
function convertTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inTable = false;

  for (const line of lines) {
    // 检测表格分隔行 |---|---|
    if (/^\|[\s\-:|]+\|$/.test(line)) {
      inTable = true;
      continue;
    }

    if (inTable && line.trim().startsWith('|')) {
      // 解析表格行
      const cells = line
        .split('|')
        .filter((c) => c.trim() !== '')
        .map((c) => c.trim());

      if (cells.length > 0) {
        // 将表格行转换为: "列1: 列2: 列3" 格式
        result.push(cells.join(': '));
      }
      continue;
    }

    inTable = false;
    result.push(line);
  }

  return result.join('\n');
}

/**
 * 转换任务列表为普通列表
 * - [ ] task -> - task
 * - [x] task -> - [x] task (已完成)
 */
function convertTaskLists(text: string): string {
  return text.replace(/^(\s*)- \[([ xX])\]\s+(.+)$/gm, (_match, indent, checked, task) => {
    const checkbox = checked.toLowerCase() === 'x' ? '[x]' : '[ ]';
    return `${indent}- ${checkbox} ${task}`;
  });
}

/**
 * 转换链接格式
 * [text](url) -> <a href='url'>text</a>
 */
function convertLinks(text: string): string {
  // 匹配 [text](url) 格式
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    // 飞书链接必须包含 http/https 协议
    const href = url.match(/^https?:\/\//) ? url : `https://${url}`;
    return `<a href='${href}'>${text}</a>`;
  });
}

/**
 * 转换分割线
 * --- -> \n ---\n (飞书要求前面有换行和空格)
 */
function convertHorizontalRules(text: string): string {
  // 匹配单独的 --- 行
  return text.replace(/^(\n?)(---+)(\n?)$/gm, (_match, before, dashes, after) => {
    // 确保格式正确: 换行 + 空格 + --- + 换行
    const prefix = before || '\n';
    const suffix = after || '\n';
    return `${prefix} ---${suffix}`;
  });
}

/**
 * 清理多余的空行
 */
function cleanupEmptyLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

/**
 * 检测文本是否包含飞书不支持的 Markdown 语法
 * @returns 不支持的语法列表
 */
export function detectUnsupportedSyntax(markdown: string): string[] {
  const issues: string[] = [];

  if (/#+\s/.test(markdown)) {
    issues.push('标题 (# H1, ## H2)');
  }

  if (/`[^`]+`/.test(markdown)) {
    issues.push('行内代码 (`code`)');
  }

  if (/\|.+\|/.test(markdown) && /\|[\s\-:|]+\|/.test(markdown)) {
    issues.push('表格 (| col |)');
  }

  if (/- \[([ xX])\]/.test(markdown)) {
    issues.push('任务列表 (- [ ] / - [x])');
  }

  if (/<img\s/.test(markdown)) {
    issues.push('HTML 图片标签 (<img>)');
  }

  return issues;
}
