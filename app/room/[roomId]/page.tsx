'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc, collection, query, orderBy, addDoc, serverTimestamp, deleteDoc, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Loader2, Crown, Copy, Check, Play, Users, LogOut, Send, MessageSquare, Mic, MicOff } from 'lucide-react';
import { motion } from 'motion/react';
import { BACK_CARD_URL, FRONT_URLS, CARD_TITLES } from '@/lib/constants';

const AudioPlayer = ({ stream }: { stream: MediaStream }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);
  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
};

const WebRTCVoiceChat = ({ roomId, userId, players, inGame }: { roomId: string, userId: string, players: any[], inGame: boolean }) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [micOn, setMicOn] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [isPendingPermission, setIsPendingPermission] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  
  const servers = useMemo(() => ({
    iceServers: [
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  }), []);

  useEffect(() => {
    if (inGame && !isInitialized && !errorMsg) {
      setTimeout(() => setIsPendingPermission(true), 0);
    } else if (!inGame) {
      setTimeout(() => {
        setIsPendingPermission(false);
        setIsInitialized(false);
      }, 0);
    }
  }, [inGame, isInitialized, errorMsg]);

  const grantPermissionAndStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getAudioTracks().forEach(t => t.enabled = false); 
      setLocalStream(stream);
      setIsPendingPermission(false);
      setIsInitialized(true);
    } catch (err) {
      console.error("Mic permission denied", err);
      setErrorMsg("Izin mic ditolak.");
      setIsPendingPermission(false);
    }
  };

  useEffect(() => {
    return () => {
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      Object.values(peersRef.current).forEach((pc: RTCPeerConnection) => pc.close());
    }
  }, [localStream]);

  useEffect(() => {
    if (!localStream || !inGame || !userId) return;
    
    const signalingRef = collection(db, 'rooms', roomId, 'callSignaling');
    const q = query(signalingRef, where('to', '==', userId));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const fromId = data.from;
          
          try {
            if (data.type === 'offer') {
              const pc = new RTCPeerConnection(servers);
              peersRef.current[fromId] = pc;
              
              localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
              
              pc.onicecandidate = (event) => {
                if (event.candidate) {
                  addDoc(signalingRef, {
                    from: userId, to: fromId, type: 'ice', payload: event.candidate.toJSON(), createdAt: serverTimestamp()
                  });
                }
              };
              
              pc.ontrack = (event) => {
                setRemoteStreams(prev => ({ ...prev, [fromId]: event.streams[0] }));
              };
              
              await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              
              await addDoc(signalingRef, {
                from: userId, to: fromId, type: 'answer', payload: { type: answer.type, sdp: answer.sdp }, createdAt: serverTimestamp()
              });
              
            } else if (data.type === 'answer') {
              const pc = peersRef.current[fromId];
              if (pc && pc.signalingState !== 'stable') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
              }
            } else if (data.type === 'ice') {
              const pc = peersRef.current[fromId];
              if (pc && pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(data.payload));
              }
            }
          } catch (e) {
            console.error("WebRTC Signaling Error:", e);
          }

          deleteDoc(change.doc.ref).catch(() => {});
        }
      });
    });
    
    return () => unsubscribe();
  }, [localStream, inGame, roomId, userId]);

  useEffect(() => {
    if (!localStream || !inGame) return;
    
    const signalingRef = collection(db, 'rooms', roomId, 'callSignaling');
    
    players.forEach(async (p: any) => {
      const peerId = p.id;
      if (peerId !== userId && userId > peerId && !peersRef.current[peerId]) {
        const pc = new RTCPeerConnection(servers);
        peersRef.current[peerId] = pc;
        
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            addDoc(signalingRef, {
              from: userId, to: peerId, type: 'ice', payload: event.candidate.toJSON(), createdAt: serverTimestamp()
            });
          }
        };
        
        pc.ontrack = (event) => {
          setRemoteStreams(prev => ({ ...prev, [peerId]: event.streams[0] }));
        };
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        await addDoc(signalingRef, {
          from: userId, to: peerId, type: 'offer', payload: { type: offer.type, sdp: offer.sdp }, createdAt: serverTimestamp()
        });
      }
    });
  }, [players, localStream, inGame, roomId, userId]);
  
  useEffect(() => {
    return () => {
      Object.values(peersRef.current).forEach(pc => pc.close());
      peersRef.current = {};
      setRemoteStreams({});
    };
  }, [inGame]);

  const toggleMic = () => {
    if (localStream) {
      const enabled = !micOn;
      localStream.getAudioTracks().forEach(t => t.enabled = enabled);
      setMicOn(enabled);
    }
  };

  if (!inGame) return null;

  return (
    <>
      {isPendingPermission && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4">
           <div className="bg-stone-800 border border-stone-700 rounded-2xl p-6 md:p-8 max-w-sm w-full text-center shadow-2xl relative">
             <div className="w-16 h-16 bg-red-600/20 text-red-500 flex items-center justify-center rounded-full mx-auto mb-4">
                <Mic className="w-8 h-8" />
             </div>
             <h3 className="text-xl font-bold text-white mb-2">Izin Mikrofon</h3>
             <p className="text-sm text-stone-400 mb-6">
               Game ini menggunakan fitur Voice Chat P2P Real-time antar pemain. Izinkan mikrofon untuk berkomunikasi!
             </p>
             <button 
                onClick={grantPermissionAndStart}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl uppercase tracking-widest text-xs transition-colors"
             >
                Berikan Izin & Mulai
             </button>
             <button 
                onClick={() => { setIsPendingPermission(false); setIsInitialized(true); }}
                className="w-full bg-transparent hover:bg-stone-700 text-stone-400 font-bold py-3 mt-2 rounded-xl uppercase tracking-widest text-xs transition-colors"
             >
                Abaikan (Pemain Bisu)
             </button>
           </div>
         </div>
      )}

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
         {Object.entries(remoteStreams).map(([peerId, stream]) => (
           <AudioPlayer key={peerId} stream={stream} />
         ))}
         {errorMsg && (
           <div className="bg-red-900/90 text-white text-xs px-4 py-2 rounded-lg border border-red-500 shadow-xl pointer-events-auto">
             {errorMsg}
           </div>
         )}
         {isInitialized && !errorMsg && (
            <button 
              onClick={toggleMic}
              className={`p-4 rounded-full shadow-2xl transition-all flex items-center justify-center pointer-events-auto ${micOn ? 'bg-green-500 hover:bg-green-600 animate-pulse shadow-[0_0_20px_rgba(34,197,94,0.6)] text-white' : 'bg-stone-800 hover:bg-stone-700 text-red-500 border border-stone-700'}`}
              title={micOn ? "Matikan Mic" : "Nyalakan Mic"}
            >
              {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
            </button>
         )}
      </div>
    </>
  );
};


type IntroPhase = 'idle' | 'shuffling_players' | 'showing_players' | 'shuffling_cards' | 'countdown_3' | 'countdown_2' | 'countdown_1' | 'countdown_go';

// Fungsi Helper untuk mengacak array (Fisher-Yates)
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

const ShuffleAnimation = () => {
  return (
    <div className="relative w-40 h-60 md:w-48 md:h-72 flex justify-center items-center mt-12 mb-8 perspective-[1000px]">
      <style>{`
        @keyframes realisticShuffle {
          0% {
            transform: translate(0, 0) rotate(var(--base-rot));
            z-index: 10;
          }
          30% {
            transform: translate(-35px, -85px) rotate(calc(var(--base-rot) - 12deg));
            z-index: 10;
          }
          60% {
            transform: translate(15px, 0px) rotate(calc(var(--base-rot) + 5deg));
            z-index: 1;
          }
          100% {
            transform: translate(0, 0) rotate(var(--base-rot));
            z-index: 10;
          }
        }
        .card-shuffle-anim {
          animation: realisticShuffle 0.8s infinite ease-in-out;
        }
      `}</style>
      
      {[0, 1, 2, 3, 4].map((i) => {
        const baseRotations = ['-2deg', '3deg', '-1deg', '1.5deg', '-0.5deg'];
        const delays = ['0s', '0.15s', '0.3s', '0.45s', '0.6s'];
        
        return (
          <img
            key={i}
            src={BACK_CARD_URL}
            alt="Card Shuffle"
            className="absolute w-full h-full object-cover rounded-xl md:rounded-2xl shadow-[0_5px_25px_rgba(0,0,0,0.8)] border-2 border-stone-800 card-shuffle-anim"
            style={{
              '--base-rot': baseRotations[i],
              animationDelay: delays[i]
            } as React.CSSProperties}
          />
        )
      })}
    </div>
  );
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

  // === INTRO STATE ===
  const [introPhase, setIntroPhase] = useState<IntroPhase>('idle');
  const [localTurnOrder, setLocalTurnOrder] = useState<any[]>([]);

  // === PLAYING STATE ===
  const currentTurnPlayerId = room?.turnOrder?.[room.currentTurnIndex];
  const isMyTurn = room?.status === 'playing' && currentTurnPlayerId === userId;
  const activeDrawnCard = room?.activeCard || null;
  const [storyInput, setStoryInput] = useState('');
  const hasDrawn = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // === ELIMINATION STATE ===
  const [showDeathAnim, setShowDeathAnim] = useState(false);
  const prevEliminationState = useRef(false);
  const myPlayerInfo = room?.players?.find((p: any) => p.id === userId);
  const amIEliminated = myPlayerInfo?.isEliminated || false;

  useEffect(() => {
    if (!prevEliminationState.current && amIEliminated) {
      setShowDeathAnim(true);
      setTimeout(() => setShowDeathAnim(false), 4000);
    }
    prevEliminationState.current = amIEliminated;
  }, [amIEliminated]);

  // Auto-draw Logic
  useEffect(() => {
    // Jalankan auto-draw HANYA jika status bermain, giliran sendiri, belum narik kartu, dan proses voting belum aktif
    if (room?.status === 'playing' && isMyTurn && !activeDrawnCard && !room?.votingState?.active && !hasDrawn.current) {
      hasDrawn.current = true; // Lock agar tak loop atau double draw
      const currentDeck = [...(room?.deck || [])];
      if (currentDeck.length > 0) {
        const drawn = currentDeck.pop();
        
        // Simpan langsung di firebase agar semua player ter-update UI-nya
        const roomRef = doc(db, 'rooms', roomId);
        updateDoc(roomRef, { 
           activeCard: drawn,
           deck: currentDeck 
        }).catch(console.error);
      }
    }
    // Jika bukan giliran, pastikan reset flag
    if (!isMyTurn) {
       hasDrawn.current = false;
    }
  }, [room?.status, isMyTurn, activeDrawnCard, room?.votingState?.active, room?.deck, roomId]);

  // Auto-Resolution Logic Khusus Host
  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.votingState?.active || room.hostId !== userId) return;

    const votes = room.votingState.votes || {};
    const eligibleVoterCount = Math.max(0, room.players.length - 1);
    const currentVoteCount = Object.keys(votes).length;

    if (currentVoteCount >= eligibleVoterCount) {
       let yes = 0; let no = 0;
       Object.values(votes).forEach(v => v === 'yes' ? yes++ : no++);
       const isAccepted = yes >= no || eligibleVoterCount === 0; // Jika main sendirian, auto acccept.

       let newPlayers = [...room.players];
       let newCenterCards = [...room.centerCards];

       if (isAccepted) {
          newCenterCards.push({
             card: [room.votingState.card], // Tetap bungkus dalam array untuk format image layout
             story: room.votingState.story,
             playerId: room.votingState.playerId,
             playerName: room.votingState.playerName
          });
       } else {
          // Eliminasi
          newPlayers = newPlayers.map(p => p.id === room.votingState.playerId ? { ...p, isEliminated: true } : p);
       }

       // Cari next turn (Lewati yang eliminated)
       let nextTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
       let attempts = 0;
       while (attempts < room.turnOrder.length) {
          const tempId = room.turnOrder[nextTurnIndex];
          const pObj = newPlayers.find(p => p.id === tempId);
          if (pObj && !pObj.isEliminated) break;
          nextTurnIndex = (nextTurnIndex + 1) % room.turnOrder.length;
          attempts++;
       }

       const activeCount = newPlayers.filter(p => !p.isEliminated).length;
       const newStatus = activeCount <= 1 ? 'finished' : 'playing';

       const roomRef = doc(db, 'rooms', roomId);
       updateDoc(roomRef, {
          players: newPlayers,
          centerCards: newCenterCards,
          currentTurnIndex: nextTurnIndex,
          status: newStatus,
          votingState: null,
          activeCard: null
       }).catch(console.error);
    }
  }, [room?.votingState, room?.status, room?.players, room?.hostId, room?.currentTurnIndex, room?.turnOrder, room?.centerCards, userId, roomId]);

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
      if (remainingPlayers.length === 0) {
        deleteDoc(roomRef);
      } else {
        updateDoc(roomRef, { players: remainingPlayers });
      }
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

  // === INTRO SEQUENCE LOGIC ===
  useEffect(() => {
    if (room?.status === 'intro' && introPhase === 'idle') {
       const timer = setTimeout(() => {
         setIntroPhase('shuffling_players');
         setLocalTurnOrder(shuffleArray([...room.players]));
       }, 0);
       return () => clearTimeout(timer);
    }
  }, [room?.status, introPhase, room?.players]);

  useEffect(() => {
    if (room?.status !== 'intro') {
        if (introPhase !== 'idle') {
           const timer = setTimeout(() => setIntroPhase('idle'), 0);
           return () => clearTimeout(timer);
        }
        return;
    }

    let timer: NodeJS.Timeout;
    const isHost = room.hostId === userId;

    switch(introPhase) {
      case 'shuffling_players':
        timer = setTimeout(() => setIntroPhase('showing_players'), 2000);
        break;
      case 'showing_players':
        timer = setTimeout(() => setIntroPhase('shuffling_cards'), 2500);
        break;
      case 'shuffling_cards':
        timer = setTimeout(() => setIntroPhase('countdown_3'), 2000);
        break;
      case 'countdown_3':
        timer = setTimeout(() => setIntroPhase('countdown_2'), 1000);
        break;
      case 'countdown_2':
        timer = setTimeout(() => setIntroPhase('countdown_1'), 1000);
        break;
      case 'countdown_1':
        timer = setTimeout(() => setIntroPhase('countdown_go'), 1000);
        break;
      case 'countdown_go':
         if (isHost) {
             timer = setTimeout(() => {
                const gameCards = Array.from({ length: 21 }).map((_, i) => ({
                  id: i + 1,
                  text: CARD_TITLES[i],
                  imageUrl: FRONT_URLS[i % FRONT_URLS.length]
                }));
          
                const shuffledCards = shuffleArray(gameCards);
                
                const centerCard = shuffledCards.pop(); 
                const startCenterPayload = {
                  card: [centerCard],
                  story: "KARTU PEMBUKA - Mari mulai ceritanya!",
                  playerId: "system",
                  playerName: "Sistem"
                };
          
                const turnOrderIds = localTurnOrder.map((p: any) => p.id);
          
                const roomRef = doc(db, 'rooms', roomId);
                updateDoc(roomRef, {
                  status: 'playing',
                  deck: shuffledCards,
                  centerCards: [startCenterPayload],
                  turnOrder: turnOrderIds,
                  currentTurnIndex: 0,
                  votingState: null,
                  activeCard: null
                }).catch(console.error);
             }, 1000);
         }
        break;
    }
    return () => clearTimeout(timer);
  }, [introPhase, room?.status, userId, roomId, localTurnOrder, room?.hostId]);

  // Tombol Keluar dari Lobi 
  const handleLeaveRoom = async () => {
    if (!room || !userId) return;
    setLoading(true);
    
    try {
      const remainingPlayers = room.players.filter((p: any) => p.id !== userId);
      const roomRef = doc(db, 'rooms', roomId);
      
      if (remainingPlayers.length === 0) {
        await deleteDoc(roomRef);
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

  // 3. Fungsi Memulai Game (Intro Trigger)
  const startGame = async () => {
    if (!room || room.hostId !== userId) return;
    if (room.players.length < 3) {
      setError("Minimal 3 pemain untuk memulai.");
      setTimeout(() => setError(''), 3000);
      return;
    }
    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, { status: 'intro' });
    } catch (err) {
      console.error("Gagal memulai intro:", err);
      setError("Gagal memulai game.");
      setTimeout(() => setError(''), 3000);
    }
  };

  const submitStory = async () => {
    if (!storyInput.trim() || !activeDrawnCard || !room) return;
    const myPlayer = room.players.find((p: any) => p.id === userId);
    
    setIsSubmitting(true);
    try {
       const roomRef = doc(db, 'rooms', roomId);
       await updateDoc(roomRef, {
          votingState: {
             active: true,
             playerId: userId,
             playerName: myPlayer?.name || 'Pemain',
             card: activeDrawnCard,
             story: storyInput.trim(),
             votes: {}
          },
          activeCard: null
       });
       // Selesai submit, bersihkan state lokal
       setStoryInput('');
    } catch(err) {
       console.error("Gagal submit cerita:", err);
    }
    setIsSubmitting(false);
  };

  const castVote = async (voteValue: 'yes' | 'no') => {
    if (!room || !userId || !room.votingState?.active) return;
    try {
       const roomRef = doc(db, 'rooms', roomId);
       await updateDoc(roomRef, {
          [`votingState.votes.${userId}`]: voteValue
       });
    } catch(err) {
       console.error("Gagal mengirim vote:", err);
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

  // === KOMPONEN CHAT ===
  const renderChatBox = () => (
    <div className="flex flex-col h-[500px] bg-stone-800/50 backdrop-blur-md rounded-2xl border border-stone-700 shadow-2xl relative overflow-hidden flex-1 w-full max-w-sm ml-auto">
      <div className="px-5 py-4 border-b border-stone-700/50 flex items-center gap-2 bg-stone-800/80 shrink-0">
        <MessageSquare className="w-4 h-4 text-stone-400" />
        <h2 className="text-xs font-bold text-stone-400 tracking-widest uppercase">Live Chat</h2>
      </div>
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
      <form onSubmit={handleSendMessage} className="p-3 border-t border-stone-700/50 bg-stone-800/80 flex gap-2 shrink-0">
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
  );

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

  // State: Sedang Intro Animasi
  if (room && room.status === 'intro') {
    return (
      <div className="fixed inset-0 z-50 bg-stone-950 flex flex-col items-center justify-center text-stone-100 overflow-hidden font-sans">
        
        {introPhase === 'shuffling_players' && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-6">
            <Users className="w-20 h-20 text-red-500 animate-pulse" />
            <h2 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-stone-300 text-center">Mengacak Urutan Pemain...</h2>
          </motion.div>
        )}

        {introPhase === 'showing_players' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col w-full max-w-lg px-6 gap-4">
            <h2 className="text-xl md:text-2xl font-bold tracking-widest uppercase text-center text-stone-400 mb-6">Urutan Bermain</h2>
            {localTurnOrder.map((player, idx) => (
              <motion.div 
                 key={player.id}
                 initial={{ opacity: 0, x: -50 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: idx * 0.3 }}
                 className="flex items-center gap-4 bg-stone-800 p-4 rounded-xl border border-stone-700"
              >
                 <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center font-black text-xl shadow-lg shrink-0">
                    {idx + 1}
                 </div>
                 <span className="text-xl font-bold truncate">{player.name} {player.id === userId && <span className="text-stone-500 text-sm ml-2">(Kamu)</span>}</span>
              </motion.div>
            ))}
          </motion.div>
        )}

        {introPhase === 'shuffling_cards' && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-8">
            <ShuffleAnimation />
            <h2 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-stone-300 mt-4 text-center">Mengacak Kartu...</h2>
          </motion.div>
        )}

        {['countdown_3', 'countdown_2', 'countdown_1'].includes(introPhase) && (
          <motion.div 
             key={introPhase}
             initial={{ opacity: 0, scale: 2 }} 
             animate={{ opacity: 1, scale: 1 }} 
             exit={{ opacity: 0, scale: 0 }}
             transition={{ duration: 0.4 }}
             className="text-[12rem] font-black text-red-500 drop-shadow-[0_0_80px_rgba(220,38,38,0.8)]"
          >
            {introPhase.split('_')[1]}
          </motion.div>
        )}

        {introPhase === 'countdown_go' && (
           <motion.div 
             initial={{ opacity: 0, scale: 0.5, rotate: -10 }} 
             animate={{ opacity: 1, scale: 1.5, rotate: 0 }} 
             transition={{ type: "spring", stiffness: 200 }}
             className="text-[10rem] md:text-[14rem] font-black text-red-500 drop-shadow-[0_0_100px_rgba(220,38,38,1)] tracking-tighter"
           >
             GO!
           </motion.div>
        )}

      </div>
    );
  }

  // State: Game Over (Finished)
  if (room && room.status === 'finished') {
     const winner = room.players.find((p: any) => !p.isEliminated);
     const amIWinner = winner?.id === userId;

     return (
       <div className="min-h-screen z-50 bg-stone-950 text-stone-100 flex flex-col items-center justify-center p-6 text-center overflow-hidden relative">
          <div className={`absolute top-[30%] left-[20%] w-[500px] h-[500px] ${amIWinner ? 'bg-yellow-900/40' : 'bg-red-900/40'} rounded-full blur-[150px] pointer-events-none`}></div>
          
          <motion.h1 
             initial={{ scale: 0.5, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             transition={{ type: "spring", bounce: 0.5 }}
             className={`text-6xl md:text-8xl font-black ${amIWinner ? 'text-yellow-500 drop-shadow-[0_0_60px_rgba(234,179,8,0.8)]' : 'text-red-600 drop-shadow-[0_0_60px_rgba(220,38,38,0.8)]'} mb-8 tracking-tighter`}
          >
             {amIWinner ? 'SELAMAT!' : 'GAME OVER'}
          </motion.h1>

          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="flex flex-col items-center gap-4">
            {amIWinner ? (
               <>
                 <div className="text-[6rem] leading-none mb-4 animate-bounce drop-shadow-[0_0_30px_rgba(234,179,8,1)]">🏆</div>
                 <p className="text-2xl md:text-4xl text-stone-300 font-bold">
                   Anda adalah <span className="font-black text-yellow-500 uppercase tracking-widest">Pemenangnya!</span>
                 </p>
                 <p className="text-stone-400 mt-2">Daya imajinasi Anda tidak tertandingi.</p>
               </>
            ) : winner ? (
               <>
                 <div className="text-[4rem] leading-none mb-2 drop-shadow-[0_0_30px_rgba(0,0,0,1)] grayscale opacity-50">💀</div>
                 <p className="text-xl md:text-3xl text-stone-300">
                   Pemenangnya adalah <span className="font-black text-white uppercase tracking-widest">{winner.name}</span>!
                 </p>
                 <p className="text-stone-500 mt-2">Anda tereliminasi. Coba lagi di lain waktu!</p>
               </>
            ) : (
               <p className="text-xl md:text-3xl text-stone-300">
                 Semua pemain telah tereliminasi.
               </p>
            )}
          </motion.div>

          <motion.button 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
             onClick={() => router.push('/')} 
             className={`mt-16 ${amIWinner ? 'bg-yellow-600 hover:bg-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.4)]' : 'bg-red-600 hover:bg-red-500 shadow-[0_0_30px_rgba(220,38,38,0.4)]'} text-white font-bold py-4 px-10 rounded-xl uppercase tracking-widest transition-all z-10`}
          >
             Ke Menu Utama
          </motion.button>
       </div>
     );
  }

  // State: Sedang Bermain (Playing)
  if (room && room.status === 'playing') {
    return (
      <div className="min-h-screen bg-stone-900 text-stone-100 p-6 md:p-12 font-sans overflow-x-hidden overflow-y-auto w-full relative">
        <h2 className="text-3xl font-black mb-4 text-center tracking-widest text-red-500 uppercase">Arena Bermain</h2>

        <div className="flex flex-col md:flex-row gap-6 max-w-7xl mx-auto w-full items-start">
           
           {/* KIRI - ARENA PERMAINAN PUSAT */}
           <div className="flex-1 w-full flex flex-col items-center">
              {/* Daftar Pemain Aktif / Eliminasi */}
              <div className="flex flex-wrap items-center justify-center gap-3 w-full mb-10">
                 {room.players.map((player: any) => {
                    const isTurn = room.turnOrder[room.currentTurnIndex] === player.id;
                    const isDead = player.isEliminated;
                    return (
                      <div key={player.id} className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 ${isTurn ? 'border-red-500 bg-red-900/30 ring-2 ring-red-500/50' : 'border-stone-700 bg-stone-800'} ${isDead ? 'opacity-40 grayscale border-stone-800' : ''}`}>
                         <span className="text-sm font-bold flex items-center gap-2">
                             {isDead ? '💀' : '😁'} 
                             <span className={isDead ? 'line-through text-stone-500' : 'text-stone-200'}>{player.name} {player.id === userId && '(Kamu)'}</span>
                         </span>
                         {isTurn && !isDead && <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-ping"></span>}
                      </div>
                    )
                 })}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 items-start w-full max-w-4xl">
                 {/* 1. Gambar Tumpukan Kartu Deck */}
                 <div className="flex flex-col items-center">
                    <motion.img 
                       src={BACK_CARD_URL} 
                       alt="Tumpukan Deck"
                       className="w-full aspect-[2/3] object-cover rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.6)] border-2 border-stone-800"
                    />
                    <span className="mt-3 text-xs font-bold text-stone-500 bg-stone-800 px-3 py-1 rounded-full uppercase tracking-widest">
                       Sisa Deck: {room.deck?.length || 0}
                    </span>
                 </div>

                 {/* 2 & 3 & seterusnya... Render Kartu Center/Meja */}
                 {room.centerCards?.map((cCard: any, idx: number) => (
                    <motion.div 
                       key={`center-${idx}`}
                       initial={{ rotateY: -180, opacity: 0 }}
                       animate={{ rotateY: 0, opacity: 1 }}
                       transition={{ duration: 0.6, type: "spring", bounce: 0.3 }}
                       style={{ transformStyle: "preserve-3d", perspective: 1200 }}
                       className="flex flex-col items-center gap-3 w-full"
                    >
                       <img 
                          src={cCard.card[0].imageUrl} 
                          alt={`Kartu Center ${idx + 1}`}
                          className="w-full aspect-[2/3] object-cover rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.2)] border-2 border-stone-700"
                       />
                       <div className="bg-stone-800/80 backdrop-blur border border-stone-700 p-3 rounded-lg w-full text-sm text-center italic text-stone-300">
                          "{cCard.story}"
                          <div className="mt-2 text-[10px] text-red-400 font-bold tracking-wider not-italic uppercase">- {cCard.playerName}</div>
                       </div>
                    </motion.div>
                 ))}

                 {/* Grid Tambahan Khusus Kartu yang Sedang Aktif di Tangan */}
                 {activeDrawnCard && !room.votingState?.active && (
                    <motion.div 
                       initial={{ scale: 0.8, opacity: 0, y: 50 }}
                       animate={{ scale: 1, opacity: 1, y: 0 }}
                       className="flex flex-col items-center gap-3 col-span-2 md:col-span-1 w-full"
                    >
                       <img 
                          src={activeDrawnCard.imageUrl}
                          alt="Kartu Di Tangan"
                          className="w-[80%] md:w-full aspect-[2/3] object-cover rounded-xl shadow-[0_0_40px_rgba(220,38,38,0.4)] border-2 border-red-500 relative"
                       />
                       {isMyTurn ? (
                         <div className="w-full flex-col flex gap-2">
                            <label className="text-[10px] text-stone-400 font-bold uppercase tracking-widest text-center mt-2">
                               Cerita harus nyambung dari awal mula kartu!
                            </label>
                            <textarea 
                               value={storyInput}
                               onChange={e => setStoryInput(e.target.value)}
                               className="w-full bg-stone-950 border border-red-900/50 rounded-xl p-3 text-sm focus:outline-none focus:border-red-500 text-stone-100 resize-none shadow-inner"
                               rows={4}
                               placeholder="Ketik kelanjutan cerita di sini..."
                            />
                            <button 
                               onClick={submitStory}
                               disabled={!storyInput.trim() || isSubmitting}
                               className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl uppercase tracking-widest text-xs disabled:opacity-50 transition-colors shadow-lg"
                            >
                               {isSubmitting ? 'Mengirim...' : 'Submit Cerita'}
                            </button>
                         </div>
                       ) : (
                         <div className="w-full bg-stone-800/80 border border-stone-700/50 rounded-xl p-4 text-center mt-4 flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                            <span className="text-xs text-stone-400 font-bold tracking-widest uppercase">
                               Menunggu pemain bercerita...
                            </span>
                         </div>
                       )}
                    </motion.div>
                 )}
              </div>
           </div>

           {/* KANAN - LIVE CHAT */}
           <div className="w-full md:w-80 lg:w-96 shrink-0 mt-10 md:mt-0 flex flex-col relative h-[500px]">
              {renderChatBox()}
           </div>

        </div>

        {/* Jika ruang sudah masuk mode voting / menunggu giliran lain */}
        {room.votingState?.active && (
           <div className="fixed inset-0 z-50 bg-stone-950/90 backdrop-blur-md flex items-center justify-center p-4">
              <motion.div 
                 initial={{ scale: 0.9, opacity: 0, y: 20 }}
                 animate={{ scale: 1, opacity: 1, y: 0 }}
                 className="bg-stone-900 border border-stone-700/50 rounded-2xl w-full max-w-lg overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]"
              >
                 <div className="bg-red-900/20 border-b border-red-900/30 px-6 py-4">
                    <h3 className="text-xl font-black text-white uppercase tracking-widest">Sesi Voting</h3>
                    <p className="text-red-400 text-xs font-bold uppercase tracking-wider mt-1">{room.votingState.playerName} memainkan kartu ini!</p>
                 </div>
                 <div className="p-6 flex flex-col items-center">
                    <img 
                       src={room.votingState.card.imageUrl} 
                       alt="Voting Card" 
                       className="w-48 aspect-[2/3] object-cover rounded-xl shadow-2xl border-4 border-stone-800 -mt-2 z-10"
                    />
                    <div className="bg-stone-800/50 border border-stone-700 w-full mt-6 p-4 rounded-xl text-center italic text-stone-200">
                       "{room.votingState.story}"
                    </div>

                    <div className="w-full mt-8">
                       {room.votingState.playerId === userId ? (
                          <div className="text-center bg-stone-800 py-4 rounded-xl text-stone-400 font-bold tracking-widest text-sm uppercase animate-pulse border border-stone-700">
                             Menunggu hasil voting...
                          </div>
                       ) : (userId && typeof room.votingState.votes?.[userId] !== 'undefined') ? (
                          <div className="text-center bg-stone-800 py-4 rounded-xl text-stone-400 font-bold tracking-widest text-sm uppercase border border-stone-700">
                             Menunggu pemain lain memvoting...
                          </div>
                       ) : (
                          <div className="grid grid-cols-2 gap-4">
                             <button onClick={() => castVote('no')} className="bg-stone-800 hover:bg-stone-700 text-red-500 border border-red-900/50 font-bold py-4 rounded-xl uppercase tracking-widest transition-all">
                                ❌ Ngga Nyambung
                             </button>
                             <button onClick={() => castVote('yes')} className="bg-green-600/20 hover:bg-green-600/30 text-green-500 border border-green-500/30 font-bold py-4 rounded-xl uppercase tracking-widest transition-all">
                                ✅ Nyambung
                             </button>
                          </div>
                       )}
                    </div>
                 </div>
              </motion.div>
           </div>
        )}

        {/* Animasi Kematian Layar Penuh (Sekali Jalan) */}
        {showDeathAnim && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-950/90 backdrop-blur-sm pointer-events-none">
             <motion.div initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: 'spring', bounce: 0.6 }} className="text-center flex flex-col items-center">
                <span className="text-[8rem] leading-none mb-4 drop-shadow-[0_0_50px_rgba(220,38,38,0.8)]">💀</span>
                <h1 className="text-5xl md:text-7xl font-black text-red-500 drop-shadow-[0_0_40px_rgba(220,38,38,1)] uppercase tracking-tight">Tereliminasi!</h1>
                <p className="text-stone-300 mt-4 font-bold tracking-widest uppercase bg-stone-900 px-6 py-2 rounded-full border border-red-900/50">Ceritamu Tidak Diterima</p>
             </motion.div>
          </div>
        )}

        {/* Banner Persisten Eliminasi */}
        {amIEliminated && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-900 border border-red-900/50 text-red-400 px-6 py-3 rounded-full z-40 shadow-[0_0_30px_rgba(220,38,38,0.4)] text-xs md:text-sm font-bold tracking-widest uppercase whitespace-nowrap opacity-90 backdrop-blur">
             💀 Kamu Tereliminasi - Tetaplah Memvoting!
          </div>
        )}
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
              {playerCount} / 6 MAX
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
          <div className="md:col-span-5 flex flex-col h-[500px]">
             {renderChatBox()}
          </div>
        </div>

        {userId && (
           <WebRTCVoiceChat roomId={roomId} userId={userId} players={room.players} inGame={room?.status === 'waiting' || room?.status === 'playing' || room?.status === 'intro'} />
        )}
      </div>
    </div>
  );
}
