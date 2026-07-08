import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/wp-sync';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let hasClientSecret = false;
    let isLoggedIn = false;
    let email = '';
    const defaultFolderId = process.env.DEFAULT_DRIVE_FOLDER_ID || '';
    const defaultWpUrl = process.env.DEFAULT_WP_URL || '';

    // Check client credentials từ env vars hoặc file
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      hasClientSecret = true;
    } else {
      const secretPath = path.join(process.cwd(), 'client-secret.json');
      if (fs.existsSync(secretPath)) {
        hasClientSecret = true;
      }
    }

    // Check token từ env var hoặc file
    let hasToken = false;
    const tokenEnv = process.env.GOOGLE_OAUTH_TOKEN;
    if (tokenEnv) {
      try {
        const token = JSON.parse(tokenEnv);
        if (token.access_token || token.refresh_token) {
          hasToken = true;
        }
      } catch (e) {
        console.error('Error parsing GOOGLE_OAUTH_TOKEN:', e);
      }
    }
    
    if (!hasToken) {
      const tokenPath = path.join(process.cwd(), 'token.json');
      if (fs.existsSync(tokenPath)) {
        try {
          const tokenContent = fs.readFileSync(tokenPath, 'utf8');
          const token = JSON.parse(tokenContent);
          if (token.access_token || token.refresh_token) {
            hasToken = true;
          }
        } catch (e) {
          console.error('Error parsing token.json:', e);
        }
      }
    }

    if (hasToken) {
      isLoggedIn = true;
      // Thử lấy thông tin email người dùng
      try {
        const oauth2Client = getGoogleAuth();
        const userInfoRes = await oauth2Client.request<any>({
          url: 'https://www.googleapis.com/oauth2/v3/userinfo',
        });
        email = userInfoRes.data.email || '';
      } catch (userInfoError) {
        console.error('Error fetching user info:', userInfoError);
      }
    }

    return NextResponse.json({
      success: true,
      hasClientSecret,
      isLoggedIn,
      email,
      defaultFolderId,
      defaultWpUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ success: true, hasClientSecret: false, isLoggedIn: false });
  }
}
