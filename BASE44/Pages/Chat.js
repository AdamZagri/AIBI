import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, ChevronDown, ChevronUp, History, X, Loader2, Wifi, WifiOff, Clock, Menu } from "lucide-react";
import { User as UserEntity } from "@/entities/User";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SidebarTrigger } from "@/components/ui/sidebar";
import Visualization from "../components/chat/Visualization";

const API_BASE_URL = "https://aibi.cloudline.co.il";

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [user, setUser] = useState(null);
  const [collapsedMessages, setCollapsedMessages] = useState(new Set());
  const [chatHistory, setChatHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState("checking");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadUser();
    loadChatData();
    sendInitialGreeting();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadUser = async () => {
    try {
      const userData = await UserEntity.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const loadChatData = () => {
    const savedChatId = localStorage.getItem("aibi_chat_id");
    const savedMessages = localStorage.getItem("aibi_messages");
    const savedHistory = localStorage.getItem("aibi_chat_history");

    if (savedChatId) {
      setChatId(savedChatId);
    }
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (error) {
        console.error("Error parsing saved messages:", error);
        localStorage.removeItem("aibi_messages");
      }
    }
    if (savedHistory) {
      try {
        setChatHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error("Error parsing saved history:", error);
        localStorage.removeItem("aibi_chat_history");
      }
    }
  };

  const saveChatData = (newMessages, newChatId) => {
    try {
      localStorage.setItem("aibi_messages", JSON.stringify(newMessages));
      if (newChatId) {
        localStorage.setItem("aibi_chat_id", newChatId);
        setChatId(newChatId);
      }
      
      const historyEntry = {
        id: newChatId || chatId || Date.now(),
        timestamp: new Date().toISOString(),
        lastMessage: newMessages[newMessages.length - 1]?.text || "",
        messageCount: newMessages.length
      };
      
      const updatedHistory = [historyEntry, ...chatHistory.filter(h => h.id !== historyEntry.id)].slice(0, 20);
      setChatHistory(updatedHistory);
      localStorage.setItem("aibi_chat_history", JSON.stringify(updatedHistory));
    } catch (error) {
      console.error("Error saving chat data:", error);
    }
  };

  const sendInitialGreeting = async () => {
    const savedMessages = localStorage.getItem("aibi_messages");
    if (!savedMessages || JSON.parse(savedMessages).length === 0) {
      const initialMessage = "שלום.. שמי אדם זגרי, מנכ״ל החברה. אנא הצג את עצמך בקצרה ותן דוגמאות לשאלות.";
      setTimeout(() => {
        sendMessage(initialMessage, true);
      }, 1000);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const generateMessageId = () => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const sendMessage = async (message, isInitial = false) => {
    if (!message.trim() && !isInitial) return;
    
    setError(null);
    
    const messageId = generateMessageId();
    const userMessage = {
      id: messageId,
      text: message,
      sender: "user",
      timestamp: new Date().toISOString(),
    };

    const newMessages = isInitial ? [userMessage] : [...messages, userMessage];
    setMessages(newMessages);
    setInputMessage("");
    setIsLoading(true);

    try {
      const requestBody = {
        message: message,
        messageId: messageId,
        chatId: chatId || `chat_${Date.now()}`
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      const processingTime = data.processingTime || data.metadata?.processingTime;

      const aiMessage = {
        id: data.messageId || Date.now() + 1,
        text: data.reply || "תגובה ריקה מהשרת",
        sender: "ai",
        timestamp: new Date().toISOString(),
        viz: data.viz,
        data: data.data,
        sql: data.sql,
        processingTime: processingTime,
        chatId: data.chatId,
      };

      const finalMessages = [...newMessages, aiMessage];
      setMessages(finalMessages);
      saveChatData(finalMessages, data.chatId);
      setRetryCount(0);
      setConnectionStatus("connected");

    } catch (error) {
      console.error("Error sending message:", error);
      let errorMessage = `שגיאה: ${error.message}`;
      if (error.name === 'AbortError') {
        errorMessage = "הבקשה פגה - השרת לא הגיב במהלך 30 שניות";
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = "שגיאת חיבור לשרת. אנא בדוק את החיבור לאינטרנט";
        setConnectionStatus("disconnected");
      }
      
      const errorResponseMessage = {
        id: Date.now() + 1,
        text: `שגיאה בשליחת ההודעה:\n${errorMessage}`,
        sender: "ai",
        timestamp: new Date().toISOString(),
        isError: true,
      };
      
      const finalMessages = [...newMessages, errorResponseMessage];
      setMessages(finalMessages);
      saveChatData(finalMessages, chatId);
      setError(errorMessage);
    }

    setIsLoading(false);
  };

  const retryLastMessage = () => {
    if (messages.length > 0) {
        const lastUserMessageIndex = messages.findLastIndex(m => m.sender === 'user');
        if (lastUserMessageIndex !== -1) {
            const lastUserMessage = messages[lastUserMessageIndex];
            // Remove error message and resend user message
            setMessages(messages.slice(0, lastUserMessageIndex + 1));
            setRetryCount(prev => prev + 1);
            sendMessage(lastUserMessage.text);
        }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      sendMessage(inputMessage);
    }
  };

  const toggleMessageCollapse = (messageId) => {
    setCollapsedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const clearChat = () => {
    setMessages([]);
    setChatId(null);
    setError(null);
    localStorage.removeItem("aibi_messages");
    localStorage.removeItem("aibi_chat_id");
    setTimeout(() => {
      sendInitialGreeting();
    }, 500);
  };

  const renderMessage = (message) => {
    const isCollapsed = collapsedMessages.has(message.id);
    const isUser = message.sender === "user";

    return (
      <div
        key={message.id}
        className={`flex ${isUser ? "justify-end" : "justify-start"} mb-6`}
      >
        <div
          className={`max-w-[85%] lg:max-w-[80%] rounded-2xl px-4 py-3 shadow-md transition-all ${
            isUser
              ? "bg-blue-600 text-white"
              : message.isError
              ? "bg-red-100 text-red-800 border border-red-200"
              : "bg-white text-gray-800 border border-gray-200"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="chat-message whitespace-pre-wrap leading-relaxed">
                {isCollapsed ? `${message.text.substring(0, 80)}...` : message.text}
              </div>
              
              {!isCollapsed && !isUser && (
                <Visualization 
                    viz={message.viz}
                    data={message.data}
                    sql={message.sql}
                />
              )}
              
              {message.isError && !isCollapsed && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={retryLastMessage}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <Loader2 className="w-3 h-3 ml-1" />
                    נסה שנית
                  </Button>
                </div>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 w-6 p-0 hover:bg-black/10 shrink-0 rounded-full ${
                isUser ? "text-blue-200 hover:text-white" : "text-gray-500 hover:text-gray-800"
              }`}
              onClick={() => toggleMessageCollapse(message.id)}
            >
              {isCollapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </Button>
          </div>
          
          <div className="mt-3 text-xs opacity-60 flex items-center justify-between">
            <div>
              {new Date(message.timestamp).toLocaleTimeString("he-IL", {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
            {message.processingTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {(message.processingTime / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected": return "text-green-600";
      case "disconnected": return "text-red-600";
      default: return "text-yellow-600";
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case "connected": return <Wifi className="w-4 h-4" />;
      case "disconnected": return <WifiOff className="w-4 h-4" />;
      default: return <Loader2 className="w-4 h-4 animate-spin" />;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case "connected": return "מחובר";
      case "disconnected": return "מנותק";
      default: return "בודק חיבור...";
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="p-2 rounded-md hover:bg-gray-100 lg:hidden">
              <Menu className="w-5 h-5" />
            </SidebarTrigger>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">צ'אט ERP</h1>
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                <span>שיחה עם מערכת הבינה המלאכותית</span>
                {chatId && <span>• {chatId.substring(0, 12)}</span>}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Dialog open={showHistory} onOpenChange={setShowHistory}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <History className="w-4 h-4 ml-2" />
                  היסטוריה ({chatHistory.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl" dir="rtl">
                <DialogHeader>
                  <DialogTitle>היסטוריית שיחות</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                  {chatHistory.length > 0 ? (
                    chatHistory.map((historyItem) => (
                      <div key={historyItem.id} className="p-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer">
                        <div className="font-medium text-sm mb-1">שיחה #{historyItem.id.toString().substring(0, 8)}</div>
                        <p className="text-sm text-gray-600 line-clamp-2">{historyItem.lastMessage}</p>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(historyItem.timestamp).toLocaleString("he-IL")} • {historyItem.messageCount} הודעות
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">אין היסטוריית שיחות</div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            
            <Button variant="destructive" size="sm" onClick={clearChat}>
              <X className="w-4 h-4 ml-2" />
              שיחה חדשה
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-5xl mx-auto">
          {messages.map(renderMessage)}
          
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="max-w-[70%] rounded-2xl px-4 py-3 bg-white border border-gray-200">
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                  <span className="text-sm font-medium">AI חושב...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm border-t border-gray-200 p-4">
        <div className="max-w-5xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3 items-center">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="הקלד/י שאלה על נתוני ה-ERP שלך..."
              className="w-full text-right pr-4 py-3 text-base border-gray-300 rounded-full focus:border-teal-500 focus:ring-teal-500"
              disabled={isLoading}
              dir="rtl"
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={isLoading || !inputMessage.trim()}
              className="bg-teal-600 hover:bg-teal-700 rounded-full w-12 h-12 shrink-0"
            >
              <Send className="w-5 h-5" />
            </Button>
          </form>
           <div className="text-xs text-gray-500 mt-2 text-center">
            <span className={`mr-1 ${getConnectionStatusColor()}`}>
              {getConnectionStatusIcon()} {getConnectionStatusText()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}