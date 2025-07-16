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
} from '@chakra-ui/react';
import ClarifyDialog from './ClarifyDialog';
import MessageLog from './MessageLog';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ViewIcon,
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
  FaListUl,
} from 'react-icons/fa'; // FaListUl will serve as history icon
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import ChartRenderer from './ChartRenderer';
import ChatHistoryModal from './ChatHistoryModal';

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
};
type Panels = { json?: boolean; sql?: boolean };
type VizMap = Record<string | number, string | undefined>;

export default function ChatBox() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [openPanels, setOpenPanels] = useState<Record<string | number, Panels>>({});
  const [collapsed, setCollapsed] = useState<Record<string | number, boolean>>({});
  const [overrideViz, setOverrideViz] = useState<VizMap>({});
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // ─── Chat history modal state ────────────────────────────────
  const {
    isOpen: isHistOpen,
    onOpen: openHist,
    onClose: closeHist,
  } = useDisclosure();
  const [histData, setHistData] = useState<any>(null);
  const [histLoading, setHistLoading] = useState(false);

  // clarification dialog state
  const [clarifyReq, setClarifyReq] = useState<{ missing: { type: string; name: string }; options: string[] } | null>(null);

  const lastUserQueryRef = useRef<string>('');
  const didInit = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  const toast = useToast();

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

  const handleHistoryClick = useCallback(async () => {
    const chatId = localStorage.getItem('chatId');
    if (!chatId) {
      toast({
        title: 'אין מזהה שיחה להצגה',
        status: 'warning',
        duration: 1500,
      });
      return;
    }
    setHistLoading(true);
    openHist();
    try {
      const r = await fetch(
        `https://aibi.cloudline.co.il/chat-history?chatId=${chatId}`
      );
      const json = await r.json();
      console.log(json);
      setHistData(json);
    } catch (e) {
      console.error('Failed fetching chat history', e);
      toast({ title: 'שגיאה בשליפת היסטוריה', status: 'error', duration: 2000 });
    } finally {
      setHistLoading(false);
    }
  }, [toast, openHist]);

  const endRef = useRef<HTMLDivElement>(null);
  const msgCount = messages.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgCount, loading]);

  useEffect(() => {
    // 1. אתחול WebSocket תמיד
    try {
      if (!wsRef.current || wsRef.current.readyState > 1) {
        wsRef.current = new WebSocket('wss://aibi.cloudline.co.il');
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

    // 2. שליחת השאלה הראשונית - רק פעם אחת
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch('https://aibi.cloudline.co.il/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message:
              `שלום.. שמי ${session?.user?.name || session?.user?.email || 'משתמש'}, מנכ״ל החברה. אנא הצג את עצמך בקצרה ותן דוגמאות לשאלות.`,
          }),
        });
        const headerChatId = r.headers.get('X-Chat-Id');
        const { reply, viz, data, sql, chatId: bodyChatId } = await r.json();
        const finalChatId = headerChatId || bodyChatId;
        if (finalChatId) localStorage.setItem('chatId', finalChatId);
        setMessages([{ id: 1, text: reply, sender: 'bot', viz, data, sql }]);
      } catch (error) {
        console.error('Failed to initialize chat:', error);
        setMessages([{ id: 1, text: 'שגיאה בטעינת הצ\'אט. אנא נסה שוב מאוחר יותר.', sender: 'error' }]);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [session]);

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

    try {
      const r = await fetch('https://aibi.cloudline.co.il/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          messageId: ts, // <--- זה החלק החשוב!
          chatId: localStorage.getItem('chatId') || undefined,
        }),
      });
      const headerChatId2 = r.headers.get('X-Chat-Id');
      const { reply, viz, data, sql, chatId: bodyChatId2 } = await r.json();
      const finalChatId2 = headerChatId2 || bodyChatId2;
      if (finalChatId2) localStorage.setItem('chatId', finalChatId2);
      setMessages((m) => [
        ...m,
        { id: ts + 1, text: reply, sender: 'bot', viz, data, sql },
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

  // clarification submit
  const handleClarifySubmit = async (selected: string) => {
    if (!clarifyReq) return;
    setClarifyReq(null);
    setLoading(true);

    try {
      const r = await fetch('https://aibi.cloudline.co.il/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: localStorage.getItem('chatId'),
          message: lastUserQueryRef.current,
          clarification: {
            original: clarifyReq.missing.name,
            selected,
          },
        }),
      });
      const headerChatId3 = r.headers.get('X-Chat-Id');
      const { reply, viz, data, sql, messageId, chatId: bodyChatId3 } = await r.json();
      const finalChatId3 = headerChatId3 || bodyChatId3;
      if (finalChatId3) localStorage.setItem('chatId', finalChatId3);

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

  const handleSelect = useCallback(
    (label: string) => setInput((p) => (p ? `${p} ${label}` : label)),
    []
  );

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
                  bg="blue.600"
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
                    <Text fontSize="sm" whiteSpace="pre-wrap" mt={2}>
                      {m.text}
                    </Text>
                  ) : (
                    <Text
                      fontSize="sm"
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
                  bg={m.sender === 'error' ? 'red.400' : '#e3f3e6'}
                  color="gray.900"
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
                        <Text fontSize="sm" whiteSpace="pre-wrap" mb={1}>
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
                      </>
                    ) : (
                      <Text
                        fontSize="sm"
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
    [messages, openPanels, collapsed, overrideViz, handleSelect]
  );

  return (
    <Box flex="1" display="flex" flexDir="column" minH="0">
      <MotionStack
        flex="1"
        spacing={3}
        overflowY="auto"
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
        <div ref={endRef} />
      </MotionStack>

      <Box
        position="fixed"
        bottom="0"
        right={{ base: '70px', md: '240px' }}  // מותאם לרוחב התפריט
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
      {/* Floating draggable history button */}
      <MotionIconButton
        icon={<FaListUl />}
        aria-label="הצג היסטוריה"
        colorScheme="teal"
        size="lg"
        position="fixed"
        bottom="110px"
        right="20px"
        zIndex={40}
        borderRadius="full"
        drag
        dragMomentum={false}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleHistoryClick}
      />

      {/* Chat history modal */}
      <ChatHistoryModal
        isOpen={isHistOpen}
        onClose={closeHist}
        historyData={histData}
        loading={histLoading}
      />
    </Box>
  );
}
