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
} from '@chakra-ui/react';
import { CopyIcon } from '@chakra-ui/icons';
import { FaRobot } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { useCallback } from 'react';
import dynamic from 'next/dynamic';

// Lazy-load interactive JSON viewer (client-side only)
const ReactJson = dynamic(() => import('react-json-view'), { ssr: false });

const MotionBox = motion(Box);

export interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyData: any | null;
  loading: boolean;
}

export default function ChatHistoryModal({ isOpen, onClose, historyData, loading }: HistoryModalProps) {
  const toast = useToast();

  const copySql = useCallback(() => {
    if (!historyData?.lastSqlSuccess) return;
    navigator.clipboard.writeText(historyData.lastSqlSuccess).then(() => {
      toast({ title: 'SQL הועתק', status: 'success', duration: 1000 });
    });
  }, [historyData, toast]);

  const complexity = historyData?.context?.complexityLevel ?? null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>היסטוריית שיחה (JSON)</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {loading && <Spinner alignSelf="center" />}

          {!loading && historyData && (
            <Box mb={4}>
              <ReactJson
                src={historyData}
                name={false}
                collapsed={2}
                enableClipboard
                displayDataTypes={false}
                indentWidth={2}
                style={{ fontSize: '12px', direction: 'ltr' }}
              />
            </Box>
          )}

          {!loading && historyData?.lastSqlSuccess && (
            <Box bg="gray.100" p={3} borderRadius="md" mb={2} position="relative">
              <Text fontWeight="bold" mb={1} fontSize="sm">
                שאילתה אחרונה מוצלחת:
              </Text>
              <Code display="block" whiteSpace="pre-wrap" fontSize="xs">
                {historyData.lastSqlSuccess}
              </Code>
              <IconButton
                aria-label="העתק SQL"
                icon={<CopyIcon />}
                size="sm"
                variant="ghost"
                position="absolute"
                top="4px"
                right="4px"
                onClick={copySql}
              />
            </Box>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
} 