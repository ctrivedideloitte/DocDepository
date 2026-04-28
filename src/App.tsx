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
  ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { analyzeRequest, Document } from "./services/gemini";

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
  const [userSettings, setUserSettings] = useState({
    email: "ctrivedi@deloitte.com",
    whatsapp: "+919876543210",
    preferredMethod: "whatsapp" as "email" | "whatsapp",
    autoSend: true
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
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const current = event.resultIndex;
        const transcriptText = event.results[current][0].transcript;
        setTranscript(transcriptText);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };
    }

    // Load logs from local storage
    const savedLogs = localStorage.getItem("dispatch_logs");
    if (savedLogs) {
      try {
        setLogs(JSON.parse(savedLogs).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (transcript && !isListening && transcript.length > 5) {
      processVoiceRequest(transcript);
    }
  }, [isListening, transcript]);

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
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const processVoiceRequest = async (text: string) => {
    const newLog: DispatchLog = {
      id: Math.random().toString(36).substr(2, 9),
      status: "processing",
      destination: userSettings.preferredMethod === "whatsapp" ? userSettings.whatsapp : userSettings.email,
      method: userSettings.preferredMethod,
      timestamp: new Date()
    };
    
    setLogs(prev => [newLog, ...prev]);

    try {
      if (!isAuthenticated) throw new Error("Google Drive not connected");

      const analysis = await analyzeRequest(text, documents);
      
      if (analysis.documentId) {
        const doc = documents.find(d => d.id === analysis.documentId);
        if (doc) {
          setPendingDispatch({
            doc,
            method: userSettings.preferredMethod,
            destination: userSettings.preferredMethod === "whatsapp" ? userSettings.whatsapp : userSettings.email
          });
          
          setLogs(prev => prev.map(l => l.id === newLog.id ? 
            { ...l, status: "sending", documentName: doc.name } : l
          ));
        } else {
          throw new Error("Document not found in Drive library");
        }
      } else {
        throw new Error("Couldn't identify that document. Try saying 'Aadhaar Card' or 'Passport'.");
      }
    } catch (error: any) {
      setLogs(prev => prev.map(l => l.id === newLog.id ? 
        { ...l, status: "error", message: error.message } : l
      ));
    }
  };

  const handleConfirmDispatch = async () => {
    if (!pendingDispatch) return;
    
    setIsSubmitInProgress(true);
    const { doc, method, destination } = pendingDispatch;
    
    try {
      const response = await fetch("/api/send-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          fileName: doc.name,
          method,
          destination,
          ccEmail: "ctrivedi@deloitte.com" // Hardcoded CC as per requirement
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setLogs(prev => prev.map(l => l.documentName === doc.name && l.status === 'sending' ? 
          { ...l, status: "sent", message: result.message } : l
        ));
        setPendingDispatch(null);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      alert("Dispatch failed: " + error.message);
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
    <div className="flex items-center justify-center min-h-screen bg-[#F0F2F5] font-sans text-gray-900">
      {/* Container that acts like a standalone app */}
      <div className="w-full h-screen md:max-w-md md:max-h-[850px] bg-white md:rounded-[3rem] shadow-2xl overflow-hidden relative flex flex-col md:border-[10px] border-gray-900">
        
        {/* Status Bar */}
        <div className="h-10 px-8 flex justify-between items-center text-[10px] font-bold z-20">
          <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div className="flex gap-1.5 items-center">
            <div className="w-3.5 h-1.5 bg-gray-900 rounded-[2px] opacity-20"></div>
            <div className="w-4 h-2 bg-gray-900 rounded-[2px]"></div>
          </div>
        </div>

        {/* Header */}
        <header className="px-6 py-4 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-gray-50">
          <div>
            <h1 className="text-xl font-black tracking-tighter">DOC DISPATCH</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                {isAuthenticated ? 'Drive Connected' : 'Drive Offline'}
              </span>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab("settings")}
            className="p-2.5 bg-gray-50 rounded-2xl text-gray-400 hover:text-black transition-colors"
          >
            <Settings size={20} />
          </button>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-gray-50/50">
          <AnimatePresence mode="wait">
            {activeTab === "voice" && (
              <motion.div 
                key="voice"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col p-6"
              >
                {!isAuthenticated && (
                  <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-black p-6 rounded-[2.5rem] text-white shadow-xl mb-8 relative overflow-hidden"
                  >
                    <div className="relative z-10">
                      <h3 className="font-bold text-lg mb-1 leading-tight">Link Google Drive</h3>
                      <p className="text-white/50 text-[11px] mb-4 font-medium uppercase tracking-wider">Required for document search</p>
                      <button 
                        onClick={handleConnectDrive}
                        className="w-full bg-white text-black py-3.5 rounded-2xl font-bold text-sm tracking-tight active:scale-95 transition-transform"
                      >
                        Authorize Account
                      </button>
                    </div>
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                  </motion.div>
                )}

                <div className="flex-1 flex flex-col items-center justify-center py-12 relative">
                  <AnimatePresence>
                    {pendingDispatch && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="absolute inset-0 z-20 bg-white p-6 rounded-[2.5rem] shadow-2xl flex flex-col border-2 border-black"
                      >
                        <div className="flex justify-between items-start mb-6">
                           <div>
                             <h3 className="text-2xl font-black tracking-tighter leading-none mb-1">Send File?</h3>
                             <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Confirmation Required</p>
                           </div>
                           <div className="flex gap-2">
                             <button 
                              onClick={() => setActiveTab("settings")}
                              className="text-[10px] font-black uppercase text-gray-400 border-b border-gray-400 pb-0.5"
                             >
                               Edit Info
                             </button>
                             <button 
                              onClick={() => {
                                setPendingDispatch(null);
                                setLogs(prev => prev.filter(l => l.status !== 'sending'));
                              }}
                              className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400"
                             >
                               <X size={18} />
                             </button>
                           </div>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                          <div className="p-5 bg-gray-50 rounded-[2rem]">
                            <div className="flex items-center gap-3 mb-1">
                               <FileText size={16} className="text-black" />
                               <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Document</span>
                            </div>
                            <p className="font-black text-lg line-clamp-1">{pendingDispatch.doc.name}</p>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <div className="p-5 bg-green-50 rounded-[2rem] border border-green-100">
                              <div className="flex items-center gap-3 mb-1 text-green-700">
                                 <MessageSquare size={16} />
                                 <span className="text-[10px] font-black uppercase tracking-widest">To WhatsApp</span>
                              </div>
                              <p className="font-black text-lg">{pendingDispatch.destination}</p>
                            </div>
                            <div className="p-5 bg-blue-50 rounded-[2rem] border border-blue-100">
                              <div className="flex items-center gap-3 mb-1 text-blue-700">
                                 <Mail size={16} />
                                 <span className="text-[10px] font-black uppercase tracking-widest">CC Copy To</span>
                              </div>
                              <p className="font-black text-sm">ctrivedi@deloitte.com</p>
                            </div>
                          </div>
                        </div>

                        <button 
                          onClick={handleConfirmDispatch}
                          disabled={isSubmitInProgress}
                          className="mt-6 w-full bg-black text-white py-5 rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-transform disabled:opacity-50"
                        >
                          {isSubmitInProgress ? <Loader2 className="animate-spin" /> : "SUBMIT"}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="relative">
                    <motion.div 
                      animate={isListening ? { scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] } : {}}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-700 shadow-2xl ${isListening ? 'bg-black text-white shadow-black/40' : 'bg-white border-2 border-gray-100 text-gray-300'}`}
                    >
                      <button 
                        onClick={toggleListening}
                        className="w-full h-full rounded-full flex items-center justify-center relative active:scale-95 transition-transform"
                      >
                        <Mic size={56} className={isListening ? 'animate-pulse' : ''} />
                      </button>
                    </motion.div>
                    
                    {isListening && (
                      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-1.5 items-end h-8">
                         {[1,2,3,4,5,6].map(i => (
                           <motion.div 
                              key={i}
                              animate={{ height: [10, 32, 10] }}
                              transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                              className="w-1 bg-black rounded-full"
                           />
                         ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-16 text-center">
                    <h2 className="text-2xl font-black tracking-tight mb-3">
                      {isListening ? "Ready to Listen" : "Tap Trigger"}
                    </h2>
                    <div className="bg-white/50 px-6 py-3 rounded-2xl border border-gray-100 min-h-[60px] flex items-center justify-center">
                      <p className={`text-sm font-medium leading-relaxed ${transcript ? 'text-black font-bold' : 'text-gray-300'}`}>
                        {transcript || '"Send my PAN card to my WhatsApp"'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Memory Bar */}
                <div className="mt-auto">
                   <div className="flex justify-between items-center mb-4 px-2">
                     <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Recall Memory</h3>
                   </div>
                   <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center gap-4 active:scale-98 transition-transform">
                     <div className={`w-12 h-12 rounded-[1.5rem] flex items-center justify-center ${userSettings.preferredMethod === 'whatsapp' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                       {userSettings.preferredMethod === 'whatsapp' ? <MessageSquare size={24} /> : <Mail size={24} />}
                     </div>
                     <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Stored Destination</p>
                        <p className="text-sm font-black truncate">{userSettings.preferredMethod === 'whatsapp' ? userSettings.whatsapp : userSettings.email}</p>
                     </div>
                     <ArrowRight size={20} className="text-gray-200" />
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
                className="p-6 h-full flex flex-col"
              >
                <div className="flex justify-between items-end mb-8 px-2">
                  <h2 className="text-3xl font-black tracking-tighter">Activity</h2>
                  <button onClick={() => setLogs([])} className="text-[10px] uppercase font-black text-gray-300 tracking-widest">Wipe</button>
                </div>
                
                <div className="flex-1 space-y-4">
                  {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-10">
                      <History size={64} className="mb-4" />
                      <p className="font-bold uppercase tracking-widest text-xs">Waiting for command</p>
                    </div>
                  ) : (
                    logs.map(log => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={log.id} 
                        className="p-5 bg-white rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4"
                      >
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border border-gray-50 ${
                          log.status === 'sent' ? 'bg-green-50 text-green-600' : 
                          log.status === 'error' ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400'
                        }`}>
                          {log.status === 'processing' || log.status === 'sending' ? (
                            <Loader2 size={28} className="animate-spin" />
                          ) : log.status === 'sent' ? (
                            <CheckCircle2 size={28} />
                          ) : (
                            <AlertCircle size={28} />
                          )}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-black truncate text-gray-900">{log.documentName || "Identifying..."}</p>
                          <div className="mt-1">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              log.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {log.status === 'sent' ? 'Attachment Dispatched' : log.status}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-gray-300">
                          {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "settings" && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 h-full flex flex-col"
              >
                <div className="flex justify-between items-center mb-10">
                   <h2 className="text-3xl font-black tracking-tighter">Memory</h2>
                   <button 
                    onClick={() => setActiveTab("voice")}
                    className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400"
                   >
                     <X size={20} />
                   </button>
                </div>

                <div className="flex-1 space-y-10">
                  <section>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-5">Primary Destination</label>
                    <div className="space-y-4">
                      <div className="p-5 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm focus-within:border-black transition-colors">
                        <div className="flex items-center gap-2 mb-3">
                          <MessageSquare size={14} className="text-green-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">My WhatsApp Number</span>
                        </div>
                        <input 
                          type="text" 
                          value={userSettings.whatsapp}
                          onChange={e => setUserSettings({...userSettings, whatsapp: e.target.value})}
                          className="w-full border-none p-0 focus:ring-0 text-lg font-black"
                          placeholder="+91..."
                        />
                      </div>
                      <div className="p-5 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm focus-within:border-black transition-colors">
                        <div className="flex items-center gap-2 mb-3">
                          <Mail size={14} className="text-blue-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">My Email Address</span>
                        </div>
                        <input 
                          type="email" 
                          value={userSettings.email}
                          onChange={e => setUserSettings({...userSettings, email: e.target.value})}
                          className="w-full border-none p-0 focus:ring-0 text-lg font-black"
                          placeholder="hello@..."
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-5">Memory Preference</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setUserSettings({...userSettings, preferredMethod: 'whatsapp'})}
                        className={`p-6 rounded-[2.5rem] border transition-all flex flex-col items-center gap-3 ${userSettings.preferredMethod === 'whatsapp' ? 'bg-black text-white shadow-xl shadow-black/20' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
                      >
                        <MessageSquare size={28} />
                        <span className="text-[10px] font-black uppercase tracking-widest">WhatsApp</span>
                      </button>
                      <button 
                        onClick={() => setUserSettings({...userSettings, preferredMethod: 'email'})}
                        className={`p-6 rounded-[2.5rem] border transition-all flex flex-col items-center gap-3 ${userSettings.preferredMethod === 'email' ? 'bg-black text-white shadow-xl shadow-black/20' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
                      >
                        <Mail size={28} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Email</span>
                      </button>
                    </div>
                  </section>
                </div>

                {isAuthenticated && (
                  <button 
                    onClick={async () => {
                      await fetch("/api/auth/logout", { method: "POST" });
                      window.location.reload();
                    }}
                    className="w-full py-4 text-red-500 font-black text-[10px] uppercase tracking-[0.2em] bg-red-50 rounded-[2rem] active:scale-95 transition-transform"
                  >
                    Disconnect Drive
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Tab Navigation */}
        <nav className="h-28 bg-white border-t border-gray-50 flex items-center justify-around px-12 pt-2 pb-10 relative z-10">
          <button 
            onClick={() => setActiveTab("voice")}
            className={`flex flex-col items-center gap-2 transition-all ${activeTab === 'voice' ? 'text-black' : 'text-gray-300'}`}
          >
            <div className={`w-14 h-14 rounded-[2rem] flex items-center justify-center transition-all ${activeTab === 'voice' ? 'bg-black text-white' : 'bg-transparent'}`}>
               <Mic size={24} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">Listen</span>
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={`flex flex-col items-center gap-2 transition-all ${activeTab === 'history' ? 'text-black' : 'text-gray-300'}`}
          >
            <div className={`w-14 h-14 rounded-[2rem] flex items-center justify-center transition-all ${activeTab === 'history' ? 'bg-black text-white' : 'bg-transparent'}`}>
               <History size={24} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">Activity</span>
          </button>
        </nav>

        {/* Dynamic Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-8 bg-gray-900 rounded-b-[2rem] z-30"></div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-36 h-1.5 bg-gray-900 rounded-full z-30 opacity-10"></div>
      </div>
    </div>
  );
}
