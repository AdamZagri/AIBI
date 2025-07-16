import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Text,
  Box,
  Badge,
  HStack,
  VStack,
  Divider,
  Progress,
  Textarea,
  FormControl,
  FormLabel,
  Select,
} from '@chakra-ui/react';
import { useState } from 'react';
import { Insight } from './InsightCard';

interface InsightDetailsProps {
  insight: Insight | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmitFeedback: (insightId: number, feedback: UserFeedback) => void;
}

interface UserFeedback {
  relevance_score: number;
  feedback: string;
  status?: string;
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

export function InsightDetails({ insight, isOpen, onClose, onSubmitFeedback }: InsightDetailsProps) {
  const [feedback, setFeedback] = useState('');
  const [relevanceScore, setRelevanceScore] = useState(3);
  const [status, setStatus] = useState('');

  if (!insight) return null;

  const handleSubmit = () => {
    onSubmitFeedback(insight.id, {
      relevance_score: relevanceScore,
      feedback,
      status: status || undefined,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <VStack align="start" spacing={2}>
            <Text>{insight.title}</Text>
            <HStack>
              <Badge bg={moduleColors[insight.module]} color="white">
                {insight.module}
              </Badge>
              <Badge bg={typeColors[insight.insight_type]} color="white">
                {insight.insight_type}
              </Badge>
              <Badge colorScheme={insight.urgency === 'גבוהה' ? 'red' : insight.urgency === 'בינונית' ? 'orange' : 'gray'}>
                {insight.urgency}
              </Badge>
            </HStack>
          </VStack>
        </ModalHeader>
        <ModalCloseButton />
        
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <Box>
              <Text fontWeight="medium" mb={2}>תיאור:</Text>
              <Text>{insight.description}</Text>
            </Box>

            <Box>
              <Text fontWeight="medium" mb={2}>רמת ביטחון:</Text>
              <Progress value={insight.confidence_level} colorScheme="blue" />
              <Text fontSize="sm" color="gray.500">{insight.confidence_level}%</Text>
            </Box>

            {insight.financial_impact && (
              <Box>
                <Text fontWeight="medium" mb={2}>השפעה כספית:</Text>
                <Text color="green.600" fontWeight="bold">
                  ₪{insight.financial_impact.toLocaleString()}
                </Text>
              </Box>
            )}

            {insight.recommendation && (
              <Box>
                <Text fontWeight="medium" mb={2}>המלצה:</Text>
                <Text>{insight.recommendation}</Text>
              </Box>
            )}

            {insight.source_question && (
              <Box>
                <Text fontWeight="medium" mb={2}>שאלה מקורית:</Text>
                <Text>{insight.source_question}</Text>
              </Box>
            )}

            {insight.supporting_data && (
              <Box>
                <Text fontWeight="medium" mb={2}>נתונים תומכים:</Text>
                <Box bg="gray.50" p={3} borderRadius="md" maxH="200px" overflowY="auto">
                  <Text fontSize="sm" fontFamily="monospace">
                    {typeof insight.supporting_data === 'string' 
                      ? JSON.stringify(JSON.parse(insight.supporting_data), null, 2)
                      : JSON.stringify(insight.supporting_data, null, 2)
                    }
                  </Text>
                </Box>
              </Box>
            )}

            {insight.followup_questions && (
              <Box>
                <Text fontWeight="medium" mb={2}>שאלות המשך:</Text>
                <VStack align="start" spacing={1}>
                  {(typeof insight.followup_questions === 'string' 
                    ? JSON.parse(insight.followup_questions) 
                    : insight.followup_questions
                  ).map((question: string, index: number) => (
                    <Text key={index} fontSize="sm">• {question}</Text>
                  ))}
                </VStack>
              </Box>
            )}

            {insight.sql_query && (
              <Box>
                <Text fontWeight="medium" mb={2}>שאילתת SQL:</Text>
                <Box bg="gray.900" color="white" p={3} borderRadius="md" maxH="200px" overflowY="auto">
                  <Text fontSize="sm" fontFamily="monospace">
                    {insight.sql_query}
                  </Text>
                </Box>
              </Box>
            )}

            <Box>
              <Text fontWeight="medium" mb={2}>נוצר בתאריך:</Text>
              <Text>{new Date(insight.created_at).toLocaleString('he-IL')}</Text>
            </Box>

            <Divider />

            <Box>
              <Text fontWeight="medium" mb={4}>משוב:</Text>
              <VStack align="stretch" spacing={3}>
                <FormControl>
                  <FormLabel>רמת רלוונטיות (1-5)</FormLabel>
                  <Select value={relevanceScore} onChange={(e) => setRelevanceScore(Number(e.target.value))}>
                    <option value={1}>1 - לא רלוונטי</option>
                    <option value={2}>2 - מעט רלוונטי</option>
                    <option value={3}>3 - בינוני</option>
                    <option value={4}>4 - רלוונטי</option>
                    <option value={5}>5 - מאוד רלוונטי</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>הערות</FormLabel>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="הערות נוספות..."
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>עדכון סטטוס</FormLabel>
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">ללא שינוי</option>
                    <option value="reviewed">נסקר</option>
                    <option value="actioned">בוצע</option>
                    <option value="dismissed">נדחה</option>
                  </Select>
                </FormControl>
              </VStack>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={handleSubmit}>
            שמור משוב
          </Button>
          <Button variant="ghost" onClick={onClose}>
            סגור
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
} 