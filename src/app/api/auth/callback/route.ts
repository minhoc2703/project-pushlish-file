import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/wp-sync';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const isVercel = !!process.env.VERCEL;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(new URL('/?error=no_code', request.url));
    }

    const oauth2Client = getGoogleAuth();
    
    // Đổi code lấy token
    const { tokens } = await oauth2Client.getToken(code);
    
    if (isVercel) {
      // Trên Vercel: không thể ghi file, log token để admin copy vào env var
      console.log('=== GOOGLE OAUTH TOKEN (copy vào Vercel Environment Variables) ===');
      console.log('GOOGLE_OAUTH_TOKEN=' + JSON.stringify(tokens));
      console.log('=================================================================');
    } else {
      // Trên local: ghi token vào file token.json
      const tokenPath = path.join(process.cwd(), 'token.json');
      
      // Nếu có token cũ và token mới không có refresh_token, giữ lại refresh_token cũ
      let finalTokens = { ...tokens };
      if (fs.existsSync(tokenPath) && !tokens.refresh_token) {
        try {
          const oldTokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          if (oldTokens.refresh_token) {
            finalTokens.refresh_token = oldTokens.refresh_token;
          }
        } catch (e) {
          console.error('Error reading old token file:', e);
        }
      }

      fs.writeFileSync(tokenPath, JSON.stringify(finalTokens, null, 2), 'utf8');
    }

    // Quay lại trang chủ
    return NextResponse.redirect(new URL('/?login=success', request.url));
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error.message)}`, request.url));
  }
}
