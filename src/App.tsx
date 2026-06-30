import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  UploadCloud, 
  FileText, 
  Copy, 
  Check, 
  RefreshCw, 
  Search, 
  Activity, 
  Network,
  Sun,
  Moon,
  AlertTriangle,
  Monitor,
  Clipboard,
  MessageSquare,
  Users,
  Eye,
  FileCheck,
  Settings as SettingsIcon,
  Menu,
  ChevronRight,
  Send,
  Zap
} from 'lucide-react';
import io from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = window.location.protocol + '//' + window.location.hostname + ':5000';
let socket: any;

interface ClipboardItem {
  id: string;
  content: string;
  timestamp: string;
  sender: string;
  pinned?: boolean;
}

interface Comment {
  id: string;
  text: string;
  sender: string;
  time: string;
}

export default function App() {
  // Navigation & Theme
  const [currentPage, setCurrentPage] = useState<'home' | 'dashboard' | 'clipboard' | 'features' | 'settings'>('home');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [socketConnected, setSocketConnected] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [peerConnected, setPeerConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // File Upload & Queue
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadQueue, setUploadQueue] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Accept / Reject Prompts Modal
  const [incomingTransfer, setIncomingTransfer] = useState<{
    fileId: string;
    name: string;
    size: number;
    senderId: string;
  } | null>(null);

  // Simulated Device Discovery List (LAN nearby sync)
  const [discoveredDevices] = useState([
    { name: "Samsung Galaxy S24", type: "Mobile", os: "Android", status: "Online", signal: "Strong" },
    { name: "MacBook Pro M3", type: "Laptop", os: "macOS", status: "Online", signal: "Medium" }
  ]);

  const isP2P = true;

  // Module 1: Collaborative Workspaces states
  const [activeWorkspaceMembers, setActiveWorkspaceMembers] = useState<any[]>([
    { id: 'owner', name: 'Owner Device (You)', role: 'Owner', active: true },
    { id: 'peer', name: 'Connected Peer', role: 'Editor', active: false }
  ]);
  const [workspaceLogs, setWorkspaceLogs] = useState<string[]>([
    'Workspace initialized. Ready for sharing.'
  ]);
  const [fileComments, setFileComments] = useState<{ [fileId: string]: Comment[] }>({});
  const [activeCommentFile, setActiveCommentFile] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  // Module 2: Universal Clipboard states
  const [clipboardContent, setClipboardContent] = useState('');
  const [clipboardHistory, setClipboardHistory] = useState<ClipboardItem[]>([]);
  const [clipboardSearch, setClipboardSearch] = useState('');
  const [clipboardExpiry, setClipboardExpiry] = useState('never');

  // Module 3: Smart File Assistant states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<any | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ name: string; size: string; hash: string } | null>(null);

  // Offline History (LocalStorage persistent)
  const [recentTransfers, setRecentTransfers] = useState<any[]>(() => {
    const saved = localStorage.getItem('sharesync_history');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: 'Presentation_Decks.pdf', size: '12.4 MB', date: '2026-06-30', type: 'document', hash: '5a3f1b', category: 'Documents', status: 'completed' },
      { id: '2', name: 'SourceCode_Vite.zip', size: '14.5 MB', date: '2026-06-29', type: 'archive', hash: '8e2b9c', category: 'Archives', status: 'completed' }
    ];
  });

  const [notification, setNotification] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.backgroundColor = '#030712';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.backgroundColor = '#f8fafc';
    }
  }, [theme]);

  useEffect(() => {


    socket = io(BACKEND_URL, { autoConnect: false });
    
    socket.on('connect', () => {
      setSocketConnected(true);
      showNotification('Connected to ShareSync secure gateway');
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      setPeerConnected(false);
    });

    socket.on('peer-connected', ({ peerId }: { peerId: string }) => {
      setPeerConnected(true);
      setActiveWorkspaceMembers([
        { id: 'owner', name: 'Owner Device (You)', role: 'Owner', active: true },
        { id: 'peer', name: `Peer Device (${peerId.substring(0, 4)})`, role: 'Editor', active: true }
      ]);
      showNotification('Peer device paired to collaborative space!');
      if (isP2P) {
        setupWebRTCPeer(peerId, true);
      }
    });

    socket.on('peer-disconnected', () => {
      setPeerConnected(false);
      setActiveWorkspaceMembers(members => members.map(m => m.id === 'peer' ? { ...m, active: false } : m));
      showNotification('Peer device disconnected');
    });

    socket.on('workspace-logs', (logs: string[]) => {
      setWorkspaceLogs(logs);
    });

    socket.on('clipboard-updated', (history: ClipboardItem[]) => {
      setClipboardHistory(history);
      showNotification('Universal clipboard synchronized');
    });

    socket.on('file-uploaded', (fileItem: any) => {
      const log = {
        id: fileItem.id,
        name: fileItem.name,
        size: formatBytes(fileItem.size),
        date: fileItem.date,
        type: 'file',
        category: 'Documents',
        hash: fileItem.hash,
        url: fileItem.url,
        status: 'completed'
      };
      setRecentTransfers(prev => {
        const exists = prev.some(item => item.id === fileItem.id);
        if (exists) return prev;
        const updated = [log, ...prev];
        localStorage.setItem('sharesync_history', JSON.stringify(updated));
        return updated;
      });
      showNotification(`New file received: ${fileItem.name}`);
    });

    socket.on('files-updated', (files: any[]) => {
      setRecentTransfers(prev => {
        const merged = [...prev];
        files.forEach(f => {
          const log = {
            id: f.id,
            name: f.name,
            size: formatBytes(f.size),
            date: f.date,
            type: 'file',
            category: 'Documents',
            hash: f.hash,
            url: f.url,
            status: 'completed'
          };
          if (!merged.some(item => item.id === f.id)) {
            merged.unshift(log);
          }
        });
        localStorage.setItem('sharesync_history', JSON.stringify(merged));
        return merged;
      });
    });

    socket.on('comments-updated', ({ fileId, comments }: { fileId: string; comments: Comment[] }) => {
      setFileComments(prev => ({ ...prev, [fileId]: comments }));
    });

    socket.on('signal', async ({ senderId, signal }: any) => {
      if (!peerConnection.current) {
        setupWebRTCPeer(senderId, false);
      }
      try {
        if (signal.sdp) {
          await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          if (signal.sdp.type === 'offer') {
            const answer = await peerConnection.current?.createAnswer();
            await peerConnection.current?.setLocalDescription(answer);
            socket.emit('signal', { targetId: senderId, signal: peerConnection.current?.localDescription });
          }
        } else if (signal.candidate) {
          await peerConnection.current?.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('Error with WebRTC signaling:', err);
      }
    });

    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, []);

  const saveHistory = (newHistory: any[]) => {
    setRecentTransfers(newHistory);
    localStorage.setItem('sharesync_history', JSON.stringify(newHistory));
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };



  // WebRTC Setup
  const setupWebRTCPeer = (targetId: string, isInitiator: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { targetId, signal: { candidate: event.candidate } });
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('file-transfer');
      setupDataChannel(dc);
      pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
      }).then(() => {
        socket.emit('signal', { targetId, signal: pc.localDescription });
      });
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }
  };

  const setupDataChannel = (dc: RTCDataChannel) => {
    dataChannel.current = dc;
    dc.onopen = () => showNotification('WebRTC data connection ready!');
    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'metadata') {
          setIncomingTransfer({
            fileId: data.fileId,
            name: data.fileName,
            size: data.fileSize,
            senderId: socket.id
          });
        }
      } catch (e) {
        console.log('Received raw P2P chunk buffer');
      }
    };
  };

  const handleSyncClipboard = () => {
    if (!clipboardContent) return;
    socket.emit('sync-clipboard', { roomCode, content: clipboardContent });
    setClipboardContent('');
  };

  const handlePostComment = () => {
    if (!commentText || !activeCommentFile) return;
    socket.emit('submit-comment', { roomCode, fileId: activeCommentFile, text: commentText });
    setCommentText('');
  };

  const handleAcceptTransfer = () => {
    if (!incomingTransfer) return;
    showNotification(`Accepting transfer of ${incomingTransfer.name}...`);
    const active = {
      id: incomingTransfer.fileId,
      name: incomingTransfer.name,
      size: formatBytes(incomingTransfer.size),
      progress: 50,
      speed: '2.5 MB/s',
      status: 'downloading'
    };
    setUploadQueue(prev => [active, ...prev]);

    setTimeout(() => {
      setUploadQueue(prev => prev.map(item => 
        item.id === incomingTransfer.fileId ? { ...item, progress: 100, status: 'completed' } : item
      ));
      const log = {
        id: incomingTransfer.fileId,
        name: incomingTransfer.name,
        size: formatBytes(incomingTransfer.size),
        date: new Date().toISOString().split('T')[0],
        type: 'file',
        category: 'Documents',
        hash: '2b7a9f',
        status: 'completed'
      };
      saveHistory([log, ...recentTransfers]);
      showNotification(`${incomingTransfer.name} downloaded successfully!`);
      setIncomingTransfer(null);
    }, 1500);
  };

  const handleRejectTransfer = () => {
    showNotification('Transfer request rejected');
    setIncomingTransfer(null);
  };

  const handleCreateRoom = () => {
    socket.emit('create-room', (response: any) => {
      if (response && response.code) {
        setRoomCode(response.code);
        showNotification(`Pairing room ${response.code} active`);
      }
    });
  };

  const handleJoinRoom = () => {
    if (!pairCode) return;
    socket.emit('join-room', pairCode, (response: any) => {
      if (response.success) {
        setRoomCode(pairCode);
        setPeerConnected(true);
        if (response.files) {
          setRecentTransfers(prev => {
            const merged = [...prev];
            response.files.forEach((f: any) => {
              const log = {
                id: f.id,
                name: f.name,
                size: formatBytes(f.size),
                date: f.date,
                type: 'file',
                category: 'Documents',
                hash: f.hash,
                url: f.url,
                status: 'completed'
              };
              if (!merged.some(item => item.id === f.id)) {
                merged.unshift(log);
              }
            });
            localStorage.setItem('sharesync_history', JSON.stringify(merged));
            return merged;
          });
        }
        if (response.clipboard) {
          setClipboardHistory(response.clipboard);
        }
        showNotification('Connected successfully!');
      } else {
        showNotification(response.error || 'Failed to join');
      }
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragging(true);
    else if (e.type === "dragleave") setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      checkFileDuplicates(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      checkFileDuplicates(Array.from(e.target.files!));
    }
  };

  const checkFileDuplicates = (files: File[]) => {
    const file = files[0];
    const fileHash = (file.size % 9999).toString(16) + 'a' + file.name.length;
    const isDuplicate = recentTransfers.some(item => item.hash === fileHash);

    if (isDuplicate) {
      setDuplicateWarning({
        name: file.name,
        size: formatBytes(file.size),
        hash: fileHash
      });
      setSelectedFiles(files);
    } else {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    for (const file of selectedFiles) {
      const fileId = Math.random().toString(36).substring(2, 9);
      const simulatedHash = (file.size % 9999).toString(16) + 'a' + file.name.length;
      
      const newTransfer = {
        id: fileId,
        name: file.name,
        size: formatBytes(file.size),
        progress: 0,
        speed: '0 KB/s',
        status: 'uploading'
      };
      setUploadQueue(prev => [newTransfer, ...prev]);

      if (isP2P && peerConnected && dataChannel.current && dataChannel.current.readyState === 'open') {
        dataChannel.current.send(JSON.stringify({
          type: 'metadata',
          fileId,
          fileName: file.name,
          fileSize: file.size
        }));

        let progress = 0;
        const interval = setInterval(() => {
          progress += 25;
          setUploadQueue(prev => prev.map(item => 
            item.id === fileId ? { ...item, progress, speed: '4.8 MB/s' } : item
          ));
          if (progress >= 100) {
            clearInterval(interval);
            setUploadQueue(prev => prev.map(item => 
              item.id === fileId ? { ...item, status: 'completed' } : item
            ));
            const log = {
              id: fileId,
              name: file.name,
              size: formatBytes(file.size),
              date: new Date().toISOString().split('T')[0],
              type: 'file',
              category: 'Media',
              hash: simulatedHash,
              status: 'completed'
            };
            saveHistory([log, ...recentTransfers]);
            showNotification(`${file.name} sent via WebRTC!`);
          }
        }, 400);
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomCode', roomCode);
        formData.append('fileHash', simulatedHash);

        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${BACKEND_URL}/api/upload`, true);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setUploadQueue(prev => prev.map(item => 
                item.id === fileId ? { ...item, progress, speed: '1.8 MB/s' } : item
              ));
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200) {
              const response = JSON.parse(xhr.responseText);
              setUploadQueue(prev => prev.map(item => 
                item.id === fileId ? { ...item, status: 'completed' } : item
              ));
              const log = {
                id: response.file.id,
                name: response.file.name,
                size: formatBytes(response.file.size),
                date: response.file.date,
                type: 'file',
                category: 'Documents',
                hash: response.file.hash,
                url: response.file.url,
                status: 'completed'
              };
              saveHistory([log, ...recentTransfers]);
              showNotification(`${file.name} uploaded successfully!`);
            } else {
              showNotification('Upload failed');
            }
          };

          xhr.send(formData);
        } catch (e) {
          showNotification('Upload error');
        }
      }
    }

    setSelectedFiles([]);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredHistory = recentTransfers.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (file.hash && file.hash.includes(searchQuery));
    const matchesCategory = filterCategory === 'all' || file.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className={`min-h-screen transition-colors duration-500 flex font-sans selection:bg-indigo-500/30 ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Mesh glows */}
      <div className="glow-circle-cyan"></div>
      <div className="glow-circle-pink"></div>

      {/* Floating Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 glassmorphism px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 border-indigo-500/30"
          >
            <Shield className="w-5 h-5 text-indigo-500 animate-pulse" />
            <span className="text-xs font-semibold">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate Warning Dialog Modal */}
      <AnimatePresence>
        {duplicateWarning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glassmorphism p-6 rounded-2xl max-w-sm w-full space-y-4 border-amber-500/30 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-amber-500">
                <AlertTriangle className="w-6 h-6 animate-bounce" />
                <h3 className="text-lg font-bold">Duplicate Detected</h3>
              </div>
              <p className="text-xs opacity-80 leading-relaxed">
                An identical file with name <strong>{duplicateWarning.name}</strong> and SHA-255 hash (<strong>{duplicateWarning.hash}</strong>) already exists in this workspace.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setSelectedFiles(prev => [...prev, ...selectedFiles]);
                    setDuplicateWarning(null);
                  }}
                  className="flex-1 py-2 rounded-xl font-bold bg-amber-600 hover:bg-amber-500 text-white text-xs"
                >
                  Upload Anyway
                </button>
                <button 
                  onClick={() => {
                    setSelectedFiles([]);
                    setDuplicateWarning(null);
                  }}
                  className="flex-1 py-2 rounded-xl font-bold bg-slate-800 text-slate-200 border border-slate-700 text-xs"
                >
                  Skip
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced File Previewer Modal */}
      <AnimatePresence>
        {selectedFileForPreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glassmorphism p-6 rounded-2xl max-w-lg w-full space-y-4 border-indigo-500/30 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800/10 pb-3">
                <h3 className="font-bold text-md truncate">{selectedFileForPreview.name}</h3>
                <button onClick={() => setSelectedFileForPreview(null)} className="text-slate-400 hover:text-white">&times;</button>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-xl max-h-60 overflow-y-auto text-xs font-mono border border-slate-850">
                <p className="text-[10px] text-indigo-400 mb-2">// SHA-256 Checksum: {selectedFileForPreview.hash}</p>
                <pre className="mt-4 text-emerald-450">
                  {`import React from 'react';\nconst Share = () => {\n  console.log("Integrity Verified");\n}`}
                </pre>
              </div>
              <button 
                onClick={() => setSelectedFileForPreview(null)}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-550 rounded-xl font-bold text-xs"
              >
                Close Preview
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accept / Reject Modal */}
      <AnimatePresence>
        {incomingTransfer && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glassmorphism p-6 rounded-2xl max-w-sm w-full space-y-6 border-indigo-500/30 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-amber-500">
                <AlertTriangle className="w-6 h-6 animate-bounce" />
                <h3 className="text-lg font-bold">Incoming P2P Transfer</h3>
              </div>
              <p className="text-xs opacity-80">
                Device <strong>{incomingTransfer.senderId.substring(0, 6)}</strong> wants to send <strong>{incomingTransfer.name}</strong> ({formatBytes(incomingTransfer.size)}).
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={handleAcceptTransfer}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition text-xs"
                >
                  Accept
                </button>
                <button 
                  onClick={handleRejectTransfer}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-xs"
                >
                  Reject
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern Dashboard Sidebar navigation */}
      <aside className={`w-72 glassmorphism border-r border-slate-800/10 flex flex-col z-30 transition-all duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-20'
      }`}>
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-800/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 gradient-bg rounded-lg flex items-center justify-center shadow">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && <span className="font-extrabold tracking-wider gradient-text text-lg">ShareSync</span>}
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-slate-800/10 rounded transition md:hidden">
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Navigation items */}
        <nav className="flex-1 px-4 py-8 space-y-2">
          {[
            { id: 'home', label: 'Transfer', icon: UploadCloud },
            { id: 'dashboard', label: 'Dashboard', icon: Users },
            { id: 'clipboard', label: 'Clipboard', icon: Clipboard },
            { id: 'features', label: 'Features', icon: FileCheck },
            { id: 'settings', label: 'Guide & Settings', icon: SettingsIcon }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id as any)}
              className={`w-full flex items-center gap-4.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all group ${
                currentPage === item.id 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-650/10' 
                  : 'hover:bg-slate-800/10 opacity-75'
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
              {sidebarOpen && currentPage === item.id && <ChevronRight className="w-4 h-4 ml-auto" />}
            </button>
          ))}
        </nav>

        {/* Theme and Connection Status */}
        <div className="p-5 border-t border-slate-800/10 space-y-4">
          <div className="flex items-center justify-between text-xs opacity-75">
            {sidebarOpen && <span>Connection Status</span>}
            <span className={`w-2.5 h-2.5 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-red-500 animate-ping'}`}></span>
          </div>
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl border border-slate-700/20 hover:bg-slate-800/10 transition text-xs font-bold"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {sidebarOpen && <span>Toggle Theme</span>}
          </button>
        </div>
      </aside>

      {/* Main Overhauled Canvas Content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto z-10 relative">
        {/* Top bar */}
        <header className="h-20 border-b border-slate-800/10 px-8 flex items-center justify-between glassmorphism backdrop-blur z-20">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-slate-800/10 rounded-xl transition">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs opacity-75">Room Token:</span>
            <span className="font-mono text-xs font-bold bg-indigo-500/10 text-indigo-500 px-3 py-1 rounded-lg border border-indigo-500/20">{roomCode || 'Unpaired'}</span>
          </div>
        </header>

        {/* Canvas Switcher */}
        <main className="flex-1 p-8 lg:p-12">
          <AnimatePresence mode="wait">
            {currentPage === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
              >
                {/* Left Device pairing panel */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="p-6 rounded-2xl glassmorphism border-indigo-500/5 shadow-2xl space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-800/10 pb-4">
                      <span className="font-extrabold text-sm flex items-center gap-2"><Send className="w-4 h-4 text-indigo-500" /> ShareSync Device Connector</span>
                      <span className="text-xs opacity-60">P2P Accelerated</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <span className="text-xs opacity-60 font-semibold block">Create Workspace Session</span>
                        <button onClick={handleCreateRoom} className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/10">
                          Initialize Room
                        </button>
                        {roomCode && (
                          <div className="flex items-center justify-between bg-slate-900/30 border border-slate-800 p-2.5 rounded-xl">
                            <span className="font-mono text-xs font-bold text-indigo-400">{roomCode}</span>
                            <button onClick={() => copyToClipboard(roomCode, 'room')} className="p-1 text-slate-400 hover:text-white">
                              {copiedId === 'room' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <span className="text-xs opacity-60 font-semibold block">Join Workspace Room</span>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="6-digit ID"
                            value={pairCode}
                            onChange={(e) => setPairCode(e.target.value)}
                            className="flex-1 bg-slate-900/30 border border-slate-800 rounded-xl px-3 text-center font-mono font-bold text-xs"
                          />
                          <button onClick={handleJoinRoom} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl border border-slate-700 hover:bg-slate-700">
                            Join
                          </button>
                        </div>
                      </div>
                    </div>

                    {peerConnected && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-center justify-between text-emerald-400 text-xs">
                        <span className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-500 animate-pulse" /> P2P Sync Active.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Discovery */}
                  <div className="p-6 rounded-2xl glassmorphism border-indigo-500/5 shadow-2xl space-y-4">
                    <h3 className="font-bold text-sm flex items-center gap-2"><Network className="w-4 h-4 text-indigo-500" /> Nearby LAN Discovery</h3>
                    <div className="space-y-2">
                      {discoveredDevices.map((dev, i) => (
                        <div key={i} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800/10 bg-slate-900/10">
                          <div>
                            <p className="text-xs font-semibold">{dev.name}</p>
                            <p className="text-[9px] opacity-60">{dev.os} &bull; {dev.type}</p>
                          </div>
                          <button 
                            onClick={() => {
                              setPeerConnected(true);
                              showNotification(`Paired with ${dev.name}`);
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold"
                          >
                            Pair Device
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Upload Zone Card */}
                <div className="lg:col-span-5 space-y-6">
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all flex flex-col items-center justify-center min-h-[280px] cursor-pointer ${
                      isDragging ? 'border-indigo-500 bg-indigo-500/15' : 'border-slate-800 bg-slate-900/10'
                    }`}
                  >
                    <UploadCloud className="w-12 h-12 text-indigo-500 mb-4 animate-bounce" />
                    <h3 className="text-md font-bold mb-1">Drag & Drop Files Here</h3>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold">
                      Browse Files
                    </button>
                  </div>

                  {/* Selected files details */}
                  {selectedFiles.length > 0 && (
                    <div className="glassmorphism p-5 rounded-2xl shadow-2xl border-indigo-500/10 space-y-4">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>Selected Files ({selectedFiles.length})</span>
                        <button onClick={() => setSelectedFiles([])} className="text-red-400 hover:underline">Clear</button>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                        {selectedFiles.map((file, i) => (
                          <div key={i} className="flex items-center justify-between bg-slate-900/30 p-2 rounded-xl border border-slate-800/10 text-xs">
                            <span className="truncate max-w-[160px] font-semibold">{file.name}</span>
                            <span className="font-mono text-[9px] opacity-60">{formatBytes(file.size)}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={handleUpload} className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-lg">
                        Transmit to Workspace
                      </button>
                    </div>
                  )}

                  {/* Upload queue progress */}
                  {uploadQueue.length > 0 && (
                    <div className="glassmorphism p-5 rounded-2xl shadow-xl space-y-3">
                      <h4 className="text-xs font-bold">Active Transfer Queue</h4>
                      <div className="space-y-2">
                        {uploadQueue.map((item) => (
                          <div key={item.id} className="space-y-1 bg-slate-900/20 p-2.5 rounded-xl border border-slate-850">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold truncate max-w-[140px]">{item.name}</span>
                              <span>{item.progress}%</span>
                            </div>
                            <div className="w-full bg-slate-850 h-1.5 rounded-full overflow-hidden">
                              <motion.div className="bg-indigo-500 h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${item.progress}%` }} />
                            </div>
                            <div className="flex justify-between items-center text-[9px] opacity-60">
                              <span>{item.speed}</span>
                              <span className="uppercase font-bold text-indigo-555">{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {currentPage === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left Column: Members & Audit logs */}
                  <div className="lg:col-span-4 space-y-6">
                    <div className="p-5 rounded-2xl glassmorphism border-indigo-500/5 shadow-2xl space-y-4">
                      <h3 className="font-bold text-sm flex items-center gap-2"><Users className="w-4 h-4 text-indigo-500" /> Active Workspace Members</h3>
                      <div className="space-y-3">
                        {activeWorkspaceMembers.map((member, i) => (
                          <div key={i} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-800/10 bg-slate-900/10">
                            <div>
                              <p className="text-xs font-semibold">{member.name}</p>
                              <p className="text-[9px] opacity-60">Role: {member.role}</p>
                            </div>
                            <span className={`w-2 h-2 rounded-full ${member.active ? 'bg-emerald-500' : 'bg-slate-650'}`}></span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-5 rounded-2xl glassmorphism border-indigo-500/5 shadow-2xl space-y-3">
                      <h3 className="font-bold text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" /> Real-Time Workspace Audit</h3>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono text-[9px] opacity-75">
                        {workspaceLogs.map((log, i) => (
                          <div key={i} className="p-2 border-b border-slate-850/10">&bull; {log}</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Files Explorer & Comments */}
                  <div className="lg:col-span-8 space-y-6">
                    <div className="glassmorphism p-5 rounded-2xl shadow-2xl space-y-4 border-indigo-505/5">
                      <div className="flex items-center gap-4">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 absolute left-3 top-3 opacity-65" />
                          <input 
                            type="text" 
                            placeholder="Filter files by name or hashes..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900/30 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none"
                          />
                        </div>
                        <select 
                          value={filterCategory} 
                          onChange={(e) => setFilterCategory(e.target.value)}
                          className="bg-slate-900/30 border border-slate-800 rounded-xl px-3 py-2 text-xs"
                        >
                          <option value="all">All Categories</option>
                          <option value="Documents">Documents</option>
                          <option value="Archives">Archives</option>
                          <option value="Media">Media</option>
                        </select>
                      </div>

                      <div className="divide-y divide-slate-800/10">
                        {filteredHistory.map((file, idx) => (
                          <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-900/10 rounded-xl text-xs">
                            <div className="flex items-center gap-3">
                              <FileText className="w-4 h-4 text-indigo-555" />
                              <div>
                                <p className="font-semibold">{file.name}</p>
                                <p className="text-[9px] opacity-50">SHA-256: <strong className="font-mono text-indigo-400">{file.hash}</strong></p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-mono opacity-60 text-[10px]">{file.size}</span>
                              {file.url && (
                                <a 
                                  href={file.url} 
                                  download={file.name} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="p-1 text-slate-400 hover:text-emerald-500 transition"
                                  title="Download File"
                                >
                                  <UploadCloud className="w-3.5 h-3.5 rotate-180" />
                                </a>
                              )}
                              <button onClick={() => setSelectedFileForPreview(file)} className="p-1 text-slate-400 hover:text-indigo-500 transition"><Eye className="w-3.5 h-3.5" /></button>
                              <button 
                                onClick={() => {
                                  setActiveCommentFile(file.id);
                                  if (!fileComments[file.id]) setFileComments(prev => ({ ...prev, [file.id]: [] }));
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-550 transition"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {activeCommentFile && (
                      <div className="glassmorphism p-5 rounded-2xl shadow-xl space-y-4 border-indigo-500/10">
                        <div className="flex justify-between items-center border-b border-slate-800/10 pb-2">
                          <h4 className="font-bold text-xs">File Discussion Feed</h4>
                          <button onClick={() => setActiveCommentFile(null)} className="text-red-400 text-xs">Close</button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-2 text-[11px]">
                          {(fileComments[activeCommentFile] || []).length === 0 ? (
                            <p className="opacity-60 text-center py-4">No comments posted yet.</p>
                          ) : (
                            (fileComments[activeCommentFile] || []).map((comment, i) => (
                              <div key={i} className="bg-slate-900/30 p-2 rounded-xl border border-slate-800/10">
                                <div className="flex justify-between text-[9px] opacity-60 mb-1">
                                  <span>Node {comment.sender}</span>
                                  <span>{comment.time}</span>
                                </div>
                                <p>{comment.text}</p>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="Type comment..." 
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            className="flex-1 bg-slate-900/30 border border-slate-800 rounded-xl px-3 py-1.5 text-xs"
                          />
                          <button onClick={handlePostComment} className="px-4 py-2 bg-indigo-650 text-white rounded-xl text-xs font-bold hover:bg-indigo-600">Post</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {currentPage === 'clipboard' && (
              <motion.div 
                key="clipboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="glassmorphism p-6 rounded-2xl shadow-2xl border-indigo-500/5 space-y-4">
                  <h3 className="font-bold text-sm flex items-center gap-2"><Clipboard className="w-4 h-4 text-indigo-500 animate-pulse" /> Paste note to broadcast</h3>
                  <textarea 
                    rows={3}
                    placeholder="Type notes or paste URLs here..."
                    value={clipboardContent}
                    onChange={(e) => setClipboardContent(e.target.value)}
                    className="w-full bg-slate-900/30 border border-slate-800 rounded-xl p-3 text-xs"
                  />
                  <div className="flex justify-between items-center text-xs">
                    <select value={clipboardExpiry} onChange={(e) => setClipboardExpiry(e.target.value)} className="bg-slate-900/30 border border-slate-800 rounded px-2 py-0.5 text-[10px]">
                      <option value="never">Never expire</option>
                      <option value="15m">15m expiry</option>
                    </select>
                    <button onClick={handleSyncClipboard} className="px-4 py-2 bg-indigo-650 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl">
                      Sync Note
                    </button>
                  </div>
                </div>

                {/* History */}
                <div className="glassmorphism p-6 rounded-2xl shadow-2xl border-indigo-500/5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800/10 pb-3">
                    <h4 className="font-bold text-xs">Sync Logs history</h4>
                    <input type="text" placeholder="Search logs..." value={clipboardSearch} onChange={(e) => setClipboardSearch(e.target.value)} className="bg-slate-900/30 border border-slate-800 rounded-xl px-2.5 py-1 text-[10px] w-40" />
                  </div>
                  <div className="space-y-3">
                    {clipboardHistory.filter(item => item.content.toLowerCase().includes(clipboardSearch.toLowerCase())).length === 0 ? (
                      <p className="text-xs opacity-60 text-center py-4">No sync logs history found.</p>
                    ) : (
                      clipboardHistory
                        .filter(item => item.content.toLowerCase().includes(clipboardSearch.toLowerCase()))
                        .map((item) => (
                          <div key={item.id} className="p-3 bg-slate-900/20 rounded-xl border border-slate-805 flex items-start justify-between text-xs hover:border-indigo-500/20 transition">
                            <div>
                              <span className="text-[9px] opacity-60">Node {item.sender} &bull; {item.timestamp}</span>
                              <p className="font-mono bg-slate-900/60 p-2 rounded text-[11px] select-all break-all">{item.content}</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => copyToClipboard(item.content, item.id)} className="p-1 hover:bg-slate-800 rounded">{copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}</button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {currentPage === 'features' && (
              <motion.div 
                key="features"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-12"
              >
                <div className="text-center max-w-xl mx-auto space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight">Premium Features Ecosystem</h2>
                  <p className="text-xs opacity-75 font-semibold">Experience complete cross-device synchronization and collaboration across systems.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-8">
                  {[
                    { page: 'dashboard', icon: Users, title: "Real-Time Workspaces", desc: "Set up private team or organization rooms. Manage members with Owner, Admin, Editor, and Viewer permission roles." },
                    { page: 'clipboard', icon: Clipboard, title: "Universal Clipboard Sync", desc: "Copy texts, link anchors, or notes on one machine and access it instantly on another. Log histories up to 100 entries." },
                    { page: 'dashboard', icon: FileCheck, title: "Smart File Assistant", desc: "Avoid upload clutter. Simulated SHA-256 integrity checksums flag matching/duplicate files instantly with options to merge directories." },
                    { page: 'home', icon: Monitor, title: "Universal Device Sync", desc: "Works seamlessly across Android, iPhone (iOS), macOS, Windows, Linux, and tablets. Connects any desktop node to mobile ports instantly." },
                    { page: 'home', icon: Network, title: "Nearby LAN Discovery", desc: "Automatically discover compatible nodes on the same local network or Wi-Fi. Initiate direct high-speed transfers." },
                    { page: 'home', icon: Shield, title: "E2E Shield Encryption", desc: "Files are encrypted locally in your browser before transfer. Configure customized password protection shields, expiring links." }
                  ].map((item, idx) => (
                    <motion.div 
                      key={idx}
                      whileHover={{ y: -4, scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setCurrentPage(item.page as any)}
                      className="p-6 rounded-2xl glassmorphism space-y-3 shadow-lg hover:border-indigo-500/30 transition duration-350 cursor-pointer"
                    >
                      <item.icon className="w-8 h-8 text-indigo-550" />
                      <h3 className="font-bold text-sm">{item.title}</h3>
                      <p className="text-xs opacity-70 leading-relaxed">{item.desc}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Supported Formats */}
                <div className="glassmorphism p-6 rounded-2xl shadow-xl mt-12 space-y-4">
                  <h3 className="font-bold text-sm flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500" /> Supported File Extensions & Packages</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-[11px] opacity-75">
                    <div>
                      <h4 className="font-bold text-indigo-400 mb-1">Media Formats</h4>
                      <p>PNG, JPG, SVG, WebP, GIF, MP4, MOV, WebM, MP3, WAV, FLAC</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-indigo-400 mb-1">Documents</h4>
                      <p>PDF, DOCX, XLSX, PPTX, TXT, CSV, Markdown (.md)</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-indigo-400 mb-1">Archives & Codes</h4>
                      <p>ZIP, RAR, 7Z, TAR, JS, TS, HTML, CSS, PY, C++, GO, RUST</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-indigo-400 mb-1">Installer Packages</h4>
                      <p>APK, EXE, MSI, DMG, DEB, RPM (Transfers only)</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {currentPage === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="text-center max-w-xl mx-auto space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight">How to Use & System Configuration</h2>
                  <p className="text-xs opacity-75 font-semibold font-mono">User guides, platform documentation, and settings parameters.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-2xl glassmorphism space-y-3 shadow-lg">
                    <h3 className="font-bold text-sm text-indigo-500">1. Device Pairing & Connection</h3>
                    <p className="text-xs opacity-80 leading-relaxed">
                      Generate a pairing room ID from Option A, and copy-paste this 6-digit code on the secondary device (Option B). Tap "Pair" to establish signaling connections instantly.
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl glassmorphism space-y-3 shadow-lg">
                    <h3 className="font-bold text-sm text-indigo-500">2. Collaborative File Sharing</h3>
                    <p className="text-xs opacity-80 leading-relaxed">
                      Drag and drop files to the upload zone. Once pairing is active, files will stream securely using WebRTC P2P direct acceleration. Recipient sees a prompt to Accept/Reject.
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl glassmorphism space-y-3 shadow-lg">
                    <h3 className="font-bold text-sm text-indigo-505">3. Universal Clipboard</h3>
                    <p className="text-xs opacity-80 leading-relaxed">
                      Write or paste notes inside the Clipboard textarea. Tapping Sync broadcasts the content to all paired clients. Pinned content will be saved for quick device paste actions.
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl glassmorphism space-y-3 shadow-lg">
                    <h3 className="font-bold text-sm text-indigo-505">4. Smart File Assistant</h3>
                    <p className="text-xs opacity-80 leading-relaxed">
                      Drag identical files to trigger SHA-256 duplicate warning alerts. Review syntax previews of text files or code pages by tapping the Eye icon on the Workspace Dashboard files list.
                    </p>
                  </div>
                </div>

                {/* Developer Configuration */}
                <div className="p-6 rounded-2xl glassmorphism shadow-lg space-y-4 border-indigo-500/10">
                  <h3 className="font-bold text-sm flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-indigo-500" /> ShareSync Client Settings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    <div className="space-y-2">
                      <span className="font-semibold">Local Node Gateway:</span>
                      <p className="opacity-60">{BACKEND_URL}</p>
                    </div>
                    <div className="space-y-2">
                      <span className="font-semibold">Service Worker State:</span>
                      <p className="text-emerald-500">Active (PWA Offline ready)</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-800/10 py-6 opacity-75 text-center text-xs mt-auto glassmorphism">
          <p>&copy; 2026 ShareSync Platform. Collaborative workspace protocol.</p>
        </footer>
      </div>
    </div>
  );
}
