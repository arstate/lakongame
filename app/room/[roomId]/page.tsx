'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc, collection, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Loader2, Crown, Copy, Check, Play, Users, LogOut, Send, MessageSquare } from 'lucide-react';

const BACK_CARD_URL = "https://github.com/user-attachments/assets/50fa672a-46b2-4761-a979-6449d96f45af";
const FRONT_URLS = [
  "https://github.com/user-attachments/assets/ad5bdf6e-9def-487d-9968-a512fb656ee6",
  "https://github.com/user-attachments/assets/864c8d6a-936f-4aa7-a4e8-07064c8399fd",
  "https://github.com/user-attachments/assets/1169168b-29b0-4ad2-9426-bd761b665d53",
  "https://github.com/user-attachments/assets/556318b8-d614-4158-a611-7a93f57f8cc3",
  "https://github.com/user-attachments/assets/8178d1ce-e9a7-44d8-b203-139cbc5f512f",
  "https://github.com/user-attachments/assets/51ad58da-6ec1-4c71-b206-7fd2084c245a",
  "https://github.com/user-attachments/assets/25ab8e4e-a83f-490e-b97d-ea29a4d45d3f",
  "https://github.com/user-attachments/assets/887845d3-5e29-45df-b611-95f8276fe246",
  "https://github.com/user-attachments/assets/cb1f8317-0045-4e36-a131-8b20f3b241c6",
  "https://github.com/user-attachments/assets/2de1a3db-c239-4577-a55f-084b5953f28b",
  "https://github.com/user-attachments/assets/ea9c13c1-7f12-4b27-b70e-9ccf83589b88",
  "https://github.com/user-attachments/assets/ae2106de-bfee-4d28-ac9c-847ca56bcf67",
  "https://github.com/user-attachments/assets/8d549dd6-f085-4891-a01b-03e558e1a5c1",
  "https://github.com/user-attachments/assets/fb0adfe5-672a-44ba-ad6d-86644193b7e2",
  "https://github.com/user-attachments/assets/a2704c59-3245-432c-9fd7-1a9f365b7225",
  "https://github.com/user-attachments/assets/becef208-8097-4d71-895d-1c728b68eefc",
  "https://github.com/user-attachments/assets/9f8cc4bb-7214-48b2-b887-dcb550b9724d",
  "https://github.com/user-attachments/assets/9948893e-27f2-46ca-b6a7-bd81a0e77dc4",
  "https://github.com/user-attachments/assets/d1f26aa9-110d-4b55-8a73-6221cd002a5e",
  "https://github.com/user-attachments/assets/295d649f-a10a-4579-a2a9-9ac4b9a7cf84"
];

const CARD_TITLES = [
  'Kopi Tumpah', 'Kucing Hitam', 'Surat Misterius', 'Kunci Berkarat', 'Bayangan Jendela',
  'Telepon Berdering', 'Pintu Terkunci', 'Lampu Berkedip', 'Cermin Retak', 'Jam Berhenti',
  'Hujan Deras', 'Pisau Dapur', 'Jejak Kaki', 'Buku Harian', 'Lilin Padam',
  'Gelas Pecah', 'Topeng Tua', 'Peta Robek', 'Bunga Layu', 'Tangisan Bayi', 'Kotak Musik'
];

// Fungsi Helper untuk mengacak array (Fisher-Yates)
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // === CHAT STATE ===
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll otomatis ke chat terbaru
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 1. Pantau Status Autentikasi Pengguna
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        // Jika tidak ada user tergistrasi / merefresh tanpa login, 
        // kembalikan ke home untuk memasukkan nama.
        router.push('/');
      }
    });
    return () => unsubscribe();
  }, [router]);

  // 2. Pantau Data Room Realtime via onSnapshot
  useEffect(() => {
    if (!userId || !roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snap) => {
      if (snap.exists()) {
        const roomData = snap.data();
        
        // Pilihan UX: Cek apakah user ada di array players
        const isPlayerInside = roomData.players.some((p: any) => p.id === userId);
        if (!isPlayerInside) {
            router.push('/'); // Lempar ke halaman depan jika ia bukan pemain sah
            return;
        }

        // AUTO-HOST TAKEOVER LOGIC
        // Jika status msih waiting, cek apakah current host masih ada di array `players`
        if (roomData.status === 'waiting') {
          const isHostStillHere = roomData.players.some((p: any) => p.id === roomData.hostId);
          if (!isHostStillHere && roomData.players.length > 0) {
            // Host tidak ditemukan! Player pertama dalam sisa array yg bertugas update database 
            // agar mencegah semua player mencoba nge-write doc yang sama bersamaan.
            if (roomData.players[0].id === userId) {
                updateDoc(roomRef, { hostId: userId }).catch(console.error);
            }
          }
        }

        setRoom(roomData);
      } else {
        setError('Room tidak ditemukan atau sudah dihapus.');
      }
      setLoading(false);
    }, (err) => {
      console.error("Gagal mendapatkan update room:", err);
      setError('Akses ditolak atau terputus dengan server.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, roomId, router]);

  // 2B. Pantau BeforeUnload (Player refresh / keluar app mendadak)
  useEffect(() => {
    if (!room || !userId) return;
    
    const handleBeforeUnload = () => {
      // Usaha Sinkronisasi untuk menghapus user dari room saat browser ditutup
      // Bersifat "Best Effort"
      const remainingPlayers = room.players.filter((p: any) => p.id !== userId);
      const roomRef = doc(db, 'rooms', roomId);
      // Panggil update (tanpa await agar sinkron sebelum browser kill process)
      updateDoc(roomRef, { players: remainingPlayers });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [room, userId, roomId]);

  // 2C. Pantau Data Chat Realtime via onSnapshot
  useEffect(() => {
    if (!roomId) return;
    
    const q = query(collection(db, 'rooms', roomId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [roomId]);

  // Tombol Keluar dari Lobi 
  const handleLeaveRoom = async () => {
    if (!room || !userId) return;
    setLoading(true);
    
    try {
      const remainingPlayers = room.players.filter((p: any) => p.id !== userId);
      const roomRef = doc(db, 'rooms', roomId);
      
      if (remainingPlayers.length === 0) {
        await updateDoc(roomRef, { status: 'finished' });
      } else {
        await updateDoc(roomRef, { players: remainingPlayers });
      }
    } catch(e) {
      console.error("Gagal keluar:", e);
    }
    router.push('/');
  };

  // Handle Copy ke Clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Submit Chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId || !room) return;

    const myPlayerInfo = room.players.find((p: any) => p.id === userId);
    const text = newMessage.trim();
    setNewMessage(''); 

    try {
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        text,
        senderId: userId,
        senderName: myPlayerInfo?.name || 'Pemain Misterius',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // 3. Fungsi Memulai Game Sesuai Tugas 2
  const startGame = async () => {
    if (!room || room.hostId !== userId) return;

    try {
      // a. Siapkan Tumpukan Kartu & Acak
      const gameCards = Array.from({ length: 21 }).map((_, i) => ({
        id: i + 1,
        text: CARD_TITLES[i],
        imageUrl: FRONT_URLS[i % FRONT_URLS.length]
      }));

      const shuffledCards = shuffleArray(gameCards);
      
      // b. Kartu pertama jadi centerCards pembuka
      const centerCard = shuffledCards.pop(); 
      const startCenterPayload = {
        card: [centerCard], // Harus dalam array berdasarkan prompt
        story: "KARTU PEMBUKA - Mari mulai ceritanya!",
        playerId: "system",
        playerName: "Sistem"
      };

      // c. Tentukan giliran secara acak
      const turnOrder = shuffleArray(room.players.map((p: any) => p.id));

      // d. Update dokumen room: ubah status ke playing
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, {
        status: 'playing',
        deck: shuffledCards,
        centerCards: [startCenterPayload],
        turnOrder: turnOrder,
        currentTurnIndex: 0
      });
    } catch (err) {
      console.error("Gagal memulai game:", err);
      setError("Terjadi kesalahan saat mesin memproses permainan.");
    }
  };

  // State: Sedang Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center text-red-500">
        <Loader2 className="w-12 h-12 animate-spin" />
      </div>
    );
  }

  // State: Error
  if (error) {
    return (
      <div className="min-h-screen bg-stone-900 flex flex-col items-center justify-center p-8 text-center text-stone-100">
        <div className="bg-stone-800 p-8 rounded-2xl border border-red-900/50 max-w-md">
          <p className="text-red-400 mb-6">{error}</p>
          <button onClick={() => router.push('/')} className="bg-stone-700 px-6 py-2 rounded-lg hover:bg-stone-600">
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  // State: Sedang Bermain (Playing) -> [Akan dikerjakan di tugas selanjutnya]
  if (room && room.status === 'playing') {
    return (
      <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center font-sans p-6 text-center">
        <div className="text-red-500 mb-4 animate-pulse">
          <Play className="w-16 h-16 mx-auto" />
        </div>
        <h2 className="text-3xl font-black tracking-tight mb-2">Permainan Berlangsung</h2>
        <p className="text-stone-400 max-w-md">
          Layar Arena Permainan (Game Board) akan diimplementasikan pada bagian selanjutnya.
          Status room saat ini telah sukses diubah menjadi &apos;playing&apos;.
        </p>
      </div>
    );
  }

  // State: Layar LOBBY (Status: waiting)
  const isHost = room.hostId === userId;
  const playerCount = room.players.length;

  return (
    <div className="min-h-screen w-full bg-stone-900 text-stone-100 font-sans flex items-center justify-center overflow-hidden relative">
      {/* Decorative Background */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[20%] left-[10%] w-96 h-96 bg-red-800 rounded-full blur-[150px]"></div>
      </div>

      <div className="z-10 w-full max-w-5xl px-4 md:px-6 py-10 md:py-0 h-screen overflow-y-auto md:h-auto md:overflow-visible flex flex-col justify-start md:justify-center">
        
        {/* LOBBY HEADER */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center px-4 py-1.5 bg-stone-800 border border-stone-700 rounded-full mb-6">
            <span className="text-xs font-bold tracking-widest text-stone-400 uppercase mr-3">
              Kode Room
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xl font-mono font-black text-red-500 tracking-[0.2em]">
                {roomId}
              </span>
              <button 
                onClick={handleCopy}
                className="text-stone-400 hover:text-stone-100 transition-colors bg-stone-700/50 p-1.5 rounded-md"
                title="Copy Kode"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter">LOBI PERMAINAN</h1>
          <p className="text-stone-400 text-sm mt-2">
            Pemain sedang berkumpul. Sambil menunggu, siapkan fokus dan strategi Anda.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full pb-10 md:pb-0">
          {/* KOLOM KIRI: DAFTAR PEMAIN & ACTION */}
          <div className="md:col-span-7 flex flex-col gap-6">
            
            {/* DAFTAR PEMAIN */}
            <div className="bg-stone-800/50 backdrop-blur-md rounded-2xl border border-stone-700 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6 border-b border-stone-700 pb-4">
            <h2 className="text-xs font-bold text-stone-500 tracking-widest uppercase flex items-center gap-2">
              <Users className="w-4 h-4" /> Daftar Pemain
            </h2>
            <span className="text-xs font-bold text-stone-500 bg-stone-900 px-3 py-1 rounded">
              {playerCount} / 4 MAX
            </span>
          </div>

          <div className="space-y-3">
            {room.players.map((player: any) => {
              const isPlayerHost = player.id === room.hostId;
              const isMe = player.id === userId;
              
              return (
                <div 
                  key={player.id} 
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                    isMe ? 'bg-stone-700/30 border-stone-600' : 'bg-stone-900/50 border-stone-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-stone-700 border-2 border-stone-600 flex items-center justify-center">
                      <span className="text-xs font-bold text-stone-400">
                        {player.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className={`font-semibold ${isMe ? 'text-white' : 'text-stone-300'}`}>
                      {player.name} {isMe && <span className="text-stone-500 text-xs font-normal ml-2">(Kamu)</span>}
                    </span>
                  </div>

                  {isPlayerHost && (
                    <div className="flex items-center gap-1.5 bg-red-600/10 text-red-500 px-3 py-1 rounded text-xs font-bold tracking-widest uppercase border border-red-500/20">
                      <Crown className="w-3.5 h-3.5" /> Host
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty Slots */}
            {Array.from({ length: Math.max(0, 4 - playerCount) }).map((_, i) => (
              <div 
                key={`empty-${i}`} 
                className="flex items-center justify-between p-4 rounded-xl border border-stone-800 border-dashed opacity-50 bg-stone-900/10"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-stone-800 border-dashed" />
                  <span className="text-stone-600 text-sm italic">Menunggu pemain...</span>
                </div>
              </div>
            ))}
          </div>
        </div>

            {/* HOST ACTION */}
            <div className="text-center bg-stone-800/30 p-6 rounded-2xl border border-stone-700/50">
              {isHost ? (
                <button
                  onClick={startGame}
                  className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold tracking-wider uppercase px-12 py-4 rounded-xl shadow-lg shadow-red-900/20 transition-all flex items-center justify-center gap-3 mx-auto group"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Mulai Game
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 text-stone-500 text-sm font-medium tracking-wide bg-stone-900/50 px-6 py-3 rounded-full border border-stone-700">
                  <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                  Menunggu Host memulai game...
                </div>
              )}

              {/* Tombol Keluar Manual */}
              <button 
                onClick={handleLeaveRoom}
                className="mt-5 flex items-center justify-center gap-2 w-full max-w-[200px] mx-auto text-stone-500 hover:text-red-500 transition-colors text-xs uppercase tracking-widest font-bold"
              >
                <LogOut className="w-4 h-4" /> Keluar dari Lobi
              </button>
            </div>
          </div>

          {/* KOLOM KANAN: LIVE CHAT */}
          <div className="md:col-span-5 flex flex-col h-[500px] bg-stone-800/50 backdrop-blur-md rounded-2xl border border-stone-700 shadow-2xl relative overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-700/50 flex items-center gap-2 bg-stone-800/80">
              <MessageSquare className="w-4 h-4 text-stone-400" />
              <h2 className="text-xs font-bold text-stone-400 tracking-widest uppercase">Live Chat</h2>
            </div>

            {/* AREA PESAN */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
              {messages.length === 0 ? (
                <div className="m-auto text-stone-500 text-sm flex flex-col items-center gap-3 text-center">
                  <MessageSquare className="w-10 h-10 opacity-20" />
                  <p>Belum ada pesan.<br/>Sapa pemain lain yuk!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === userId;
                  return (
                    <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                      <span className="text-[10px] text-stone-500 mb-1 ml-1 font-medium tracking-wide">
                        {isMe ? 'Kamu' : msg.senderName}
                      </span>
                      <div className={`px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-red-600 text-white rounded-tr-sm' : 'bg-stone-700 text-stone-200 rounded-tl-sm'}`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* INPUT FORM */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-stone-700/50 bg-stone-800/80 flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Ketik pesan..."
                className="flex-1 bg-stone-900 text-sm border border-stone-700 rounded-xl px-4 py-2.5 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-red-500/50 transition-colors"
              />
              <button 
                type="submit" 
                disabled={!newMessage.trim()}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 text-white px-4 py-2.5 rounded-xl transition-all flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
