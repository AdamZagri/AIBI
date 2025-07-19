// pages/chat.tsx
import { useState, useEffect, useMemo } from 'react'
import { useSession, getSession } from 'next-auth/react'
import { GetServerSideProps } from 'next'
import { 
  Box, 
  VStack, 
  Text, 
  useColorModeValue,
  Heading,
  Container,
  Spinner,
  Center,
  HStack,
  IconButton,
  Tooltip,
  Badge,
  Button
} from '@chakra-ui/react'
import { FiMessageSquare, FiRefreshCw, FiSettings, FiPlus, FiWifi, FiWifiOff } from 'react-icons/fi'
import ChatBox from '@/components/ChatBox'
import SessionsModal from '@/components/SessionsModal'

export default function ChatPage() {
  const { data: session, status } = useSession()
  const [isClient, setIsClient] = useState(false)
  const [chatId, setChatId] = useState<string>('')
  const [chatKey, setChatKey] = useState(0) // Force re-render when chat changes
  const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [isChecking, setIsChecking] = useState(false)
  
  // Sessions management
  const [userSessions, setUserSessions] = useState<any[]>([])
  const [sessionsCount, setSessionsCount] = useState(0)
  const [isSessionsOpen, setIsSessionsOpen] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  
  // Theme colors
  const textColor = useColorModeValue('gray.800', 'white')
  const mutedColor = useColorModeValue('gray.600', 'gray.400')

  // Generate or load chat ID - only generate new if specifically requested
  useEffect(() => {
    if (isClient) {
      const storedChatId = localStorage.getItem('currentChatId')
      if (storedChatId) {
        setChatId(storedChatId)
        
        // Dispatch custom event to notify ChatBox immediately
        window.dispatchEvent(new CustomEvent('chatIdChanged', { detail: storedChatId }))
        
        console.log('Loaded existing chat ID:', storedChatId)
      } else {
        // Try to create a new chat session via API
        const createNewChatSession = async () => {
          try {
            const userEmail = session?.user?.email
            const userName = session?.user?.name
            
            if (userEmail) {
              const response = await fetch('https://aibi.cloudline.co.il/api/chat/new', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userEmail, userName })
              })
              
              const result = await response.json()
              
              if (result.success) {
                const newChatId = result.data.chatId
                setChatId(newChatId)
                localStorage.setItem('currentChatId', newChatId)
                localStorage.setItem('chatId', newChatId)
                
                // Dispatch custom event to notify ChatBox immediately
                window.dispatchEvent(new CustomEvent('chatIdChanged', { detail: newChatId }))
                
                console.log('New chat session created:', newChatId)
                return
              }
            }
          } catch (error) {
            console.error('Failed to create new chat session:', error)
          }
          
          // Fallback to local generation
          const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          setChatId(newChatId)
          localStorage.setItem('currentChatId', newChatId)
          localStorage.setItem('chatId', newChatId)
          
          // Dispatch custom event to notify ChatBox immediately
          window.dispatchEvent(new CustomEvent('chatIdChanged', { detail: newChatId }))
          
          console.log('Fallback chat ID created:', newChatId)
        }
        
        createNewChatSession()
      }
    }
  }, [isClient, session?.user?.email, session?.user?.name])

  // Server health check with exponential backoff
  const [failedChecks, setFailedChecks] = useState(0)
  const [lastErrorLogged, setLastErrorLogged] = useState(0)
  const [nextCheckTime, setNextCheckTime] = useState(0)
  const [tooltipUpdateTrigger, setTooltipUpdateTrigger] = useState(0)
  
  const checkServerHealth = async () => {
    if (isChecking) return
    
    setIsChecking(true)
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch('https://aibi.cloudline.co.il/health', {
        method: 'GET',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const wasDisconnected = serverStatus === 'disconnected';
        setServerStatus('connected')
        setFailedChecks(0) // Reset failed count on success
        setLastErrorLogged(0) // Reset error logging throttle
        
        // Log reconnection if server was previously disconnected
        if (wasDisconnected && failedChecks > 0) {
          console.log('✅ Server reconnected after being down')
        }
      } else {
        setServerStatus('disconnected')
        setFailedChecks(prev => prev + 1)
      }
    } catch (error) {
      // Only log errors occasionally to avoid spam
      const now = Date.now()
      const shouldLog = now - lastErrorLogged > 60000 // Log at most once per minute
      
      if (shouldLog) {
        setLastErrorLogged(now)
        
        // Handle different types of errors appropriately
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            // Timeout or abort - this is normal when server is down
            console.log('Server health check timed out - server appears to be down')
          } else if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
            // Network error - server is likely down
            console.log('Network error connecting to server - server appears to be down')
          } else if (error.message.includes('CORS')) {
            // CORS error - server might be running but misconfigured
            console.log('CORS error - server configuration issue')
          } else if (error.message.includes('DNS') || error.message.includes('ENOTFOUND')) {
            // DNS resolution error
            console.log('DNS resolution error - server domain not found')
          } else if (error.message.includes('ECONNREFUSED')) {
            // Connection refused - server is down
            console.log('Connection refused - server is down')
          } else {
            // Other errors
            console.log('Server health check failed:', error.message)
          }
        } else {
          console.log('Unknown error during health check:', error)
        }
      }
      
      setServerStatus('disconnected')
      setFailedChecks(prev => prev + 1)
    } finally {
      setIsChecking(false)
    }
  }

  // Periodic health check with smart intervals
  useEffect(() => {
    checkServerHealth() // Initial check
    
    const getCheckInterval = () => {
      if (failedChecks === 0) return 10000 // 10 seconds when healthy
      if (failedChecks < 3) return 20000    // 20 seconds after few failures
      if (failedChecks < 10) return 60000   // 1 minute after many failures
      return 300000 // 5 minutes when consistently failing
    }
    
    const scheduleNextCheck = () => {
      const interval = getCheckInterval()
      const nextTime = Date.now() + interval
      setNextCheckTime(nextTime)
      
      console.log(`Next health check in ${interval/1000} seconds (failed checks: ${failedChecks})`)
      return setTimeout(() => {
        checkServerHealth()
        scheduleNextCheck()
      }, interval)
    }
    
    const timeoutId = scheduleNextCheck()
    return () => clearTimeout(timeoutId)
  }, [failedChecks])

  // Update tooltip countdown when server is disconnected
  useEffect(() => {
    if (serverStatus === 'disconnected' && nextCheckTime > 0) {
      const interval = setInterval(() => {
        setTooltipUpdateTrigger(prev => prev + 1)
      }, 1000)
      
      return () => clearInterval(interval)
    }
  }, [serverStatus, nextCheckTime])

  // Fix hydration issues
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Load user sessions count
  const loadUserSessions = async () => {
    if (!session?.user?.email) return
    
    setSessionsLoading(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch(`https://aibi.cloudline.co.il/api/chat/sessions?userEmail=${encodeURIComponent(session.user.email)}`, {
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success) {
        setUserSessions(result.data || [])
        setSessionsCount(result.data?.length || 0)
        localStorage.setItem('chatSessionsCount', (result.data?.length || 0).toString())
      } else {
        console.error('Failed to load user sessions:', result.error)
        // Set default values on error
        setUserSessions([])
        setSessionsCount(0)
        localStorage.setItem('chatSessionsCount', '0')
      }
    } catch (error) {
      console.log('Failed to load user sessions:', error)
      // Handle network errors gracefully
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log('User sessions request timed out - server appears to be down')
        } else if (error.message.includes('fetch')) {
          console.log('Network error loading user sessions - server appears to be down')
        } else {
          console.log('Error loading user sessions:', error.message)
        }
      }
      // Set default values on error
      setUserSessions([])
      setSessionsCount(0)
      localStorage.setItem('chatSessionsCount', '0')
    } finally {
      setSessionsLoading(false)
    }
  }

  // Load sessions on mount
  useEffect(() => {
    if (isClient && session?.user?.email) {
      loadUserSessions()
    }
  }, [isClient, session?.user?.email])

  const handleNewChat = async () => {
    try {
      const userEmail = session?.user?.email;
      const userName = session?.user?.name;
      
      const response = await fetch('https://aibi.cloudline.co.il/api/chat/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail, userName })
      });
      
      const result = await response.json();
      
      if (result.success) {
        const newChatId = result.data.chatId;
        setChatId(newChatId);
        localStorage.setItem('currentChatId', newChatId);
        localStorage.setItem('chatId', newChatId);
        
        // Dispatch custom event to notify ChatBox immediately
        window.dispatchEvent(new CustomEvent('chatIdChanged', { detail: newChatId }));
        
        // No need to reload - the ChatBox will update automatically
        console.log('New chat created:', newChatId);
      } else {
        console.error('Failed to create new chat:', result.error);
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
      // Fallback to the old method
      const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setChatId(newChatId);
      localStorage.setItem('currentChatId', newChatId);
      localStorage.setItem('chatId', newChatId);
      
      // Dispatch custom event to notify ChatBox immediately
      window.dispatchEvent(new CustomEvent('chatIdChanged', { detail: newChatId }));
      
      console.log('Fallback chat created:', newChatId);
    }
  }

  // Listen for header events
  useEffect(() => {
    const handleOpenChatHistoryEvent = () => {
      setIsSessionsOpen(true)
    }
    
    const handleNewChatEvent = () => {
      handleNewChat()
    }
    
    window.addEventListener('openChatHistory', handleOpenChatHistoryEvent)
    window.addEventListener('newChat', handleNewChatEvent)
    
    return () => {
      window.removeEventListener('openChatHistory', handleOpenChatHistoryEvent)
      window.removeEventListener('newChat', handleNewChatEvent)
    }
  }, [handleNewChat])

  // Error recovery mechanism for hydration issues
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.message?.includes('Text content does not match server-rendered HTML') ||
          event.error?.message?.includes('hydration')) {
        console.log('🔄 Hydration error detected, attempting recovery...')
        
        // Clear potentially problematic data
        localStorage.removeItem('currentChatId')
        localStorage.removeItem('chatId')
        localStorage.removeItem('chatSessionsCount')
        
        // Generate new chat ID
        const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        localStorage.setItem('currentChatId', newChatId)
        localStorage.setItem('chatId', newChatId)
        setChatId(newChatId)
        
        console.log('🔄 Recovery completed, new chat ID:', newChatId)
      }
    }
    
    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])

  const getServerStatusIcon = useMemo(() => {
    // Show spinner only when actively checking
    if (isChecking) {
      return <Spinner size="xs" />
    }
    
    // Show icon based on server status
    switch (serverStatus) {
      case 'connected':
        return <FiWifi color="green" />
      case 'disconnected':
        return <FiWifiOff color="red" />
      case 'checking':
        return <Spinner size="xs" />
      default:
        return <FiWifiOff color="orange" />
    }
  }, [isChecking, serverStatus])

  const getServerStatusText = () => {
    if (isChecking) return 'בודק חיבור...'
    switch (serverStatus) {
      case 'connected':
        return 'מחובר'
      case 'disconnected':
        if (failedChecks === 1) return 'מנותק'
        if (failedChecks < 3) return 'מנותק (מנסה שוב)'
        if (failedChecks < 10) return 'מנותק (שרת לא זמין)'
        return 'מנותק (שרת כבוי)'
      default:
        return 'בודק...'
    }
  }

  const getServerStatusColor = () => {
    switch (serverStatus) {
      case 'connected':
        return 'green'
      case 'disconnected':
        return 'red'
      default:
        return 'orange'
    }
  }

  const getServerStatusTooltip = useMemo(() => {
    const baseText = `שרת: ${getServerStatusText()}${failedChecks > 0 ? ` (${failedChecks} כשלונות)` : ''}`;
    
    if (serverStatus === 'disconnected' && nextCheckTime > 0) {
      const timeUntilNext = Math.max(0, nextCheckTime - Date.now());
      const secondsUntilNext = Math.ceil(timeUntilNext / 1000);
      
      if (secondsUntilNext > 0) {
        return `${baseText} - בדיקה הבאה בעוד ${secondsUntilNext} שניות`;
      }
    }
    
    return baseText;
  }, [serverStatus, failedChecks, nextCheckTime, tooltipUpdateTrigger]);

  if (!isClient) {
    return (
      <Center h="50vh">
        <Spinner size="xl" />
      </Center>
    )
  }

  // Show loading while session is loading
  if (status === 'loading') {
    return (
      <Center h="50vh">
        <VStack spacing={4}>
          <Spinner size="xl" />
          <Text>טוען...</Text>
        </VStack>
      </Center>
    )
  }

  return (
    <Box>
      {/* Chat Header - Fixed and Full Width */}
      <Box
        position="fixed"
        top={0}
        right={{ base: "0", md: "280px" }}
        width={{ base: "100%", md: "calc(100% - 280px)" }}
        bg={useColorModeValue('white', 'gray.800')}
        borderBottom="1px"
        borderColor={useColorModeValue('gray.200', 'gray.600')}
        zIndex={1000}
        p={4}
        minH="72px"
        display="flex"
        alignItems="center"
      >
        <HStack justify="space-between" align="center" w="100%">
          <VStack align="start" spacing={0}>
            <Heading size="md" color={textColor} fontWeight="bold">
              צ'אט ERP
            </Heading>
          </VStack>
          
          <HStack spacing={3}>
            {/* Chat ID Display */}
            <Tooltip label="Chat ID - לחץ להעתקה">
              <Text 
                fontSize="xs" 
                fontFamily="mono" 
                color={mutedColor}
                cursor="pointer"
                onClick={() => {
                  if (chatId) {
                    navigator.clipboard.writeText(chatId);
                  }
                }}
                _hover={{ color: 'blue.500' }}
              >
                ID: {isClient && chatId ? 
                  chatId.substring(0, 8) + '...' : 'N/A'}
              </Text>
            </Tooltip>
            
            {/* Server Status */}
            <Tooltip label={getServerStatusTooltip}>
              <HStack spacing={2}>
                {getServerStatusIcon}
                <Text fontSize="xs" color={mutedColor}>
                  {getServerStatusText()}
                </Text>
              </HStack>
            </Tooltip>
            
            {/* History Button */}
            <Tooltip label="שיחות קודמות">
              <Button
                leftIcon={<FiMessageSquare />}
                colorScheme="purple"
                size="sm"
                onClick={() => setIsSessionsOpen(true)}
              >
                שיחות קודמות
                <Badge ml={2} colorScheme="purple" fontSize="xs">
                  {sessionsCount}
                </Badge>
              </Button>
            </Tooltip>
            
            {/* New Chat Button */}
            <Tooltip label="התחל שיחה חדשה">
              <Button
                leftIcon={<FiPlus />}
                colorScheme="blue"
                size="sm"
                onClick={handleNewChat}
              >
                שיחה חדשה
              </Button>
            </Tooltip>
            
            {/* Refresh Button */}
            <Tooltip label="רענן שיחות">
              <IconButton
                icon={<FiRefreshCw />}
                variant="outline"
                size="sm"
                aria-label="רענן שיחות"
                onClick={loadUserSessions}
                isLoading={sessionsLoading}
              />
            </Tooltip>
            
            {/* Settings */}
            <Tooltip label="הגדרות">
              <IconButton
                icon={<FiSettings />}
                variant="outline"
                size="sm"
                aria-label="הגדרות"
                onClick={() => console.log('Settings clicked')}
              />
            </Tooltip>
          </HStack>
        </HStack>
      </Box>

      {/* Chat Content with Top Margin */}
      <Box 
        pt="84px" 
        px={6} 
        maxW="container.xl" 
        mx="auto"
      >
        <ChatBox />
      </Box>

      {/* Sessions Modal */}
      <SessionsModal
        isOpen={isSessionsOpen}
        onClose={() => setIsSessionsOpen(false)}
        sessions={userSessions}
        loading={sessionsLoading}
        onRefresh={loadUserSessions}
        onSelectSession={(sessionId) => {
          setChatId(sessionId)
          localStorage.setItem('currentChatId', sessionId)
          localStorage.setItem('chatId', sessionId)
          setChatKey(prev => prev + 1) // Force ChatBox to re-render
          setIsSessionsOpen(false)
          
          // Dispatch custom event to notify ChatBox immediately
          window.dispatchEvent(new CustomEvent('chatIdChanged', { detail: sessionId }))
          
          // No need to reload - ChatBox will detect the change and load the new chat
          console.log('Selected chat session:', sessionId)
        }}
        onCreateNew={handleNewChat}
      />
    </Box>
  )
}

// Server-side props for session
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context)
  
  return {
    props: {
      session,
    },
  }
} 