'use client';
// src/components/ChatHistoryModal.tsx

import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Stack,
  Box,
  Text,
  Tag,
  TagLabel,
  Code,
  Spinner,
  IconButton,
  useToast,
  VStack,
  HStack,
  Button,
  Divider,
  Badge,
} from '@chakra-ui/react';
import { CopyIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { FaRobot, FaUser, FaClock, FaComments } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { useCallback } from 'react';

const MotionBox = motion(Box);

export interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyData: any[] | null;
  loading: boolean;
}

export default function ChatHistoryModal({ isOpen, onClose, historyData, loading }: HistoryModalProps) {
  const toast = useToast();

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('he-IL');
    } catch {
      return dateString;
    }
  };

  const loadChatSession = useCallback((chatId: string) => {
    localStorage.setItem('currentChatId', chatId);
    window.location.reload();
  }, []);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack>
            <FaComments />
            <Text>שיחות קודמות</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {loading && (
            <Box display="flex" justifyContent="center" py={8}>
              <Spinner size="lg" />
            </Box>
          )}

          {!loading && historyData && historyData.length > 0 && (
            <VStack spacing={4} align="stretch">
              {historyData.map((session: any, index: number) => (
                <MotionBox
                  key={session.chat_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  p={4}
                  borderRadius="md"
                  border="1px"
                  borderColor="gray.200"
                  bg="white"
                  _hover={{ bg: 'gray.50', transform: 'translateY(-2px)' }}
                  cursor="pointer"
                  onClick={() => loadChatSession(session.chat_id)}
                >
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={2} flex={1}>
                      <HStack>
                        <FaRobot color="blue" />
                        <Text fontWeight="bold" fontSize="md">
                          {session.title || 'שיחה ללא כותרת'}
                        </Text>
                        <Badge colorScheme={session.status === 'active' ? 'green' : 'gray'}>
                          {session.status === 'active' ? 'פעיל' : 'בארכיון'}
                        </Badge>
                      </HStack>
                      
                      {session.first_message_preview && (
                        <Text fontSize="sm" color="gray.600" noOfLines={2}>
                          {session.first_message_preview}
                        </Text>
                      )}
                      
                      <HStack spacing={4} fontSize="xs" color="gray.500">
                        <HStack>
                          <FaComments />
                          <Text>{session.total_messages || 0} הודעות</Text>
                        </HStack>
                        <HStack>
                          <FaClock />
                          <Text>{formatDate(session.last_accessed_at)}</Text>
                        </HStack>
                        {session.total_cost > 0 && (
                          <HStack>
                            <Text>₪{session.total_cost.toFixed(3)}</Text>
                          </HStack>
                        )}
                      </HStack>
                    </VStack>
                    
                    <IconButton
                      aria-label="פתח שיחה"
                      icon={<ExternalLinkIcon />}
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        loadChatSession(session.chat_id);
                      }}
                    />
                  </HStack>
                </MotionBox>
              ))}
            </VStack>
          )}

          {!loading && (!historyData || historyData.length === 0) && (
            <Box textAlign="center" py={8}>
              <FaComments size={48} color="gray.300" />
              <Text mt={4} color="gray.500">
                אין שיחות קודמות
              </Text>
            </Box>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
} 