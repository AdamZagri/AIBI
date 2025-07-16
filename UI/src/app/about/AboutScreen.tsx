import AppShell from '@/components/AppShell';
import { Box, Heading, Text } from '@chakra-ui/react'; 

export default function AboutScreen() {
  return (
    <AppShell>
      <Box p={6}>
        <Heading size="md" mb={4}>About Us</Heading>
        <Text>גרסת ה-UI החדשה של AI-BI.</Text>
      </Box>
    </AppShell>
  );
}
