'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Loader2, Crown, Copy, Check, Play, Users } from 'lucide-react';

// DUMMY CARDS (21 Kartu Sesuai Permintaan)
const DUMMY_CARDS = [
  { id: 1, text: 'Kopi Tumpah', icon: '☕' },
  { id: 2, text: 'Kucing Hitam', icon: '🐈‍⬛' },
  { id: 3, text: 'Surat Misterius', icon: '💌' },
  { id: 4, text: 'Kunci Berkarat', icon: '🗝️' },
  { id: 5, text: 'Bayangan Jendela', icon: '🪟' },
  { id: 6, text: 'Telepon Berdering', icon: '☎️' },
  { id: 7, text: 'Pintu Terkunci', icon: '🚪' },
  { id: 8, text: 'Lampu Berkedip', icon: '💡' },
  { id: 9, text: 'Cermin Retak', icon: '🪞' },
  { id: 10, text: 'Jam Berhenti', icon: '🕰️' },
  { id: 11, text: 'Hujan Deras', icon: '🌧️' },
  { id: 12, text: 'Pisau Dapur', icon: '🔪' },
  { id: 13, text: 'Jejak Kaki', icon: '👣' },
  { id: 14, text: 'Buku Harian', icon: '📓' },
  { id: 15, text: 'Lilin Padam', icon: '🕯️' },
  { id: 16, text: 'Gelas Pecah', icon: '🍷' },
  { id: 17, text: 'Topeng Tua', icon: '🎭' },
  { id: 18, text: 'Peta Robek', icon: '🗺️' },
  { id: 19, text: 'Bunga Layu', icon: '🥀' },
  { id: 20, text: 'Tangisan Bayi', icon: '👶' },
  { id: 21, text: 'Kotak Musik', icon: '🎶' },
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

  // Handle Copy ke Clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 3. Fungsi Memulai Game Sesuai Tugas 2
  const startGame = async () => {
    if (!room || room.hostId !== userId) return;

    try {
      // a. Siapkan Tumpukan Kartu & Acak
      const shuffledCards = shuffleArray(DUMMY_CARDS);
      
      // b. Kartu pertama jadi centerCards pembuka
      const centerCard = shuffledCards.pop(); 
      const startCenterPayload = {
        card: [centerCard], // Harus dalam array berdasarkan prompt
        story: "Kartu pembuka cerita",
        playerId: "system"
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

      <div className="z-10 w-full max-w-2xl px-6">
        
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

        {/* DAFTAR PEMAIN */}
        <div className="bg-stone-800/50 backdrop-blur-md rounded-2xl border border-stone-700 p-6 md:p-8 shadow-2xl mb-8">
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
        <div className="text-center">
          {isHost ? (
            <button
              onClick={startGame}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold tracking-wider uppercase px-12 py-4 rounded-xl shadow-lg shadow-red-900/20 transition-all flex items-center justify-center gap-3 mx-auto group"
            >
              <Play className="w-5 h-5 fill-current" />
              Mulai Game
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 text-stone-500 text-sm font-medium tracking-wide bg-stone-800 px-6 py-3 rounded-full">
              <Loader2 className="w-4 h-4 animate-spin text-red-600" />
              Menunggu Host memulai game...
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
