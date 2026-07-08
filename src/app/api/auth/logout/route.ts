import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const isVercel = !!process.env.VERCEL;

export async function POST() {
  try {
    if (isVercel) {
      // Trên Vercel không thể xóa file, hướng dẫn user xóa env var
      return NextResponse.json({
        success: true,
        message: 'Trên Vercel, vui lòng xóa biến GOOGLE_OAUTH_TOKEN trong Vercel Dashboard → Settings → Environment Variables, sau đó Redeploy.',
      });
    }

    const tokenPath = path.join(process.cwd(), 'token.json');
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
    return NextResponse.json({ success: true, message: 'Đã đăng xuất tài khoản Google!' });
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
