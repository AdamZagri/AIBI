import {
  Box,
  Badge,
  Text,
  Flex,
  Progress,
  Button,
  HStack,
} from '@chakra-ui/react';

export interface Insight {
  id: number;
  title: string;
  description: string;
  module: string;
  insight_type: string;
  urgency: string;
  confidence_level: number;
  financial_impact?: number;
  status: string;
  created_at: string;
  supporting_data?: string;
  recommendation?: string;
  followup_questions?: string;
  source_question: string;
  sql_query?: string;
  execution_time_ms?: number;
  user_relevance_score?: number;
  user_feedback?: string;
  reviewed_at?: string;
  actioned_at?: string;
  expires_at?: string;
  affected_entities?: string;
  kpi_metrics?: string;
  visualization_type?: string;
  novelty_score?: number;
}

export interface InsightCardProps {
  insight: Insight;
  onAction: (insightId: number, action: string) => void;
  onViewDetails: (insightId: number) => void;
}

const moduleColors: Record<string, string> = {
  "מכירות": 'blue.500',
  "כספים": 'green.500',
  "רכש": 'purple.500',
  "מלאי": 'orange.500',
  "לקוחות": 'pink.400',
  "תפעול": 'gray.500',
  "ייצור": 'yellow.600',
  "משולב": 'blackAlpha.700',
};

const typeColors: Record<string, string> = {
  "חריגה": 'red.500',
  "מגמה": 'blue.500',
  "הזדמנות": 'green.500',
  "סיכון": 'red.600',
  "דפוס": 'purple.500',
  "קורלציה": 'teal.400',
  "השוואה": 'orange.500',
};

const urgencyBg: Record<string, string> = {
  "גבוהה": 'red.50',
  "בינונית": 'orange.50',
  "נמוכה": 'gray.50',
};

export function InsightCard({
  insight,
  onAction,
  onViewDetails,
}: InsightCardProps) {
  return (
    <Box
      bg="white"
      borderRadius="md"
      boxShadow="md"
      p={6}
      bgColor={urgencyBg[insight.urgency] ?? 'white'}
    >
      <Flex justify="space-between" mb={4}>
        <HStack spacing={2}>
          <Badge colorScheme="gray" bg={moduleColors[insight.module]} color="white">
            {insight.module}
          </Badge>
          <Badge colorScheme="gray" bg={typeColors[insight.insight_type]} color="white">
            {insight.insight_type}
          </Badge>
        </HStack>
        <Text fontSize="sm" color="gray.500">
          {new Date(insight.created_at).toLocaleDateString('he-IL')}
        </Text>
      </Flex>

      <Text fontSize="xl" fontWeight="bold" mb={2}>
        {insight.title}
      </Text>
      <Text color="gray.600" mb={4}>
        {insight.description}
      </Text>

      <Box mb={4}>
        <Flex justify="space-between" mb={2}>
          <Text fontSize="sm" fontWeight="medium">
            רמת ביטחון
          </Text>
          <Text fontSize="sm">{insight.confidence_level}%</Text>
        </Flex>
        <Progress
          value={insight.confidence_level}
          size="sm"
          colorScheme="blue"
          borderRadius="full"
        />
      </Box>

      {insight.financial_impact && (
        <Box mb={4} p={3} bg="green.50" borderRadius="md">
          <Text fontSize="sm" fontWeight="medium" color="green.800">
            השפעה כספית: ₪{insight.financial_impact.toLocaleString()}
          </Text>
        </Box>
      )}

      <Flex gap={2}>
        <Button flex="1" colorScheme="blue" onClick={() => onViewDetails(insight.id)}>
          צפה בפרטים
        </Button>
        <Button flex="1" colorScheme="gray" onClick={() => onAction(insight.id, 'reviewed')}>
          סמן כנסקר
        </Button>
      </Flex>
    </Box>
  );
} 