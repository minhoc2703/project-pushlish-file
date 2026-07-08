import { NextResponse } from 'next/server';
import { fetchWpPosts, getGoogleAuth, matchSlugWords, matchTitleWords } from '@/lib/wp-sync';
import { google } from 'googleapis';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteUrl = searchParams.get('siteUrl');
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('perPage') || '10');
    const contentType = (searchParams.get('type') || 'posts') as 'posts' | 'pages';
    const spreadsheetId = searchParams.get('spreadsheetId');

    if (!siteUrl) {
      return NextResponse.json({ success: false, error: 'Thiếu tham số siteUrl' }, { status: 400 });
    }

    const posts = await fetchWpPosts(siteUrl, page, perPage, contentType);

    // Nếu có spreadsheetId, quét Sheet để đánh dấu các bài viết đã đồng bộ trước đó
    if (spreadsheetId) {
      try {
        const cleanSheetId = spreadsheetId.includes('/') 
          ? (spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetId)
          : spreadsheetId;
        
        const auth = getGoogleAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const sheetResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: cleanSheetId,
          range: 'A:I',
        });
        
        const rows = sheetResponse.data.values;
        if (rows && rows.length > 0) {
          const headers = rows[0].map(h => h.toString().trim().toLowerCase());
          const keywordColIndex = headers.indexOf('từ khoá') !== -1 ? headers.indexOf('từ khoá') : 1; 
          const driveColIndex = headers.indexOf('link drive') !== -1 ? headers.indexOf('link drive') : 4; 
          const docsColIndex = headers.indexOf('link docs') !== -1 ? headers.indexOf('link docs') : 5;

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

          for (const post of posts) {
            const targetSlug = post.slug ? post.slug.toLowerCase().trim() : '';
            const cleanedPostTitle = cleanStr(post.title.rendered);
            
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              const cellValue = row[keywordColIndex];
              if (!cellValue) continue;

              let matched = false;

              // 1. So khớp slug (Chính xác theo từ nguyên)
              if (targetSlug) {
                const cellSlug = convertToSlug(cellValue);
                if (matchSlugWords(targetSlug, cellSlug)) {
                  matched = true;
                }
              }

              // 2. So khớp title dự phòng (Chính xác theo từ nguyên)
              if (!matched) {
                const cleanedCell = cleanStr(cellValue);
                if (matchTitleWords(cleanedPostTitle, cleanedCell)) {
                  matched = true;
                }
              }

              if (matched) {
                const driveUrl = row[driveColIndex]?.toString().trim();
                const docUrl = row[docsColIndex]?.toString().trim();
                
                (post as any).sheetRow = i + 1;
                (post as any).sheetKeyword = cellValue.toString();
                (post as any).sheetMatched = !!(driveUrl || docUrl);
                
                if (driveUrl || docUrl) {
                  (post as any).sheetDriveUrl = driveUrl || undefined;
                  (post as any).sheetDocUrl = docUrl || undefined;
                }
                break;
              }
            }
          }
        }
      } catch (e: any) {
        console.error('Error scanning Google Sheet during fetch posts:', e);
      }
    }

    return NextResponse.json({ success: true, posts });
  } catch (error: any) {
    console.error('Error fetching WP posts:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
