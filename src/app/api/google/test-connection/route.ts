import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/wp-sync';

export async function POST(request: Request) {
  try {
    const { folderId } = await request.json();
    
    // Khởi tạo Auth
    let auth;
    try {
      auth = getGoogleAuth();
    } catch (authConfigError: any) {
      return NextResponse.json({
        success: false,
        error: 'Chưa cấu hình OAuth Client. Vui lòng bấm Cấu hình để nhập Client Secret.',
      });
    }

    if (!auth.credentials || (!auth.credentials.access_token && !auth.credentials.refresh_token)) {
      return NextResponse.json({
        success: false,
        error: 'Chưa đăng nhập tài khoản Google. Vui lòng bấm Đăng nhập Google.',
      });
    }

    const drive = google.drive({ version: 'v3', auth });

    // Lấy thông tin tài khoản Google đăng nhập
    let clientEmail = 'Tài khoản Google';
    try {
      const userInfoRes = await auth.request<any>({
        url: 'https://www.googleapis.com/oauth2/v3/userinfo',
      });
      clientEmail = userInfoRes.data.email || 'Tài khoản Google';
    } catch (e) {
      console.error('Error fetching user info during connection test:', e);
    }

    if (!folderId) {
      // Nếu không nhập Folder ID, kiểm tra kết nối cơ bản bằng cách list files
      await drive.files.list({ pageSize: 1 });
      return NextResponse.json({
        success: true,
        message: 'Kết nối tài khoản Google thành công!',
        clientEmail,
        folderName: 'Google Drive Root',
      });
    }

    // Nếu có Folder ID, kiểm tra quyền truy cập thư mục đó
    try {
      const folderMeta = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType',
      });

      if (folderMeta.data.mimeType !== 'application/vnd.google-apps.folder') {
        return NextResponse.json({
          success: false,
          error: 'ID được cung cấp không phải là một thư mục Google Drive.',
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Kết nối và truy cập thư mục thành công!',
        clientEmail,
        folderName: folderMeta.data.name,
      });
    } catch (folderError: any) {
      console.error('Error accessing folder:', folderError);
      return NextResponse.json({
        success: false,
        error: `Không thể truy cập thư mục (ID: ${folderId}). Hãy đảm bảo thư mục này tồn tại trên Google Drive của tài khoản (${clientEmail}). Chi tiết lỗi: ${folderError.message}`,
      });
    }
  } catch (error: any) {
    console.error('Google test connection error:', error);
    return NextResponse.json({
      success: false,
      error: `Lỗi xác thực: ${error.message}. Vui lòng đăng nhập lại Google.`,
    });
  }
}
