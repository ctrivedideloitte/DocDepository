/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Mail, 
  MessageSquare, 
  Settings, 
  History, 
  Loader2,
  Mic,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Database
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Document {
  id: string;
  name: string;
  description: string;
  type: string;
}

interface DispatchLog {
  id: string;
  status: "processing" | "sending" | "sent" | "error";
  documentName?: string;
  destination: string;
  method: "whatsapp" | "email";
  timestamp: Date;
  message?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"voice" | "history" | "settings">("voice");
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [logs, setLogs] = useState<DispatchLog[]>([]);
  const [pendingDispatch, setPendingDispatch] = useState<{ doc: Document; destination: string; method: "whatsapp" | "email" } | null>(null);
  const [isSubmitInProgress, setIsSubmitInProgress] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [userSettings, setUserSettings] = useState({
    email: "ctrivedi@deloitte.com",
    whatsapp: "+919876543210",
    preferredMethod: "whatsapp" as "email" | "whatsapp"
  });
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check auth
    fetch("/api/auth/status")
      .then(res => res.json())
      .then(data => {
        setIsAuthenticated(data.isAuthenticated);
        if (data.isAuthenticated) fetchDocs();
      });

    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-IN';

      recognitionRef.current.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        setIsListening(false);
      };
    }

    // Load logs
    const savedLogs = localStorage.getItem("dispatch_logs");
    if (savedLogs) {
      try {
        setLogs(JSON.parse(savedLogs).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("dispatch_logs", JSON.stringify(logs));
  }, [logs]);

  const fetchDocs = async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error("Failed to fetch docs", e);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript("");
      setPendingDispatch(null);
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const processVoiceRequest = async (text: string) => {
    if (!text) return;
    
    const newLog: DispatchLog = {
      id: Math.random().toString(36).substr(2, 9),
      status: "processing",
      destination: userSettings.whatsapp,
      method: "whatsapp",
      timestamp: new Date()
    };
    
    setLogs(prev => [newLog, ...prev]);
    setIsAnalyzing(true);

    try {
      if (!isAuthenticated) throw new Error("Google Drive disconnected");

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, documents })
      });
      
      const analysis = await response.json();
      
      if (analysis.documentId) {
        const doc = documents.find(d => d.id === analysis.documentId);
        if (doc) {
          setPendingDispatch({
            doc,
            method: "whatsapp",
            destination: userSettings.whatsapp
          });
          
          setLogs(prev => prev.map(l => l.id === newLog.id ? 
            { ...l, status: "sending", documentName: doc.name } : l
          ));
        } else {
          throw new Error("Document mismatch");
        }
      } else {
        throw new Error("Could not identify document");
      }
    } catch (error: any) {
      setLogs(prev => prev.map(l => l.id === newLog.id ? 
        { ...l, status: "error", message: error.message } : l
      ));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmDispatch = async () => {
    if (!pendingDispatch) return;
    
    setIsSubmitInProgress(true);
    const { doc, destination } = pendingDispatch;
    
    try {
      const response = await fetch("/api/send-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          fileName: doc.name,
          destination
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setLogs(prev => prev.map(l => l.documentName === doc.name && l.status === 'sending' ? 
          { ...l, status: "sent", message: result.message } : l
        ));
        setPendingDispatch(null);
        setTranscript("");
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitInProgress(false);
    }
  };

  const handleConnectDrive = async () => {
    const res = await fetch("/api/auth/url");
    const { url } = await res.json();
    window.open(url, "google_auth", "width=600,height=700");
  };

  useEffect(() => {
    const handleMsg = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        setIsAuthenticated(true);
        fetchDocs();
      }
    };
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#050505] font-sans selection:bg-blue-500/30">
      {/* Mobile Frame */}
      <div className="w-full h-screen md:max-w-[400px] md:max-h-[840px] bg-[#121214] md:rounded-[3.5rem] shadow-[0_0_80px_rgba(0,0,0,0.5)] overflow-hidden relative flex flex-col md:border-[12px] border-[#1A1A1C]">
        
        {/* Status Notch */}
        <div className="h-12 flex justify-between items-center px-8 text-[11px] font-mono text-white/30 z-30">
          <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div className="flex gap-2 items-center">
            <Zap size={10} className="text-yellow-500" />
            <Globe size={10} />
            <div className="w-5 h-2.5 bg-white/10 rounded-sm border border-white/10"></div>
          </div>
        </div>

        {/* Global Nav Indicator */}
        <div className="absolute top-0 px-6 py-4 w-full flex justify-between items-center z-20">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,44,44,0.5)]'}`}></div>
            <span className="text-[10px] font-mono font-bold tracking-widest text-white/40 uppercase">
              {isAuthenticated ? 'System Ready' : 'Drivestore Offline'}
            </span>
          </div>
          <button 
            onClick={() => setActiveTab("settings")}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>

        {/* Main Interface */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === "voice" && (
              <motion.div 
                key="voice"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col"
              >
                {/* Visualizer Area */}
                <div className="h-[40%] flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_70%)]"></div>
                  
                  <div className="relative z-10">
                    <motion.div 
                      animate={isListening ? { 
                        scale: [1, 1.1, 1],
                        borderColor: ['rgba(255,255,255,0.1)', 'rgba(59,130,246,0.5)', 'rgba(255,255,255,0.1)']
                      } : {}}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className={`w-48 h-48 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${isListening ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.2)]' : 'bg-white/5 border-white/5'}`}
                    >
                      <button 
                        onClick={toggleListening}
                        className="w-full h-full rounded-full flex flex-col items-center justify-center gap-3 relative overflow-hidden group"
                      >
                        <div className={`absolute inset-0 transition-opacity duration-500 ${isListening ? 'opacity-100' : 'opacity-0'}`}>
                           <div className="w-full h-full bg-[conic-gradient(from_0deg,transparent,rgba(59,130,246,0.4),transparent)] animate-[spin_3s_linear_infinite]"></div>
                        </div>
                        <Mic size={48} className={`relative z-10 transition-colors ${isListening ? 'text-white' : 'text-white/20'}`} />
                        {isListening && (
                          <span className="text-[10px] font-mono font-black tracking-widest text-blue-400 animate-pulse relative z-10">RECORDING</span>
                        )}
                      </button>
                    </motion.div>
                  </div>
                </div>

                {/* Transcription Terminal */}
                <div className="flex-1 px-8 flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                     <div className="w-1 h-3 bg-blue-500"></div>
                     <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-white/30 uppercase">Terminal Input</span>
                  </div>

                  <div className={`flex-1 rounded-[2.5rem] bg-black/40 border-2 border-white/5 p-6 shadow-inner relative group transition-all duration-500 ${transcript ? 'border-white/10' : ''}`}>
                    <div className="absolute top-4 right-6 flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-white/10"></div>
                      <div className="w-2 h-2 rounded-full bg-white/10"></div>
                    </div>

                    <p className={`font-mono text-sm leading-relaxed ${transcript ? 'text-white' : 'text-white/10 italic'}`}>
                      {transcript || "> System waiting for audio signal..."}
                    </p>

                    {isListening && (
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "20%" }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="h-0.5 bg-blue-500 absolute bottom-6 left-6"
                      />
                    )}
                  </div>

                  {/* Actions Bar */}
                    <div className="h-32 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      {!isListening && transcript && !pendingDispatch && (
                        <motion.button
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          onClick={() => processVoiceRequest(transcript)}
                          disabled={isAnalyzing}
                          className="w-full py-5 bg-white text-black rounded-[2rem] font-black text-sm tracking-widest uppercase flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:opacity-50"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="animate-spin" size={18} />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              Analyze Command <ArrowRight size={18} />
                            </>
                          )}
                        </motion.button>
                      )}

                      {pendingDispatch && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="w-full h-24 bg-blue-600 rounded-[2rem] p-1 flex items-center overflow-hidden shadow-[0_20px_50px_rgba(59,130,246,0.3)]"
                        >
                          <div className="flex-1 px-6">
                            <div className="flex items-center gap-2 mb-0.5">
                              <ShieldCheck size={14} className="text-white/60" />
                              <span className="text-[9px] font-black tracking-widest text-white/60 uppercase">Ready to Dispatch</span>
                            </div>
                            <p className="font-black text-white text-sm truncate">{pendingDispatch.doc.name}</p>
                          </div>
                          <button 
                            onClick={handleConfirmDispatch}
                            disabled={isSubmitInProgress}
                            className="h-full bg-white text-black px-10 rounded-[1.8rem] font-black text-lg tracking-tighter hover:bg-gray-100 transition-colors disabled:opacity-50"
                          >
                            {isSubmitInProgress ? <Loader2 className="animate-spin" /> : "DISPATCH"}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8 h-full flex flex-col"
              >
                <div className="flex justify-between items-end mb-10">
                  <h2 className="text-4xl font-black tracking-tighter text-white">History</h2>
                  <button onClick={() => setLogs([])} className="text-[10px] font-mono font-bold tracking-widest text-white/30 hover:text-white uppercase">Purge All</button>
                </div>
                
                <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-white/10">
                      <History size={80} className="mb-4 opacity-20" />
                      <p className="font-mono text-[10px] font-bold tracking-[0.5em] uppercase">No Logs Detected</p>
                    </div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="p-5 bg-white/[0.03] border border-white/5 rounded-[2rem] flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                          log.status === 'sent' ? 'bg-blue-500/10 text-blue-500' : 
                          log.status === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-white/5 text-white/20'
                        }`}>
                          {log.status === 'processing' || log.status === 'sending' ? <Loader2 size={24} className="animate-spin" /> : 
                           log.status === 'sent' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate text-white/80">{log.documentName || "Unknown Doc"}</p>
                          <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mt-0.5">
                            {log.status === 'sent' ? 'Attached & Sent' : log.status}
                          </p>
                        </div>
                        <span className="text-[9px] font-mono text-white/20">
                          {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "settings" && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 h-full flex flex-col"
              >
                <div className="flex justify-between items-center mb-10">
                  <h2 className="text-4xl font-black tracking-tighter text-white">Vault</h2>
                  <button onClick={() => setActiveTab("voice")} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white"><X /></button>
                </div>

                <div className="flex-1 space-y-8 overflow-y-auto pr-2">
                  <section className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[10px] font-mono font-black text-white/30 uppercase tracking-widest">Memory Matrix</span>
                    </div>
                    
                    <div className="p-6 bg-white/[0.03] border border-white/5 rounded-[2.5rem]">
                       <div className="flex items-center gap-3 mb-4">
                         <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                           <Database size={18} />
                         </div>
                         <div>
                           <p className="text-sm font-bold">Google Drive Connection</p>
                           <p className="text-[9px] font-mono text-white/30 uppercase">{isAuthenticated ? `${documents.length} Files Indexed` : 'Account Needed'}</p>
                         </div>
                       </div>
                       {!isAuthenticated ? (
                         <button onClick={handleConnectDrive} className="w-full py-4 bg-white text-black rounded-2xl font-black text-xs tracking-widest uppercase">Link Drive</button>
                       ) : (
                         <div className="flex gap-2">
                           <button onClick={fetchDocs} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/60">Refresh Library</button>
                           <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.reload(); }} className="flex-1 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-500">Disconnect</button>
                         </div>
                       )}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <span className="text-[10px] font-mono font-black text-white/30 uppercase tracking-widest px-2">Primary Target</span>
                    <div className="p-6 bg-white/[0.03] border border-white/5 rounded-[2.5rem] space-y-6">
                       <div>
                         <div className="flex items-center gap-2 mb-2">
                           <MessageSquare size={12} className="text-white/40" />
                           <span className="text-[9px] font-mono font-black text-white/40 uppercase tracking-widest">WhatsApp ID</span>
                         </div>
                         <input 
                          type="text" 
                          value={userSettings.whatsapp}
                          onChange={e => setUserSettings({...userSettings, whatsapp: e.target.value})}
                          className="w-full bg-transparent border-none p-0 focus:ring-0 text-xl font-black text-white"
                         />
                       </div>
                       <div className="h-px bg-white/5"></div>
                       <div>
                         <div className="flex items-center gap-2 mb-2">
                           <Mail size={12} className="text-white/40" />
                           <span className="text-[9px] font-mono font-black text-white/40 uppercase tracking-widest">Email Backup</span>
                         </div>
                         <input 
                          type="email" 
                          value={userSettings.email}
                          onChange={e => setUserSettings({...userSettings, email: e.target.value})}
                          className="w-full bg-transparent border-none p-0 focus:ring-0 text-xl font-black text-white"
                         />
                       </div>
                    </div>
                  </section>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Main Navigation */}
          <nav className="h-28 bg-black/40 border-t border-white/5 backdrop-blur-xl flex items-center justify-around px-12 pt-2 pb-10 z-20">
            <button 
              onClick={() => setActiveTab("voice")}
              className={`flex flex-col items-center gap-2 transition-all ${activeTab === 'voice' ? 'text-white' : 'text-white/20'}`}
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${activeTab === 'voice' ? 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'bg-transparent'}`}>
                 <Mic size={24} />
              </div>
              <span className="text-[10px] font-mono font-black uppercase tracking-widest">Link</span>
            </button>
            <button 
              onClick={() => setActiveTab("history")}
              className={`flex flex-col items-center gap-2 transition-all ${activeTab === 'history' ? 'text-white' : 'text-white/20'}`}
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${activeTab === 'history' ? 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'bg-transparent'}`}>
                 <History size={24} />
              </div>
              <span className="text-[10px] font-mono font-black uppercase tracking-widest">Logs</span>
            </button>
          </nav>

          {/* Bottom Rail */}
          <div className="h-2 flex justify-center items-center pb-6">
            <div className="w-32 h-1 bg-white/10 rounded-full"></div>
          </div>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}
