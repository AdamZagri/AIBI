// pages/dashboards.tsx
import { useState, useEffect } from 'react'
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
  Tooltip
} from '@chakra-ui/react'

export default function DashboardsPage() {
  const { data: session, status } = useSession()
  const [isClient, setIsClient] = useState(false)
  
  // Theme colors
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

  return (
    <VStack spacing={6} align="stretch">
      {/* Header with background */}
      <Box 
        bg={useColorModeValue('white', 'gray.800')} 
        borderRadius="lg" 
        p={4} 
        boxShadow="sm" 
        border="1px solid" 
        borderColor={useColorModeValue('gray.200', 'gray.600')}
      >
        <VStack spacing={1} align="start">
          <Heading size="lg" color={textColor}>
            דשבורד
          </Heading>
          <Text color={mutedColor}>
            מערכת דשבורד חכמה לניתוח נתונים ויזואלי
          </Text>
        </VStack>
      </Box>
      
      <Text>בקרוב...</Text>
    </VStack>
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