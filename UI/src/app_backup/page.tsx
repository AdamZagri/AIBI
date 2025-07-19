'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
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
import { FiMessageSquare, FiLogIn } from 'react-icons/fi'
import ChatBox from '@/components/ChatBox'

export default function HomePage() {
  const { data: session, status } = useSession()
  const [isClient, setIsClient] = useState(false)
  
  // Theme colors
  const bgColor = useColorModeValue('gray.50', 'gray.900')
  const cardBg = useColorModeValue('white', 'gray.800')
  const textColor = useColorModeValue('gray.800', 'white')
  const mutedColor = useColorModeValue('gray.600', 'gray.400')

  // Fix hydration issues
  useEffect(() => {
    setIsClient(true)
  }, [])

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

  // Show login if not authenticated
  if (status === 'unauthenticated') {
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
          
          <Button
            leftIcon={<FiLogIn />}
            colorScheme="blue"
            size="lg"
            onClick={() => signIn()}
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

      {/* Chat Section */}
      <VStack spacing={4} align="stretch">
        <Heading size="lg" color={textColor}>
          צ'אט ERP
        </Heading>
        <Text color={mutedColor}>
          שאל שאלות על הנתונים שלך וקבל תשובות מיידיות עם ויזואליזציות
        </Text>
        
        <ChatBox />
      </VStack>
    </Box>
  )
}
