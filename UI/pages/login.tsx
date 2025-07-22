import { useEffect, useState } from 'react';
import { Box, Button, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { signIn, getProviders } from 'next-auth/react';

type Prov = Record<string, any> | null;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [providers, setProviders] = useState<Prov>(null);

  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  const handleEmailLogin = () => {
    if (!email.trim()) return;
    signIn('email-login', { email, callbackUrl: '/chat' });
  };

  return (
    <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" bg="gray.50" p={4}>
      <Box bg="white" p={8} borderRadius="md" boxShadow="lg" maxW="sm" w="full">
        <Stack spacing={6}>
          <Heading size="md" textAlign="center">התחברות</Heading>
          <Button
            colorScheme="blue"
            onClick={() => signIn('google', { callbackUrl: '/chat' })}
            isDisabled={!providers?.google}
          >
            התחברות עם Google
          </Button>
          <Text textAlign="center" color="gray.500">או</Text>
          <Input placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={handleEmailLogin} isDisabled={!email.trim()}>התחבר עם מייל</Button>
        </Stack>
      </Box>
    </Box>
  );
} 