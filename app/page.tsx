'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { User, Loader2 } from 'lucide-react';
import { BACK_CARD_URL, FRONT_URLS } from '@/lib/constants';

export default function Home() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // === PRELOAD STATE ===
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);

  // Sign in anonymously saat komponen di-mount
  useEffect(() => {
    const signIn = async () => {
      try {
        const userCredential = await signInAnonymously(auth);
        setUserId(userCredential.user.uid);
      } catch (err) {
        console.error("Gagal login anonim:", err);
        setError("Gagal menghubungi server otentikasi.");
      }
    };
    signIn();
  }, []);

  // Preload Images
  useEffect(() => {
    const allUrls = [BACK_CARD_URL, ...FRONT_URLS];
    let loadedCount = 0;

    const onImageLoaded = () => {
      loadedCount++;
      setPreloadProgress(Math.floor((loadedCount / allUrls.length) * 100));
      if (loadedCount === allUrls.length) {
        setTimeout(() => setImagesLoaded(true), 600); // 1-tick delay biar mulus transisi UI
      }
    };

    allUrls.forEach((url) => {
      const img = new Image();
      img.src = url;
      img.onload = onImageLoaded;
      img.onerror = onImageLoaded; // agar skip bila 1 gagal terdownload (fallback aman)
    });
  }, []);

  if (!imagesLoaded) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center text-stone-100 p-6 z-50 overflow-hidden relative">
        <div className="absolute top-[30%] left-[20%] w-96 h-96 bg-red-900/30 rounded-full blur-[120px] pointer-events-none"></div>
        <h2 className="text-2xl font-black tracking-widest uppercase mb-6 text-red-500 drop-shadow-md z-10">Menyiapkan Lensa</h2>
        <div className="w-full max-w-xs h-3 bg-stone-900 rounded-full overflow-hidden border border-stone-800 z-10">
          <div className="h-full bg-red-600 transition-all duration-300 ease-out" style={{ width: `${preloadProgress}%` }}></div>
        </div>
        <p className="mt-4 text-xs font-bold text-stone-500 tracking-widest z-10">{preloadProgress}% - Mengunduh Aset Visual</p>
      </div>
    );
  }

  // Fungsi generate 4 huruf acak untuk Room ID
  const generateRoomId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const createRoom = async () => {
    if (!playerName.trim()) {
      setError("Silakan masukkan nama pemain terlebih dahulu.");
      return;
    }
    if (!userId) {
      setError("Autentikasi belum siap.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const newRoomId = generateRoomId();
      const roomRef = doc(db, 'rooms', newRoomId);

      // Struktur awal sesuai permintaan
      const roomData = {
        roomId: newRoomId,
        hostId: userId,
        status: "waiting", // waiting, playing, finished
        players: [{ id: userId, name: playerName, isEliminated: false }],
        deck: [],
        centerCards: [],
        turnOrder: [],
        currentTurnIndex: 0,
        votingState: null
      };

      await setDoc(roomRef, roomData);
      
      // Arahkan ke halaman room
      router.push(`/room/${newRoomId}`);
    } catch (err) {
      console.error("Gagal membuat room:", err);
      setError("Gagal membuat room. Silakan coba lagi.");
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!playerName.trim()) {
      setError("Silakan masukkan nama pemain terlebih dahulu.");
      return;
    }
    if (!joinRoomId.trim() || joinRoomId.length !== 4) {
      setError("Kode room harus 4 huruf.");
      return;
    }
    if (!userId) {
      setError("Autentikasi belum siap.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const roomCode = joinRoomId.toUpperCase();
      const roomRef = doc(db, 'rooms', roomCode);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        setError("Room tidak ditemukan.");
        setLoading(false);
        return;
      }

      const roomData = roomSnap.data();

      if (roomData.status !== 'waiting') {
        setError("Permainan di room ini sudah dimulai atau selesai.");
        setLoading(false);
        return;
      }

      // Cek jika pemain sudah ada di room (untuk re-join)
      const existingPlayer = roomData.players.find((p: any) => p.id === userId);

      if (!existingPlayer) {
        // Tambahkan user ke array players
        await updateDoc(roomRef, {
          players: arrayUnion({ id: userId, name: playerName, isEliminated: false })
        });
      }

      // Arahkan ke halaman room
      router.push(`/room/${roomCode}`);
    } catch (err) {
      console.error("Gagal join room:", err);
      setError("Gagal masuk ke room. Cek kembali koneksi Anda.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-stone-900 text-stone-100 font-sans flex items-center justify-center overflow-hidden relative">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-100px] left-[-100px] w-80 h-80 bg-red-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-100px] right-[-100px] w-96 h-96 bg-red-800 rounded-full blur-[150px]"></div>
      </div>

      {/* Main Content Container */}
      <div className="z-10 w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-8 px-6 md:px-12 relative">
        
        {/* Left Branding Section */}
        <div className="col-span-1 md:col-span-5 flex flex-col justify-center">
          <div className="mb-6 inline-flex items-center space-x-2 bg-red-600 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase self-start">
            <span>Status: Server Online</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-4">
            LAKON<br/>
            <span className="text-red-600">LENSA</span>
          </h1>
          <p className="text-stone-400 text-sm leading-relaxed max-w-xs mb-8">
            Permainan kartu sosial multipemain yang menguji intuisi dan strategi. Siapkan lensa Anda, tentukan lakonnya.
          </p>
          <div className="flex items-center space-x-4 border-t border-stone-800 pt-8">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-stone-700 border-2 border-stone-900"></div>
              <div className="w-8 h-8 rounded-full bg-stone-600 border-2 border-stone-900"></div>
              <div className="w-8 h-8 rounded-full bg-stone-500 border-2 border-stone-900"></div>
            </div>
            <span className="text-xs text-stone-500 font-medium">Bermain sekarang</span>
          </div>
        </div>

        {/* Right Setup Section */}
        <div className="col-span-1 md:col-span-7 flex flex-col justify-center">
          <div className="bg-stone-800/50 backdrop-blur-md p-8 md:p-10 rounded-2xl border border-stone-700 shadow-2xl">
            {error && (
              <div className="bg-red-900/30 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}
            
            <div className="mb-8">
              <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-500 mb-3">
                Identitas Pemain
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Contoh: Sang Sutradara"
                  maxLength={20}
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-4 text-stone-100 focus:outline-none focus:border-red-600 transition-colors" 
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <span className="text-xs text-stone-600">Wajib</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* New Room Action */}
              <div className="space-y-4">
                <button 
                  onClick={createRoom}
                  disabled={loading || !userId}
                  className="w-full h-full min-h-[140px] bg-red-600 hover:bg-red-700 text-white font-bold py-5 rounded-lg shadow-lg shadow-red-900/20 flex flex-col items-center justify-center transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin mb-1" />
                  ) : (
                    <>
                      <span className="text-lg">Bikin Room Baru</span>
                      <span className="text-[10px] opacity-60 font-normal tracking-wide">HOST GAME</span>
                    </>
                  )}
                </button>
              </div>

              {/* Join Room Action */}
              <div className="space-y-2 flex flex-col justify-between">
                <input 
                  type="text" 
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                  maxLength={4}
                  placeholder="KODE"
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-5 text-center font-mono text-xl tracking-[0.5em] focus:outline-none focus:border-stone-500 flex-grow" 
                />
                <button 
                  onClick={joinRoom}
                  disabled={loading || !userId}
                  className="w-full bg-stone-700 hover:bg-stone-600 text-white font-bold py-3 mt-1 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join Room'}
                </button>
              </div>
            </div>

            <div className="mt-12 flex flex-wrap items-center justify-between text-[10px] text-stone-600 uppercase tracking-widest border-t border-stone-700/50 pt-6 font-bold gap-2">
              <span>Firebase Anon Auth v1.0</span>
              <span>Build 0.4.2-ALPHA</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Decorative Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex space-x-12 opacity-30">
        <div className="flex items-center space-x-2">
          <div className="w-1 h-1 bg-red-600 rounded-full"></div>
          <span className="text-[10px] tracking-widest font-bold uppercase">Firestore Realtime</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1 h-1 bg-red-600 rounded-full"></div>
          <span className="text-[10px] tracking-widest font-bold uppercase">Anonymous Login</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1 h-1 bg-red-600 rounded-full"></div>
          <span className="text-[10px] tracking-widest font-bold uppercase">Game Deck Engine</span>
        </div>
      </div>
    </div>
  );
}
