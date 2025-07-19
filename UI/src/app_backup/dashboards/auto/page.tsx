'use client';
import AppShell from '@/components/AppShell';
import { Box, Heading, Text } from '@chakra-ui/react'; 


export default function DashboardAuto() {
  return (
    <AppShell>
      <Box p={6}>
        <Heading size="md" mb={4}>Coming Soon</Heading>
        <Text>בנית DASHBOARDים אוטומטית באמצעות AI.</Text>
      </Box>
    </AppShell>
  );
}