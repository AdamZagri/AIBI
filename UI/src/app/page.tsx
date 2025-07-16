'use client';

import { useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { Center, Box, Heading, Text, Button, Spinner, Icon, useColorModeValue } from '@chakra-ui/react';
import { FaGoogle } from 'react-icons/fa';
import AppShell from '@/components/AppShell';
import ChatBox  from '@/components/ChatBox';

export default function HomePage() {
  const { data: session, status } = useSession();

  // 1️⃣ Loading state
  if (status === 'loading') {
    return (
      <Center h="100vh" bg={useColorModeValue('gray.50','gray.800')}>
        <Spinner size="xl" />
      </Center>
    );
  }

  // 2️⃣ Not signed in → show login screen
  if (!session) {
    return (
      <Center h="100vh" bg={useColorModeValue('gray.50','gray.800')} p={4}>
        <Box
          bg={useColorModeValue('white','gray.700')}
          p={8}
          borderRadius="lg"
          boxShadow="md"
          textAlign="center"
          maxW="sm"
          w="full"
        >
          <Heading mb={4} color="teal.500" fontSize="2xl">
            ברוך הבא ל-AI BI
          </Heading>
          <Text mb={6} color={useColorModeValue('gray.600','gray.300')}>
            התחבר עם Google כדי להתחיל
          </Text>
          <Button
            leftIcon={<Icon as={FaGoogle} />}
            colorScheme="red"
            variant="outline"
            w="full"
            onClick={() =>
              // this will hit your pages/api/auth/[...nextauth].ts
              signIn('google', { callbackUrl: '/' })
            }
          >
            התחברות עם Google
          </Button>
        </Box>
      </Center>
    );
  }

  // 3️⃣ Authenticated → render your app
  return (
    <AppShell>
      <ChatBox />
    </AppShell>
  );
}
