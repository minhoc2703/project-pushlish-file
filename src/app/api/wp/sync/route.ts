import { syncPost, WpPost } from '@/lib/wp-sync';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { siteUrl, post, folderId, spreadsheetId, skipSheetUpdate } = await request.json() as { 
      siteUrl: string; 
      post: WpPost; 
      folderId: string;
      spreadsheetId?: string;
      skipSheetUpdate?: boolean;
    };

    if (!siteUrl || !post || !folderId) {
      return new Response(JSON.stringify({ error: 'Thiếu các tham số siteUrl, post, hoặc folderId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();

    // Thực hiện đồng bộ trong một hàm bất đồng bộ tách biệt để trả về Stream ngay lập tức
    (async () => {
      try {
        const onProgress = (message: string) => {
          const data = JSON.stringify({ status: 'progress', message });
          writer.write(encoder.encode(`data: ${data}\n\n`));
        };

        const result = await syncPost(siteUrl, post, folderId, onProgress, spreadsheetId, skipSheetUpdate);
        
        const successData = JSON.stringify({ status: 'success', result });
        writer.write(encoder.encode(`data: ${successData}\n\n`));
      } catch (error: any) {
        console.error('Sync error in stream:', error);
        const errorData = JSON.stringify({ status: 'error', error: error.message });
        writer.write(encoder.encode(`data: ${errorData}\n\n`));
      } finally {
        writer.close();
      }
    })();

    return new Response(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Route error in sync:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
