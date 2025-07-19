// pages/index.tsx
import { useState, useEffect } from 'react'
import { useSession, signIn, getSession } from 'next-auth/react'
import { GetServerSideProps } from 'next'
import { 
  Box, 
  VStack, 
  HStack, 
  Text, 
  Button, 
  useColorModeValue,
  Container,
  Heading,
  Card,
  CardBody,
  Divider,
  Spinner,
  Center
} from '@chakra-ui/react'
import { FiMessageSquare, FiLogIn, FiTrendingUp, FiBarChart, FiSettings } from 'react-icons/fi'
import Link from 'next/link'

export default function HomePage() {
  const { data: session, status } = useSession()
  const [isClient, setIsClient] = useState(false)
  const [isAutoSigningIn, setIsAutoSigningIn] = useState(false)
  
  // Theme colors
  const bgColor = useColorModeValue('gray.50', 'gray.900')
  const cardBg = useColorModeValue('white', 'gray.800')
  const textColor = useColorModeValue('gray.800', 'white')
  const mutedColor = useColorModeValue('gray.600', 'gray.400')

  // Fix hydration issues
  useEffect(() => {
    setIsClient(true)
  }, [])

  // הפניה אוטומטית לצ'אט אם המשתמש כבר מחובר
  useEffect(() => {
    console.log('🏠 HomePage useEffect triggered:', {
      isClient,
      status,
      isAutoSigningIn,
      currentUrl: typeof window !== 'undefined' ? window.location.href : 'SSR'
    });
    
    // אם המשתמש כבר מחובר, הפנה אותו לצ'אט
    if (isClient && status === 'authenticated' && !isAutoSigningIn) {
      console.log('🔄 User is authenticated, redirecting to chat...')
      window.location.href = '/chat'
    }
  }, [isClient, status, isAutoSigningIn])

  // פונקציה ידנית להתחברות
  const handleSignIn = () => {
    console.log('🔄 Manual signin triggered')
    setIsAutoSigningIn(true)
    signIn('auto-signin', { 
      callbackUrl: 'http://localhost:3000/chat',
      redirect: true 
    })
      .then((result) => {
        console.log('✅ Manual signin result:', result)
      })
      .catch((error) => {
        console.error('❌ Manual signin failed:', error)
        setIsAutoSigningIn(false)
      })
  }

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

  // Show auto-signin loading if not authenticated
  if (status === 'unauthenticated' || isAutoSigningIn) {
    return (
      <Container maxW="md" py={20}>
        <VStack spacing={8} textAlign="center">
          <VStack spacing={4}>
            <Heading size="xl" color={textColor}>
              ברוכים הבאים למערכת AI-BI
            </Heading>
            <Text fontSize="lg" color={mutedColor}>
              מערכת אנליטיקה חכמה לנתוני ERP
            </Text>
          </VStack>
          
          <VStack spacing={4}>
            <Spinner size="xl" color="blue.500" />
            <Text color={mutedColor}>
              מתחבר אוטומטי...
            </Text>
          </VStack>

          {/* כפתור כניסה ידנית */}
          <Button
            leftIcon={<FiLogIn />}
            colorScheme="blue"
            size="lg"
            onClick={handleSignIn}
            isLoading={isAutoSigningIn}
            loadingText="מתחבר..."
          >
            כניסה למערכת
          </Button>
        </VStack>
      </Container>
    )
  }

  // Main authenticated view
  return (
    <Box>
      {/* Welcome Section */}
      <VStack spacing={6} align="stretch" mb={8}>
        <VStack spacing={3} textAlign="center">
          <Heading size="xl" color={textColor}>
            שלום, {session?.user?.name || 'משתמש'}!
          </Heading>
          <Text fontSize="lg" color={mutedColor}>
            ברוכים הבאים למערכת האנליטיקה החכמה שלנו
          </Text>
        </VStack>

        {/* Quick Stats */}
        <HStack spacing={4} justify="center" flexWrap="wrap">
          <Card bg={cardBg} shadow="sm" minW="200px">
            <CardBody textAlign="center">
              <VStack spacing={2}>
                <Text fontSize="2xl" fontWeight="bold" color="blue.500">
                  24/7
                </Text>
                <Text fontSize="sm" color={mutedColor}>
                  זמינות המערכת
                </Text>
              </VStack>
            </CardBody>
          </Card>
          
          <Card bg={cardBg} shadow="sm" minW="200px">
            <CardBody textAlign="center">
              <VStack spacing={2}>
                <Text fontSize="2xl" fontWeight="bold" color="green.500">
                  95%
                </Text>
                <Text fontSize="sm" color={mutedColor}>
                  דיוק תובנות
                </Text>
              </VStack>
            </CardBody>
          </Card>
          
          <Card bg={cardBg} shadow="sm" minW="200px">
            <CardBody textAlign="center">
              <VStack spacing={2}>
                <Text fontSize="2xl" fontWeight="bold" color="purple.500">
                  <FiMessageSquare />
                </Text>
                <Text fontSize="sm" color={mutedColor}>
                  צ'אט חכם
                </Text>
              </VStack>
            </CardBody>
          </Card>
        </HStack>
      </VStack>

      <Divider mb={8} />

      {/* Quick Actions */}
      <VStack spacing={4} align="stretch">
        <Heading size="lg" color={textColor}>
          פעולות מהירות
        </Heading>
        <Text color={mutedColor}>
          גש לתכונות המערכת השונות
        </Text>
        
        <HStack spacing={4} justify="center" flexWrap="wrap">
          <Button
            as={Link}
            href="/chat"
            leftIcon={<FiMessageSquare />}
            colorScheme="blue"
            size="lg"
            minW="200px"
          >
            צ'אט ERP
          </Button>
          
          <Button
            as={Link}
            href="/insights"
            leftIcon={<FiTrendingUp />}
            colorScheme="green"
            size="lg"
            minW="200px"
          >
            תובנות
          </Button>
          
          <Button
            as={Link}
            href="/dashboards"
            leftIcon={<FiBarChart />}
            colorScheme="purple"
            size="lg"
            minW="200px"
          >
            דשבורד
          </Button>
          
          <Button
            as={Link}
            href="/important"
            leftIcon={<FiSettings />}
            colorScheme="orange"
            size="lg"
            minW="200px"
          >
            הנחיות
          </Button>
        </HStack>
      </VStack>
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