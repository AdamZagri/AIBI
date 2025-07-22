// src/components/ChatBox.tsx
'use client';

import {
  Avatar,
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Spinner,
  Stack,
  Text,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
  List,
  ListItem,
  useToast,
  useDisclosure,
  Select,
  VStack,
  Divider,
  Flex,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  FormControl,
  FormLabel,
  Badge,
  Tooltip,
  Heading,
  useColorModeValue,
  SimpleGrid,
  Container,
} from '@chakra-ui/react';
import ClarifyDialog from './ClarifyDialog';
import MessageLog from './MessageLog';
import GuidelineImprovementPanel from './GuidelineImprovementPanel';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ViewIcon,
  SettingsIcon,
} from '@chakra-ui/icons';
import {
  FaDatabase,
  FaChartPie,
  FaChartBar,
  FaChartLine,
  FaRegDotCircle ,
  FaGripHorizontal,
  FaTable,
  FaRobot,
  FaFont,
} from 'react-icons/fa';
import { FiLogIn } from 'react-icons/fi';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, signIn } from 'next-auth/react';
import ChartRenderer from './ChartRenderer';
import { SERVER_BASE_URL, WS_BASE_URL } from '@/lib/config';
// Removed ChatHistoryModal import as it's no longer used in ChatBox

// Floating draggable button using framer-motion
const MotionIconButton = motion(IconButton);
const MotionStack = motion.create(Stack);

const canRender = (viz: string, d: any): boolean => {
  if (!d) return false;
  if (viz === 'table') return true;
  if (viz === 'pie') return Array.isArray(d) && d[0]?.value !== undefined;
  if (viz === 'groupbar') return Array.isArray(d) || (d.categories && d.series);
  if (viz === 'bar' || viz === 'line') return Array.isArray(d) && 'value' in d[0];
  return false;
};

const MemoChart = memo(
  ChartRenderer,
  (p, n) => p.viz === n.viz && JSON.stringify(p.data) === JSON.stringify(n.data),
);

export type MessageLogEntry = {
  time: string; // אפשר גם Date
  text: string;
  data?: string;
};

type Msg = {
  id: string | number;
  text: string;
  sender: 'user' | 'bot' | 'error';
  viz?: string;
  data?: any;
  sql?: string;
  log?: MessageLogEntry[];
  userQuestion?: string;
};
type Panels = { json?: boolean; sql?: boolean };
type VizMap = Record<string | number, string | undefined>;

export default function ChatBox() {
  const { data: session, status } = useSession();
  
  // All hooks must be declared before any conditional returns
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [openPanels, setOpenPanels] = useState<Record<string | number, Panels>>({});
  const [collapsed, setCollapsed] = useState<Record<string | number, boolean>>({});
  const [overrideViz, setOverrideViz] = useState<VizMap>({});
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Font settings states
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('inherit');
  
  // Color theme states
  const [userBgColor, setUserBgColor] = useState('blue.500');
  const [botBgColor, setBotBgColor] = useState('gray.50');
  const [currentChatId, setCurrentChatId] = useState<string>('');

  // Scroll to bottom functionality
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Font settings popover
  const {
    isOpen: isFontSettingsOpen,
    onOpen: openFontSettings,
    onClose: closeFontSettings,
  } = useDisclosure();

  // clarification dialog state
  const [clarifyReq, setClarifyReq] = useState<{ missing: { type: string; name: string }; options: string[] } | null>(null);

  const lastUserQueryRef = useRef<string>('');
  const didInit = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  const toast = useToast();
  
  // Load chat session function
  const loadChatSession = useCallback(async () => {
    setLoading(true);
    try {
      // בדיקה אם יש chat ID קיים
      const existingChatId = localStorage.getItem('currentChatId');
      
      if (existingChatId) {
        // טעינת היסטוריה מהשרת החדש
        console.log('Loading existing chat history for ID:', existingChatId);
        try {
          const historyResponse = await fetch(
            `${SERVER_BASE_URL}/api/chat/history/${existingChatId}`
          );
          
          if (historyResponse.ok) {
            const historyResult = await historyResponse.json();
            
            if (historyResult.success && historyResult.data.messages.length > 0) {
              console.log('Chat history loaded:', historyResult.data);
              
              // המרה של היסטוריה לפורמט של messages
              const convertedMessages = [];
              let messageId = 1;
              
              for (const historyMsg of historyResult.data.messages) {
                convertedMessages.push({
                  id: messageId++,
                  text: historyMsg.content,
                  sender: historyMsg.role === 'user' ? 'user' as const : 'bot' as const,
                  viz: historyMsg.viz_type,
                  data: historyMsg.data,
                  sql: historyMsg.sql_query,
                  log: []
                });
              }
              
              if (convertedMessages.length > 0) {
                setMessages(convertedMessages);
                setLoading(false);
                return; // יצאנו מהפונקציה - ההיסטוריה נטענה בהצלחה
              }
            }
          }
        } catch (historyError) {
          console.log('Failed to load chat history, starting fresh:', historyError);
        }
      }
      
      // אם לא הצלחנו לטעון היסטוריה או אין ID - מתחילים עם רשימה ריקה
      setMessages([]);
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // העבר את הפונקציה לתוך הקומפוננט
  const addStatusToMessage = useCallback((msgId: number, statusText: string, data?: string) => {
    setMessages((msgs) =>
      msgs.map((msg) =>
        msg.id === msgId
          ? {
              ...msg,
              log: [
                ...(msg.log || []),
                { time: new Date().toISOString(), text: statusText, data }
              ]
            }
          : msg
      )
    );
    }, []);
  
  // Save font settings callbacks
  const handleFontSizeChange = useCallback((value: number) => {
    setFontSize(value);
    try {
      localStorage.setItem('chatFontSize', value.toString());
    } catch (error) {
      console.error('Failed to save font size to localStorage:', error);
    }
  }, []);

  const handleFontFamilyChange = useCallback((value: string) => {
    setFontFamily(value);
    try {
      localStorage.setItem('chatFontFamily', value);
    } catch (error) {
      console.error('Failed to save font family to localStorage:', error);
    }
  }, []);

  const handleUserBgColorChange = useCallback((value: string) => {
    setUserBgColor(value);
    try {
      localStorage.setItem('chatUserBgColor', value);
    } catch (error) {
      console.error('Failed to save user background color to localStorage:', error);
    }
  }, []);

  const handleBotBgColorChange = useCallback((value: string) => {
    setBotBgColor(value);
    try {
      localStorage.setItem('chatBotBgColor', value);
    } catch (error) {
      console.error('Failed to save bot background color to localStorage:', error);
    }
  }, []);

  const handleSelect = useCallback(
    (label: string) => setInput((p) => (p ? `${p} ${label}` : label)),
    []
  );

  // Monitor chatId changes and reload chat history when it changes
  useEffect(() => {
    if (!isClient) return;
    
    const checkChatIdChange = () => {
      const newChatId = localStorage.getItem('currentChatId') || localStorage.getItem('chatId') || '';
      
      if (newChatId !== currentChatId) {
        console.log('Chat ID changed:', currentChatId, '->', newChatId);
        setCurrentChatId(newChatId);
        
        // Clear current messages and reload history
        setMessages([]);
        setLoading(true);
        
        // Load new chat history
        setTimeout(() => {
          loadChatSession();
        }, 100);
      }
    };
    
    // Initial check
    checkChatIdChange();
    
    // Listen for custom chatIdChanged event for immediate updates
    const handleChatIdChanged = (event: CustomEvent) => {
      console.log('Received chatIdChanged event:', event.detail);
      checkChatIdChange();
    };
    
    window.addEventListener('chatIdChanged', handleChatIdChanged as EventListener);
    
    // Listen for storage changes (when changed from other tabs or components)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'currentChatId' || e.key === 'chatId') {
        checkChatIdChange();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Check every 1 second for chatId changes (fallback)
    const interval = setInterval(checkChatIdChange, 1000);
    
    return () => {
      window.removeEventListener('chatIdChanged', handleChatIdChanged as EventListener);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [isClient, currentChatId, loadChatSession]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, loading]);



  // WebSocket and other initialization





  
  // העבר את הפונקציה לתוך הקומפוננט
  // ─── Chat history functions ─────────────────────────────────
  // Removed as per edit hint


  const msgCount = messages.length;

  // Monitor scroll position to show/hide scroll to bottom button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
      setShowScrollToBottom(!isNearBottom && messages.length > 0);
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial position

    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages.length]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    // 1. אתחול WebSocket תמיד
    try {
      if (!wsRef.current || wsRef.current.readyState > 1) {
        wsRef.current = new WebSocket(WS_BASE_URL);
        wsRef.current.onopen = () => {
          console.log('WebSocket connected');
          setWsStatus('connected');
        };
        wsRef.current.onclose = () => {
          console.log('WebSocket disconnected');
          setWsStatus('disconnected');
        };
        wsRef.current.onerror = (err) => {
          console.warn('WebSocket connection failed - this is normal if server is not available');
          setWsStatus('disconnected');
        };
        wsRef.current.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            console.log(msg);
            if (msg.statusText === 'clarification_request' && msg.data) {
              setClarifyReq(msg.data);
              setLoading(false);
            } else if (msg.type === 'status' && msg.messageId && msg.statusText) {
              toast({
                title: msg.statusText,
                duration: 1000,
                position: 'top-right',
                status: 'info',
                isClosable: false,
              });
              addStatusToMessage(
                msg.messageId,
                `${msg.statusText}${msg.elapsedMs !== undefined ? ` (${(msg.elapsedMs / 1000).toFixed(1)} seconds)` : ''}`,
                msg.data
              );
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message', e);
          }
        };
      }
    } catch (error) {
      console.warn('Failed to initialize WebSocket - this is normal if server is not available');
      setWsStatus('disconnected');
    }

    // 2. טעינת היסטוריה אם קיימת
    if (didInit.current) return;
    didInit.current = true;
    
    // Removed loadChatSession()

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [session]);

  // Client-side hydration fix
  useEffect(() => {
    setIsClient(true);
    
    // Load color preferences from localStorage
    try {
      const savedFontSize = localStorage.getItem('chatFontSize');
      const savedFontFamily = localStorage.getItem('chatFontFamily');
      const savedUserBgColor = localStorage.getItem('chatUserBgColor');
      const savedBotBgColor = localStorage.getItem('chatBotBgColor');
      
      if (savedFontSize) setFontSize(parseInt(savedFontSize));
      if (savedFontFamily) setFontFamily(savedFontFamily);
      if (savedUserBgColor) setUserBgColor(savedUserBgColor);
      if (savedBotBgColor) setBotBgColor(savedBotBgColor);
    } catch (error) {
      console.error('Failed to load preferences from localStorage:', error);
    }
  }, []);



  // Load chat session from localStorage when component mounts
  useEffect(() => {
    if (isClient) {
      // Load existing chat after a short delay to ensure localStorage is accessible
      setTimeout(() => {
        loadChatSession();
      }, 100);
    }
  }, [isClient, loadChatSession]);

  // Font options for the select dropdown
  const fontOptions = [
    { value: 'inherit', label: 'ברירת מחדל' },
    { value: 'Arial, sans-serif', label: 'Arial' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: 'Times New Roman, serif', label: 'Times New Roman' },
    { value: 'Courier New, monospace', label: 'Courier New' },
    { value: 'Verdana, sans-serif', label: 'Verdana' },
    { value: 'Tahoma, sans-serif', label: 'Tahoma' },
    { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
    { value: 'Impact, sans-serif', label: 'Impact' },
    { value: 'Comic Sans MS, cursive', label: 'Comic Sans MS' },
  ];

  // Color palette options
  const userColorOptions = [
    { value: 'blue.500', label: 'כחול', color: 'blue.500' },
    { value: 'teal.500', label: 'תכלת', color: 'teal.500' },
    { value: 'green.500', label: 'ירוק', color: 'green.500' },
    { value: 'purple.500', label: 'סגול', color: 'purple.500' },
    { value: 'pink.500', label: 'ורוד', color: 'pink.500' },
    { value: 'orange.500', label: 'כתום', color: 'orange.500' },
    { value: 'red.500', label: 'אדום', color: 'red.500' },
    { value: 'gray.600', label: 'אפור כהה', color: 'gray.600' },
    { value: 'cyan.500', label: 'ציאן', color: 'cyan.500' },
    { value: 'yellow.600', label: 'צהוב', color: 'yellow.600' },
    { value: 'indigo.500', label: 'אינדיגו', color: 'indigo.500' },
    { value: 'lime.500', label: 'ליים', color: 'lime.500' },
  ];

  const botColorOptions = [
    { value: 'gray.50', label: 'אפור בהיר', color: 'gray.50' },
    { value: 'blue.50', label: 'כחול בהיר', color: 'blue.50' },
    { value: 'teal.50', label: 'תכלת בהיר', color: 'teal.50' },
    { value: 'green.50', label: 'ירוק בהיר', color: 'green.50' },
    { value: 'purple.50', label: 'סגול בהיר', color: 'purple.50' },
    { value: 'pink.50', label: 'ורוד בהיר', color: 'pink.50' },
    { value: 'orange.50', label: 'כתום בהיר', color: 'orange.50' },
    { value: 'red.50', label: 'אדום בהיר', color: 'red.50' },
    { value: 'yellow.50', label: 'צהוב בהיר', color: 'yellow.50' },
    { value: 'cyan.50', label: 'ציאן בהיר', color: 'cyan.50' },
    { value: 'white', label: 'לבן', color: 'white' },
    { value: 'gray.100', label: 'אפור מאוד בהיר', color: 'gray.100' },
  ];

  // Preview colors for hover effect
  const [previewUserColor, setPreviewUserColor] = useState<string | null>(null);
  const [previewBotColor, setPreviewBotColor] = useState<string | null>(null);

  const send = async () => {
    if (!input.trim()) return;
    const ts = Date.now().toString();
    setMessages((m) => [...m, { id: ts, text: input, sender: 'user', log: [] }]);
    lastUserQueryRef.current = input;
    setInput('');
    setLoading(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'register', messageId: ts }));
      } catch (error) {
        console.warn('Failed to send WebSocket message:', error);
      }
    } else {
      console.warn('WebSocket not open, cannot register');
    }

    // Get user email from session - fallback to mock user
    const userEmail = session?.user?.email || 'adam@rotlein.co.il';
    console.log('💬 Sending message with userEmail:', userEmail);

    try {
      const r = await fetch(`${SERVER_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        },
        body: JSON.stringify({
          message: input,
          messageId: ts,
          userEmail: userEmail,
          chatId: localStorage.getItem('currentChatId') || localStorage.getItem('chatId') || undefined,
        }),
      });
      const headerChatId2 = r.headers.get('X-Chat-Id');
      const { reply, viz, data, sql, chatId: bodyChatId2 } = await r.json();
      const finalChatId2 = headerChatId2 || bodyChatId2;
      if (finalChatId2) {
        localStorage.setItem('chatId', finalChatId2);
        localStorage.setItem('currentChatId', finalChatId2);
      }
      setMessages((m) => [
        ...m,
        { id: ts + 1, text: reply, sender: 'bot', viz, data, sql, userQuestion: input },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: ts + 1, text: '⚠️ שגיאה בשרת', sender: 'error' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // פונקציה לשליחה מחדש של שאלה (לאחר הוספת הנחיה)
  const handleAskAgain = async (question: string) => {
    if (!question.trim()) return;
    
    // עדכון ה-input ושליחה
    setInput(question);
    
    // המתנה קצרה ואז שליחה אוטומטית
    setTimeout(async () => {
      const ts = Date.now().toString();
      setMessages((m) => [...m, { id: ts, text: question, sender: 'user', log: [] }]);
      lastUserQueryRef.current = question;
      setInput('');
      setLoading(true);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'register', messageId: ts }));
        } catch (error) {
          console.warn('Failed to send WebSocket message:', error);
        }
      }

      // Get user email from session - fallback to mock user
      const userEmail = session?.user?.email || 'adam@rotlein.co.il';

      try {
        const r = await fetch(`${SERVER_BASE_URL}/chat`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-email': userEmail
          },
          body: JSON.stringify({
            message: question,
            messageId: ts,
            userEmail: userEmail,
            chatId: localStorage.getItem('currentChatId') || localStorage.getItem('chatId') || undefined,
          }),
        });
        const headerChatId = r.headers.get('X-Chat-Id');
        const { reply, viz, data, sql, chatId: bodyChatId } = await r.json();
        const finalChatId = headerChatId || bodyChatId;
        if (finalChatId) {
          localStorage.setItem('chatId', finalChatId);
          localStorage.setItem('currentChatId', finalChatId);
        }
        setMessages((m) => [
          ...m,
          { id: ts + 1, text: reply, sender: 'bot', viz, data, sql, userQuestion: question },
        ]);
      } catch {
        setMessages((m) => [
          ...m,
          { id: ts + 1, text: '⚠️ שגיאה בשרת', sender: 'error' },
        ]);
      } finally {
        setLoading(false);
      }
    }, 100);
  };

  // clarification submit
  const handleClarifySubmit = async (selected: string) => {
    if (!clarifyReq) return;
    setClarifyReq(null);
    setLoading(true);

    // Get user email from session - fallback to mock user
    const userEmail = session?.user?.email || 'adam@rotlein.co.il';
    console.log('💬 Sending clarification with userEmail:', userEmail);

    try {
      const r = await fetch(`${SERVER_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        },
        body: JSON.stringify({
          chatId: localStorage.getItem('currentChatId') || localStorage.getItem('chatId'),
          message: lastUserQueryRef.current,
          userEmail: userEmail,
          clarification: {
            original: clarifyReq.missing.name,
            selected,
          },
        }),
      });
      const headerChatId3 = r.headers.get('X-Chat-Id');
      const { reply, viz, data, sql, messageId, chatId: bodyChatId3 } = await r.json();
      const finalChatId3 = headerChatId3 || bodyChatId3;
      if (finalChatId3) {
        localStorage.setItem('chatId', finalChatId3);
        localStorage.setItem('currentChatId', finalChatId3);
      }

      if (messageId && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'register', messageId }));
        } catch (error) {
          console.warn('Failed to send WebSocket message:', error);
        }
      }

      setMessages((m) => [
        ...m,
        { id: Date.now().toString(), text: reply, sender: 'bot', viz, data, sql },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: Date.now().toString(), text: '⚠️ שגיאה בשרת', sender: 'error' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const msgEls = useMemo(
    () => (
      <AnimatePresence mode="wait">
        {messages.map((m) => {
          const panels = openPanels[m.id] || {};
          const isCollapsed = collapsed[m.id];
          const currentViz = overrideViz[m.id] ?? m.viz;
          // Determine if there is *real* data to render. We treat as data only when:
          //   • An array with length > 0
          //   • An object that has a non-empty `rows` _or_ `data` array
          //   • Any other object that has at least one key whose value is not null/undefined/empty array
          const hasData = (() => {
            const d: any = m.data;
            if (!d) return false;

            // Simple array of objects/values
            if (Array.isArray(d)) return d.length > 0;

            // Tabular structures: { rows: [...], columns: [...] } or { data: [...] }
            if (Array.isArray(d.rows) && d.rows.length > 0) return true;
            if (Array.isArray(d.data) && d.data.length > 0) return true;

            // Fallback: any non-empty object that is not just { rows: [] } etc.
            return Object.keys(d).some((k) => {
              const v = d[k];
              return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined;
            });
          })();
          const showVizButtons = m.sender !== 'user' && hasData && !isCollapsed;

          const VIZ_BTNS = [
            { v: 'pie', icon: FaChartPie },
            { v: 'bar', icon: FaChartBar },
            { v: 'line', icon: FaChartLine },
            { v: 'kpi', icon: FaRegDotCircle },
            { v: 'groupbar', icon: FaGripHorizontal },
            { v: 'table', icon: FaTable },
          ];

          return (
            <HStack
              key={m.id}
              align={m.sender === 'user' ? 'flex-end' : 'flex-start'}
              justify={m.sender === 'user' ? 'flex-end' : 'flex-start'}
              gap={2}
              as={motion.div}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: "0.25s" }}
            >
              {m.sender !== 'user' && (
                <Box
                  w="32px"
                  h="32px"
                  borderRadius="full"
                  bg="teal.500"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <FaRobot color="white" />
                </Box>
              )}
              
              {m.sender === 'user' ? (
                <Box
                  position="relative"
                  bg={previewUserColor || userBgColor}
                  color="white"
                  px={4}
                  py={3}
                  borderRadius="20px 0 20px 20px"
                  boxShadow="sm"
                  maxW="75%"
                  dir="rtl"
                >
                  <HStack justify="flex-end" spacing={1} mb={1}>
                    <IconButton
                      aria-label="הקטן/הרחב"
                      icon={isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                      size="sm"
                      variant="ghost"
                      color="white"
                      onClick={() =>
                        setCollapsed((c) => ({ ...c, [m.id]: !isCollapsed }))
                      }
                    />
                    <MessageLog log={m.log} />
                  </HStack>
                  {!isCollapsed ? (
                    <Text 
                      fontSize={`${fontSize}px`} 
                      fontFamily={fontFamily} 
                      whiteSpace="pre-wrap" 
                      mt={2}
                    >
                      {m.text}
                    </Text>
                  ) : (
                    <Text
                      fontSize={`${fontSize - 2}px`}
                      fontFamily={fontFamily}
                      whiteSpace="nowrap"
                      overflow="hidden"
                      textOverflow="ellipsis"
                      maxW="200px"
                      mt={2}
                    >
                      {m.text}
                    </Text>
                  )}
                </Box>
              ) : (
                <Box
                  position="relative"
                  bg={m.sender === 'error' ? 'red.400' : (previewBotColor || botBgColor)}
                  color="gray.700"
                  px={4}
                  py={isCollapsed ? 1 : 3}
                  borderRadius="0 20px 20px 20px"
                  boxShadow="sm"
                  maxW="75%"
                  resize={isCollapsed ? 'none' : 'both'}
                  overflow="auto"
                  height={isCollapsed ? 'auto' : undefined}
                >
                  <IconButton
                    aria-label="collapse"
                    icon={isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                    size="sm"
                    variant="ghost"
                    position="absolute"
                    left="6px"
                    top="4px"
                    onClick={() =>
                      setCollapsed((c) => ({ ...c, [m.id]: !isCollapsed }))
                    }
                  />
                  {hasData && (
                    <IconButton
                      aria-label="json"
                      icon={<ViewIcon />}
                      size="sm"
                      variant="ghost"
                      position="absolute"
                      left="36px"
                      top="4px"
                      onClick={() =>
                        setOpenPanels((s) => ({
                          ...s,
                          [m.id]: { ...panels, json: !panels.json },
                        }))
                      }
                    />
                  )}
                  {m.sql && (
                    <IconButton
                      aria-label="sql"
                      icon={<FaDatabase />}
                      size="sm"
                      variant="ghost"
                      position="absolute"
                      left="72px"
                      top="4px"
                      onClick={() =>
                        setOpenPanels((s) => ({
                          ...s,
                          [m.id]: { ...panels, sql: !panels.sql },
                        }))
                      }
                    />
                  )}
                  <Box pt={isCollapsed ? 0 : (showVizButtons || m.sql || hasData ? '44px' : 0)}>
                    {!isCollapsed ? (
                      <>
                        <Text 
                          fontSize={`${fontSize}px`} 
                          fontFamily={fontFamily} 
                          whiteSpace="pre-wrap" 
                          mb={1}
                        >
                          {m.text}
                        </Text>
                        {hasData && (
                          <MemoChart
                            viz={currentViz}
                            data={m.data}
                            sql={m.sql}
                            onSelect={handleSelect}
                          />
                        )}
                        
                        {/* כפתור שיפור הנחיות */}
                        <GuidelineImprovementPanel 
                          messageId={String(m.id)}
                          userQuestion={m.userQuestion || ''}
                          sqlResponse={m.sql}
                          botResponse={m.text}
                          onAskAgain={handleAskAgain}
                        />
                      </>
                    ) : (
                      <Text
                        fontSize={`${fontSize - 2}px`}
                        fontFamily={fontFamily}
                        whiteSpace="nowrap"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        maxW="200px"
                      >
                        {m.text}
                      </Text>
                    )}
                  </Box>
                </Box>
              )}
              {!isCollapsed && (
                <>
                  {panels.json && (
                    <Box
                      bg="gray.900"
                      color="green.100"
                      p={3}
                      fontSize="xs"
                      fontFamily="Menlo,consolas,monospace"
                      borderRadius="md"
                      maxW="25%"
                      overflowY="auto"
                      whiteSpace="pre-wrap"
                      dir="ltr"
                    >
                      {JSON.stringify({ viz: m.viz, data: m.data }, null, 2)}
                    </Box>
                  )}
                  {panels.sql && (
                    <Box
                      bg="gray.800"
                      color="yellow.100"
                      p={3}
                      fontSize="xs"
                      fontFamily="Menlo,consolas,monospace"
                      borderRadius="md"
                      maxW="25%"
                      overflowY="auto"
                      whiteSpace="pre-wrap"
                      dir="ltr"
                    >
                      {m.sql}
                    </Box>
                  )}
                </>
              )}
            </HStack>
          );
        })}
      </AnimatePresence>
    ),
    [messages, openPanels, collapsed, overrideViz, handleSelect, fontSize, fontFamily, userBgColor, botBgColor, previewUserColor, previewBotColor]
  );

  // Check authentication status
  if (status === 'loading') return <Spinner />;
  
  if (status === 'unauthenticated' || !session) {
    return (
      <Box p={8} textAlign="center">
        <Text fontSize="xl">יש להתחבר כדי להשתמש בצ'אט</Text>
      </Box>
    );
  }

  // מכאן והלאה אנחנו יודעים ש-session קיים ומכיל את נתוני המשתמש

  return (
    <Box flex="1" display="flex" flexDir="column" minH="0">
      {/* Font Settings - Just the A button */}
      <Box
        position="absolute"
        top={2}
        right={2}
        zIndex={30}
      >
        <Popover 
          isOpen={isFontSettingsOpen} 
          onOpen={openFontSettings} 
          onClose={closeFontSettings}
          placement="bottom-end"
        >
          <PopoverTrigger>
            <IconButton
              aria-label="הגדרות פונט"
              icon={<Text fontSize="xs" fontWeight="bold">A</Text>}
              size="xs"
              variant="ghost"
              colorScheme="gray"
              h={6}
              w={6}
              bg="white"
              border="1px solid"
              borderColor="gray.300"
              borderRadius="full"
              _hover={{ bg: "gray.50" }}
            />
          </PopoverTrigger>
          <PopoverContent>
            <PopoverArrow />
            <PopoverCloseButton />
            <PopoverBody>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel fontSize="sm">גודל פונט</FormLabel>
                  <NumberInput
                    value={fontSize}
                    onChange={(_, value) => handleFontSizeChange(value)}
                    min={10}
                    max={24}
                    step={1}
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                
                <FormControl>
                  <FormLabel fontSize="sm">סוג פונט</FormLabel>
                  <Select
                    value={fontFamily}
                    onChange={(e) => handleFontFamilyChange(e.target.value)}
                    size="sm"
                  >
                    {fontOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                
                <Divider />
                
                <FormControl>
                  <FormLabel fontSize="sm">צבע הודעות משתמש</FormLabel>
                  <SimpleGrid columns={4} spacing={2}>
                    {userColorOptions.map((option) => (
                      <Tooltip key={option.value} label={option.label}>
                        <Box
                          w="32px"
                          h="32px"
                          bg={option.color}
                          borderRadius="md"
                          cursor="pointer"
                          border={userBgColor === option.value ? "3px solid" : "1px solid"}
                          borderColor={userBgColor === option.value ? "gray.800" : "gray.200"}
                          _hover={{ 
                            transform: "scale(1.1)", 
                            borderColor: "gray.500",
                            boxShadow: "md" 
                          }}
                          transition="all 0.2s"
                          onClick={() => handleUserBgColorChange(option.value)}
                          onMouseEnter={() => setPreviewUserColor(option.value)}
                          onMouseLeave={() => setPreviewUserColor(null)}
                        />
                      </Tooltip>
                    ))}
                  </SimpleGrid>
                </FormControl>
                
                <FormControl>
                  <FormLabel fontSize="sm">צבע הודעות בוט</FormLabel>
                  <SimpleGrid columns={4} spacing={2}>
                    {botColorOptions.map((option) => (
                      <Tooltip key={option.value} label={option.label}>
                        <Box
                          w="32px"
                          h="32px"
                          bg={option.color}
                          borderRadius="md"
                          cursor="pointer"
                          border={botBgColor === option.value ? "3px solid" : "1px solid"}
                          borderColor={botBgColor === option.value ? "gray.800" : "gray.200"}
                          _hover={{ 
                            transform: "scale(1.1)", 
                            borderColor: "gray.500",
                            boxShadow: "md" 
                          }}
                          transition="all 0.2s"
                          onClick={() => handleBotBgColorChange(option.value)}
                          onMouseEnter={() => setPreviewBotColor(option.value)}
                          onMouseLeave={() => setPreviewBotColor(null)}
                        />
                      </Tooltip>
                    ))}
                  </SimpleGrid>
                </FormControl>
                
                <Text fontSize="xs" color="gray.600" mb={2}>
                  תצוגה מקדימה:
                </Text>
                <VStack spacing={2} align="stretch">
                  <Box
                    bg={previewUserColor || userBgColor}
                    color="white"
                    p={2}
                    borderRadius="20px 0 20px 20px"
                    fontSize={`${fontSize}px`}
                    fontFamily={fontFamily}
                    dir="rtl"
                    textAlign="right"
                    boxShadow="sm"
                  >
                    זהו טקסט לדוגמה מהמשתמש
                  </Box>
                  <Box
                    bg={previewBotColor || botBgColor}
                    color="gray.700"
                    p={2}
                    borderRadius="0 20px 20px 20px"
                    fontSize={`${fontSize}px`}
                    fontFamily={fontFamily}
                    dir="rtl"
                    textAlign="right"
                    boxShadow="sm"
                  >
                    זהו טקסט לדוגמה מהבוט
                  </Box>
                </VStack>
              </VStack>
            </PopoverBody>
          </PopoverContent>
        </Popover>
      </Box>

      <MotionStack
        ref={messagesContainerRef}
        flex="1"
        spacing={3}
        overflowY="auto"
        position="relative"
        sx={{
          scrollbarGutter: 'stable',
          '&::-webkit-scrollbar': { width: '8px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '4px',
          },
        }}
        pl={1}
        pb="76px"
      >
        {msgEls}
        {loading && <Spinner alignSelf="center" />}
        <ClarifyDialog
          isOpen={!!clarifyReq}
          onClose={() => setClarifyReq(null)}
          missing={clarifyReq?.missing || null}
          options={clarifyReq?.options || []}
          onSubmit={handleClarifySubmit}
        />
        <div ref={messagesEndRef} />
        
        {/* Scroll to bottom button */}
        {showScrollToBottom && (
          <IconButton
            aria-label="חזור לתחתית"
            icon={<ChevronDownIcon />}
            position="absolute"
            bottom="20px"
            right="20px"
            colorScheme="blue"
            size="lg"
            borderRadius="full"
            boxShadow="lg"
            onClick={scrollToBottom}
            zIndex={10}
          />
        )}
      </MotionStack>

      <Box
        position="fixed"
        bottom="0"
        right="280px"  // מותאם לרוחב התפריט ב-AppShell
        left="0"
        bg="gray.50"
        borderTop="1px solid"
        borderColor="gray.200"
        zIndex={20}
      >
        <HStack p={3}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="הקלד…"
            bg="white"
            fontSize={`${fontSize}px`}
            fontFamily={fontFamily}
          />
          <Button
            onClick={send}
            isDisabled={!input.trim() || loading}
            colorScheme="brand"
            borderRadius="full"
          >
            שלח
          </Button>
        </HStack>
      </Box>
    </Box>
  );
}
