import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    let hasServiceAccount = false;
    let clientEmail = '';
    const defaultFolderId = process.env.DEFAULT_DRIVE_FOLDER_ID || '';
    const defaultWpUrl = process.env.DEFAULT_WP_URL || '';

    // Check env variable first (Vercel)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        let keyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
        if (keyStr.startsWith('"') && keyStr.endsWith('"')) {
          keyStr = JSON.parse(keyStr);
        }
        const sa = JSON.parse(keyStr);
        hasServiceAccount = true;
        clientEmail = sa.client_email || '';
      } catch (e) {
        console.error('Error parsing GOOGLE_SERVICE_ACCOUNT_KEY:', e);
      }
    }

    // Fallback: Check local service-account.json
    if (!hasServiceAccount) {
      const saPath = path.join(process.cwd(), 'service-account.json');
      if (fs.existsSync(saPath)) {
        try {
          const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
          hasServiceAccount = true;
          clientEmail = sa.client_email || '';
        } catch (e) {
          console.error('Error parsing service-account.json:', e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      hasServiceAccount,
      clientEmail,
      defaultFolderId,
      defaultWpUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
