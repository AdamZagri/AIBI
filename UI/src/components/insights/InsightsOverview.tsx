import {
  Box,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Progress,
  Text,
} from '@chakra-ui/react';

export interface InsightsOverviewProps {
  totalInsights: number;
  newInsights: number;
  urgentInsights: number;
  avgConfidence: number;
  byModule: Record<string, number>;
  byType: Record<string, number>;
}

export function InsightsOverview({
  totalInsights,
  newInsights,
  urgentInsights,
  avgConfidence,
}: InsightsOverviewProps) {
  return (
    <Box mb={6}>
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        <Stat bg="white" p={4} borderRadius="md" boxShadow="md">
          <StatLabel>סה״כ תובנות</StatLabel>
          <StatNumber>{totalInsights}</StatNumber>
        </Stat>
        <Stat bg="white" p={4} borderRadius="md" boxShadow="md">
          <StatLabel>תובנות חדשות</StatLabel>
          <StatNumber>{newInsights}</StatNumber>
        </Stat>
        <Stat bg="white" p={4} borderRadius="md" boxShadow="md">
          <StatLabel>תובנות דחופות</StatLabel>
          <StatNumber>{urgentInsights}</StatNumber>
        </Stat>
      </SimpleGrid>

      <Box mt={4} bg="white" p={4} borderRadius="md" boxShadow="md">
        <Text fontWeight="medium" mb={2}>
          ממוצע רמת ביטחון
        </Text>
        <Progress value={avgConfidence} size="lg" colorScheme="blue" borderRadius="full" />
      </Box>
    </Box>
  );
} 