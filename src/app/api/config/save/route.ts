import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const isVercel = !!process.env.VERCEL;

export async function POST(request: Request) {
  try {
    if (isVercel) {
      return NextResponse.json({
        success: false,
        error: 'Trên Vercel, vui lòng cấu hình qua Dashboard → Settings → Environment Variables. Các biến cần thiết: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DEFAULT_DRIVE_FOLDER_ID, DEFAULT_WP_URL.',
      }, { status: 400 });
    }

    const { clientSecretKey, defaultFolderId, defaultWpUrl } = await request.json();

    const envPath = path.join(process.cwd(), '.env.local');
    
    // Đọc file .env.local hiện tại nếu có
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Parse các dòng hiện tại thành key-value
    const envVars: { [key: string]: string } = {};
    envContent.split('\n').forEach((line) => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        envVars[key] = value;
      }
    });

    // Cập nhật các biến mới
    if (clientSecretKey !== undefined) {
      try {
        const parsed = typeof clientSecretKey === 'string' ? JSON.parse(clientSecretKey) : clientSecretKey;
        const web = parsed.web || parsed.installed;
        if (web) {
          envVars['GOOGLE_CLIENT_ID'] = web.client_id;
          envVars['GOOGLE_CLIENT_SECRET'] = web.client_secret;
        }
      } catch (e) {
        console.error('Error parsing clientSecretKey:', e);
      }
    }
    if (defaultFolderId !== undefined) {
      envVars['DEFAULT_DRIVE_FOLDER_ID'] = defaultFolderId;
    }
    if (defaultWpUrl !== undefined) {
      envVars['DEFAULT_WP_URL'] = defaultWpUrl;
    }

    // Tạo nội dung file mới
    const newEnvContent = Object.entries(envVars)
      .map(([key, val]) => `${key}=${val}`)
      .join('\n');

    fs.writeFileSync(envPath, newEnvContent, 'utf8');

    // Lưu file JSON trực tiếp
    if (clientSecretKey) {
      const csPath = path.join(process.cwd(), 'client-secret.json');
      const parsed = typeof clientSecretKey === 'string' ? JSON.parse(clientSecretKey) : clientSecretKey;
      fs.writeFileSync(csPath, JSON.stringify(parsed, null, 2), 'utf8');
    }

    return NextResponse.json({ success: true, message: 'Đã lưu cấu hình thành công!' });
  } catch (error: any) {
    console.error('Error saving config:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
