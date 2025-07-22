// src/components/GuidelineImprovementPanel.tsx
'use client';

import {
  Box,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Textarea,
  Select,
  VStack,
  HStack,
  Text,
  useDisclosure,
  useToast,
  FormControl,
  FormLabel,
  Divider,
  IconButton,
  Tooltip,
  Badge
} from '@chakra-ui/react';
import { useState } from 'react';
import { FaLightbulb, FaPlus, FaRedo } from 'react-icons/fa';
import { useSession } from 'next-auth/react';
import { SERVER_BASE_URL } from '@/lib/config';

interface GuidelineImprovementPanelProps {
  messageId: string;
  userQuestion?: string;
  sqlResponse?: string;
  botResponse?: string;
  onAskAgain?: (question: string) => void;
}

export default function GuidelineImprovementPanel({
  messageId,
  userQuestion,
  sqlResponse,
  botResponse,
  onAskAgain
}: GuidelineImprovementPanelProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'user' | 'system' | 'examples'>('user');
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();
  const { data: session } = useSession();

  const handleSubmit = async (askAgain: boolean = false) => {
    if (!content.trim()) {
      toast({
        title: 'שגיאה',
        description: 'יש למלא את תוכן ההנחיה',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch(`${SERVER_BASE_URL}/api/guidelines/quick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': session?.user?.email || 'anonymous'
        },
        body: JSON.stringify({
          content: content.trim(),
          category,
          moduleId,
          relatedQuery: userQuestion,
          relatedSql: sqlResponse,
          userEmail: session?.user?.email
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: '✅ הנחיה נשמרה!',
          description: result.message,
          status: 'success',
          duration: 4000,
          isClosable: true,
        });

        // איפוס הטופס
        setContent('');
        setCategory('user');
        setModuleId(null);
        onClose();

        // אם המשתמש בחר "שאל שוב", שלח את השאלה שוב
        if (askAgain && userQuestion && onAskAgain) {
          setTimeout(() => {
            onAskAgain(userQuestion);
          }, 500); // המתנה קצרה כדי שהמשתמש יראה שההנחיה נשמרה
        }
      } else {
        throw new Error(result.error || 'שגיאה בשמירת ההנחיה');
      }
    } catch (error) {
      console.error('Error saving guideline:', error);
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לשמור את ההנחיה',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* כפתור קטן ודיסקרטי */}
      <Box mt={2} display="flex" justifyContent="flex-end">
        <Tooltip label="התשובה לא מדויקת? הוסף הנחיה לשיפור" placement="top">
          <Button
            size="xs"
            variant="ghost"
            colorScheme="blue"
            leftIcon={<FaLightbulb />}
            onClick={onOpen}
            opacity={0.7}
            _hover={{ opacity: 1 }}
          >
            שפר הנחיה
          </Button>
        </Tooltip>
      </Box>

      {/* מודל יצירת הנחיה */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <FaLightbulb color="orange" />
              <Text>הוספת הנחיה מהירה</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* הקשר לשאלה */}
              {userQuestion && (
                <Box>
                  <Text fontSize="sm" fontWeight="bold" mb={1}>
                    השאלה המקורית:
                  </Text>
                  <Box
                    p={2}
                    bg="gray.50"
                    borderRadius="md"
                    fontSize="sm"
                    color="gray.600"
                  >
                    {userQuestion}
                  </Box>
                </Box>
              )}

              {/* תוכן ההנחיה */}
              <FormControl>
                <FormLabel>הנחיה לשיפור:</FormLabel>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="לדוגמה: כשמבקשים גרף מכירות לפי חודש, השתמש ב-DATE_TRUNC במקום date_part..."
                  rows={4}
                  resize="vertical"
                />
              </FormControl>

              {/* קטגוריה */}
              <FormControl>
                <FormLabel>סוג הנחיה:</FormLabel>
                <Select 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value as any)}
                >
                  <option value="user">משתמש (יחול רק עליי)</option>
                  <option value="system">מערכת (יחול על כולם)</option>
                  <option value="examples">דוגמה (SQL לדוגמה)</option>
                </Select>
              </FormControl>

              {/* הסבר על ההנחיה */}
              <Box p={3} bg="blue.50" borderRadius="md" fontSize="sm">
                <Text fontWeight="bold" mb={1}>💡 טיפ:</Text>
                <Text>
                  כתוב הנחיה ספציפית שתעזור ל-AI להבין טוב יותר איך לענות על שאלות דומות.
                  ההנחיה תיכנס לפעולה מיידית!
                </Text>
              </Box>
            </VStack>
          </ModalBody>

          <ModalFooter>
            <HStack spacing={2}>
              <Button
                variant="ghost"
                onClick={onClose}
                isDisabled={isLoading}
              >
                ביטול
              </Button>
              <Button
                colorScheme="blue"
                onClick={() => handleSubmit(false)}
                isLoading={isLoading}
                leftIcon={<FaPlus />}
              >
                שמור הנחיה
              </Button>
              <Button
                colorScheme="green"
                onClick={() => handleSubmit(true)}
                isLoading={isLoading}
                leftIcon={<FaRedo />}
              >
                שמור ושאל שוב
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
} 