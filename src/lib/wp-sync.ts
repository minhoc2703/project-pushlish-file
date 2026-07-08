import { google } from 'googleapis';
import * as cheerio from 'cheerio';
import path from 'path';
import fs from 'fs';
import https from 'https';

// Interface cho cấu trúc dữ liệu bài viết WordPress
export interface WpPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  date: string;
  slug: string;
  link: string;
  featured_media?: number;
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url: string;
      title?: { rendered: string };
    }>;
  };
}

// Interface định dạng cấu trúc khối tài liệu để ghi vào Google Doc
interface TextStyleRange {
  type: 'bold' | 'italic' | 'underline' | 'link';
  start: number;
  end: number;
  url?: string;
}

interface DocBlock {
  type: 'heading' | 'paragraph' | 'list-item' | 'image';
  text?: string;
  level?: number; // Cho heading H1 - H6
  listType?: 'bullet' | 'number';
  imageUrl?: string;
  altText?: string;
  styles?: TextStyleRange[];
}

/**
 * Xác định Redirect URI dựa trên môi trường triển khai
 */
function getRedirectUri(): string {
  if (process.env.NEXTAUTH_URL) {
    return `${process.env.NEXTAUTH_URL}/api/auth/callback`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/auth/callback`;
  }
  return 'http://localhost:3001/api/auth/callback';
}

/**
 * Lấy Google Auth Client sử dụng OAuth2
 */
export function getGoogleAuth() {
  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const csPath = path.join(process.cwd(), 'client-secret.json');
    if (fs.existsSync(csPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(csPath, 'utf8'));
        const web = parsed.web || parsed.installed;
        if (web) {
          clientId = web.client_id;
          clientSecret = web.client_secret;
        }
      } catch (e) {
        console.error('Error reading client-secret.json:', e);
      }
    }
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      'Không tìm thấy Client ID hoặc Client Secret. Vui lòng cấu hình OAuth Client.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    getRedirectUri()
  );

  // Ưu tiên đọc token từ env var (Vercel), fallback sang file (local)
  const tokenEnv = process.env.GOOGLE_OAUTH_TOKEN;
  if (tokenEnv) {
    try {
      const token = JSON.parse(tokenEnv);
      oauth2Client.setCredentials(token);
    } catch (e) {
      console.error('Error parsing GOOGLE_OAUTH_TOKEN env var:', e);
    }
  } else {
    const tokenPath = path.join(process.cwd(), 'token.json');
    if (fs.existsSync(tokenPath)) {
      try {
        const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        oauth2Client.setCredentials(token);
      } catch (e) {
        console.error('Error reading token.json:', e);
      }
    }
  }

  return oauth2Client;
}

/**
 * Lấy danh sách bài viết hoặc trang tĩnh từ WordPress REST API
 */
export async function fetchWpPosts(
  siteUrl: string,
  page = 1,
  perPage = 10,
  contentType: 'posts' | 'pages' = 'posts'
): Promise<WpPost[]> {
  // Chuẩn hóa URL
  let cleanUrl = siteUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  cleanUrl = cleanUrl.replace(/\/+$/, '');

  const apiUrl = `${cleanUrl}/wp-json/wp/v2/${contentType}?_embed&page=${page}&per_page=${perPage}`;
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    },
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(`Không thể kết nối tới WordPress API: ${response.statusText} (${response.status})`);
  }
  return response.json();
}

/**
 * Parse HTML thành các Block có cấu trúc
 */
export function parseHtmlToBlocks(htmlContent: string): DocBlock[] {
  const $ = cheerio.load(htmlContent);

  // Xóa các thành phần Table of Contents (TOC) trước khi bóc tách
  $('[id*="toc"], [class*="toc"], .toc, .table-of-contents, #toc_container, .ez-toc-container, .lwptoc').remove();

  const blocks: DocBlock[] = [];

  // Duyệt qua các thẻ con trực tiếp của body
  $('body > *').each((_, element) => {
    const tagName = element.tagName.toLowerCase();

    // 1. Xử lý Heading
    if (/^h[1-6]$/.test(tagName)) {
      const level = parseInt(tagName.charAt(1));
      const { text, styles } = parseParagraphContent($, element);
      if (text.trim()) {
        blocks.push({
          type: 'heading',
          text,
          level,
          styles,
        });
      }
    }
    // 2. Xử lý Paragraph
    else if (tagName === 'p') {
      // Kiểm tra nếu đoạn văn chỉ chứa ảnh
      const imgInP = $(element).find('img');
      if (imgInP.length > 0 && $(element).text().trim() === '') {
        imgInP.each((_, imgEl) => {
          const imageUrl = $(imgEl).attr('src');
          const altText = $(imgEl).attr('alt') || '';
          if (imageUrl) {
            blocks.push({
              type: 'image',
              imageUrl,
              altText,
            });
          }
        });
      } else {
        const { text, styles } = parseParagraphContent($, element);
        if (text.trim()) {
          blocks.push({
            type: 'paragraph',
            text,
            styles,
          });
        }
      }
    }
    // 3. Xử lý Lists
    else if (tagName === 'ul' || tagName === 'ol') {
      const listType = tagName === 'ol' ? 'number' : 'bullet';
      $(element).find('> li').each((_, liEl) => {
        const { text, styles } = parseParagraphContent($, liEl);
        if (text.trim()) {
          blocks.push({
            type: 'list-item',
            text,
            listType,
            styles,
          });
        }
      });
    }
    // 4. Xử lý thẻ Figure (thường chứa ảnh trong WordPress Gutenberg editor)
    else if (tagName === 'figure') {
      const imgEl = $(element).find('img');
      if (imgEl.length > 0) {
        const imageUrl = imgEl.attr('src');
        const altText = imgEl.attr('alt') || '';
        if (imageUrl) {
          blocks.push({
            type: 'image',
            imageUrl,
            altText,
          });
        }
      }
    }
    // 5. Thẻ Img trực tiếp
    else if (tagName === 'img') {
      const imageUrl = $(element).attr('src');
      const altText = $(element).attr('alt') || '';
      if (imageUrl) {
        blocks.push({
          type: 'image',
          imageUrl,
          altText,
        });
      }
    }
    // 6. Trường hợp khác (ví dụ: div, blockquote, pre) - lấy text thường
    else {
      // Nếu có thẻ img bên trong, vẫn bóc tách
      const imgs = $(element).find('img');
      if (imgs.length > 0) {
        imgs.each((_, imgEl) => {
          const imageUrl = $(imgEl).attr('src');
          if (imageUrl) {
            blocks.push({
              type: 'image',
              imageUrl: imageUrl,
              altText: $(imgEl).attr('alt') || '',
            });
          }
        });
      }

      const { text, styles } = parseParagraphContent($, element);
      if (text.trim()) {
        blocks.push({
          type: 'paragraph',
          text,
          styles,
        });
      }
    }
  });

  return blocks;
}

/**
 * Đệ quy parse các node con để lấy Text phẳng kèm danh sách Style
 */
function parseParagraphContent($: cheerio.CheerioAPI, element: any): { text: string; styles: TextStyleRange[] } {
  let text = '';
  const styles: TextStyleRange[] = [];

  function walk(node: any) {
    if (node.type === 'text') {
      text += (node as any).data;
    } else if (node.type === 'tag') {
      const tagEl = node as any;
      const tagName = tagEl.tagName.toLowerCase();
      const start = text.length;

      // Đệ quy duyệt các node con trước
      if (tagEl.childNodes) {
        tagEl.childNodes.forEach(walk);
      }

      const end = text.length;

      // Không add style nếu text trống
      if (start === end) return;

      if (tagName === 'strong' || tagName === 'b') {
        styles.push({ type: 'bold', start, end });
      } else if (tagName === 'em' || tagName === 'i') {
        styles.push({ type: 'italic', start, end });
      } else if (tagName === 'u') {
        styles.push({ type: 'underline', start, end });
      }
      // Bỏ qua thẻ 'a' (không đồng bộ link dẫn) theo yêu cầu người dùng
    }
  }

  if (element.childNodes) {
    element.childNodes.forEach(walk);
  } else {
    text = $(element).text();
  }

  return { text, styles };
}

/**
 * Tải file từ URL và trả về Buffer bằng chiến lược thử lại nhiều lần (Fallback)
 * Giúp vượt qua các chế độ bảo mật Cloudflare / WAF khác nhau trên Vercel
 */
async function downloadImageAsBuffer(url: string): Promise<Buffer> {
  const errors: string[] = [];

  // Lấy origin từ URL ảnh để dùng làm Referer
  let referer = '';
  try {
    const urlObj = new URL(url);
    referer = urlObj.origin + '/';
  } catch (e) {}

  const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Cách 1: Thử dùng fetch với User-Agent đơn giản (giống như cách lấy WP posts thành công trên Vercel)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': browserUserAgent,
        'Accept': 'image/webp,image/apng,image/*,*/*'
      },
      cache: 'no-store'
    });
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    errors.push(`Cách 1 (fetch): HTTP ${response.status}`);
  } catch (err: any) {
    errors.push(`Cách 1 (fetch) lỗi: ${err.message}`);
  }

  // Cách 2: Thử dùng https.get gốc với đầy đủ headers trình duyệt bao gồm Referer
  try {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const headers: Record<string, string> = {
        'User-Agent': browserUserAgent,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      };
      if (referer) {
        headers['Referer'] = referer;
      }
      https.get(url, { headers, timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: any[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });
    return buffer;
  } catch (err: any) {
    errors.push(`Cách 2 (https.get + referer) lỗi: ${err.message}`);
  }

  // Cách 3: Thử dùng https.get gốc KHÔNG có Referer (phòng trường hợp hotlink protection chặn referer giả)
  try {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const headers: Record<string, string> = {
        'User-Agent': browserUserAgent,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      };
      https.get(url, { headers, timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: any[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });
    return buffer;
  } catch (err: any) {
    errors.push(`Cách 3 (https.get không referer) lỗi: ${err.message}`);
  }

  // Cách 4: Thử dùng fetch thô hoàn toàn không gửi headers
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    errors.push(`Cách 4 (fetch thô): HTTP ${response.status}`);
  } catch (err: any) {
    errors.push(`Cách 4 (fetch thô) lỗi: ${err.message}`);
  }

  throw new Error(`Đã thử 4 cách tải ảnh đều thất bại. Chi tiết lỗi: ${errors.join(' | ')}`);
}


/**
 * Tạo thư mục trên Google Drive
 */
async function createDriveFolder(driveClient: any, name: string, parentId?: string): Promise<string> {
  const fileMetadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined,
  };

  const folder = await driveClient.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  return folder.data.id;
}

/**
 * Upload ảnh lên Google Drive và chia sẻ chế độ Public Read (để Google Docs API fetch được)
 */
async function uploadImageToDriveAndGetUrl(
  driveClient: any,
  imageUrl: string,
  fileName: string,
  parentFolderId: string
): Promise<{ fileId: string; publicUrl: string }> {
  const buffer = await downloadImageAsBuffer(imageUrl);
  
  // Xác định Content-Type
  let contentType = 'image/jpeg';
  if (imageUrl.endsWith('.png')) contentType = 'image/png';
  else if (imageUrl.endsWith('.gif')) contentType = 'image/gif';
  else if (imageUrl.endsWith('.webp')) contentType = 'image/webp';

  const fileMetadata = {
    name: fileName,
    parents: [parentFolderId],
  };

  // Upload file lên Drive
  const file = await driveClient.files.create({
    requestBody: fileMetadata,
    media: {
      mimeType: contentType,
      body: require('stream').Readable.from(buffer),
    },
    fields: 'id, webContentLink',
  });

  const fileId = file.data.id;

  // Set quyền public view cho file này để Google Docs API có thể đọc và chèn inline
  await driveClient.permissions.create({
    fileId: fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // Link tải trực tiếp (direct link) dùng cho Google Docs
  const publicUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

  return { fileId, publicUrl };
}

/**
 * Trích xuất tên file từ URL ảnh
 */
function getFileNameFromUrl(url: string, defaultName: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const baseName = decodeURIComponent(pathname.split('/').pop() || '');
    if (baseName && baseName.includes('.')) {
      // Loại bỏ các ký tự lạ tránh lỗi hệ thống file
      return baseName.replace(/[/\\?%*:|"<>]/g, '_');
    }
    return defaultName;
  } catch (e) {
    return defaultName;
  }
}

/**
 * So khớp slug giữa target và cell một cách chính xác theo cụm từ (từ nguyên)
 */
export function matchSlugWords(target: string, cell: string): boolean {
  if (!target || !cell) return false;
  const t = target.toLowerCase().trim();
  const c = cell.toLowerCase().trim();
  if (t === c) return true;
  
  const targetWords = t.split('-');
  const cellWords = c.split('-');
  
  if (cellWords.length > 0 && targetWords.length >= cellWords.length) {
    for (let i = 0; i <= targetWords.length - cellWords.length; i++) {
      let isSubArray = true;
      for (let j = 0; j < cellWords.length; j++) {
        if (targetWords[i + j] !== cellWords[j]) {
          isSubArray = false;
          break;
        }
      }
      if (isSubArray) return true;
    }
  }
  return false;
}

/**
 * So khớp tiêu đề giữa target và cell một cách chính xác theo cụm từ (từ nguyên)
 */
export function matchTitleWords(target: string, cell: string): boolean {
  if (!target || !cell) return false;
  const t = target.toLowerCase().trim();
  const c = cell.toLowerCase().trim();
  if (t === c) return true;
  
  const cleanAndSplit = (str: string) => {
    return str
      .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]/g, '')
      .split(/\s+/);
  };
  
  const targetWords = cleanAndSplit(t);
  const cellWords = cleanAndSplit(c);
  
  if (cellWords.length > 0 && targetWords.length >= cellWords.length) {
    for (let i = 0; i <= targetWords.length - cellWords.length; i++) {
      let isSubArray = true;
      for (let j = 0; j < cellWords.length; j++) {
        if (targetWords[i + j] !== cellWords[j]) {
          isSubArray = false;
          break;
        }
      }
      if (isSubArray) return true;
    }
  }
  return false;
}

/**
 * Quét Google Sheet để tìm từ khóa khớp và điền các link tương ứng
 */
async function updateGoogleSheetWithLinks(
  auth: any,
  spreadsheetId: string,
  postTitle: string,
  postSlug: string,
  driveLink: string,
  docsLink: string,
  wpLink: string,
  onProgress: (message: string) => void
): Promise<boolean> {
  const sheets = google.sheets({ version: 'v4', auth });
  
  onProgress('Đang quét Google Sheet để tìm từ khóa phù hợp...');
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:I',
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      onProgress('Cảnh báo: Không tìm thấy dữ liệu trong Google Sheet.');
      return false;
    }
    
    // Tìm tiêu đề cột để xác định đúng cột cần ghi
    const headers = rows[0].map(h => h.toString().trim().toLowerCase());
    
    const keywordColIndex = headers.indexOf('từ khoá') !== -1 ? headers.indexOf('từ khoá') : 1; 
    const driveColIndex = headers.indexOf('link drive') !== -1 ? headers.indexOf('link drive') : 4; 
    const docsColIndex = headers.indexOf('link docs') !== -1 ? headers.indexOf('link docs') : 5; 
    const postColIndex = headers.indexOf('link đăng') !== -1 ? headers.indexOf('link đăng') : 6; 
    
    // Hàm làm sạch chuỗi tiếng Việt để so khớp tương đối theo tiêu đề
    const cleanStr = (str: string) => {
      return str
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, '')
        .trim();
    };

    // Hàm chuyển đổi chuỗi tiếng Việt thành slug (không dấu, phân tách bằng dấu gạch ngang)
    const convertToSlug = (str: string) => {
      return str
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Loại bỏ các ký tự dấu tiếng Việt ghép
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .replace(/[^a-z0-9\s-]/g, '') // Chỉ giữ chữ, số, khoảng trắng và gạch ngang
        .trim()
        .replace(/\s+/g, '-') // Thay thế khoảng trắng bằng gạch ngang
        .replace(/-+/g, '-'); // Loại bỏ nhiều gạch ngang liền nhau
    };
    
    const targetSlug = postSlug ? postSlug.toLowerCase().trim() : '';
    const cleanedPostTitle = cleanStr(postTitle);
    let matchedRowIndex = -1;
    let matchedKeyword = '';
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cellValue = row[keywordColIndex];
      if (!cellValue) continue;
      
      // 1. Thử so khớp theo Slug (Chính xác theo từ nguyên)
      if (targetSlug) {
        const cellSlug = convertToSlug(cellValue);
        if (matchSlugWords(targetSlug, cellSlug)) {
          matchedRowIndex = i;
          matchedKeyword = cellValue.toString();
          break;
        }
      }
      
      // 2. Thử so khớp dự phòng theo Tiêu đề (Chính xác theo từ nguyên)
      const cleanedCell = cleanStr(cellValue);
      if (matchTitleWords(cleanedPostTitle, cleanedCell)) {
        matchedRowIndex = i;
        matchedKeyword = cellValue.toString();
        break;
      }
    }
    
    if (matchedRowIndex === -1) {
      onProgress(`Cảnh báo: Không tìm thấy từ khóa tương ứng với tiêu đề hoặc slug của "${postTitle}" trong Google Sheet.`);
      return false;
    }
    
    const getColLetter = (index: number) => {
      return String.fromCharCode(65 + index);
    };
    
    const rowNumber = matchedRowIndex + 1;
    onProgress(`Đã tìm thấy dòng khớp: "${matchedKeyword}" ở dòng ${rowNumber}. Tiến hành ghi link...`);
    
    const minIndex = Math.min(driveColIndex, docsColIndex, postColIndex);
    const maxIndex = Math.max(driveColIndex, docsColIndex, postColIndex);
    
    const updateRow = new Array(maxIndex - minIndex + 1).fill('');
    updateRow[driveColIndex - minIndex] = driveLink;
    updateRow[docsColIndex - minIndex] = docsLink;
    updateRow[postColIndex - minIndex] = wpLink;
    
    const updateRange = `${getColLetter(minIndex)}${rowNumber}:${getColLetter(maxIndex)}${rowNumber}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [updateRow],
      },
    });
    
    onProgress(`Đã ghi các link thành công vào Google Sheet (Dòng ${rowNumber}).`);
    return true;
  } catch (sheetError: any) {
    onProgress(`Cảnh báo: Lỗi thao tác Google Sheet: ${sheetError.message}`);
    return false;
  }
}

/**
 * Đồng bộ bài viết WordPress lên Google Drive và Docs
 */
export async function syncPost(
  siteUrl: string,
  post: WpPost,
  parentFolderId: string,
  onProgress: (message: string) => void,
  spreadsheetId?: string,
  skipSheetUpdate = false
): Promise<{ folderId: string; docId: string; docUrl: string; folderUrl: string; sheetMatched: boolean }> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  const docs = google.docs({ version: 'v1', auth });

  // 0. Kiểm tra xem bài viết đã đồng bộ và có link trong Sheet chưa
  if (spreadsheetId) {
    try {
      const cleanSheetId = spreadsheetId.includes('/') 
        ? (spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetId)
        : spreadsheetId;
      const checkResult = await checkIfSyncedInSheet(auth, cleanSheetId, post.title.rendered, post.slug);
      if (checkResult.synced) {
        onProgress(`Thông báo: Phát hiện link đã tồn tại trên Google Sheet. Bỏ qua đồng bộ mới.`);
        return {
          folderId: checkResult.driveUrl?.match(/\/folders\/([a-zA-Z0-9-_]+)/)?.[1] || '',
          docId: checkResult.docUrl?.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
          docUrl: checkResult.docUrl || '',
          folderUrl: checkResult.driveUrl || '',
          sheetMatched: true,
        };
      }
    } catch (e: any) {
      onProgress(`Cảnh báo khi kiểm tra trùng lặp: ${e.message}`);
    }
  }

  const postTitle = post.title.rendered.replace(/[/\\?%*:|"<>\s]/g, '_'); // Clean up title for folder name
  onProgress(`Khởi tạo đồng bộ bài viết: "${post.title.rendered}"`);

  // 1. Tạo thư mục con cho bài viết này
  const postFolderId = await createDriveFolder(drive, `[WP] - ${post.title.rendered}`, parentFolderId);
  onProgress(`Đã tạo thư mục bài viết trên Drive (ID: ${postFolderId})`);

  // 2. Tạo thư mục con "images" chứa các ảnh gốc
  const imagesFolderId = await createDriveFolder(drive, 'images', postFolderId);
  onProgress('Đã tạo thư mục con "images" để lưu trữ hình ảnh');

  // Parse HTML bài viết ra các blocks
  const blocks = parseHtmlToBlocks(post.content.rendered);
  onProgress(`Đã phân tích HTML bài viết thành ${blocks.length} khối nội dung`);

  // Helper function to resolve relative URLs
  const makeAbsoluteUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }
    let base = siteUrl.trim();
    if (!base.startsWith('http://') && !base.startsWith('https://')) {
      base = 'https://' + base;
    }
    base = base.replace(/\/+$/, '');
    if (url.startsWith('/')) {
      return `${base}${url}`;
    }
    return `${base}/${url}`;
  };

  // Xử lý ảnh nổi bật (Featured Image) nếu có
  let featuredImageUrl = '';
  if (post._embedded?.['wp:featuredmedia']?.[0]?.source_url) {
    featuredImageUrl = post._embedded['wp:featuredmedia'][0].source_url;
  }

  // Chuẩn hóa toàn bộ URL ảnh thành tuyệt đối
  if (featuredImageUrl) {
    featuredImageUrl = makeAbsoluteUrl(featuredImageUrl);
  }
  blocks.forEach((block) => {
    if (block.type === 'image' && block.imageUrl) {
      block.imageUrl = makeAbsoluteUrl(block.imageUrl);
    }
  });

  // Danh sách các ảnh cần xử lý
  const imageUrlMap: { [key: string]: string } = {};

  if (featuredImageUrl) {
    const imgName = getFileNameFromUrl(featuredImageUrl, 'featured_image.jpg');
    onProgress(`Đang tải & lưu trữ ảnh nổi bật (${imgName})...`);
    try {
      const { publicUrl } = await uploadImageToDriveAndGetUrl(
        drive,
        featuredImageUrl,
        imgName,
        imagesFolderId
      );
      imageUrlMap[featuredImageUrl] = publicUrl;
      onProgress('Lưu trữ ảnh nổi bật thành công.');
    } catch (e: any) {
      onProgress(`Cảnh báo: Không thể tải ảnh nổi bật: ${e.message}`);
    }
  }

  // Tải và lưu trữ các ảnh inline trong bài viết
  const inlineImages = blocks.filter((b) => b.type === 'image');
  if (inlineImages.length > 0) {
    onProgress(`Tìm thấy ${inlineImages.length} ảnh trong bài viết. Tiến hành tải lên Drive...`);
    for (let i = 0; i < inlineImages.length; i++) {
      const block = inlineImages[i];
      if (block.imageUrl) {
        // Tránh tải trùng lặp
        if (imageUrlMap[block.imageUrl]) continue;

        try {
          const imgName = getFileNameFromUrl(block.imageUrl, `image_${i + 1}.jpg`);
          onProgress(`Đang tải ảnh ${i + 1}/${inlineImages.length}: ${imgName}...`);
          const { publicUrl } = await uploadImageToDriveAndGetUrl(
            drive,
            block.imageUrl,
            imgName,
            imagesFolderId
          );
          imageUrlMap[block.imageUrl] = publicUrl;
        } catch (e: any) {
          onProgress(`Cảnh báo: Lỗi tải ảnh ${block.imageUrl}: ${e.message}`);
        }
      }
    }
  }

  // 3. Tạo tài liệu Google Doc
  onProgress('Đang tạo tài liệu Google Doc trống...');
  const doc = await docs.documents.create({
    requestBody: {
      title: post.title.rendered,
    },
  });
  const docId = doc.data.documentId!;

  // Di chuyển Google Doc vừa tạo vào thư mục bài viết
  onProgress('Đang di chuyển tài liệu vào thư mục bài viết...');
  await drive.files.update({
    fileId: docId,
    addParents: postFolderId,
    removeParents: 'root',
    fields: 'id, parents',
  });

  // Thiết lập quyền chỉnh sửa: Bất kỳ ai có liên kết đều có thể sửa (writer)
  try {
    await drive.permissions.create({
      fileId: docId,
      requestBody: {
        role: 'writer',
        type: 'anyone',
      },
    });
  } catch (shareError: any) {
    onProgress(`Cảnh báo: Không thể chia sẻ quyền chỉnh sửa tài liệu Docs: ${shareError.message}`);
  }

  // 4. Ghi nội dung vào Google Doc
  onProgress('Đang chuyển đổi và ghi nội dung vào Google Doc...');

  const buildRequests = () => {
    const requests: any[] = [];
    let currentIndex = 1;

    // Tiêu đề chính
    const mainTitleText = `${post.title.rendered}\n\n`;
    requests.push({
      insertText: {
        text: mainTitleText,
        location: { index: currentIndex },
      },
    });
    requests.push({
      updateParagraphStyle: {
        paragraphStyle: { namedStyleType: 'HEADING_1' },
        fields: 'namedStyleType',
        range: {
          startIndex: currentIndex,
          endIndex: currentIndex + mainTitleText.length - 1,
        },
      },
    });
    currentIndex += mainTitleText.length;

    // Các blocks nội dung (lấy tất cả nội dung chữ bao gồm các đề mục, đoạn văn, và danh sách)
    for (const block of blocks) {
      if (block.type === 'heading') {
        const text = `${block.text}\n\n`;
        requests.push({
          insertText: {
            text,
            location: { index: currentIndex },
          },
        });

        const headingStyle = `HEADING_${Math.min(block.level || 2, 6)}`;
        requests.push({
          updateParagraphStyle: {
            paragraphStyle: { namedStyleType: headingStyle },
            fields: 'namedStyleType',
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + text.length - 1,
            },
          },
        });

        if (block.styles) {
          for (const style of block.styles) {
            const textStyle: any = {};
            if (style.type === 'bold') textStyle.bold = true;
            if (style.type === 'italic') textStyle.italic = true;
            if (style.type === 'underline') textStyle.underline = true;
            if (style.type === 'link') textStyle.link = { url: style.url };

            requests.push({
              updateTextStyle: {
                textStyle,
                fields: Object.keys(textStyle).join(','),
                range: {
                  startIndex: currentIndex + style.start,
                  endIndex: currentIndex + style.end,
                },
              },
            });
          }
        }

        currentIndex += text.length;
      } else if (block.type === 'paragraph') {
        const text = `${block.text}\n\n`;
        requests.push({
          insertText: {
            text,
            location: { index: currentIndex },
          },
        });

        requests.push({
          updateParagraphStyle: {
            paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
            fields: 'namedStyleType',
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + text.length - 1,
            },
          },
        });

        if (block.styles) {
          for (const style of block.styles) {
            const textStyle: any = {};
            if (style.type === 'bold') textStyle.bold = true;
            if (style.type === 'italic') textStyle.italic = true;
            if (style.type === 'underline') textStyle.underline = true;
            if (style.type === 'link') textStyle.link = { url: style.url };

            requests.push({
              updateTextStyle: {
                textStyle,
                fields: Object.keys(textStyle).join(','),
                range: {
                  startIndex: currentIndex + style.start,
                  endIndex: currentIndex + style.end,
                },
              },
            });
          }
        }

        currentIndex += text.length;
      } else if (block.type === 'list-item') {
        const text = `${block.text}\n`;
        requests.push({
          insertText: {
            text,
            location: { index: currentIndex },
          },
        });

        const preset = block.listType === 'number' 
          ? 'BULLET_NUM_DECIMAL_BUTTON_PARENTESIS'
          : 'BULLET_DISC_CIRCLE_SQUARE';

        requests.push({
          createParagraphBullets: {
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + text.length,
            },
            bulletPreset: preset,
          },
        });

        if (block.styles) {
          for (const style of block.styles) {
            const textStyle: any = {};
            if (style.type === 'bold') textStyle.bold = true;
            if (style.type === 'italic') textStyle.italic = true;
            if (style.type === 'underline') textStyle.underline = true;
            if (style.type === 'link') textStyle.link = { url: style.url };

            requests.push({
              updateTextStyle: {
                textStyle,
                fields: Object.keys(textStyle).join(','),
                range: {
                  startIndex: currentIndex + style.start,
                  endIndex: currentIndex + style.end,
                },
              },
            });
          }
        }

        currentIndex += text.length;
      }
    }
    return requests;
  };

  // Gửi dữ liệu batchUpdate cập nhật nội dung văn bản
  const finalRequests = buildRequests();
  if (finalRequests.length > 0) {
    onProgress('Đang gửi dữ liệu cập nhật nội dung sang Google Docs...');
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: finalRequests,
      },
    });
  }

  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
  const folderUrl = `https://drive.google.com/drive/folders/${postFolderId}`;

  onProgress(`Đồng bộ thành công bài viết! Tài liệu: ${docUrl}`);

  let sheetMatched = false;
  if (spreadsheetId && !skipSheetUpdate) {
    try {
      const cleanSheetId = spreadsheetId.includes('/') 
        ? (spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetId)
        : spreadsheetId;
      sheetMatched = await updateGoogleSheetWithLinks(auth, cleanSheetId, post.title.rendered, post.slug, folderUrl, docUrl, post.link, onProgress);
    } catch (sheetErr: any) {
      onProgress(`Cảnh báo: Không thể ghi link vào Google Sheet: ${sheetErr.message}`);
    }
  } else if (spreadsheetId && skipSheetUpdate) {
    onProgress(`Thông báo: Bỏ qua cập nhật Google Sheet (Chế độ thủ công).`);
  }

  return {
    folderId: postFolderId,
    docId,
    docUrl,
    folderUrl,
    sheetMatched,
  };
}

/**
 * Kiểm tra xem bài viết đã được đồng bộ lên Google Sheet chưa
 */
export async function checkIfSyncedInSheet(
  auth: any,
  spreadsheetId: string,
  postTitle: string,
  postSlug: string
): Promise<{ synced: boolean; driveUrl?: string; docUrl?: string }> {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:I',
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) return { synced: false };
    
    const headers = rows[0].map(h => h.toString().trim().toLowerCase());
    const keywordColIndex = headers.indexOf('từ khoá') !== -1 ? headers.indexOf('từ khoá') : 1; 
    const driveColIndex = headers.indexOf('link drive') !== -1 ? headers.indexOf('link drive') : 4; 
    const docsColIndex = headers.indexOf('link docs') !== -1 ? headers.indexOf('link docs') : 5;

    // Helper functions for matching
    const cleanStr = (str: string) => {
      return str
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, '')
        .trim();
    };

    const convertToSlug = (str: string) => {
      return str
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    };

    const targetSlug = postSlug ? postSlug.toLowerCase().trim() : '';
    const cleanedPostTitle = cleanStr(postTitle);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cellValue = row[keywordColIndex];
      if (!cellValue) continue;

      let matched = false;

      // 1. So khớp slug
      if (targetSlug) {
        const cellSlug = convertToSlug(cellValue);
        if (matchSlugWords(targetSlug, cellSlug)) {
          matched = true;
        }
      }

      // 2. So khớp title dự phòng
      if (!matched) {
        const cleanedCell = cleanStr(cellValue);
        if (matchTitleWords(cleanedPostTitle, cleanedCell)) {
          matched = true;
        }
      }

      if (matched) {
        const driveUrl = row[driveColIndex]?.toString().trim();
        const docUrl = row[docsColIndex]?.toString().trim();

        // Nếu đã có một trong hai link thì coi như đã đồng bộ
        if (driveUrl || docUrl) {
          return {
            synced: true,
            driveUrl: driveUrl || undefined,
            docUrl: docUrl || undefined,
          };
        }
        break; // Đã tìm thấy hàng nhưng chưa có link
      }
    }
  } catch (e) {
    console.error('Error checking sheet sync status:', e);
  }
  return { synced: false };
}
