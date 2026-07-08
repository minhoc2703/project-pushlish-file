'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  RefreshCw,
  FolderOpen,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  Info,
  Key,
  ShieldCheck,
  Check,
  Globe,
  Sliders,
  Copy,
} from 'lucide-react';

interface PostState {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  date: string;
  slug: string;
  link: string;
  selected?: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  logs: string[];
  docUrl?: string;
  folderUrl?: string;
  sheetMatched?: boolean;
  sheetRow?: number;
  sheetKeyword?: string;
  error?: string;
}

export default function Home() {
  // Config states
  const [siteUrl, setSiteUrl] = useState('');
  const [folderId, setFolderId] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [contentType, setContentType] = useState<'posts' | 'pages'>('posts');
  const [clientSecretKey, setClientSecretKey] = useState('');
  const [config, setConfig] = useState({
    hasClientSecret: false,
    isLoggedIn: false,
    email: '',
    defaultFolderId: '',
    defaultWpUrl: '',
  });

  // UI States
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [posts, setPosts] = useState<PostState[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncLogsOpen, setSyncLogsOpen] = useState(false);
  const [currentSyncingPost, setCurrentSyncingPost] = useState<PostState | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination states
  const [wpPage, setWpPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [autoWriteToSheet, setAutoWriteToSheet] = useState(false);
  const [sortBy, setSortBy] = useState<'wp_date' | 'sheet_row'>('wp_date');
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showCreateExpander, setShowCreateExpander] = useState(false);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (data.success) {
        setConfig({
          hasClientSecret: data.hasClientSecret,
          isLoggedIn: data.isLoggedIn,
          email: data.email,
          defaultFolderId: data.defaultFolderId,
          defaultWpUrl: data.defaultWpUrl,
        });
        if (data.defaultFolderId) setFolderId(data.defaultFolderId);
        if (data.defaultWpUrl) setSiteUrl(data.defaultWpUrl);
      }
    } catch (e) {
      console.error('Error loading config:', e);
    }
  };

  const handleSaveConfig = async () => {
    setSaveSuccessMsg('');
    try {
      const res = await fetch('/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientSecretKey,
          defaultFolderId: folderId,
          defaultWpUrl: siteUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccessMsg('Đã lưu cấu hình thành công!');
        loadConfig();
        setTimeout(() => {
          setSettingsOpen(false);
          setSaveSuccessMsg('');
        }, 1500);
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi lưu cấu hình: ' + e.message);
    }
  };

  const handleLoginGoogle = async () => {
    try {
      const res = await fetch('/api/auth/login');
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert('Lỗi khởi động đăng nhập: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi kết nối server: ' + e.message);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Bạn có chắc chắn muốn đăng xuất tài khoản Google?')) return;
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        loadConfig();
        setConnectionStatus('idle');
        setConnectionMessage('');
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi kết nối: ' + e.message);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionMessage('');
    try {
      const res = await fetch('/api/google/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectionStatus('success');
        setConnectionMessage(`${data.message} (${data.folderName})`);
      } else {
        setConnectionStatus('error');
        setConnectionMessage(data.error);
      }
    } catch (e: any) {
      setConnectionStatus('error');
      setConnectionMessage('Không thể kết nối đến server API: ' + e.message);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFolderIdChange = (val: string) => {
    let cleanId = val.trim();
    if (cleanId.includes('drive.google.com')) {
      const match = cleanId.match(/\/folders\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        cleanId = match[1];
      }
    }
    setFolderId(cleanId);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName || !newFolderName.trim()) {
      alert('Vui lòng nhập tên thư mục cần tạo!');
      return;
    }
    setCreatingFolder(true);
    try {
      const res = await fetch('/api/google/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: newFolderName }),
      });
      const data = await res.json();
      if (data.success) {
        setFolderId(data.folderId);
        setNewFolderName('');
        setShowCreateExpander(false);
        alert(data.message);
      } else {
        alert('Lỗi tạo thư mục: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi kết nối server: ' + e.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleFetchPosts = async () => {
    if (!siteUrl) {
      alert('Vui lòng nhập URL website WordPress!');
      return;
    }
    setLoadingPosts(true);
    try {
      const res = await fetch(`/api/wp/posts?siteUrl=${encodeURIComponent(siteUrl)}&page=${wpPage}&perPage=${perPage}&type=${contentType}&spreadsheetId=${encodeURIComponent(spreadsheetId)}`);
      const data = await res.json();
      if (data.success) {
        const formatted = data.posts.map((post: any) => {
          const isSynced = post.sheetMatched === true;
          return {
            ...post,
            selected: false,
            syncStatus: isSynced ? 'success' : 'idle',
            docUrl: post.sheetDocUrl || undefined,
            folderUrl: post.sheetDriveUrl || undefined,
            sheetMatched: isSynced,
            sheetRow: post.sheetRow || undefined,
            sheetKeyword: post.sheetKeyword || undefined,
            logs: isSynced ? ['Thông báo: Đã phát hiện link đồng bộ trên Google Sheet.'] : [],
          };
        });
        setPosts(formatted);
      } else {
        alert('Lỗi lấy bài viết: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi kết nối API WordPress: ' + e.message);
    } finally {
      setLoadingPosts(false);
    }
  };

  // Toggle selection
  const toggleSelectPost = (id: number) => {
    setPosts(
      posts.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  };

  const toggleSelectAll = () => {
    const allSelected = posts.every((p) => p.selected);
    setPosts(posts.map((p) => ({ ...p, selected: !allSelected })));
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Sync logic
  const handleSyncPosts = async () => {
    const selectedPosts = posts.filter((p) => p.selected);
    if (selectedPosts.length === 0) {
      alert('Vui lòng chọn ít nhất 1 bài viết để đồng bộ!');
      return;
    }
    if (!folderId) {
      alert('Vui lòng điền Google Drive Folder ID trước khi đồng bộ!');
      return;
    }

    setSyncLogsOpen(true);
    
    // Sync sequentially
    for (const post of selectedPosts) {
      // Mark post as syncing
      setPosts((prevPosts) =>
        prevPosts.map((p) =>
          p.id === post.id ? { ...p, syncStatus: 'syncing', logs: ['Khởi động tiến trình...'] } : p
        )
      );

      const targetPost = { ...post, syncStatus: 'syncing' as const, logs: ['Khởi động tiến trình...'] };
      setCurrentSyncingPost(targetPost);

      try {
        const response = await fetch('/api/wp/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            siteUrl, 
            post, 
            folderId, 
            spreadsheetId, 
            skipSheetUpdate: !autoWriteToSheet 
          }),
        });

        if (!response.body) {
          throw new Error('Server không trả về stream dữ liệu.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResult: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const jsonStr = line.slice(6);
              let data: any = null;
              try {
                data = JSON.parse(jsonStr);
              } catch (e) {
                // Ignore parse errors for partial chunks
                continue;
              }

              if (data) {
                if (data.status === 'progress') {
                  setPosts((prev) =>
                    prev.map((p) =>
                      p.id === post.id ? { ...p, logs: [...p.logs, data.message] } : p
                    )
                  );
                  setCurrentSyncingPost((prev) =>
                    prev && prev.id === post.id
                      ? { ...prev, logs: [...prev.logs, data.message] }
                      : prev
                  );
                } else if (data.status === 'success') {
                  finalResult = data.result;
                } else if (data.status === 'error') {
                  throw new Error(data.error);
                }
              }
            }
          }
        }

        if (finalResult) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === post.id
                ? {
                    ...p,
                    syncStatus: 'success',
                    docUrl: finalResult.docUrl,
                    folderUrl: finalResult.folderUrl,
                    sheetMatched: finalResult.sheetMatched,
                    logs: [...p.logs, 'Đồng bộ thành công!'],
                  }
                : p
            )
          );
        } else {
          throw new Error('Đồng bộ kết thúc mà không có dữ liệu trả về.');
        }
      } catch (err: any) {
        console.error('Failed to sync post:', post.id, err);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  syncStatus: 'error',
                  error: err.message,
                  logs: [...p.logs, `Lỗi: ${err.message}`],
                }
              : p
          )
        );
      }
    }
    setCurrentSyncingPost(null);
  };

  // Sorting and Filtering
  const sortedAndFilteredPosts = [...posts]
    .filter((post) =>
      post.title.rendered.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'sheet_row') {
        const rowA = a.sheetRow ?? Infinity;
        const rowB = b.sheetRow ?? Infinity;
        return rowA - rowB;
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  // Group successfully synced posts by category/type for quick copy/view
  const unmatchedPosts = posts.filter(
    (p) => p.syncStatus === 'success'
  );

  const groupedUnmatchedPosts: { [key: string]: typeof unmatchedPosts } = {};
  unmatchedPosts.forEach((post) => {
    let category = 'Bài viết (Chưa phân loại)';
    if ((post as any).type === 'page') {
      category = 'Trang tĩnh (Pages)';
    } else {
      const terms = (post as any)._embedded?.['wp:term'];
      if (terms && terms.length > 0) {
        const categories = terms[0].filter((t: any) => t.taxonomy === 'category');
        if (categories && categories.length > 0) {
          category = categories[0].name;
        }
      }
    }

    if (!groupedUnmatchedPosts[category]) {
      groupedUnmatchedPosts[category] = [];
    }
    groupedUnmatchedPosts[category].push(post);
  });

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 font-sans selection:bg-violet-500/30 selection:text-violet-200">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-900/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-10 pb-6 border-b border-slate-800/60 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                WP to Drive Sync Portal
              </h1>
              <p className="text-sm text-slate-400">
                Đồng bộ bài viết và hình ảnh WordPress lên Google Drive & Google Docs tự động
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {!config.hasClientSecret ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5" />
                Chưa cấu hình OAuth
              </span>
            ) : config.isLoggedIn ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 max-w-[200px] truncate" title={config.email}>
                  <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                  {config.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-all duration-200"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <button
                onClick={handleLoginGoogle}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-violet-500/10 transition-all duration-200 cursor-pointer"
              >
                <Key className="w-3.5 h-3.5" />
                Đăng nhập Google
              </button>
            )}

            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 cursor-pointer backdrop-blur-sm"
            >
              <Settings className="w-4 h-4" />
              Cấu hình
            </button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Left Panel: Inputs & Operations */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-6 space-y-5 shadow-xl">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-violet-400 border-b border-slate-800 pb-3">
                <Sliders className="w-5 h-5" />
                Cài đặt Đồng bộ
              </h2>

              {/* WordPress Site URL */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                  URL Website WordPress
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Globe className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-violet-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Content Type Selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                  Loại nội dung
                </label>
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as 'posts' | 'pages')}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-sm text-slate-200 outline-none transition-colors"
                >
                  <option value="posts">Bài viết (Posts)</option>
                  <option value="pages">Trang tĩnh (Pages)</option>
                </select>
              </div>

              {/* Google Drive Folder Settings */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                  Thư mục Google Drive (ID hoặc Link)
                </label>

                {/* Main Folder ID / URL input */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <FolderOpen className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={folderId}
                    onChange={(e) => handleFolderIdChange(e.target.value)}
                    placeholder="Dán ID hoặc Link thư mục Google Drive..."
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-violet-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-650 outline-none transition-colors"
                  />
                </div>

                {/* Inline Folder Creation */}
                {!showCreateExpander ? (
                  <button
                    type="button"
                    onClick={() => setShowCreateExpander(true)}
                    className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    + Hoặc tạo thư mục mới trên Drive
                  </button>
                ) : (
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60 space-y-3">
                    <span className="text-xs font-semibold text-slate-300 block">Tạo thư mục mới:</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Nhập tên thư mục..."
                        className="flex-1 bg-slate-950/80 border border-slate-800 focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-slate-200 placeholder:text-slate-655 outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleCreateFolder}
                        disabled={creatingFolder || !config.isLoggedIn}
                        className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-violet-500/10 transition-all duration-200 cursor-pointer active:scale-95 flex items-center gap-1 whitespace-nowrap"
                      >
                        {creatingFolder ? (
                          <Loader2 className="w-3 animate-spin" />
                        ) : (
                          <FolderOpen className="w-3" />
                        )}
                        Tạo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateExpander(false);
                          setNewFolderName('');
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      Hệ thống sẽ tạo và cấp quyền chỉnh sửa cho thư mục mới này, sau đó tự điền ID vào ô nhập phía trên.
                    </p>
                  </div>
                )}
              </div>

              {/* Google Sheets Spreadsheet URL/ID */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                  Google Sheet Link (Tùy chọn)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <FileText className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-violet-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-650 outline-none transition-colors"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Dán link Google Sheet để tự động khớp và sắp xếp bài viết theo danh sách từ khoá.
                </p>
              </div>

              {/* Auto Write to Sheet Checkbox */}
              {spreadsheetId && (
                <div className="flex items-center gap-2.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <input
                    type="checkbox"
                    id="autoWriteToSheet"
                    checked={autoWriteToSheet}
                    onChange={(e) => setAutoWriteToSheet(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-800 text-violet-600 focus:ring-violet-500/20 bg-slate-950 cursor-pointer"
                  />
                  <label htmlFor="autoWriteToSheet" className="text-xs text-slate-300 font-medium cursor-pointer select-none">
                    Tự động ghi liên kết vào Google Sheet sau khi đồng bộ
                  </label>
                </div>
              )}

              {/* Test and Fetch Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer"
                >
                  {testingConnection ? (
                    <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  ) : (
                    <Key className="w-4 h-4" />
                  )}
                  Test Google
                </button>

                <button
                  onClick={handleFetchPosts}
                  disabled={loadingPosts}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white disabled:opacity-50 rounded-xl text-sm font-semibold shadow-md shadow-violet-500/10 transition-all duration-200 cursor-pointer active:scale-95"
                >
                  {loadingPosts ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Lấy bài viết
                </button>
              </div>

              {/* Connection Status Message */}
              {connectionMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex gap-2 items-start ${
                    connectionStatus === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {connectionStatus === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="leading-normal">{connectionMessage}</span>
                </div>
              )}
            </div>

            {/* Sync summary stats card */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Thống kê phiên làm việc</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/50">
                  <div className="text-[11px] text-slate-500 uppercase">Đã chọn</div>
                  <div className="text-2xl font-bold text-violet-400 mt-1">
                    {posts.filter((p) => p.selected).length} <span className="text-xs text-slate-500 font-normal">/ {posts.length}</span>
                  </div>
                </div>
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/50">
                  <div className="text-[11px] text-slate-500 uppercase">Thành công</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">
                    {posts.filter((p) => p.syncStatus === 'success').length}
                  </div>
                </div>
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/50">
                  <div className="text-[11px] text-slate-500 uppercase">Đang chạy</div>
                  <div className="text-2xl font-bold text-indigo-400 mt-1 flex items-center gap-1.5">
                    {posts.filter((p) => p.syncStatus === 'syncing').length}
                    {posts.some((p) => p.syncStatus === 'syncing') && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
                  </div>
                </div>
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/50">
                  <div className="text-[11px] text-slate-500 uppercase">Lỗi</div>
                  <div className="text-2xl font-bold text-red-400 mt-1">
                    {posts.filter((p) => p.syncStatus === 'error').length}
                  </div>
                </div>
              </div>

              {posts.some((p) => p.selected) && (
                <button
                  onClick={handleSyncPosts}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-500/10 cursor-pointer transition-all duration-200 active:scale-95"
                >
                  <RefreshCw className="w-4 h-4 animate-pulse" />
                  Đồng bộ ngay ({posts.filter((p) => p.selected).length} bài viết)
                </button>
              )}
            </div>
          </div>

          {/* Right Area: Posts Table */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/80 shadow-xl overflow-hidden">
              {/* Table controls */}
              <div className="p-6 border-b border-slate-800/80 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full sm:w-80">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm bài viết..."
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-violet-500 rounded-xl py-2 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition-colors"
                  />
                </div>

                <div className="flex gap-3 w-full sm:w-auto justify-between sm:justify-start flex-wrap">
                  {spreadsheetId && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Sắp xếp:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'wp_date' | 'sheet_row')}
                        className="bg-slate-950/80 border border-slate-800 rounded-lg text-xs py-1 px-2 text-slate-300 outline-none cursor-pointer"
                      >
                        <option value="wp_date">Mới nhất (WP)</option>
                        <option value="sheet_row">Theo hàng Google Sheet</option>
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Số lượng:</span>
                    <select
                      value={perPage}
                      onChange={(e) => setPerPage(parseInt(e.target.value))}
                      className="bg-slate-950/80 border border-slate-800 rounded-lg text-xs py-1 px-2 text-slate-300 outline-none"
                    >
                      <option value="5">5 bài</option>
                      <option value="10">10 bài</option>
                      <option value="20">20 bài</option>
                      <option value="50">50 bài</option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setWpPage(Math.max(1, wpPage - 1))}
                      disabled={wpPage <= 1}
                      className="px-2.5 py-1 bg-slate-950/80 border border-slate-800 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50"
                    >
                      Trước
                    </button>
                    <span className="text-xs text-slate-400 self-center font-semibold">Trang {wpPage}</span>
                    <button
                      onClick={() => setWpPage(wpPage + 1)}
                      disabled={posts.length < perPage}
                      className="px-2.5 py-1 bg-slate-950/80 border border-slate-800 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              </div>

              {/* Table contents */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/40 border-b border-slate-800 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="py-4 px-6 w-12">
                        <button
                          onClick={toggleSelectAll}
                          disabled={posts.length === 0}
                          className="text-slate-500 hover:text-violet-400 transition-colors cursor-pointer"
                        >
                          {posts.length > 0 && posts.every((p) => p.selected) ? (
                            <CheckSquare className="w-5 h-5 text-violet-500" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </th>
                      <th className="py-4 px-4">Bài viết</th>
                      <th className="py-4 px-4 w-36">Ngày đăng</th>
                      <th className="py-4 px-4 w-36">Trạng thái</th>
                      <th className="py-4 px-6 w-24">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {sortedAndFilteredPosts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500 text-sm">
                          {loadingPosts ? (
                            <div className="flex flex-col items-center gap-3">
                              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                              <span>Đang lấy dữ liệu bài viết từ WordPress...</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-slate-600">
                              <Globe className="w-8 h-8 opacity-40" />
                              <span>Không có dữ liệu bài viết. Hãy nhập URL và nhấn "Lấy bài viết".</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      sortedAndFilteredPosts.map((post) => (
                        <tr
                          key={post.id}
                          className={`hover:bg-slate-800/20 transition-colors ${
                            post.selected ? 'bg-violet-950/10' : ''
                          }`}
                        >
                          <td className="py-4 px-6">
                            <button
                              onClick={() => toggleSelectPost(post.id)}
                              className="text-slate-500 hover:text-violet-400 transition-colors cursor-pointer"
                            >
                              {post.selected ? (
                                <CheckSquare className="w-5 h-5 text-violet-500" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                          <td className="py-4 px-4">
                            <div className="font-semibold text-slate-200 line-clamp-1 flex items-center gap-2">
                              {post.title.rendered}
                              {post.sheetRow && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20" title={`Khớp từ khóa Google Sheet: "${post.sheetKeyword}"`}>
                                  Hàng {post.sheetRow}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
                              <span>Slug: {post.slug}</span>
                              {post.sheetKeyword && (
                                <span className="text-slate-600 font-sans">
                                  | Từ khoá: <span className="text-slate-400 font-semibold">"{post.sheetKeyword}"</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-400">
                            {new Date(post.date).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="py-4 px-4">
                            {post.syncStatus === 'idle' && (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-slate-800 text-slate-400 border border-slate-700/50">
                                Sẵn sàng
                              </span>
                            )}
                            {post.syncStatus === 'syncing' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Đang đồng bộ...
                              </span>
                            )}
                            {post.syncStatus === 'success' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Thành công
                              </span>
                            )}
                            {post.syncStatus === 'error' && (
                              <span
                                title={post.error}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-red-500/10 text-red-400 border border-red-500/20 cursor-help"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Lỗi
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex gap-2 items-center">
                              {post.docUrl && (
                                <a
                                  href={post.docUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Xem Google Doc"
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-violet-400 hover:text-violet-300 rounded-lg border border-slate-700 transition-colors"
                                >
                                  <FileText className="w-4 h-4" />
                                </a>
                              )}
                              {post.folderUrl && (
                                <a
                                  href={post.folderUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Xem Thư mục Drive"
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 rounded-lg border border-slate-700 transition-colors"
                                >
                                  <FolderOpen className="w-4 h-4" />
                                </a>
                              )}
                              {post.syncStatus === 'success' && (
                                <button
                                  onClick={() => handleCopyText(`${post.folderUrl || ''}\t${post.docUrl || ''}\t${post.link || ''}`, `${post.id}-all`)}
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                                  title="Copy 3 cột (Drive, Docs, Đăng) cách nhau bằng dấu Tab"
                                >
                                  {copiedId === `${post.id}-all` ? (
                                    <Check className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                              {!post.docUrl && !post.folderUrl && (
                                <span className="text-slate-600 text-xs">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Logs section */}
        {syncLogsOpen && (
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-6 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                <Info className="w-4 h-4 text-violet-400 animate-pulse" />
                Nhật ký đồng bộ thời gian thực
              </h3>
              <button
                onClick={() => setSyncLogsOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                Đóng logs
              </button>
            </div>

            {/* Current Syncing Item details */}
            {currentSyncingPost && (
              <div className="mb-4 p-4 rounded-xl bg-violet-950/15 border border-violet-900/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-violet-400 uppercase tracking-wide">Đang xử lý</span>
                  <h4 className="text-sm font-semibold text-slate-200 mt-0.5">{currentSyncingPost.title.rendered}</h4>
                </div>
                <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Streaming Logs...
                </div>
              </div>
            )}

            {/* Scrollable logs console */}
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-850 font-mono text-xs h-64 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              {posts.some((p) => p.logs.length > 0) ? (
                posts
                  .filter((p) => p.logs.length > 0)
                  .flatMap((post) =>
                    post.logs.map((log, index) => ({
                      postId: post.id,
                      postTitle: post.title.rendered,
                      message: log,
                      id: `${post.id}-${index}`,
                      status: post.syncStatus,
                    }))
                  )
                  .map((logItem) => (
                    <div key={logItem.id} className="flex gap-2">
                      <span className="text-slate-500 font-semibold flex-shrink-0">[{logItem.postTitle.slice(0, 15)}...]</span>
                      <span
                        className={
                          logItem.message.startsWith('Cảnh báo')
                            ? 'text-amber-400'
                            : logItem.message.startsWith('Lỗi')
                            ? 'text-red-400'
                            : logItem.message.startsWith('Đồng bộ thành công')
                            ? 'text-emerald-400'
                            : 'text-slate-300'
                        }
                      >
                        {logItem.message}
                      </span>
                    </div>
                  ))
              ) : (
                <div className="text-slate-600 text-center py-20 italic">Chưa có nhật ký nào được ghi nhận. Hãy bấm đồng bộ để bắt đầu.</div>
              )}
            </div>
          </div>
        )}

        {/* Unmatched links list for manual copy */}
        {posts.some((p) => p.syncStatus === 'success') && (
          <div className="mt-8 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-violet-400 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Tổng hợp liên kết các bài viết đã đồng bộ (Copy & Xem nhanh)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Dưới đây là danh sách toàn bộ các đường link đã đồng bộ thành công. Bạn có thể copy nhanh cả 3 cột để dán vào Google Sheet hoặc click mở trực tiếp:
              </p>
            </div>

            <div className="space-y-6">
              {Object.entries(groupedUnmatchedPosts).map(([categoryName, postList]) => (
                <div key={categoryName} className="space-y-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-violet-400 bg-violet-500/10 px-3 py-1.5 rounded-lg border border-violet-500/20 inline-block">
                    Danh mục: {categoryName}
                  </div>
                  
                  <div className="space-y-4 pl-3 border-l border-slate-800">
                    {postList.map((post) => (
                      <div key={post.id} className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="font-semibold text-slate-200 text-sm">
                            {post.title.rendered} <span className="text-xs text-slate-500 font-mono">(Slug: {post.slug})</span>
                          </div>
                          <button
                            onClick={() => handleCopyText(`${post.folderUrl}\t${post.docUrl}\t${post.link}`, `${post.id}-all`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/35 border border-violet-500/30 text-violet-300 hover:text-white rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer self-start sm:self-auto"
                            title="Copy cả 3 link cách nhau bằng dấu Tab để dán thẳng 3 ô hàng ngang trong Sheet"
                          >
                            {copiedId === `${post.id}-all` ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                Đã copy 3 cột!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Copy 3 cột (Dán ngang)
                              </>
                            )}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* Drive Link */}
                          <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                            <div className="truncate flex-1">
                              <span className="text-slate-500 font-medium mr-1 select-none">Drive:</span>
                              <span className="text-slate-300 select-all">{post.folderUrl}</span>
                            </div>
                            <button
                              onClick={() => handleCopyText(post.folderUrl || '', `${post.id}-drive`)}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors flex-shrink-0 cursor-pointer"
                              title="Copy Link Drive"
                            >
                              {copiedId === `${post.id}-drive` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {/* Doc Link */}
                          <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                            <div className="truncate flex-1">
                              <span className="text-slate-500 font-medium mr-1 select-none">Docs:</span>
                              <span className="text-slate-300 select-all">{post.docUrl}</span>
                            </div>
                            <button
                              onClick={() => handleCopyText(post.docUrl || '', `${post.id}-docs`)}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors flex-shrink-0 cursor-pointer"
                              title="Copy Link Docs"
                            >
                              {copiedId === `${post.id}-docs` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {/* WP Link */}
                          <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                            <div className="truncate flex-1">
                              <span className="text-slate-500 font-medium mr-1 select-none">Bài đăng:</span>
                              <span className="text-slate-300 select-all">{post.link}</span>
                            </div>
                            <button
                              onClick={() => handleCopyText(post.link || '', `${post.id}-wp`)}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors flex-shrink-0 cursor-pointer"
                              title="Copy Link Đăng bài"
                            >
                              {copiedId === `${post.id}-wp` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all duration-300">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-violet-400">
                <Settings className="w-5 h-5" />
                Cấu hình Google API
              </h3>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-100 transition-colors text-lg font-semibold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal content */}
            <div className="p-6 space-y-6">
              {/* Instructions */}
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2 text-xs text-slate-400 leading-relaxed">
                <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-violet-400" />
                  Hướng dẫn cấu hình OAuth 2.0 Client:
                </p>
                <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                  <li>Truy cập <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-violet-400 underline hover:text-violet-300">Google Cloud Console</a>, chọn Project của bạn.</li>
                  <li>Vào **APIs & Services** &rarr; **Credentials** (Thông tin xác thực).</li>
                  <li>Bấm **Create Credentials** &rarr; **OAuth client ID**.</li>
                  <li>Chọn Application Type là **Web application**.</li>
                  <li>Thêm Redirect URI là: <code className="text-violet-300 bg-slate-900 px-1 py-0.5 rounded">http://localhost:3001/api/auth/callback</code></li>
                  <li>Bấm **Create** (Tạo), sau đó bấm nút tải xuống file JSON (tải file client secret).</li>
                  <li>Sao chép toàn bộ nội dung file JSON đó và dán vào ô dưới đây.</li>
                </ol>
              </div>

              {/* Private Key input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Dán nội dung JSON của OAuth Client (client_secret.json):
                </label>
                <textarea
                  value={clientSecretKey}
                  onChange={(e) => setClientSecretKey(e.target.value)}
                  placeholder='{ "web": { "client_id": "...", "client_secret": "...", "auth_uri": "...", "token_uri": "..." } }'
                  rows={6}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-violet-500 rounded-xl p-4 font-mono text-xs text-slate-300 placeholder:text-slate-700 outline-none transition-colors resize-none"
                />
              </div>

              {/* Default states mapping info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-500 block">Thư mục Drive mặc định:</span>
                  <span className="text-xs font-medium text-slate-300 truncate block">
                    {config.defaultFolderId || '(Chưa cấu hình)'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-500 block">Website WP mặc định:</span>
                  <span className="text-xs font-medium text-slate-300 truncate block">
                    {config.defaultWpUrl || '(Chưa cấu hình)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-6 border-t border-slate-800/80 flex justify-between items-center bg-slate-950/20">
              {saveSuccessMsg ? (
                <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-semibold">
                  <Check className="w-4 h-4" />
                  {saveSuccessMsg}
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">Cấu hình được lưu vào file cục bộ an toàn.</span>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveConfig}
                  className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-violet-500/10 cursor-pointer transition-all active:scale-95"
                >
                  Lưu Cấu Hình
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
