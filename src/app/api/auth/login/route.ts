import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/wp-sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const oauth2Client = getGoogleAuth();

    // Sinh URL đăng nhập Google với các Scope cần thiết
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Bắt buộc để nhận refresh_token
      prompt: 'consent', // Yêu cầu xác nhận lại để luôn nhận được refresh_token mỗi lần đăng nhập
      scope: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });

    return NextResponse.json({ success: true, url: authUrl });
  } catch (error: any) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json(
      { success: false, error: 'Chưa cấu hình OAuth Client. Vui lòng vào Cấu hình.' },
      { status: 400 }
    );
  }
}
