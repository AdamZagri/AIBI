// src/components/SessionsModal.tsx
'use client';

import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  HStack,
  Box,
  Text,
  Badge,
  Button,
  Spinner,
  IconButton,
  useColorModeValue,
  Divider,
  Flex,
  Card,
  CardBody,
  Tooltip,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription
} from '@chakra-ui/react';
import { FiPlus, FiMessageSquare, FiClock, FiTrash2, FiDollarSign, FiRefreshCw } from 'react-icons/fi';
import { useCallback } from 'react';

export interface SessionData {
  chat_id: string;
  title: string;
  status: string;
  total_cost: number;
  total_messages: number;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  first_message_preview: string;
  last_message_preview: string;
}

export interface SessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SessionData[];
  loading: boolean;
  onSelectSession: (chatId: string) => void;
  onCreateNew: () => void;
  onRefresh?: () => void;
}

export default function SessionsModal({ 
  isOpen, 
  onClose, 
  sessions, 
  loading, 
  onSelectSession,
  onCreateNew,
  onRefresh
}: SessionsModalProps) {
  const bgColor = useColorModeValue('white', 'gray.800');
  const cardBg = useColorModeValue('gray.50', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'היום ' + date.toLocaleTimeString('he-IL', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else if (diffDays === 1) {
      return 'אתמול ' + date.toLocaleTimeString('he-IL', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else if (diffDays < 7) {
      return `לפני ${diffDays} ימים`;
    } else {
      return date.toLocaleDateString('he-IL');
    }
  }, []);

  const formatCost = useCallback((cost: number) => {
    if (cost < 0.01) return '< $0.01';
    return `$${cost.toFixed(3)}`;
  }, []);

  const handleSessionClick = useCallback((chatId: string) => {
    onSelectSession(chatId);
  }, [onSelectSession]);

  const handleNewChatClick = useCallback(() => {
    onCreateNew();
    onClose();
  }, [onCreateNew, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg={bgColor}>
        <ModalHeader>
          <HStack justify="space-between">
            <Text>רשימת שיחות</Text>
            <HStack spacing={2}>
              {onRefresh && (
                <IconButton
                  icon={<FiRefreshCw />}
                  size="sm"
                  variant="outline"
                  onClick={onRefresh}
                  isLoading={loading}
                  aria-label="רענן רשימת שיחות"
                />
              )}
              <Button
                leftIcon={<FiPlus />}
                colorScheme="blue"
                size="sm"
                onClick={handleNewChatClick}
              >
                שיחה חדשה
              </Button>
            </HStack>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {loading && (
            <Flex justify="center" align="center" py={8}>
              <VStack spacing={4}>
                <Spinner size="lg" />
                <Text color={mutedColor}>טוען שיחות...</Text>
              </VStack>
            </Flex>
          )}

          {!loading && sessions.length === 0 && (
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <Box>
                <AlertTitle>אין שיחות קודמות</AlertTitle>
                <AlertDescription>
                  התחל שיחה חדשה כדי לראות אותה כאן
                </AlertDescription>
              </Box>
            </Alert>
          )}

          {!loading && sessions.length > 0 && (
            <VStack spacing={3} align="stretch">
              <Text fontSize="sm" color={mutedColor}>
                נמצאו {sessions.length} שיחות
              </Text>
              
              {sessions.map((session) => (
                <Card 
                  key={session.chat_id}
                  bg={cardBg}
                  border="1px solid"
                  borderColor={borderColor}
                  cursor="pointer"
                  _hover={{ 
                    borderColor: 'blue.300',
                    shadow: 'md',
                    transform: 'translateY(-1px)'
                  }}
                  transition="all 0.2s"
                  onClick={() => handleSessionClick(session.chat_id)}
                >
                  <CardBody>
                    <VStack align="stretch" spacing={3}>
                      {/* Header */}
                      <HStack justify="space-between">
                        <HStack spacing={2}>
                          <FiMessageSquare color="blue.500" />
                          <Text fontWeight="bold" color={textColor} noOfLines={1}>
                            {session.title || 'שיחה ללא כותרת'}
                          </Text>
                        </HStack>
                        <Badge 
                          colorScheme={session.status === 'active' ? 'green' : 'gray'}
                          variant="subtle"
                        >
                          {session.status === 'active' ? 'פעילה' : 'בארכיון'}
                        </Badge>
                      </HStack>

                      {/* Message preview */}
                      {session.first_message_preview && (
                        <Box>
                          <Text fontSize="sm" color={mutedColor} noOfLines={2}>
                            "{session.first_message_preview}..."
                          </Text>
                        </Box>
                      )}

                      {/* Stats */}
                      <HStack justify="space-between" fontSize="xs" color={mutedColor}>
                        <HStack spacing={4}>
                          <HStack spacing={1}>
                            <FiMessageSquare size={12} />
                            <Text>{session.total_messages} הודעות</Text>
                          </HStack>
                          <HStack spacing={1}>
                            <FiDollarSign size={12} />
                            <Text>{formatCost(session.total_cost)}</Text>
                          </HStack>
                        </HStack>
                        <HStack spacing={1}>
                          <FiClock size={12} />
                          <Text>{formatDate(session.last_accessed_at)}</Text>
                        </HStack>
                      </HStack>

                      {/* Chat ID */}
                      <Text fontSize="xs" fontFamily="mono" color={mutedColor}>
                        ID: {session.chat_id.split('-')[0]}...
                      </Text>
                    </VStack>
                  </CardBody>
                </Card>
              ))}
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
} 