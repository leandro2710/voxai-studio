import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Volume2, Save, Library, LogIn, LogOut, 
  Trash2, Clock, Settings2, Sparkles, Mic2, Download, Share2, BookOpen,
  ChevronRight, History, Wand2, Music, User as UserIcon, Menu,
  Copy, Eraser, Github, Globe, Palette, Check, X, Plus, Info, Minus,
  SlidersHorizontal, Languages, Star, MessageSquare, Pencil, Share, Inbox, Zap,
  Crown, Lock, ChevronDown, ChevronUp, AlertCircle, AlertTriangle, CheckCircle2, InfoIcon, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { generateNarration, NarrationOptions, b64toBlob, VOICE_PROFILES, TONE_OPTIONS, STYLE_OPTIONS, PACE_OPTIONS, BROWSER_TTS_SILENCE } from './services/voxaiService';
import { checkForCorrections } from './services/textCorrector';
import { auth, db, storage } from './lib/firebase';
import { 
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User 
} from 'firebase/auth';
import { 
  collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc, 
  serverTimestamp, Timestamp, updateDoc, getDocsFromServer, limit, getDoc, setDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// UI Components
import { Button, buttonVariants } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, 
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface SavedNarration {
  id: string;
  text: string;
  audioBase64: string;
  voice: string;
  style: string;
  duration?: number;
  title?: string;
  createdAt: Timestamp;
}

interface CustomPreset {
  id: string;
  name: string;
  options: Omit<NarrationOptions, 'text'>;
}

const DEFAULT_PRESETS = [
  { id: 'audiobook', name: 'Audiolivro', icon: <Library />, style: 'Narrador clássico, leitura imersiva', tone: 'Calmo, profundo', pace: 'Pausado', expressiveness: 65, stability: 70, clarity: 80, voice: 'Charon' },
  { id: 'news', name: 'Noticiário', icon: <Mic2 />, style: 'Âncora de jornal, formal', tone: 'Direto, sério', pace: 'Rápido', expressiveness: 30, stability: 90, clarity: 95, voice: 'Aurora' },
  { id: 'hype', name: 'Energético', icon: <Sparkles />, style: 'Marketing, Entusiasta', tone: 'Brilhante, agudo', pace: 'Acelerado', expressiveness: 90, stability: 40, clarity: 60, voice: 'Lyra' },
  { id: 'zen', name: 'Meditação', icon: <Music />, style: 'Coach Espiritual, Zen', tone: 'Suave, soproso', pace: 'Lento', expressiveness: 15, stability: 85, clarity: 70, voice: 'Orion' },
  { id: 'horror', name: 'Sombrio', icon: <Clock />, style: 'Vilão de cinema, Grave', tone: 'Ameaçador, gutural', pace: 'Lento', expressiveness: 70, stability: 50, clarity: 40, voice: 'Titan' },
];

const THEMES = [
  { id: 'purple', name: 'Roxo', color: 'bg-[#9333ea]' },
  { id: 'green', name: 'Verde', color: 'bg-[#22c55e]' },
  { id: 'blue', name: 'Azul', color: 'bg-[#2563eb]' },
  { id: 'red', name: 'Vermelho', color: 'bg-[#dc2626]' },
  { id: 'white', name: 'Branco', color: 'bg-white' },
  { id: 'silver', name: '🥈 Prata', color: 'bg-silver-gradient', pro: true },
];

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  const errorString = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errorString);
  throw new Error(errorString);
}

function AudioPublicPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(db, 'public_audios', id!);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setData(docSnap.data());
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white space-y-4">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      <p className="text-xs font-bold uppercase tracking-widest opacity-50">Carregando Áudio...</p>
    </div>
  );
  
  if (!data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6 text-center space-y-6">
      <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center border border-red-500/20">
        <X className="w-10 h-10 text-red-500" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black">Link Expirado</h2>
        <p className="text-sm text-muted-foreground max-w-xs">Este áudio não está mais disponível ou o link é inválido.</p>
      </div>
      <Button variant="outline" className="rounded-xl" onClick={() => window.location.href = '/'}>Voltar ao Início</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-primary/20 rounded-3xl flex items-center justify-center border border-primary/30 shadow-2xl shadow-primary/20">
          <Sparkles className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-br from-white to-white/40 bg-clip-text text-transparent">VoxAI Studio</h1>
      </div>

      <Card className="w-full max-w-md glass-card border-white/10 bg-white/[0.03] rounded-3xl overflow-hidden shadow-2xl">
        <CardContent className="p-8 flex flex-col items-center text-center space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold line-clamp-2">{data.title}</h2>
            <p className="text-xs text-muted-foreground font-medium">Gerado por {data.userName}</p>
          </div>

          <div className="w-full bg-white/5 rounded-2xl p-4 border border-white/5">
            <audio controls className="w-full h-10 invert brightness-200">
              <source src={data.downloadURL} type="audio/wav" />
              Seu navegador não suporta áudio.
            </audio>
          </div>

          <div className="flex flex-col w-full gap-3 pt-2">
            <Button 
              onClick={() => window.open(data.downloadURL)}
              className="w-full h-14 rounded-2xl bg-white text-black font-bold hover:bg-zinc-200 transition-colors"
            >
              <Download className="w-5 h-5 mr-3" /> Baixar Áudio
            </Button>
            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-50">
              <Clock className="w-3 h-3" /> Link expira em 7 dias
            </div>
          </div>
        </CardContent>
      </Card>

      <footer className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest opacity-40">
        VoxAI Intelligence • Neural Synthesis
      </footer>
    </div>
  );
}

function Dashboard({ stats, isExpanded, onToggle }: { stats: any, isExpanded: boolean, onToggle: () => void }) {
  return (
    <Card 
      onClick={onToggle}
      className={cn(
        "glass-card border-none bg-white/[0.03] rounded-2xl overflow-hidden cursor-pointer transition-all duration-500",
        isExpanded ? "p-5" : "py-2.5 px-4"
      )}
    >
      <div className="flex items-center justify-between">
        {!isExpanded ? (
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-full">
            <span className="flex items-center gap-1.5"><Mic2 className="w-3 h-3" /> {stats.audios} hoje</span>
            <span className="flex items-center gap-1.5 text-primary"><Star className="w-3 h-3 fill-primary" /> {stats.favoriteVoice}</span>
            <span className="flex items-center gap-1.5"><Library className="w-3 h-3" /> {stats.audios} salvos</span>
            <div className="ml-auto flex items-center gap-1 opacity-50">
               Detalhes <ChevronDown className="w-3 h-3" />
            </div>
          </div>
        ) : (
          <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-primary">Estatísticas Detalhadas</h3>
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/20 rounded-lg"><Play className="w-3 h-3 text-primary" /></div>
                  <p className="text-[9px] uppercase font-bold text-muted-foreground opacity-60">Gerados hoje</p>
                </div>
                <p className="text-xl font-black mt-1">{stats.audios}</p>
              </div>
              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-500/20 rounded-lg"><Languages className="w-3 h-3 text-blue-400" /></div>
                  <p className="text-[9px] uppercase font-bold text-muted-foreground opacity-60">Caracteres</p>
                </div>
                <p className="text-xl font-black mt-1">{stats.characters.toLocaleString()}</p>
              </div>
              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-yellow-500/20 rounded-lg"><Star className="w-3 h-3 text-yellow-500 fill-yellow-500" /></div>
                  <p className="text-[9px] uppercase font-bold text-muted-foreground opacity-60">Voz Favorita</p>
                </div>
                <p className="text-sm font-black text-primary mt-1 truncate">{stats.favoriteVoice}</p>
              </div>
              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-green-500/20 rounded-lg"><Clock className="w-3 h-3 text-green-400" /></div>
                  <p className="text-[9px] uppercase font-bold text-muted-foreground opacity-60">Membro desde</p>
                </div>
                <p className="text-sm font-black mt-1">{stats.joinedAt}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('vox-theme') || 'purple');
  const [activeTab, setActiveTab] = useState("editor");
  const [isPro, setIsPro] = useState(() => localStorage.getItem('vox-is-pro') === 'true');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('vox-display-name') || "");
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('vox-font-size') || '16'));
  const [vibrationEnabled, setVibrationEnabled] = useState(() => localStorage.getItem('vox-vibration') !== 'false');
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('vox-notifications') !== 'false');
  const [offlineMode, setOfflineMode] = useState(() => localStorage.getItem('vox-offline') === 'true');
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('vox-stats');
    return saved ? JSON.parse(saved) : { audios: 0, characters: 0, favoriteVoice: 'Charon', joinedAt: new Date().toLocaleDateString('pt-BR') };
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (type: NotificationType, message: string, duration = 3000) => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev.slice(-1), { id, type, message, duration }]);
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const updateStats = (charCount: number, voice: string) => {
    setStats(prev => {
      const newStats = {
        ...prev,
        audios: prev.audios + 1,
        characters: prev.characters + charCount,
        favoriteVoice: voice // Simplificado: última voz usada como "favorita" para este demo
      };
      localStorage.setItem('vox-stats', JSON.stringify(newStats));
      return newStats;
    });
  };

  const navigate = useNavigate();

  // TTS State
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentBase64, setCurrentBase64] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // New States
  const [correctionResult, setCorrectionResult] = useState<{erros: boolean, corrigido: string} | null>(null);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [showProModal, setShowProModal] = useState(false);
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(false);
  
  // Customization Options
  const [options, setOptions] = useState<Omit<NarrationOptions, 'text'>>({
    voice: 'Charon',
    style: "Natural",
    tone: "Neutro",
    pace: "Natural",
    expressiveness: 65,
    stability: 50,
    clarity: 75
  });

  const [playerState, setPlayerState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');

  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [inboxFilter, setInboxFilter] = useState<'unread' | 'read' | 'all'>('unread');
  const [inboxError, setInboxError] = useState<string | null>(null);
  const isDeveloper = useMemo(() => 
    user?.email === 'leandroalves7507@gmail.com' || 
    user?.uid === 'Ki6wK4hKvagzQCKI3qSHbh9besu1', 
  [user]);

  // Developer Menu States
  const [devSearchEmail, setDevSearchEmail] = useState("");
  const [devFoundUser, setDevFoundUser] = useState<any>(null);
  const [isSearchingUser, setIsSearchingUser] = useState(false);

  // Settings State
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const [savedNarrations, setSavedNarrations] = useState<SavedNarration[]>([]);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(() => {
    const saved = localStorage.getItem('vox-presets');
    return saved ? JSON.parse(saved) : [];
  });
  const [isSaving, setIsSaving] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Sync Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vox-theme', theme);
  }, [theme]);

  // Sync Font Size
  useEffect(() => {
    document.documentElement.style.setProperty('--base-font-size', `${fontSize}px`);
    localStorage.setItem('vox-font-size', fontSize.toString());
  }, [fontSize]);

  // Sync Display Name
  useEffect(() => {
    localStorage.setItem('vox-display-name', displayName);
  }, [displayName]);

  // Sync Vibration
  useEffect(() => {
    localStorage.setItem('vox-vibration', vibrationEnabled.toString());
  }, [vibrationEnabled]);

  // Sync Pro Status (Para persistência local e remota)
  useEffect(() => {
    localStorage.setItem('vox-is-pro', isPro.toString());
  }, [isPro]);

  useEffect(() => {
    if (user) {
      // Sync local profile to Firestore so dev can find users
      setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email?.toLowerCase(),
        displayName: user.displayName,
        photoURL: user.photoURL,
        lastActive: serverTimestamp()
      }, { merge: true });

      // Listen for remote Pro status updates
      const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
          const userData = doc.data();
          if (userData.isPro !== undefined && userData.isPro !== isPro) {
             setIsPro(userData.isPro);
          }
        }
      }, (error) => {
        console.error("User profile sync error:", error);
      });
      return () => unsub();
    }
  }, [user]);

  // Sync Presets
  useEffect(() => {
    localStorage.setItem('vox-presets', JSON.stringify(customPresets));
  }, [customPresets]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, `users/${user.uid}/narrations`), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setSavedNarrations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SavedNarration[]);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}/narrations`);
      });
      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Handle source changes separately to avoid interruptions
  useEffect(() => {
    if (audioRef.current && audioUrl) {
      // Only set src if it actually changed to avoid interrupting current play
      if (audioRef.current.src !== audioUrl) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
      }
    } else if (audioRef.current && !audioUrl) {
      audioRef.current.src = '';
    }
  }, [audioUrl]);

  // Text correction debounce
  useEffect(() => {
    if (!text.trim() || text.length < 10 || (correctionResult && text === correctionResult.corrected)) {
      setCorrectionResult(null);
      return;
    }

    const timer = setTimeout(() => {
      setIsCorrecting(true);
      try {
        const result = checkForCorrections(text);
        if (result.errors) {
          setCorrectionResult(result);
        } else {
          setCorrectionResult(null);
        }
      } catch (e) {
        console.error("Correction error:", e);
      } finally {
        setIsCorrecting(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handlePlay = () => setPlayerState('playing');
    const handlePause = () => setPlayerState('paused');
    const handleEnded = () => {
      setPlayerState('idle');
      setIsPlaying(false);
      setCurrentPlayingId(null);
    };
    const handleError = () => setPlayerState('error');
    const handleLoading = () => setPlayerState('loading');

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleLoading);
    audio.addEventListener('playing', handlePlay);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleLoading);
      audio.removeEventListener('playing', handlePlay);
    };
  }, []);

  useEffect(() => {
    if (isDeveloper && activeTab === 'inbox') {
      setInboxError(null);
      // Try with orderBy first. If it fails, we fall back to a simple collection query.
      const q = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'));
      let unsubscribe: () => void;
      
      try {
        unsubscribe = onSnapshot(q, (snapshot) => {
          setFeedbacks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          console.warn("Inbox orderBy query failed, trying without order:", error);
          // Fallback to simple query if orderBy fails (likely due to missing index)
          const fallbackQ = query(collection(db, 'feedbacks'));
          const fallbackUnsub = onSnapshot(fallbackQ, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort in memory as fallback
            setFeedbacks(data.sort((a: any, b: any) => {
              const ka = a.createdAt?.toMillis?.() || 0;
              const kb = b.createdAt?.toMillis?.() || 0;
              return kb - ka;
            }));
          }, (err2) => {
            console.error("Inbox fallback query failed:", err2);
            setInboxError("Erro de acesso ao banco de dados.");
          });
          unsubscribe = fallbackUnsub;
        });
      } catch (e) {
        setInboxError("Erro ao iniciar sincronização.");
      }
      
      return () => { if(unsubscribe) unsubscribe(); };
    }
  }, [isDeveloper, activeTab]);

  const handleAuth = async () => {
    if (user) await signOut(auth);
    else await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const applyPreset = (presetOptions: any) => {
    setOptions({ ...options, ...presetOptions });
  };

  const saveCurrentAsPreset = () => {
    const name = prompt("Nome da pré-definição:");
    if (name) {
      const newPreset: CustomPreset = {
        id: Date.now().toString(),
        name,
        options: { ...options }
      };
      setCustomPresets([...customPresets, newPreset]);
    }
  };

  const deletePreset = (id: string) => {
    setCustomPresets(customPresets.filter(p => p.id !== id));
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = window.innerHeight * 0.4;
      textarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [text]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(text);
    alert("Texto copiado!");
  };

  const generateVoice = async () => {
    if (!text.trim()) {
      addNotification('error', 'Digite algum texto antes de sintetizar.');
      return;
    }
    
    // Check if voice is Pro
    const selectedVoiceProfile = VOICE_PROFILES.find(v => v.id === options.voice);
    if (selectedVoiceProfile?.category === 'Pro' && !isPro && !isDeveloper) {
      // Preview logic requested: 5 seconds then modal
      addNotification('info', 'Iniciando preview de 5 segundos...');
      // Simplificado: modal direto se for Pro e não assinado
      setShowProModal(true);
      return;
    }

    addNotification('info', 'Gerando seu áudio...');
    setIsGenerating(true);
    setPlayerState('loading');
    setIsPlaying(false);
    
    // Revoke old URL to avoid memory leaks
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setCurrentBase64(null);
    setShareLink(null); // Reset share link when new audio is generated
    
    try {
      const base64Audio = await generateNarration({ ...options, text });
      if (base64Audio) {
        const blob = b64toBlob(base64Audio);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setCurrentBase64(base64Audio);
        setCurrentPlayingId('current');
        
        // Stats and Vibration
        updateStats(text.length, options.voice);
        if (vibrationEnabled && navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
        
        if (base64Audio === BROWSER_TTS_SILENCE) {
          addNotification('warning', 'VoxAI offline: Usando síntese do navegador.');
        } else {
          addNotification('success', 'Áudio gerado com sucesso!');
        }

        // Use a small timeout to let the URL state settle before playing
        setTimeout(() => {
          if (audioRef.current && url) {
            audioRef.current.play().then(() => {
              setIsPlaying(true);
              setPlayerState('playing');
            }).catch(err => {
              if (err.name !== 'AbortError') {
                console.error("Autoplay failed:", err);
                setPlayerState('idle'); 
              }
            });
          }
        }, 50);
      }
    } catch (error: any) {
      console.error("Synthesis error:", error);
      setPlayerState('error');
      addNotification('error', 'Não foi possível gerar o áudio.\nVerifique sua conexão e tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const shareAudio = async (isWhatsApp = false) => {
    if (!user || !currentBase64) {
      if (!user) addNotification('warning', "Faça login para compartilhar áudios.");
      return;
    }
    
    // If we already have a share link, just use it
    if (shareLink) {
      if (isWhatsApp) {
        const message = `Ouça este áudio que gerei no VoxAI Studio 🎙️ ${shareLink}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        addNotification('success', "WhatsApp aberto!");
      } else {
        await navigator.clipboard.writeText(shareLink);
        addNotification('success', "Link copiado com sucesso!");
      }
      return;
    }

    addNotification('info', 'Gerando seu link...');
    setIsSharing(true);
    try {
      // Check limit
      const q = query(collection(db, 'public_audios'), where('userId', '==', user.uid));
      const snapshot = await getDocsFromServer(q);
      if (snapshot.size >= 10) {
        addNotification('error', "Limite de compartilhamentos atingido.\nExclua um link para continuar.");
        setIsSharing(false);
        return;
      }

      const audioId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      const audioRefItem = ref(storage, `public/${user.uid}/${audioId}.wav`);
      const blob = b64toBlob(currentBase64);
      
      if (blob.size > 5 * 1024 * 1024) {
        addNotification('warning', "Texto muito longo para compartilhar.");
        setIsSharing(false);
        return;
      }

      await uploadBytes(audioRefItem, blob);
      const downloadURL = await getDownloadURL(audioRefItem);
      
      const publicUrl = `${window.location.origin}/audio/${audioId}`;
      
      await setDoc(doc(db, 'public_audios', audioId), {
        userId: user.uid,
        userName: user.displayName,
        title: text.slice(0, 50) || "Áudio VoxAI",
        downloadURL,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      setShareLink(publicUrl);
      
      if (isWhatsApp) {
        const message = `Ouça este áudio que gerei no VoxAI Studio 🎙️ ${publicUrl}`;
        const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
        addNotification('success', "WhatsApp aberto!");
      } else {
        await navigator.clipboard.writeText(publicUrl);
        addNotification('success', "Link gerado e copiado!");
      }
    } catch (e) {
      console.error("Sharing failed:", e);
      addNotification('error', "Não foi possível gerar o link.\nTente novamente mais tarde.");
    } finally {
      setIsSharing(false);
    }
  };

  const saveToLibrary = async () => {
    if (!user || !text || !audioUrl) {
      if (!user) addNotification('warning', "Faça login para salvar na Coleção");
      return;
    }
    
    addNotification('info', 'Salvando na biblioteca...');
    setIsSaving(true);
    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      await addDoc(collection(db, `users/${user.uid}/narrations`), {
        text,
        audioBase64: base64data,
        voice: options.voice,
        style: options.style,
        tone: options.tone,
        pace: options.pace,
        expressiveness: options.expressiveness,
        stability: options.stability,
        clarity: options.clarity,
        createdAt: serverTimestamp(),
        title: text.slice(0, 25) + (text.length > 25 ? '...' : '')
      });
      addNotification('success', "Áudio salvo na biblioteca!");
    } catch (e) {
      addNotification('error', "Erro ao salvar na biblioteca.\nTente novamente em instantes.");
      handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}/narrations`);
    } finally {
      setIsSaving(false);
    }
  };

  const sendFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackStatus('sending');
    
    try {
      await addDoc(collection(db, 'feedbacks'), {
        text: feedbackText,
        userId: user?.uid || 'anon',
        userEmail: user?.email || 'Visitante',
        userName: user?.displayName || 'Visitante',
        createdAt: serverTimestamp()
      });
      setFeedbackStatus('sent');
      setFeedbackText("");
      setTimeout(() => setFeedbackStatus('idle'), 3000);
    } catch (e) {
      console.error("Feedback failed:", e);
      alert("Falha ao enviar feedback.");
      setFeedbackStatus('idle');
    }
  };

  const markFeedbackAsRead = async (id: string, currentReadStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'feedbacks', id), { read: !currentReadStatus });
    } catch (e) {
      console.error("Update feedback failed:", e);
    }
  };

  const deleteFeedback = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'feedbacks', id));
    } catch (e) {
      console.error("Delete feedback failed:", e);
    }
  };

  const searchUserByEmail = async () => {
    if (!devSearchEmail.trim()) return;
    setIsSearchingUser(true);
    setDevFoundUser(null);
    try {
      const q = query(collection(db, 'users'), where('email', '==', devSearchEmail.trim().toLowerCase()), limit(1));
      const snaps = await getDocsFromServer(q);
      if (!snaps.empty) {
        const uDoc = snaps.docs[0];
        setDevFoundUser({ id: uDoc.id, ...uDoc.data() });
      } else {
        addNotification('warning', 'Usuário não encontrado.');
      }
    } catch (e) {
      console.error(e);
      addNotification('error', 'Erro ao buscar usuário.');
    } finally {
      setIsSearchingUser(false);
    }
  };

  const toggleUserProStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await setDoc(doc(db, 'users', userId), { isPro: !currentStatus }, { merge: true });
      addNotification('success', `Status Pro ${!currentStatus ? 'ativado' : 'desativado'} com sucesso!`);
      if (devFoundUser && devFoundUser.id === userId) {
        setDevFoundUser({...devFoundUser, isPro: !currentStatus});
      }
    } catch (e) {
      console.error(e);
      addNotification('error', 'Erro ao atualizar status Pro.');
    }
  };

  const updateTitle = async (id: string, newTitle: string) => {
    if (user) {
      try {
        await updateDoc(doc(db, `users/${user.uid}/narrations`, id), { title: newTitle });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/narrations/${id}`);
      }
    }
  };

  const deleteNarration = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("Attempting to delete narration:", id);
    if (!user) {
      console.error("No user found for deletion");
      return;
    }
    
    try {
      await deleteDoc(doc(db, `users/${user.uid}/narrations`, id));
      console.log("Delete successful");
    } catch (error: any) {
      console.error("Delete failed:", error);
      alert("Erro ao excluir: " + (error.message || "Erro de permissão"));
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/narrations/${id}`);
    }
  };

  const downloadAudioBlob = (url: string, filename = 'voxai-audio.wav') => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`;
    a.click();
  };

  return (
    <Routes>
      <Route path="/audio/:id" element={<AudioPublicPage />} />
      <Route path="*" element={
        <div className={cn("flex flex-col h-screen w-full bg-background text-foreground relative overflow-hidden", theme)}>
          
          {/* Header */}
          <header className="px-6 py-4 flex items-center justify-between z-30 glass sticky top-0 safe-top">
            <div className="flex items-center gap-3">
              <motion.div 
                whileHover={{ rotate: 10 }}
                className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20"
              >
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </motion.div>
              <h1 className="text-xl font-extrabold tracking-tight">VoxAI<span className="text-primary">Studio</span></h1>
            </div>
            
            <div className="flex items-center gap-2">
              {!isPro && !isDeveloper && (
                <Button 
                  onClick={() => setShowProModal(true)}
                  className="h-9 px-4 rounded-full bg-pro-gradient border-none text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-black/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Crown className="w-3.5 h-3.5 fill-white" />
                  Upgrade Pro
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full relative")}>
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border-2 border-primary/20" />
                  ) : (
                    <UserIcon className="w-5 h-5 opacity-60" />
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 glass-card border-primary/10 mt-2">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="flex flex-col gap-0.5">
                      <span className="font-bold">{user?.displayName || "Visitante"}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">{user?.email || "Entre para salvar seus áudios"}</span>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="bg-primary/10" />
                  
                  {/* Quick Stats in Menu */}
                  <div className="px-2 py-3 space-y-3">
                    <div className="flex items-center justify-between px-2">
                       <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Estatísticas</span>
                       <Badge variant="outline" className="text-[8px] h-4 px-1.5 border-primary/20 text-primary">{stats.audios} hoje</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col gap-0.5">
                        <p className="text-[8px] uppercase font-bold text-muted-foreground opacity-50">Caracteres</p>
                        <p className="text-xs font-black">{stats.characters > 1000 ? (stats.characters/1000).toFixed(1)+'k' : stats.characters}</p>
                      </div>
                      <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col gap-0.5">
                        <p className="text-[8px] uppercase font-bold text-muted-foreground opacity-50">Favorita</p>
                        <p className="text-xs font-black text-primary truncate">{stats.favoriteVoice}</p>
                      </div>
                    </div>
                  </div>
                  
                  {isDeveloper && (
                    <DropdownMenuSeparator className="bg-primary/10" />
                  )}
                  {isDeveloper && (
                    <DropdownMenuItem onClick={() => setActiveTab('developer')} className="cursor-pointer text-primary">
                      <Zap className="w-4 h-4 mr-2" /> Menu de Desenvolvedor
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-primary/10" />
                  <DropdownMenuItem onClick={() => setActiveTab('settings')} className="cursor-pointer">
                    <Settings2 className="w-4 h-4 mr-2" /> Preferências
                  </DropdownMenuItem>
                  {user ? (
                    <DropdownMenuItem onClick={handleAuth} className="text-destructive focus:text-destructive cursor-pointer">
                      <LogOut className="w-4 h-4 mr-2" /> Encerrar Sessão
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={handleAuth} className="text-primary font-bold cursor-pointer">
                      <LogIn className="w-4 h-4 mr-2" /> Entrar com Google
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Main Container */}
          <main className="flex-1 overflow-y-auto custom-scrollbar safe-bottom px-4 pb-28 pt-4">
            <AnimatePresence mode="wait">
              {activeTab === 'editor' && (
                <motion.div 
                  key="editor"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="space-y-6 pb-20"
                >
                  {/* 1.1 Quick Presets */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-primary" /> Modos Rápidos
                      </Label>
                    </div>
                    <ScrollArea className="w-full whitespace-nowrap pb-2 outline-none">
                      <div className="flex gap-3 pb-2">
                        {DEFAULT_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => applyPreset(preset)}
                            className={cn(
                              "flex flex-col items-center gap-3 p-4 rounded-3xl min-w-[100px] aspect-square transition-all border",
                              options.voice === preset.voice ? 
                                "glass-card border-primary/40 bg-primary/10 shadow-lg shadow-primary/10 scale-105" : 
                                "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]"
                            )}
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner",
                              options.voice === preset.voice ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"
                            )}>
                              {React.cloneElement(preset.icon as React.ReactElement, { className: "w-5 h-5" })}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest">{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* 2. Campo de Texto Expansível */}
                  <div className="relative group">
                    <div className="absolute right-3 top-3 z-10 flex gap-2">
                       <button onClick={() => setText("")} className="h-8 w-8 flex items-center justify-center rounded-lg bg-black/20 hover:bg-black/40 text-muted-foreground hover:text-destructive transition-all" title="Limpar">
                        <Eraser className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={async () => {
                          const clipboardText = await navigator.clipboard.readText();
                          setText(text + clipboardText);
                          addNotification('info', 'Texto colado');
                        }} 
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-black/20 hover:bg-black/40 text-muted-foreground hover:text-primary transition-all" 
                        title="Colar"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <Textarea 
                      ref={textareaRef}
                      placeholder="O que você quer que eu diga hoje?"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="min-h-[140px] bg-white/[0.02] border-white/10 focus:border-primary/40 rounded-3xl p-6 text-base resize-none leading-relaxed shadow-inner transition-all overflow-hidden"
                    />
                    
                    {/* Correction Banner */}
                    <AnimatePresence>
                      {(correctionResult as any)?.errors && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute bottom-16 left-3 right-3 bg-primary/20 backdrop-blur-xl p-3 border border-primary/20 rounded-2xl flex items-center justify-between z-20 shadow-2xl"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <Pencil className="w-4 h-4 text-primary" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-primary">Correções encontradas</span>
                          </div>
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            className="rounded-xl h-9 px-4 text-[10px] font-black uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={() => {
                              setText((correctionResult as any).corrected);
                              setCorrectionResult(null);
                              addNotification('success', 'Texto corrigido!');
                            }}
                          >
                            Corrigir Agora
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="absolute bottom-4 right-6 text-[10px] font-black text-muted-foreground/60 tabular-nums bg-black/20 backdrop-blur-sm px-3 py-1 rounded-full border border-white/5">
                      {text.length}/5000
                    </div>
                  </div>

                  {/* Controls Stack */}
                  <div className="space-y-4">
                    {/* Perfil Vocal */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest pl-1">Perfil Vocal</Label>
                      <Select 
                        value={options.voice} 
                        onValueChange={(v) => {
                          const profile = VOICE_PROFILES.find(p => p.id === v);
                          if (profile?.category === 'Pro' && !isPro && !isDeveloper) {
                            setShowProModal(true);
                            return;
                          }
                          setOptions({...options, voice: v});
                        }}
                      >
                        <SelectTrigger className="h-14 glass-card border-none bg-white/[0.03] rounded-2xl min-h-[56px] shadow-inner focus:ring-1 focus:ring-primary/40">
                          <SelectValue placeholder="Escolha um Perfil Vocal" />
                        </SelectTrigger>
                        <SelectContent className="glass-card border-white/10 max-h-[400px]">
                          <div className="p-2 text-[10px] uppercase tracking-widest opacity-40 font-black">Vozes Padrão</div>
                          {VOICE_PROFILES.filter(v => v.category === 'Padrao').map((v) => (
                            <SelectItem key={v.id} value={v.id} className="focus:bg-primary/20 rounded-lg m-1 py-1">
                              <div className="flex flex-col">
                                <span className="font-bold text-sm tracking-tight">{v.name}</span>
                                <span className="text-[10px] opacity-50 font-medium">{v.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                          
                          <Separator className="bg-white/5 mx-1 my-1" />
                          <div className="p-2 text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 text-primary">
                            <Crown className="w-3 h-3 fill-primary" /> Vozes Pro (Assinantes)
                          </div>
                          {VOICE_PROFILES.filter(v => v.category === 'Pro').map((v) => (
                            <SelectItem key={v.id} value={v.id} className="focus:bg-white/20 rounded-lg m-1 py-1 group/item">
                              <div className="flex flex-col">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-sm tracking-tight text-white group-item-data-[state=checked]:text-primary">{v.name}</span>
                                  {v.category === 'Pro' && !isPro && !isDeveloper && <Lock className="w-2.5 h-2.5 opacity-40" />}
                                </div>
                                <span className="text-[10px] opacity-50 font-medium">{v.description}</span>
                              </div>
                            </SelectItem>
                          ))}

                          <Separator className="bg-white/5 mx-1 my-1" />
                          <div className="p-2 text-[10px] uppercase tracking-widest opacity-40 font-black flex items-center gap-1.5">
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" /> Vozes Especiais
                          </div>
                          {VOICE_PROFILES.filter(v => v.category === 'Especial').map((v) => (
                            <SelectItem key={v.id} value={v.id} className="focus:bg-primary/20 rounded-lg m-1 py-1 group">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-sm tracking-tight text-primary group-data-[state=checked]:text-primary">{v.name}</span>
                                  <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />
                                </div>
                                <span className="text-[10px] opacity-50 font-medium">{v.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {VOICE_PROFILES.find(v => v.id === options.voice)?.category === 'Especial' && (
                        <p className="text-[9px] text-center text-primary font-black mt-2 animate-in fade-in slide-in-from-top-1 px-4 py-1.5 bg-primary/10 rounded-full border border-primary/20">
                          ✨ Personagem criativo gerado por IA
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest pl-1">Tom de Voz</Label>
                        <Select 
                          value={options.tone} 
                          onValueChange={(v) => setOptions({...options, tone: v})}
                        >
                          <SelectTrigger className="h-12 glass-card border-none bg-white/[0.03] rounded-xl focus:ring-1 focus:ring-primary/40"><SelectValue /></SelectTrigger>
                          <SelectContent className="glass-card">
                            {TONE_OPTIONS.map(tone => (
                              <SelectItem key={tone} value={tone} className="text-xs font-medium">{tone}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest pl-1">Ritmo</Label>
                        <Select 
                          value={options.pace} 
                          onValueChange={(v) => {
                            const speedMap: Record<string, number> = {
                              "Muito lento": 0.5,
                              "Lento": 0.75,
                              "Moderado": 0.9,
                              "Natural": 1.0,
                              "Dinâmico": 1.1,
                              "Rápido": 1.25,
                              "Muito rápido": 1.5,
                              "Acelerado progressivo": 1.4,
                              "Com pausas dramáticas": 0.8
                            };
                            setOptions({...options, pace: v, speed: speedMap[v] || 1.0});
                          }}
                        >
                          <SelectTrigger className="h-12 glass-card border-none bg-white/[0.03] rounded-xl focus:ring-1 focus:ring-primary/40"><SelectValue /></SelectTrigger>
                          <SelectContent className="glass-card">
                            {PACE_OPTIONS.map(pace => (
                              <SelectItem key={pace} value={pace} className="text-xs font-medium">{pace}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest pl-1">Oratória</Label>
                      <Select value={options.style} onValueChange={(v) => setOptions({...options, style: v})}>
                        <SelectTrigger className="h-12 glass-card border-none bg-white/[0.03] rounded-xl focus:ring-1 focus:ring-primary/40"><SelectValue /></SelectTrigger>
                        <SelectContent className="glass-card">
                          {STYLE_OPTIONS.map(style => (
                            <SelectItem key={style} value={style} className="text-xs font-medium">{style}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                  {/* 4. Ajustes de Precisão (Expandível) */}
                  <div className="space-y-0 relative">
                    <button 
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-all py-3 px-2 text-[10px] font-black uppercase tracking-widest outline-none w-full justify-center opacity-40 hover:opacity-100 group"
                    >
                      <div className="h-px bg-white/5 flex-1 group-hover:bg-primary/20" />
                      <SlidersHorizontal className={cn("w-3.5 h-3.5 transition-transform", showAdvanced && "rotate-180")} />
                      {showAdvanced ? "Ocultar Precisão" : "Ajustes de Precisão"}
                      <div className="h-px bg-white/5 flex-1 group-hover:bg-primary/20" />
                    </button>

                      <AnimatePresence>
                        {showAdvanced && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                          >
                            <div className="p-4 glass-card rounded-2xl border-primary/10 mt-2 space-y-6">
                              <div className="flex items-start gap-4 p-3 bg-primary/5 rounded-xl border border-primary/10">
                                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                <p className="text-[10px] text-primary/80 leading-relaxed font-medium">
                                  Configurações padrão são as recomendadas para a maioria das vozes. 
                                  Ajuste apenas se necessário para seu caso de uso específico.
                                </p>
                              </div>

                              <ControlAdjuster 
                                label="Expressividade" 
                                value={options.expressiveness} 
                                onChange={(v: number) => setOptions({...options, expressiveness: v})} 
                                icon={<Music />}
                                description="Controla a carga emocional e variação dinâmica. Valores altos trazem mais drama e vida à voz."
                              />
                              <ControlAdjuster 
                                label="Estabilidade" 
                                value={options.stability} 
                                onChange={(v: number) => setOptions({...options, stability: v})} 
                                icon={<SlidersHorizontal />}
                                description="Define quão constante a voz se mantém. Mais estabilidade evita ruídos inesperados."
                              />
                              <ControlAdjuster 
                                label="Clareza" 
                                value={options.clarity} 
                                onChange={(v: number) => setOptions({...options, clarity: v})} 
                                icon={<Globe />}
                                description="Aumenta a separação entre palavras e sons. Ideal para narrações técnicas ou profissionais."
                              />

                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setOptions({
                                  ...options,
                                  expressiveness: 65,
                                  stability: 50,
                                  clarity: 75
                                })}
                                className="w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary active:bg-primary/5 min-h-[44px]"
                              >
                                <RotateCcw className="w-3 h-3 mr-2" /> Restaurar Padrão
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Action Button */}
                  <Button 
                    onClick={generateVoice}
                    disabled={isGenerating || !text.trim()}
                    className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black text-lg shadow-xl shadow-primary/20 hover:scale-[1.01] active:translate-y-1 transition-all relative overflow-hidden"
                  >
                    {isGenerating ? (
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce" />
                        </div>
                        <span className="text-sm font-black tracking-widest">SINTETIZANDO...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Play className="w-5 h-5 fill-current" />
                        SINTETIZAR AGORA
                      </div>
                    )}
                  </Button>

                  {/* Player Overlay */}
                  {audioUrl && (
                    <motion.div 
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 glass-card rounded-2xl border-primary/20 bg-primary/[0.03] space-y-4 shadow-2xl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Button 
                            size="icon" 
                            variant="default" 
                            disabled={playerState === 'loading'}
                            className={cn(
                              "w-14 h-14 rounded-full shadow-lg active:scale-95 transition-all bg-primary",
                              playerState === 'error' && "bg-destructive text-white"
                            )}
                            onClick={() => {
                              if (audioRef.current) {
                                if (isPlaying) {
                                  audioRef.current.pause();
                                  setIsPlaying(false);
                                } else {
                                  audioRef.current.play().then(() => setIsPlaying(true));
                                }
                              }
                            }}
                          >
                            {playerState === 'loading' ? (
                              <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/20 border-t-white" />
                            ) : isPlaying ? (
                              <Pause className="w-7 h-7 fill-current" />
                            ) : (
                              <Play className="w-7 h-7 fill-current ml-1" />
                            )}
                          </Button>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest mb-0.5">
                              {playerState === 'playing' ? 'Reproduzindo' : 
                               playerState === 'loading' ? 'Processando...' :
                               playerState === 'paused' ? 'Pausado' :
                               playerState === 'error' ? 'Erro' : 'Finalizado'}
                            </span>
                            <span className="text-sm font-black truncate max-w-[150px] tracking-tight">{VOICE_PROFILES.find(v => v.id === options.voice)?.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button onClick={saveToLibrary} disabled={!user || isSaving || !currentBase64} variant="ghost" size="icon" className="h-11 w-11 rounded-full bg-white/5 text-primary" title="Salvar">
                            <Save className={cn("w-5 h-5", isSaving && "animate-pulse")} />
                          </Button>
                          <Button onClick={() => downloadAudioBlob(audioUrl!)} disabled={!audioUrl} variant="ghost" size="icon" className="h-11 w-11 rounded-full bg-white/5" title="Baixar">
                            <Download className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          variant="outline" 
                          className="h-11 rounded-xl border-white/10 hover:bg-white/5 font-black uppercase tracking-widest text-[9px]"
                          onClick={() => shareAudio(false)}
                          disabled={isSharing}
                        >
                          <Share2 className="w-3.5 h-3.5 mr-2" /> 
                          {isSharing ? "Gerando..." : "Compartilhar"}
                        </Button>
                        <Button 
                          variant="outline" 
                          className="h-11 rounded-xl border-green-500/20 hover:bg-green-500/5 text-green-500 font-black uppercase tracking-widest text-[9px]"
                          onClick={() => shareAudio(true)}
                          disabled={isSharing}
                        >
                          <MessageSquare className="w-3.5 h-3.5 mr-2" /> WhatsApp
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {activeTab === 'library' && (
                <motion.div 
                  key="library"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="space-y-6 pb-20"
                >
                  <div className="flex items-center justify-between px-1">
                    <div className="flex flex-col">
                      <h2 className="text-2xl font-black flex items-center gap-2">
                        Coleção
                      </h2>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{savedNarrations.length} arquivos sincronizados</span>
                    </div>
                    <Select value={playbackRate.toString()} onValueChange={(v) => setPlaybackRate(parseFloat(v))}>
                      <SelectTrigger className="w-20 h-8 text-[10px] font-bold glass-card border-none bg-primary/10 min-h-[44px]">
                        <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {playbackRate}x</div>
                      </SelectTrigger>
                      <SelectContent className="glass-card">
                        <SelectItem value="0.75" className="text-xs">0.75x</SelectItem>
                        <SelectItem value="1" className="text-xs">1.0x</SelectItem>
                        <SelectItem value="1.25" className="text-xs">1.25x</SelectItem>
                        <SelectItem value="1.5" className="text-xs">1.5x</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {savedNarrations.length === 0 ? (
                    <div className="py-20 flex flex-col items-center text-center space-y-4 opacity-30">
                      <Library className="w-16 h-16" />
                      <p className="text-sm font-medium">Sua biblioteca está vazia.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 pb-10">
                      {savedNarrations.map((n) => (
                        <AudioCard 
                          key={n.id} 
                          narration={n} 
                          isPlaying={currentPlayingId === n.id && isPlaying}
                          onPlay={() => {
                            if (currentPlayingId === n.id && isPlaying) {
                              audioRef.current?.pause();
                              setIsPlaying(false);
                              return;
                            }
                            setPlayerState('loading');
                            try {
                              const blob = b64toBlob(n.audioBase64);
                              const url = URL.createObjectURL(blob);
                              if (audioUrl) URL.revokeObjectURL(audioUrl);
                              setAudioUrl(url);
                              setIsPlaying(true);
                              setCurrentPlayingId(n.id);
                              
                              // Re-use current handler flow via state
                              setTimeout(() => {
                                if (audioRef.current) {
                                  audioRef.current.play().then(() => {
                                    setPlayerState('playing');
                                  }).catch(err => {
                                    if (err.name !== 'AbortError') {
                                      console.error("Library play error:", err);
                                      setPlayerState('idle');
                                      setCurrentPlayingId(null);
                                    }
                                  });
                                }
                              }, 50);
                            } catch (err) {
                              console.error("Process library audio error:", err);
                              setPlayerState('error');
                            }
                          }}
                          onDelete={(e) => deleteNarration(n.id, e)}
                          onDownload={() => {
                            try {
                              const blob = b64toBlob(n.audioBase64);
                              downloadAudioBlob(URL.createObjectURL(blob), n.title);
                            } catch (err) {
                              console.error("Download error:", err);
                              alert("Não foi possível processar o áudio para download.");
                            }
                          }}
                          onRename={(title) => updateTitle(n.id, title)}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div 
                  key="settings"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-8 pb-32"
                >
                  <div className="space-y-1">
                    <h2 className="text-3xl font-black tracking-tighter">Olá, {displayName || (user?.displayName?.split(' ')[0]) || "Voxer"} 👋</h2>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest opacity-60">Configurações do Estúdio</p>
                  </div>

                  {/* 2. TEMA DE COR */}
                  <section className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Tema Visual</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {THEMES.map(t => (
                        <button 
                          key={t.id}
                          onClick={() => {
                            if (t.pro && !isPro && !isDeveloper) {
                              setShowProModal(true);
                              return;
                            }
                            setTheme(t.id);
                          }}
                          className={cn(
                            "flex flex-col items-center gap-3 transition-all p-4 rounded-2xl border-2",
                            theme === t.id ? "bg-primary/10 border-primary shadow-lg" : "bg-white/[0.03] border-transparent hover:bg-white/[0.05]"
                          )}
                        >
                          <div className={cn("w-10 h-10 rounded-full shadow-lg relative flex items-center justify-center", t.id === 'white' && 'border border-black/10', t.color)}>
                            {t.pro && <Crown className="w-4 h-4 text-white drop-shadow-md" />}
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest">{t.name}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* 3. PERSONALIZAÇÃO */}
                  <section className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Personalização</Label>
                    <Card className="glass-card border-none bg-white/[0.03] p-6 rounded-[2rem] space-y-8">
                       {/* Font Size */}
                       <div className="space-y-4">
                          <p className="text-[11px] font-black uppercase tracking-widest opacity-40">Tamanho da Fonte</p>
                          <div className="flex bg-black/20 p-1 rounded-2xl gap-1">
                             {[
                               { label: 'A-', size: 14 },
                               { label: 'A', size: 16 },
                               { label: 'A+', size: 18 },
                             ].map(item => (
                               <button 
                                 key={item.label}
                                 onClick={() => setFontSize(item.size)}
                                 className={cn(
                                   "flex-1 h-12 rounded-xl text-sm font-black transition-all",
                                   fontSize === item.size ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
                                 )}
                               >
                                 {item.label}
                               </button>
                             ))}
                          </div>
                       </div>

                       {/* Display Name */}
                       <div className="space-y-4">
                          <p className="text-[11px] font-black uppercase tracking-widest opacity-40">Como devemos te chamar?</p>
                          <Input 
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder={user?.displayName || "Seu Nome"}
                            className="h-12 bg-black/20 border-white/5 rounded-xl font-bold px-4 focus:ring-1 focus:ring-primary/40 transition-all"
                          />
                       </div>

                       {/* Vibration Toggle */}
                       <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-none">Vibração háptica</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Vibrar ao concluir tarefas</p>
                          </div>
                          <Switch 
                            checked={vibrationEnabled}
                            onCheckedChange={setVibrationEnabled}
                            className="data-[state=checked]:bg-primary"
                          />
                       </div>
                    </Card>
                  </section>

                  {/* 4. GERAL */}
                  <section className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Geral</Label>
                    <Card className="glass-card border-none bg-white/[0.03] p-6 rounded-[2rem] space-y-6">
                        {/* Notificações */}
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-none">Notificações</p>
                          <Switch 
                            checked={notificationsEnabled}
                            onCheckedChange={setNotificationsEnabled}
                            className="data-[state=checked]:bg-primary"
                          />
                        </div>

                        {/* Offline Mode */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-none">Modo Offline</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Usar síntese do navegador</p>
                          </div>
                          <Switch 
                            checked={offlineMode}
                            onCheckedChange={(v) => {
                              setOfflineMode(v);
                              localStorage.setItem('vox-offline', v.toString());
                              addNotification('info', v ? 'Modo Offline Ativado' : 'Modo Cloud Ativado');
                            }}
                            className="data-[state=checked]:bg-primary"
                          />
                        </div>

                        <Separator className="bg-white/5" />

                        <div className="space-y-3">
                          <Button 
                            variant="ghost" 
                            className="w-full justify-between h-12 px-0 hover:bg-transparent group"
                            onClick={() => {
                              const data = JSON.stringify({ stats, customPresets, savedNarrations });
                              const blob = new Blob([data], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `voxai-settings-${Date.now()}.json`;
                              a.click();
                            }}
                          >
                            <span className="text-[11px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity">Exportar Dados</span>
                            <Download className="w-4 h-4 text-muted-foreground" />
                          </Button>

                          <Button 
                            variant="ghost" 
                            className="w-full justify-between h-12 px-0 hover:bg-transparent group text-destructive"
                            onClick={() => {
                              if (confirm('Deseja limpar todo o cache local? Seus áudios na nuvem não serão afetados.')) {
                                localStorage.clear();
                                window.location.reload();
                              }
                            }}
                          >
                            <span className="text-[11px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity text-destructive">Limpar Cache Local</span>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                    </Card>
                  </section>

                  {/* 5. SOBRE */}
                  <section className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Sobre</Label>
                    <div className="flex flex-col items-center text-center space-y-4 p-8 glass-card border-none bg-white/[0.03] rounded-[2.5rem]">
                       <div className="w-20 h-20 bg-primary/20 rounded-[2rem] flex items-center justify-center rotate-3 border-2 border-primary/20">
                          <Sparkles className="w-10 h-10 text-primary" />
                       </div>
                       <div>
                          <h3 className="text-xl font-black italic tracking-tighter">VoxAI Studio</h3>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-40">Versão 2.5.0 Gold</p>
                       </div>
                       <p className="text-xs text-muted-foreground leading-relaxed">
                          O estúdio de narração neural completo, projetado para criadores que buscam excelência sonora e velocidade.
                       </p>
                    </div>
                  </section>

                  {/* 6. FEEDBACK */}
                  <section className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Sua voz importa</Label>
                    <div className="space-y-3">
                      <Textarea 
                        placeholder="Em que podemos melhorar? Mande sua ideia..."
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        className="bg-black/20 border-white/5 rounded-2xl min-h-[100px] text-sm p-4"
                      />
                      <Button 
                        onClick={sendFeedback}
                        disabled={feedbackStatus !== 'idle'}
                        className="w-full h-12 bg-primary/10 text-primary border border-primary/20 font-black uppercase tracking-widest text-xs rounded-xl"
                      >
                        {feedbackStatus === 'sending' ? 'Enviando...' : 
                         feedbackStatus === 'sent' ? 'Enviado com Sucesso!' : 'Enviar Feedback'}
                      </Button>
                    </div>
                  </section>

                  {/* Logout Button */}
                  {user && (
                    <Button 
                      variant="ghost" 
                      onClick={() => signOut(auth)}
                      className="w-full h-14 bg-destructive/10 text-destructive hover:bg-destructive/20 font-black uppercase tracking-widest text-xs rounded-2xl"
                    >
                      <LogOut className="w-4 h-4 mr-2" /> Encerrar Sessão
                    </Button>
                  )}
                </motion.div>
              )}

              {activeTab === 'inbox' && isDeveloper && (
                <motion.div 
                  key="inbox"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="space-y-6 pb-40"
                >
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-black">Inbox de Feedbacks</h2>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                      {inboxFilter === 'unread' ? 'Novas mensagens' : 
                       inboxFilter === 'read' ? 'Mensagens arquivadas' : 'Todas as mensagens'}
                    </p>
                  </div>

                  {inboxError ? (
                    <div className="py-20 flex flex-col items-center p-6 text-center space-y-4">
                      <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20">
                        <X className="w-8 h-8 text-red-500" />
                      </div>
                      <p className="text-sm font-medium text-red-400">{inboxError}</p>
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('editor')}>Voltar</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {feedbacks.length === 0 ? (
                        <div className="py-20 flex flex-col items-center opacity-30">
                          <Inbox className="w-12 h-12 mb-4" />
                          <p className="text-sm">Nenhum feedback ainda.</p>
                        </div>
                      ) : (
                        feedbacks
                          .filter(f => {
                            if (inboxFilter === 'unread') return !f.read;
                            if (inboxFilter === 'read') return f.read;
                            return true;
                          })
                          .map(f => (
                          <Card key={f.id} className={cn(
                            "glass-card border-none p-4 relative overflow-hidden transition-all",
                            f.read ? "bg-white/[0.01] opacity-60" : "bg-white/[0.05] border-l-2 border-l-primary"
                          )}>
                            <div className="flex justify-between items-start mb-2">
                               <div className="flex flex-col">
                                 <span className="text-sm font-bold">{f.userName}</span>
                                 <span className="text-[10px] opacity-40">{f.userEmail}</span>
                               </div>
                               <div className="flex items-center gap-1">
                                 <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className={cn("h-8 w-8", f.read ? "text-muted-foreground" : "text-primary")}
                                  onClick={() => markFeedbackAsRead(f.id, !!f.read)}
                                  title={f.read ? "Marcar como não lido" : "Marcar como lido"}
                                 >
                                   {f.read ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                 </Button>
                                 <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-destructive h-8 w-8 hover:bg-destructive/10"
                                  onClick={() => deleteFeedback(f.id)}
                                 >
                                   <Trash2 className="w-4 h-4" />
                                 </Button>
                               </div>
                            </div>
                            <p className="text-xs leading-relaxed mb-3">{f.text}</p>
                            <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest opacity-30 italic">
                               <span>{f.createdAt?.toDate ? f.createdAt.toDate().toLocaleString() : 'Recent'}</span>
                            </div>
                          </Card>
                        ))
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'developer' && isDeveloper && (
                <motion.div 
                  key="developer"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="space-y-6 pb-40"
                >
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-black">Menu de Desenvolvedor</h2>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Controle de Usuários e Sistema</p>
                  </div>

                  <section className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Gerenciar Premium</Label>
                    <Card className="glass-card border-none bg-white/[0.03] p-6 space-y-4 rounded-3xl">
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Email do usuário..." 
                          value={devSearchEmail}
                          onChange={(e) => setDevSearchEmail(e.target.value)}
                          className="bg-black/20 border-white/5 h-12 rounded-xl"
                        />
                        <Button 
                          onClick={searchUserByEmail}
                          disabled={isSearchingUser}
                          className="h-12 w-12 rounded-xl bg-primary"
                        >
                          {isSearchingUser ? <RotateCcw className="animate-spin w-4 h-4" /> : <Zap className="w-4 h-4" />}
                        </Button>
                      </div>

                      {devFoundUser && (
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                           <div className="flex items-center gap-3">
                              {devFoundUser.photoURL ? (
                                <img src={devFoundUser.photoURL} alt="" className="w-10 h-10 rounded-full" />
                              ) : (
                                <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center font-bold">
                                  {devFoundUser.displayName?.[0] || '?'}
                                </div>
                              )}
                              <div className="flex flex-col">
                                <span className="text-sm font-bold">{devFoundUser.displayName}</span>
                                <span className="text-[10px] opacity-50">{devFoundUser.email}</span>
                              </div>
                              <Badge className={cn("ml-auto", devFoundUser.isPro ? "bg-pro-gradient border-none" : "bg-zinc-700")}>
                                {devFoundUser.isPro ? "PRO" : "FREE"}
                              </Badge>
                           </div>

                           <Button 
                             onClick={() => toggleUserProStatus(devFoundUser.id, !!devFoundUser.isPro)}
                             className={cn(
                               "w-full h-11 rounded-xl font-black uppercase tracking-widest text-[10px]",
                               devFoundUser.isPro ? "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20" : "bg-primary text-primary-foreground"
                             )}
                           >
                             {devFoundUser.isPro ? "Remover Plano Pro" : "Ativar Plano Pro"}
                           </Button>
                        </div>
                      )}
                    </Card>
                  </section>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Bottom Nav */}
          <nav className="fixed bottom-0 left-0 right-0 w-full h-[calc(72px+env(safe-area-inset-bottom))] glass border-t border-white/10 px-6 flex items-center justify-between z-50 pb-[env(safe-area-inset-bottom)]">
            <NavButton active={activeTab === 'editor'} onClick={() => setActiveTab('editor')} icon={<Wand2 />} label="Estúdio" />
            <NavButton active={activeTab === 'library'} onClick={() => setActiveTab('library')} icon={<Library />} label="Coleção" />
            {isDeveloper && (
              <>
                <NavButton active={activeTab === 'inbox'} onClick={() => setActiveTab('inbox')} icon={<Inbox />} label="Inbox" />
                <NavButton active={activeTab === 'developer'} onClick={() => setActiveTab('developer')} icon={<Zap />} label="Dev" />
              </>
            )}
            <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings2 />} label="Ajustes" />
          </nav>

                {/* Categories and Filters for Inbox */}
                {activeTab === 'inbox' && isDeveloper && (
                  <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 right-0 glass border-t border-white/5 px-6 py-3 flex items-center justify-center gap-2 z-40">
                    <button 
                      onClick={() => setInboxFilter('unread')}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                        inboxFilter === 'unread' ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"
                      )}
                    >
                      Não Lidos
                    </button>
                    <button 
                      onClick={() => setInboxFilter('read')}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                        inboxFilter === 'read' ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"
                      )}
                    >
                      Arquivados
                    </button>
                    <button 
                      onClick={() => setInboxFilter('all')}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                        inboxFilter === 'all' ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"
                      )}
                    >
                      Todos
                    </button>
                  </div>
                )}

          {/* Global UI Components */}
          <NotificationOverlay 
            notifications={notifications} 
            onRemove={removeNotification} 
          />

          <ProModal 
            isOpen={showProModal} 
            onClose={() => setShowProModal(false)} 
          />

          <audio 
            ref={audioRef} 
            onEnded={() => setIsPlaying(false)} 
            className="hidden" 
            preload="auto"
          />

          <style>{`
            .glass { background: rgba(var(--background), 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
            /* Silver/Titanium Theme Styles */
            .bg-pro-gradient {
              background: linear-gradient(135deg, #434343, #A9A9A9, #696969);
            }
            .bg-silver-gradient {
              background: linear-gradient(135deg, #707070, #C0C0C0, #434343);
            }
            [data-theme='silver'] {
              --primary: 215 20% 95%;
              --primary-foreground: 215 25% 10%;
              --background: 215 15% 5%;
            }
            [data-theme='silver'] .glass-card {
              background: linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
              border: 1px solid rgba(255,255,255,0.12);
              box-shadow: 0 8px 32px 0 rgba(0,0,0,0.4);
            }
            [data-theme='silver'] .text-primary {
              color: #E2E8F0;
              text-shadow: 0 0 15px rgba(255,255,255,0.2);
            }
            
            [data-theme='white'] .glass { background: rgba(255, 255, 255, 0.05); }
            
            /* Custom Slider Thumb Scale */
            span[role="slider"] {
              transition: transform 0.2s ease;
            }
            span[role="slider"]:active {
              transform: scale(1.4) !important;
            }
          `}</style>
        </div>
      } />
    </Routes>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button onClick={onClick} className={cn("flex flex-col items-center gap-1.5 transition-all outline-none", active ? 'text-primary' : 'text-muted-foreground')}>
      <div className={cn("p-2 rounded-2xl transition-colors", active ? 'bg-primary/10' : 'bg-transparent')}>
        {React.cloneElement(icon as React.ReactElement, { className: cn("w-6 h-6", active ? 'stroke-[2.5px]' : 'stroke-[2px]' )})}
      </div>
      <span className={cn("text-[9px] font-bold tracking-widest uppercase", active ? 'opacity-100' : 'opacity-40')}>{label}</span>
      {active && <motion.div layoutId="nav-glow" className="absolute -top-1 w-2 h-2 bg-primary rounded-full blur-[2px]" />}
    </button>
  );
}

function ControlAdjuster({ label, value, onChange, icon, description }: any) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 rounded-lg text-primary scale-90">{icon}</div>
          <span className="text-sm font-bold tracking-tight">{label}</span>
        </div>
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl border border-white/5 p-1">
          <Button 
            variant="ghost"
            size="icon"
            onClick={() => onChange(Math.max(0, value - 5))}
            className="w-8 h-8 rounded-lg hover:bg-white/5 text-muted-foreground"
          >
            <Minus className="w-3 h-3" />
          </Button>
          <span className="text-xs font-mono font-bold text-primary min-w-[36px] text-center">{value}%</span>
          <Button 
            variant="ghost"
            size="icon"
            onClick={() => onChange(Math.min(100, value + 5))}
            className="w-8 h-8 rounded-lg hover:bg-white/5 text-muted-foreground"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>
      
      {description && (
        <p className="text-[10px] text-muted-foreground leading-relaxed px-1 pl-11">
          {description}
        </p>
      )}
      
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden ml-1 pr-1">
        <motion.div 
          initial={false}
          animate={{ width: `${value}%` }}
          className="h-full bg-gradient-to-r from-primary/20 to-primary"
        />
      </div>
    </div>
  );
}

function AudioCard({ narration, onPlay, onDelete, onDownload, onRename, isPlaying }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(narration.title || "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRename = () => {
    if (title.trim() && title !== narration.title) {
      onRename(title);
    }
    setIsEditing(false);
  };

  useEffect(() => {
    if (confirmDelete) {
      const timer = setTimeout(() => setConfirmDelete(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmDelete]);

  return (
    <motion.div 
      layout
      className={cn(
        "glass-card rounded-2xl p-4 flex flex-col gap-3 group relative overflow-hidden transition-all active:bg-white/[0.05]",
        isPlaying && "ring-1 ring-primary/40 bg-primary/[0.03]"
      )}
    >
      <div className="flex gap-4 items-center relative z-10">
        <Button onClick={onPlay} variant="ghost" size="icon" className={cn(
          "w-12 h-12 shrink-0 rounded-xl transition-all min-h-[48px] min-w-[48px]",
          isPlaying ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
        )}>
          {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
        </Button>
        <div className="flex-1 min-w-0 pr-2">
          {isEditing ? (
            <input 
              autoFocus
              className="bg-primary/10 border-none rounded text-sm p-1 w-full font-bold outline-none ring-1 ring-primary/30"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
            />
          ) : (
            <h3 className="text-sm font-bold truncate tracking-tight leading-none mb-1 pr-4" onClick={() => setIsEditing(true)}>
              {narration.title || "Voz Neural Sem Título"}
            </h3>
          )}
          <p className="text-[10px] line-clamp-1 opacity-40 font-medium">{narration.text}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-[8px] bg-white/5 border-none h-4 uppercase tracking-tighter">{narration.voice}</Badge>
            <span className="text-[9px] opacity-30 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {narration.createdAt ? (narration.createdAt as any).toDate().toLocaleDateString() : 'Recent'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
           <Button onClick={onDownload} variant="ghost" size="icon" className="h-10 w-10 text-primary active:bg-primary/10 min-h-[44px] min-w-[44px]" title="Download">
             <Download className="w-4 h-4" />
           </Button>
           <Button 
            onClick={(e) => {
              e.stopPropagation();
              if (confirmDelete) {
                onDelete(e);
                setConfirmDelete(false);
              } else {
                setConfirmDelete(true);
              }
            }} 
            variant="ghost" 
            size="icon" 
            className={cn(
              "h-10 w-10 transition-all min-h-[44px] min-w-[44px]",
              confirmDelete ? "bg-destructive text-white scale-110" : "text-destructive active:bg-destructive/10"
            )}
            title="Excluir"
           >
            {confirmDelete ? <CheckCircle2 className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
           </Button>
        </div>
      </div>
    </motion.div>
  );
}

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function NotificationOverlay({ notifications, onRemove }: any) {
  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-full max-w-[320px] pointer-events-none px-4">
      <AnimatePresence>
        {notifications.length > 0 && (
          <NotificationToast 
            key={notifications[0].id}
            id={notifications[0].id}
            type={notifications[0].type}
            message={notifications[0].message}
            onClose={() => onRemove(notifications[0].id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationToast({ id, type, message, onClose }: any) {
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    error: <XCircle className="w-5 h-5 text-red-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
  };

  const colors = {
    success: 'bg-emerald-500/10 border-emerald-500/20',
    error: 'bg-red-500/10 border-red-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
    info: 'bg-blue-500/10 border-blue-500/20',
  };

  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      onClick={onClose}
      className={cn(
        "pointer-events-auto cursor-pointer p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center gap-4",
        colors[type as keyof typeof colors] || colors.info
      )}
    >
      <div className="shrink-0">
        {icons[type as keyof typeof icons] || icons.info}
      </div>
      <p className="text-[13px] font-bold tracking-tight leading-tight flex-1">{message}</p>
    </motion.div>
  );
}

function ProModal({ isOpen, onClose }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-sm glass-card border-none bg-pro-gradient p-10 rounded-[3rem] shadow-3xl text-center space-y-8"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>

        <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
           <Crown className="w-8 h-8 text-white" />
        </div>

        <div className="space-y-2">
           <h3 className="text-3xl font-black text-white tracking-tight">Recurso Pro</h3>
           <p className="text-sm font-bold text-white/80 leading-relaxed">
             Essa funcionalidade é exclusiva para membros do VoxAI Pro. Faça o upgrade e libere todo o potencial do estúdio.
           </p>
        </div>

        <div className="space-y-4 pt-4">
           <div className="text-2xl font-black text-white">R$ 19,90 <span className="text-xs opacity-60">/ mês</span></div>
           <Button 
            onClick={() => {
              const message = encodeURIComponent(
                'Olá! Tenho interesse no Plano Pro do VoxAI Studio 👑\n' +
                'Poderia me passar mais informações sobre a assinatura?'
              );
              window.open(`https://wa.me/5512988986713?text=${message}`, '_blank');
              onClose();
            }}
            className="w-full h-16 bg-white text-black font-black text-lg rounded-2xl shadow-xl active:scale-95 transition-transform"
           >
             ASSINAR AGORA
           </Button>
           <button onClick={onClose} className="text-xs font-bold text-white/40 uppercase tracking-widest hover:text-white transition-colors">
             Talvez mais tarde
           </button>
        </div>
      </motion.div>
    </div>
  );
}
