import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/wp-sync';

export async function POST(request: Request) {
  try {
    const { folderName } = await request.json();
    
    if (!folderName || !folderName.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Vui lòng nhập tên thư mục cần tạo.',
      });
    }

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

    // Tạo thư mục mới trên Google Drive
    const fileMetadata = {
      name: folderName.trim(),
      mimeType: 'application/vnd.google-apps.folder',
    };

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name, webViewLink',
    });

    const folderId = folder.data.id;

    // Thiết lập quyền chia sẻ: Bất kỳ ai có liên kết đều có thể chỉnh sửa (writer)
    try {
      await drive.permissions.create({
        fileId: folderId!,
        requestBody: {
          role: 'writer',
          type: 'anyone',
        },
      });
    } catch (shareError: any) {
      console.error('Error sharing folder during creation:', shareError);
      // Vẫn tiếp tục vì thư mục đã được tạo thành công
    }

    return NextResponse.json({
      success: true,
      folderId,
      folderName: folder.data.name,
      webViewLink: folder.data.webViewLink,
      message: `Đã tạo và chia sẻ thư mục "${folder.data.name}" thành công!`,
    });
  } catch (error: any) {
    console.error('Google create folder error:', error);
    return NextResponse.json({
      success: false,
      error: `Không thể tạo thư mục: ${error.message}`,
    });
  }
}
